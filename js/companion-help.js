import { companionData } from './companion-data.js';

export const COMPANION_ONBOARDING_VERSION = 'companion-onboarding-candidate-8-v1';

export const companionHelpTopics = Object.freeze([
  { id: 'shared', title: 'What the Companion is', aliases: 'shared expedition trip partner owner', body: 'This is a public, trip-scoped field reference shared by the Mountain Guide owner. It includes the packaged trip plan, decision prompts, communication milestones, emergency information, Field Guide, and Pocket Card.' },
  { id: 'sections', title: 'What each section does', aliases: 'tabs home timeline route emergency help red navigation', body: 'Home shows phone setup, packaged trip-data, and update status. Timeline shows the selected objective, planning times, decision prompts, and local milestones. Route compares packaged routes. Emergency keeps 911-first instructions and public contacts one action away. Help contains recovery guidance. Red changes presentation only.' },
  { id: 'limits', title: 'What a companion can and cannot change', aliases: 'edit owner packing gear weather permission control private', body: 'A companion can choose the current objective and save local actual-start, milestone, display, status-note, and optional private-contact state on this phone. The companion cannot edit the owner’s Mountain Guide, canonical trip facts, route facts, packing plan, or published shared package.' },
  { id: 'install', title: 'Install or save on iPhone', aliases: 'iphone safari pwa add home screen browser installing installation installed', body: 'Open this page in Safari, tap Share, choose Add to Home Screen, then open the Home Screen Companion once while online. If a link opens in a browser tab later, close it and reopen the Home Screen app.' },
  { id: 'offline', title: 'Prepare for no signal', aliases: 'offline no service no signal airplane mode cache field weak intermittent', body: 'Install before departure, run Offline Check while connected, then force-quit and reopen from the Home Screen in Airplane Mode. Open Timeline, Route, Emergency, Help, the Field Guide, and the Pocket Card during the test.' },
  { id: 'verify', title: 'Confirm phone setup', aliases: 'setup complete ready check installed resources control controller', body: 'Setup is complete only when the app is running from an installed Home Screen experience, the service worker controls the page, and the current packaged resources verify. The separate Airplane Mode record documents the physical reopen test; it does not evaluate mountain conditions.' },
  { id: 'freshness', title: 'Check when shared information was verified', aliases: 'last updated stale current age verified version payload package freshness', body: 'Help & Diagnostics shows the Trip Data version and verification date embedded in this package. A verified package can still contain changing facts that need rechecking. The owner controls published shared information.' },
  { id: 'refresh', title: 'Refresh shared information', aliases: 'refresh update sync latest shared information download checking downloading', body: 'While online, use Check for New Shared Information. Companion checks for one atomically verified package containing both app files and trip data, so it never mixes a new payload with an older shell. A downloaded update is labeled as an update, not phone setup.' },
  { id: 'update', title: 'Apply or recover an app update', aliases: 'update restart activate failed interrupted rollback previous version', body: 'If an update is downloaded, use Restart to Use Update. If download or activation fails, the last complete packaged version remains available. Reconnect and retry later; Repair Offline Copy is available in Help & Diagnostics.' },
  { id: 'failure', title: 'App will not open or looks incomplete', aliases: 'blank broken missing corrupted incomplete open reload clear data troubleshoot', body: 'Reopen the installed Home Screen app. If essential content remains missing, use the physical Field Guide or Pocket Card, then reconnect and run Repair Offline Copy. Browser data clearing can remove local state and offline resources.' },
  { id: 'weak-service', title: 'Weak service or Airplane Mode', aliases: 'weak intermittent offline airplane signal refresh fails failure', body: 'Keep using the last complete offline package. Do not repeatedly refresh on an unstable connection. Turn off Airplane Mode and wait for a reliable connection before checking for newer shared information.' },
  { id: 'weather', title: 'Weather and decision limits', aliases: 'weather forecast turnaround conditions permission rescue medical clearance', body: 'The Companion may contain planning context, not live weather permission. It does not supply rescue guidance, medical clearance, route authorization, or a mountain decision. Weather is evidence, not permission; actual conditions govern.' },
  { id: 'emergency', title: 'Use emergency information', aliases: 'emergency emergencies 911 sheriff dispatch sos rescue', body: 'Open Emergency and call 911 first. Give the exact location, mountain or route, elevation, coordinates if available, injuries, party size, and conditions. Dispatch determines the responding agency.' },
  { id: 'onboarding', title: 'Replay a dismissed tutorial', aliases: 'tutorial onboarding first use skipped dismissed help replay', body: 'Open Help in the bottom navigation and choose Replay Tutorial. Completing or dismissing the current tutorial is remembered only on this phone.' },
  { id: 'support', title: 'Report a problem or request a feature', aliases: 'feedback bug issue support feature request faq diagnostics', body: 'Use the two separate forms below. Each creates copyable structured text. No support backend, invented email address, or external submission service is built into Companion.' }
]);

const onboardingSteps = Object.freeze([
  { title: 'What was shared', body: () => `${companionData.trip.name} was packaged as a public Companion. The trip owner controls the published shared facts; your operational entries stay on this phone.` },
  { title: 'Prepare this phone', body: () => 'On iPhone, use Safari → Share → Add to Home Screen. Open once online, then run Offline Check so the complete packaged app, trip data, Help, and physical-reference PDFs verify.' },
  { title: 'Confirm it works without service', body: () => 'Force-quit, enable Airplane Mode, reopen from the Home Screen, and check Timeline, Route, Emergency, Help, the Field Guide, and the Pocket Card. Record the test only after doing it.' },
  { title: 'Refresh, Help, and limits', body: () => 'Check for newer shared information only with a reliable connection. Help contains recovery steps. Companion is planning evidence—not rescue guidance, medical clearance, route authorization, or permission to continue.' }
]);

const TOKEN_ALIASES = Object.freeze({
  emergencies: 'emergency', emergency: 'emergency',
  installing: 'install', installation: 'install', installed: 'install', installs: 'install',
  updates: 'update', updated: 'update', updating: 'update',
  refreshes: 'refresh', refreshed: 'refresh', refreshing: 'refresh',
  turnarounds: 'turnaround', conditions: 'condition', failures: 'failure', fails: 'failure', failed: 'failure',
  checks: 'check', checked: 'check', checking: 'check', resources: 'resource',
  signals: 'signal', tutorials: 'tutorial', problems: 'problem', features: 'feature'
});

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(value) {
  return normalize(value).split(' ').filter(Boolean).map(token => TOKEN_ALIASES[token] || token);
}

function tokenMatches(indexToken, queryToken) {
  if (indexToken === queryToken) return true;
  return queryToken.length >= 3 && (indexToken.startsWith(queryToken) || queryToken.startsWith(indexToken));
}

export function searchCompanionHelp(query = '') {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return [...companionHelpTopics];
  return companionHelpTopics.filter(topic => {
    const indexTokens = tokens(`${topic.title} ${topic.aliases} ${topic.body}`);
    return queryTokens.every(queryToken => indexTokens.some(indexToken => tokenMatches(indexToken, queryToken)));
  });
}

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.className) node.className = options.className;
  for (const [name, value] of Object.entries(options)) {
    if (!['text', 'className'].includes(name) && value !== undefined && value !== null) node.setAttribute(name, String(value));
  }
  node.append(...children);
  return node;
}

export function renderCompanionHelpTopics(query = '') {
  const target = document.querySelector('#companion-help-results');
  if (!target) return [];
  const trimmed = query.trim();
  const matches = searchCompanionHelp(query);
  const status = document.querySelector('#companion-help-status');

  if (trimmed) {
    if (matches.length === 0) {
      target.replaceChildren(element('div', { className: 'zero-results' }, [
        element('p', { text: `No matches for "${trimmed}".` }),
        element('p', { className: 'suggestion', text: 'Try broader words like offline, install, weather, route, or emergency.' })
      ]));
      if (status) status.textContent = `No matches for "${trimmed}".`;
    } else {
      target.replaceChildren(...matches.map(topic => {
        const item = element('details', { className: 'help-topic', open: matches.length === 1 || undefined }, [
          element('summary', { text: topic.title, 'aria-expanded': matches.length === 1 ? 'true' : 'false' }),
          element('p', { text: topic.body })
        ]);
        return item;
      }));
      const countText = matches.length === 1 ? `1 match for "${trimmed}"` : `${matches.length} matches for "${trimmed}"`;
      if (status) status.textContent = countText;
    }
  } else {
    target.replaceChildren(...matches.map(topic => element('details', { className: 'help-topic' }, [
      element('summary', { text: topic.title, 'aria-expanded': 'false' }),
      element('p', { text: topic.body })
    ])));
    if (status) status.textContent = `${matches.length} help topics`;
  }
  return matches;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const verificationDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
});

export function sharedInformationState({
  verifiedAt = companionData.identity.verifiedAt,
  updateAvailable = false,
  now = new Date()
} = {}) {
  const verified = new Date(verifiedAt);
  if (!verifiedAt || Number.isNaN(verified.getTime())) {
    return {
      status: 'missing',
      label: 'Packaged trip data · verification date unavailable; age cannot be calculated. Recheck changing facts when connectivity is available.'
    };
  }
  const display = verificationDateFormatter.format(verified);
  const deviceNow = now instanceof Date ? now : new Date(now);
  const prefix = updateAvailable ? 'Newer verified package downloaded · this package' : 'Packaged trip data ·';
  const status = updateAvailable ? 'stale-package' : 'current-package';
  if (Number.isNaN(deviceNow.getTime())) {
    return {
      status,
      label: `${prefix} verified ${display} · age unavailable because this phone’s clock could not be read. Check this phone’s date and time. Recheck changing facts when connectivity is available.`
    };
  }
  const elapsedMilliseconds = deviceNow.getTime() - verified.getTime();
  if (elapsedMilliseconds < 0) {
    return {
      status,
      label: `${prefix} verified ${display} · verification time is ahead of this phone’s clock. Check this phone’s date and time. Recheck changing facts when connectivity is available.`
    };
  }
  const ageDays = Math.floor(elapsedMilliseconds / DAY_IN_MILLISECONDS);
  return {
    status,
    ageDays,
    label: `${prefix} verified ${display} · ${ageDays} ${ageDays === 1 ? 'day' : 'days'} old by this phone’s clock. Recheck changing facts when connectivity is available.`
  };
}

export function deriveCompanionStatus({ standalone, offlineResult = {}, workerState = {}, verifiedAt, now }) {
  const controlled = workerState.controlled === true;
  const offlineReady = controlled && offlineResult.complete === true;
  let setup = 'not-started';
  if (offlineResult.checking) setup = 'in-progress';
  else if (standalone && offlineReady) setup = 'complete';
  else if (offlineResult.attempted || offlineResult.error || workerState.supported === false || offlineReady || standalone) setup = 'incomplete';
  const update = workerState.updateStatus || (workerState.updateAvailable ? 'available' : 'current');
  const sharedData = sharedInformationState({ verifiedAt, now, updateAvailable: workerState.updateAvailable === true }).status;
  return { setup, offlineReady, installed: Boolean(standalone), controlled, update, sharedData, updateAvailable: workerState.updateAvailable === true };
}

function deviceCategory() {
  const agent = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(agent)) return /Safari/i.test(agent) && !/CriOS|FxiOS|EdgiOS/i.test(agent) ? 'iPhone/iPad · Safari' : 'iPhone/iPad · browser';
  if (/Android/i.test(agent)) return 'Android · browser';
  return 'Desktop/laptop · browser';
}

function updateLabel(status) {
  return ({ checking: 'Checking', downloading: 'Downloading', available: 'Update downloaded', applying: 'Applying', failed: 'Check or update failed', offline: 'Offline — check unavailable', current: 'No downloaded update' })[status] || 'Status unavailable';
}

export function buildCompanionDiagnostics(options) {
  const derived = deriveCompanionStatus(options);
  const shared = sharedInformationState({ verifiedAt: options.verifiedAt, now: options.now, updateAvailable: derived.updateAvailable });
  return [
    'App: Mountain Guide Companion',
    `Companion version: ${companionData.identity.companionVersion}`,
    'Release: Preview candidate — physical phone testing required',
    `Trip Data version: ${companionData.identity.dataVersion}`,
    `Shared information: ${shared.label}`,
    `Device/browser category: ${deviceCategory()}`,
    `Display: ${derived.installed ? 'Installed app' : 'Browser'}`,
    `Connection: ${navigator.onLine ? 'Online' : 'Offline'}`,
    `Service worker controlling: ${derived.controlled ? 'Yes' : 'No'}`,
    `Offline package: ${derived.offlineReady ? 'Verified' : 'Not verified in this session'}`,
    `Setup state: ${derived.setup}`,
    `Update state: ${derived.update}`
  ].join('\n');
}

export function buildProblemReport(fields, diagnostics) {
  return ['COMPANION PROBLEM REPORT', diagnostics, `Section: ${fields.section || 'Not specified'}`, `Problem: ${fields.description?.trim() || 'Not provided'}`, `Steps to reproduce: ${fields.steps?.trim() || 'Not provided'}`].join('\n\n');
}

export function buildFeatureRequest(fields) {
  return ['COMPANION FEATURE REQUEST', 'App: Mountain Guide Companion', `Version: ${companionData.identity.companionVersion}`, `Problem to solve: ${fields.problem?.trim() || 'Not provided'}`, `Who would use it: ${fields.who?.trim() || 'Not provided'}`, `When needed: ${fields.when || 'Not specified'}`, `How often: ${fields.frequency || 'Not specified'}`, `Requested behavior: ${fields.behavior?.trim() || 'Not provided'}`].join('\n\n');
}

export function renderCompanionSupportStatus(options) {
  const derived = deriveCompanionStatus(options);
  const shared = sharedInformationState({ verifiedAt: options.verifiedAt, now: options.now, updateAvailable: derived.updateAvailable });
  const setupLabels = { 'not-started': 'Not started', 'in-progress': 'Checking this phone…', complete: 'Phone Setup ✓', incomplete: derived.installed ? 'Setup needs attention' : 'Install to finish setup' };
  const values = {
    'home-offline-status': setupLabels[derived.setup],
    'home-shared-status': shared.label,
    'home-update-status': updateLabel(derived.update),
    'diagnostic-app-type': 'Companion App',
    'diagnostic-version': companionData.identity.companionVersion,
    'diagnostic-release': 'Preview candidate · physical phone testing required',
    'diagnostic-display': derived.installed ? 'Installed app' : 'Browser',
    'diagnostic-network': navigator.onLine ? 'Online' : 'Offline',
    'diagnostic-worker': derived.controlled ? 'Controlling this page' : 'Not controlling this page',
    'diagnostic-offline': derived.offlineReady ? 'Current package verified' : 'Not verified in this session',
    'diagnostic-shared': `Trip Data v${companionData.identity.dataVersion} · ${shared.label}`,
    'diagnostic-update': updateLabel(derived.update)
  };
  for (const [id, value] of Object.entries(values)) {
    const target = document.querySelector(`#${id}`);
    if (target) target.textContent = value;
  }
  const headerSetup = document.querySelector('.header-setup');
  if (headerSetup) {
    headerSetup.hidden = false;
    headerSetup.textContent = derived.setup === 'complete' ? 'Phone Setup ✓' : 'Prepare this phone';
  }
  const banner = document.querySelector('#companion-update-banner');
  if (banner) {
    banner.hidden = !derived.updateAvailable && derived.update !== 'failed';
    if (!banner.hidden) {
      banner.querySelector('strong').textContent = derived.updateAvailable ? 'Companion update downloaded' : 'Unable to check or apply update';
      banner.querySelector('p').textContent = derived.updateAvailable ? 'Restart to use the atomically verified app and trip-data package.' : 'The last complete offline package remains available. Retry with a reliable connection.';
      const button = banner.querySelector('button');
      button.dataset.action = derived.updateAvailable ? 'activate-update' : 'check-shared-update';
      button.textContent = derived.updateAvailable ? 'Restart to Use Update' : 'Retry Update Check';
    }
  }
  return derived;
}

export function renderCompanionOnboarding(stepIndex) {
  const bounded = Math.max(0, Math.min(stepIndex, onboardingSteps.length - 1));
  const step = onboardingSteps[bounded];
  document.querySelector('#companion-onboarding-kicker').textContent = `Step ${bounded + 1} of ${onboardingSteps.length}`;
  document.querySelector('#companion-onboarding-title').textContent = step.title;
  document.querySelector('#companion-onboarding-body').textContent = step.body();
  document.querySelector('#companion-onboarding-back').hidden = bounded === 0;
  document.querySelector('#companion-onboarding-next').textContent = bounded === onboardingSteps.length - 1 ? 'Finish' : 'Next';
}

export const companionOnboardingStepCount = onboardingSteps.length;
