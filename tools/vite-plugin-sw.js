/**
 * Vite plugin: write dist/sw.js from src/pwa/sw.js with the precache list.
 *
 * After the bundle and the public/ files are written it walks dist/, lists
 * every file except source maps, the worker itself and .nojekyll, hashes
 * their contents into a version string and substitutes __PRECACHE__ and
 * __VERSION__ in the worker template. The version changes whenever any
 * precached byte changes, which is what makes the browser install the new
 * worker and the page offer an update.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const SKIP = /\.map$|^sw\.js$|^\.nojekyll$/;

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).split(sep).join('/'));
  }
  return out;
}

/**
 * @param {{template?: string}} [opts] path of the worker template
 * @returns {import('vite').Plugin}
 */
export default function serviceWorker(opts = {}) {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'retro-squash-sw',
    apply: 'build',
    configResolved(cfg) {
      root = cfg.root;
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    closeBundle() {
      const template = resolve(root, opts.template ?? 'src/pwa/sw.js');
      const files = walk(outDir).filter((f) => !SKIP.test(f)).sort();
      const hash = createHash('sha256');
      for (const f of files) { hash.update(f); hash.update(readFileSync(join(outDir, f))); }
      const version = hash.digest('hex').slice(0, 12);
      const precache = ['./', ...files];
      const src = readFileSync(template, 'utf8')
        .replaceAll('__VERSION__', version)
        .replaceAll('__PRECACHE__', JSON.stringify(precache));
      writeFileSync(join(outDir, 'sw.js'), src);
      const bytes = files.reduce((n, f) => n + statSync(join(outDir, f)).size, 0);
      console.log(`sw.js: version ${version}, ${files.length} files precached (${(bytes / 1048576).toFixed(2)} MB)`);
    },
  };
}
