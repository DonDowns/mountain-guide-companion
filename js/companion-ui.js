import { companionData, releaseMetadata } from './companion-data.js';

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'checked') node.checked = Boolean(value);
    else if (key === 'value') node.value = value ?? '';
    else if (key.startsWith('aria-')) node.setAttribute(key, String(value));
    else if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  for (const child of children) node.append(child);
  return node;
}

function clearAndAppend(target, ...children) {
  target.replaceChildren(...children);
}

function formatTime(value) {
  const [hour, minute] = value.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function formatActualStart(value) {
  if (!value) return 'Not started on this device';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available on this device';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

function formatElapsed(value, now = Date.now()) {
  if (!value) return '—';
  const elapsed = Math.max(0, now - new Date(value).getTime());
  if (!Number.isFinite(elapsed)) return '—';
  const totalMinutes = Math.floor(elapsed / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

function objectiveRole(role) {
  return {
    approach: 'Approach / camp',
    primary: 'Primary summit combination',
    separate_planned: 'Separate objective'
  }[role] || 'Current objective';
}

function decisionLabel(dimension) {
  return {
    weather_evidence: 'Weather evidence',
    pace_group_weather: 'Pace, group, weather',
    route_exposure: 'Route and exposure',
    turnaround_descent: 'Turn or descend',
    access: 'Access and waiver'
  }[dimension] || 'Reassessment';
}

function setupItem(label, detail, complete) {
  const mark = element('span', { className: 'status-mark', 'aria-hidden': 'true', text: complete ? '✓' : '○' });
  const copy = element('span', {}, [element('strong', { text: label }), element('small', { text: detail })]);
  return element('li', { className: complete ? 'complete' : 'pending' }, [mark, copy]);
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return 'Not available';
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export function renderSetupPanel(target, options) {
  const airplaneInstructionsOpen = Boolean(target.querySelector('.airplane-test')?.open);
  const {
    standalone, ios, promptAvailable, offlineResult, storageInfo, workerState, state
  } = options;
  const eyebrow = element('p', { className: 'eyebrow', text: standalone ? 'INSTALLED COMPANION' : 'INSTALL FOR OFFLINE USE' });
  const heading = element('h2', { text: standalone ? 'Companion installed on this phone' : 'Set up this phone before the trip' });
  const intro = element('p', {
    text: standalone
      ? 'This standalone copy can verify its complete local field bundle. The physical Airplane Mode test remains a separate release gate.'
      : 'Install the Companion, open it once while online, and preserve a separate physical backup.'
  });
  const children = [eyebrow, heading, intro];

  if (!standalone && ios) {
    const instructions = [
      'Open this page in Safari.',
      'Tap the Share button.',
      'Choose Add to Home Screen.',
      'Open the installed Companion once while online.',
      'Run Offline Check.',
      'Perform the Airplane Mode verification before relying on offline use.'
    ].map(text => element('li', { text }));
    children.push(element('ol', { 'aria-label': 'iPhone installation steps' }, instructions));
  } else if (!standalone) {
    children.push(element('p', {
      text: promptAvailable
        ? 'This browser offers an install action. Install, then open the standalone Companion once while online.'
        : 'Use this browser’s install or Add to Home Screen command when available. iPhone installation must be completed from Safari’s Share menu.'
    }));
  }

  const checklist = element('ul', { className: 'setup-checklist', 'aria-label': 'Setup status' }, [
    setupItem('Installed / standalone detected', standalone ? 'Detected on this launch.' : 'Not detected in this browser tab.', standalone),
    setupItem('Trip data loaded', 'Canonical public trip data is present in the current shell.', true),
    setupItem('Emergency data loaded', `${companionData.contacts.length * 2} public contact numbers are present.`, companionData.contacts.length === 3),
    setupItem('Manifest verified', `Fingerprint ${companionData.identity.manifestShort}… matches runtime identity.`, companionData.identity.manifestSha256 === releaseMetadata.manifest_sha256),
    setupItem('Production service worker', workerState.controlled ? `Controls this page for ${releaseMetadata.bundle_id}.` : 'Not yet controlling this page.', workerState.controlled),
    setupItem('Offline resources verified', offlineResult?.complete ? `${offlineResult.entryCount} required resources match the active bundle.` : 'Run Offline Check after installation.', offlineResult?.complete === true),
    setupItem('Airplane Mode physical test', state.setup.airplaneModeTestCompletedAt ? `Recorded on this phone: ${formatActualStart(state.setup.airplaneModeTestCompletedAt)}.` : 'Physical cold-launch test still required.', Boolean(state.setup.airplaneModeTestCompletedAt))
  ]);
  children.push(checklist);

  if (offlineResult?.checking) {
    children.push(element('div', { className: 'offline-result', role: 'status' }, [
      element('strong', { text: 'CHECKING OFFLINE RESOURCES' }),
      element('p', { text: 'Verifying the active service worker, release identity, required resource count, and cached SHA-256 values.' })
    ]));
  } else if (offlineResult) {
    children.push(element('div', { className: 'offline-result', role: 'status' }, [
      element('strong', { text: offlineResult.complete ? 'OFFLINE RESOURCES VERIFIED' : 'OFFLINE RESOURCES INCOMPLETE' }),
      element('p', { text: offlineResult.complete
        ? `Active bundle ${offlineResult.bundleId} contains ${offlineResult.entryCount} verified required resources.`
        : offlineResult.error || 'The active local bundle did not verify.' }),
      element('p', { text: 'This verifies local Companion resources only. It does not verify mountain conditions, access, weather, or route safety.' }),
      ...(!offlineResult.complete ? [element('p', { className: 'boundary-note', text: 'Reconnect to the internet and retry Companion update/install.' })] : [])
    ]));
  }

  if (workerState.updateAvailable) {
    children.push(element('div', { className: 'update-note', role: 'status' }, [
      element('strong', { text: 'Update downloaded' }),
      element('p', { text: 'Restart Companion to use the newer verified release. The installed release remains available until then.' }),
      element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'activate-update' }, text: 'Restart to use update' })
    ]));
  }

  const airplaneSteps = [
    'Complete Offline Check while still connected.',
    'Close the Companion completely.',
    'Turn on Airplane Mode.',
    'Confirm Wi-Fi is also off if necessary.',
    'Reopen the installed Companion from the Home Screen.',
    'Open Timeline.',
    'Open Route.',
    'Open Emergency.',
    'Confirm the Field Guide opens.',
    'Confirm the Pocket Card opens.',
    'Return to the setup screen and record the test.'
  ].map(text => element('li', { text }));
  children.push(element('details', { className: 'airplane-test', open: airplaneInstructionsOpen || undefined }, [
    element('summary', { text: 'Airplane Mode test instructions' }),
    element('h3', { text: 'AIRPLANE MODE TEST' }),
    element('ol', {}, airplaneSteps),
    element('p', { className: 'boundary-note', text: 'Browser automation does not replace this physical-phone test.' })
  ]));

  if (storageInfo) {
    children.push(element('p', { className: 'storage-note', text: `Browser storage estimate: ${formatBytes(storageInfo.usage)} used of ${formatBytes(storageInfo.quota)}. Persistence ${storageInfo.persisted ? 'is reported by this browser' : 'is not guaranteed by this browser'}.` }));
  }

  const actions = [];
  if (!standalone && promptAvailable) actions.push(element('button', { className: 'install-button', type: 'button', dataset: { action: 'install' }, text: 'Install Companion' }));
  actions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'offline-check' }, text: 'Offline Check' }));
  actions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'repair-offline' }, text: 'Repair Offline Copy' }));
  actions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: state.setup.airplaneModeTestCompletedAt ? 'clear-airplane-test' : 'record-airplane-test' }, text: state.setup.airplaneModeTestCompletedAt ? 'Clear Airplane Mode Record' : 'Record Airplane Mode Test' }));
  actions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'share' }, text: 'Share Companion' }));
  children.push(element('div', { className: 'setup-actions' }, actions));
  children.push(element('p', { className: 'boundary-note', text: state.setup.offlineVerifiedAt && state.setup.offlineVerifiedBundleId === releaseMetadata.bundle_id
    ? `Offline bundle verification recorded on this device: ${formatActualStart(state.setup.offlineVerifiedAt)}.`
    : 'No successful Offline Check is recorded for this bundle on this device.' }));

  clearAndAppend(target, element('section', { className: 'setup-panel', dataset: { mode: standalone ? 'installed' : 'browser' }, 'aria-labelledby': 'setup-heading' }, children));
  target.querySelector('h2').id = 'setup-heading';
}

export function renderStaticIdentity() {
  document.querySelector('#trip-name').textContent = companionData.trip.name;
  document.querySelector('#weather-invariant').textContent = companionData.invariants.weather;
  document.querySelector('#delivery-disclaimer').textContent = companionData.communication.deliveryDisclaimer;
  document.querySelector('#jurisdiction-copy').textContent = `${companionData.invariants.jurisdiction} You do not need to choose a county before calling.`;
  const provenance = document.querySelector('#provenance');
  clearAndAppend(provenance,
    element('strong', { text: companionData.identity.releaseStatus === 'candidate' ? 'COMPANION CANDIDATE · PHYSICAL TESTING IN PROGRESS' : 'DRAFT COMPANION' }),
    element('span', { text: `Companion ${companionData.identity.companionVersion} · Trip Data v${companionData.identity.dataVersion}` }),
    element('span', { text: `Based on Mountain Guide ${companionData.identity.sourceRelease} · Verified ${formatDate(companionData.identity.verifiedAt)}` }),
    element('span', { text: `Manifest ${companionData.identity.manifestShort}…` })
  );
}

export function renderArtifacts() {
  const cards = [
    {
      title: 'Interactive Companion',
      description: 'Interactive operational reference.',
      action: element('button', { className: 'quiet-button', type: 'button', dataset: { action: 'open-companion' }, text: 'Open Companion' })
    },
    {
      title: '3-Page Field Guide',
      description: 'Printable physical backup.',
      action: element('a', { href: companionData.artifacts.fieldGuide.url, text: 'Open Field Guide' })
    },
    {
      title: 'Emergency Pocket Card',
      description: 'Compact emergency and communication backup.',
      action: element('a', { href: companionData.artifacts.pocketCard.url, text: 'Open Pocket Card' })
    }
  ].map(item => element('article', { className: 'artifact-card' }, [
    element('h3', { text: item.title }),
    element('p', { text: item.description }),
    item.action
  ]));
  clearAndAppend(document.querySelector('#artifact-cards'), ...cards);
}

export function renderTimeline(state, editObjectiveId = '') {
  const selectedId = companionData.objectives.some(item => item.id === state.selectedObjectiveId)
    ? state.selectedObjectiveId
    : companionData.objectives[0].id;
  const options = companionData.objectives.map(objective => {
    const radio = element('input', {
      type: 'radio', name: 'selected-objective', value: objective.id,
      checked: objective.id === selectedId, 'aria-label': `Select ${objective.name}`
    });
    return element('label', { className: 'objective-option' }, [
      radio,
      element('span', {}, [element('strong', { text: objective.name }), element('small', { text: objectiveRole(objective.role) })])
    ]);
  });
  clearAndAppend(document.querySelector('#objective-selector'), ...options);

  const objective = companionData.objectives.find(item => item.id === selectedId);
  const times = objective.planningTimes.map(time => element('div', { className: 'time-card' }, [
    element('span', { text: time.kind === 'planned_start' ? 'Planned Start' : 'Planning Target' }),
    element('strong', { text: formatTime(time.localTime) }),
    element('small', { text: time.label })
  ]));
  const actual = state.actualStarts[objective.id] || '';
  const actualCard = element('div', { className: 'actual-card' }, [
    element('span', { text: 'Actual start · local to this device' }),
    element('strong', { text: formatActualStart(actual) }),
    element('small', { dataset: { elapsedFor: objective.id }, text: actual ? `Elapsed ${formatElapsed(actual)}` : 'Planned start remains unchanged.' })
  ]);
  const actions = [
    element('button', { className: 'primary-button', type: 'button', dataset: { action: 'start-objective', objectiveId: objective.id }, text: actual ? 'Record new actual start' : 'Start Objective' })
  ];
  if (actual) {
    actions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'edit-start', objectiveId: objective.id }, text: 'Edit actual start' }));
    actions.push(element('button', { className: 'danger-button', type: 'button', dataset: { action: 'reset-start', objectiveId: objective.id }, text: 'Reset actual start' }));
  }
  const children = [
    element('p', { className: 'eyebrow', text: objectiveRole(objective.role).toUpperCase() }),
    element('h3', { text: objective.name }),
    element('p', { className: 'boundary-note', text: 'Planning targets remain planning values. Actual conditions govern the decision.' }),
    element('div', { className: 'time-grid' }, times), actualCard,
    element('div', { className: 'objective-actions' }, actions)
  ];

  if (editObjectiveId === objective.id) {
    const inputValue = actual ? new Date(new Date(actual).getTime() - new Date(actual).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    children.push(element('div', { className: 'edit-start' }, [
      element('label', {}, [element('span', { text: 'Actual start on this device' }), element('input', { id: 'actual-start-input', type: 'datetime-local', value: inputValue })]),
      element('div', { className: 'field-actions' }, [
        element('button', { className: 'primary-button', type: 'button', dataset: { action: 'save-start', objectiveId: objective.id }, text: 'Save actual start' }),
        element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'cancel-edit-start' }, text: 'Cancel' })
      ])
    ]));
  }
  clearAndAppend(document.querySelector('#selected-objective'), ...children);

  const decisions = companionData.decisions.map((decision, index) => {
    const summary = element('summary', { text: `Gate ${index + 1}: ${decisionLabel(decision.dimension)}`, 'aria-expanded': 'false' });
    return element('details', {}, [summary, element('p', { text: decision.prompt })]);
  });
  clearAndAppend(document.querySelector('#decision-gates'), ...decisions);

  const milestones = companionData.communication.milestones.map((label, index) => {
    const key = String(index);
    const checkbox = element('input', { type: 'checkbox', checked: state.checkedMilestones[key] === true, dataset: { milestone: key }, 'aria-label': `Mark ${label} locally` });
    return element('label', { className: 'milestone' }, [checkbox, element('span', {}, [element('strong', { text: label }), element('small', { text: checkbox.checked ? 'Marked locally only' : 'Not marked on this device' })])]);
  });
  clearAndAppend(document.querySelector('#milestone-list'), ...milestones);
  renderLocalOperations(state);
}

function renderLocalOperations(state) {
  const status = element('section', { className: 'status-note', 'aria-labelledby': 'local-status-title' }, [
    element('h3', { id: 'local-status-title', text: 'Brief local status note' }),
    element('p', { className: 'boundary-note', text: 'Stored only in this browser on this device. It is not monitored or shared.' }),
    element('label', {}, [element('span', { text: 'Local status' }), element('textarea', { name: 'statusNote', maxlength: '240', dataset: { localField: 'statusNote' }, value: state.statusNote })])
  ]);
  status.querySelector('textarea').value = state.statusNote;

  const contactFields = [
    ['name', 'Personal contact name', 'text'],
    ['phone', 'Phone', 'tel'],
    ['alternate', 'Alternate', 'text'],
    ['note', 'Brief private / personal note', 'textarea']
  ].map(([key, label, type]) => {
    const input = type === 'textarea'
      ? element('textarea', { name: key, maxlength: '500', dataset: { privateField: key } })
      : element('input', { name: key, type, maxlength: '120', dataset: { privateField: key } });
    input.value = state.privateContact[key];
    return element('label', {}, [element('span', { text: label }), input]);
  });
  const privateDetails = element('details', { className: 'private-details' }, [
    element('summary', { 'aria-expanded': 'false', text: 'Optional private fields on this device' }),
    element('div', { className: 'private-form' }, [
      element('p', { className: 'boundary-note', text: 'Empty by default. No cloud sync, sharing, logging, or public-manifest storage.' }),
      ...contactFields,
      element('button', { className: 'danger-button', type: 'button', dataset: { action: 'clear-private' }, text: 'Clear Private Data' })
    ])
  ]);
  clearAndAppend(document.querySelector('#local-operations'), status, privateDetails);
}

export function renderRoutes() {
  const cards = companionData.routes.map(route => {
    const stats = [
      ['Distance', `${route.distanceMiles} mi ${route.distanceScopeLabel}`],
      ['Gain', `${route.elevationGainFt.toLocaleString()} ft`],
      ['Class', route.difficulty],
      ['Exposure', route.exposure]
    ].map(([label, value]) => element('div', { className: 'stat' }, [element('span', { text: label }), element('strong', { text: value })]));
    return element('article', { className: 'route-card' }, [
      element('p', { className: 'eyebrow', text: objectiveRole(route.objectiveRole).toUpperCase() }),
      element('h3', { text: route.name }),
      element('div', { className: 'route-stats' }, stats),
      element('p', { text: route.notes }),
      element('p', { className: 'boundary-note', text: route.returnConsiderations })
    ]);
  });
  clearAndAppend(document.querySelector('#route-cards'), ...cards);
  const lily = companionData.lilyLake;
  const withheld = lily.latitude === null && lily.longitude === null && lily.elevationFt === null;
  const note = withheld
    ? `${lily.name}: Exact canonical coordinate/elevation pending final verification. No emergency location is provided here.`
    : `${lily.name}: canonical location is available in the current data version.`;
  clearAndAppend(document.querySelector('#lily-status'), element('strong', { text: 'Location hold' }), element('p', { text: note }));
}

export function renderEmergency() {
  const cards = companionData.contacts.map(contact => {
    const phones = contact.phones.map(phone => element('a', { className: 'phone-link', href: phone.tel }, [
      element('span', {}, [element('small', { text: phone.label }), element('strong', { text: phone.display })]),
      element('span', { 'aria-hidden': 'true', text: 'Call' })
    ]));
    return element('article', { className: 'contact-card' }, [
      element('h3', { text: contact.agency }),
      element('p', { text: contact.geographicContext }),
      ...phones,
      element('p', { className: 'boundary-note', text: 'Opening a phone intent does not prove that a call occurred.' })
    ]);
  });
  clearAndAppend(document.querySelector('#emergency-contacts'), ...cards);
}

export function setRedDisplay(enabled) {
  document.documentElement.dataset.display = enabled ? 'red' : 'daylight';
  document.documentElement.style.background = enabled ? '#100000' : '';
  document.documentElement.style.colorScheme = enabled ? 'dark' : 'light';
  const button = document.querySelector('[data-action="toggle-red"]');
  button.setAttribute('aria-pressed', String(enabled));
  document.querySelector('meta[name="theme-color"]').content = enabled ? '#100000' : '#163d46';
}

export function navigateTo(view) {
  for (const section of document.querySelectorAll('[data-view]')) section.hidden = section.dataset.view !== view;
  for (const button of document.querySelectorAll('[data-nav]')) {
    if (button.dataset.nav === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  const target = document.querySelector(`[data-view="${view}"]`);
  globalThis.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  target?.focus?.({ preventScroll: true });
}

export function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.hidden = false;
  globalThis.clearTimeout(showToast.timeout);
  showToast.timeout = globalThis.setTimeout(() => { toast.hidden = true; }, 3200);
}

export function refreshElapsed(state) {
  const node = document.querySelector('[data-elapsed-for]');
  if (!node) return;
  const actual = state.actualStarts[node.dataset.elapsedFor] || '';
  node.textContent = actual ? `Elapsed ${formatElapsed(actual)}` : 'Planned start remains unchanged.';
}

export { companionData, releaseMetadata };
