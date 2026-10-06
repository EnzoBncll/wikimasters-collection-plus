import { useMemo, useState } from 'react';
import { useCollection } from '@/hooks/use-collection';
import { kindOf } from '@/lib/album-kind';
import type { CardTagStyle } from '@/lib/store';
import { systemTagIds } from '@/lib/trade';
import type { OwnedCard, SiteTag } from '@/lib/types';
import { cn } from '@/lib/utils';

export const CARD_TAG_STYLES: { id: CardTagStyle; name: string; text: string }[] = [
  { id: 'dots', name: 'Pastilles', text: "Points de couleur sur l'image" },
  { id: 'ribbon', name: 'Ruban', text: "Bande de couleurs sous l'image" },
  { id: 'footer', name: 'Pied étiqueté', text: 'Noms sous la description' },
  { id: 'bookmarks', name: 'Signets', text: 'Marque-pages en haut de la carte' },
];

/** Étiquettes de la carte affichées (sans les statuts Trade / Not Trade / Discard), rangements en dernier. */
export function useCardTags(card: OwnedCard): SiteTag[] {
  const tags = useCollection((s) => s.tags);
  const tradeTags = useCollection((s) => s.tradeTags);
  return useMemo(() => {
    if (!card.tagIds.length) return [];
    const ids = new Set(card.tagIds);
    const system = systemTagIds(tradeTags);
    return tags
      .filter((t) => ids.has(t.id) && !system.has(t.id))
      .sort((a, b) => Number(kindOf(a) === 'storage') - Number(kindOf(b) === 'storage'));
  }, [tags, tradeTags, card.tagIds]);
}

const colorOf = (tag: SiteTag) => tag.color ?? 'var(--muted-foreground)';

/** Effet dock : 1 pour l'étiquette survolée, 0,5 pour ses voisines, 0 sinon. */
function useDock() {
  const [hovered, setHovered] = useState<number | null>(null);
  const lift = (i: number) => (hovered === null ? 0 : Math.max(0, 1 - Math.abs(i - hovered) * 0.5));
  const bind = (i: number) => ({ onPointerEnter: () => setHovered(i), onPointerLeave: () => setHovered((h) => (h === i ? null : h)) });
  return { hovered, lift, bind };
}

/** Nom de l'étiquette survolée, en bulle. */
function Label({ tag, className, style }: { tag: SiteTag; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute z-50 flex max-w-[86cqw] animate-in items-center gap-[1.5cqw] truncate rounded-[2cqw] bg-black/85 px-[2.5cqw] py-[1.2cqw] text-[5cqw] leading-none font-semibold whitespace-nowrap text-white shadow-lg fade-in zoom-in-90 duration-150',
        className,
      )}
      style={style}
    >
      <span className="size-[2.8cqw] shrink-0 rounded-full" style={{ backgroundColor: colorOf(tag) }} />
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

const EASE = 'transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]';

/** Pastilles empilées en bas à droite de l'image. */
function Dots({ tags }: { tags: SiteTag[] }) {
  const { hovered, lift, bind } = useDock();
  const shown = tags.slice(0, 6);
  return (
    <div className="absolute right-[4cqw] bottom-[55%] z-40 mb-[2.5cqw]" onClick={(e) => e.stopPropagation()}>
      {hovered !== null && <Label tag={shown[hovered]!} className="right-0 bottom-full mb-[2.5cqw]" />}
      <div className="flex items-end -space-x-[1.2cqw]">
        {shown.map((t, i) => (
          <span key={t.id} {...bind(i)} className="relative flex items-end justify-center px-[0.6cqw] py-[1cqw]">
            <span
              className={cn('block size-[5.5cqw] rounded-full ring-[1.2cqw] ring-white/90', EASE)}
              style={{ backgroundColor: colorOf(t), transform: `translateY(${-lift(i) * 2.5}cqw) scale(${1 + lift(i) * 0.7})`, zIndex: Math.round(lift(i) * 10) }}
            />
          </span>
        ))}
        {tags.length > shown.length && <span className="pb-[1cqw] pl-[2.5cqw] text-[5cqw] font-bold text-white drop-shadow">+{tags.length - shown.length}</span>}
      </div>
    </div>
  );
}

/** Bande de couleurs entre l'image et le texte, un segment par étiquette. */
function Ribbon({ tags }: { tags: SiteTag[] }) {
  const { hovered, lift, bind } = useDock();
  const at = hovered === null ? 0 : ((hovered + 0.5) / tags.length) * 100;
  return (
    <div className="absolute inset-x-0 top-[45%] z-40 -translate-y-1/2" onClick={(e) => e.stopPropagation()}>
      {hovered !== null && (
        <Label tag={tags[hovered]!} className="bottom-full mb-[1.5cqw] -translate-x-1/2" style={{ left: `clamp(22cqw, ${at}%, calc(100% - 22cqw))` }} />
      )}
      <div className="flex items-center">
        {tags.map((t, i) => (
          <span key={t.id} {...bind(i)} className={cn('flex h-[7cqw] cursor-default items-center', EASE)} style={{ flexGrow: 1 + lift(i) * 0.8, flexBasis: 0 }}>
            <span className={cn('block w-full', EASE)} style={{ backgroundColor: colorOf(t), height: `${2 + lift(i) * 3}cqw`, boxShadow: lift(i) ? '0 2px 6px rgb(0 0 0 / 0.35)' : undefined }} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Noms des étiquettes en pastilles, sous la description. */
function Footer({ tags }: { tags: SiteTag[] }) {
  const { hovered, lift, bind } = useDock();
  const shown = tags.slice(0, 3);
  const align = (i: number) => (i === 0 ? 'left-0' : i === shown.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2');
  return (
    <div className="relative mt-auto mb-[2.5cqw] flex min-w-0 items-center gap-[1.5cqw]" onClick={(e) => e.stopPropagation()}>
      {shown.map((t, i) => (
        <span
          key={t.id}
          {...bind(i)}
          className={cn('relative min-w-0 shrink origin-bottom rounded-[2cqw] border-[0.5cqw] px-[2cqw] py-[0.8cqw] text-[4.8cqw] leading-none font-semibold text-black/80', EASE)}
          style={{
            borderColor: colorOf(t),
            backgroundColor: `color-mix(in srgb, ${colorOf(t)} ${22 + lift(i) * 40}%, white)`,
            transform: `translateY(${-lift(i) * 1.5}cqw) scale(${1 + lift(i) * 0.15})`,
            zIndex: Math.round(lift(i) * 10),
          }}
        >
          <span className="block truncate">{t.name}</span>
          {hovered === i && <Label tag={t} className={cn('bottom-full mb-[1.5cqw]', align(i))} />}
        </span>
      ))}
      {tags.length > shown.length && <span className="shrink-0 text-[4.8cqw] font-bold text-black/60">+{tags.length - shown.length}</span>}
    </div>
  );
}

/** Rubans de marque-page qui pendent du haut de la carte, tous de la même taille. */
function Bookmarks({ tags }: { tags: SiteTag[] }) {
  const { hovered, lift, bind } = useDock();
  const shown = tags.slice(0, 7);
  return (
    <div className="absolute top-0 left-[5cqw] z-40 flex items-start gap-[1.2cqw]" onClick={(e) => e.stopPropagation()}>
      {shown.map((t, i) => (
        <span key={t.id} {...bind(i)} className="relative flex justify-center">
          <span
            className={cn('block', EASE)}
            style={{
              backgroundColor: colorOf(t),
              width: `${4.5 + lift(i) * 1.8}cqw`,
              height: `${13 + lift(i) * 7}cqw`,
              clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)',
              filter: 'drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.35))',
            }}
          />
          {hovered === i && <Label tag={t} className="top-full left-0 mt-[1.5cqw]" />}
        </span>
      ))}
      {tags.length > shown.length && <span className="pt-[1cqw] text-[4.5cqw] font-bold text-white drop-shadow">+{tags.length - shown.length}</span>}
    </div>
  );
}

/** Étiquettes posées sur la carte (hors pied de carte), selon le style choisi dans les réglages. */
export function CardTagsOverlay({ tags, style }: { tags: SiteTag[]; style: CardTagStyle }) {
  if (!tags.length) return null;
  if (style === 'dots') return <Dots tags={tags} />;
  if (style === 'ribbon') return <Ribbon tags={tags} />;
  if (style === 'bookmarks') return <Bookmarks tags={tags} />;
  return null;
}

/** Étiquettes dans le corps de la carte (style « Pied étiqueté »). */
export function CardTagsFooter({ tags }: { tags: SiteTag[] }) {
  return tags.length ? <Footer tags={tags} /> : null;
}
