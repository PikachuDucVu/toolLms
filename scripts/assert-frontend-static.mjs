import { readFile, readdir } from 'node:fs/promises';
import { relative } from 'node:path';
import { crossFeatureInternalImports } from './frontend-static-imports.mjs';

const root = new URL('../', import.meta.url);
const frontendRoot = new URL('../frontend/src/', import.meta.url);
const contractsRoot = new URL('../packages/contracts/src/', import.meta.url);
const productionSources = [
  ...(await sourceFiles(frontendRoot)),
  ...(await sourceFiles(contractsRoot)),
].filter((file) => !/\.(?:test|spec)\.[^.]+$/.test(file.pathname))
  .filter((file) => !/testFixtures\.[^.]+$/.test(file.pathname));

const forbiddenEndpointPatterns = [
  /\/api\/lms\/graphql/i,
  /UpdateSlotComment/,
  /https?:\/\//i,
  /\b(?:query|mutation)\s+[A-Z][A-Za-z0-9_]*\s*\(/,
];
const undocumentedAnyPatterns = [
  /:\s*any\b/,
  /\b(?:as|satisfies)\s+any\b/,
  /\bany\s*\[\s*\]/,
  /\bArray\s*<\s*any\s*>/,
  /<\s*any\s*>/,
];

for (const file of productionSources) {
  const content = await readFile(file, 'utf8');
  for (const pattern of forbiddenEndpointPatterns) {
    if (pattern.test(content)) throw new Error(`Raw GraphQL/external endpoint pattern ${pattern} found in ${display(file)}`);
  }
  if (/(?:window|globalThis)\s*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])\s*=/.test(content)) {
    throw new Error(`Window/global bridge assignment found in ${display(file)}`);
  }
  if (file.pathname.startsWith(frontendRoot.pathname) && !file.pathname.endsWith('/lib/apiClient.ts') && /\bfetch\s*\(/.test(content)) {
    throw new Error(`Direct fetch outside frontend API client found in ${display(file)}`);
  }
  if (file.pathname.startsWith(frontendRoot.pathname) && /(?:from|import)\s*(?:\(\s*)?['"][^'"]*(?:\.\.\/)+(?:public|legacy)\/(?:js|css)\//.test(content)) {
    throw new Error(`React source imports removed legacy public frontend in ${display(file)}`);
  }
  verifyCrossFeatureImports(file, content);
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!undocumentedAnyPatterns.some((pattern) => pattern.test(line))) continue;
    const documented = line.includes('verify-static-allow-any:') || lines[index - 1]?.includes('verify-static-allow-any:');
    if (!documented) throw new Error(`Undocumented TypeScript any found in ${display(file)}:${index + 1}`);
  }
}

function verifyCrossFeatureImports(file, content) {
  if (!file.pathname.startsWith(frontendRoot.pathname)) return;
  for (const violation of crossFeatureInternalImports(file.pathname, frontendRoot.pathname, content)) {
    throw new Error(`Cross-feature internal import ${JSON.stringify(violation.specifier)} found in ${display(file)}; import through features/${violation.targetFeature}/public instead`);
  }
}

const htmlFiles = (await filesUnder(new URL('../frontend/', import.meta.url)))
  .filter((file) => file.pathname.endsWith('.html'));
for (const file of htmlFiles) {
  const content = await readFile(file, 'utf8');
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(content)) throw new Error(`Inline HTML handler found in ${display(file)}`);
}

const viteConfig = await readFile(new URL('../frontend/vite.config.ts', import.meta.url), 'utf8');
if (!/outDir:\s*['"]\.\.\/public\/new['"]/.test(viteConfig) || !/emptyOutDir:\s*true/.test(viteConfig)) {
  throw new Error('Frontend build must remain isolated to public/new');
}
if (!/manifest:\s*true/.test(viteConfig)) throw new Error('Production manifest is required for route-chunk verification');
if (!/sourcemap:\s*false/.test(viteConfig)) throw new Error('Production sourcemap policy must remain disabled');

console.log(`Validated ${productionSources.length} frontend/contracts production source files for endpoint, fetch, bridge, inline-handler, and TypeScript-any policy.`);

async function sourceFiles(directory) {
  return (await filesUnder(directory)).filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file.pathname));
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
