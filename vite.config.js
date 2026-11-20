import { defineConfig } from 'vite'

// Bloxity local dev (docs.bloxity.io, Environments): pages Boxity serves get window.BLOXITY_ENV; a
// local dev server sets it itself so the SDK targets local services. Injected by the dev server only
// (apply: 'serve'), never into a build. playUrl = the local game server (VITE_SERVER_URL_DEV's port).
const devServer = (process.env.VITE_SERVER_URL_DEV || 'ws://localhost:2567').replace(/^ws/, 'http')
const LOCAL_ENV = { env: 'local', apiUrl: 'http://localhost:4000', playUrl: devServer, portalUrl: 'http://localhost:3000', staticUrl: 'https://static.bloxity.io' }
const boxityLocalEnv = {
  name: 'boxity-local-env',
  apply: 'serve',
  transformIndexHtml: () => [{ tag: 'script', children: `window.BLOXITY_ENV = ${JSON.stringify(LOCAL_ENV)}`, injectTo: 'head-prepend' }],
}

// Relative asset paths so the zipped dist/ runs from any Bloxity host path.
// es2022 for top-level await in main.js (Rapier's wasm init).
export default defineConfig({
  base: './',
  plugins: [boxityLocalEnv],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 }, // rapier3d-compat inlines its wasm
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
})
