import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runValidation } from './validate-manifest.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');
const scanExtensions = new Set(['.json', '.md', '.mjs']);
const excludedDirectories = new Set(['.git', 'node_modules', 'coverage', 'dist', 'build']);

async function filesUnder(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(path));
    else if (scanExtensions.has(extname(entry.name)) || entry.name === 'README.md' || entry.name === 'AGENTS.md') output.push(path);
  }
  return output;
}

function normalizedPhone(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '';
}

function scanStructuredKeys(value, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanStructuredKeys(item, path + '[' + index + ']', errors));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const forbidden = /(?:^|_)(email|medical|medication|password|api_key|access_token|account_id|device_id|personal_contact|private_recipient)(?:_|$)/i;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key) && child !== null && child !== false && child !== '') errors.push(path + '.' + key + ' contains a prohibited private-data field value');
    scanStructuredKeys(child, path + '.' + key, errors);
  }
}

export async function runPrivacy(options = {}) {
  const { manifest } = await runValidation({ silent: true });
  const errors = [];
  scanStructuredKeys(manifest, '$', errors);

  const allowedPhones = new Set(
    manifest.public_emergency_contacts
      .flatMap(contact => contact.phone_numbers)
      .map(phone => normalizedPhone(phone.e164))
  );

  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const phonePattern = /(?:\+?1[-. ]?)?\(?[2-9][0-9]{2}\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}\b/g;
  const secretAssignmentPattern = /(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*["'][^"']+["']/gi;
  const absoluteUserPathPattern = /(?:\/Users\/|\/home\/)[A-Za-z0-9._-]+/g;

  for (const path of await filesUnder(repoRoot)) {
    const content = await readFile(path, 'utf8');
    const label = relative(repoRoot, path);
    const emails = content.match(emailPattern) || [];
    if (emails.length) errors.push(label + ' contains email address value(s)');
    const secrets = content.match(secretAssignmentPattern) || [];
    if (secrets.length) errors.push(label + ' contains credential-like assignment(s)');
    const localPaths = content.match(absoluteUserPathPattern) || [];
    if (localPaths.length) errors.push(label + ' contains local user path value(s)');
    for (const match of content.match(phonePattern) || []) {
      const normalized = normalizedPhone(match);
      if (normalized && !allowedPhones.has(normalized)) errors.push(label + ' contains non-allowlisted phone-like value');
    }
  }

  if (errors.length) throw new Error('Manifest privacy check failed:\n- ' + [...new Set(errors)].join('\n- '));
  if (!options.silent) {
    console.log('manifest_privacy=pass');
    console.log('allowlisted_public_phone_count=' + allowedPhones.size);
    console.log('private_values_found=0');
  }
  return { allowedPublicPhoneCount: allowedPhones.size };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (isMain) {
  runPrivacy().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
