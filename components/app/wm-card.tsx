import { Shield, Swords } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCollection } from '@/hooks/use-collection';
import type { CardStyle, CardTagStyle } from '@/lib/store';
import { RARITY_LABEL, type OwnedCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { cardImage } from './card-image';
import { CardTagsFooter, CardTagsOverlay, useCardTags } from './card-tags';

const nf = new Intl.NumberFormat('fr-FR');

/** Suit le pointeur : position du reflet et, si `tilt`, légère inclinaison 3D. */
function track(e: React.PointerEvent<HTMLElement>, tilt: boolean) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  // Motif holographique : le centre suit un peu le pointeur (parallaxe), les couleurs tournent avec l'angle.
  el.style.setProperty('--cx', `${(50 + (x - 0.5) * 40).toFixed(1)}%`);
  el.style.setProperty('--cy', `${(45 + (y - 0.5) * 40).toFixed(1)}%`);
  el.style.setProperty('--hue', `${((x + y) * 180).toFixed(0)}deg`);
  el.style.setProperty('--holo-angle', `${(95 + (x - 0.5) * 40).toFixed(0)}deg`);
  if (tilt) {
    el.dataset.tilting = '';
    el.style.setProperty('--rx', `${((0.5 - y) * 14).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((x - 0.5) * 14).toFixed(2)}deg`);
  }
}

function reset(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  delete el.dataset.tilting;
  for (const v of ['--mx', '--my', '--cx', '--cy', '--hue', '--holo-angle', '--rx', '--ry']) el.style.removeProperty(v);
}

export interface WmCardProps {
  card: OwnedCard;
  /** Inclinaison 3D au survol (désactivée pour les vignettes collées dans l'album). */
  tilt?: boolean;
  className?: string;
  /** Éléments posés sur l'image (statut, nouveauté…). */
  imageOverlay?: ReactNode;
  /** Pied de carte quand l'API ne fournit pas attaque / défense. */
  fallbackFooter?: ReactNode;
  /** Pastilles à côté de la rareté (nombre d'exemplaires…). */
  badges?: ReactNode;
  /** Affiche les étiquettes de la carte (style choisi dans les réglages). */
  showTags?: boolean;
  /** Force un style d'étiquettes (aperçus des réglages). */
  tagStyle?: CardTagStyle;
  /** Force un habillage (aperçus des réglages). */
  cardStyle?: CardStyle;
}

/** Carte au style WikiMasters : image en haut, fond pastel de la rareté, titre, description, attaque / défense. */
export function WmCard({ card, tilt = true, className, imageOverlay, fallbackFooter, badges, showTags = true, tagStyle: forcedStyle, cardStyle: forcedCardStyle }: WmCardProps) {
  const tagStyle = useCollection((s) => forcedStyle ?? s.settings.cardTagStyle);
  const cardStyle = useCollection((s) => forcedCardStyle ?? s.settings.cardStyle);
  const allTags = useCardTags(card);
  const tags = showTags ? allTags : [];
  const hasStats = card.attack != null || card.defense != null;
  return (
    <div
      className={cn('wm-card select-none', className)}
      data-rarity={card.rarity ?? undefined}
      data-style={cardStyle}
      data-rarity-label={card.rarity ? RARITY_LABEL[card.rarity] : undefined}
      onPointerMove={(e) => track(e, tilt)}
      onPointerLeave={reset}
    >
      {/* Face imprimée : toute la carte en « Actuel », à l'intérieur de la bordure pour les autres habillages. */}
      <div className="wm-face">
      <div className="wm-paper" />
      <div className="wm-art absolute inset-x-0 top-0 z-20 h-[45%] bg-black/20">
        <img src={cardImage(card)} alt="" loading="lazy" draggable={false} className="pointer-events-none absolute inset-0 size-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/50 to-transparent" />
        {imageOverlay}
      </div>

      {/* Rareté : sous les signets quand la carte en porte (style « Signets »). */}
      <div
        className={cn(
          'absolute left-[4.5cqw] z-30 flex items-center gap-[2cqw] transition-[top] duration-200',
          tagStyle === 'bookmarks' && tags.length ? 'top-[15.5cqw]' : 'top-[4.5cqw]',
        )}
      >
        {card.rarity && (
          <span
            className="wm-rarity rounded-[2.5cqw] px-[3.5cqw] py-[1.2cqw] text-[6cqw] leading-none font-bold text-[#0d1117]"
            style={{ backgroundColor: `var(--rarity-${card.rarity.toLowerCase()})`, boxShadow: `0 0 10px color-mix(in srgb, var(--rarity-${card.rarity.toLowerCase()}) 60%, transparent)` }}
          >
            {card.rarity}
          </span>
        )}
        {badges}
      </div>

      <div className="wm-body absolute inset-x-0 top-[45%] bottom-0 z-30 flex flex-col p-[6.5cqw]">
        <h3 className="wm-title line-clamp-2 shrink-0 text-[7.5cqw] leading-tight font-bold text-black" title={card.title}>
          {card.title}
        </h3>
        {card.description && <p className="wm-desc mt-[1.5cqw] line-clamp-2 shrink-0 text-[5.8cqw] leading-snug text-neutral-900/85">{card.description}</p>}
        {tagStyle === 'footer' && <CardTagsFooter tags={tags} />}
        <div
          className={cn(
            'wm-stats flex items-center justify-between border-t border-black/20 pt-[3cqw] text-[5.8cqw] font-bold text-black/90',
            !(tagStyle === 'footer' && tags.length) && 'mt-auto',
          )}
        >
          {hasStats ? (
            <>
              <span className="flex items-center gap-[2cqw]">
                <Swords className="size-[1em] shrink-0 text-red-800" aria-label="Attaque" />
                {card.attack != null ? nf.format(card.attack) : '—'}
              </span>
              <span className="flex items-center gap-[2cqw]">
                <Shield className="size-[1em] shrink-0 text-blue-800" aria-label="Défense" />
                {card.defense != null ? nf.format(card.defense) : '—'}
              </span>
            </>
          ) : (
            fallbackFooter
          )}
        </div>
      </div>
      <CardTagsOverlay tags={tags} style={tagStyle} />
      </div>

      <div className="wm-shine" />
      <div className="wm-holo" />
      <div className="wm-foil" />
      <div className="wm-glitter" />
      <div className="wm-glare" />
      <div className="wm-rim" />
    </div>
  );
}
