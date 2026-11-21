import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Stage GLBs are imported straight from blender/exports with ?url (no copying step).
  assetsInclude: ['**/*.glb'],
  server: { port: 5173, host: true, fs: { allow: [repoRoot] } },
  preview: { port: 4173, host: true },
  build: { chunkSizeWarningLimit: 1500 },
});
