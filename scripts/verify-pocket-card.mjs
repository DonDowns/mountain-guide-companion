import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPocketCardModel, repoRoot } from './pocket-card-model.mjs';
import { resolvePython } from './print-runtime.mjs';

const generatedDirectory = resolve(repoRoot, 'generated');
const temporaryDirectory = resolve(repoRoot, 'tmp/pdfs');
const pdfPath = resolve(generatedDirectory, 'pocket-card.pdf');
const htmlPath = resolve(generatedDirectory, 'pocket-card.html');
const artifactPath = resolve(generatedDirectory, 'pocket-card-artifact.json');
const templatePath = resolve(repoRoot, 'pocket-card/pocket-card.template.html');
const cssPath = resolve(repoRoot, 'pocket-card/pocket-card.css');
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
  const model = await buildPocketCardModel();
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
    page_count: 2,
    artifact_status: 'draft_not_field_release'
  };
  for (const [key, value] of Object.entries(expectedIdentity)) {
    if (artifact[key] !== value) errors.push(`artifact record ${key} mismatch`);
  }
  if (artifact.pocket_card_pdf_sha256 !== pdfHash) errors.push('artifact record PDF SHA-256 mismatch');
  if (JSON.stringify(artifact.page_size_points) !== JSON.stringify([252, 360])) errors.push('artifact page-size points mismatch');
  if (!Array.isArray(artifact.page_images) || artifact.page_images.length !== 2) {
    errors.push('artifact record missing 2 page_images');
  } else {
    for (const item of artifact.page_images) {
      const imgPath = resolve(repoRoot, item.path);
      const imgHash = await sha256(imgPath);
      if (imgHash !== item.sha256) errors.push(`${item.path} hash mismatch`);
    }
  }

  const publicLiterals = new Set([
    model.provenance.dataVersion,
    model.provenance.sourceRelease,
    model.provenance.sourceCommit,
    ...model.contacts.flatMap(contact => contact.phones.map(phone => phone.value)),
    ...model.communication.milestones
  ]);
  for (const literal of publicLiterals) {
    if (template.includes(literal) || css.includes(literal)) errors.push(`source template duplicates canonical literal ${JSON.stringify(literal)}`);
  }

  const requiredHtml = [
    model.emergency.headline,
    model.emergency.give,
    model.emergency.jurisdiction,
    model.emergency.countyChoice,
    ...model.contacts.flatMap(contact => contact.phones.map(phone => phone.value)),
    ...model.communication.milestones,
    model.communication.draftBehavior,
    'Personal contact',
    model.personal.completion,
    model.weather.warning,
    model.weather.evidence,
    model.provenance.manifestShort
  ];
  for (const value of requiredHtml) requireText(html, value, 'generated HTML', errors);
  const prohibited = [
    'all clear', 'safe to proceed', 'route is safe', 'weather permits', 'approved to continue',
    'go/no-go', 'rescue requested', 'rescue activated', 'help is on the way', 'message sent',
    'phone intent', 'does not prove', 'drafted/copied',
    '37.62361', '-105.47278', '37.623486', '-105.472903', 'current forecast', 'temperature:', 'precipitation:'
  ];
  for (const value of prohibited) rejectText(html, value, 'generated HTML', errors);
  const phoneMatches = new Set(html.match(/\b\d{3}-\d{3}-\d{4}\b/g) || []);
  const expectedPhones = new Set(model.contacts.flatMap(contact => contact.phones.map(phone => phone.value)));
  if (phoneMatches.size !== expectedPhones.size || [...phoneMatches].some(phone => !expectedPhones.has(phone))) {
    errors.push('generated HTML public phone set mismatch');
  }
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(html)) errors.push('generated HTML contains an email address');
  if (errors.length) throw new Error('Pocket Card verification failed:\n- ' + errors.join('\n- '));

  await mkdir(temporaryDirectory, { recursive: true });
  const temporaryModelPath = resolve(temporaryDirectory, 'verify-pocket-card-model.json');
  const renderDirectory = resolve(temporaryDirectory, 'pocket-card-rendered');
  await writeFile(temporaryModelPath, JSON.stringify(model, null, 2) + '\n');
  if (renderRequested) {
    await rm(renderDirectory, { recursive: true, force: true });
    await mkdir(renderDirectory, { recursive: true });
    execFileSync('pdftoppm', ['-png', '-r', '288', pdfPath, resolve(renderDirectory, 'pocket-card')], { stdio: 'inherit' });
    execFileSync('pdftoppm', ['-gray', '-png', '-r', '288', pdfPath, resolve(renderDirectory, 'pocket-card-gray')], { stdio: 'inherit' });
  }
  const output = execFileSync(resolvePython(), [
    resolve(repoRoot, 'scripts/verify_pocket_card.py'), temporaryModelPath, pdfPath, artifactPath,
    renderRequested ? renderDirectory : ''
  ], { cwd: repoRoot, encoding: 'utf8' }).trim();
  await rm(temporaryModelPath, { force: true });
  let renderedCount = 0;
  if (renderRequested) renderedCount = (await readdir(renderDirectory)).filter(name => name.endsWith('.png')).length;
  console.log(output);
  console.log('pocket_card_verification=pass');
  console.log('pocket_card_pdf_sha256=' + pdfHash);
  console.log('template_canonical_literals=0');
  console.log('rendered_card_images=' + renderedCount);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
