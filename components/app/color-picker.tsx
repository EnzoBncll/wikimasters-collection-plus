import { Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TAG_COLORS } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
  label?: string;
}

/** Pastille de couleur ouvrant une palette + sélecteur libre. */
export function ColorPicker({ value, onChange, className, label = 'Couleur' }: ColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'size-6 shrink-0 cursor-pointer rounded-full ring-2 ring-background ring-offset-1 ring-offset-border transition hover:scale-110',
            className,
          )}
          style={{ backgroundColor: value }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="grid grid-cols-6 gap-2">
          {TAG_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className="flex size-7 cursor-pointer items-center justify-center rounded-full transition hover:scale-110"
              style={{ backgroundColor: color }}
              aria-label={color}
            >
              {color.toLowerCase() === value.toLowerCase() && <Check className="size-3.5 text-white drop-shadow" />}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          Personnalisée
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-12 cursor-pointer rounded border bg-transparent"
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}
