const registrationPromise = navigator.serviceWorker?.register('./service-worker.js', {
  scope: './',
  updateViaCache: 'none'
});
globalThis.__previousFixtureRegistration = registrationPromise;

registrationPromise?.then(registration => {
  const button = document.querySelector('#activate-update');
  const publish = () => { button.hidden = !registration.waiting; };
  registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', publish));
  publish();
  button.addEventListener('click', () => {
    if (!registration.waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    registration.waiting.postMessage({ type: 'ACTIVATE_VERIFIED_UPDATE' });
  });
});
