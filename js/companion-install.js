let deferredInstallPrompt = null;

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

export async function registerDevelopmentServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return false;
  try {
    await navigator.serviceWorker.register('./service-worker.dev.js', { scope: './' });
    return true;
  } catch {
    return false;
  }
}
