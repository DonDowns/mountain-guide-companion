import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildFieldGuideModel, formatPhone, repoRoot } from './field-guide-model.mjs';
import { resolvePython } from './field-guide-runtime.mjs';

const generatedDirectory = resolve(repoRoot, 'generated');
const temporaryDirectory = resolve(repoRoot, 'tmp/pdfs');
const pdfPath = resolve(generatedDirectory, 'field-guide.pdf');
const htmlPath = resolve(generatedDirectory, 'field-guide.html');
const artifactPath = resolve(generatedDirectory, 'field-guide-artifact.json');
const templatePath = resolve(repoRoot, 'print/field-guide.template.html');
const cssPath = resolve(repoRoot, 'print/field-guide.css');
const renderRequested = process.argv.includes('--render');

function requireText(content, value, context, errors) {
  if (!content.includes(value)) errors.push(`${context} is missing ${JSON.stringify(value)}`);
}

function rejectText(content, value, context, errors) {
  if (content.toLowerCase().includes(value.toLowerCase())) errors.push(`${context} contains prohibited ${JSON.stringify(value)}`);
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function main() {
  const model = await buildFieldGuideModel();
  const [html, artifact, template, css] = await Promise.all([
    readFile(htmlPath, 'utf8'),
    readFile(artifactPath, 'utf8').then(JSON.parse),
    readFile(templatePath, 'utf8'),
    readFile(cssPath, 'utf8')
  ]);
  const errors = [];
  const pdfHash = await sha256(pdfPath);

  const expectedIdentity = {
    trip_manifest_sha256: model.provenance.manifestSha256,
    data_version: model.provenance.dataVersion,
    source_release: model.provenance.sourceRelease,
    source_commit: model.provenance.sourceCommit,
    generated_at: model.provenance.generatedAt,
    page_count: 3,
    artifact_status: 'draft_not_field_release'
  };
  for (const [key, value] of Object.entries(expectedIdentity)) {
    if (artifact[key] !== value) errors.push(`artifact record ${key} mismatch`);
  }
  if (artifact.field_guide_pdf_sha256 !== pdfHash) errors.push('artifact record PDF SHA-256 mismatch');

  const publicLiterals = new Set([
    model.provenance.dataVersion,
    model.provenance.sourceRelease,
    model.provenance.sourceCommit,
    ...model.timeline.flatMap(item => item.times.map(time => time.value)),
    ...model.routes.flatMap(route => [route.distance + ' ' + route.distanceScope, route.gain]),
    ...model.referencePoints.flatMap(point => [point.coordinate, point.elevation]),
    ...model.contacts.flatMap(contact => contact.phones.map(phone => phone.value))
  ]);
  for (const literal of publicLiterals) {
    if (template.includes(literal) || css.includes(literal)) errors.push(`source template duplicates canonical literal ${JSON.stringify(literal)}`);
  }

  const requiredHtml = [
    model.trip.name,
    model.trip.dateRange,
    ...model.timeline.flatMap(item => item.times.map(time => time.value)),
    ...model.routes.flatMap(route => [route.name, route.distance, route.gain, route.difficulty, route.exposure, route.fieldNote].filter(Boolean)),
    model.emergency.headline,
    ...model.contacts.flatMap(contact => contact.phones.map(phone => phone.value)),
    model.weatherRule,
    model.provenance.manifestShort,
    model.lilyLake.holdText,
    ...model.communication.milestones
  ];
  for (const text of requiredHtml) requireText(html, text, 'generated HTML', errors);

  const prohibited = [
    'Go/No-Go',
    'safe bailout',
    'emergency escape route',
    'safe descent',
    'safe to proceed',
    'all clear',
    'route is safe',
    'weather permits',
    'approved to continue',
    'rescue requested',
    'rescue activated',
    'help is on the way',
    'message sent',
    'phone intent',
    'does not prove',
    'drafted/copied',
    'frozen-source',
    '37.62361',
    '-105.47278',
    '37.623486',
    '-105.472903'
  ];
  for (const text of prohibited) rejectText(html, text, 'generated HTML', errors);
  if (errors.length) throw new Error('Field Guide verification failed:\n- ' + errors.join('\n- '));

  await mkdir(temporaryDirectory, { recursive: true });
  const temporaryModelPath = resolve(temporaryDirectory, 'verify-field-guide-model.json');
  const renderDirectory = resolve(temporaryDirectory, 'rendered');
  await writeFile(temporaryModelPath, JSON.stringify(model, null, 2) + '\n');
  if (renderRequested) {
    await rm(renderDirectory, { recursive: true, force: true });
    await mkdir(renderDirectory, { recursive: true });
    execFileSync('pdftoppm', ['-png', '-r', '144', pdfPath, resolve(renderDirectory, 'field-guide')], { stdio: 'inherit' });
    execFileSync('pdftoppm', ['-gray', '-png', '-r', '144', pdfPath, resolve(renderDirectory, 'field-guide-gray')], { stdio: 'inherit' });
  }

  const python = resolvePython();
  const output = execFileSync(python, [
    resolve(repoRoot, 'scripts/verify_field_guide.py'),
    temporaryModelPath,
    pdfPath,
    artifactPath,
    renderRequested ? renderDirectory : ''
  ], { cwd: repoRoot, encoding: 'utf8' }).trim();
  await rm(temporaryModelPath, { force: true });

  let renderedCount = 0;
  if (renderRequested) renderedCount = (await readdir(renderDirectory)).filter(name => name.endsWith('.png')).length;
  console.log(output);
  console.log('field_guide_verification=pass');
  console.log('field_guide_pdf_sha256=' + pdfHash);
  console.log('template_canonical_literals=0');
  console.log('rendered_page_images=' + renderedCount);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
