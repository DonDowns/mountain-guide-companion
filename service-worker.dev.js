/* Phase 4 development-only installability shell.
 * It intentionally performs no caching and provides no offline response.
 * Phase 5 owns the production cache, atomic updates, and cold-launch contract.
 */
self.addEventListener('install', () => {
  // No precache in Phase 4.
});

self.addEventListener('activate', () => {
  // No cache claim or update assertion in Phase 4.
});
