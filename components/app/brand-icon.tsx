import { useId } from 'react';
import { brandIconSvg } from '@/lib/brand-icon';
import { getPalette, type PaletteId } from '@/lib/palettes';
import { cn } from '@/lib/utils';

/** Icône Collection+ dans la palette donnée (version épurée pour les petites tailles). */
export function BrandIcon({ palette, small, className }: { palette: PaletteId; small?: boolean; className?: string }) {
  const prefix = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block shrink-0 [&>svg]:size-full', className)}
      dangerouslySetInnerHTML={{ __html: brandIconSvg(getPalette(palette), { small, prefix }) }}
    />
  );
}
