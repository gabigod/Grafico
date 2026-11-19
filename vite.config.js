import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
// SINGLE=1 gera um único GraficosFX.html para abrir no PC
const single = !!process.env.SINGLE;
export default defineConfig({
  base: './',
  server: { allowedHosts: ['.e2b.app'] },
  plugins: single ? [viteSingleFile()] : [],
  build: { outDir: single ? 'dist-pc' : 'dist', target: 'es2022', chunkSizeWarningLimit: 4000 },
});
