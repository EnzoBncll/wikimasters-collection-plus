import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

/**
 * Identifiant OAuth Google (type « Extension Chrome ») pour l'export Sheets.
 * À mettre dans .env.local : WXT_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
 */
try {
  process.loadEnvFile('.env.local');
} catch {
  // Pas de .env.local : export Sheets désactivé.
}
const googleClientId = process.env.WXT_GOOGLE_CLIENT_ID;
/** Build pour le Chrome Web Store (`WXT_STORE=1 pnpm zip`) : le Store refuse le champ `key`. */
const storeBuild = process.env.WXT_STORE === '1';
/** Clé publique : fige l'identifiant (npnhlblglinajejkkjcigeebgbogpbii) des installations depuis les Releases GitHub, données comprises. */
const MANIFEST_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyVdJwvQQHf1utmI8pjYwaEdPTWavycOnpkIN+HLguKDzrRVD0rGxSPPKmk/K+bwkaj2CQrDinwtD0Emjt8hcV+k4aCdRLmyWTaetnc1bvjsSz8n7FxyTa7svNK1UrojVGbisQCOFreBUvAuz8KfDNTJglf3VRr4KCZkH2Pj5MDDTprvF/4uLjK7q4fNe7XUKtVpiWfbwTKZqfadhMrHNN5PDA0VJJewomo6psyaXaVmbjNmVpzFgHqglU31YirzKpJ0ri3zo/Wr6YFx31959NXaa1Tho7yGo9J/nP9iaxfn18s4bu16H7gMH4f/n+wIqpOMNFiOBniIScIsiPJTqNwIDAQAB';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'WikiMasters Collection+',
    short_name: 'Collection+',
    description: 'Extension non officielle pour WikiMasters : tri Trade / Not Trade, étiquettes et export de ta collection.',
    // Releases GitHub : `key` garde le même identifiant d'une version à l'autre (sinon, réglages et albums perdus).
    // Chrome Web Store : il refuse ce champ ; son identifiant est attribué au premier import, et c'est lui qu'il
    // faudra renseigner comme « Item ID » du client OAuth Chrome Extension pour l'export Sheets.
    ...(storeBuild ? {} : { key: MANIFEST_KEY }),
    permissions: ['storage', 'unlimitedStorage', 'cookies', 'alarms', 'notifications', ...(googleClientId ? ['identity'] : [])],
    host_permissions: ['https://www.wiki-masters.com/*', 'https://cyrxjeppjqsxxjayfrur.supabase.co/*'],
    // Police Unbounded (OFL) des éléments ajoutés sur le site.
    web_accessible_resources: [{ resources: ['fonts/*'], matches: ['https://www.wiki-masters.com/*'] }],
    ...(googleClientId
      ? { oauth2: { client_id: googleClientId, scopes: ['https://www.googleapis.com/auth/drive.file'] } }
      : {}),
  },
});
