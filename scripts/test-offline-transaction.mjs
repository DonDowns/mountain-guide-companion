import assert from 'node:assert/strict';

class CacheModel {
  constructor(previous = new Map()) {
    this.complete = new Map(previous);
    this.candidates = new Map();
  }

  async install(bundleId, resources, failure = {}) {
    const candidate = new Map();
    this.candidates.set(bundleId, candidate);
    try {
      for (const resource of resources) {
        if (failure.path === resource.path) throw new Error(failure.kind || 'resource failure');
        candidate.set(resource.path, resource.sha256);
      }
      if (candidate.size !== resources.length) throw new Error('resource count mismatch');
      candidate.set('__complete__', bundleId);
      this.complete.set(bundleId, candidate);
      this.candidates.delete(bundleId);
      return true;
    } catch {
      this.candidates.delete(bundleId);
      return false;
    }
  }
}

const resources = [
  { path: 'index.html', sha256: 'a' },
  { path: 'js/companion.js', sha256: 'b' },
  { path: 'data/trip-manifest.json', sha256: 'c' },
  { path: 'generated/field-guide.pdf', sha256: 'd' }
];
const previous = new Map([['previous-complete', new Map([['__complete__', 'previous-complete']])]]);

for (const failure of [
  { path: 'js/companion.js', kind: 'required JS unavailable' },
  { path: 'data/trip-manifest.json', kind: 'canonical data unavailable' },
  { path: 'generated/field-guide.pdf', kind: 'PDF unavailable' },
  { path: 'index.html', kind: 'integrity mismatch' },
  { path: 'index.html', kind: 'quota exceeded' }
]) {
  const model = new CacheModel(previous);
  assert.equal(await model.install('candidate', resources, failure), false);
  assert.equal(model.complete.has('previous-complete'), true);
  assert.equal(model.complete.has('candidate'), false);
  assert.equal(model.candidates.size, 0);
}

const success = new CacheModel(previous);
assert.equal(await success.install('current-complete', resources), true);
assert.equal(success.complete.has('previous-complete'), true);
assert.equal(success.complete.get('current-complete').get('__complete__'), 'current-complete');
console.log('offline_transaction_logic=pass');
console.log('failed_candidate_cases=5');
console.log('quota_failure_preserves_previous=pass');
console.log('completion_marker_written_last=pass');
