import { manifestSha256, runValidation } from './validate-manifest.mjs';
import { runProvenance } from './check-manifest-provenance.mjs';
import { runPrivacy } from './check-manifest-privacy.mjs';
import { runSafety } from './check-manifest-safety.mjs';

async function main() {
  const validation = await runValidation({ silent: true });
  await runProvenance({ silent: true });
  await runPrivacy({ silent: true });
  await runSafety({ silent: true });
  const firstHash = await manifestSha256();
  const secondHash = await manifestSha256();
  if (firstHash !== secondHash || firstHash !== validation.hash) throw new Error('Manifest SHA-256 is not deterministic');
  const count = Object.values(validation.counts).reduce((sum, value) => sum + value, 0);

  console.log('data_checks=pass');
  console.log('manifest_validation=pass');
  console.log('manifest_provenance=pass');
  console.log('manifest_privacy=pass');
  console.log('manifest_safety=pass');
  console.log('manifest_hash_repeat=pass');
  console.log('canonical_record_count=' + count);
  console.log('external_source_count=' + validation.manifest.external_sources.length);
  console.log('manifest_sha256=' + firstHash);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
