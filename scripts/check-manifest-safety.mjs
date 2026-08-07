import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runValidation } from './validate-manifest.mjs';

const scriptPath = fileURLToPath(import.meta.url);

function stringsUnder(value, path = '$', output = []) {
  if (typeof value === 'string') output.push({ path, value });
  else if (Array.isArray(value)) value.forEach((item, index) => stringsUnder(item, path + '[' + index + ']', output));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) stringsUnder(child, path + '.' + key, output);
  }
  return output;
}

export async function runSafety(options = {}) {
  const { manifest } = await runValidation({ silent: true });
  const errors = [];
  const prohibited = [
    'all clear',
    'safe to go',
    'safe to proceed',
    'route is safe',
    'weather permits',
    'approved to continue',
    'go/no-go',
    'rescue requested',
    'rescue activated',
    'help is on the way',
    'message sent'
  ];

  for (const entry of stringsUnder(manifest)) {
    const lower = entry.value.toLowerCase();
    for (const phrase of prohibited) {
      if (lower.includes(phrase)) errors.push(entry.path + ' contains prohibited affirmative concept ' + JSON.stringify(phrase));
    }
  }

  const invariants = manifest.safety_invariants;
  if (invariants.weather !== 'Weather is evidence, not permission.') errors.push('missing weather evidence invariant');
  if (invariants.emergency !== 'Call 911 first.') errors.push('missing 911-first invariant');
  if (!invariants.jurisdiction.toLowerCase().includes('dispatch determines')) errors.push('missing dispatch jurisdiction invariant');
  if (!invariants.planning.toLowerCase().includes('planning target is not automatic route authorization')) errors.push('missing planning-target authorization invariant');
  if (invariants.conditions !== 'Actual conditions govern the decision.') errors.push('missing actual-conditions invariant');

  for (const decision of manifest.decision_points) {
    if (Object.hasOwn(decision, 'authorization_state') || Object.hasOwn(decision, 'authorization_effect')) {
      errors.push(decision.id + ' contains an authorization state');
    }
    if (Object.hasOwn(decision, 'score') || Object.hasOwn(decision, 'go') || Object.hasOwn(decision, 'no_go')) {
      errors.push(decision.id + ' contains prohibited scoring/authorization data');
    }
  }

  const target = manifest.planning_times.find(record => record.local_time === '11:30');
  if (!target) errors.push('11:30 planning target is missing');
  else if (target.semantics !== 'user_defined_planning_target' || target.automatic_calculation || target.authorization_effect !== 'none') {
    errors.push('11:30 planning target has unsafe semantics');
  }
  if (!manifest.public_emergency_contacts.every(contact => contact.activation_notes.startsWith('Call 911 first.'))) {
    errors.push('one or more public emergency contacts lack 911-first activation notes');
  }

  if (errors.length) throw new Error('Manifest safety check failed:\n- ' + errors.join('\n- '));
  if (!options.silent) {
    console.log('manifest_safety=pass');
    console.log('decision_prompt_count=' + manifest.decision_points.length);
    console.log('prohibited_affirmative_concepts_found=0');
  }
  return { decisionPromptCount: manifest.decision_points.length };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (isMain) {
  runSafety().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
