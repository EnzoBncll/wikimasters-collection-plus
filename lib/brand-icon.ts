import type { Palette } from './palettes';

/**
 * Icône Collection+ (charte Holo) : une carte irisée « W » qui sort d'un dossier, pastille « + ».
 * `small` : version épurée pour 16–24 px (sans W ni ombre, carte plus grande).
 * Le préfixe rend les identifiants de dégradés uniques quand plusieurs icônes cohabitent dans une page.
 */
export function brandIconSvg(palette: Palette, { small = false, prefix = 'cp' }: { small?: boolean; prefix?: string } = {}): string {
  const { bg, back, front, iri, ink } = palette.icon;
  const id = (name: string) => `${prefix}-${palette.id}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const stops = iri.map((c, i) => `<stop offset="${i / (iri.length - 1)}" stop-color="${c}"/>`).join('');
  const vgrad = (name: string, [top, bottom]: [string, string], opacity = ['1', '1']) =>
    `<linearGradient id="${id(name)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}" stop-opacity="${opacity[0]}"/><stop offset="1" stop-color="${bottom}" stop-opacity="${opacity[1]}"/></linearGradient>`;

  const defs =
    `<defs>` +
    `<radialGradient id="${id('bg')}" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient>` +
    `<linearGradient id="${id('iri')}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>` +
    vgrad('back', back) +
    vgrad('front', front, ['.9', '.95']) +
    `<linearGradient id="${id('shine')}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    (small ? '' : `<filter id="${id('shadow')}" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity=".35"/></filter>`) +
    `</defs>`;

  const body = small
    ? `<rect width="128" height="128" rx="28" fill="${url('bg')}"/>` +
      `<path d="M10 44a10 10 0 0 1 10-10h26l9 9h53a10 10 0 0 1 10 10v53a10 10 0 0 1-10 10H20a10 10 0 0 1-10-10z" fill="${url('back')}"/>` +
      `<rect x="30" y="8" width="62" height="82" rx="9" transform="rotate(-7 61 49)" fill="${url('iri')}"/>` +
      `<path d="M6 62h116l-7 44a10 10 0 0 1-10 8H23a10 10 0 0 1-10-8z" fill="${url('front')}"/>` +
      `<path d="M12 63.5h104" stroke="${url('shine')}" stroke-width="3"/>`
    : `<rect width="128" height="128" rx="28" fill="${url('bg')}"/>` +
      `<path d="M16 46a8 8 0 0 1 8-8h24l8 8h48a8 8 0 0 1 8 8v48a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8z" fill="${url('back')}"/>` +
      `<rect x="40" y="16" width="48" height="66" rx="7" transform="rotate(-7 64 49)" fill="${url('iri')}" filter="${url('shadow')}"/>` +
      `<text x="64" y="60" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="32" transform="rotate(-7 64 49)" fill="${ink}" opacity=".8">W</text>` +
      `<path d="M12 64h104l-6 40a8 8 0 0 1-8 7H26a8 8 0 0 1-8-7z" fill="${url('front')}"/>` +
      `<path d="M16 65.5h96" stroke="${url('shine')}" stroke-width="2"/>` +
      `<circle cx="100" cy="100" r="17" fill="${url('iri')}"/>` +
      `<path d="M100 91v18M91 100h18" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${defs}${body}</svg>`;
}

export function brandIconDataUrl(palette: Palette, options?: { small?: boolean }): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brandIconSvg(palette, options))}`;
}
