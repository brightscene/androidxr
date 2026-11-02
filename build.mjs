// Build: bundles src/ into dist/ (deployable PWA), and dist-single/index.html
// (everything inlined in one file, handy for quick previews).
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome110'],
  outfile: 'dist/app.js',
  write: true,
  legalComments: 'none',
});
if (res.errors.length) process.exit(1);

mkdirSync('dist-single', { recursive: true });
const html = readFileSync('dist/index.html', 'utf8');
const css = readFileSync('dist/styles.css', 'utf8');
const js = readFileSync('dist/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const single = html
  .replace('<link rel="stylesheet" href="styles.css" />', `<style>${css}</style>`)
  .replace('<link rel="manifest" href="manifest.webmanifest" />', '')
  .replace('<link rel="icon" href="icons/icon-192.png" />', '')
  .replace('<script src="app.js"></script>', () => `<script>${js}</script>`);
writeFileSync('dist-single/index.html', single);
console.log('built dist/ and dist-single/index.html');
