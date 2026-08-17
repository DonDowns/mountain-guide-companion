import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');
const outputRoot = resolve(repoRoot, '.pages-site');

const deployablePaths = [
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'release.json',
  'offline-bundle.json',
  'css',
  'js',
  'icons',
  'data/trip-manifest.json',
  'generated/field-guide.pdf',
  'generated/field-guide-p1.png',
  'generated/field-guide-p2.png',
  'generated/field-guide-p3.png',
  'generated/pocket-card.pdf',
  'generated/pocket-card-p1.png',
  'generated/pocket-card-p2.png'
];

async function copyPath(path) {
  const source = resolve(repoRoot, path);
  const destination = resolve(outputRoot, path);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

async function main() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  for (const path of deployablePaths) await copyPath(path);
  await writeFile(resolve(outputRoot, '.nojekyll'), '');
  console.log('pages_build=pass');
  console.log('pages_output=.pages-site');
  console.log('pages_entry_count=' + deployablePaths.length);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
