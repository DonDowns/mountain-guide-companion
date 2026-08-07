let deferredInstallPrompt = null;
let serviceWorkerRegistration = null;

export function isStandalone() {
  if (globalThis.__COMPANION_TEST_STANDALONE__ === true) return true;
  return globalThis.navigator?.standalone === true || globalThis.matchMedia?.('(display-mode: standalone)').matches === true;
}

export function isIosBrowser() {
  const agent = globalThis.navigator?.userAgent || '';
  return /iPhone|iPad|iPod/i.test(agent);
}

export function installPromptAvailable() {
  return Boolean(deferredInstallPrompt);
}

export function watchInstallPrompt(onChange) {
  globalThis.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    onChange?.();
  });
  globalThis.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    onChange?.();
  });
}

export async function requestInstall() {
  if (!deferredInstallPrompt) return { available: false, outcome: 'unavailable' };
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return { available: true, outcome: choice?.outcome || 'dismissed' };
}

export async function sharePublicCompanion(publicUrl, title) {
  const payload = { title, text: 'Open the Mountain Guide Companion for the current trip.', url: publicUrl };
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return { method: 'share', completed: true };
    } catch (error) {
      if (error?.name === 'AbortError') return { method: 'share', completed: false };
    }
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(publicUrl);
    return { method: 'copy', completed: true };
  }
  const input = document.createElement('input');
  input.value = publicUrl;
  input.readOnly = true;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  return { method: 'copy', completed: copied };
}

function waitForController(timeoutMs = 8000) {
  if (navigator.serviceWorker?.controller) return Promise.resolve(navigator.serviceWorker.controller);
  return new Promise(resolve => {
    const timeout = globalThis.setTimeout(() => resolve(navigator.serviceWorker?.controller || null), timeoutMs);
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      globalThis.clearTimeout(timeout);
      resolve(navigator.serviceWorker.controller);
    }, { once: true });
  });
}

function sendWorkerMessage(worker, type, timeoutMs = 30000) {
  if (!worker) return Promise.resolve({ complete: false, error: 'Offline setup is not active on this page.' });
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timeout = globalThis.setTimeout(() => resolve({ complete: false, error: 'Offline Check timed out.' }), timeoutMs);
    channel.port1.onmessage = event => {
      globalThis.clearTimeout(timeout);
      resolve(event.data);
    };
    worker.postMessage({ type }, [channel.port2]);
  });
}

export async function registerProductionServiceWorker(onChange) {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) {
    onChange?.({ supported: false, controlled: false, updateAvailable: false });
    return null;
  }
  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register('./service-worker.js', {
      scope: './',
      updateViaCache: 'none'
    });
    const publish = () => onChange?.({
      supported: true,
      controlled: Boolean(navigator.serviceWorker.controller),
      updateAvailable: Boolean(serviceWorkerRegistration.waiting),
      registration: serviceWorkerRegistration
    });
    serviceWorkerRegistration.addEventListener('updatefound', () => {
      const installing = serviceWorkerRegistration.installing;
      installing?.addEventListener('statechange', publish);
    });
    navigator.serviceWorker.addEventListener('controllerchange', publish);
    await navigator.serviceWorker.ready;
    await waitForController();
    publish();
    return serviceWorkerRegistration;
  } catch {
    onChange?.({ supported: true, controlled: false, updateAvailable: false });
    return null;
  }
}

export async function verifyOfflineResources() {
  if (!serviceWorkerRegistration) await navigator.serviceWorker?.ready;
  const worker = navigator.serviceWorker?.controller || serviceWorkerRegistration?.active || null;
  return sendWorkerMessage(worker, 'VERIFY_OFFLINE_BUNDLE');
}

export async function repairOfflineCopy() {
  const registration = serviceWorkerRegistration || await navigator.serviceWorker?.ready;
  if (!registration) return { complete: false, error: 'Offline setup is unavailable.' };
  try {
    await registration.update();
  } catch {
    // The active worker can still attempt a bounded repair with the current release identity.
  }
  return sendWorkerMessage(navigator.serviceWorker.controller || registration.active, 'REPAIR_OFFLINE_COPY', 60000);
}

export async function activateWaitingUpdate() {
  const registration = serviceWorkerRegistration || await navigator.serviceWorker?.ready;
  if (!registration?.waiting) return false;
  registration.waiting.postMessage({ type: 'ACTIVATE_VERIFIED_UPDATE' });
  return true;
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage || 0, quota: estimate.quota || 0, persisted: navigator.storage.persisted ? await navigator.storage.persisted() : false };
  } catch {
    return null;
  }
}
