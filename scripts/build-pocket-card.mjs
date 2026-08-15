import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPocketCardModel, repoRoot } from './pocket-card-model.mjs';
import { resolvePython } from './print-runtime.mjs';

const generatedDirectory = resolve(repoRoot, 'generated');
const temporaryDirectory = resolve(repoRoot, 'tmp/pdfs');
const htmlPath = resolve(generatedDirectory, 'pocket-card.html');
const pdfPath = resolve(generatedDirectory, 'pocket-card.pdf');
const artifactPath = resolve(generatedDirectory, 'pocket-card-artifact.json');
const temporaryModelPath = resolve(temporaryDirectory, 'pocket-card-model.json');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function footer(model, side) {
  const p = model.provenance;
  return `<footer class="footer">${escapeHtml(p.product)} | Trip Data v${escapeHtml(p.dataVersion)} | Based on Mountain Guide ${escapeHtml(p.sourceRelease)}<br>Generated: ${escapeHtml(p.generatedDate)} | Verified: ${escapeHtml(p.verifiedDate)} | Manifest: ${escapeHtml(p.manifestShort)}... | DRAFT | ${side}</footer>`;
}

function front(model) {
  const contacts = model.contacts.map(contact => `<section class="contact"><h2>${escapeHtml(contact.shortName)}</h2>${contact.phones.map(phone => `<p>${escapeHtml(phone.label)}</p><p class="phone">${escapeHtml(phone.value)}</p>`).join('')}</section>`).join('');
  const contexts = model.contacts.map(contact => `<p>${escapeHtml(contact.contextPrimary)}.</p>`).join('');
  const fields = model.locationFields.map(label => `<div class="write-row"><strong>${escapeHtml(label)}</strong><span class="write-line"></span></div>`).join('');
  return `<section class="card-side"><p class="side-label">Front | Emergency</p><h1>${escapeHtml(model.emergency.headline)}</h1><div class="box"><strong>GIVE:</strong> ${escapeHtml(model.emergency.give)}</div><div class="box"><strong>${escapeHtml(model.emergency.jurisdiction)}</strong> ${escapeHtml(model.emergency.countyChoice)}</div><div class="contact-grid">${contacts}</div><div>${contexts}</div><div class="box"><h2>Current location</h2>${fields}</div>${footer(model, 'FRONT')}</section>`;
}

function back(model) {
  const milestones = model.communication.milestones.map(label => `<tr><td><span class="checkbox"></span>${escapeHtml(label)}</td><td></td></tr>`).join('');
  const fields = model.personal.fields.map(label => `<div><strong>${escapeHtml(label)}</strong><span class="write-line"></span></div>`).join('');
  return `<section class="card-side"><p class="side-label">Back | Communication <span>Time / initials</span></p><table class="milestones"><tbody>${milestones}</tbody></table><div class="box"><strong>${escapeHtml(model.communication.draftBehavior)}</strong></div><div class="box"><h2>Personal contact</h2><p><strong>${escapeHtml(model.personal.completion)}</strong></p><div class="field-grid">${fields}</div><p><strong>${escapeHtml(model.personal.notesLabel)}</strong></p><span class="write-line"></span><span class="write-line"></span></div><div class="box"><div class="field-grid"><div><strong>${escapeHtml(model.weather.refreshLabel)}</strong><span class="write-line"></span></div><div><strong>${escapeHtml(model.weather.observationLabel)}</strong><span class="write-line"></span></div></div><p><strong>${escapeHtml(model.weather.warning)} ${escapeHtml(model.weather.evidence)}</strong></p></div><div class="box"><strong>${escapeHtml(model.safety)}</strong></div>${footer(model, 'BACK')}</section>`;
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function main() {
  const model = await buildPocketCardModel();
  const [template, styles] = await Promise.all([
    readFile(resolve(repoRoot, 'pocket-card/pocket-card.template.html'), 'utf8'),
    readFile(resolve(repoRoot, 'pocket-card/pocket-card.css'), 'utf8')
  ]);
  await mkdir(generatedDirectory, { recursive: true });
  await mkdir(temporaryDirectory, { recursive: true });
  for (const path of [htmlPath, pdfPath, artifactPath, temporaryModelPath]) await rm(path, { force: true });
  await writeFile(temporaryModelPath, JSON.stringify(model, null, 2) + '\n');
  execFileSync(resolvePython(), [
    resolve(repoRoot, 'scripts/render_pocket_card.py'), temporaryModelPath, pdfPath
  ], { cwd: repoRoot, stdio: 'inherit' });

  const pdfSha256 = await sha256(pdfPath);
  const pageImages = await Promise.all([
    { page: 1, side: 'front', filename: 'pocket-card-p1.png' },
    { page: 2, side: 'back', filename: 'pocket-card-p2.png' }
  ].map(async item => ({
    page: item.page,
    side: item.side,
    path: `generated/${item.filename}`,
    sha256: await sha256(resolve(generatedDirectory, item.filename))
  })));
  const artifactRecord = {
    artifact_id: model.artifact.artifact_id,
    artifact_status: model.artifact.artifact_status,
    artifact_path: 'generated/pocket-card.pdf',
    pocket_card_pdf_sha256: pdfSha256,
    trip_manifest_path: 'data/trip-manifest.json',
    trip_manifest_sha256: model.provenance.manifestSha256,
    data_version: model.provenance.dataVersion,
    source_release: model.provenance.sourceRelease,
    source_commit: model.provenance.sourceCommit,
    generated_at: model.provenance.generatedAt,
    page_count: model.artifact.page_count,
    page_size: model.artifact.page_size,
    page_size_points: [252, 360],
    orientation: model.artifact.orientation,
    sides: ['front', 'back'],
    page_images: pageImages
  };
  const html = template
    .replace('{{DOCUMENT_TITLE}}', 'Emergency &amp; Communication Pocket Card')
    .replace('{{LOCAL_STYLES}}', styles)
    .replace('{{PAGE_CONTENT}}', front(model) + back(model))
    .replace('{{ARTIFACT_METADATA}}', JSON.stringify(artifactRecord).replaceAll('<', '\\u003c'));
  await Promise.all([
    writeFile(htmlPath, html),
    writeFile(artifactPath, JSON.stringify(artifactRecord, null, 2) + '\n')
  ]);
  await rm(temporaryModelPath, { force: true });
  console.log('pocket_card_build=pass');
  console.log('pocket_card_pages=' + artifactRecord.page_count);
  console.log('pocket_card_size_points=252x360');
  console.log('manifest_sha256=' + artifactRecord.trip_manifest_sha256);
  console.log('pocket_card_pdf_sha256=' + artifactRecord.pocket_card_pdf_sha256);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
