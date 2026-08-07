import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

async function main() {
  const [manifestBytes, manifest, fieldGuide, pocketCard, release, generated] = await Promise.all([
    readFile(resolve(repoRoot, 'data/trip-manifest.json')),
    readFile(resolve(repoRoot, 'data/trip-manifest.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'generated/field-guide-artifact.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'generated/pocket-card-artifact.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'release.json'), 'utf8').then(JSON.parse),
    import(pathToFileURL(resolve(repoRoot, 'js/companion-data.js')).href + `?parity=${Date.now()}`)
  ]);
  const hash = createHash('sha256').update(manifestBytes).digest('hex');
  const representations = [
    ['PWA release', release],
    ['PWA runtime', {
      data_version: generated.companionData.identity.dataVersion,
      source_release: generated.companionData.identity.sourceRelease,
      source_commit: generated.companionData.identity.sourceCommit,
      manifest_sha256: generated.companionData.identity.manifestSha256
    }],
    ['Field Guide', fieldGuide],
    ['Pocket Card', pocketCard]
  ];
  const expected = {
    data_version: manifest.data_version,
    source_release: manifest.metadata.source_release,
    source_commit: manifest.metadata.source_commit,
    manifest_sha256: hash
  };
  const errors = [];
  for (const [name, value] of representations) {
    for (const [key, expectedValue] of Object.entries(expected)) {
      const actual = key === 'manifest_sha256' && Object.hasOwn(value, 'trip_manifest_sha256') ? value.trip_manifest_sha256 : value[key];
      if (actual !== expectedValue) errors.push(`${name} ${key} mismatch`);
    }
  }
  if (errors.length) throw new Error('Artifact parity verification failed:\n- ' + errors.join('\n- '));
  console.log('artifact_parity=pass');
  console.log('representation_count=4');
  console.log('data_version=' + expected.data_version);
  console.log('source_release=' + expected.source_release);
  console.log('source_commit=' + expected.source_commit);
  console.log('manifest_sha256=' + expected.manifest_sha256);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
