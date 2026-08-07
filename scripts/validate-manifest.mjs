import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

export const manifestPath = resolve(repoRoot, 'data/trip-manifest.json');
export const schemaPath = resolve(repoRoot, 'data/trip-manifest.schema.json');
export const expectedRelease = 'v15.3.10';
export const expectedCommit = 'fb711292b2642c2296eb76c0cfe2531606029609';
export const verificationStatuses = new Set([
  'extracted_from_upstream',
  'verified_against_upstream',
  'externally_verified',
  'pending_external_verification',
  'conflicted',
  'unknown'
]);

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function loadManifest() {
  return readJson(manifestPath);
}

export async function manifestSha256() {
  const bytes = await readFile(manifestPath);
  return createHash('sha256').update(bytes).digest('hex');
}

export function canonicalRecordGroups(manifest) {
  return {
    trip: [manifest.trip],
    objectives: manifest.objectives,
    planning_times: manifest.planning_times,
    camp: [manifest.camp],
    transportation: [manifest.transportation],
    waypoints: manifest.waypoints,
    route_segments: manifest.route_segments,
    decision_points: manifest.decision_points,
    public_emergency_contacts: manifest.public_emergency_contacts,
    communications: [manifest.communications],
    weather_reference_locations: manifest.weather_reference_locations,
    source_records: manifest.source_records
  };
}

function fail(errors, message) {
  errors.push(message);
}

function typeMatches(value, expected) {
  if (expected === 'null') return value === null;
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (expected === 'integer') return Number.isInteger(value);
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === expected;
}

function resolvePointer(root, pointer) {
  if (!pointer.startsWith('#/')) throw new Error('Only local JSON Schema references are supported: ' + pointer);
  return pointer.slice(2).split('/').reduce((value, part) => value[part.replace(/~1/g, '/').replace(/~0/g, '~')], root);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

function validateWithSchema(value, node, path, root, errors) {
  if (node.$ref) {
    validateWithSchema(value, resolvePointer(root, node.$ref), path, root, errors);
    return;
  }

  if (Object.hasOwn(node, 'const') && JSON.stringify(value) !== JSON.stringify(node.const)) {
    fail(errors, path + ' must equal ' + JSON.stringify(node.const));
  }
  if (node.enum && !node.enum.some(candidate => JSON.stringify(candidate) === JSON.stringify(value))) {
    fail(errors, path + ' is not in the allowed enum');
  }

  if (node.type) {
    const expected = Array.isArray(node.type) ? node.type : [node.type];
    if (!expected.some(type => typeMatches(value, type))) {
      fail(errors, path + ' must have type ' + expected.join(' or '));
      return;
    }
  }

  if (typeof value === 'string') {
    if (node.minLength !== undefined && value.length < node.minLength) fail(errors, path + ' is too short');
    if (node.pattern && !(new RegExp(node.pattern).test(value))) fail(errors, path + ' does not match its schema pattern');
    if (node.format === 'date' && !validDate(value)) fail(errors, path + ' is not a valid calendar date');
    if (node.format === 'date-time' && !validDateTime(value)) fail(errors, path + ' is not a valid zoned timestamp');
    if (node.format === 'uri') {
      try {
        new URL(value);
      } catch {
        fail(errors, path + ' is not a valid URI');
      }
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (node.minimum !== undefined && value < node.minimum) fail(errors, path + ' is below minimum');
    if (node.maximum !== undefined && value > node.maximum) fail(errors, path + ' is above maximum');
    if (node.exclusiveMinimum !== undefined && value <= node.exclusiveMinimum) fail(errors, path + ' must exceed exclusiveMinimum');
  }

  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) fail(errors, path + ' has too few items');
    if (node.uniqueItems) {
      const keys = value.map(item => JSON.stringify(item));
      if (new Set(keys).size !== keys.length) fail(errors, path + ' must contain unique items');
    }
    if (node.items) value.forEach((item, index) => validateWithSchema(item, node.items, path + '[' + index + ']', root, errors));
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of node.required || []) {
      if (!Object.hasOwn(value, required)) fail(errors, path + ' is missing required property ' + required);
    }
    if (node.additionalProperties === false && node.properties) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(node.properties, key)) fail(errors, path + ' has unexpected property ' + key);
      }
    }
    for (const [key, child] of Object.entries(node.properties || {})) {
      if (Object.hasOwn(value, key)) validateWithSchema(value[key], child, path + '.' + key, root, errors);
    }
  }
}

function allRecords(manifest) {
  return Object.values(canonicalRecordGroups(manifest)).flat();
}

function assertReferences(manifest, errors) {
  const sourceIds = new Set(manifest.source_records.map(record => record.id));
  const referencedSources = new Set();
  for (const id of manifest.metadata.source_record_ids) {
    if (!sourceIds.has(id)) fail(errors, 'metadata references missing source record ' + id);
    referencedSources.add(id);
  }
  for (const record of allRecords(manifest)) {
    if (record.source_record_ids) {
      for (const id of record.source_record_ids) {
        if (!sourceIds.has(id)) fail(errors, record.id + ' references missing source record ' + id);
        referencedSources.add(id);
      }
    }
  }
  for (const source of manifest.source_records) {
    if (!referencedSources.has(source.id)) fail(errors, 'orphan source record ' + source.id);
  }

  const canonicalIds = new Set(allRecords(manifest).map(record => record.id));
  const externalSourceIds = new Set();
  const authoritativeEvidenceByRecord = new Set();
  for (const source of manifest.external_sources) {
    if (externalSourceIds.has(source.id)) fail(errors, 'duplicate external source id ' + source.id);
    externalSourceIds.add(source.id);
    if (canonicalIds.has(source.id)) fail(errors, 'external source id collides with canonical record ' + source.id);
    for (const id of source.canonical_record_ids) {
      if (!canonicalIds.has(id)) fail(errors, source.id + ' references missing canonical record ' + id);
      if (source.source_tier <= 3) authoritativeEvidenceByRecord.add(id);
    }
  }
  for (const record of allRecords(manifest)) {
    if (record.verification_status === 'externally_verified' && !authoritativeEvidenceByRecord.has(record.id)) {
      fail(errors, record.id + ' claims external verification without linked tier 1-3 evidence');
    }
  }

  const objectiveIds = new Set(manifest.objectives.map(record => record.id));
  const waypointIds = new Set(manifest.waypoints.map(record => record.id));
  const routeIds = new Set(manifest.route_segments.map(record => record.id));

  for (const objective of manifest.objectives) {
    for (const id of objective.component_waypoint_ids) {
      if (!waypointIds.has(id)) fail(errors, objective.id + ' references missing waypoint ' + id);
    }
    for (const id of objective.route_segment_ids) {
      if (!routeIds.has(id)) fail(errors, objective.id + ' references missing route segment ' + id);
    }
  }
  for (const planning of manifest.planning_times) {
    if (!objectiveIds.has(planning.objective_id)) fail(errors, planning.id + ' references missing objective ' + planning.objective_id);
  }
  if (!waypointIds.has(manifest.camp.waypoint_id)) fail(errors, manifest.camp.id + ' references missing waypoint ' + manifest.camp.waypoint_id);
  for (const route of manifest.route_segments) {
    if (!objectiveIds.has(route.objective_id)) fail(errors, route.id + ' references missing objective ' + route.objective_id);
    for (const id of route.path_waypoint_ids) {
      if (!waypointIds.has(id)) fail(errors, route.id + ' references missing waypoint ' + id);
    }
    if (route.distance_scope === 'round_trip' && route.path_waypoint_ids[0] !== route.path_waypoint_ids.at(-1)) {
      fail(errors, route.id + ' has round-trip distance scope but does not return to its first waypoint');
    }
  }
  for (const decision of manifest.decision_points) {
    for (const id of decision.objective_ids) {
      if (!objectiveIds.has(id)) fail(errors, decision.id + ' references missing objective ' + id);
    }
  }
}

function assertCrossRecordRules(manifest, errors) {
  const records = allRecords(manifest);
  const seenIds = new Map();
  for (const record of records) {
    if (seenIds.has(record.id)) fail(errors, 'duplicate logical record id ' + record.id + ' in ' + seenIds.get(record.id));
    else seenIds.set(record.id, 'canonical records');
    if (!verificationStatuses.has(record.verification_status)) fail(errors, record.id + ' has invalid verification_status');
  }

  if (manifest.metadata.canonical_timezone !== 'America/Denver') fail(errors, 'canonical timezone must be America/Denver');
  if (manifest.metadata.source_release !== expectedRelease) fail(errors, 'metadata source release mismatch');
  if (manifest.metadata.source_commit !== expectedCommit) fail(errors, 'metadata source commit mismatch');
  if (manifest.trip.start_date > manifest.trip.end_date) fail(errors, 'trip start_date must not follow end_date');
  if (manifest.trip.primary_climb_date < manifest.trip.start_date || manifest.trip.primary_climb_date > manifest.trip.end_date) {
    fail(errors, 'primary_climb_date must be inside the trip date range');
  }

  for (const planning of manifest.planning_times) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(planning.local_time)) fail(errors, planning.id + ' has invalid local time');
    if (planning.timezone !== manifest.metadata.canonical_timezone) fail(errors, planning.id + ' timezone mismatch');
    if (planning.kind === 'planned_start' && planning.semantics !== 'planned_start') fail(errors, planning.id + ' start semantics mismatch');
    if (planning.kind === 'turnaround_or_exit_target' && planning.semantics !== 'user_defined_planning_target') {
      fail(errors, planning.id + ' target semantics mismatch');
    }
    if (!planning.user_defined || planning.automatic_calculation || planning.authorization_effect !== 'none') {
      fail(errors, planning.id + ' violates planning-time safety semantics');
    }
  }

  const primaryStart = manifest.planning_times.find(record => record.id === 'planning-blanca-ellingwood-start');
  const primaryTarget = manifest.planning_times.find(record => record.id === 'planning-blanca-ellingwood-exit-target');
  if (primaryStart?.local_time !== '04:15') fail(errors, 'primary planned start must remain 04:15');
  if (primaryTarget?.local_time !== '11:30') fail(errors, 'primary planning target must remain 11:30');

  for (const waypoint of manifest.waypoints) {
    if ((waypoint.latitude === null) !== (waypoint.longitude === null)) fail(errors, waypoint.id + ' must provide both coordinates or neither');
  }
  const coordinatePairs = [
    ['waypoint-lake-como-area', 'weather-lake-como-area'],
    ['waypoint-blanca-peak', 'weather-blanca-peak'],
    ['waypoint-ellingwood-point', 'weather-ellingwood-point'],
    ['waypoint-mount-lindsey', 'weather-mount-lindsey']
  ];
  const waypointById = new Map(manifest.waypoints.map(record => [record.id, record]));
  const weatherById = new Map(manifest.weather_reference_locations.map(record => [record.id, record]));
  for (const [waypointId, weatherId] of coordinatePairs) {
    const waypoint = waypointById.get(waypointId);
    const weather = weatherById.get(weatherId);
    if (!waypoint || !weather) {
      fail(errors, `coordinate drift pair is missing ${waypointId} or ${weatherId}`);
      continue;
    }
    for (const field of ['latitude', 'longitude', 'elevation_ft']) {
      if (waypoint[field] !== weather[field]) fail(errors, `${waypointId}.${field} must exactly match ${weatherId}.${field}`);
    }
  }
  for (const contact of manifest.public_emergency_contacts) {
    if (contact.verification_status === 'externally_verified' && !contact.last_externally_verified) {
      fail(errors, contact.id + ' claims external verification without a date');
    }
    if (contact.verification_status === 'pending_external_verification' && contact.last_externally_verified !== null) {
      fail(errors, contact.id + ' has a last_externally_verified date while pending');
    }
  }
  for (const source of manifest.source_records) {
    if (source.source_release !== expectedRelease || source.source_commit !== expectedCommit) {
      fail(errors, source.id + ' does not pin the canonical upstream release');
    }
    if (!source.semantic_locator.trim() || !source.locator_probe.trim()) fail(errors, source.id + ' lacks durable locator data');
    if (source.source_path.startsWith('/') || source.source_path.includes('..')) fail(errors, source.id + ' has an unsafe source path');
  }
}

export async function runValidation(options = {}) {
  const manifest = await loadManifest();
  const schema = await readJson(schemaPath);
  const errors = [];

  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
    fail(errors, 'schema must declare JSON Schema draft 2020-12');
  }
  validateWithSchema(manifest, schema, '$', schema, errors);
  assertReferences(manifest, errors);
  assertCrossRecordRules(manifest, errors);

  if (errors.length) {
    const error = new Error('Manifest validation failed:\n- ' + errors.join('\n- '));
    error.validationErrors = errors;
    throw error;
  }

  const hash = await manifestSha256();
  const groups = canonicalRecordGroups(manifest);
  const counts = Object.fromEntries(Object.entries(groups).map(([name, records]) => [name, records.length]));
  if (!options.silent) {
    console.log('manifest_validation=pass');
    console.log('json_schema_subset=draft-2020-12 keywords used by this schema');
    console.log('canonical_record_count=' + Object.values(counts).reduce((sum, count) => sum + count, 0));
    console.log('external_source_count=' + manifest.external_sources.length);
    console.log('manifest_sha256=' + hash);
  }
  return { manifest, schema, hash, counts };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (isMain) {
  runValidation().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
