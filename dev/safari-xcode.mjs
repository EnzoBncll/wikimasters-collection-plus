// Projet Xcode (app iPhone/iPad qui embarque l'extension Safari) à partir de la build Safari.
// Usage : `pnpm build:safari && pnpm safari:xcode`. Il faut Xcode complet (App Store), pas seulement les outils en ligne de commande.
// Le projet référence .output/safari-mv3 sans le copier : après un nouveau `pnpm build:safari`, relancer depuis Xcode suffit.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const BUILD = '.output/safari-mv3';
if (!existsSync(`${BUILD}/manifest.json`)) {
  console.error(`Pas de build Safari dans ${BUILD} : lance d'abord \`pnpm build:safari\`.`);
  process.exit(1);
}

try {
  execFileSync('xcrun', ['--find', 'safari-web-extension-converter'], { stdio: 'ignore' });
} catch {
  console.error('Convertisseur Safari introuvable : installe Xcode depuis l’App Store, puis `sudo xcode-select -s /Applications/Xcode.app`.');
  process.exit(1);
}

execFileSync(
  'xcrun',
  [
    'safari-web-extension-converter',
    BUILD,
    '--project-location', 'safari',
    '--app-name', 'Collection+',
    '--bundle-identifier', process.env.SAFARI_BUNDLE_ID ?? 'com.enzobncll.collectionplus',
    '--ios-only',
    '--no-prompt',
    '--force',
  ],
  { stdio: 'inherit' },
);
