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

function formatDateRange(startValue, endValue) {
  const start = new Date(startValue + 'T00:00:00Z');
  const end = new Date(endValue + 'T00:00:00Z');
  const startMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(start);
  const endMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(end);
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const year = end.getUTCFullYear();
  return startMonth === endMonth
    ? `${startMonth} ${startDay}-${endDay}, ${year}`
    : `${startMonth} ${startDay}-${endMonth} ${endDay}, ${year}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(value.slice(0, 10) + 'T00:00:00Z'));
}

function formatTime(value) {
  const [hourText, minute] = value.split(':');
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatNumber(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(-10);
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatCoordinate(value) {
  return Number(value).toFixed(5);
}

function requireRecord(records, id, kind) {
  const record = records.find(candidate => candidate.id === id);
  if (!record) throw new Error(`Field Guide requires missing ${kind} ${id}`);
  return record;
}

function planningNote(planning) {
  const notes = {
    'planning-lake-como-start': 'Road clearance, conditions, and driver judgment determine the actual starting point and time.',
    'planning-lake-como-camp-target': 'Use this target to preserve recovery margin; reassess actual conditions.',
    'planning-blanca-ellingwood-start': 'This is the current trip plan. Actual conditions govern the start.',
    'planning-blanca-ellingwood-exit-target': 'User-set target. Reassess weather, terrain, pace, descent time, and group condition.',
    'planning-mount-lindsey-start': 'Current access, route conditions, and group judgment govern the actual climb.',
    'planning-mount-lindsey-return-target': 'Reassess access, weather, terrain, pace, and group condition.'
  };
  if (!notes[planning.id]) throw new Error(`Field Guide requires a reviewed note for ${planning.id}`);
  return notes[planning.id];
}

function routeReturnConsideration(route) {
  if (route.id === 'route-mount-lindsey-standard') {
    return 'Trailhead elevation remains unverified; no net descent figure is shown.';
  }
  return ascii(route.return_considerations);
}

function referenceContext(point) {
  return ascii(point.route_context)
    .replace(/^Frozen-source /, '')
    .replace('not asserted as an exact campsite coordinate', 'not an exact campsite location');
}

export async function buildFieldGuideModel() {
  const [{ manifest }, hash, buildConfig] = await Promise.all([
    runValidation({ silent: true }),
    manifestSha256(),
    readFile(resolve(repoRoot, 'print/field-guide.build.json'), 'utf8').then(JSON.parse)
  ]);

  const records = Object.values(canonicalRecordGroups(manifest)).flat();
  if (records.some(record => record.verification_status === 'conflicted')) {
    throw new Error('A conflicted canonical record blocks Field Guide generation');
  }

  const lily = requireRecord(manifest.waypoints, 'waypoint-lily-lake-trailhead', 'waypoint');
  if (lily.latitude !== null || lily.longitude !== null || lily.elevation_ft !== null || lily.verification_status !== 'pending_external_verification') {
    throw new Error('Lily Lake hold semantics changed; human review is required before printing');
  }

  const objectives = new Map(manifest.objectives.map(record => [record.id, record]));
  const planningByObjective = new Map();
  for (const planning of manifest.planning_times) {
    const list = planningByObjective.get(planning.objective_id) || [];
    list.push(planning);
    planningByObjective.set(planning.objective_id, list);
  }

  const roleLabels = {
    approach: 'Approach + camp',
    primary: 'Primary objective',
    separate_planned: 'Separate planned objective'
  };

  const timeline = manifest.objectives.map(objective => ({
    role: roleLabels[objective.role] || ascii(objective.role),
    name: ascii(objective.name),
    plannedDate: formatDate(objective.planned_date),
    times: (planningByObjective.get(objective.id) || []).map(planning => ({
      label: ascii(planning.label),
      value: formatTime(planning.local_time),
      kind: planning.kind,
      semantics: planning.semantics,
      note: planningNote(planning)
    }))
  }));

  const routes = manifest.route_segments.map(route => ({
    id: route.id,
    objective: ascii(requireRecord(manifest.objectives, route.objective_id, 'objective').name),
    name: ascii(route.route_name.replace(/^Combo:\s*/, '')),
    distance: `${formatNumber(route.distance_miles)} mi`,
    distanceScope: ascii(route.distance_scope.replaceAll('_', ' ').toUpperCase()),
    gain: `${formatNumber(route.elevation_gain_ft, 0)} ft`,
    difficulty: ascii(route.difficulty),
    exposure: ascii(route.exposure),
    routeNotes: ascii(route.route_notes),
    returnConsiderations: routeReturnConsideration(route),
    gainValue: route.elevation_gain_ft
  }));

  const referencePointIds = [
    'waypoint-lake-como-area',
    'waypoint-blanca-peak',
    'waypoint-ellingwood-point',
    'waypoint-mount-lindsey'
  ];
  const referencePoints = referencePointIds.map(id => {
    const point = requireRecord(manifest.waypoints, id, 'waypoint');
    if (point.latitude === null || point.longitude === null || point.elevation_ft === null) {
      throw new Error(`Reference point ${id} is incomplete`);
    }
    return {
      name: ascii(point.name),
      coordinate: `${formatCoordinate(point.latitude)}, ${formatCoordinate(point.longitude)}`,
      elevation: `${formatNumber(point.elevation_ft, 0)} ft`,
      context: referenceContext(point)
    };
  });

  const accessEvidence = requireRecord(manifest.external_sources, 'ext-lindsey-waiver', 'external evidence');
  const accessDecision = requireRecord(manifest.decision_points, 'decision-mount-lindsey-access', 'decision point');
  const contacts = manifest.public_emergency_contacts.map(contact => ({
    agency: ascii(contact.agency),
    shortName: ascii(contact.agency).replace(/ County Sheriff's Office$/, ''),
    phones: contact.phone_numbers.map(phone => ({
      label: ascii(phone.label),
      value: formatPhone(phone.e164)
    })),
    context: ascii(contact.geographic_context),
    activation: ascii(contact.activation_notes),
    verified: formatDate(contact.last_externally_verified)
  }));

  const generatedDate = formatDate(buildConfig.generated_at);
  const verifiedDate = formatDate(manifest.metadata.verified_at);
  const tripYear = new Date(manifest.trip.end_date + 'T00:00:00Z').getUTCFullYear();
  const tripName = ascii(manifest.trip.name).replace(new RegExp(` ${tripYear}$`), '');

  return {
    artifact: {
      ...buildConfig,
      generated_date: generatedDate
    },
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
    trip: {
      name: tripName,
      dateRange: formatDateRange(manifest.trip.start_date, manifest.trip.end_date),
      area: ascii(manifest.trip.area)
    },
    timeline,
    decisionGates: manifest.decision_points.map(decision => ascii(decision.prompt)),
    planningRule: 'Planning targets are not safety cutoffs. Reassess against actual weather, terrain, pace, descent duration, access, and group condition.',
    weatherRule: ascii(manifest.safety_invariants.weather),
    actualConditionsRule: ascii(manifest.safety_invariants.conditions),
    routes,
    referencePoints,
    lilyLake: {
      name: ascii(lily.name),
      holdText: 'Exact coordinate/elevation is pending verification and is not shown.'
    },
    access: {
      fact: ascii(accessEvidence.fact_verified),
      restrictions: ascii(accessEvidence.notes),
      recheck: ascii(accessDecision.prompt),
      noGrant: 'Possession of this guide does not grant access.'
    },
    emergency: {
      headline: ascii(manifest.safety_invariants.emergency).toUpperCase(),
      sequence: manifest.communications.emergency_sequence.map(ascii),
      jurisdiction: ascii(manifest.safety_invariants.jurisdiction),
      countyChoice: 'You do not need to choose a county before calling.'
    },
    contacts,
    communication: {
      milestones: manifest.communications.check_in_protocol.map(ascii),
      draftBehavior: 'Confirm delivery in the sending app before marking an update.'
    },
    weatherLog: {
      refreshLabel: 'Saved weather last refreshed:',
      observationLabel: 'Actual sky/wind observed:',
      warning: 'Saved weather may be stale. Current conditions are not confirmed by this printed guide.'
    },
    personal: {
      completion: 'Complete by hand after printing.'
    },
    finalSafety: `The Companion is decision support, not permission. ${ascii(manifest.safety_invariants.weather)} Actual sky, wind, terrain, access, pace, descent requirements, and group condition govern field decisions.`
  };
}

export { ascii, formatPhone, repoRoot };
