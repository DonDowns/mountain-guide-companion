import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildFieldGuideModel, repoRoot } from './field-guide-model.mjs';
import { resolvePython } from './field-guide-runtime.mjs';

const generatedDirectory = resolve(repoRoot, 'generated');
const temporaryDirectory = resolve(repoRoot, 'tmp/pdfs');
const htmlPath = resolve(generatedDirectory, 'field-guide.html');
const pdfPath = resolve(generatedDirectory, 'field-guide.pdf');
const artifactPath = resolve(generatedDirectory, 'field-guide-artifact.json');
const temporaryModelPath = resolve(temporaryDirectory, 'field-guide-model.json');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function footer(model, pageNumber) {
  const provenance = model.provenance;
  return `<footer class="page-footer"><strong>${escapeHtml(provenance.product)}</strong> | Trip Data v${escapeHtml(provenance.dataVersion)} | Based on Mountain Guide ${escapeHtml(provenance.sourceRelease)}<br>Generated: ${escapeHtml(provenance.generatedDate)} | Last verified: ${escapeHtml(provenance.verifiedDate)} | Manifest: ${escapeHtml(provenance.manifestShort)}... | DRAFT | Page ${pageNumber} of 3</footer>`;
}

function timeCards(model) {
  return model.timeline.map(item => `<article class="card"><p class="kicker">${escapeHtml(item.role)} | ${escapeHtml(item.plannedDate)}</p><h3>${escapeHtml(item.name)}</h3>${item.times.map(time => `<div class="time-row"><span class="time">${escapeHtml(time.value)}</span><span>${escapeHtml(time.label)}</span></div><p>${escapeHtml(time.note)}</p>`).join('')}</article>`).join('');
}

function routeCards(model) {
  return model.routes.map(route => `<article class="route-card"><p class="kicker">${escapeHtml(route.objective)}</p><h3>${escapeHtml(route.name)}</h3><div class="route-metrics"><span><strong>${escapeHtml(route.distance)}</strong>${escapeHtml(route.distanceScope)}</span><span><strong>${escapeHtml(route.gain)}</strong>cumulative gain</span><span><strong>${escapeHtml(route.difficulty)}</strong>difficulty</span><span><strong>${escapeHtml(route.exposure)}</strong>exposure</span></div><p><strong>Return consideration:</strong> ${escapeHtml(route.returnConsiderations)}</p></article>`).join('');
}

function routeBars(model) {
  const maximum = Math.max(...model.routes.map(route => route.gainValue));
  return model.routes.map(route => `<div><strong>${escapeHtml(route.name)}</strong> - ${escapeHtml(route.gain)} gain<div class="bar-track"><div class="bar-fill" style="width:${Math.round(route.gainValue / maximum * 100)}%"></div></div></div>`).join('');
}

function pageContent(model) {
  const header = (eyebrow, title, subtitle) => `<header class="page-header"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p class="page-subtitle">${escapeHtml(subtitle)}</p></header>`;
  const page1 = `<section class="page">${header('Printable Field Guide | Page 1', model.trip.name, model.trip.dateRange)}<div class="weather-rule">${escapeHtml(model.weatherRule)} ${escapeHtml(model.actualConditionsRule)}</div><div class="two-column"><main><h2>Operational Timeline</h2>${timeCards(model)}<div class="section-box"><strong>${escapeHtml(model.planningRule)}</strong></div></main><aside><h2>Decision Gates</h2><div class="section-box"><ul>${model.decisionGates.map(prompt => `<li>${escapeHtml(prompt)}</li>`).join('')}</ul></div><div class="section-box"><h3>Field weather record</h3><p>${escapeHtml(model.weatherLog.refreshLabel)} <span class="write-line"></span></p><p>${escapeHtml(model.weatherLog.observationLabel)} <span class="write-line"></span></p><strong>${escapeHtml(model.weatherLog.warning)}</strong></div></aside></div>${footer(model, 1)}</section>`;

  const pointRows = model.referencePoints.map(point => `<tr><td><strong>${escapeHtml(point.name)}</strong><br>${escapeHtml(point.context)}</td><td>${escapeHtml(point.coordinate)}</td><td>${escapeHtml(point.elevation)}</td></tr>`).join('');
  const page2 = `<section class="page">${header('Printable Field Guide | Page 2', 'Route Profile Summary', 'Schematic comparison - not navigation-grade geometry')}<div class="route-grid">${routeCards(model)}</div><div class="two-column"><main><div class="section-box"><h2>Gain comparison</h2>${routeBars(model)}</div><div class="section-box"><h2>Reference points</h2><table><thead><tr><th>Point and meaning</th><th>Coordinate</th><th>Elevation</th></tr></thead><tbody>${pointRows}</tbody></table><p><strong>${escapeHtml(model.lilyLake.name)}:</strong> ${escapeHtml(model.lilyLake.holdText)}</p></div></main><aside><div class="section-box"><h2>Mount Lindsey access</h2><p>${escapeHtml(model.access.fact)}</p><p>${escapeHtml(model.access.restrictions)}</p><p>${escapeHtml(model.access.recheck)}</p><strong>${escapeHtml(model.access.noGrant)}</strong></div><div class="section-box"><h2>Return considerations</h2><p>Use the known route return represented in each canonical route profile. Do not infer shortcuts, alternate descents, water sources, shelters, or undocumented return options from this summary.</p></div></aside></div>${footer(model, 2)}</section>`;

  const contacts = model.contacts.map(contact => `<article class="contact-card"><h3>${escapeHtml(contact.shortName)}</h3>${contact.phones.map(phone => `<p><strong>${escapeHtml(phone.label)}</strong><br>${escapeHtml(phone.value)}</p>`).join('')}<p>${escapeHtml(contact.context)}</p><p><strong>Verified:</strong> ${escapeHtml(contact.verified)}</p></article>`).join('');
  const milestones = model.communication.milestones.map(label => `<tr><td><span class="checkbox"></span>${escapeHtml(label)}</td><td></td><td></td></tr>`).join('');
  const page3 = `<section class="page">${header('Printable Field Guide | Page 3', 'Emergency + Communication', model.trip.name)}<div class="emergency-headline">${escapeHtml(model.emergency.headline)}</div><div class="emergency-rule"><strong>Give:</strong> ${model.emergency.sequence.slice(1, 3).map(escapeHtml).join(' ')}<br>${escapeHtml(model.emergency.jurisdiction)} ${escapeHtml(model.emergency.countyChoice)}</div><div class="contact-grid">${contacts}</div><div class="two-column"><main><h2>Communication field log</h2><table><thead><tr><th>Milestone</th><th>Time</th><th>Status / initials</th></tr></thead><tbody>${milestones}</tbody></table><p><strong>${escapeHtml(model.communication.draftBehavior)}</strong></p></main><aside><div class="section-box"><h2>Personal contact</h2><p>Name:<span class="write-line"></span></p><p>Phone:<span class="write-line"></span></p><p>Alternate:<span class="write-line"></span></p><h3>Optional medical / personal notes</h3><span class="write-line"></span><span class="write-line"></span><strong>${escapeHtml(model.personal.completion)}</strong></div><div class="section-box"><h2>Weather / staleness</h2><p>${escapeHtml(model.weatherLog.refreshLabel)}<span class="write-line"></span></p><p>${escapeHtml(model.weatherLog.observationLabel)}<span class="write-line"></span></p><strong>${escapeHtml(model.weatherLog.warning)}</strong></div></aside></div><div class="section-box"><strong>${escapeHtml(model.finalSafety)}</strong></div>${footer(model, 3)}</section>`;
  return page1 + page2 + page3;
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function main() {
  const model = await buildFieldGuideModel();
  const [template, styles] = await Promise.all([
    readFile(resolve(repoRoot, 'print/field-guide.template.html'), 'utf8'),
    readFile(resolve(repoRoot, 'print/field-guide.css'), 'utf8')
  ]);

  await mkdir(generatedDirectory, { recursive: true });
  await mkdir(temporaryDirectory, { recursive: true });
  for (const path of [htmlPath, pdfPath, artifactPath, temporaryModelPath]) await rm(path, { force: true });
  await writeFile(temporaryModelPath, JSON.stringify(model, null, 2) + '\n');

  const python = resolvePython();
  execFileSync(python, [
    resolve(repoRoot, 'scripts/render_field_guide.py'),
    temporaryModelPath,
    pdfPath
  ], { cwd: repoRoot, stdio: 'inherit' });

  const pdfSha256 = await sha256(pdfPath);
  const artifactRecord = {
    artifact_id: model.artifact.artifact_id,
    artifact_status: model.artifact.artifact_status,
    artifact_path: 'generated/field-guide.pdf',
    field_guide_pdf_sha256: pdfSha256,
    trip_manifest_path: 'data/trip-manifest.json',
    trip_manifest_sha256: model.provenance.manifestSha256,
    data_version: model.provenance.dataVersion,
    source_release: model.provenance.sourceRelease,
    source_commit: model.provenance.sourceCommit,
    generated_at: model.provenance.generatedAt,
    page_count: model.artifact.page_count,
    page_size: model.artifact.page_size,
    orientation: model.artifact.orientation
  };
  const html = template
    .replace('{{DOCUMENT_TITLE}}', escapeHtml(`${model.trip.name} - Printable Field Guide`))
    .replace('{{LOCAL_STYLES}}', styles)
    .replace('{{PAGE_CONTENT}}', pageContent(model))
    .replace('{{ARTIFACT_METADATA}}', JSON.stringify(artifactRecord).replaceAll('<', '\\u003c'));
  await Promise.all([
    writeFile(htmlPath, html),
    writeFile(artifactPath, JSON.stringify(artifactRecord, null, 2) + '\n')
  ]);
  await rm(temporaryModelPath, { force: true });

  console.log('field_guide_build=pass');
  console.log('field_guide_pages=' + artifactRecord.page_count);
  console.log('manifest_sha256=' + artifactRecord.trip_manifest_sha256);
  console.log('field_guide_pdf_sha256=' + artifactRecord.field_guide_pdf_sha256);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
