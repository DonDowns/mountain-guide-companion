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
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: companionData.trip.timezone, timeZoneName: 'short'
  }).format(date);
}

export function formatOperationalTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'time unavailable';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: companionData.trip.timezone, timeZoneName: 'short'
  }).format(date);
}

function operationalParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: companionData.trip.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  return Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

export function formatOperationalDateTimeInput(value) {
  const parts = operationalParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function operationalOffsetMilliseconds(date) {
  const parts = operationalParts(date);
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return asUtc - date.getTime();
}

export function parseOperationalDateTimeInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const wallClock = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let result = new Date(wallClock);
  for (let attempt = 0; attempt < 2; attempt += 1) result = new Date(wallClock - operationalOffsetMilliseconds(result));
  return Number.isNaN(result.getTime()) ? null : result;
}

export function createMilestoneMessage(index, objectiveId, value = new Date()) {
  const objective = companionData.objectives.find(item => item.id === objectiveId) || companionData.objectives[0];
  const time = formatOperationalTime(value);
  const templates = [
    () => `Leaving the vehicle for ${objective.name} at ${time}. I’ll check in again at the next planned milestone.`,
    () => `At Lake Como camp at ${time}.`,
    () => `Starting ${objective.name} at ${time}.`,
    () => `At the summit or high point for ${objective.name} at ${time}. Beginning the return.`,
    () => `Below exposed high terrain at ${time} and continuing down.`,
    () => `Back at Lake Como camp at ${time}.`,
    () => `Back at the vehicle at ${time}.`,
    () => `Through Fort Garland at ${time} and heading home.`,
    () => `Home at ${time}.`
  ];
  if (!templates[index]) throw new Error('Unknown communication milestone');
  return templates[index]();
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

function setupItem(label, complete, detail = '') {
  const mark = element('span', { className: 'status-mark', 'aria-hidden': 'true', text: complete ? '✓' : '○' });
  const copy = element('span', {}, [element('strong', { text: label }), ...(detail ? [element('small', { text: detail })] : [])]);
  return element('li', { className: complete ? 'complete' : 'pending' }, [mark, copy]);
}

export function isMountainGuideReferrer(referrer = document.referrer) {
  try {
    return new URL(referrer).origin === 'https://mountainguide.vondadowns.com';
  } catch {
    return false;
  }
}

export function renderCompanionHome(state, standalone, workerState, offlineResult) {
  document.querySelector('#welcome-eyebrow').textContent = standalone ? 'CURRENT TRIP' : 'MOUNTAIN GUIDE COMPANION';
  document.querySelector('#welcome-title').textContent = standalone ? 'Companion Home' : 'Prepare This Phone';
  document.querySelector('#welcome-summary').textContent = standalone
    ? 'Open the trip companion, verify the offline copy, or use the Field Guide and Pocket Card.'
    : 'Recommended for trip partners. This keeps the trip plan, emergency information, communication milestones, Field Guide, and Pocket Card available when there is no service.';

  const primary = document.querySelector('#home-primary-action');
  const secondary = document.querySelector('#home-secondary-action');
  if (standalone) {
    primary.dataset.action = 'open-companion';
    primary.textContent = 'Open Trip Timeline';
    secondary.dataset.action = 'offline-check';
    secondary.textContent = 'Run Offline Check';
  } else {
    primary.dataset.action = 'show-setup';
    primary.textContent = 'Install for Offline Use';
    secondary.dataset.action = 'open-companion';
    secondary.textContent = state.setup.companionOpened ? 'Open Trip Timeline' : 'Continue in Browser';
  }

  for (const button of document.querySelectorAll('.artifact-open')) {
    button.textContent = 'Open Trip Timeline';
  }
}

export function renderSetupPanel(target, options) {
  const {
    standalone, ios, promptAvailable, offlineResult, workerState, state
  } = options;
  const offlineVerified = offlineResult?.complete === true;
  const controlled = workerState.controlled === true;
  const airplaneRecorded = Boolean(state.setup.airplaneModeTestCompletedAt);
  const allGatesComplete = standalone && controlled && offlineVerified && airplaneRecorded;
  const eyebrow = element('p', { className: 'eyebrow', text: standalone ? 'OFFLINE SETUP' : 'RECOMMENDED FOR TRIP PARTNERS' });
  const heading = element('h2', { text: allGatesComplete ? 'This Phone Is Ready for Offline Use ✓' : standalone ? 'Finish Preparing This Phone for Offline Use' : 'Phone Setup for Offline Use' });
  const intro = element('p', {
    text: standalone
      ? 'Run Offline Check, then complete the Airplane Mode test on this phone.'
      : 'Install for offline use so key trip and emergency information remains available when there is no service.'
  });
  const children = [eyebrow, heading, intro];

  if (!standalone && ios) {
    const instructions = [
      'Open in Safari.',
      'Tap Share.',
      'Add to Home Screen.',
      'Open Companion once while online.',
      'Run Offline Check.',
      'Test in Airplane Mode.'
    ].map(text => element('li', { text }));
    children.push(element('ol', { 'aria-label': 'iPhone installation steps' }, instructions));
  } else if (!standalone) {
    children.push(element('p', {
      text: promptAvailable
        ? 'Install, then open Companion once while online.'
        : 'On iPhone, open this page in Safari and use Share → Add to Home Screen.'
    }));
  }

  const setupList = element('ul', { className: 'setup-checklist', 'aria-label': 'Setup status' }, [
    setupItem('Running from Home Screen', standalone),
    setupItem('Offline control active', controlled)
  ]);

  if (offlineResult?.checking && !offlineVerified) {
    setupList.append(element('li', { className: 'pending' }, [
      element('span', { ariaHidden: 'true', text: '○' }),
      element('span', { text: 'Checking this phone…' })
    ]));
  } else if (!offlineVerified) {
    setupList.append(setupItem('Offline resources verified', false));
  } else {
    setupList.append(setupItem('Offline resources verified', true));
  }

  setupList.append(setupItem(
    airplaneRecorded ? 'Airplane Mode Test Recorded ✓' : 'Airplane Mode Test Required',
    airplaneRecorded,
    airplaneRecorded ? `Recorded on this phone: ${formatActualStart(state.setup.airplaneModeTestCompletedAt)}.` : 'Complete the physical Airplane Mode test on this phone.'
  ));

  children.push(setupList);
  children.push(element('p', { className: 'boundary-note setup-boundary', text: 'Offline Check confirms the required Companion resources are stored on this phone. It does not evaluate weather, access, terrain, or route conditions. This confirms phone/offline preparation only and does not evaluate weather, access, terrain, route conditions, mountain safety, or permission to proceed.' }));

  if (offlineResult && !offlineResult.checking && !offlineVerified && offlineResult.attempted) {
    children.push(element('div', { className: 'offline-result', role: 'status' }, [
      element('strong', { text: 'OFFLINE RESOURCES INCOMPLETE' }),
      element('p', { text: offlineResult.error || 'The offline resources did not verify.' }),
      element('p', { className: 'boundary-note', text: 'Reconnect to the internet and retry Companion update/install.' })
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
    'Open Help and search for offline recovery.',
    'Confirm the Field Guide opens.',
    'Confirm the Pocket Card opens.',
    'Return to the setup screen and record the test.'
  ].map(text => element('li', { text }));
  children.push(element('details', { className: 'airplane-test', open: (!airplaneRecorded && offlineVerified) || undefined }, [
    element('summary', { text: 'View Airplane Mode Test Steps' }),
    element('h3', { text: 'AIRPLANE MODE TEST' }),
    element('ol', {}, airplaneSteps),
    element('p', { className: 'boundary-note', text: 'Each phone must complete its own Offline Check and Airplane Mode test.' })
  ]));

  const actions = [];
  const secondaryActions = [];

  if (!standalone && promptAvailable) {
    actions.push(element('button', { className: 'primary-button install-button', type: 'button', dataset: { action: 'install' }, text: 'Install for Offline Use' }));
  }
  
  if (standalone && !offlineVerified) {
    actions.push(element('button', { className: 'primary-button', type: 'button', dataset: { action: 'offline-check' }, text: 'Run Offline Check' }));
  } else if (standalone && offlineVerified) {
    secondaryActions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'offline-check' }, text: 'Run Offline Check' }));
  } else if (!standalone) {
    secondaryActions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'offline-check' }, text: 'Run Offline Check' }));
  }

  if (standalone && controlled && offlineVerified && !airplaneRecorded) {
    actions.push(element('button', { className: 'primary-button', type: 'button', dataset: { action: 'record-airplane-test' }, text: 'Start Airplane Mode Test' }));
  } else {
    secondaryActions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: airplaneRecorded ? 'clear-airplane-test' : 'record-airplane-test' }, text: airplaneRecorded ? 'Clear Airplane Mode Record' : 'Start Airplane Mode Test' }));
  }

  secondaryActions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'repair-offline' }, text: 'Repair Offline Copy' }));
  secondaryActions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'share-companion' }, text: 'Share Companion' }));
  secondaryActions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'show-qr' }, text: 'Show QR Code' }));

  children.push(element('div', { className: 'setup-actions' }, [...actions, ...secondaryActions]));

  clearAndAppend(target, element('section', { className: 'setup-panel', dataset: { mode: standalone ? 'installed' : 'browser' }, 'aria-labelledby': 'setup-heading' }, children));
  target.querySelector('h2').id = 'setup-heading';
}

export function renderStaticIdentity() {
  document.querySelector('#trip-name').textContent = companionData.trip.name;
  document.querySelector('#release-badge').textContent = `Test version · ${companionData.identity.companionVersion}`;
  document.querySelector('#return-to-mountain-guide').hidden = !isMountainGuideReferrer();
  document.querySelector('#weather-invariant').textContent = companionData.invariants.weather;
  document.querySelector('#jurisdiction-copy').textContent = `${companionData.invariants.jurisdiction} You do not need to choose a county before calling.`;
  const provenance = document.querySelector('#provenance');
  clearAndAppend(provenance,
    element('strong', { text: companionData.identity.releaseStatus === 'candidate' ? 'CANDIDATE · PHYSICAL PHONE TESTING REQUIRED' : 'DRAFT COMPANION' }),
    element('span', { text: `Companion ${companionData.identity.companionVersion} · Trip Data v${companionData.identity.dataVersion}` }),
    element('span', { text: `Based on Mountain Guide ${companionData.identity.sourceRelease} · Verified ${formatDate(companionData.identity.verifiedAt)}` }),
    element('span', { text: `Trip data verified ${formatDate(companionData.identity.verifiedAt)}` })
  );
}

export function renderArtifacts() {
  const cards = [
    {
      title: 'Interactive Companion',
      description: 'Interactive operational reference.',
      action: element('button', { className: 'quiet-button artifact-open', type: 'button', dataset: { action: 'open-companion' }, text: 'Open Trip Timeline' })
    },
    {
      title: '3-Page Field Guide',
      description: 'Printable physical backup.',
      action: element('a', { className: 'quiet-button', href: companionData.artifacts.fieldGuide.url, text: 'Open Field Guide', dataset: { action: 'open-artifact', url: companionData.artifacts.fieldGuide.url } })
    },
    {
      title: 'Emergency Pocket Card',
      description: 'Compact emergency and communication backup.',
      action: element('a', { className: 'quiet-button', href: companionData.artifacts.pocketCard.url, text: 'Open Pocket Card', dataset: { action: 'open-artifact', url: companionData.artifacts.pocketCard.url } })
    }
  ].map(item => element('article', { className: 'artifact-card' }, [
    element('h3', { text: item.title }),
    element('p', { text: item.description }),
    element('div', { className: 'welcome-link-actions' }, [
      item.action,
      element('button', { className: 'quiet-button', type: 'button', dataset: { action: 'home' }, text: 'Back to Top' })
    ])
  ]));
  clearAndAppend(document.querySelector('#artifact-cards'), ...cards);
}

export function renderObjectiveContext(state) {
  const objective = companionData.objectives.find(item => item.id === state.selectedObjectiveId) || companionData.objectives[0];
  clearAndAppend(document.querySelector('#current-objective-context'),
    element('span', {}, [
      element('small', { text: 'CURRENT OBJECTIVE' }),
      element('strong', { text: objective.name })
    ]),
    element('button', {
      className: 'quiet-button', type: 'button', dataset: { action: 'change-objective' },
      text: 'Change objective', 'aria-label': `Change objective. Current objective: ${objective.name}`
    })
  );
}

export function renderTimeline(state, uiState = {}) {
  renderWeatherSnapshot(companionData.weatherSnapshot);
  const selectedId = companionData.objectives.some(item => item.id === state.selectedObjectiveId)
    ? state.selectedObjectiveId
    : companionData.objectives[0].id;
  const pendingObjectiveId = companionData.objectives.some(item => item.id === uiState.pendingObjectiveId)
    ? uiState.pendingObjectiveId
    : selectedId;
  const options = companionData.objectives.map(objective => {
    const radio = element('input', {
      type: 'radio', name: 'pending-objective', value: objective.id,
      checked: objective.id === pendingObjectiveId, 'aria-label': `Choose ${objective.name}`
    });
    return element('label', { className: 'objective-option' }, [
      radio,
      element('span', {}, [element('strong', { text: objective.name }), element('small', { text: objectiveRole(objective.role) })])
    ]);
  });
  const selector = document.querySelector('#objective-selector');
  clearAndAppend(selector,
    element('div', { className: 'section-heading compact-heading' }, [
      element('p', { className: 'eyebrow', text: 'CHANGE OBJECTIVE' }),
      element('h3', { text: 'Choose the current objective' }),
      element('p', { className: 'boundary-note', text: 'Switching objectives preserves every saved actual start and trip-level communication mark.' })
    ]),
    ...options,
    element('div', { className: 'field-actions' }, [
      element('button', { className: 'primary-button', type: 'button', dataset: { action: 'confirm-objective' }, text: 'Use objective' }),
      element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'cancel-objective' }, text: 'Cancel' })
    ])
  );
  selector.hidden = uiState.objectiveSelectorOpen !== true;

  const objective = companionData.objectives.find(item => item.id === selectedId);
  const times = objective.planningTimes.map(time => element('div', { className: 'time-card' }, [
    element('span', { text: time.kind === 'planned_start' ? 'Planned Start' : 'Planning Target' }),
    element('strong', { text: formatTime(time.localTime) }),
    element('small', { text: time.label })
  ]));
  const actual = state.actualStarts[objective.id] || '';
  const actualCard = element('div', { className: 'actual-card' }, [
    element('span', { text: 'Actual start on this phone' }),
    element('strong', { text: formatActualStart(actual) }),
    element('small', { dataset: { elapsedFor: objective.id }, text: actual ? `Elapsed ${formatElapsed(actual)}` : 'Planned start remains unchanged.' })
  ]);
  const actions = [];
  if (actual) {
    actions.push(element('button', { className: 'primary-button', type: 'button', dataset: { action: 'resume-objective', objectiveId: objective.id }, text: 'Resume Objective' }));
    actions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'replace-start', objectiveId: objective.id }, text: 'Replace with current time' }));
    actions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'edit-start', objectiveId: objective.id }, text: 'Edit actual start' }));
    actions.push(element('button', { className: 'danger-button', type: 'button', dataset: { action: 'reset-start', objectiveId: objective.id }, text: 'Reset actual start' }));
  } else {
    actions.push(element('button', { className: 'primary-button', type: 'button', dataset: { action: 'start-objective', objectiveId: objective.id }, text: 'Start Objective' }));
  }
  const children = [
    element('p', { className: 'eyebrow', text: objectiveRole(objective.role).toUpperCase() }),
    element('h3', { text: objective.name }),
    element('p', { className: 'boundary-note', text: 'Planning targets remain planning values. Actual conditions govern the decision.' }),
    element('div', { className: 'time-grid' }, times), actualCard,
    element('div', { className: 'objective-actions' }, actions)
  ];

  if (uiState.startObjectiveId === objective.id && !actual) {
    children.push(element('section', { className: 'start-confirmation', tabindex: '-1', 'aria-label': `Start ${objective.name}` }, [
      element('strong', { text: `Start ${objective.name}?` }),
      element('p', { text: `Record the current ${companionData.trip.timezone} time as this objective’s actual start.` }),
      element('div', { className: 'field-actions' }, [
        element('button', { className: 'primary-button', type: 'button', dataset: { action: 'confirm-start', objectiveId: objective.id }, text: 'Record current time' }),
        element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'back-from-start' }, text: 'Back' })
      ])
    ]));
  }

  if (uiState.editObjectiveId === objective.id) {
    const inputValue = actual ? formatOperationalDateTimeInput(actual) : '';
    children.push(element('div', { className: 'edit-start' }, [
      element('label', {}, [element('span', { text: `Actual start (${companionData.trip.timezone})` }), element('input', { id: 'actual-start-input', type: 'datetime-local', value: inputValue })]),
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
    const marked = state.checkedMilestones[key] === true || Object.hasOwn(state.milestoneMarks, key);
    const markedAt = state.milestoneMarks[key] || '';
    const localActions = marked
      ? [
          element('button', { className: 'quiet-button', type: 'button', dataset: { action: 'edit-milestone', milestone: key }, text: 'Edit time', 'aria-label': `Edit local mark time for ${label}` }),
          element('button', { className: 'quiet-button', type: 'button', dataset: { action: 'clear-milestone', milestone: key }, text: 'Undo mark', 'aria-label': `Undo local mark for ${label}` })
        ]
      : [element('button', { className: 'quiet-button', type: 'button', dataset: { action: 'mark-milestone', milestone: key }, text: 'Mark locally', 'aria-label': `Mark ${label} locally` })];
    const children = [
      element('div', { className: 'milestone-heading' }, [
        element('span', {}, [element('small', { text: 'LOCAL MILESTONE STATE' }), element('strong', { text: label })]),
        element('span', { className: 'milestone-status', text: marked
          ? markedAt ? `Marked locally at ${formatOperationalTime(markedAt)}` : 'Marked locally; time was not recorded by the earlier version.'
          : 'Not marked' })
      ]),
      element('div', { className: 'milestone-state-actions' }, localActions),
      element('div', { className: 'message-preparation', 'aria-label': `Message preparation for ${label}` }, [
        element('small', { text: 'MESSAGE PREPARATION' }),
        element('div', { className: 'message-actions' }, [
          element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'copy-message', milestone: key }, text: 'Copy Message', 'aria-label': `Copy message for ${label}` }),
          element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'share-message', milestone: key }, text: 'Share Message', 'aria-label': `Share message for ${label}` })
        ]),
        element('p', { className: 'boundary-note', text: 'ACTUAL DELIVERY — Confirm in the sending app. Copying or opening Share does not mark this milestone.' })
      ])
    ];
    if (uiState.editMilestoneKey === key) {
      children.push(element('div', { className: 'edit-milestone' }, [
        element('label', {}, [
          element('span', { text: `Local mark time (${companionData.trip.timezone})` }),
          element('input', { id: `milestone-time-${key}`, type: 'datetime-local', value: formatOperationalDateTimeInput(markedAt || new Date()) })
        ]),
        element('div', { className: 'field-actions' }, [
          element('button', { className: 'primary-button', type: 'button', dataset: { action: 'save-milestone', milestone: key }, text: 'Save time', 'aria-label': `Save local mark time for ${label}` }),
          element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'cancel-milestone-edit' }, text: 'Cancel' })
        ])
      ]));
    }
    return element('article', { className: 'milestone', dataset: { milestone: key } }, children);
  });
  clearAndAppend(document.querySelector('#milestone-list'), ...milestones);
  renderLocalOperations(state);
}

function renderLocalOperations(state) {
  const status = element('section', { className: 'status-note', 'aria-labelledby': 'local-status-title' }, [
    element('h3', { id: 'local-status-title', text: 'Brief status note' }),
    element('p', { className: 'boundary-note', text: 'Stored only on this phone.' }),
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
    element('summary', { 'aria-expanded': 'false', text: 'Optional private fields on this phone' }),
    element('div', { className: 'private-form' }, [
      element('p', { className: 'boundary-note', text: 'Stored only on this phone.' }),
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
    ? `${lily.name}: Exact coordinate/elevation is pending verification and is not shown.`
    : `${lily.name}: canonical location is available in the current data version.`;
  clearAndAppend(document.querySelector('#lily-status'), element('strong', { text: 'Lily Lake location' }), element('p', { text: note }));
}

export function renderEmergency() {
  const cards = companionData.contacts.map(contact => {
    const county = contact.agency.replace(/ County Sheriff’s Office$/, '');
    const phones = contact.phones.map(phone => element('a', { className: 'phone-link', href: phone.tel, 'aria-label': `Call ${county} ${phone.kind === 'dispatch' ? 'Dispatch' : 'Sheriff Office'}, ${phone.display}` }, [
      element('span', {}, [element('small', { text: phone.label }), element('strong', { text: phone.display })]),
      element('span', { 'aria-hidden': 'true', text: `Call ${phone.kind === 'dispatch' ? 'Dispatch' : 'Office'}` })
    ]));
    return element('article', { className: 'contact-card' }, [
      element('h3', { text: contact.agency }),
      element('p', { text: contact.geographicContext }),
      ...phones
    ]);
  });
  clearAndAppend(document.querySelector('#emergency-contacts'), ...cards);
}

export function setRedDisplay(enabled) {
  document.documentElement.dataset.display = enabled ? 'red' : 'daylight';
  document.documentElement.style.background = enabled ? '#100000' : '';
  document.documentElement.style.colorScheme = enabled ? 'dark' : 'light';
  const button = document.querySelector('[data-action="toggle-red"]');
  if (button) {
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? 'Red Mode · On' : 'Red Mode · Off';
  }
  document.querySelector('meta[name="theme-color"]').content = enabled ? '#100000' : '#163d46';
}

export function formatWeatherAge(timestamp, now = new Date()) {
  const verified = new Date(timestamp);
  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(verified.getTime()) || Number.isNaN(nowDate.getTime())) {
    return 'Age unavailable';
  }
  const diffMs = nowDate.getTime() - verified.getTime();
  if (diffMs < 0) return 'Age unavailable';
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Updated < 1 hr ago';
  if (diffHours < 24) return `Updated ${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `Updated ${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
}

export function renderWeatherSnapshot(weatherSnapshot = companionData.weatherSnapshot, now = new Date()) {
  if (!weatherSnapshot) return;
  const summaryEl = document.querySelector('#weather-snapshot-summary');
  const sourceEl = document.querySelector('#weather-snapshot-source');
  const timeEl = document.querySelector('#weather-snapshot-time');
  const ageEl = document.querySelector('#weather-snapshot-age');
  const locationsEl = document.querySelector('#weather-snapshot-locations');
  const invariantEl = document.querySelector('#weather-snapshot-invariant');

  if (summaryEl) summaryEl.textContent = weatherSnapshot.summary;
  if (sourceEl) sourceEl.textContent = weatherSnapshot.source;
  if (timeEl) timeEl.textContent = formatDate(weatherSnapshot.timestamp);
  if (ageEl) ageEl.textContent = formatWeatherAge(weatherSnapshot.timestamp, now);
  if (invariantEl) invariantEl.textContent = weatherSnapshot.statement || 'Weather is evidence, not permission.';

  if (locationsEl && Array.isArray(weatherSnapshot.locations)) {
    const pills = weatherSnapshot.locations.map(loc => {
      return element('div', { className: 'weather-location-pill' }, [
        element('strong', { text: loc.name }),
        element('small', { text: `${loc.elevationFt.toLocaleString()} ft · ${loc.context}` })
      ]);
    });
    clearAndAppend(locationsEl, ...pills);
  }
}

export function renderArtifactDocument(artifactId) {
  const container = document.querySelector('#artifact-document-container');
  const title = document.querySelector('#artifact-header-title');
  const downloadLink = document.querySelector('#artifact-download-pdf');
  if (!container) return;

  const isPocketCard = String(artifactId).includes('pocket-card');
  if (isPocketCard) {
    if (title) title.textContent = 'Emergency & Communication Pocket Card';
    if (downloadLink) {
      downloadLink.href = companionData.artifacts.pocketCard.url;
      downloadLink.setAttribute('download', 'pocket-card.pdf');
    }
    const pages = [
      {
        page: 1,
        label: 'Front · Emergency & Jurisdictions',
        src: './generated/pocket-card-p1.png',
        alt: 'Pocket Card Front - Emergency and Jurisdictions'
      },
      {
        page: 2,
        label: 'Back · Communication & Milestones',
        src: './generated/pocket-card-p2.png',
        alt: 'Pocket Card Back - Communication and Milestones'
      }
    ];
    const pageNodes = pages.map(p => {
      return element('div', { className: 'artifact-page-card pocket-card-page' }, [
        element('div', { className: 'artifact-page-label', text: p.label }),
        element('img', {
          className: 'artifact-page-img',
          src: p.src,
          alt: p.alt,
          width: '252',
          height: '360',
          loading: p.page === 1 ? 'eager' : 'lazy'
        })
      ]);
    });
    clearAndAppend(container, ...pageNodes);
  } else {
    if (title) title.textContent = '3-Page Printable Field Guide';
    if (downloadLink) {
      downloadLink.href = companionData.artifacts.fieldGuide.url;
      downloadLink.setAttribute('download', 'field-guide.pdf');
    }
    const pages = [
      {
        page: 1,
        label: 'Page 1 of 3 · Operational Timeline & Decision Gates',
        src: './generated/field-guide-p1.png',
        alt: 'Field Guide Page 1 - Operational Timeline and Decision Gates'
      },
      {
        page: 2,
        label: 'Page 2 of 3 · Route Profile Summary',
        src: './generated/field-guide-p2.png',
        alt: 'Field Guide Page 2 - Route Profile Summary'
      },
      {
        page: 3,
        label: 'Page 3 of 3 · Emergency & Communication',
        src: './generated/field-guide-p3.png',
        alt: 'Field Guide Page 3 - Emergency and Communication'
      }
    ];
    const pageNodes = pages.map(p => {
      return element('div', { className: 'artifact-page-card' }, [
        element('div', { className: 'artifact-page-label', text: p.label }),
        element('img', {
          className: 'artifact-page-img',
          src: p.src,
          alt: p.alt,
          width: '612',
          height: '792',
          loading: p.page === 1 ? 'eager' : 'lazy'
        })
      ]);
    });
    clearAndAppend(container, ...pageNodes);
  }
  container.scrollTop = 0;
}

export function teardownArtifactDocument() {
  const container = document.querySelector('#artifact-document-container');
  if (container) {
    clearAndAppend(container);
  }
}

export function navigateTo(view) {
  if (view === 'home') {
    navigateHome();
    return;
  }
  document.body.classList.add('companion-open');
  for (const section of document.querySelectorAll('[data-view]')) {
    section.hidden = section.dataset.view !== view;
  }
  if (view !== 'artifact') {
    teardownArtifactDocument();
    if (globalThis.location.hash.startsWith('#artifact=')) {
      history.replaceState(null, '', globalThis.location.pathname + globalThis.location.search);
    }
  }
  for (const button of document.querySelectorAll('.primary-nav button')) {
    if (button.dataset.nav === view) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  }
  for (const brand of document.querySelectorAll('.brand')) {
    brand.removeAttribute('aria-current');
  }
  const target = document.querySelector(`[data-view="${view}"]`);
  globalThis.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  target?.focus?.({ preventScroll: true });
}

export function navigateHome({ focus = true } = {}) {
  document.body.classList.remove('companion-open');
  for (const section of document.querySelectorAll('[data-view]')) {
    section.hidden = true;
  }
  teardownArtifactDocument();
  if (globalThis.location.hash.startsWith('#artifact=')) {
    history.replaceState(null, '', globalThis.location.pathname + globalThis.location.search);
  }
  for (const button of document.querySelectorAll('.primary-nav button')) {
    if (button.dataset.action === 'home') {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  }
  const home = document.querySelector('#companion-home');
  if (home) {
    home.hidden = false;
  }
  if (focus) {
    globalThis.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    home?.focus?.({ preventScroll: true });
  }
}

export function scrollCurrentViewToTop() {
  const target = document.querySelector('[data-view]:not([hidden])');
  globalThis.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
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

export function createQRCode(text) {
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    EXP[i + 255] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function polyMul(p1, p2) {
    const r = new Uint8Array(p1.length + p2.length - 1);
    for (let i = 0; i < p1.length; i++) {
      for (let j = 0; j < p2.length; j++) {
        r[i + j] ^= gfMul(p1[i], p2[j]);
      }
    }
    return r;
  }

  function polyRest(dividend, divisor) {
    const out = new Uint8Array(dividend);
    for (let i = 0; i < dividend.length - divisor.length + 1; i++) {
      const coef = out[i];
      if (coef !== 0) {
        for (let j = 1; j < divisor.length; j++) {
          out[i + j] ^= gfMul(divisor[j], coef);
        }
      }
    }
    return out.slice(dividend.length - divisor.length + 1);
  }

  function getGeneratorPoly(numEC) {
    let g = new Uint8Array([1]);
    for (let i = 0; i < numEC; i++) {
      g = polyMul(g, new Uint8Array([1, EXP[i]]));
    }
    return g;
  }

  const TABLE_M = [
    [1, 26, 16, 10, 1, 16, 0, 0],
    [2, 44, 28, 16, 1, 28, 0, 0],
    [3, 70, 44, 26, 1, 44, 0, 0],
    [4, 100, 64, 18, 2, 32, 0, 0],
    [5, 134, 86, 24, 2, 43, 0, 0],
    [6, 172, 108, 16, 4, 27, 0, 0]
  ];

  const utf8 = new TextEncoder().encode(text);
  const dataLen = utf8.length;

  let versionInfo = null;
  for (const row of TABLE_M) {
    const maxDataBytes = row[2];
    if (dataLen + 2 <= maxDataBytes) {
      versionInfo = row;
      break;
    }
  }

  if (!versionInfo) throw new Error('Text too long for Companion QR code generator');

  const [version, totalCodewords, dataCodewords, ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] = versionInfo;

  const bitBuffer = [];
  function putBits(num, length) {
    for (let i = length - 1; i >= 0; i--) {
      bitBuffer.push((num >>> i) & 1);
    }
  }

  putBits(4, 4);
  putBits(dataLen, 8);
  for (const byte of utf8) putBits(byte, 8);
  const totalDataBits = dataCodewords * 8;
  const termLen = Math.min(4, totalDataBits - bitBuffer.length);
  putBits(0, termLen);
  while (bitBuffer.length % 8 !== 0) bitBuffer.push(0);

  const dataBytes = [];
  for (let i = 0; i < bitBuffer.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bitBuffer[i + j];
    dataBytes.push(b);
  }
  let padToggle = 0;
  while (dataBytes.length < dataCodewords) {
    dataBytes.push(padToggle === 0 ? 0xec : 0x11);
    padToggle ^= 1;
  }

  const genPoly = getGeneratorPoly(ecPerBlock);
  const dataBlocks = [];
  const ecBlocks = [];
  let byteOffset = 0;
  const totalBlocks = g1Blocks + g2Blocks;

  for (let i = 0; i < totalBlocks; i++) {
    const isG1 = i < g1Blocks;
    const blockSize = isG1 ? g1Data : g2Data;
    const rawBlock = new Uint8Array(dataBytes.slice(byteOffset, byteOffset + blockSize));
    byteOffset += blockSize;
    dataBlocks.push(rawBlock);

    const dividend = new Uint8Array(blockSize + ecPerBlock);
    dividend.set(rawBlock, 0);
    const ec = polyRest(dividend, genPoly);
    ecBlocks.push(ec);
  }

  const finalCodewords = [];
  const maxDataBlockLen = Math.max(g1Data, g2Data || 0);
  for (let i = 0; i < maxDataBlockLen; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      if (i < dataBlocks[b].length) finalCodewords.push(dataBlocks[b][i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      finalCodewords.push(ecBlocks[b][i]);
    }
  }

  const size = 17 + 4 * version;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(null));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

  function setModule(r, c, val) {
    matrix[r][c] = val ? 1 : 0;
    isFunction[r][c] = true;
  }

  function addFinder(topRow, leftCol) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = topRow + r;
        const col = leftCol + c;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        const isBlack = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        setModule(row, col, isBlack);
      }
    }
  }
  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    if (!isFunction[6][i]) setModule(6, i, i % 2 === 0);
    if (!isFunction[i][6]) setModule(i, 6, i % 2 === 0);
  }

  const ALIGN_POS = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };
  const alignCoords = ALIGN_POS[version] || [];
  for (const r of alignCoords) {
    for (const c of alignCoords) {
      if (isFunction[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          setModule(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  setModule(4 * version + 9, 8, true);

  for (let i = 0; i < 9; i++) {
    if (!isFunction[8][i]) { matrix[8][i] = 0; isFunction[8][i] = true; }
    if (!isFunction[i][8]) { matrix[i][8] = 0; isFunction[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8][size - 1 - i]) { matrix[8][size - 1 - i] = 0; isFunction[8][size - 1 - i] = true; }
    if (!isFunction[size - 1 - i][8]) { matrix[size - 1 - i][8] = 0; isFunction[size - 1 - i][8] = true; }
  }

  const allBits = [];
  for (const byte of finalCodewords) {
    for (let i = 7; i >= 0; i--) allBits.push((byte >>> i) & 1);
  }

  let bitIdx = 0;
  let up = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    for (let vert = 0; vert < size; vert++) {
      const r = up ? (size - 1 - vert) : vert;
      for (let c = right; c >= right - 1; c--) {
        if (!isFunction[r][c]) {
          matrix[r][c] = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
        }
      }
    }
    up = !up;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunction[r][c] && (r + c) % 2 === 0) {
        matrix[r][c] ^= 1;
      }
    }
  }

  const FORMAT_BITS = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  const formatCoordsTopLeft = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = formatCoordsTopLeft[i];
    matrix[r][c] = FORMAT_BITS[i];
  }
  for (let i = 0; i < 8; i++) {
    matrix[8][size - 1 - i] = FORMAT_BITS[14 - i];
  }
  for (let i = 0; i < 7; i++) {
    matrix[size - 1 - i][8] = FORMAT_BITS[i];
  }

  return { size, matrix };
}

export function renderQrCodeSvg(target, url) {
  if (!target) return;
  const qr = createQRCode(url);
  const size = qr.size;
  const quietZone = 4;
  const viewBoxSize = size + quietZone * 2;

  let pathData = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.matrix[r][c] === 1) {
        const x = c + quietZone;
        const y = r + quietZone;
        pathData += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${viewBoxSize} ${viewBoxSize}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `QR Code for ${url}`);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', String(viewBoxSize));
  bg.setAttribute('height', String(viewBoxSize));
  bg.setAttribute('fill', '#ffffff');
  svg.append(bg);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('fill', '#000000');
  svg.append(path);

  target.replaceChildren(svg);
}

export { companionData, releaseMetadata };
