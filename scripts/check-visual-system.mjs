import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const files = Object.fromEntries(await Promise.all([
  'css/companion.css',
  'print/field-guide.css',
  'pocket-card/pocket-card.css',
  'scripts/render_field_guide.py',
  'scripts/render_pocket_card.py',
  'manifest.webmanifest',
  'icons/companion-icon.svg',
  'icons/companion-maskable.svg'
].map(async path => [path, await readFile(resolve(repoRoot, path), 'utf8')])));

const errors = [];
const requiredDaylight = {
  'color-brand-primary': '#163d46',
  'color-brand-primary-ink': '#fffdf8',
  'color-brand-red': '#b93d2e',
  'color-accent-gold': '#c9942e',
  'color-stone': '#d7c8ac',
  'color-earth': '#66503c',
  'color-canvas': '#f3f0e8',
  'color-surface': '#fffdf8',
  'color-text': '#132026',
  'color-text-muted': '#45575a',
  'color-emergency': '#8b281f',
  'color-emergency-text': '#fff7f3',
  'color-display-mode-active': '#7a2f25',
  'color-display-mode-active-text': '#fff7f3',
  'color-status-candidate-bg': '#f1dcae',
  'color-status-candidate-border': '#8d6515',
  'color-status-candidate-text': '#3c2d0a',
  'color-header-bg': '#163d46',
  'color-header-text': '#fffdf8'
};

function parseTokens(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(match => [match[1], match[2].toLowerCase()]));
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

function requireContrast(label, foreground, background, minimum) {
  const ratio = contrast(foreground, background);
  if (ratio < minimum) errors.push(`${label} contrast ${ratio.toFixed(2)} is below ${minimum}:1`);
  else console.log(`contrast.${label}=${ratio.toFixed(2)}:1`);
}

const css = files['css/companion.css'];
const daylightBlock = css.match(/^:root\s*\{([\s\S]*?)\n\}/)?.[1] || '';
const redBlock = css.match(/:root\[data-display="red"\]\s*\{([\s\S]*?)\n\}/)?.[1] || '';
const daylight = parseTokens(daylightBlock);
const red = parseTokens(redBlock);

for (const [name, expected] of Object.entries(requiredDaylight)) {
  if (daylight[name] !== expected) errors.push(`daylight token --${name} must equal ${expected}`);
}
for (const name of Object.keys(requiredDaylight)) {
  if (!red[name]) errors.push(`Red Display must override --${name}`);
}

requireContrast('daylight-primary-text', daylight['color-text'], daylight['color-surface'], 4.5);
requireContrast('daylight-muted-text', daylight['color-text-muted'], daylight['color-surface'], 4.5);
requireContrast('daylight-header', daylight['color-header-text'], daylight['color-header-bg'], 4.5);
requireContrast('daylight-candidate-text', daylight['color-status-candidate-text'], daylight['color-status-candidate-bg'], 4.5);
requireContrast('daylight-candidate-boundary', daylight['color-status-candidate-border'], daylight['color-status-candidate-bg'], 3);
requireContrast('daylight-emergency', daylight['color-emergency-text'], daylight['color-emergency'], 4.5);
requireContrast('daylight-display-mode-active', daylight['color-display-mode-active-text'], daylight['color-display-mode-active'], 4.5);
requireContrast('daylight-focus', daylight['color-focus'], daylight['color-canvas'], 3);
requireContrast('red-primary-text', red['color-text'], red['color-surface'], 4.5);
requireContrast('red-primary-button', red['color-brand-primary-ink'], red['color-brand-primary'], 4.5);
requireContrast('red-muted-text', red['color-text-muted'], red['color-surface'], 4.5);
requireContrast('red-header', red['color-header-text'], red['color-header-bg'], 4.5);
requireContrast('red-candidate-text', red['color-status-candidate-text'], red['color-status-candidate-bg'], 4.5);
requireContrast('red-candidate-boundary', red['color-status-candidate-border'], red['color-status-candidate-bg'], 3);
requireContrast('red-emergency', red['color-emergency-text'], red['color-emergency'], 4.5);
requireContrast('red-display-mode-active', red['color-display-mode-active-text'], red['color-display-mode-active'], 4.5);
requireContrast('red-focus', red['color-focus'], red['color-canvas'], 3);

const candidateRule = css.match(/\.brand small\s*\{([\s\S]*?)\n\}/)?.[1] || '';
if (!candidateRule.includes('var(--color-status-candidate-bg)') ||
    !candidateRule.includes('var(--color-status-candidate-border)') ||
    !candidateRule.includes('var(--color-status-candidate-text)')) {
  errors.push('candidate badge must use the dedicated gold/ochre semantic tokens');
}
if (/critical|emergency|brand-red/.test(candidateRule)) errors.push('candidate badge must not use emergency or red tokens');

const currentNavRule = css.match(/\.primary-nav button\[aria-current="page"\]\s*\{([\s\S]*?)\n\}/)?.[1] || '';
if (!currentNavRule.includes('color-accent-gold') || /critical|emergency|brand-red/.test(currentNavRule)) {
  errors.push('current navigation must use gold hierarchy without emergency/red semantics');
}
if (!css.includes('.primary-nav button[data-action="toggle-red"][aria-pressed="true"]')) {
  errors.push('literal Red Display control must retain a distinct pressed-state rule');
}
const redToggleRule = css.match(/\.primary-nav button\[data-action="toggle-red"\]\[aria-pressed="true"\]\s*\{([\s\S]*?)\n\}/)?.[1] || '';
if (!redToggleRule.includes('color-display-mode-active') || /color-emergency/.test(redToggleRule)) {
  errors.push('Red Display pressed state must use dedicated display-mode tokens, not emergency tokens');
}
if (!css.includes(':root[data-display="red"] .primary-nav .emergency-nav')) {
  errors.push('Red Display emergency navigation must retain readable explicit text');
}

for (const stale of ['#135866', '#6f1d1b', '#183342', '#536d7d', '#71818b', '#eef1f2']) {
  if (Object.values(files).some(content => content.toLowerCase().includes(stale))) errors.push(`stale palette value remains: ${stale}`);
}

const expectedIconHashes = {
  'icons/companion-icon.svg': 'bb419adde3ab2112434ddae94a11ee5bcb40cba7399771dd51a315fef4547871',
  'icons/companion-maskable.svg': '67ccb079c74c2a4f9fceb278e13d4720fc7e043a861a39989e3531623a21525f'
};
for (const [path, expected] of Object.entries(expectedIconHashes)) {
  const actual = createHash('sha256').update(files[path]).digest('hex');
  if (actual !== expected) errors.push(`${path} changed without a documented icon defect`);
}

const webManifest = JSON.parse(files['manifest.webmanifest']);
if (webManifest.theme_color !== daylight['color-brand-primary']) errors.push('web manifest theme_color must match brand primary');
if (webManifest.background_color !== daylight['color-canvas']) errors.push('web manifest background_color must match canvas');

for (const path of ['print/field-guide.css', 'pocket-card/pocket-card.css']) {
  const content = files[path];
  for (const token of ['print-brand-primary', 'print-accent-gold', 'print-stone', 'print-earth', 'print-surface', 'print-text', 'print-emergency']) {
    if (!content.includes(`--${token}:`)) errors.push(`${path} is missing --${token}`);
  }
}

for (const path of ['scripts/render_field_guide.py', 'scripts/render_pocket_card.py']) {
  const content = files[path];
  for (const entry of [
    "TEAL = HexColor('#163d46')",
    "GOLD = HexColor('#a96f12')",
    "EARTH = HexColor('#66503c')",
    "STONE = HexColor('#e8dfcf')",
    "EMERGENCY = HexColor('#8b281f')"
  ]) {
    if (!content.includes(entry)) errors.push(`${path} is missing deterministic print color: ${entry}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('visual_system_contract=pass');
  console.log('candidate_status_palette=gold_ochre');
  console.log('icon_identity=unchanged');
}
