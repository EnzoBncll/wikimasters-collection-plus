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

export default defineConfig({
  manifest: {
    name: 'WikiMasters Tags',
    description: 'Revue Trade / Not Trade et tags automatiques pour WikiMasters, basés sur les étiquettes du site.',
    // Clé publique : fige l'identifiant de l'extension (npnhlblglinajejkkjcigeebgbogpbii), requis par l'OAuth Google.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyVdJwvQQHf1utmI8pjYwaEdPTWavycOnpkIN+HLguKDzrRVD0rGxSPPKmk/K+bwkaj2CQrDinwtD0Emjt8hcV+k4aCdRLmyWTaetnc1bvjsSz8n7FxyTa7svNK1UrojVGbisQCOFreBUvAuz8KfDNTJglf3VRr4KCZkH2Pj5MDDTprvF/4uLjK7q4fNe7XUKtVpiWfbwTKZqfadhMrHNN5PDA0VJJewomo6psyaXaVmbjNmVpzFgHqglU31YirzKpJ0ri3zo/Wr6YFx31959NXaa1Tho7yGo9J/nP9iaxfn18s4bu16H7gMH4f/n+wIqpOMNFiOBniIScIsiPJTqNwIDAQAB',
    permissions: ['storage', 'unlimitedStorage', 'cookies', ...(googleClientId ? ['identity'] : [])],
    host_permissions: ['https://www.wiki-masters.com/*', 'https://cyrxjeppjqsxxjayfrur.supabase.co/*'],
    ...(googleClientId
      ? { oauth2: { client_id: googleClientId, scopes: ['https://www.googleapis.com/auth/drive.file'] } }
      : {}),
  },
});
