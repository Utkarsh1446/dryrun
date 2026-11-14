// Static frontend for Cloudflare Pages. The full demo stays on Render because it needs git and a writable data directory.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT } from '../lib/brand.js';
import { chainStatus } from '../lib/chain.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const chain = chainStatus();
const price = process.env.DRYRUN_PRICE_USD || '5';
const api = process.env.DRYRUN_PUBLIC_URL || PRODUCT.url;

function fill(text) {
  return text
    .replaceAll('__NAME__', PRODUCT.name)
    .replaceAll('__TAGLINE__', PRODUCT.tagline)
    .replaceAll('__DISCLAIMER__', PRODUCT.disclaimer)
    .replaceAll('__URL__', api)
    .replaceAll('__REPO__', PRODUCT.repo)
    .replaceAll('__PRICE__', String(price))
    .replaceAll('__CONTRACT__', chain.contractId || '')
    .replaceAll('__RPC__', chain.rpcUrl)
    .replaceAll('__EXPLORER__', chain.explorerAccount || '')
    .replaceAll('__DEPLOY_TX__', chain.deployTx || '')
    .replaceAll('__CHECKER__', chain.checker || '');
}

await mkdir(dist, { recursive: true });
const index = fill(await readFile(join(root, 'public/index.html'), 'utf8'))
  .replace('<script src="/app.js"></script>', '<script src="/config.js"></script>\n<script src="/app.js"></script>');
await writeFile(join(dist, 'index.html'), index);
await writeFile(join(dist, 'verify.html'), fill(await readFile(join(root, 'public/verify.html'), 'utf8')));
await writeFile(join(dist, 'llms.txt'), fill(await readFile(join(root, 'public/llms.txt'), 'utf8')));
await writeFile(join(dist, 'config.js'), `window.DRYRUN_API = ${JSON.stringify(api)};\n`);
await writeFile(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${api}/sitemap.xml\n`);
for (const file of ['app.js', 'app.css', 'favicon.svg', 'og.png']) {
  await copyFile(join(root, 'public', file), join(dist, file));
}
console.log(`static build ${dist}`);
console.log(`pages: index.html verify.html`);
console.log(`api ${api}`);
console.log(`contract ${chain.contractId || 'unset'}`);
