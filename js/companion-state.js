const bootstrap = globalThis.CompanionBootstrap || {
  storageKey: 'mgc-companion-local-state',
  schemaVersion: 1,
  initialRed: false
};

export const LOCAL_STATE_SCHEMA_VERSION = bootstrap.schemaVersion;
export const LOCAL_STATE_STORAGE_KEY = bootstrap.storageKey;

function emptyPrivateContact() {
  return { name: '', phone: '', alternate: '', note: '' };
}

export function defaultLocalState(defaultObjectiveId = '') {
  return {
    schemaVersion: LOCAL_STATE_SCHEMA_VERSION,
    selectedObjectiveId: defaultObjectiveId,
    actualStarts: {},
    elapsedBasis: {},
    checkedMilestones: {},
    milestoneMarks: {},
    redDisplay: Boolean(bootstrap.initialRed),
    statusNote: '',
    privateContact: emptyPrivateContact(),
    setup: {
      companionOpened: false,
      offlineVerifiedAt: '',
      offlineVerifiedBundleId: '',
      airplaneModeTestCompletedAt: '',
      legacyStructuralCheckCompletedAt: '',
      onboarding: { version: '', status: '', recordedAt: '' }
    }
  };
}

function stringRecord(value, maximumEntries = 12) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, maximumEntries).filter(([key, child]) =>
    typeof key === 'string' && key.length <= 160 && typeof child === 'string' && child.length <= 160
  ));
}

function booleanRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 24).filter(([key, child]) =>
    typeof key === 'string' && key.length <= 160 && typeof child === 'boolean'
  ));
}

function elapsedRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 12).filter(([key, child]) =>
    typeof key === 'string' && key.length <= 160 && child && typeof child === 'object' && typeof child.startedAt === 'string'
  ).map(([key, child]) => [key, {
    startedAt: child.startedAt.slice(0, 160),
    deviceTimeZoneOffsetMinutes: Number.isFinite(child.deviceTimeZoneOffsetMinutes) ? child.deviceTimeZoneOffsetMinutes : 0
  }]));
}

function sanitizeCurrent(raw, defaultObjectiveId) {
  const fallback = defaultLocalState(defaultObjectiveId);
  const privateContact = raw.privateContact && typeof raw.privateContact === 'object' ? raw.privateContact : {};
  const setup = raw.setup && typeof raw.setup === 'object' ? raw.setup : {};
  const onboarding = setup.onboarding && typeof setup.onboarding === 'object' ? setup.onboarding : {};
  const checkedMilestones = booleanRecord(raw.checkedMilestones);
  const milestoneMarks = stringRecord(raw.milestoneMarks, 24);
  for (const [key, checked] of Object.entries(checkedMilestones)) {
    if (checked && !Object.hasOwn(milestoneMarks, key)) milestoneMarks[key] = '';
  }
  for (const key of Object.keys(milestoneMarks)) checkedMilestones[key] = true;
  return {
    schemaVersion: LOCAL_STATE_SCHEMA_VERSION,
    selectedObjectiveId: typeof raw.selectedObjectiveId === 'string' ? raw.selectedObjectiveId : fallback.selectedObjectiveId,
    actualStarts: stringRecord(raw.actualStarts),
    elapsedBasis: elapsedRecord(raw.elapsedBasis),
    checkedMilestones,
    milestoneMarks,
    redDisplay: raw.redDisplay === true,
    statusNote: typeof raw.statusNote === 'string' ? raw.statusNote.slice(0, 240) : '',
    privateContact: {
      name: typeof privateContact.name === 'string' ? privateContact.name.slice(0, 120) : '',
      phone: typeof privateContact.phone === 'string' ? privateContact.phone.slice(0, 80) : '',
      alternate: typeof privateContact.alternate === 'string' ? privateContact.alternate.slice(0, 120) : '',
      note: typeof privateContact.note === 'string' ? privateContact.note.slice(0, 500) : ''
    },
    setup: {
      companionOpened: setup.companionOpened === true,
      offlineVerifiedAt: typeof setup.offlineVerifiedAt === 'string' ? setup.offlineVerifiedAt.slice(0, 160) : '',
      offlineVerifiedBundleId: typeof setup.offlineVerifiedBundleId === 'string' ? setup.offlineVerifiedBundleId.slice(0, 200) : '',
      airplaneModeTestCompletedAt: typeof setup.airplaneModeTestCompletedAt === 'string' ? setup.airplaneModeTestCompletedAt.slice(0, 160) : '',
      legacyStructuralCheckCompletedAt: typeof setup.legacyStructuralCheckCompletedAt === 'string'
        ? setup.legacyStructuralCheckCompletedAt.slice(0, 160)
        : typeof setup.structuralCheckCompletedAt === 'string' ? setup.structuralCheckCompletedAt.slice(0, 160) : '',
      onboarding: {
        version: typeof onboarding.version === 'string' ? onboarding.version.slice(0, 120) : '',
        status: ['completed', 'dismissed'].includes(onboarding.status) ? onboarding.status : '',
        recordedAt: typeof onboarding.recordedAt === 'string' ? onboarding.recordedAt.slice(0, 160) : ''
      }
    }
  };
}

export function migrateLocalState(raw, defaultObjectiveId = '') {
  if (!raw || typeof raw !== 'object') return defaultLocalState(defaultObjectiveId);
  if ([1, 2, 3, 4].includes(raw.schemaVersion)) return sanitizeCurrent(raw, defaultObjectiveId);
  return defaultLocalState(defaultObjectiveId);
}

export function loadLocalState(defaultObjectiveId = '') {
  try {
    return migrateLocalState(JSON.parse(localStorage.getItem(LOCAL_STATE_STORAGE_KEY) || 'null'), defaultObjectiveId);
  } catch {
    return defaultLocalState(defaultObjectiveId);
  }
}

function persist(state) {
  try {
    localStorage.setItem(LOCAL_STATE_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function createCompanionStore(defaultObjectiveId) {
  let state = loadLocalState(defaultObjectiveId);
  const listeners = new Set();

  function getState() {
    return state;
  }

  function update(mutator, options = {}) {
    const next = structuredClone(state);
    mutator(next);
    next.schemaVersion = LOCAL_STATE_SCHEMA_VERSION;
    state = migrateLocalState(next, defaultObjectiveId);
    persist(state);
    if (options.notify !== false) {
      for (const listener of listeners) listener(state);
    }
    return state;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, update, subscribe };
}

export function clearPrivateFields(state) {
  state.privateContact = emptyPrivateContact();
}
