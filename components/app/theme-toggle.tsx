import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCollection } from '@/hooks/use-collection';
import { isDark } from '@/lib/appearance';
import { cn } from '@/lib/utils';

/** Bascule clair / sombre (dans l'encoche de droite). Part du mode réellement affiché, même en « Auto ». */
export function ThemeToggle() {
  const theme = useCollection((s) => s.settings.theme);
  const updateSettings = useCollection((s) => s.updateSettings);
  const [dark, setDark] = useState(() => isDark(theme));

  useEffect(() => {
    setDark(isDark(theme));
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const label = dark ? 'Passer en mode clair' : 'Passer en mode sombre';
  return (
    <button
      type="button"
      onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })}
      title={label}
      aria-label={label}
      className="relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full text-frame-muted transition hover:bg-frame-active hover:text-frame-foreground"
    >
      <Sun className={cn('absolute size-3.5 transition duration-300', dark ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-90 opacity-0')} />
      <Moon className={cn('absolute size-3.5 transition duration-300', dark ? 'scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100')} />
    </button>
  );
}
