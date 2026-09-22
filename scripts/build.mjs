import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await mkdir('dist/activity', { recursive: true });
await build({ entryPoints: ['apps/desktop/main.ts'], outfile: 'dist/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], sourcemap: true });
await build({ entryPoints: ['apps/desktop/preload.ts'], outfile: 'dist/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
await build({ entryPoints: ['apps/desktop/renderer/index.tsx'], outfile: 'dist/renderer.js', bundle: true, platform: 'browser', sourcemap: true });
await copyFile('apps/desktop/renderer/index.html', 'dist/index.html');

await build({ entryPoints: ['apps/activity/index.tsx'], outfile: 'dist/activity/activity.js', bundle: true, platform: 'browser', sourcemap: true });
await copyFile('apps/activity/index.html', 'dist/activity/index.html');
await copyFile('apps/activity/style.css', 'dist/activity/activity.css');
await build({ entryPoints: ['services/relay/worker.ts'], outfile: 'dist/relay.js', bundle: true, platform: 'browser', format: 'esm', sourcemap: true });
