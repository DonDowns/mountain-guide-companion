(function bootstrapDisplayState() {
  const storageKey = 'mgc-companion-local-state';
  const schemaVersion = 1;
  let initialRed = false;
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    initialRed = stored?.schemaVersion === schemaVersion && stored.redDisplay === true;
  } catch {
    initialRed = false;
  }
  if (initialRed) {
    document.documentElement.dataset.display = 'red';
    document.documentElement.style.background = '#100000';
    document.documentElement.style.colorScheme = 'dark';
  }
  globalThis.CompanionBootstrap = Object.freeze({ storageKey, schemaVersion, initialRed });
}());
