globalThis.__previousFixtureRegistration = navigator.serviceWorker?.register('./service-worker.js', {
  scope: './',
  updateViaCache: 'none'
});
