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

async function pickOptions(): Promise<{ options: object; availability: AiAvailability }> {
  const lm = api();
  if (!lm) return { options: {}, availability: 'unavailable' };
  for (const options of LANGUAGE_OPTIONS) {
    try {
      const availability = await lm.availability(options);
      if (availability !== 'unavailable') return { options, availability };
    } catch {
      /* option de langue refusée : on essaie la suivante */
    }
  }
  return { options: {}, availability: 'unavailable' };
}

export const chromeAi: AiProvider = {
  name: 'IA intégrée de Chrome',

  async availability() {
    return (await pickOptions()).availability;
  },

  async generateJson<T>({ system, prompt, schema, onDownload }: { system: string; prompt: string; schema: object; onDownload?: (p: number) => void }) {
    const lm = api();
    const { options, availability } = await pickOptions();
    if (!lm || availability === 'unavailable') throw new Error("L'IA intégrée de Chrome n'est pas disponible sur cet ordinateur");
    const session = await lm.create({
      ...options,
      initialPrompts: [{ role: 'system', content: system }],
      monitor(m: EventTarget) {
        m.addEventListener('downloadprogress', (e) => onDownload?.((e as ProgressEvent).loaded));
      },
    });
    try {
      const raw = await session.prompt(prompt, { responseConstraint: schema });
      return JSON.parse(raw) as T;
    } finally {
      session.destroy();
    }
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
