import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import type { OwnedCard } from '@/lib/types';
import { WmCard } from './wm-card';

/**
 * Collage spectaculaire d'une carte dans l'album : elle tombe du dessus en 3D, se plaque dans sa case avec un
 * rebond, puis éclat de particules, onde de choc et éclair. Purement visuel, au-dessus de la page (la vraie vignette
 * est posée dans la case à l'impact). Le même effet pour toutes les cartes.
 */

export interface StickShot {
  key: string;
  card: OwnedCard;
  rect: { x: number; y: number; w: number; h: number };
  delay: number;
}

/** Instant de l'impact (s), après le départ de la chute. */
export const STICK_IMPACT = 0.52;

const PALETTE = ['#fde68a', '#fbbf24', '#ffffff', '#c4b5fd', '#86efac', '#7dd3fc', '#f9a8d4'];

function Particles({ w, h, delay }: { w: number; h: number; delay: number }) {
  const n = 26;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
        const dist = Math.max(w, h) * (0.55 + Math.random() * 0.6);
        const size = 4 + Math.random() * 6;
        const star = i % 3 === 0;
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2"
            style={{
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              background: PALETTE[i % PALETTE.length],
              borderRadius: star ? 1 : '50%',
              clipPath: star ? 'polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%)' : undefined,
              boxShadow: `0 0 8px ${PALETTE[i % PALETTE.length]}`,
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
            animate={{
              x: [0, Math.cos(a) * dist],
              y: [0, Math.sin(a) * dist * 0.8 + 40],
              opacity: [1, 1, 0],
              scale: [1, 1.2, 0.6],
              rotate: star ? 180 : 0,
            }}
            transition={{ delay: delay + STICK_IMPACT, duration: 0.9 + Math.random() * 0.4, ease: [0.15, 0.8, 0.3, 1], times: [0, 0.6, 1] }}
          />
        );
      })}
    </>
  );
}

export function StickFx({ shots }: { shots: StickShot[] }) {
  if (!shots.length) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[90]" style={{ perspective: 900 }}>
      {shots.map(({ key, card, rect, delay }) => (
        <div key={key} className="absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
          {/* Onde de choc et éclair à l'impact. */}
          <motion.span
            className="absolute inset-0 rounded-[12%]"
            style={{ boxShadow: '0 0 0 3px #fde68a, 0 0 30px 8px rgb(253 230 138 / 0.7)' }}
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 1, 0], scale: [0.95, 1.05, 1.6] }}
            transition={{ delay: delay + STICK_IMPACT, duration: 0.6, ease: 'easeOut' }}
          />
          <motion.span
            className="absolute -inset-[40%] rounded-full"
            style={{ background: 'radial-gradient(closest-side, rgb(255 255 255 / 0.9), rgb(253 230 138 / 0.4) 40%, transparent 70%)' }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1, 1.3] }}
            transition={{ delay: delay + STICK_IMPACT, duration: 0.45, ease: 'easeOut' }}
          />
          <Particles w={rect.w} h={rect.h} delay={delay} />
          {/* La carte : chute en 3D depuis le dessus, plaquée avec un rebond, puis s'efface sur la vraie vignette. */}
          <motion.div
            className="absolute inset-0 [transform-style:preserve-3d]"
            initial={{ y: -rect.h * 1.1, scale: 1.45, rotateX: 55, rotateZ: -14, opacity: 0 }}
            animate={{
              y: [-rect.h * 1.1, -rect.h * 0.15, 0, -6, 0],
              scale: [1.45, 1.12, 0.96, 1.02, 1],
              rotateX: [55, 18, 0, 0, 0],
              rotateZ: [-14, -4, 1, 0, 0],
              opacity: [0, 1, 1, 1, 0],
            }}
            transition={{ delay, duration: 1.15, times: [0, 0.32, 0.45, 0.6, 1], ease: [0.3, 0.7, 0.2, 1] }}
          >
            <WmCard card={card} tilt={false} showTags={false} className="h-full w-auto shadow-[0_24px_50px_rgb(0_0_0/0.55)]" />
          </motion.div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
