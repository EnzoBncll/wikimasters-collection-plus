/**
 * Accès à un modèle de langue, derrière une interface unique pour pouvoir changer de fournisseur plus tard.
 * Fournisseur actuel : l'IA intégrée de Chrome (Gemini Nano, API Prompt), locale et gratuite, sans clé.
 * Le modèle se télécharge une fois (~ quelques Go) au premier usage, après un clic.
 */

export type AiAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface AiProvider {
  name: string;
  availability(): Promise<AiAvailability>;
  /** Réponse JSON conforme au schéma ; `onDownload` reçoit la progression (0 à 1) si le modèle doit être téléchargé. */
  generateJson<T>(options: { system: string; prompt: string; schema: object; onDownload?: (progress: number) => void }): Promise<T>;
}

interface LanguageModelApi {
  availability(options?: object): Promise<AiAvailability>;
  create(options?: object): Promise<{
    prompt(input: string, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>;
    destroy(): void;
  }>;
}

const api = () => (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel;

/**
 * Langues annoncées au modèle. Le français n'est pas pris en charge par toutes les versions de Chrome :
 * on le demande d'abord, puis on se rabat sur l'anglais (la consigne demande quand même une réponse en français).
 */
const LANGUAGE_OPTIONS = ['fr', 'en'].map((lang) => ({
  expectedInputs: [{ type: 'text', languages: [lang] }],
  expectedOutputs: [{ type: 'text', languages: [lang] }],
}));

/** Options de langue que ce Chrome accepte, dans l'ordre de préférence. */
async function usableOptions(): Promise<{ options: object; availability: AiAvailability }[]> {
  const lm = api();
  if (!lm) return [];
  const usable: { options: object; availability: AiAvailability }[] = [];
  for (const options of LANGUAGE_OPTIONS) {
    try {
      const availability = await lm.availability(options);
      if (availability !== 'unavailable') usable.push({ options, availability });
    } catch {
      /* option de langue refusée : on essaie la suivante */
    }
  }
  return usable;
}

/** Schéma sans bornes de taille (maxItems, maxLength…), que le modèle de Chrome refuse parfois. */
function looseSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(looseSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const BOUNDS = new Set(['maxItems', 'minItems', 'maxLength', 'minLength', 'maximum', 'minimum']);
  return Object.fromEntries(Object.entries(schema).filter(([k]) => !BOUNDS.has(k)).map(([k, v]) => [k, looseSchema(v)]));
}

/** Objet JSON trouvé dans une réponse libre (avec ou sans bloc ```json). */
function extractJson(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error("Réponse de l'IA illisible");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Requête refusée par le modèle (« The request is invalid… ») : on peut retenter autrement. */
const isRejected = (error: unknown) =>
  error instanceof DOMException ? error.name === 'NotSupportedError' || /invalid|could not be processed/i.test(error.message) : error instanceof SyntaxError;

export const chromeAi: AiProvider = {
  name: 'IA intégrée de Chrome',

  async availability() {
    return (await usableOptions())[0]?.availability ?? 'unavailable';
  },

  /**
   * Le modèle refuse certaines requêtes selon la version de Chrome : on retente avec un schéma sans bornes,
   * puis sans contrainte de format (JSON demandé dans la consigne), puis dans l'autre langue annoncée.
   */
  async generateJson<T>({ system, prompt, schema, onDownload }: { system: string; prompt: string; schema: object; onDownload?: (p: number) => void }) {
    const lm = api();
    const usable = await usableOptions();
    if (!lm || !usable.length) throw new Error("L'IA intégrée de Chrome n'est pas disponible sur cet ordinateur");
    const attempts: { constraint?: unknown; text: string }[] = [
      { constraint: schema, text: prompt },
      { constraint: looseSchema(schema), text: prompt },
      { text: `${prompt}\n\nRéponds uniquement avec un objet JSON valide, sans texte autour, de la forme : ${JSON.stringify(looseSchema(schema))}` },
    ];
    let lastError: unknown;
    for (const { options } of usable) {
      for (const attempt of attempts) {
        let session: Awaited<ReturnType<LanguageModelApi['create']>> | undefined;
        try {
          session = await lm.create({
            ...options,
            initialPrompts: [{ role: 'system', content: system }],
            monitor(m: EventTarget) {
              m.addEventListener('downloadprogress', (e) => onDownload?.((e as ProgressEvent).loaded));
            },
          });
          const raw = await session.prompt(attempt.text, attempt.constraint ? { responseConstraint: attempt.constraint as object } : undefined);
          return (attempt.constraint ? JSON.parse(raw) : extractJson(raw)) as T;
        } catch (error) {
          lastError = error;
          console.warn('[Collection+] IA : requête refusée, nouvel essai', error);
          if (!isRejected(error)) throw error;
        } finally {
          session?.destroy();
        }
      }
    }
    if (isRejected(lastError)) throw new Error("L'IA de Chrome a refusé la requête, même simplifiée (détails dans la console)");
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  },
};

/** Fournisseur utilisé par l'extension. */
export const ai: AiProvider = chromeAi;

export const AVAILABILITY_TEXT: Record<AiAvailability, string> = {
  available: 'prête',
  downloadable: 'à télécharger au premier usage',
  downloading: 'téléchargement en cours',
  unavailable: 'indisponible sur cet ordinateur',
};
