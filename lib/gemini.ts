/**
 * Gemini (Google AI Studio) avec la clé gratuite de l'utilisateur : utilisé seulement pour comprendre une demande
 * en langage naturel (albums à objectif). La clé reste dans le stockage local de l'extension et ne part que vers Google.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta';
/** Alias maintenus par Google vers les derniers modèles Flash, disponibles dans l'offre gratuite. */
const PREFERRED = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

/** Modèle surchargé ou quota momentanément atteint : on peut réessayer, ou passer à un autre modèle. */
const BUSY = new Set([429, 500, 503]);

class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(path: string, key: string, body?: object) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    if (BUSY.has(res.status) && attempt < 2) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    const message: string = data?.error?.message ?? `HTTP ${res.status}`;
    if ((res.status === 400 || res.status === 403) && /api key|permission|unregistered/i.test(message)) throw new GeminiError('clé Gemini refusée', res.status);
    throw new GeminiError(BUSY.has(res.status) ? 'Gemini est surchargé pour le moment' : `Gemini : ${message}`, res.status);
  }
}

let models: string[] | null = null;

/** Modèles Flash à essayer dans l'ordre : les alias, puis les autres Flash accessibles avec cette clé. */
async function modelChain(key: string): Promise<string[]> {
  if (models) return models;
  let listed: string[] = [];
  try {
    const data = await call('models?pageSize=200', key);
    listed = (data.models ?? [])
      .filter((m: { name: string; supportedGenerationMethods?: string[] }) => /flash/.test(m.name) && !/image|tts|audio|live|thinking|preview|exp/.test(m.name) && m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: { name: string }) => m.name.replace(/^models\//, ''))
      .sort()
      .reverse();
  } catch (error) {
    if (error instanceof GeminiError && !BUSY.has(error.status)) throw error;
  }
  models = [...new Set([...PREFERRED, ...listed])].slice(0, 5);
  return models;
}

/** Réponse JSON conforme au schéma (format OpenAPI de Gemini), en passant au modèle suivant si l'un est surchargé. */
export async function geminiJson<T>(key: string, { system, prompt, schema }: { system: string; prompt: string; schema: object }): Promise<T> {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
  };
  let last: unknown;
  for (const model of await modelChain(key)) {
    try {
      const data = await call(`models/${model}:generateContent`, key, body);
      const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
      if (!text) throw new GeminiError('Gemini n’a rien renvoyé', 0);
      return JSON.parse(text) as T;
    } catch (error) {
      last = error;
      // Clé refusée : inutile d'essayer un autre modèle.
      if (error instanceof GeminiError && error.message === 'clé Gemini refusée') throw error;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/**
 * Vérifie une clé (réglages). Une surcharge de Gemini ne dit rien de la clé : elle est alors considérée comme valable.
 * Renvoie un avertissement dans ce cas.
 */
export async function testGeminiKey(key: string): Promise<string | null> {
  try {
    await geminiJson(key, { system: 'Réponds en JSON.', prompt: 'Dis ok.', schema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] } });
    return null;
  } catch (error) {
    if (error instanceof GeminiError && BUSY.has(error.status)) return 'Gemini est surchargé en ce moment ; la clé est enregistrée et sera utilisée dès qu’il répondra.';
    throw error;
  }
}
