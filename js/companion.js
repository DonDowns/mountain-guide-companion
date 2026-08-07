import { clearPrivateFields, createCompanionStore } from './companion-state.js';
import {
  activateWaitingUpdate, installPromptAvailable, isIosBrowser, isStandalone, registerProductionServiceWorker,
  repairOfflineCopy, requestInstall, sharePublicCompanion, storageEstimate, verifyOfflineResources, watchInstallPrompt
} from './companion-install.js';
import {
  companionData, navigateTo, releaseMetadata, renderArtifacts, renderEmergency,
  refreshElapsed, renderRoutes, renderSetupPanel, renderStaticIdentity, renderTimeline, setRedDisplay, showToast
} from './companion-ui.js';

const store = createCompanionStore(companionData.objectives[0].id);
let editObjectiveId = '';
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
  renderTimeline(state, editObjectiveId);
  setRedDisplay(state.redDisplay);
  renderSetupPanel(document.querySelector('#install-panel'), setupOptions(state));
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
    error: runtimeChecks.every(Boolean) ? '' : workerResult.error || 'Active release identity or required field resources did not verify.'
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
    document.body.classList.add('companion-open');
    store.update(state => { state.setup.companionOpened = true; });
    navigateTo('timeline');
    document.querySelector('#app-main').focus();
  }
  if (action === 'show-setup') {
    document.body.classList.remove('companion-open');
    document.querySelector('#install-panel').scrollIntoView({ block: 'start' });
  }
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
    if (!globalThis.confirm('Record that you personally completed every Airplane Mode test step on this phone? This records your statement only and does not verify mountain conditions, access, weather, or route safety.')) return;
    store.update(state => { state.setup.airplaneModeTestCompletedAt = new Date().toISOString(); });
  }
  if (action === 'clear-airplane-test') {
    if (!globalThis.confirm('Clear the recorded Airplane Mode test from this phone?')) return;
    store.update(state => { state.setup.airplaneModeTestCompletedAt = ''; });
  }
  if (action === 'activate-update') {
    navigator.serviceWorker?.addEventListener('controllerchange', () => location.reload(), { once: true });
    await activateWaitingUpdate();
  }
  if (action === 'start-objective') {
    recordActualStart(button.dataset.objectiveId);
    editObjectiveId = '';
  }
  if (action === 'edit-start') {
    editObjectiveId = button.dataset.objectiveId;
    renderState();
    document.querySelector('#actual-start-input')?.focus();
  }
  if (action === 'cancel-edit-start') {
    editObjectiveId = '';
    renderState();
  }
  if (action === 'save-start') {
    const input = document.querySelector('#actual-start-input');
    const parsed = input?.value ? new Date(input.value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      showToast('Enter an actual start date and time.');
      return;
    }
    recordActualStart(button.dataset.objectiveId, parsed);
    editObjectiveId = '';
  }
  if (action === 'reset-start') {
    if (!globalThis.confirm('Clear the actual start and elapsed basis for this objective on this device?')) return;
    store.update(state => {
      delete state.actualStarts[button.dataset.objectiveId];
      delete state.elapsedBasis[button.dataset.objectiveId];
    });
    editObjectiveId = '';
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
      navigateTo(nav.dataset.nav);
      return;
    }
    const button = event.target.closest('[data-action]');
    if (button) handleAction(button.dataset.action, button);
  });

  document.addEventListener('change', event => {
    if (event.target.name === 'selected-objective') {
      store.update(state => { state.selectedObjectiveId = event.target.value; });
      editObjectiveId = '';
    }
    if (event.target.matches('[data-milestone]')) {
      store.update(state => { state.checkedMilestones[event.target.dataset.milestone] = event.target.checked; });
    }
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
    offlineResult = { complete: false, error: 'Production service worker is unavailable.' };
    renderState();
  }
});

globalThis.setInterval(() => refreshElapsed(store.getState()), 30000);
