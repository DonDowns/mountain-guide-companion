import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedCommit, expectedRelease, runValidation } from './validate-manifest.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');
const upstreamRepo = process.env.MOUNTAIN_GUIDE_REPO
  ? resolve(process.env.MOUNTAIN_GUIDE_REPO)
  : resolve(repoRoot, '..', 'mountain-guide');

function git(args) {
  return execFileSync('git', ['-C', upstreamRepo, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trimEnd();
}

function requireText(content, needle, context, errors) {
  if (!content.includes(needle)) errors.push(context + ' missing frozen-source value ' + JSON.stringify(needle));
}

function displayTime(localTime) {
  const [hourText, minute] = localTime.split(':');
  const hour = Number(hourText);
  return String(hour % 12 || 12) + ':' + minute + ' ' + (hour >= 12 ? 'PM' : 'AM');
}

function parseWeatherLocations(core) {
  const records = [];
  const pattern = /\{id:'([^']+)',name:'([^']+)',lat:([-\d.]+),lon:([-\d.]+),elevationFt:(\d+),targetDate:'([^']+)'/g;
  for (const match of core.matchAll(pattern)) {
    records.push({
      id: match[1],
      name: match[2],
      latitude: Number(match[3]),
      longitude: Number(match[4]),
      elevation_ft: Number(match[5]),
      target_date: match[6]
    });
  }
  return records;
}

function parseRouteProfiles(core) {
  const line = core.split('\n').find(value => value.startsWith('const ROUTE_PROFILES='));
  if (!line) throw new Error('Frozen source does not contain ROUTE_PROFILES');
  return JSON.parse(line.slice('const ROUTE_PROFILES='.length, -1));
}

function assertDirectComparisons(manifest, sourceByPath, errors) {
  const trips = sourceByPath.get('js/trips.js');
  requireText(trips, "name:'" + manifest.trip.name + "'", 'trip.name', errors);
  requireText(trips, "startDate:'" + manifest.trip.start_date + "'", 'trip.start_date', errors);
  requireText(trips, "endDate:'" + manifest.trip.end_date + "'", 'trip.end_date', errors);
  requireText(trips, "climbDate:'" + manifest.trip.primary_climb_date + "'", 'trip.primary_climb_date', errors);
  requireText(trips, "vehicle:'" + manifest.transportation.description + "'", 'transportation.description', errors);

  const core = sourceByPath.get('js/core.js');
  requireText(core, "timeZone:'" + manifest.metadata.canonical_timezone + "'", 'metadata.canonical_timezone', errors);
  const upstreamWeather = parseWeatherLocations(core);
  for (const location of manifest.weather_reference_locations) {
    const upstream = upstreamWeather.find(record => record.name === location.name);
    if (!upstream) {
      errors.push(location.id + ' has no frozen WEATHER_LOCATIONS match');
      continue;
    }
    for (const key of ['latitude', 'longitude', 'elevation_ft']) {
      if (upstream[key] !== location[key]) errors.push(location.id + ' differs from frozen weather ' + key);
    }
  }

  const routeProfiles = parseRouteProfiles(core);
  const waypoints = new Map(manifest.waypoints.map(record => [record.id, record]));
  for (const route of manifest.route_segments) {
    const upstream = routeProfiles.find(record => record.id === route.upstream_route_id);
    if (!upstream) {
      errors.push(route.id + ' has no frozen ROUTE_PROFILES match');
      continue;
    }
    let published = upstream;
    if (upstream.startPoints?.length) {
      const first = waypoints.get(route.path_waypoint_ids[0]);
      published = upstream.startPoints.find(record =>
        record.miles === route.distance_miles &&
        record.gain === route.elevation_gain_ft &&
        (first?.elevation_ft === null || first?.elevation_ft === undefined || record.label.includes(first.elevation_ft.toLocaleString('en-US')))
      ) || upstream.startPoints.find(record => record.miles === route.distance_miles && record.gain === route.elevation_gain_ft);
    }
    if (!published) {
      errors.push(route.id + ' distance/gain does not match a frozen start point');
      continue;
    }
    if (published.miles !== route.distance_miles) errors.push(route.id + ' distance differs from frozen source');
    if (published.gain !== route.elevation_gain_ft) errors.push(route.id + ' gain differs from frozen source');
    if (upstream.cls !== route.difficulty) errors.push(route.id + ' difficulty differs from frozen source');
  }

  const shared = sourceByPath.get('js/shared.js');
  for (const planning of manifest.planning_times) {
    requireText(shared, (planning.kind === 'planned_start' ? "start:'" : "turn:'") + displayTime(planning.local_time) + "'", planning.id, errors);
  }
  for (const contact of manifest.public_emergency_contacts) {
    requireText(shared, contact.agency, contact.id + '.agency', errors);
    for (const phone of contact.phone_numbers) requireText(shared, phone.e164, contact.id + '.' + phone.kind, errors);
  }
}

export async function runProvenance(options = {}) {
  const { manifest } = await runValidation({ silent: true });
  const errors = [];

  let resolved;
  try {
    resolved = git(['rev-parse', expectedRelease + '^{commit}']);
  } catch (error) {
    throw new Error('Unable to resolve frozen upstream tag read-only: ' + error.message);
  }
  if (resolved !== expectedCommit) errors.push('upstream tag resolves to ' + resolved + ', expected ' + expectedCommit);

  const sourceByPath = new Map();
  for (const source of manifest.source_records) {
    if (source.source_release !== expectedRelease) errors.push(source.id + ' source_release mismatch');
    if (source.source_commit !== expectedCommit) errors.push(source.id + ' source_commit mismatch');
    if (!source.semantic_locator.trim()) errors.push(source.id + ' lacks semantic_locator');
    if (!source.locator_probe.trim()) errors.push(source.id + ' lacks locator_probe');
    if (source.source_path.startsWith('/') || source.source_path.includes('..')) errors.push(source.id + ' has unsafe source_path');
    let content = sourceByPath.get(source.source_path);
    if (content === undefined) {
      try {
        content = git(['show', source.source_release + ':' + source.source_path]);
        sourceByPath.set(source.source_path, content);
      } catch {
        errors.push(source.id + ' source path cannot be retrieved from ' + source.source_release);
        continue;
      }
    }
    if (!content.includes(source.locator_probe)) errors.push(source.id + ' locator_probe not found in frozen source');
    if (source.verification_status === 'externally_verified') {
      errors.push(source.id + ' cannot be externally_verified without a separately modeled external authoritative record');
    }
  }

  if (!errors.length) assertDirectComparisons(manifest, sourceByPath, errors);
  if (errors.length) throw new Error('Manifest provenance check failed:\n- ' + errors.join('\n- '));

  if (!options.silent) {
    console.log('manifest_provenance=pass');
    console.log('upstream_tag=' + expectedRelease);
    console.log('upstream_commit=' + resolved);
    console.log('source_record_count=' + manifest.source_records.length);
  }
  return { resolved, sourceRecordCount: manifest.source_records.length };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (isMain) {
  runProvenance().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
