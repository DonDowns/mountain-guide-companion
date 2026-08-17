let deferredInstallPrompt = null;
let serviceWorkerRegistration = null;
let controllerReloadStarted = false;
let workerStatePublisher = null;
let updateStatus = 'current';

function publishWorkerState(overrides = {}) {
  const hasWaiting = Boolean(serviceWorkerRegistration?.waiting);
  workerStatePublisher?.({
    supported: 'serviceWorker' in navigator,
    controlled: Boolean(navigator.serviceWorker?.controller),
    updateAvailable: hasWaiting,
    updateStatus: hasWaiting ? 'available' : (updateStatus === 'available' ? 'current' : updateStatus),
    registration: serviceWorkerRegistration,
    ...overrides
  });
}

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

async function copyText(value, promptMessage) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return { method: 'copy', completed: true };
    } catch {
      // Continue to the packaged, offline-capable copy fallbacks.
    }
  }
  const input = document.createElement('input');
  input.value = value;
  input.readOnly = true;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  input.remove();
  if (copied) return { method: 'copy', completed: true };
  globalThis.prompt?.(promptMessage, value);
  return { method: 'manual', completed: false };
}

async function shareOrCopy(payload, copyValue, promptMessage) {
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return { method: 'share', completed: true, deliveryConfirmed: false };
    } catch (error) {
      if (error?.name === 'AbortError') return { method: 'share', completed: false, cancelled: true };
    }
  }
  return copyText(copyValue, promptMessage);
}

export async function sharePublicCompanion(publicUrl, title) {
  return shareOrCopy(
    { title, text: 'Open the Mountain Guide Companion for the current trip.', url: publicUrl },
    publicUrl,
    'Copy this public Companion link:'
  );
}

export async function copyPreparedMessage(message) {
  return copyText(message, 'Copy this prepared message:');
}

export async function sharePreparedMessage(message, title = 'Mountain Guide Companion update') {
  return shareOrCopy({ title, text: message }, message, 'Copy this prepared message:');
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
  workerStatePublisher = onChange;
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) {
    publishWorkerState({ supported: false, controlled: false, updateAvailable: false, updateStatus: 'failed' });
    return null;
  }
  try {
    let observedController = navigator.serviceWorker.controller;
    serviceWorkerRegistration = await navigator.serviceWorker.register('./service-worker.js', {
      scope: './',
      updateViaCache: 'none'
    });
    const publish = () => publishWorkerState();
    serviceWorkerRegistration.addEventListener('updatefound', () => {
      const installing = serviceWorkerRegistration.installing;
      updateStatus = 'downloading';
      publish();
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') updateStatus = serviceWorkerRegistration.waiting ? 'available' : 'current';
        if (installing.state === 'activated') updateStatus = 'current';
        if (installing.state === 'redundant') updateStatus = 'failed';
        publish();
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const nextController = navigator.serviceWorker.controller;
      observedController = nextController || observedController;
      publish();
      if (updateStatus === 'applying' && !controllerReloadStarted) {
        controllerReloadStarted = true;
        globalThis.location.reload();
      }
    });
    await navigator.serviceWorker.ready;
    await waitForController();
    publish();
    return serviceWorkerRegistration;
  } catch {
    updateStatus = navigator.onLine ? 'failed' : 'offline';
    publishWorkerState({ supported: true, controlled: false, updateAvailable: false });
    return null;
  }
}

export async function checkForCompanionUpdate() {
  const registration = serviceWorkerRegistration || await navigator.serviceWorker?.ready;
  if (!registration) {
    updateStatus = 'failed';
    publishWorkerState();
    return { available: false, status: updateStatus };
  }
  if (!navigator.onLine) {
    updateStatus = 'offline';
    publishWorkerState();
    return { available: false, status: updateStatus };
  }
  updateStatus = 'checking';
  publishWorkerState();
  try {
    await registration.update();
    updateStatus = registration.waiting ? 'available' : 'current';
  } catch {
    updateStatus = 'failed';
  }
  publishWorkerState();
  return { available: Boolean(registration.waiting), status: updateStatus };
}

export async function verifyOfflineResources() {
  if (!serviceWorkerRegistration) await navigator.serviceWorker?.ready;
  const controller = navigator.serviceWorker?.controller || null;
  if (!controller) {
    return { complete: false, error: 'Offline setup is not controlling this page. Reopen Companion and retry Offline Check.' };
  }
  return sendWorkerMessage(controller, 'VERIFY_OFFLINE_BUNDLE');
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
  updateStatus = 'applying';
  publishWorkerState();
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
