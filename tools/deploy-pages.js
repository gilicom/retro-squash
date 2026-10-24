/**
 * Publish the production build to GitHub Pages via the `gh-pages` branch.
 *
 * Usage:  npm run deploy
 *
 * Builds with Vite, then force-pushes the contents of dist/ as a single
 * commit on the `gh-pages` branch of the `origin` remote. Pages must be
 * configured to serve from that branch (root), which `gh` can do once:
 *   gh api -X POST repos/<owner>/<repo>/pages -f "source[branch]=gh-pages" -f "source[path]=/"
 *
 * This needs no GitHub Actions and no extra token scopes. The alternative
 * workflow in .github/workflows/deploy.yml deploys automatically on push but
 * requires a token with the `workflow` scope to be committed.
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dist = join(root, 'dist');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });
const out = (cmd, cwd = root) => execSync(cmd, { cwd, encoding: 'utf8' }).trim();

const remote = out('git remote get-url origin');
const name = out('git config user.name || echo "deploy"');
const email = out('git config user.email || echo "deploy@localhost"');

console.log('> building');
run('npm run build');
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/index.html missing after build');

// Tell Pages not to run Jekyll on the output (keeps files starting with _ or .).
writeFileSync(join(dist, '.nojekyll'), '');

console.log('> publishing dist/ to gh-pages on', remote);
rmSync(join(dist, '.git'), { recursive: true, force: true });
run('git init -q -b gh-pages', dist);
run(`git -c user.name="${name}" -c user.email="${email}" add -A`, dist);
run(`git -c user.name="${name}" -c user.email="${email}" commit -q -m "Deploy ${new Date().toISOString()}"`, dist);
run(`git push --force "${remote}" gh-pages:gh-pages`, dist);
rmSync(join(dist, '.git'), { recursive: true, force: true });
console.log('> done');
