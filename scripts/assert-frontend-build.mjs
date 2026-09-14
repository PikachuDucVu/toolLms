import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const publicRoot = new URL('../public/', import.meta.url);
const htmlPath = new URL('../public/new/index.html', import.meta.url);
const assetsDirectory = new URL('../public/new/assets/', import.meta.url);
const manifestPath = new URL('../public/new/.vite/manifest.json', import.meta.url);
const html = await readFile(htmlPath, 'utf8');
const references = [...html.matchAll(/(?:src|href)="(\/new\/assets\/[^"]+)"/g)].map((match) => match[1]);
if (!references.length) throw new Error('Frontend build has no /new/assets references');

const assetFiles = await filesUnder(assetsDirectory);
if (!assetFiles.length) throw new Error('Frontend build has no production assets');
for (const file of assetFiles) {
  const name = basename(file.pathname);
  if (extname(name) === '.map') throw new Error(`Production source map is forbidden: ${name}`);
  if (!/^.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(name)) throw new Error(`Frontend asset is not content-hashed: ${name}`);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) throw new Error(`Empty frontend asset: ${name}`);
}
for (const reference of references) {
  const file = new URL(`../public${reference}`, import.meta.url);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) throw new Error(`Missing frontend asset: ${reference}`);
  if (!/^.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(basename(file.pathname))) throw new Error(`Referenced frontend asset is not hashed: ${reference}`);
}

await verifyRouteChunks(manifestPath);

if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)) throw new Error('Inline HTML event handler found in production document');
if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html)) throw new Error('Inline production script found in production document');

const builtFiles = [htmlPath, ...assetFiles];
const forbiddenStrings = [
  '/api/lms/graphql',
  'UpdateSlotComment',
  'ai.ducvu.io.vn',
  'kiemtra.ducvu.io.vn',
  'openrouter.ai/api',
  'lms-api.mindx',
  'sourceMappingURL=',
];
const secretPatterns = [
  /sk-or-v1-[A-Za-z0-9_-]{16,}/,
  /sk-ant-[A-Za-z0-9_-]{16,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api[_-]?key|token|secret)\s*[:=]\s*["'][A-Za-z0-9_./+:-]{24,}["']/i,
];
for (const file of builtFiles) {
  const content = await readFile(file, 'utf8');
  for (const value of forbiddenStrings) {
    if (content.includes(value)) throw new Error(`Forbidden production bundle string ${JSON.stringify(value)} found in ${display(file)}`);
  }
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) throw new Error(`Known secret pattern ${pattern} found in ${display(file)}`);
  }
}

const publicFiles = await filesUnder(publicRoot);
const legacyFiles = publicFiles.filter((file) => !file.pathname.includes('/public/new/') && /\/(?:index|homework)\.html$|\/css\/|\/js\//.test(file.pathname));
if (legacyFiles.length) {
  throw new Error(`Legacy frontend files must be removed: ${legacyFiles.map(display).join(', ')}`);
}
console.log(`Validated hashed React build (${assetFiles.length} assets) with distinct lazy route chunks, no source maps, no forbidden browser endpoints, and no legacy frontend files.`);

async function verifyRouteChunks(manifestFile) {
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const entry = manifest['index.html'];
  const comments = manifest['src/routes/CommentsRoute.tsx'];
  const homework = manifest['src/routes/HomeworkRoute.tsx'];
  if (!entry?.isEntry || !comments?.isDynamicEntry || !homework?.isDynamicEntry) throw new Error('Frontend manifest must declare comments and homework as dynamic route entries');
  if (!entry.dynamicImports?.includes('src/routes/CommentsRoute.tsx') || !entry.dynamicImports?.includes('src/routes/HomeworkRoute.tsx')) throw new Error('Frontend entry is missing lazy route imports');
  if (comments.file === homework.file) throw new Error('Comments and homework must emit distinct route chunks');
  for (const [route, record, other] of [['comments', comments, homework], ['homework', homework, comments]]) {
    if (!/^assets\/.+-[A-Za-z0-9_-]{8,}\.js$/.test(record.file)) throw new Error(`${route} route chunk is not hashed JavaScript`);
    if (record.imports?.includes(other.src)) throw new Error(`${route} route chunk imports the opposite route tree`);
    const info = await stat(new URL(`../public/new/${record.file}`, import.meta.url));
    if (!info.isFile() || info.size === 0) throw new Error(`Missing ${route} route chunk`);
  }
  const imageAssets = Object.values(manifest).flatMap((record) => record.assets || []).filter((file) => /\.(?:png|jpe?g|gif|webp|svg)$/i.test(file));
  if (!imageAssets.length || !imageAssets.every((file) => /^assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(file))) throw new Error('Frontend manifest must include a hashed image asset');
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    return entry.isDirectory() ? filesUnder(url) : [url];
  }));
  return nested.flat();
}

function display(file) {
  return relative(root.pathname, file.pathname);
}
