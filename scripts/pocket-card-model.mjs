import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalRecordGroups, manifestSha256, runValidation } from './validate-manifest.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

function ascii(value) {
  return String(value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u00a0/g, ' ');
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(value.slice(0, 10) + 'T00:00:00Z'));
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) throw new Error('Pocket Card encountered malformed canonical public phone');
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function requireRecord(records, id, kind) {
  const record = records.find(candidate => candidate.id === id);
  if (!record) throw new Error(`Pocket Card requires missing ${kind} ${id}`);
  return record;
}

export async function buildPocketCardModel() {
  const [{ manifest }, hash, buildConfig] = await Promise.all([
    runValidation({ silent: true }),
    manifestSha256(),
    readFile(resolve(repoRoot, 'pocket-card/pocket-card.build.json'), 'utf8').then(JSON.parse)
  ]);

  const records = Object.values(canonicalRecordGroups(manifest)).flat();
  if (records.some(record => record.verification_status === 'conflicted')) {
    throw new Error('A conflicted canonical record blocks Pocket Card generation');
  }

  const lily = requireRecord(manifest.waypoints, 'waypoint-lily-lake-trailhead', 'waypoint');
  if (lily.latitude !== null || lily.longitude !== null || lily.elevation_ft !== null || lily.verification_status !== 'pending_external_verification') {
    throw new Error('Lily Lake hold semantics changed; human review is required before Pocket Card generation');
  }
  if (manifest.public_emergency_contacts.length !== 3 || manifest.public_emergency_contacts.some(contact => contact.phone_numbers.length !== 2)) {
    throw new Error('Pocket Card requires exactly three canonical agencies with two public numbers each');
  }
  if (manifest.communications.check_in_protocol.length !== 9) {
    throw new Error('Pocket Card requires exactly nine canonical communication milestones');
  }

  const contacts = manifest.public_emergency_contacts.map(contact => ({
    agency: ascii(contact.agency),
    shortName: ascii(contact.agency).replace(/ County Sheriff's Office$/, ''),
    phones: contact.phone_numbers.map(phone => ({
      label: ascii(phone.label).replace('County ', '').replace("Sheriff's ", ''),
      value: formatPhone(phone.e164)
    })),
    context: ascii(contact.geographic_context),
    contextPrimary: ascii(contact.geographic_context.split(';')[0].replace(/\.$/, ''))
  }));

  const generatedDate = formatDate(buildConfig.generated_at);
  const verifiedDate = formatDate(manifest.metadata.verified_at);
  return {
    artifact: { ...buildConfig, generated_date: generatedDate },
    provenance: {
      product: 'Don Downs Mountain Guide Companion',
      dataVersion: manifest.data_version,
      sourceRelease: manifest.metadata.source_release,
      sourceCommit: manifest.metadata.source_commit,
      generatedAt: buildConfig.generated_at,
      generatedDate,
      verifiedAt: manifest.metadata.verified_at,
      verifiedDate,
      manifestSha256: hash,
      manifestShort: hash.slice(0, 12)
    },
    emergency: {
      headline: ascii(manifest.safety_invariants.emergency).toUpperCase(),
      sequence: manifest.communications.emergency_sequence.map(ascii),
      give: 'Exact location; mountain / route; elevation; coordinates if available; injuries; party size; weather / conditions.',
      jurisdiction: ascii(manifest.safety_invariants.jurisdiction),
      countyChoice: 'You do not need to choose a county before calling.'
    },
    contacts,
    locationFields: ['Mountain / route:', 'Elevation:', 'Coordinates:', 'Time:'],
    communication: {
      milestones: manifest.communications.check_in_protocol.map(ascii),
      draftBehavior: 'Drafted/copied communication does not prove delivery.'
    },
    personal: {
      fields: ['Name:', 'Phone:', 'Alternate:'],
      notesLabel: 'Optional medical / personal notes',
      completion: 'Complete by hand after printing.'
    },
    weather: {
      refreshLabel: 'Saved weather refreshed:',
      observationLabel: 'Actual sky/wind:',
      warning: 'Saved weather may be stale.',
      evidence: ascii(manifest.safety_invariants.weather)
    },
    safety: 'Decision support, not permission. Actual sky, wind, terrain, access, pace, descent requirements, and group condition govern field decisions.'
  };
}

export { ascii, formatPhone, repoRoot };
