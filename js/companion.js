import { clearPrivateFields, createCompanionStore } from './companion-state.js';
import {
  activateWaitingUpdate, checkForCompanionUpdate, installPromptAvailable, isIosBrowser, isStandalone, registerProductionServiceWorker,
  copyPreparedMessage, repairOfflineCopy, requestInstall, sharePreparedMessage, sharePublicCompanion,
  storageEstimate, verifyOfflineResources, watchInstallPrompt
} from './companion-install.js';
import {
  buildCompanionDiagnostics, buildFeatureRequest, buildProblemReport, companionOnboardingStepCount,
  COMPANION_ONBOARDING_VERSION, deriveCompanionStatus, renderCompanionHelpTopics, renderCompanionOnboarding,
  renderCompanionSupportStatus
} from './companion-help.js';
import {
  companionData, createMilestoneMessage, navigateHome, navigateTo, parseOperationalDateTimeInput, releaseMetadata,
  renderArtifacts, renderCompanionHome, renderEmergency, renderObjectiveContext, refreshElapsed, renderRoutes, renderSetupPanel,
  renderStaticIdentity, renderTimeline, scrollCurrentViewToTop, setRedDisplay, showToast
} from './companion-ui.js';

const store = createCompanionStore(companionData.objectives[0].id);
let editObjectiveId = '';
let startObjectiveId = '';
let objectiveSelectorOpen = false;
let pendingObjectiveId = '';
let editMilestoneKey = '';
let offlineResult = { checking: true, complete: false, attempted: false };
let storageInfo = null;
let workerState = { supported: 'serviceWorker' in navigator, controlled: Boolean(navigator.serviceWorker?.controller), updateAvailable: false, updateStatus: 'current' };
let setupPanelRequested = false;
let onboardingStep = 0;
let onboardingReturnFocus = null;

function setupOptions(state = store.getState()) {
  return {
    standalone: isStandalone(),
    ios: isIosBrowser(),
    promptAvailable: installPromptAvailable(),
    offlineResult,
    storageInfo,
    workerState,
    state
  };
}

function renderState(state = store.getState()) {
  renderTimeline(state, { editObjectiveId, startObjectiveId, objectiveSelectorOpen, pendingObjectiveId, editMilestoneKey });
  renderObjectiveContext(state);
  setRedDisplay(state.redDisplay);
  renderSetupPanel(document.querySelector('#install-panel'), setupOptions(state));
  const derived = renderCompanionSupportStatus(setupOptions(state));
  document.querySelector('#install-panel').hidden = derived.setup === 'complete' && !setupPanelRequested;
  renderCompanionHome(store.getState(), isStandalone(), workerState, offlineResult);
}

function setOnboardingBackgroundInert(inert) {
  for (const child of document.body.children) {
    if (child.id === 'companion-onboarding' || child.tagName === 'SCRIPT') continue;
    if (inert && !child.inert) {
      child.inert = true;
      child.dataset.onboardingInert = 'true';
    } else if (!inert && child.dataset.onboardingInert === 'true') {
      child.inert = false;
      delete child.dataset.onboardingInert;
    }
  }
}

function openOnboarding(trigger = null) {
  const overlay = document.querySelector('#companion-onboarding');
  if (!overlay) return;
  const active = trigger || document.activeElement;
  onboardingReturnFocus = active && active !== document.body ? active : document.querySelector('#home-primary-action');
  onboardingStep = 0;
  renderCompanionOnboarding(onboardingStep);
  overlay.hidden = false;
  setOnboardingBackgroundInert(true);
  document.body.style.overflow = 'hidden';
  globalThis.setTimeout(() => document.querySelector('#companion-onboarding-next')?.focus(), 0);
}

function closeOnboarding(status) {
  const overlay = document.querySelector('#companion-onboarding');
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  setOnboardingBackgroundInert(false);
  document.body.style.overflow = '';
  store.update(state => {
    state.setup.onboarding = { version: COMPANION_ONBOARDING_VERSION, status, recordedAt: new Date().toISOString() };
  });
  const target = onboardingReturnFocus?.isConnected ? onboardingReturnFocus : document.querySelector('#home-primary-action');
  target?.focus?.({ preventScroll: true });
}

async function copySupportText(text, previewSelector, statusSelector) {
  const result = await copyPreparedMessage(text);
  const preview = document.querySelector(previewSelector);
  preview.textContent = text;
  preview.hidden = false;
  document.querySelector(statusSelector).textContent = result.completed
    ? 'Structured text copied. Paste it into the support channel you choose.'
    : 'Automatic copy was unavailable. Select and copy the preview below.';
  return result;
}

async function runOfflineCheck({ record = true } = {}) {
  offlineResult = { checking: true, complete: false, attempted: true };
  renderState();
  const workerResult = await verifyOfflineResources();
  const runtimeChecks = [
    workerResult.complete === true,
    workerResult.bundleId === releaseMetadata.bundle_id,
    workerResult.identity?.manifestSha256 === companionData.identity.manifestSha256,
    workerResult.identity?.dataVersion === companionData.identity.dataVersion,
    workerResult.identity?.sourceRelease === companionData.identity.sourceRelease,
    workerResult.identity?.sourceCommit === companionData.identity.sourceCommit,
    Number.isInteger(workerResult.entryCount) && workerResult.entryCount > 0,
    workerResult.emergencyPhoneCount === 6,
    workerResult.pdfsPresent === true,
    companionData.contacts.flatMap(contact => contact.phones).length === 6,
    document.querySelector('#timeline-view')?.textContent.length > 100,
    document.querySelector('#route-view')?.textContent.length > 100,
    document.querySelector('#emergency-view')?.textContent.includes('CALL 911 FIRST')
  ];
  offlineResult = {
    ...workerResult,
    attempted: true,
    complete: runtimeChecks.every(Boolean),
    error: runtimeChecks.every(Boolean) ? '' : workerResult.error || 'Required Companion resources did not verify.'
  };
  if (record) {
    store.update(state => {
      state.setup.offlineVerifiedAt = offlineResult.complete ? new Date().toISOString() : '';
      state.setup.offlineVerifiedBundleId = offlineResult.complete ? releaseMetadata.bundle_id : '';
    });
  } else {
    renderState();
  }
  storageInfo = await storageEstimate();
  renderState();
  return offlineResult;
}

function recordActualStart(objectiveId, date = new Date()) {
  const startedAt = date.toISOString();
  store.update(state => {
    state.actualStarts[objectiveId] = startedAt;
    state.elapsedBasis[objectiveId] = {
      startedAt,
      deviceTimeZoneOffsetMinutes: date.getTimezoneOffset()
    };
  });
}

async function handleAction(action, button) {
  if (action === 'open-companion') {
    store.update(state => { state.setup.companionOpened = true; });
    navigateTo('timeline');
    document.querySelector('#app-main').focus({ preventScroll: true });
  }
  if (action === 'home') {
    editObjectiveId = '';
    startObjectiveId = '';
    objectiveSelectorOpen = false;
    pendingObjectiveId = '';
    editMilestoneKey = '';
    navigateHome();
  }
  if (action === 'open-artifact') {
    const url = button.dataset.url;
    document.querySelector('#artifact-frame').src = url;
    navigateTo('artifact');
    history.pushState({ artifact: url }, '', '#artifact=' + encodeURIComponent(url));
  }
  if (action === 'back-to-companion') {
    if (history.length > 1) {
      history.back();
    } else {
      navigateHome();
      document.querySelector('#artifact-cards')?.scrollIntoView();
    }
  }
  if (action === 'show-setup') {
    setupPanelRequested = true;
    navigateHome({ focus: false });
    renderState();
    document.querySelector('#install-panel').scrollIntoView({ block: 'start' });
  }
  if (action === 'top') scrollCurrentViewToTop();
  if (action === 'toggle-red') {
    store.update(state => { state.redDisplay = !state.redDisplay; });
  }
  if (action === 'share') {
    const result = await sharePublicCompanion(releaseMetadata.pwa_url, 'Mountain Guide Companion');
    if (result.completed) showToast(result.method === 'share' ? 'Share sheet opened with the public Companion link.' : 'Public Companion link copied.');
  }
  if (action === 'install') {
    const result = await requestInstall();
    renderState();
    showToast(result.outcome === 'accepted' ? 'Install accepted. Open the installed Companion once while online.' : 'Install was not completed.');
  }
  if (action === 'offline-check') {
    setupPanelRequested = true;
    await runOfflineCheck();
  }
  if (action === 'repair-offline') {
    offlineResult = { checking: true, complete: false, attempted: true };
    renderState();
    if (!navigator.onLine) {
      offlineResult = { complete: false, attempted: true, error: 'Reconnect to the internet and retry Companion update/install.' };
      renderState();
      return;
    }
    const result = await repairOfflineCopy();
    offlineResult = result;
    await runOfflineCheck();
  }
  if (action === 'record-airplane-test') {
    if (!globalThis.confirm('Record that you completed every Airplane Mode test step on this phone? This is a local record, not a check of mountain conditions.')) return;
    store.update(state => { state.setup.airplaneModeTestCompletedAt = new Date().toISOString(); });
  }
  if (action === 'clear-airplane-test') {
    if (!globalThis.confirm('Clear the recorded Airplane Mode test from this phone?')) return;
    store.update(state => { state.setup.airplaneModeTestCompletedAt = ''; });
  }
  if (action === 'activate-update') {
    const activated = await activateWaitingUpdate();
    if (!activated) showToast('No downloaded update is waiting.');
  }
  if (action === 'check-shared-update') {
    const result = await checkForCompanionUpdate();
    if (result.status === 'current') showToast('No newer verified package is downloaded. Recheck changing facts before departure.');
    if (result.status === 'offline') showToast('Update check unavailable offline. The last complete package remains available.');
    if (result.status === 'failed') showToast('Update check failed. The last complete package remains available.');
  }
  if (action === 'replay-tutorial') openOnboarding(button);
  if (action === 'tutorial-back') {
    onboardingStep = Math.max(0, onboardingStep - 1);
    renderCompanionOnboarding(onboardingStep);
  }
  if (action === 'tutorial-next') {
    if (onboardingStep < companionOnboardingStepCount - 1) {
      onboardingStep += 1;
      renderCompanionOnboarding(onboardingStep);
    } else closeOnboarding('completed');
  }
  if (action === 'dismiss-tutorial') closeOnboarding('dismissed');
  if (action === 'copy-problem-report') {
    const report = buildProblemReport({
      section: document.querySelector('#problem-section').value,
      description: document.querySelector('#problem-description').value,
      steps: document.querySelector('#problem-steps').value
    }, buildCompanionDiagnostics(setupOptions()));
    await copySupportText(report, '#problem-report-preview', '#problem-report-status');
  }
  if (action === 'copy-feature-request') {
    const report = buildFeatureRequest({
      problem: document.querySelector('#feature-problem').value,
      who: document.querySelector('#feature-who').value,
      when: document.querySelector('#feature-when').value,
      frequency: document.querySelector('#feature-frequency').value,
      behavior: document.querySelector('#feature-behavior').value
    });
    await copySupportText(report, '#feature-request-preview', '#feature-request-status');
  }
  if (action === 'start-objective') {
    startObjectiveId = button.dataset.objectiveId;
    editObjectiveId = '';
    renderState();
    document.querySelector('.start-confirmation')?.focus?.();
  }
  if (action === 'back-from-start') {
    startObjectiveId = '';
    renderState();
    document.querySelector('[data-action="start-objective"]')?.focus();
  }
  if (action === 'confirm-start') {
    startObjectiveId = '';
    recordActualStart(button.dataset.objectiveId);
    showToast('Actual start recorded on this phone.');
  }
  if (action === 'resume-objective') {
    const target = document.querySelector('.decision-section');
    target?.scrollIntoView({ block: 'start' });
    target?.focus?.({ preventScroll: true });
  }
  if (action === 'replace-start') {
    if (!globalThis.confirm('Replace the existing actual start and elapsed basis with the current time?')) return;
    recordActualStart(button.dataset.objectiveId);
    showToast('Actual start replaced with the current time.');
  }
  if (action === 'edit-start') {
    editObjectiveId = button.dataset.objectiveId;
    startObjectiveId = '';
    renderState();
    document.querySelector('#actual-start-input')?.focus();
  }
  if (action === 'cancel-edit-start') {
    editObjectiveId = '';
    renderState();
  }
  if (action === 'save-start') {
    const input = document.querySelector('#actual-start-input');
    const parsed = parseOperationalDateTimeInput(input?.value || '');
    if (!parsed || Number.isNaN(parsed.getTime())) {
      showToast('Enter an actual start date and time.');
      return;
    }
    editObjectiveId = '';
    recordActualStart(button.dataset.objectiveId, parsed);
  }
  if (action === 'reset-start') {
    if (!globalThis.confirm('Reset this objective’s actual start and elapsed basis on this phone? This removes the saved start time.')) return;
    editObjectiveId = '';
    store.update(state => {
      delete state.actualStarts[button.dataset.objectiveId];
      delete state.elapsedBasis[button.dataset.objectiveId];
    });
  }
  if (action === 'change-objective') {
    navigateTo('timeline');
    objectiveSelectorOpen = true;
    pendingObjectiveId = store.getState().selectedObjectiveId;
    editObjectiveId = '';
    startObjectiveId = '';
    renderState();
    document.querySelector('[name="pending-objective"]:checked')?.focus();
  }
  if (action === 'confirm-objective') {
    const objective = companionData.objectives.find(item => item.id === pendingObjectiveId);
    if (!objective) return;
    objectiveSelectorOpen = false;
    pendingObjectiveId = '';
    editObjectiveId = '';
    startObjectiveId = '';
    store.update(state => { state.selectedObjectiveId = objective.id; });
    showToast(`Current objective: ${objective.name}. Saved state was preserved.`);
  }
  if (action === 'cancel-objective') {
    objectiveSelectorOpen = false;
    pendingObjectiveId = '';
    renderState();
    document.querySelector('[data-action="change-objective"]')?.focus();
  }
  if (action === 'mark-milestone') {
    const markedAt = new Date().toISOString();
    store.update(state => {
      state.checkedMilestones[button.dataset.milestone] = true;
      state.milestoneMarks[button.dataset.milestone] = markedAt;
    });
  }
  if (action === 'clear-milestone') {
    editMilestoneKey = '';
    store.update(state => {
      delete state.checkedMilestones[button.dataset.milestone];
      delete state.milestoneMarks[button.dataset.milestone];
    });
    showToast('Local milestone mark removed.');
  }
  if (action === 'edit-milestone') {
    editMilestoneKey = button.dataset.milestone;
    renderState();
    document.querySelector(`#milestone-time-${editMilestoneKey}`)?.focus();
  }
  if (action === 'cancel-milestone-edit') {
    editMilestoneKey = '';
    renderState();
  }
  if (action === 'save-milestone') {
    const key = button.dataset.milestone;
    const parsed = parseOperationalDateTimeInput(document.querySelector(`#milestone-time-${key}`)?.value || '');
    if (!parsed) {
      showToast('Enter a local milestone date and time.');
      return;
    }
    editMilestoneKey = '';
    store.update(state => {
      state.checkedMilestones[key] = true;
      state.milestoneMarks[key] = parsed.toISOString();
    });
  }
  if (action === 'copy-message' || action === 'share-message') {
    const milestoneIndex = Number(button.dataset.milestone);
    const state = store.getState();
    const message = createMilestoneMessage(milestoneIndex, state.selectedObjectiveId, new Date());
    if (action === 'copy-message') {
      const result = await copyPreparedMessage(message);
      showToast(result.completed ? 'Message copied.' : 'Copy the prepared message from the prompt.');
    } else {
      const result = await sharePreparedMessage(message);
      if (result.method === 'share' && result.completed) showToast('Confirm delivery in the sending app.');
      else if (result.cancelled) showToast('Share canceled. Milestone unchanged.');
      else if (result.completed) showToast('Message copied. Share is unavailable on this device.');
      else showToast('Copy the prepared message from the prompt.');
    }
  }
  if (action === 'clear-private') {
    if (!globalThis.confirm('Clear all optional private contact fields on this device?')) return;
    store.update(clearPrivateFields);
    showToast('Private fields cleared from this device.');
  }
}

function bindEvents() {
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-nav]');
    if (nav) {
      document.body.classList.add('companion-open');
      document.body.getBoundingClientRect();
      navigateTo(nav.dataset.nav);
      return;
    }
    const button = event.target.closest('[data-action]');
    if (button) {
      event.preventDefault();
      handleAction(button.dataset.action, button);
    }
  });

  document.addEventListener('change', event => {
    if (event.target.name === 'pending-objective') pendingObjectiveId = event.target.value;
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'companion-help-search') renderCompanionHelpTopics(event.target.value);
    if (event.target.matches('[data-local-field="statusNote"]')) {
      const value = event.target.value;
      store.update(state => { state.statusNote = value; }, { notify: false });
    }
    if (event.target.matches('[data-private-field]')) {
      const key = event.target.dataset.privateField;
      const value = event.target.value;
      store.update(state => { state.privateContact[key] = value; }, { notify: false });
    }
  });

  document.addEventListener('toggle', event => {
    if (event.target.matches('details')) {
      event.target.querySelector(':scope > summary')?.setAttribute('aria-expanded', String(event.target.open));
    }
  }, true);

  const searchInput = document.querySelector('#companion-help-search');
  const clearSearchBtn = document.querySelector('#clear-help-search');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      renderCompanionHelpTopics(event.target.value);
      if (clearSearchBtn) {
        clearSearchBtn.hidden = event.target.value.length === 0;
      }
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        renderCompanionHelpTopics(searchInput.value);
        searchInput.blur();
      }
    });
  }
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        renderCompanionHelpTopics('');
        clearSearchBtn.hidden = true;
        searchInput.focus();
      }
    });
  }

  document.addEventListener('keydown', event => {
    const overlay = document.querySelector('#companion-onboarding');
    if (!overlay || overlay.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeOnboarding('dismissed');
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...overlay.querySelectorAll('button:not([hidden]):not([disabled])')];
    const first = controls[0];
    const last = controls.at(-1);
    if (!controls.includes(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

renderStaticIdentity();
renderArtifacts();
renderRoutes();
renderEmergency();
renderCompanionHelpTopics();
renderState();
bindEvents();
watchInstallPrompt(() => renderState());
store.subscribe(renderState);

if (store.getState().setup.onboarding.version !== COMPANION_ONBOARDING_VERSION) {
  globalThis.setTimeout(() => openOnboarding(), 0);
}

const initialHash = globalThis.location.hash;
if (initialHash.startsWith('#artifact=')) {
  const url = decodeURIComponent(initialHash.slice(10));
  document.querySelector('#artifact-frame').src = url;
  navigateTo('artifact');
}

globalThis.addEventListener('online', () => renderState());
globalThis.addEventListener('offline', () => renderState());

globalThis.addEventListener('popstate', (event) => {
  const hash = globalThis.location.hash;
  if (hash.startsWith('#artifact=')) {
    const url = decodeURIComponent(hash.slice(10));
    document.querySelector('#artifact-frame').src = url;
    navigateTo('artifact');
  } else if (document.querySelector('#artifact-view:not([hidden])')) {
    navigateHome();
    document.querySelector('#artifact-cards')?.scrollIntoView();
  }
});

registerProductionServiceWorker(state => {
  workerState = state;
  renderState();
}).then(async registration => {
  if (registration) await runOfflineCheck({ record: false });
  else {
    offlineResult = { complete: false, attempted: true, error: 'Offline setup is unavailable.' };
    renderState();
  }
});

globalThis.setInterval(() => refreshElapsed(store.getState()), 30000);
