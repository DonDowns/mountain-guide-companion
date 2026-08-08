import { clearPrivateFields, createCompanionStore } from './companion-state.js';
import {
  activateWaitingUpdate, installPromptAvailable, isIosBrowser, isStandalone, registerProductionServiceWorker,
  copyPreparedMessage, repairOfflineCopy, requestInstall, sharePreparedMessage, sharePublicCompanion,
  storageEstimate, verifyOfflineResources, watchInstallPrompt
} from './companion-install.js';
import {
  companionData, createMilestoneMessage, navigateHome, navigateTo, parseOperationalDateTimeInput, releaseMetadata,
  renderArtifacts, renderEmergency, renderObjectiveContext, refreshElapsed, renderRoutes, renderSetupPanel,
  renderStaticIdentity, renderTimeline, scrollCurrentViewToTop, setRedDisplay, showToast
} from './companion-ui.js';

const store = createCompanionStore(companionData.objectives[0].id);
let editObjectiveId = '';
let startObjectiveId = '';
let objectiveSelectorOpen = false;
let pendingObjectiveId = '';
let editMilestoneKey = '';
let offlineResult = { checking: true, complete: false };
let storageInfo = null;
let workerState = { supported: 'serviceWorker' in navigator, controlled: Boolean(navigator.serviceWorker?.controller), updateAvailable: false };

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
  for (const button of document.querySelectorAll('[data-action="open-companion"]')) {
    button.textContent = state.setup.companionOpened ? 'Resume Companion' : 'Open Companion';
  }
}

async function runOfflineCheck({ record = true } = {}) {
  offlineResult = { checking: true, complete: false };
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
  if (action === 'show-setup') {
    navigateHome({ focus: false });
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
    await runOfflineCheck();
  }
  if (action === 'repair-offline') {
    offlineResult = { checking: true, complete: false };
    renderState();
    if (!navigator.onLine) {
      offlineResult = { complete: false, error: 'Reconnect to the internet and retry Companion update/install.' };
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
}

renderStaticIdentity();
renderArtifacts();
renderRoutes();
renderEmergency();
renderState();
bindEvents();
watchInstallPrompt(() => renderState());
store.subscribe(renderState);

registerProductionServiceWorker(state => {
  workerState = state;
  renderState();
}).then(async registration => {
  if (registration) await runOfflineCheck({ record: false });
  else {
    offlineResult = { complete: false, error: 'Offline setup is unavailable.' };
    renderState();
  }
});

globalThis.setInterval(() => refreshElapsed(store.getState()), 30000);
