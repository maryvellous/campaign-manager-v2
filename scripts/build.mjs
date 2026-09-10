import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['apps/desktop/main.ts'], outfile: 'dist/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], sourcemap: true });
await build({ entryPoints: ['apps/desktop/preload.ts'], outfile: 'dist/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
await build({ entryPoints: ['apps/desktop/renderer/index.tsx'], outfile: 'dist/renderer.js', bundle: true, platform: 'browser', sourcemap: true });
await copyFile('apps/desktop/renderer/index.html', 'dist/index.html');
