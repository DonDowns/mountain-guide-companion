import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runValidation } from './validate-manifest.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) throw new Error('PWA build encountered a malformed canonical public phone');
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function publicUrl(base, path) {
  return new URL(path, base).href;
}

function releaseSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function distanceScopeLabel(scope) {
  if (scope !== 'round_trip') throw new Error(`PWA build requires a reviewed display label for distance scope ${scope}`);
  return 'round trip';
}

async function main() {
  const [{ manifest }, config, fieldGuide, pocketCard, manifestSha256] = await Promise.all([
    runValidation({ silent: true }),
    readFile(resolve(repoRoot, 'config/companion.build.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'generated/field-guide-artifact.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'generated/pocket-card-artifact.json'), 'utf8').then(JSON.parse),
    sha256(resolve(repoRoot, 'data/trip-manifest.json'))
  ]);

  for (const artifact of [fieldGuide, pocketCard]) {
    for (const [key, expected] of [
      ['trip_manifest_sha256', manifestSha256],
      ['data_version', manifest.data_version],
      ['source_release', manifest.metadata.source_release],
      ['source_commit', manifest.metadata.source_commit]
    ]) {
      if (artifact[key] !== expected) throw new Error(`${artifact.artifact_id} ${key} drift blocks the PWA build`);
    }
  }

  const lily = manifest.waypoints.find(waypoint => waypoint.id === 'waypoint-lily-lake-trailhead');
  if (!lily || lily.latitude !== null || lily.longitude !== null || lily.elevation_ft !== null || lily.verification_status !== 'pending_external_verification') {
    throw new Error('Lily Lake canonical hold changed; human review is required');
  }
  if (manifest.objectives.length !== 3 || manifest.planning_times.length !== 6 || manifest.route_segments.length !== 4 ||
      manifest.decision_points.length !== 5 || manifest.public_emergency_contacts.length !== 3 ||
      manifest.communications.check_in_protocol.length !== 9) {
    throw new Error('Canonical record counts changed; review the Phase 4 presentation contract');
  }

  const objectives = manifest.objectives.map(objective => ({
    id: objective.id,
    name: objective.name,
    role: objective.role,
    objectiveType: objective.objective_type,
    plannedDate: objective.planned_date,
    planningTimes: manifest.planning_times.filter(time => time.objective_id === objective.id).map(time => ({
      id: time.id,
      kind: time.kind,
      localTime: time.local_time,
      timezone: time.timezone,
      label: time.label,
      semantics: time.semantics,
      userDefined: time.user_defined,
      automaticCalculation: time.automatic_calculation,
      authorizationEffect: time.authorization_effect,
      safetyNote: time.safety_note
    }))
  }));
  const objectiveById = new Map(objectives.map(objective => [objective.id, objective]));
  const bundleId = `${config.cache_namespace}-${releaseSlug(config.companion_version)}-data-${manifestSha256.slice(0, 12)}-b${config.offline_bundle_version}`;

  const data = {
    identity: {
      companionVersion: config.companion_version,
      releaseStatus: config.release_status,
      dataVersion: manifest.data_version,
      sourceRelease: manifest.metadata.source_release,
      sourceCommit: manifest.metadata.source_commit,
      generatedAt: config.generated_at,
      verifiedAt: manifest.metadata.verified_at,
      manifestSha256,
      manifestShort: manifestSha256.slice(0, 12),
      bundleId,
      offlineBundleVersion: config.offline_bundle_version,
      publicBaseUrl: config.public_base_url
    },
    trip: {
      name: manifest.trip.name,
      area: manifest.trip.area,
      startDate: manifest.trip.start_date,
      endDate: manifest.trip.end_date,
      primaryClimbDate: manifest.trip.primary_climb_date,
      timezone: manifest.metadata.canonical_timezone
    },
    objectives,
    decisions: manifest.decision_points.map(decision => ({
      id: decision.id,
      objectiveIds: decision.objective_ids,
      dimension: decision.dimension,
      prompt: decision.prompt
    })),
    routes: manifest.route_segments.map(route => ({
      id: route.id,
      objectiveId: route.objective_id,
      objectiveRole: objectiveById.get(route.objective_id)?.role,
      name: route.route_name,
      distanceScope: route.distance_scope,
      distanceScopeLabel: distanceScopeLabel(route.distance_scope),
      distanceMiles: route.distance_miles,
      elevationGainFt: route.elevation_gain_ft,
      difficulty: route.difficulty,
      exposure: route.exposure,
      notes: route.route_notes,
      returnConsiderations: route.return_considerations
    })),
    lilyLake: {
      name: lily.name,
      latitude: lily.latitude,
      longitude: lily.longitude,
      elevationFt: lily.elevation_ft,
      verificationStatus: lily.verification_status
    },
    contacts: manifest.public_emergency_contacts.map(contact => ({
      id: contact.id,
      agency: contact.agency,
      role: contact.role,
      geographicContext: contact.geographic_context,
      activationNotes: contact.activation_notes,
      externallyVerifiedAt: contact.last_externally_verified,
      phones: contact.phone_numbers.map(phone => ({
        kind: phone.kind,
        label: phone.label,
        display: formatPhone(phone.e164),
        tel: `tel:${phone.e164}`
      }))
    })),
    communication: {
      milestones: manifest.communications.check_in_protocol,
      emergencySequence: manifest.communications.emergency_sequence
    },
    invariants: {
      weather: manifest.safety_invariants.weather,
      emergency: manifest.safety_invariants.emergency,
      jurisdiction: manifest.safety_invariants.jurisdiction,
      planning: manifest.safety_invariants.planning,
      conditions: manifest.safety_invariants.conditions
    },
    artifacts: {
      fieldGuide: { url: `./${config.field_guide_path}`, sha256: fieldGuide.field_guide_pdf_sha256 },
      pocketCard: { url: `./${config.pocket_card_path}`, sha256: pocketCard.pocket_card_pdf_sha256 }
    }
  };

  const release = {
    companion_version: config.companion_version,
    data_version: manifest.data_version,
    manifest_sha256: manifestSha256,
    source_release: manifest.metadata.source_release,
    source_commit: manifest.metadata.source_commit,
    generated_at: config.generated_at,
    verified_at: manifest.metadata.verified_at,
    release_status: config.release_status,
    bundle_id: bundleId,
    offline_bundle_version: config.offline_bundle_version,
    offline_bundle_url: publicUrl(config.public_base_url, 'offline-bundle.json'),
    pwa_url: config.public_base_url,
    field_guide_url: publicUrl(config.public_base_url, config.field_guide_path),
    pocket_card_url: publicUrl(config.public_base_url, config.pocket_card_path)
  };
  const moduleText = [
    '// Generated by scripts/build-pwa.mjs from data/trip-manifest.json. Do not hand-edit.',
    'function deepFreeze(value) {',
    "  if (value && typeof value === 'object' && !Object.isFrozen(value)) {",
    '    Object.freeze(value);',
    '    for (const child of Object.values(value)) deepFreeze(child);',
    '  }',
    '  return value;',
    '}',
    `export const companionData = deepFreeze(${JSON.stringify(data, null, 2)});`,
    `export const releaseMetadata = deepFreeze(${JSON.stringify(release, null, 2)});`,
    ''
  ].join('\n');
  await Promise.all([
    writeFile(resolve(repoRoot, 'js/companion-data.js'), moduleText),
    writeFile(resolve(repoRoot, 'release.json'), JSON.stringify(release, null, 2) + '\n')
  ]);
  console.log('pwa_build=pass');
  console.log('companion_version=' + release.companion_version);
  console.log('release_status=' + release.release_status);
  console.log('manifest_sha256=' + release.manifest_sha256);
  console.log('pwa_public_url=' + release.pwa_url);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
