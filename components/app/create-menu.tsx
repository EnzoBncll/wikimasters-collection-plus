import { ChevronRight, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCollection } from '@/hooks/use-collection';
import { STORAGE_COLOR, STORAGE_PREFIX } from '@/lib/album-kind';
import { getPalette } from '@/lib/palettes';
import { cn } from '@/lib/utils';
import { randomTagColor } from '@/lib/tag-colors';
import { ColorPicker } from './color-picker';

type Choice = 'collection' | 'goal' | 'storage' | 'import';

/** Chaque choix a une pastille tirée des reflets de la palette choisie dans les paramètres (index dans `icon.iri`). */
const CHOICES: { id: Choice; dot: number; title: string; text: string }[] = [
  {
    id: 'collection',
    dot: 0,
    title: 'Étiquette / album',
    text: "Un album de collection autour d'un thème, que tu remplis au fil des cartes. Le nom et la couleur se voient sur WikiMasters.",
  },
  {
    id: 'goal',
    dot: 2,
    title: 'Album à objectif',
    text: 'Une liste précise à compléter (les rois de France, le top 50 des…) : cases numérotées, cartes possédées collées, cartes à trouver.',
  },
  {
    id: 'storage',
    dot: 4,
    title: 'Étiquette de rangement',
    text: 'Pour ranger sans chercher à compléter (doublons, à échanger…). Grise et nommée « · Nom » sur le site.',
  },
  {
    id: 'import',
    dot: 6,
    title: 'Importer un album',
    text: 'Colle le code « CP1-… » qu’on t’a envoyé : l’album à objectif est recréé avec toutes ses cases.',
  },
];

/** Un seul bouton « Nouveau » : étiquette de collection, album à objectif ou étiquette de rangement, chacun expliqué. */
export function CreateMenu({
  onCreate,
  onGoal,
  onImport,
  albumKinds,
}: {
  onCreate: (name: string, color: string) => Promise<boolean>;
  onGoal: () => void;
  /** Importe un code d'album ; renvoie le message d'erreur, ou null si c'est fait. */
  onImport: (code: string) => Promise<string | null>;
  /** L'option « collection / rangement » est activée dans les paramètres. */
  albumKinds: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(randomTagColor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iri = getPalette(useCollection((s) => s.settings.palette)).icon.iri;

  const reset = () => {
    setChoice(null);
    setError(null);
    setName('');
    setColor(randomTagColor());
  };

  const pick = (id: Choice) => {
    if (id === 'goal') {
      setOpen(false);
      reset();
      onGoal();
      return;
    }
    setChoice(id);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (choice === 'import') {
      if (!name.trim() || busy) return;
      setBusy(true);
      setError(null);
      try {
        const failure = await onImport(name.trim());
        if (failure) setError(failure);
        else {
          setOpen(false);
          reset();
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    const bare = name.trim().replace(/^·\s*/, '');
    if (!bare || busy) return;
    setBusy(true);
    try {
      const ok = choice === 'storage' ? await onCreate(`${STORAGE_PREFIX}${bare}`, STORAGE_COLOR) : await onCreate(bare, color);
      if (ok) {
        setOpen(false);
        reset();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" size="sm" data-tour="create" className="h-10 shrink-0 rounded-full px-4">
          <Plus className="size-4" /> Nouveau
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[23rem] p-1.5">
        <div className="space-y-0.5">
          {CHOICES.map(({ id, dot, title, text }) => {
            const active = choice === id;
            return (
              <div key={id} className={cn('rounded-lg', active && 'bg-muted')}>
                <button
                  type="button"
                  onClick={() => pick(id)}
                  aria-expanded={id === 'goal' ? undefined : active}
                  className={cn('flex w-full cursor-pointer items-start gap-3 rounded-lg p-2.5 text-left transition', !active && 'hover:bg-muted')}
                >
                  <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: iri[dot % iri.length] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {text}
                      {id === 'storage' && !albumKinds && ' Pour les séparer partout, active « Albums de collection et de rangement » dans Paramètres › Rangement.'}
                    </span>
                  </span>
                  {id === 'goal' && <ChevronRight className="mt-1.5 size-4 shrink-0 text-muted-foreground" />}
                </button>
                {active && choice === 'import' && (
                  <form onSubmit={submit} className="space-y-2 px-2.5 pb-2.5">
                    <textarea
                      autoFocus
                      value={name}
                      onChange={(e) => (setName(e.target.value), setError(null))}
                      placeholder="CP1-…"
                      aria-label="Code de l'album"
                      rows={3}
                      spellCheck={false}
                      className="w-full resize-none rounded-md border bg-background px-2.5 py-2 font-mono text-xs break-all outline-none focus:border-primary"
                    />
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <Button type="submit" size="sm" className="h-8 w-full" disabled={!name.trim() || busy}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : 'Importer'}
                    </Button>
                  </form>
                )}
                {active && choice !== 'import' && (
                  <form onSubmit={submit} className="flex items-center gap-2 px-2.5 pb-2.5">
                    {choice === 'collection' ? (
                      <ColorPicker value={color} onChange={setColor} className="size-5 shrink-0" />
                    ) : (
                      <span className="shrink-0 pl-1 text-sm text-muted-foreground">·</span>
                    )}
                    <input
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={choice === 'storage' ? 'Doublons, À échanger…' : 'Nom de l’étiquette'}
                      aria-label="Nom de l'étiquette"
                      className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-primary"
                    />
                    <Button type="submit" size="sm" className="h-8" disabled={!name.trim() || busy}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : 'Créer'}
                    </Button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
