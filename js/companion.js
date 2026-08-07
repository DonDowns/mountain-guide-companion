import { clearPrivateFields, createCompanionStore } from './companion-state.js';
import {
  installPromptAvailable, isIosBrowser, isStandalone, registerDevelopmentServiceWorker,
  requestInstall, sharePublicCompanion, watchInstallPrompt
} from './companion-install.js';
import {
  companionData, navigateTo, releaseMetadata, renderArtifacts, renderEmergency,
  refreshElapsed, renderRoutes, renderSetupPanel, renderStaticIdentity, renderTimeline, setRedDisplay, showToast
} from './companion-ui.js';

const store = createCompanionStore(companionData.objectives[0].id);
let editObjectiveId = '';
let offlineResult = null;

function setupOptions(state = store.getState()) {
  return {
    standalone: isStandalone(),
    ios: isIosBrowser(),
    promptAvailable: installPromptAvailable(),
    offlineResult,
    state
  };
}

function renderState(state = store.getState()) {
  renderTimeline(state, editObjectiveId);
  setRedDisplay(state.redDisplay);
  renderSetupPanel(document.querySelector('#install-panel'), setupOptions(state));
}

function structuralOfflineCheck() {
  const checks = [
    companionData.identity.manifestSha256 === releaseMetadata.manifest_sha256,
    companionData.objectives.length === 3,
    companionData.routes.length === 4,
    companionData.contacts.length === 3,
    companionData.contacts.flatMap(contact => contact.phones).length === 6,
    companionData.communication.milestones.length === 9,
    document.querySelector('#timeline-view')?.textContent.length > 100,
    document.querySelector('#route-view')?.textContent.length > 100,
    document.querySelector('#emergency-view')?.textContent.includes('CALL 911 FIRST')
  ];
  return checks.every(Boolean);
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
    offlineResult = { present: structuralOfflineCheck() };
    store.update(state => { state.setup.structuralCheckCompletedAt = new Date().toISOString(); });
    renderState();
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
registerDevelopmentServiceWorker();
store.subscribe(renderState);

globalThis.setInterval(() => refreshElapsed(store.getState()), 30000);
