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
  const offlineVerified = offlineResult?.complete === true;
  const controlled = workerState?.controlled === true;
  const airplaneRecorded = Boolean(state.setup?.airplaneModeTestCompletedAt);
  const allGatesComplete = standalone && controlled && offlineVerified && airplaneRecorded;

  document.querySelector('#welcome-eyebrow').textContent = standalone ? 'CURRENT TRIP' : 'MOUNTAIN GUIDE COMPANION';
  document.querySelector('#welcome-title').textContent = allGatesComplete ? 'Phone Setup ✓' : standalone ? 'Companion Home' : 'Prepare This Phone';
  document.querySelector('#welcome-summary').textContent = standalone
    ? 'Open the trip companion, verify the offline copy, or use the Field Guide and Pocket Card.'
    : 'Recommended for trip partners. This keeps the trip plan, emergency information, communication milestones, Field Guide, and Pocket Card available when there is no service.';

  const primary = document.querySelector('#home-primary-action');
  const secondary = document.querySelector('#home-secondary-action');
  if (standalone) {
    primary.dataset.action = 'open-companion';
    primary.textContent = 'Open Trip Timeline';
    secondary.dataset.action = 'offline-check';
    secondary.textContent = 'Offline Check';
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
  const airplaneInstructionsOpen = Boolean(target.querySelector('.airplane-test')?.open);
  const {
    standalone, ios, promptAvailable, offlineResult, workerState, state
  } = options;
  const offlineVerified = offlineResult?.complete === true;
  const controlled = workerState.controlled === true;
  const airplaneRecorded = Boolean(state.setup.airplaneModeTestCompletedAt);
  const allGatesComplete = standalone && controlled && offlineVerified && airplaneRecorded;
  const eyebrow = element('p', { className: 'eyebrow', text: standalone ? 'OFFLINE SETUP' : 'RECOMMENDED FOR TRIP PARTNERS' });
  const heading = element('h2', { text: allGatesComplete ? 'This Phone Is Ready for Offline Use ✓' : standalone ? 'Finish Preparing This Phone' : 'Prepare This Phone' });
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
    airplaneRecorded ? `Recorded on this phone: ${formatActualStart(state.setup.airplaneModeTestCompletedAt)}.` : 'Airplane Mode test still required',
    airplaneRecorded,
    airplaneRecorded ? undefined : 'attention'
  ));

  children.push(setupList);
  children.push(element('p', { className: 'boundary-note setup-boundary', text: 'This confirms phone/offline preparation only and does not evaluate weather, access, terrain, or route conditions.' }));

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
    actions.push(element('button', { className: 'primary-button install-button', type: 'button', dataset: { action: 'install' }, text: 'Install Companion' }));
  }
  
  if (standalone && !offlineVerified) {
    actions.push(element('button', { className: 'primary-button', type: 'button', dataset: { action: 'offline-check' }, text: 'Offline Check' }));
  } else if (standalone && offlineVerified) {
    secondaryActions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'offline-check' }, text: 'Offline Check' }));
  } else if (!standalone) {
    secondaryActions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'offline-check' }, text: 'Offline Check' }));
  }

  if (standalone && controlled && offlineVerified && !airplaneRecorded) {
    actions.push(element('button', { className: 'primary-button', type: 'button', dataset: { action: 'record-airplane-test' }, text: 'Record Airplane Mode Test' }));
  } else {
    secondaryActions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: airplaneRecorded ? 'clear-airplane-test' : 'record-airplane-test' }, text: airplaneRecorded ? 'Clear Airplane Mode Record' : 'Record Airplane Mode Test' }));
  }

  secondaryActions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'repair-offline' }, text: 'Repair Offline Copy' }));
  secondaryActions.push(element('button', { className: 'secondary-button', type: 'button', dataset: { action: 'share' }, text: 'Share Companion' }));

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

export function navigateTo(view) {
  document.body.classList.add('companion-open');
  for (const section of document.querySelectorAll('[data-view]')) section.hidden = section.dataset.view !== view;
  for (const button of document.querySelectorAll('[data-nav]')) {
    if (button.dataset.nav === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  document.querySelector('[data-action="home"]')?.removeAttribute('aria-current');
  const target = document.querySelector(`[data-view="${view}"]`);
  globalThis.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  target?.focus?.({ preventScroll: true });
}

export function navigateHome({ focus = true } = {}) {
  document.body.classList.remove('companion-open');
  for (const button of document.querySelectorAll('[data-nav]')) button.removeAttribute('aria-current');
  document.querySelector('[data-action="home"]')?.setAttribute('aria-current', 'page');
  globalThis.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  if (focus) document.querySelector('#companion-home')?.focus?.({ preventScroll: true });
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

export { companionData, releaseMetadata };
