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
    redDisplay: Boolean(bootstrap.initialRed),
    statusNote: '',
    privateContact: emptyPrivateContact(),
    setup: {
      companionOpened: false,
      structuralCheckCompletedAt: ''
    }
  };
}

function stringRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, child]) => typeof child === 'string'));
}

function booleanRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, child]) => typeof child === 'boolean'));
}

function elapsedRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, child]) =>
    child && typeof child === 'object' && typeof child.startedAt === 'string'
  ));
}

function sanitizeV1(raw, defaultObjectiveId) {
  const fallback = defaultLocalState(defaultObjectiveId);
  const privateContact = raw.privateContact && typeof raw.privateContact === 'object' ? raw.privateContact : {};
  const setup = raw.setup && typeof raw.setup === 'object' ? raw.setup : {};
  return {
    schemaVersion: LOCAL_STATE_SCHEMA_VERSION,
    selectedObjectiveId: typeof raw.selectedObjectiveId === 'string' ? raw.selectedObjectiveId : fallback.selectedObjectiveId,
    actualStarts: stringRecord(raw.actualStarts),
    elapsedBasis: elapsedRecord(raw.elapsedBasis),
    checkedMilestones: booleanRecord(raw.checkedMilestones),
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
      structuralCheckCompletedAt: typeof setup.structuralCheckCompletedAt === 'string' ? setup.structuralCheckCompletedAt : ''
    }
  };
}

export function migrateLocalState(raw, defaultObjectiveId = '') {
  if (!raw || typeof raw !== 'object') return defaultLocalState(defaultObjectiveId);
  if (raw.schemaVersion === 1) return sanitizeV1(raw, defaultObjectiveId);
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
