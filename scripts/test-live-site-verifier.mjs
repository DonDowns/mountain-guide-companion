import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import {
  canonicalDeploymentPath,
  checkOnce,
  expectedDeliveredContentType,
  inspectVisibleTestVersionDisclosure,
  runWithRetries,
  validateRetryConfiguration
} from './check-live-site.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');
const testUrl = new URL('https://candidate-verifier.invalid/base/');
const label = 'Test version';
const notice = 'Physical phone testing is still required. This is not yet a field release.';
let browser;

before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function deploymentFiles() {
  const files = new Map();
  const bundleBytes = await readFile(resolve(repoRoot, 'offline-bundle.json'));
  const bundle = JSON.parse(bundleBytes.toString('utf8'));
  files.set('offline-bundle.json', bundleBytes);
  files.set('service-worker.js', await readFile(resolve(repoRoot, 'service-worker.js')));
  for (const resource of bundle.resources) files.set(resource.path, await readFile(resolve(repoRoot, resource.path)));
  return { bundle, files };
}

function statusHtml({ badge = `<small id="release-badge">${label}</small>`, releaseNote = `<p class="release-note">${notice}</p>`, head = '', tail = '' } = {}) {
  return `<!doctype html><html><head>${head}</head><body>${badge}${releaseNote}${tail}</body></html>`;
}

function replaceFile(files, path, bytes) {
  const copy = new Map(files);
  copy.set(path, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  return copy;
}

function replaceJson(files, path, mutate) {
  const value = JSON.parse(files.get(path).toString('utf8'));
  mutate(value);
  return replaceFile(files, path, JSON.stringify(value));
}

function localResourceLoader(files, fetchedPaths) {
  return async path => {
    fetchedPaths?.push(path);
    if (!files.has(path)) throw new Error(`test deployment is missing ${path}`);
    return {
      bytes: Buffer.from(files.get(path)),
      finalUrl: new URL(path, testUrl).href,
      headers: { 'content-type': expectedDeliveredContentType(path) }
    };
  };
}

function contentTypeOverrideLoader(files, overridePath, overrideValue, overrideHeaderName = 'content-type') {
  return async path => {
    if (!files.has(path)) throw new Error(`test deployment is missing ${path}`);
    const headers = {};
    if (path === overridePath && overrideValue && typeof overrideValue === 'object') {
      Object.assign(headers, overrideValue);
    } else if (path !== overridePath || overrideValue !== null) {
      headers[path === overridePath ? overrideHeaderName : 'content-type'] =
        path === overridePath ? overrideValue : expectedDeliveredContentType(path);
    }
    return {
      bytes: Buffer.from(files.get(path)),
      finalUrl: new URL(path, testUrl).href,
      headers
    };
  };
}

async function verify(files, { liveBaseUrl = testUrl, fetchedPaths, fetchResourceImpl, fetchImpl, resourceTimeoutMs } = {}) {
  return checkOnce({
    browser,
    liveBaseUrl,
    log: () => {},
    fetchResourceImpl: fetchResourceImpl || (fetchImpl ? undefined : localResourceLoader(files, fetchedPaths)),
    fetchImpl,
    resourceTimeoutMs
  });
}

async function inspect(html, files, options = {}) {
  const allowedResourcePaths = options.allowedResourcePaths || new Set(['index.html', ...files.keys()]);
  return inspectVisibleTestVersionDisclosure(html, {
    browser: options.browser || browser,
    liveBaseUrl: testUrl,
    fetchResourceImpl: options.fetchResourceImpl || localResourceLoader(files),
    allowedResourcePaths,
    lifecycleTimeoutMs: options.lifecycleTimeoutMs || 2000
  });
}

function browserWithRouteEvidence(evidence) {
  return {
    async newContext(options) {
      const ownedContext = await browser.newContext(options);
      return {
        async newPage() {
          const ownedPage = await ownedContext.newPage();
          return new Proxy(ownedPage, {
            get(target, property) {
              if (property === 'goto') {
                return (...arguments_) => {
                  evidence.navigations += 1;
                  return target.goto(...arguments_);
                };
              }
              if (property === 'route') {
                return (pattern, handler) => target.route(pattern, route => {
                  evidence.routeInvocations += 1;
                  return handler(route);
                });
              }
              const value = Reflect.get(target, property, target);
              return typeof value === 'function' ? value.bind(target) : value;
            }
          });
        },
        close: () => ownedContext.close()
      };
    }
  };
}

async function assertDisclosureRejected(html, files, expectedReason) {
  const result = await inspect(html, replaceFile(files, 'index.html', html));
  assert.equal(result.pass, false);
  if (expectedReason) assert.match(`${result.badge.reason || ''} ${result.notice.reason || ''}`, expectedReason);
}

test('approved candidate.6 HTML passes locally and every bundled resource is verified', async () => {
  const { bundle, files } = await deploymentFiles();
  const fetchedPaths = [];
  assert.equal((await inspect(files.get('index.html').toString('utf8'), files)).pass, true);
  const verified = await verify(files, { fetchedPaths });
  assert.equal(verified.verifiedResourceCount, bundle.resources.length);
  for (const resource of bundle.resources) assert.ok(fetchedPaths.includes(resource.path), `${resource.path} was not verified`);
});

test('both approved disclosures must be visible with correct wording and understandable failure', async t => {
  const { files } = await deploymentFiles();
  const cases = [
    ['missing badge', statusHtml({ badge: '' })],
    ['missing notice', statusHtml({ releaseNote: '' })],
    ['incorrect badge wording', statusHtml({ badge: '<small id="release-badge">Candidate build</small>' })],
    ['incorrect notice wording', statusHtml({ releaseNote: '<p class="release-note">Phone testing complete.</p>' })]
  ];
  for (const [name, html] of cases) await t.test(name, () => assertDisclosureRejected(html, files));
  const missing = replaceFile(files, 'index.html', statusHtml({ badge: '' }));
  await assert.rejects(verify(missing), /index\.html live integrity mismatch/);
});

test('direct and ancestor semantic hiding remains rejected', async t => {
  const { files } = await deploymentFiles();
  const wrap = attributes => `<div ${attributes}><small id="release-badge">${label}</small></div>`;
  const cases = [
    ['direct hidden', `<small id="release-badge" hidden>${label}</small>`],
    ['direct inert', `<small id="release-badge" inert>${label}</small>`],
    ['direct aria-hidden quoted', `<small id="release-badge" aria-hidden="true">${label}</small>`],
    ['direct aria-hidden unquoted', `<small id="release-badge" aria-hidden=true>${label}</small>`],
    ['direct display none unquoted', `<small id="release-badge" style=display:none>${label}</small>`],
    ['direct visibility hidden unquoted', `<small id="release-badge" style=visibility:hidden>${label}</small>`],
    ['hidden ancestor', wrap('hidden')],
    ['inert ancestor', wrap('inert')],
    ['aria-hidden ancestor', wrap('aria-hidden=true')],
    ['display none ancestor', wrap('style=display:none')],
    ['visibility hidden ancestor', wrap('style=visibility:hidden')]
  ];
  for (const [name, badge] of cases) await t.test(name, () => assertDisclosureRejected(statusHtml({ badge }), files));
});

test('bounded explicit CSS nonvisibility mechanisms are rejected on disclosures and ancestors', async t => {
  const { files } = await deploymentFiles();
  const direct = style => `<small id="release-badge" style="${style}">${label}</small>`;
  const ancestor = style => `<div style="${style}"><small id="release-badge">${label}</small></div>`;
  const cases = [
    ['direct content visibility', direct('content-visibility:hidden')],
    ['ancestor content visibility', ancestor('content-visibility:hidden')],
    ['direct opacity', direct('opacity:0')],
    ['ancestor opacity', ancestor('opacity:0')],
    ['direct filter opacity', direct('filter:opacity(0)')],
    ['ancestor filter opacity', ancestor('filter:opacity(0%)')],
    ['transparent text', direct('color:transparent')],
    ['font size zero', direct('font-size:0')],
    ['line height zero', direct('line-height:0')],
    ['scale zero', direct('transform:scale(0)')],
    ['clip rect', direct('position:absolute;clip:rect(0,0,0,0)')],
    ['clip path', direct('clip-path:inset(50%)')],
    ['zero-size overflow ancestor', ancestor('width:0;height:0;overflow:hidden')],
    ['fixed far offscreen', direct('position:fixed;left:-100000px')],
    ['translated far offscreen', direct('transform:translateX(-100000px)')],
    ['zero area', direct('display:block;width:0;height:0;overflow:hidden')]
  ];
  for (const [name, badge] of cases) await t.test(name, () => assertDisclosureRejected(statusHtml({ badge }), files));
});

test('stylesheet-based adjacent hiding mechanisms are rejected', async t => {
  const { files } = await deploymentFiles();
  const rules = [
    ['display none', 'display:none'],
    ['visibility hidden', 'visibility:hidden'],
    ['ordinary opacity', 'opacity:0'],
    ['filter opacity', 'filter:opacity(0)'],
    ['content visibility', 'content-visibility:hidden'],
    ['transparent text', 'color:transparent'],
    ['font zero', 'font-size:0'],
    ['scale zero', 'transform:scale(0)'],
    ['clip path', 'clip-path:inset(50%)']
  ];
  for (const [name, rule] of rules) {
    const html = statusHtml({ head: `<style>.concealed{${rule}}</style>`, badge: `<small id="release-badge" class="concealed">${label}</small>` });
    await t.test(name, () => assertDisclosureRejected(html, files));
  }
});

test('approved wording must be supplied by perceptible descendant text runs for both disclosures', async t => {
  const { files } = await deploymentFiles();
  const selectors = [
    ['badge', text => `<small id="release-badge">${text}</small>`, label],
    ['notice', text => `<p class="release-note">${text}</p>`, notice]
  ];
  const hiddenRuns = [
    ['opacity zero', text => `<span style="opacity:0">${text}</span>`],
    ['nested opacity zero', text => `<span><span style="opacity:0">${text}</span></span>`],
    ['filter opacity zero', text => `<span style="filter:opacity(0)">${text}</span>`],
    ['content visibility hidden', text => `<span style="content-visibility:hidden">${text}</span>`],
    ['display none', text => `<span style="display:none">${text}</span>`],
    ['visibility hidden', text => `<span style="visibility:hidden">${text}</span>`],
    ['hidden attribute', text => `<span hidden>${text}</span>`],
    ['inert attribute', text => `<span inert>${text}</span>`],
    ['aria hidden', text => `<span aria-hidden="true">${text}</span>`],
    ['transparent color', text => `<span style="color:transparent">${text}</span>`],
    ['transparent text fill', text => `<span style="-webkit-text-fill-color:transparent">${text}</span>`],
    ['font size zero', text => `<span style="font-size:0">${text}</span>`],
    ['scale zero', text => `<span style="transform:scale(0);display:inline-block">${text}</span>`],
    ['complete clip', text => `<span style="position:absolute;clip:rect(0,0,0,0)">${text}</span>`],
    ['clip path', text => `<span style="clip-path:inset(50%);display:inline-block">${text}</span>`],
    ['zero-area overflow', text => `<span style="display:inline-block;width:0;height:0;overflow:hidden">${text}</span>`],
    ['partial overflow clipping', text => `<span style="display:inline-block;width:2ch;white-space:nowrap;overflow:hidden">${text}</span>`],
    ['far offscreen', text => `<span style="position:fixed;left:-100000px">${text}</span>`]
  ];
  for (const [selectorName, render, expectedText] of selectors) {
    for (const [caseName, hide] of hiddenRuns) {
      const hidden = render(hide(expectedText));
      const html = selectorName === 'badge' ? statusHtml({ badge: hidden }) : statusHtml({ releaseNote: hidden });
      await t.test(`${selectorName}: ${caseName}`, () => assertDisclosureRejected(html, files));
    }
    await t.test(`${selectorName}: visible phrase split across descendants`, async () => {
      const midpoint = expectedText.indexOf(' ', Math.floor(expectedText.length / 2));
      const split = render(`<span>${expectedText.slice(0, midpoint + 1)}</span><span>${expectedText.slice(midpoint + 1)}</span>`);
      const html = selectorName === 'badge' ? statusHtml({ badge: split }) : statusHtml({ releaseNote: split });
      assert.equal((await inspect(html, replaceFile(files, 'index.html', html))).pass, true);
    });
    await t.test(`${selectorName}: nested visible wording`, async () => {
      const nested = render(`<span><strong>${expectedText}</strong></span>`);
      const html = selectorName === 'badge' ? statusHtml({ badge: nested }) : statusHtml({ releaseNote: nested });
      assert.equal((await inspect(html, replaceFile(files, 'index.html', html))).pass, true);
    });
    await t.test(`${selectorName}: hidden duplicate plus visible valid wording`, async () => {
      const mixed = render(`<span style="opacity:0">${expectedText}</span><span>${expectedText}</span>`);
      const html = selectorName === 'badge' ? statusHtml({ badge: mixed }) : statusHtml({ releaseNote: mixed });
      assert.equal((await inspect(html, replaceFile(files, 'index.html', html))).pass, true);
    });
    await t.test(`${selectorName}: partially visible wording lacks required characters`, () => {
      const partial = render(`<span>${expectedText.slice(0, -1)}</span><span style="opacity:0">${expectedText.slice(-1)}</span>`);
      const html = selectorName === 'badge' ? statusHtml({ badge: partial }) : statusHtml({ releaseNote: partial });
      return assertDisclosureRejected(html, files, /perceptible rendered text/);
    });
    await t.test(`${selectorName}: visible surrounding text cannot rescue hidden wording`, () => {
      const surrounded = render(`<span>Visible prefix </span><span style="opacity:0">${expectedText}</span><span> visible suffix</span>`);
      const html = selectorName === 'badge' ? statusHtml({ badge: surrounded }) : statusHtml({ releaseNote: surrounded });
      return assertDisclosureRejected(html, files, /perceptible rendered text/);
    });
  }
});

test('source text, inactive content, scripts, and selector lookalikes are rejected', async t => {
  const { files } = await deploymentFiles();
  const exactMarkup = `<small id="release-badge">${label}</small><p class="release-note">${notice}</p>`;
  const cases = [
    ['HTML comment', statusHtml({ badge: `<!-- ${exactMarkup} -->`, releaseNote: '' })],
    ['template content', statusHtml({ badge: `<template>${exactMarkup}</template>`, releaseNote: '' })],
    ['script text', statusHtml({ badge: `<script type="text/plain">${exactMarkup}</script>`, releaseNote: '' })],
    ['style text', statusHtml({ badge: `<style>/* ${exactMarkup} */</style>`, releaseNote: '' })],
    ['data-id lookalike', statusHtml({ badge: `<small data-id="release-badge">${label}</small>` })],
    ['data-class lookalike', statusHtml({ releaseNote: `<p data-class="release-note">${notice}</p>` })],
    ['JavaScript-created disclosure', statusHtml({ badge: '', releaseNote: '', tail: `<script>document.body.innerHTML=${JSON.stringify(exactMarkup)}</script>` })]
  ];
  for (const [name, html] of cases) await t.test(name, () => assertDisclosureRejected(html, files));
});

test('duplicate intended elements and obsolete CANDIDATE traps fail closed', async t => {
  const { files } = await deploymentFiles();
  const visibleBadge = `<small id="release-badge">${label}</small>`;
  const hiddenBadge = `<small id="release-badge" hidden>${label}</small>`;
  const visibleNotice = `<p class="release-note">${notice}</p>`;
  const hiddenNotice = `<p class="release-note" hidden>${notice}</p>`;
  const cases = [
    ['hidden badge first', statusHtml({ badge: hiddenBadge + visibleBadge })],
    ['hidden badge second', statusHtml({ badge: visibleBadge + hiddenBadge })],
    ['two visible badges', statusHtml({ badge: visibleBadge + visibleBadge })],
    ['hidden notice first', statusHtml({ releaseNote: hiddenNotice + visibleNotice })],
    ['hidden notice second', statusHtml({ releaseNote: visibleNotice + hiddenNotice })],
    ['two visible notices', statusHtml({ releaseNote: visibleNotice + visibleNotice })],
    ['unrelated obsolete text', '<!doctype html><html><head></head><body><main>CANDIDATE</main></body></html>'],
    ['hidden obsolete text', '<!doctype html><html><head></head><body><main><span hidden>CANDIDATE</span></main></body></html>']
  ];
  for (const [name, html] of cases) await t.test(name, () => assertDisclosureRejected(html, files));
});

test('rendering fails closed for incomplete, blocked, redirected, or uncontrolled resources', async t => {
  const { files } = await deploymentFiles();
  const linked = statusHtml({ head: '<link rel="stylesheet" href="hide.css">' });
  const withLinked = replaceFile(replaceFile(files, 'index.html', linked), 'hide.css', '.release-note{display:block}');
  const allowed = new Set(['index.html', ...withLinked.keys()]);
  await t.test('missing same-origin stylesheet', async () => {
    await assert.rejects(inspectVisibleTestVersionDisclosure(linked, {
      browser, liveBaseUrl: testUrl, allowedResourcePaths: allowed,
      fetchResourceImpl: async () => { throw new Error('missing'); }
    }), /authored stylesheet|render resources were incomplete/);
  });
  await t.test('blocked external stylesheet', async () => {
    const html = statusHtml({ head: '<link rel="stylesheet" href="https://outside.invalid/hide.css">' });
    await assert.rejects(inspect(html, files), /authored|render resources were incomplete/);
  });
  await t.test('blocked external image', async () => {
    const html = statusHtml({ tail: '<img src="https://outside.invalid/pixel.svg" alt="">' });
    await assert.rejects(inspect(html, files), /authored|render resources were incomplete/);
  });
  await t.test('rejected controlled loader', async () => {
    await assert.rejects(inspectVisibleTestVersionDisclosure(linked, {
      browser, liveBaseUrl: testUrl, allowedResourcePaths: allowed,
      fetchResourceImpl: async () => Promise.reject(new Error('loader rejected'))
    }), /authored stylesheet|render resources were incomplete/);
  });
  await t.test('unfulfilled controlled loader times out', async () => {
    await assert.rejects(inspectVisibleTestVersionDisclosure(linked, {
      browser, liveBaseUrl: testUrl, allowedResourcePaths: allowed, lifecycleTimeoutMs: 50,
      fetchResourceImpl: async () => new Promise(() => {})
    }), /timed out/);
  });
  await t.test('outside-origin redirect metadata', async () => {
    await assert.rejects(inspectVisibleTestVersionDisclosure(linked, {
      browser, liveBaseUrl: testUrl, allowedResourcePaths: allowed,
      fetchResourceImpl: async () => ({ bytes: Buffer.from(''), finalUrl: 'https://outside.invalid/hide.css' })
    }), /outside the approved origin/);
  });
  await t.test('outside-base redirect metadata', async () => {
    await assert.rejects(inspectVisibleTestVersionDisclosure(linked, {
      browser, liveBaseUrl: testUrl, allowedResourcePaths: allowed,
      fetchResourceImpl: async () => ({ bytes: Buffer.from(''), finalUrl: 'https://candidate-verifier.invalid/outside.css' })
    }), /outside the approved base path/);
  });
  await t.test('different approved-path redirect metadata', async () => {
    const redirects = new Set([...allowed, 'other.css']);
    await assert.rejects(inspectVisibleTestVersionDisclosure(linked, {
      browser, liveBaseUrl: testUrl, allowedResourcePaths: redirects,
      fetchResourceImpl: async () => ({ bytes: Buffer.from(''), finalUrl: new URL('other.css', testUrl).href })
    }), /redirected to other.css/);
  });
});

test('original authored render-resource forms are rejected end-to-end before normalized destinations can pass', async t => {
  const { files } = await deploymentFiles();
  const withCss = replaceFile(files, 'ok.css', Buffer.from('body{margin:0}'));
  const cases = [
    ['root-relative absolute', '/base/ok.css'],
    ['scheme-relative', '//candidate-verifier.invalid/base/ok.css'],
    ['fully absolute same-origin', 'https://candidate-verifier.invalid/base/ok.css'],
    ['fully absolute cross-origin', 'https://outside.invalid/ok.css'],
    ['fragment', 'ok.css#fragment'],
    ['query', 'ok.css?version=1'],
    ['literal dot segment', 'sub/../ok.css'],
    ['encoded dot segment', 'sub/%2e%2e/ok.css'],
    ['encoded traversal mixed case', 'sub/%2E%2e/ok.css'],
    ['encoded forward separator', 'sub%2f..%2fok.css'],
    ['encoded backslash separator', 'sub%5c..%5cok.css'],
    ['double-encoded traversal', 'sub/%252e%252e/ok.css'],
    ['unknown path normalized to approved destination', 'unknown/../ok.css']
  ];
  for (const [name, href] of cases) {
    await t.test(name, async () => {
      const html = statusHtml({ head: `<link rel="stylesheet" href="${href}">` });
      await assert.rejects(inspect(html, replaceFile(withCss, 'index.html', html)), /authored|render resources were incomplete/);
    });
  }
  await t.test('legitimate deployment-relative reference passes', async () => {
    const html = statusHtml({ head: '<link rel="stylesheet" href="ok.css">' });
    assert.equal((await inspect(html, replaceFile(withCss, 'index.html', html))).pass, true);
  });
  await t.test('legitimate explicit deployment-relative reference passes', async () => {
    const html = statusHtml({ head: '<link rel="stylesheet" href="./ok.css">' });
    assert.equal((await inspect(html, replaceFile(withCss, 'index.html', html))).pass, true);
  });
  await t.test('stylesheet import is rejected before becoming an uncontrolled render dependency', async () => {
    const html = statusHtml({ head: '<style>@import url("ok.css");</style>' });
    await assert.rejects(inspect(html, replaceFile(withCss, 'index.html', html)), /stylesheet resource references are not approved/);
  });
  await t.test('inline CSS URL is rejected', async () => {
    const html = statusHtml({ tail: '<div style="background-image:url(ok.css)"></div>' });
    await assert.rejects(inspect(html, replaceFile(withCss, 'index.html', html)), /stylesheet resource references are not approved/);
  });
});

test('every browser-fetched authored construct is validated before Chromium normalization', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.css', 'body{margin:0}');
  resources = replaceFile(resources, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  resources = replaceFile(resources, 'ok.vtt', 'WEBVTT\n');
  resources = replaceFile(resources, 'frame.html', '<!doctype html><html><head></head><body>frame</body></html>');
  const prohibited = [
    ['link preload href', { head: '<link rel="preload" as="style" href="/base/ok.css">' }],
    ['iframe src', { tail: '<iframe src="/base/frame.html"></iframe>' }],
    ['embed src', { tail: '<embed src="/base/ok.svg">' }],
    ['SVG image href', { tail: '<svg><image href="/base/ok.svg"></image></svg>' }],
    ['SVG image xlink href', { tail: '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="/base/ok.svg"></image></svg>' }],
    ['SVG use href', { tail: '<svg><use href="/base/ok.svg"></use></svg>' }],
    ['SVG feImage href', { tail: '<svg><filter><feImage href="/base/ok.svg"></feImage></filter></svg>' }],
    ['track src', { tail: '<video><track src="/base/ok.vtt"></video>' }],
    ['object data', { tail: '<object data="/base/ok.svg"></object>' }],
    ['video poster', { tail: '<video poster="/base/ok.svg"></video>' }],
    ['source src', { tail: '<picture><source src="/base/ok.svg"><img src="ok.svg" alt=""></picture>' }],
    ['input image src', { tail: '<input type="image" src="/base/ok.svg" alt="">' }],
    ['legacy background', { tail: '<table background="/base/ok.svg"><tr><td>x</td></tr></table>' }],
    ['iframe srcdoc resource', { tail: `<iframe srcdoc='<img src="/base/ok.svg" alt="">'></iframe>` }],
    ['declarative shadow DOM resource', { tail: '<div><template shadowrootmode="open"><img src="/base/ok.svg" alt=""></template></div>' }]
  ];
  for (const [name, parts] of prohibited) {
    await t.test(name, async () => {
      const html = statusHtml(parts);
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /authored/);
    });
  }
  await t.test('legacy frame src is rejected before navigation', async () => {
    const html = '<!doctype html><html><head></head><frameset><frame src="/base/frame.html"></frameset></html>';
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /frame source/);
  });
  await t.test('nested external document resource is validated in its own relative directory', async () => {
    let nested = replaceFile(resources, 'frames/frame.html', '<!doctype html><html><head></head><body><img src="./ok.svg" alt=""></body></html>');
    nested = replaceFile(nested, 'frames/ok.svg', resources.get('ok.svg'));
    const html = statusHtml({ tail: '<iframe src="./frames/frame.html"></iframe>' });
    assert.equal((await inspect(html, replaceFile(nested, 'index.html', html))).pass, true);
  });
  await t.test('root-relative resource inside nested external document fails', async () => {
    const nested = replaceFile(resources, 'frame.html', '<!doctype html><html><head></head><body><img src="/base/ok.svg" alt=""></body></html>');
    const html = statusHtml({ tail: '<iframe src="frame.html"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /authored img src reference/);
  });
  await t.test('document-capable embed content is rejected before navigation', async () => {
    const nested = replaceFile(resources, 'embed.html', '<!doctype html><html><head></head><body><img src="/base/ok.svg" alt=""></body></html>');
    const html = statusHtml({ tail: '<embed src="embed.html" type="text/html">' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /embed source/);
  });
  await t.test('legitimate iframe srcdoc relative resource passes', async () => {
    const html = statusHtml({ tail: `<iframe srcdoc='<!doctype html><html><head></head><body><img src="./ok.svg" alt=""></body></html>'></iframe>` });
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });
  await t.test('declarative shadow DOM is rejected because complete application state is not inspectable', async () => {
    const html = statusHtml({ tail: '<div><template shadowrootmode="open"><img src="./ok.svg" alt=""></template></div>' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /declarative shadow root/);
  });
  await t.test('srcset fails closed because literal candidate pairing is ambiguous', async () => {
    const html = statusHtml({ tail: '<img src="ok.svg" srcset="ok.svg 1x" alt="">' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /srcset references are not approved/);
  });
  await t.test('nested srcdoc CSS URL dependency fails closed', async () => {
    const html = statusHtml({ tail: `<iframe srcdoc='<!doctype html><html><head><style>body{background:url(ok.svg)}</style></head><body></body></html>'></iframe>` });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /stylesheet resource references are not approved/);
  });
  await t.test('base href fails closed before it can change resource resolution', async () => {
    const html = statusHtml({ head: '<base href="/base/">' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /unsupported authored navigation controls/);
  });
  await t.test('meta refresh fails closed', async () => {
    const html = statusHtml({ head: '<meta http-equiv="refresh" content="0;url=ok.svg">' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /unsupported authored navigation controls/);
  });
  await t.test('object codebase fails closed', async () => {
    const html = statusHtml({ tail: '<object codebase="/base/" data="ok.svg"></object>' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /unsupported authored navigation controls/);
  });
  await t.test('recursive nested document fails within the bounded preflight', async () => {
    const html = statusHtml({ tail: '<iframe src="index.html"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /recursive nested-document reference/);
  });
});

test('structured authored-reference pairing prevents normalization and authorization borrowing', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  resources = replaceFile(resources, 'nested/frame.html', '<!doctype html><html><head></head><body><img src="/base/ok.svg" alt=""></body></html>');

  await t.test('non-fetching canonical metadata cannot authorize a prohibited legacy background', async () => {
    const html = statusHtml({
      head: '<link rel="canonical" href="ok.svg">',
      tail: '<table><tbody background="/base/ok.svg"><tr><td>x</td></tr></tbody></table>'
    });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /tbody legacy background resource/);
  });
  await t.test('non-fetching canonical metadata may share a destination with a valid fetching image', async () => {
    const html = statusHtml({ head: '<link rel="canonical" href="ok.svg">', tail: '<img src="ok.svg" alt="">' });
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });
  await t.test('absolute canonical metadata remains legitimate and does not generate a request', async () => {
    const html = statusHtml({ head: '<link rel="canonical" href="https://metadata.invalid/companion">' });
    const fetched = [];
    const result = await inspect(html, replaceFile(resources, 'index.html', html), {
      fetchResourceImpl: localResourceLoader(resources, fetched)
    });
    assert.equal(result.pass, true);
    assert.deepEqual(fetched, []);
  });
  await t.test('a valid top-level image cannot authorize a prohibited fetching construct at the same destination', async () => {
    const html = statusHtml({
      tail: '<img src="ok.svg" alt=""><table background="/base/ok.svg"><tr><td>x</td></tr></table>'
    });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /table legacy background resource/);
  });
  await t.test('a valid top-level image cannot authorize a prohibited nested-document source', async () => {
    const html = statusHtml({ tail: '<img src="ok.svg" alt=""><iframe src="nested/frame.html"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /authored img src reference.*nested document/s);
  });
  await t.test('a hidden valid image cannot authorize a prohibited legacy background', async () => {
    const html = statusHtml({
      tail: '<img src="ok.svg" alt="" hidden><table><tbody background="/base/ok.svg"><tr><td>x</td></tr></tbody></table>'
    });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /tbody legacy background resource/);
  });
  await t.test('duplicate legitimate fetching references with the same literal remain supported', async () => {
    const html = statusHtml({ tail: '<img src="ok.svg" alt=""><img src="ok.svg" alt="">' });
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });
  await t.test('repeated instances of one external document retain equivalent duplicate resources', async () => {
    let repeated = replaceFile(resources, 'nested/repeat.html', '<!doctype html><html><head></head><body><img src="./ok.svg" alt=""></body></html>');
    repeated = replaceFile(repeated, 'nested/ok.svg', resources.get('ok.svg'));
    const html = statusHtml({ tail: '<iframe src="nested/repeat.html"></iframe><iframe src="nested/repeat.html"></iframe>' });
    assert.equal((await inspect(html, replaceFile(repeated, 'index.html', html))).pass, true);
  });
  await t.test('distinct literals normalized to one active owner-kind-destination fail closed', async () => {
    const html = statusHtml({ tail: '<img src="ok.svg" alt=""><img src="./ok.svg" alt="">' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /ambiguous authored fetch references/);
  });
  await t.test('two different fetching kinds at the same destination cannot borrow authorization', async () => {
    const html = statusHtml({ head: '<link rel="stylesheet" href="ok.svg">', tail: '<img src="ok.svg" alt="">' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /supported text\/css/);
  });
});

test('document-instance reference accounting proves every coalesced application independently', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="black"/></svg>');
  resources = replaceFile(resources, 'nested/repeat.html', '<!doctype html><html><head></head><body><img src="ok.svg" alt=""></body></html>');
  resources = replaceFile(resources, 'nested/ok.svg', resources.get('ok.svg'));

  await t.test('two identical image references may share one browser request only after both decode visibly', async () => {
    const html = statusHtml({ tail: '<img src="ok.svg" alt=""><img src="ok.svg" alt="">' });
    const fixture = replaceFile(resources, 'index.html', html);
    const fetched = [];
    assert.equal((await inspect(html, fixture, { fetchResourceImpl: localResourceLoader(fixture, fetched) })).pass, true);
    assert.equal(fetched.filter(path => path === 'ok.svg').length, 2);
  });

  await t.test('a coalesced visible image cannot discharge a hidden duplicate reference', async () => {
    const html = statusHtml({ tail: '<img src="ok.svg" alt=""><img src="ok.svg" alt="" hidden>' });
    await assert.rejects(
      inspect(html, replaceFile(resources, 'index.html', html)),
      /occurrence 1.*hidden or inactive/
    );
  });

  await t.test('repeated legitimate external document instances each prove their own nested image', async () => {
    const html = statusHtml({ tail: '<iframe src="nested/repeat.html"></iframe><iframe src="nested/repeat.html"></iframe>' });
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });

  await t.test('one visible document instance cannot discharge a hidden repeated instance', async () => {
    const html = statusHtml({ tail: '<iframe src="nested/repeat.html"></iframe><iframe src="nested/repeat.html" hidden></iframe>' });
    await assert.rejects(
      inspect(html, replaceFile(resources, 'index.html', html)),
      /occurrence 1 in document instance root.*hidden or inactive/
    );
  });

  await t.test('an invalid declarative-shadow template cannot borrow a root image request', async () => {
    const html = statusHtml({
      tail: '<img src="ok.svg" alt=""><template shadowrootmode="invalid"><img src="ok.svg" alt=""></template>'
    });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /declarative shadow root/);
  });

  await t.test('a root image cannot authorize a tbody background with the same literal', async () => {
    const html = statusHtml({
      tail: '<img src="ok.svg" alt=""><table><tbody background="ok.svg"><tr><td>x</td></tr></tbody></table>'
    });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /tbody legacy background resource/);
  });
});

test('supported visual resources prove decode/application and ambiguous visual constructs fail before navigation', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="black"/></svg>');
  resources = replaceFile(resources, 'broken.svg', '<svg');
  resources = replaceFile(resources, 'frame.html', '<!doctype html><html><head></head><body><img src="ok.svg" alt=""></body></html>');

  await t.test('a visible eager HTML img with a valid delivered SVG decodes and passes', async () => {
    const html = statusHtml({ tail: '<img src="ok.svg" alt="">' });
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });

  await t.test('a visible eager HTML img with a broken SVG fails decode/application', async () => {
    const html = statusHtml({ tail: '<img src="broken.svg" alt="">' });
    await assert.rejects(
      inspect(html, replaceFile(resources, 'index.html', html)),
      /not successfully decoded\/applied.*could not decode/
    );
  });

  await t.test('an inspectable unsandboxed external iframe and its nested image pass', async () => {
    const html = statusHtml({ tail: '<iframe src="frame.html"></iframe>' });
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });

  await t.test('an inspectable unsandboxed srcdoc and its nested image pass', async () => {
    const html = statusHtml({ tail: '<iframe srcdoc="&lt;!doctype html&gt;&lt;html&gt;&lt;head&gt;&lt;/head&gt;&lt;body&gt;&lt;img src=&quot;ok.svg&quot; alt=&quot;&quot;&gt;&lt;/body&gt;&lt;/html&gt;"></iframe>' });
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });

  const unsupported = [
    ['open declarative shadow root', '<template shadowrootmode="open"><img src="ok.svg" alt=""></template>', /declarative shadow root/],
    ['closed declarative shadow root', '<template shadowrootmode="closed"><img src="ok.svg" alt=""></template>', /declarative shadow root/],
    ['invalid declarative shadow root', '<template shadowrootmode="invalid"><img src="ok.svg" alt=""></template>', /declarative shadow root/],
    ['sandboxed external iframe', '<iframe sandbox src="frame.html"></iframe>', /sandboxed iframe content/],
    ['sandboxed srcdoc iframe', '<iframe sandbox srcdoc="&lt;img src=&quot;ok.svg&quot;&gt;"></iframe>', /sandboxed iframe srcdoc/],
    ['SVG image href', '<svg><image href="ok.svg"></image></svg>', /unsupported SVG image href external reference/],
    ['SVG image xlink href', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="ok.svg"></image></svg>', /unsupported SVG image xlink:href external reference/],
    ['SVG use', '<svg><use href="ok.svg"></use></svg>', /unsupported SVG use href external reference/],
    ['SVG feImage', '<svg><filter><feImage href="ok.svg"></feImage></filter></svg>', /unsupported SVG feImage href external reference/i],
    ['video poster', '<video poster="ok.svg"></video>', /video poster/],
    ['legacy background', '<table background="ok.svg"><tr><td>x</td></tr></table>', /legacy background resource/],
    ['SVG mask', '<svg><path mask="url(ok.svg)"></path></svg>', /unsupported SVG mask external URL form/],
    ['image input with valid SVG', '<input type="image" src="ok.svg" alt="">', /input type=image source/],
    ['image input with broken SVG', '<input type="image" src="broken.svg" alt="">', /input type=image source/],
    ['image input with a PNG alias', '<input type="image" src="ok.png" alt="">', /input type=image source/],
    ['object data', '<object data="ok.svg"></object>', /object data/],
    ['embed source', '<embed src="frame.html">', /embed source/]
  ];
  for (const [name, tail, expected] of unsupported) {
    await t.test(`${name} is rejected before browser loading`, async () => {
      const html = statusHtml({ tail });
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), expected);
    });
  }

  await t.test('inline SVG without an external URL-bearing construct remains valid', async () => {
    const html = statusHtml({ tail: '<svg width="2" height="2"><rect width="2" height="2" fill="black"></rect></svg>' });
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });
});

test('the complete bounded HTML legacy-background and SVG URL-attribute inventory fails closed on prohibited literals', async t => {
  const { files } = await deploymentFiles();
  const resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  const legacyCases = [
    ['body', html => html.replace('<body>', '<body background="/base/ok.svg">')],
    ['table', html => html.replace('</body>', '<table background="/base/ok.svg"><tr><td>x</td></tr></table></body>')],
    ['td', html => html.replace('</body>', '<table><tr><td background="/base/ok.svg">x</td></tr></table></body>')],
    ['th', html => html.replace('</body>', '<table><tr><th background="/base/ok.svg">x</th></tr></table></body>')],
    ['thead', html => html.replace('</body>', '<table><thead background="/base/ok.svg"><tr><th>x</th></tr></thead></table></body>')],
    ['tbody', html => html.replace('</body>', '<table><tbody background="/base/ok.svg"><tr><td>x</td></tr></tbody></table></body>')],
    ['tfoot', html => html.replace('</body>', '<table><tfoot background="/base/ok.svg"><tr><td>x</td></tr></tfoot></table></body>')],
    ['tr', html => html.replace('</body>', '<table><tr background="/base/ok.svg"><td>x</td></tr></table></body>')],
    ['col', html => html.replace('</body>', '<table><colgroup><col background="/base/ok.svg"></colgroup><tr><td>x</td></tr></table></body>')],
    ['colgroup', html => html.replace('</body>', '<table><colgroup background="/base/ok.svg"><col></colgroup><tr><td>x</td></tr></table></body>')]
  ];
  for (const [tag, makeHtml] of legacyCases) {
    await t.test(`${tag} background`, async () => {
      const html = makeHtml(statusHtml());
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), new RegExp(`${tag} legacy background resource`));
    });
  }

  for (const attribute of [
    'fill', 'stroke', 'mask', 'clip-path', 'filter', 'marker',
    'marker-start', 'marker-mid', 'marker-end', 'cursor'
  ]) {
    await t.test(`SVG ${attribute} url`, async () => {
      const html = statusHtml({ tail: `<svg><path d="M0 0L1 1" ${attribute}="url(/base/ok.svg)"></path></svg>` });
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), new RegExp(`unsupported SVG ${attribute} external URL form`));
    });
  }
  await t.test('ambiguous multi-URL SVG presentation syntax fails closed', async () => {
    const html = statusHtml({ tail: '<svg><path fill="url(ok.svg) url(ok.svg)"></path></svg>' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /unsupported SVG fill external URL form/);
  });
  await t.test('unknown SVG URL-bearing presentation attribute fails closed', async () => {
    const html = statusHtml({ tail: '<svg><path data-paint="url(ok.svg)"></path></svg>' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /unsupported SVG data-paint URL presentation attribute/);
  });
  await t.test('a legacy background on an unrecognized owner fails closed', async () => {
    const html = statusHtml({ tail: '<section background="ok.svg">x</section>' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /section legacy background resource/);
  });
  await t.test('an unrecognized HTML src-bearing owner fails closed', async () => {
    const html = statusHtml({ tail: '<div src="ok.svg">x</div>' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /unsupported div src resource/);
  });
});

test('all reproduced prohibited authored source syntaxes are rejected without destination collisions', async t => {
  const { files } = await deploymentFiles();
  const resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  const prohibited = [
    ['root relative', '/base/ok.svg'],
    ['scheme relative', '//candidate-verifier.invalid/base/ok.svg'],
    ['fully absolute same origin', 'https://candidate-verifier.invalid/base/ok.svg'],
    ['fully absolute cross origin', 'https://outside.invalid/ok.svg'],
    ['fragment bearing', 'ok.svg#fragment'],
    ['query bearing', 'ok.svg?version=1'],
    ['literal dot', 'sub/../ok.svg'],
    ['encoded dot', 'sub/%2e%2e/ok.svg'],
    ['double encoded traversal', 'sub/%252e%252e/ok.svg'],
    ['encoded forward separator', 'sub%2f..%2fok.svg'],
    ['encoded backslash separator', 'sub%5c..%5cok.svg'],
    ['literal backslash', 'sub\\..\\ok.svg'],
    ['partially encoded alias', 'o%6b.svg'],
    ['mixed-case encoded alias', '%6f%6B.svg'],
    ['double-encoded alias', 'ok%252esvg']
  ];
  for (const [name, value] of prohibited) {
    await t.test(name, async () => {
      const html = statusHtml({ tail: `<img src="${value}" alt="">` });
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /authored img src reference/);
    });
  }
  for (const value of ['ok.svg', './ok.svg']) {
    await t.test(`legitimate ${value}`, async () => {
      const html = statusHtml({ tail: `<img src="${value}" alt="">` });
      assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
    });
  }
});

test('navigation controls are validated as navigation-only and cannot authorize render resources', async t => {
  const { files } = await deploymentFiles();
  const resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');

  for (const href of ['#app-main', '#companion-home', 'https://mountainguide.vondadowns.com/', 'tel:911']) {
    await t.test(`locked candidate.6 navigation literal ${href} remains accepted as non-fetching`, async () => {
      const html = statusHtml({ tail: `<a href="${href}">navigation</a>` });
      assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
    });
  }

  const rejectedAnchors = [
    ['root relative', '/base/ok.svg'],
    ['scheme relative', '//candidate-verifier.invalid/base/ok.svg'],
    ['same-origin absolute', 'https://candidate-verifier.invalid/base/ok.svg'],
    ['other absolute', 'https://outside.invalid/ok.svg'],
    ['query', 'ok.svg?next=1'],
    ['unapproved fragment', '#ok.svg'],
    ['traversal', '../ok.svg'],
    ['backslash', 'sub\\ok.svg'],
    ['percent alias', 'o%6b.svg'],
    ['mixed-case percent alias', '%6f%6B.svg'],
    ['repeated encoding', 'ok%252esvg']
  ];
  for (const [name, href] of rejectedAnchors) {
    await t.test(`${name} anchor destination is rejected before normalization`, async () => {
      const html = statusHtml({ tail: `<a href="${href}">navigation</a>` });
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /navigation.*not one of the locked candidate\.6 navigation literals/);
    });
  }

  for (const [name, tail, expected] of [
    ['root-relative form action', '<form action="/base/ok.svg"></form>', /form action navigation/],
    ['relative form action', '<form action="ok.svg"></form>', /form action navigation/],
    ['button formaction', '<form><button formaction="ok.svg">go</button></form>', /button formaction navigation/],
    ['input formaction', '<form><input type="submit" formaction="ok.svg"></form>', /input formaction navigation/],
    ['root-relative area', '<map name="m"><area href="/base/ok.svg" shape="default"></map>', /navigation.*not one/],
    ['anchor ping', '<a href="#app-main" ping="ok.svg">navigation</a>', /a ping navigation/],
    ['blockquote cite', '<blockquote cite="ok.svg">quote</blockquote>', /blockquote cite navigation/]
  ]) {
    await t.test(`${name} is rejected and supplies no render authorization`, async () => {
      const html = statusHtml({ tail });
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), expected);
    });
  }
});

test('nested SVG and XML documents use XML MIME parsing and enforce stylesheet processing instructions', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'nested/ok.css', 'svg{display:block}');
  resources = replaceFile(resources, 'nested/bad.svg', '<?xml version="1.0"?><svg');

  await t.test('root-relative nested SVG XML stylesheet is rejected', async () => {
    const svg = '<?xml version="1.0"?><?xml-stylesheet type="text/css" href="/base/nested/ok.css"?><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const nested = replaceFile(resources, 'nested/doc.svg', svg);
    const html = statusHtml({ tail: '<iframe src="nested/doc.svg"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /authored \?xml-stylesheet href reference/);
  });
  await t.test('legitimate containing-document-relative XML stylesheet is consumed and readable', async () => {
    const svg = '<?xml version="1.0"?><?xml-stylesheet type="text/css" href="./ok.css"?><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const nested = replaceFile(resources, 'nested/doc.svg', svg);
    const html = statusHtml({ tail: '<iframe src="nested/doc.svg"></iframe>' });
    assert.equal((await inspect(html, replaceFile(nested, 'index.html', html))).pass, true);
  });
  await t.test('malformed XML fails closed under XML parser semantics', async () => {
    const html = statusHtml({ tail: '<iframe src="nested/bad.svg"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /image\/svg\+xml parse error|unterminated/);
  });
  await t.test('alternate XML stylesheet processing instructions fail closed', async () => {
    const svg = '<?xml version="1.0"?><?xml-stylesheet type="text/css" href="ok.css" alternate="yes"?><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const nested = replaceFile(resources, 'nested/doc.svg', svg);
    const html = statusHtml({ tail: '<iframe src="nested/doc.svg"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /unsupported XML stylesheet/);
  });
  await t.test('empty alternate XML stylesheet policy fails closed', async () => {
    const svg = '<?xml version="1.0"?><?xml-stylesheet type="text/css" href="ok.css" alternate=""?><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const nested = replaceFile(resources, 'nested/doc.svg', svg);
    const html = statusHtml({ tail: '<iframe src="nested/doc.svg"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /unsupported XML stylesheet/);
  });
  await t.test('empty XML stylesheet media policy fails closed', async () => {
    const svg = '<?xml version="1.0"?><?xml-stylesheet type="text/css" href="ok.css" media=""?><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const nested = replaceFile(resources, 'nested/doc.svg', svg);
    const html = statusHtml({ tail: '<iframe src="nested/doc.svg"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /unsupported XML stylesheet/);
  });
  await t.test('XML stylesheet processing instructions without explicit text/css fail closed', async () => {
    const svg = '<?xml version="1.0"?><?xml-stylesheet href="ok.css"?><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const nested = replaceFile(resources, 'nested/doc.svg', svg);
    const html = statusHtml({ tail: '<iframe src="nested/doc.svg"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /unsupported XML stylesheet/);
  });
  await t.test('external SYSTEM identifiers in XML DOCTYPE fail closed', async () => {
    const xml = '<?xml version="1.0"?><!DOCTYPE root SYSTEM "outside.dtd"><root />';
    const nested = replaceFile(resources, 'nested/doc.xml', xml);
    const html = statusHtml({ tail: '<iframe src="nested/doc.xml"></iframe>' });
      await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /XML document-type or entity-declaration/);
  });
  await t.test('external PUBLIC identifiers in XML DOCTYPE fail closed', async () => {
    const xml = '<?xml version="1.0"?><!DOCTYPE root PUBLIC "-//TEST//DTD ROOT 1.0//EN" "outside.dtd"><root />';
    const nested = replaceFile(resources, 'nested/doc.xml', xml);
    const html = statusHtml({ tail: '<iframe src="nested/doc.xml"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /XML document-type or entity-declaration/);
  });
  await t.test('XInclude href fails closed', async () => {
    const xml = '<?xml version="1.0"?><root xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="ok.xml"/></root>';
    const nested = replaceFile(resources, 'nested/doc.xml', xml);
    const html = statusHtml({ tail: '<iframe src="nested/doc.xml"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /XInclude element/);
  });
  await t.test('unknown XML URL-bearing constructs fail closed', async () => {
    const xml = '<?xml version="1.0"?><root><asset href="ok.svg"/></root>';
    const nested = replaceFile(resources, 'nested/doc.xml', xml);
    const html = statusHtml({ tail: '<iframe src="nested/doc.xml"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /unknown XML URL-bearing asset href construct/);
  });
  await t.test('unknown XML schemaLocation carriers fail closed', async () => {
    const xml = '<?xml version="1.0"?><root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:test schema.xsd"/>';
    const nested = replaceFile(resources, 'nested/doc.xml', xml);
    const html = statusHtml({ tail: '<iframe src="nested/doc.xml"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /unknown XML URL-bearing root xsi:schemaLocation construct/);
  });
  await t.test('unknown XML path-valued attributes fail closed', async () => {
    const xml = '<?xml version="1.0"?><root><asset path="assets/ok.svg"/></root>';
    const nested = replaceFile(resources, 'nested/doc.xml', xml);
    const html = statusHtml({ tail: '<iframe src="nested/doc.xml"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /unknown XML URL-bearing asset path construct/);
  });
  await t.test('unknown XML URL-bearing processing instructions fail closed', async () => {
    const xml = '<?xml version="1.0"?><?include href="ok.xml"?><root />';
    const nested = replaceFile(resources, 'nested/doc.xml', xml);
    const html = statusHtml({ tail: '<iframe src="nested/doc.xml"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /unsupported XML processing instruction include/);
  });
  for (const [name, data] of [
    ['relative filename', 'ghost.xml'],
    ['root-relative path', '/base/ghost'],
    ['bare host', 'evil.invalid'],
    ['quoted filename', '"ghost.xml"'],
    ['unquoted assignment', 'href=ghost.xml'],
    ['percent encoding', 'ghost%2exml'],
    ['adjacent target', 'fetchghost.xml']
  ]) {
    await t.test(`unknown XML processing instruction rejects ${name}`, async () => {
      const xml = `<?xml version="1.0"?><?fetch ${data}?><root />`;
      const nested = replaceFile(resources, 'nested/doc.xml', xml);
      const html = statusHtml({ tail: '<iframe src="nested/doc.xml"></iframe>' });
      await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /unsupported XML processing instruction fetch/);
    });
  }
  for (const integrity of ['sha256-invalid', 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=']) {
    await t.test(`XML stylesheet processing instruction integrity ${integrity} fails closed`, async () => {
      const xml = `<?xml version="1.0"?><?xml-stylesheet type="text/css" href="ok.css" integrity="${integrity}"?><root/>`;
      const nested = replaceFile(resources, 'nested/doc.xml', xml);
      const html = statusHtml({ tail: '<iframe src="nested/doc.xml"></iframe>' });
      await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /XML stylesheet integrity metadata/);
    });
  }
  await t.test('duplicate XML stylesheet href attributes fail closed', async () => {
    const xml = '<?xml version="1.0"?><?xml-stylesheet type="text/css" href="ok.css" HREF="other.css"?><root/>';
    const nested = replaceFile(resources, 'nested/doc.xml', xml);
    const html = statusHtml({ tail: '<iframe src="nested/doc.xml"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /malformed XML stylesheet processing instruction/);
  });
});

test('nested-document depth, count, and cycle boundaries remain exact', async t => {
  const { files } = await deploymentFiles();

  function documentChain(depth) {
    let resources = new Map(files);
    for (let index = 1; index <= depth; index += 1) {
      const next = index < depth ? `<iframe src="d${index + 1}.html"></iframe>` : '<p>end</p>';
      resources = replaceFile(resources, `docs/d${index}.html`, `<!doctype html><html><head></head><body>${next}</body></html>`);
    }
    const html = statusHtml({ tail: '<iframe src="docs/d1.html"></iframe>' });
    return { html, resources: replaceFile(resources, 'index.html', html) };
  }

  await t.test('eight nested levels below the root pass', async () => {
    const fixture = documentChain(8);
    assert.equal((await inspect(fixture.html, fixture.resources)).pass, true);
  });
  await t.test('nine nested levels below the root fail', async () => {
    const fixture = documentChain(9);
    await assert.rejects(inspect(fixture.html, fixture.resources), /bounded nested-document inspection limit/);
  });
  await t.test('a document seen shallowly cannot bypass the depth limit when repeated deeply', async () => {
    let resources = replaceFile(files, 'docs/shared.html', '<!doctype html><html><head></head><body><p>shared</p></body></html>');
    for (let index = 1; index <= 8; index += 1) {
      const next = index < 8 ? `<iframe src="d${index + 1}.html"></iframe>` : '<iframe src="shared.html"></iframe>';
      resources = replaceFile(resources, `docs/d${index}.html`, `<!doctype html><html><head></head><body>${next}</body></html>`);
    }
    const html = statusHtml({ tail: '<iframe src="docs/shared.html"></iframe><iframe src="docs/d1.html"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /bounded nested-document inspection limit/);
  });
  await t.test('64 inspected documents including the root pass', async () => {
    const frames = '<iframe srcdoc="&lt;!doctype html&gt;&lt;html&gt;&lt;head&gt;&lt;/head&gt;&lt;body&gt;&lt;p&gt;x&lt;/p&gt;&lt;/body&gt;&lt;/html&gt;"></iframe>'.repeat(63);
    const html = statusHtml({ tail: frames });
    assert.equal((await inspect(html, replaceFile(files, 'index.html', html), { lifecycleTimeoutMs: 5000 })).pass, true);
  });
  await t.test('65 inspected documents including the root fail', async () => {
    const frames = '<iframe srcdoc="&lt;!doctype html&gt;&lt;html&gt;&lt;head&gt;&lt;/head&gt;&lt;body&gt;&lt;p&gt;x&lt;/p&gt;&lt;/body&gt;&lt;/html&gt;"></iframe>'.repeat(64);
    const html = statusHtml({ tail: frames });
    await assert.rejects(inspect(html, replaceFile(files, 'index.html', html)), /bounded nested-document inspection limit/);
  });
  await t.test('a recursive external document remains rejected', async () => {
    const html = statusHtml({ tail: '<iframe src="loop.html"></iframe>' });
    const resources = replaceFile(files, 'loop.html', '<!doctype html><html><head></head><body><iframe src="loop.html"></iframe></body></html>');
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /recursive nested-document reference/);
  });
});

test('browser consumption, stylesheet application, SRI, CSP, and inactive-resource policies fail closed', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'hide.css', '#release-badge,.release-note{display:none!important}');
  resources = replaceFile(resources, 'ok.css', 'body{margin:0}');
  resources = replaceFile(resources, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  resources = replaceFile(resources, 'inactive.js', 'throw new Error("must not run")');

  await t.test('a valid applied hiding stylesheet prevents a disclosure pass', async () => {
    const html = statusHtml({ head: '<link rel="stylesheet" href="hide.css">' });
    await assertDisclosureRejected(html, replaceFile(resources, 'index.html', html));
  });
  await t.test('a browser-rejected stylesheet MIME cannot leave an unstyled false pass', async () => {
    const html = statusHtml({ head: '<link rel="stylesheet" href="ok.css">' });
    const fixture = replaceFile(resources, 'index.html', html);
    const loader = async path => ({
      bytes: Buffer.from(fixture.get(path)),
      finalUrl: new URL(path, testUrl).href,
      headers: path === 'ok.css' ? { 'content-type': 'image/svg+xml' } : {}
    });
    await assert.rejects(inspect(html, fixture, { fetchResourceImpl: loader }), /unsupported Content-Type image\/svg\+xml/);
  });
  await t.test('a fulfilled but undecodable image cannot produce a complete-render pass', async () => {
    const html = statusHtml({ tail: '<img src="broken.svg" alt="">' });
    const fixture = replaceFile(replaceFile(resources, 'broken.svg', '<svg'), 'index.html', html);
    await assert.rejects(inspect(html, fixture), /not successfully decoded\/applied.*browser could not decode the image/);
  });
  await t.test('invalid SRI is rejected before rendering', async () => {
    const html = statusHtml({ head: '<link rel="stylesheet" href="hide.css" integrity="sha256-invalid">' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /integrity metadata/);
  });
  await t.test('even syntactically valid SRI is unsupported and rejected by policy', async () => {
    const html = statusHtml({ head: '<link rel="stylesheet" href="ok.css" integrity="sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=">' });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /integrity metadata/);
  });
  for (const [name, tail] of [
    ['top-level stylesheet', ''],
    ['top-level image', '<img src="ok.svg" alt="">'],
    ['nested srcdoc image', '<iframe srcdoc="&lt;img src=&quot;ok.svg&quot; alt=&quot;&quot;&gt;"></iframe>']
  ]) {
    await t.test(`authored CSP cannot block ${name}`, async () => {
      const html = statusHtml({
        head: '<meta http-equiv="Content-Security-Policy" content="default-src none">' +
          (name === 'top-level stylesheet' ? '<link rel="stylesheet" href="ok.css">' : ''),
        tail
      });
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /meta Content-Security-Policy/);
    });
  }
  await t.test('CSP inside a nested external document fails closed recursively', async () => {
    const nested = replaceFile(resources, 'frame.html', '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="img-src none"></head><body><img src="ok.svg" alt=""></body></html>');
    const html = statusHtml({ tail: '<iframe src="frame.html"></iframe>' });
    await assert.rejects(inspect(html, replaceFile(nested, 'index.html', html)), /meta Content-Security-Policy/);
  });
  await t.test('response-header CSP is rejected on the verifier-controlled loader path', async () => {
    const html = statusHtml({ head: '<link rel="stylesheet" href="ok.css">' });
    const loader = async path => ({
      bytes: Buffer.from(resources.get(path)),
      finalUrl: new URL(path, testUrl).href,
      headers: path === 'ok.css' ? { 'content-security-policy': "default-src 'none'" } : {}
    });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html), { fetchResourceImpl: loader }), /unsupported content-security-policy response policy/);
  });
  await t.test('case-varied duplicate CSP cannot hide a blocking policy behind an empty value', async () => {
    const html = statusHtml({ head: '<link rel="stylesheet" href="ok.css">' });
    const fixture = replaceFile(resources, 'index.html', html);
    const loader = async path => ({
      bytes: Buffer.from(fixture.get(path)),
      finalUrl: new URL(path, testUrl).href,
      headers: path === 'ok.css'
        ? { 'Content-Security-Policy': '', 'content-security-policy': "default-src 'none'", 'content-type': 'text/css' }
        : { 'content-type': expectedDeliveredContentType(path) }
    });
    await assert.rejects(inspect(html, fixture, { fetchResourceImpl: loader }), /unsupported content-security-policy response policy/);
  });
  await t.test('top-level index response-header CSP is rejected before Chromium can suppress resources', async () => {
    const loader = async path => ({
      bytes: Buffer.from(files.get(path)),
      finalUrl: new URL(path, testUrl).href,
      headers: {
        'content-type': expectedDeliveredContentType(path),
        ...(path === 'index.html' ? { 'content-security-policy': "default-src 'none'" } : {})
      }
    });
    await assert.rejects(verify(files, { fetchResourceImpl: loader }), /index\.html returned unsupported content-security-policy response policy/);
  });
  await t.test('a route-time stylesheet failure is captured after successful preflight', async () => {
    const html = statusHtml({ head: '<link rel="stylesheet" href="ok.css">' });
    let stylesheetLoads = 0;
    const fixture = replaceFile(resources, 'index.html', html);
    const loader = async path => {
      if (path === 'ok.css' && ++stylesheetLoads > 1) throw new Error('injected route-time stylesheet failure');
      return {
        bytes: Buffer.from(fixture.get(path)),
        finalUrl: new URL(path, testUrl).href,
        headers: { 'content-type': expectedDeliveredContentType(path) }
      };
    };
    await assert.rejects(inspect(html, fixture, { fetchResourceImpl: loader }), /could not be validated.*injected route-time stylesheet failure/);
  });
  await t.test('legitimate non-fetching canonical metadata is not required to generate a request', async () => {
    const html = statusHtml({ head: '<link rel="canonical" href="ok.svg">' });
    const fetched = [];
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html), {
      fetchResourceImpl: localResourceLoader(resources, fetched)
    })).pass, true);
    assert.deepEqual(fetched, []);
  });
  await t.test('JavaScript-disabled script references are validated but not required to generate a request', async () => {
    const html = statusHtml({ head: '<script src="inactive.js"></script>' });
    const fetched = [];
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html), {
      fetchResourceImpl: localResourceLoader(resources, fetched)
    })).pass, true);
    assert.deepEqual(fetched, []);
  });
  for (const [name, source] of [
    ['lazy image', '<img loading="lazy" src="ok.svg" alt="">'],
    ['lazy iframe', '<iframe loading="lazy" src="frame.html"></iframe>'],
    ['disabled stylesheet', '<link rel="stylesheet" href="ok.css" disabled>'],
    ['alternate stylesheet', '<link rel="alternate stylesheet" href="ok.css" title="alternate">']
  ]) {
    await t.test(`${name} fails closed because inactive/lazy render semantics are unsupported`, async () => {
      const html = name.includes('stylesheet') ? statusHtml({ head: source }) : statusHtml({ tail: source });
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /unsupported authored|inactive or alternate|lazy/);
    });
  }
});

test('delivered Content-Type is mandatory, validated by family, and preserved into Chromium', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.css', 'body{margin:0}');
  resources = replaceFile(resources, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
  resources = replaceFile(resources, 'frame.html', '<!doctype html><html><head></head><body>frame</body></html>');
  resources = replaceFile(resources, 'frame.htm', '<!doctype html><html><head></head><body>frame</body></html>');
  resources = replaceFile(resources, 'frame.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>frame</body></html>');
  resources = replaceFile(resources, 'frame.xml', '<?xml version="1.0"?><root>frame</root>');

  const familyCases = [
    {
      name: 'HTML document',
      path: 'frame.html',
      varied: 'TeXt/HTmL; Charset=UTF-8',
      run: async value => {
        const html = statusHtml({ tail: '<iframe src="frame.html"></iframe>' });
        const fixture = replaceFile(resources, 'index.html', html);
        return inspect(html, fixture, { fetchResourceImpl: contentTypeOverrideLoader(fixture, 'frame.html', value, 'CoNtEnT-TyPe') });
      }
    },
    {
      name: 'HTM document',
      path: 'frame.htm',
      varied: 'TeXt/HTmL; Charset=UTF-8',
      run: async value => {
        const html = statusHtml({ tail: '<iframe src="frame.htm"></iframe>' });
        const fixture = replaceFile(resources, 'index.html', html);
        return inspect(html, fixture, { fetchResourceImpl: contentTypeOverrideLoader(fixture, 'frame.htm', value, 'CoNtEnT-TyPe') });
      }
    },
    {
      name: 'XHTML document',
      path: 'frame.xhtml',
      varied: 'Application/XHTML+XML; Charset=UTF-8',
      run: async value => {
        const html = statusHtml({ tail: '<iframe src="frame.xhtml"></iframe>' });
        const fixture = replaceFile(resources, 'index.html', html);
        return inspect(html, fixture, { fetchResourceImpl: contentTypeOverrideLoader(fixture, 'frame.xhtml', value, 'CoNtEnT-TyPe') });
      }
    },
    {
      name: 'XML document',
      path: 'frame.xml',
      varied: 'Application/XML; Charset=UTF-8',
      alternates: ['text/xml; charset=UTF-8'],
      run: async value => {
        const html = statusHtml({ tail: '<iframe src="frame.xml"></iframe>' });
        const fixture = replaceFile(resources, 'index.html', html);
        return inspect(html, fixture, { fetchResourceImpl: contentTypeOverrideLoader(fixture, 'frame.xml', value, 'CoNtEnT-TyPe') });
      }
    },
    {
      name: 'CSS stylesheet',
      path: 'ok.css',
      varied: 'TeXt/CsS; Charset=UTF-8',
      run: async value => {
        const html = statusHtml({ head: '<link rel="stylesheet" href="ok.css">' });
        const fixture = replaceFile(resources, 'index.html', html);
        return inspect(html, fixture, { fetchResourceImpl: contentTypeOverrideLoader(fixture, 'ok.css', value, 'CoNtEnT-TyPe') });
      }
    },
    {
      name: 'SVG image',
      path: 'ok.svg',
      varied: 'Image/SVG+XML; Charset=UTF-8',
      run: async value => {
        const html = statusHtml({ tail: '<img src="ok.svg" alt="">' });
        const fixture = replaceFile(resources, 'index.html', html);
        return inspect(html, fixture, { fetchResourceImpl: contentTypeOverrideLoader(fixture, 'ok.svg', value, 'CoNtEnT-TyPe') });
      }
    },
    {
      name: 'JSON metadata',
      path: 'release.json',
      varied: 'Application/JSON; Charset=UTF-8',
      run: value => verify(files, { fetchResourceImpl: contentTypeOverrideLoader(files, 'release.json', value, 'CoNtEnT-TyPe') })
    },
    {
      name: 'web manifest',
      path: 'manifest.webmanifest',
      varied: 'Application/Manifest+JSON; Charset=UTF-8',
      alternates: ['application/json; charset=UTF-8'],
      run: value => verify(files, { fetchResourceImpl: contentTypeOverrideLoader(files, 'manifest.webmanifest', value, 'CoNtEnT-TyPe') })
    },
    {
      name: 'JavaScript',
      path: 'service-worker.js',
      varied: 'Text/JavaScript; Charset=UTF-8',
      alternates: ['application/javascript; charset=UTF-8'],
      run: value => verify(files, { fetchResourceImpl: contentTypeOverrideLoader(files, 'service-worker.js', value, 'CoNtEnT-TyPe') })
    },
    {
      name: 'PDF',
      path: 'generated/field-guide.pdf',
      varied: 'Application/PDF',
      run: value => verify(files, { fetchResourceImpl: contentTypeOverrideLoader(files, 'generated/field-guide.pdf', value, 'CoNtEnT-TyPe') })
    },
    {
      name: 'Field Guide PNG',
      path: 'generated/field-guide-p1.png',
      varied: 'Image/PNG',
      run: value => verify(files, { fetchResourceImpl: contentTypeOverrideLoader(files, 'generated/field-guide-p1.png', value, 'CoNtEnT-TyPe') })
    },
    {
      name: 'Pocket Card PNG',
      path: 'generated/pocket-card-p1.png',
      varied: 'Image/PNG',
      run: value => verify(files, { fetchResourceImpl: contentTypeOverrideLoader(files, 'generated/pocket-card-p1.png', value, 'CoNtEnT-TyPe') })
    }
  ];

  for (const family of familyCases) {
    await t.test(`${family.name} accepts its correct delivered MIME`, async () => {
      await family.run(expectedDeliveredContentType(family.path));
    });
    await t.test(`${family.name} accepts case-varied parameterized delivered MIME`, async () => {
      await family.run(family.varied);
    });
    const exactType = expectedDeliveredContentType(family.path);
    await t.test(`${family.name} accepts a valid quoted parameter`, async () => {
      await family.run(`${exactType}; charset="UTF-8"`);
    });
    await t.test(`${family.name} accepts valid whitespace-varied parameter syntax`, async () => {
      await family.run(`${exactType} ; charset = UTF-8`);
    });
    await t.test(`${family.name} accepts identical case-varied duplicate headers`, async () => {
      await family.run({ 'Content-Type': exactType, 'content-type': exactType });
    });
    await t.test(`${family.name} rejects malformed parameter syntax`, async () => {
      await assert.rejects(family.run(`${exactType}; charset`), /malformed Content-Type/);
    });
    await t.test(`${family.name} rejects an unterminated quoted parameter`, async () => {
      await assert.rejects(family.run(`${exactType}; charset="UTF-8`), /malformed Content-Type/);
    });
    await t.test(`${family.name} rejects conflicting case-varied duplicate headers`, async () => {
      await assert.rejects(
        family.run({ 'Content-Type': exactType, 'content-type': 'text/plain' }),
        /conflicting duplicate Content-Type values/
      );
    });
    await t.test(`${family.name} rejects comma-joined header values`, async () => {
      await assert.rejects(family.run(`${exactType}, ${exactType}`), /comma-joined Content-Type values/);
    });
    for (const alternate of family.alternates || []) {
      await t.test(`${family.name} accepts alternate approved delivered MIME ${alternate}`, async () => {
        await family.run(alternate);
      });
    }
    await t.test(`${family.name} rejects a missing delivered MIME`, async () => {
      await assert.rejects(family.run(null), /returned no Content-Type; a delivered MIME type is required/);
    });
    await t.test(`${family.name} rejects an empty delivered MIME`, async () => {
      await assert.rejects(family.run(''), /returned no Content-Type; a delivered MIME type is required/);
    });
    await t.test(`${family.name} rejects a wrong delivered MIME`, async () => {
      await assert.rejects(family.run('text/plain'), /returned unsupported Content-Type text\/plain/);
    });
  }
});

test('browser event accounting rejects required resources that are unrequested, unfinished, or requestfailed', async t => {
  function eventAccountingLifecycle(mode) {
    const handlers = new Map();
    let routeHandler;
    const frame = { url: () => testUrl.href, parentFrame: () => null };
    const request = {
      failure: () => ({ errorText: 'net::ERR_BLOCKED_BY_CLIENT' }),
      frame: () => frame,
      isNavigationRequest: () => false,
      resourceType: () => 'image',
      url: () => new URL('ok.svg', testUrl).href
    };
    const page = {
      on: (event, handler) => handlers.set(event, handler),
      route: async (_pattern, handler) => { routeHandler = handler; },
      goto: async () => {
        if (mode === 'unrequested') return;
        await routeHandler({
          abort: async () => {},
          fulfill: async () => {},
          request: () => request
        });
        if (mode === 'failed') handlers.get('requestfailed')?.(request);
        if (mode === 'overconsumed') {
          handlers.get('requestfinished')?.(request);
          await routeHandler({
            abort: async () => {},
            fulfill: async () => {},
            request: () => request
          });
          handlers.get('requestfinished')?.(request);
        }
      },
      evaluate: async (_callback, argument) => {
        if (argument?.source && argument?.owner) {
          return {
            forbidden: [],
            references: [{
              attribute: 'src', browserFetching: true, fetchKind: 'image', kind: 'resource',
              ordinal: 0, owner: 'index.html', tag: 'img', validation: 'strict-local', value: 'ok.svg'
            }],
            srcdocs: [],
            stylesheetSources: []
          };
        }
        if (Array.isArray(argument)) return [];
        if (argument?.operation === 'browser-resource-status') return { applications: [], nestedIssues: [] };
        return { pass: true };
      },
      close: async () => {},
      waitForTimeout: async () => {}
    };
    const context = { newPage: async () => page, close: async () => {} };
    const browser = { newContext: async () => context, close: async () => {} };
    return { browser };
  }

  async function inspectEventMode(mode) {
    const lifecycle = eventAccountingLifecycle(mode);
    return inspectVisibleTestVersionDisclosure(statusHtml({ tail: '<img src="ok.svg" alt="">' }), {
      launchBrowser: async () => lifecycle.browser,
      liveBaseUrl: testUrl,
      allowedResourcePaths: new Set(['index.html', 'ok.svg']),
      lifecycleTimeoutMs: 100,
      fetchResourceImpl: async path => ({
        bytes: Buffer.from(path === 'ok.svg' ? '<svg></svg>' : ''),
        finalUrl: new URL(path, testUrl).href,
        headers: { 'content-type': expectedDeliveredContentType(path) }
      })
    });
  }

  await t.test('an eligible authored active resource that Chromium never requests fails', () =>
    assert.rejects(inspectEventMode('unrequested'), /was required.*but was not consumed by Chromium/));
  await t.test('a fulfilled route without browser requestfinished consumption fails', () =>
    assert.rejects(inspectEventMode('unfinished'), /did not finish successfully in Chromium/));
  await t.test('a browser requestfailed event is an understandable render failure', () =>
    assert.rejects(inspectEventMode('failed'), /browser request failed: net::ERR_BLOCKED_BY_CLIENT/));
  await t.test('one authored occurrence cannot authorize two finished browser requests', () =>
    assert.rejects(inspectEventMode('overconsumed'), /over-consumed by Chromium \(2 routed requests for 1 authored occurrences\)/));
});

test('instant verifier scrolling stabilizes valid below-fold disclosures without weakening reachability checks', async t => {
  const { files } = await deploymentFiles();
  const smooth = '<style>html,body,*{scroll-behavior:smooth}</style>';
  await t.test('below-fold badge passes', async () => {
    const html = statusHtml({ head: smooth, badge: `<div style="height:3000px"></div><small id="release-badge">${label}</small>` });
    assert.equal((await inspect(html, replaceFile(files, 'index.html', html))).pass, true);
  });
  await t.test('below-fold notice passes', async () => {
    const html = statusHtml({ head: smooth, releaseNote: `<div style="height:3000px"></div><p class="release-note">${notice}</p>` });
    assert.equal((await inspect(html, replaceFile(files, 'index.html', html))).pass, true);
  });
  await t.test('far-off-document transform still fails', () => {
    const html = statusHtml({ head: smooth, badge: `<small id="release-badge" style="transform:translateX(-100000px)">${label}</small>` });
    return assertDisclosureRejected(html, files);
  });
  await t.test('overflow clipping remains enforced after scrolling', () => {
    const html = statusHtml({ head: smooth, badge: `<div style="height:0;overflow:hidden"><small id="release-badge">${label}</small></div>` });
    return assertDisclosureRejected(html, files);
  });
});

test('immutable response snapshots bind accepted bytes and MIME to Chromium fulfillment', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.css', 'body{margin:0}');
  resources = replaceFile(resources, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
  resources = replaceFile(resources, 'frame.html', '<!doctype html><html><head></head><body>frame</body></html>');
  const cases = [
    ['stylesheet', 'ok.css', statusHtml({ head: '<link rel="stylesheet" href="ok.css">' }), 'body{margin:1px}'],
    ['image', 'ok.svg', statusHtml({ tail: '<img src="ok.svg" alt="">' }), '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="3"></svg>'],
    ['nested document', 'frame.html', statusHtml({ tail: '<iframe src="frame.html"></iframe>' }), '<!doctype html><html><head></head><body>other</body></html>']
  ];
  for (const [name, path, html, changed] of cases) {
    await t.test(`changing ${name} response fails before fulfillment`, async () => {
      const fixture = replaceFile(resources, 'index.html', html);
      let calls = 0;
      const loader = async requestedPath => {
        const bytes = requestedPath === path && ++calls === 2 ? Buffer.from(changed) : Buffer.from(fixture.get(requestedPath));
        return {
          bytes,
          finalUrl: new URL(requestedPath, testUrl).href,
          headers: { 'content-type': expectedDeliveredContentType(requestedPath) }
        };
      };
      await assert.rejects(inspect(html, fixture, { fetchResourceImpl: loader }), /changed between bounded response snapshots/);
      assert.equal(calls, 2);
    });
  }
  await t.test('locked bundle stylesheet substitution cannot be repaired by a later canonical response', async () => {
    let calls = 0;
    const loader = async path => {
      let bytes = Buffer.from(files.get(path));
      if (path === 'css/companion.css') {
        calls += 1;
        if (calls === 2) bytes = Buffer.from('x{display:none}');
      }
      return {
        bytes,
        finalUrl: new URL(path, testUrl).href,
        headers: { 'content-type': expectedDeliveredContentType(path) }
      };
    };
    await assert.rejects(verify(files, { fetchResourceImpl: loader }), /css\/companion\.css changed between bounded response snapshots/);
    assert.equal(calls, 2);
  });
});

test('authored-source lexical validation rejects normalization-dependent HTML syntax', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
  const attacks = [
    ['decimal resource alias', '<img src="ok&#46;svg" alt="">'],
    ['hex resource alias', '<img src="ok&#x2e;svg" alt="">'],
    ['named resource alias', '<img src="ok&period;svg" alt="">'],
    ['encoded approved navigation', '<a href="&#x23;app-main">Main</a>'],
    ['same-case duplicate resource attribute', '<img src="ok.svg" src="/evil" alt="">'],
    ['case-varied duplicate resource attribute', '<img src="ok.svg" SRC="/evil" alt="">'],
    ['same-case duplicate navigation attribute', '<a href="#app-main" href="/evil">Main</a>'],
    ['case-varied duplicate navigation attribute', '<a href="#app-main" HREF="/evil">Main</a>'],
    ['unterminated quote', '<img src="ok.svg alt="">'],
    ['null in URL value', '<img src="ok\0.svg" alt="">'],
    ['srcdoc normalization alias', '<iframe srcdoc="<img src=\'ok&#46;svg\' alt=\'\'>"></iframe>'],
    ['encoded stylesheet relationship', '<link rel="style&#x73;heet" href="ok.css">'],
    ['encoded loading policy', '<img src="ok.svg" loading="la&#122;y" alt="">'],
    ['encoded inline-style syntax', '<img src="ok.svg" style="width&#58;0" alt="">'],
    ['encoded meta policy', '<meta http-equiv="re&#102;resh" content="0;url=/evil">']
  ];
  for (const [name, tail] of attacks) {
    await t.test(name, async () => {
      const html = statusHtml({ tail });
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /normalization-dependent|duplicate|unterminated|malformed|null or unsupported control/);
    });
  }
  await t.test('literal approved resource syntax remains accepted', async () => {
    const html = statusHtml({ tail: '<img src="ok.svg" alt="">' });
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });
});

test('MIME-aware authored-source tokenization rejects HTML tokenizer breakouts before route authorization', async t => {
  const { files } = await deploymentFiles();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>';
  const resources = replaceFile(files, 'ok.svg', svg);
  const auditorProbes = [
    ['comment breakout', '<!--><img src="ok&#46;svg" alt=""><!-- -->'],
    ['HTML CDATA-like breakout', '<![CDATA[><img src="ok&#46;svg" alt="">]]>'],
    ['processing-instruction-like breakout', '<?><img src="ok&#46;svg" alt="">?>']
  ];
  const lexicalFailure = /comment|CDATA|processing-instruction|declaration|normalization-dependent/;

  function encodedSrcdoc(source) {
    return source
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  async function rejectsBeforeOkSvg(html, fixture) {
    const fetchedPaths = [];
    await assert.rejects(
      inspect(html, fixture, { fetchResourceImpl: localResourceLoader(fixture, fetchedPaths) }),
      lexicalFailure
    );
    assert.equal(fetchedPaths.filter(path => path === 'ok.svg').length, 0);
  }

  for (const [probeName, probe] of auditorProbes) {
    await t.test(`${probeName} in root HTML`, async () => {
      const html = statusHtml({ tail: probe });
      await rejectsBeforeOkSvg(html, replaceFile(resources, 'index.html', html));
    });
    await t.test(`${probeName} in nested HTML`, async () => {
      const nested = `<!doctype html><html><head></head><body>${probe}</body></html>`;
      const html = statusHtml({ tail: '<iframe src="frame.html"></iframe>' });
      let fixture = replaceFile(resources, 'frame.html', nested);
      fixture = replaceFile(fixture, 'index.html', html);
      await rejectsBeforeOkSvg(html, fixture);
    });
    await t.test(`${probeName} in iframe srcdoc`, async () => {
      const html = statusHtml({ tail: `<iframe srcdoc="${encodedSrcdoc(probe)}"></iframe>` });
      await rejectsBeforeOkSvg(html, replaceFile(resources, 'index.html', html));
    });
    await t.test(`${probeName} in template content`, async () => {
      const html = statusHtml({ tail: `<template>${probe}</template>` });
      await rejectsBeforeOkSvg(html, replaceFile(resources, 'index.html', html));
    });
  }

  const adjacentAttacks = [
    ['abrupt comment opener', '<!--'],
    ['abrupt comment close', '<!-->'],
    ['abrupt bang comment close', '<!--!>'],
    ['dash-bang comment breakout', '<!--safe--!><img src="ok&#46;svg" alt=""><!-- -->'],
    ['nested comment opener', '<!--safe<!--><img src="ok&#46;svg" alt="">-->'],
    ['repeated comment opener', '<!--<!--><img src="ok&#46;svg" alt=""><!-- -->'],
    ['bogus declaration', '<!ghost><img src="ok&#46;svg" alt="">'],
    ['whitespace-varied bogus declaration', '<! ghost ><img src="ok&#46;svg" alt="">'],
    ['case-varied HTML CDATA-like syntax', '<![cDaTa[><img src="ok&#46;svg" alt="">]]>'],
    ['abrupt processing-instruction-like syntax', '<?'],
    ['spaced processing-instruction-like syntax', '<? fetch ?><img src="ok&#46;svg" alt="">?>'],
    ['named character reference after comment breakout', '<!--><img src="ok&period;svg" alt=""><!-- -->']
  ];
  for (const [name, tail] of adjacentAttacks) {
    await t.test(name, async () => {
      const html = statusHtml({ tail });
      await rejectsBeforeOkSvg(html, replaceFile(resources, 'index.html', html));
    });
  }

  const acceptedHtml = [
    ['empty ordinary HTML comment', '<!---->'],
    ['ordinary HTML comment', '<!-- locally verified ordinary comment -->'],
    ['multiline ordinary HTML comment', '<!-- first line\nsecond line -->']
  ];
  for (const [name, tail] of acceptedHtml) {
    await t.test(name, async () => {
      const html = statusHtml({ tail });
      assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
    });
  }
  await t.test('case- and whitespace-varied canonical HTML doctype remains accepted', async () => {
    const html = statusHtml().replace('<!doctype html>', '<!DoCtYpE\n html >');
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });
  await t.test('XML processing instructions, CDATA, and comments retain XML parsing rules', async () => {
    const nested = '<?xml version="1.0"?><root><![CDATA[not <img src="ok&#46;svg">]]><!-- ordinary XML comment --></root>';
    const html = statusHtml({ tail: '<iframe src="frame.xml"></iframe>' });
    let fixture = replaceFile(resources, 'frame.xml', nested);
    fixture = replaceFile(fixture, 'index.html', html);
    assert.equal((await inspect(html, fixture)).pass, true);
  });
  await t.test('XHTML processing instructions, CDATA, and comments retain XML parsing rules', async () => {
    const nested = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><![CDATA[not <img src="ok&#46;svg">]]><!-- ordinary XHTML comment --></body></html>';
    const html = statusHtml({ tail: '<iframe src="frame.xhtml"></iframe>' });
    let fixture = replaceFile(resources, 'frame.xhtml', nested);
    fixture = replaceFile(fixture, 'index.html', html);
    assert.equal((await inspect(html, fixture)).pass, true);
  });
});

test('HTML parser-state boundaries are MIME-specific, complete, and fail before resource authorization', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
  const stateFamilies = [
    ['script-data', 'script'],
    ['RCDATA title', 'title'],
    ['RCDATA textarea', 'textarea'],
    ['RAWTEXT style', 'style'],
    ['RAWTEXT xmp', 'xmp'],
    ['RAWTEXT iframe', 'iframe'],
    ['RAWTEXT noembed', 'noembed'],
    ['RAWTEXT noframes', 'noframes']
  ];

  function boundaryDivergence(tag) {
    return `<${tag}>stored</${tag} data-boundary><img src="ok&#46;svg" alt=""><${tag}>tail</${tag}>`;
  }

  function inertSpecialText(tag) {
    return `<${tag}>stored <img src="ok&#46;svg" alt=""> text</${tag}>`;
  }

  function encodeSrcdoc(source) {
    return source
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  async function rejectsBeforeAuthorization(html, fixture, expected = /end-tag boundary|plaintext|normalization-dependent/) {
    const fetchedPaths = [];
    await assert.rejects(
      inspect(html, fixture, { fetchResourceImpl: localResourceLoader(fixture, fetchedPaths), lifecycleTimeoutMs: 5000 }),
      expected
    );
    assert.equal(fetchedPaths.filter(path => path === 'ok.svg').length, 0);
  }

  for (const [state, tag] of stateFamilies) {
    await t.test(`${state} recognizes its earliest applicable end-tag boundary`, async () => {
      const html = statusHtml({ tail: boundaryDivergence(tag) });
      await rejectsBeforeAuthorization(html, replaceFile(resources, 'index.html', html));
    });
    await t.test(`${state} keeps non-boundary markup-like text inert`, async () => {
      const html = statusHtml({ tail: inertSpecialText(tag) });
      assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
    });
  }

  await t.test('escaped script-data ambiguity is rejected before authorization', async () => {
    const html = statusHtml({ tail: '<script><!-- stored --></script><img src="ok&#46;svg" alt="">' });
    await rejectsBeforeAuthorization(html, replaceFile(resources, 'index.html', html), /escaped script-data/);
  });

  await t.test('plaintext state is explicitly unsupported before authorization', async () => {
    const html = statusHtml({ tail: '<plaintext><img src="ok&#46;svg" alt="">' });
    await rejectsBeforeAuthorization(html, replaceFile(resources, 'index.html', html), /plaintext state/);
  });

  await t.test('noscript remains data in the verifier’s JavaScript-disabled parsing context', async () => {
    const html = statusHtml({ tail: '<noscript><img src="ok&#46;svg" alt=""></noscript>' });
    await rejectsBeforeAuthorization(html, replaceFile(resources, 'index.html', html), /normalization-dependent/);
  });

  await t.test('nested HTML uses the same RAWTEXT boundary policy', async () => {
    const nestedSource = `<!doctype html><html><head></head><body>${boundaryDivergence('xmp')}</body></html>`;
    const html = statusHtml({ tail: '<iframe src="nested-state.html"></iframe>' });
    let fixture = replaceFile(resources, 'nested-state.html', nestedSource);
    fixture = replaceFile(fixture, 'index.html', html);
    await rejectsBeforeAuthorization(html, fixture);
  });

  await t.test('srcdoc uses the same RCDATA boundary policy', async () => {
    const inner = `<!doctype html><html><head></head><body>${boundaryDivergence('textarea')}</body></html>`;
    const html = statusHtml({ tail: `<iframe srcdoc="${encodeSrcdoc(inner)}"></iframe>` });
    await rejectsBeforeAuthorization(html, replaceFile(resources, 'index.html', html));
  });

  await t.test('recursive template content uses the same RAWTEXT boundary policy', async () => {
    const html = statusHtml({ tail: `<template><template>${boundaryDivergence('noembed')}</template></template>` });
    await rejectsBeforeAuthorization(html, replaceFile(resources, 'index.html', html));
  });

  await t.test('the deepest accepted document level retains parser-state enforcement', async () => {
    let fixture = new Map(resources);
    for (let index = 1; index <= 8; index += 1) {
      const body = index === 8
        ? boundaryDivergence('style')
        : `<iframe src="d${index + 1}.html"></iframe>`;
      fixture = replaceFile(fixture, `depth/d${index}.html`, `<!doctype html><html><head></head><body>${body}</body></html>`);
    }
    const html = statusHtml({ tail: '<iframe src="depth/d1.html"></iframe>' });
    fixture = replaceFile(fixture, 'index.html', html);
    await rejectsBeforeAuthorization(html, fixture);
  });

  await t.test('the 64-document count boundary retains parser-state enforcement', async () => {
    let fixture = new Map(resources);
    let frames = '';
    for (let index = 1; index <= 63; index += 1) {
      const path = `count/d${index}.html`;
      frames += `<iframe src="${path}"></iframe>`;
      const body = index === 63 ? boundaryDivergence('title') : `<p>document ${index}</p>`;
      fixture = replaceFile(fixture, path, `<!doctype html><html><head></head><body>${body}</body></html>`);
    }
    const html = statusHtml({ tail: frames });
    fixture = replaceFile(fixture, 'index.html', html);
    await rejectsBeforeAuthorization(html, fixture, /end-tag boundary/);
  });

  await t.test('the 63-template count boundary retains parser-state enforcement', async () => {
    const templates = '<template></template>'.repeat(62) + `<template>${boundaryDivergence('noframes')}</template>`;
    const html = statusHtml({ tail: templates });
    await rejectsBeforeAuthorization(html, replaceFile(resources, 'index.html', html));
  });
});

test('XML-family lexical provenance never applies HTML raw-text or entity-expansion behavior', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');

  async function rejectsNested(path, source, expected) {
    const html = statusHtml({ tail: `<iframe src="${path}"></iframe>` });
    let fixture = replaceFile(resources, path, source);
    fixture = replaceFile(fixture, 'index.html', html);
    const fetchedPaths = [];
    await assert.rejects(
      inspect(html, fixture, { fetchResourceImpl: localResourceLoader(fixture, fetchedPaths) }),
      expected
    );
    assert.equal(fetchedPaths.filter(item => item === 'ok.svg').length, 0);
  }

  for (const tag of ['script', 'style']) {
    await t.test(`XHTML ${tag} children remain XML elements with authored attribute evidence`, async () => {
      const source = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head></head><body><${tag}><img src="ok&#46;svg" alt=""/></${tag}></body></html>`;
      await rejectsNested(`xml-${tag}.xhtml`, source, /unsupported XML entity or character reference/);
    });
  }

  await t.test('application/xml script children remain ordinary XML elements', async () => {
    const source = '<?xml version="1.0"?><root><script><asset src="ok&#46;svg"/></script></root>';
    await rejectsNested('script-child.xml', source, /unsupported XML entity or character reference/);
  });

  await t.test('image/svg+xml style children remain ordinary XML elements', async () => {
    const source = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><style><image href="ok&#46;svg"/></style></svg>';
    await rejectsNested('style-child.svg', source, /unsupported XML entity or character reference/);
  });

  for (const [name, path, source] of [
    ['application/xml internal entity declaration', 'entity.xml', '<!DOCTYPE root [<!ENTITY local "ok.svg">]><root><asset src="&local;"/></root>'],
    ['XHTML internal entity declaration', 'entity.xhtml', '<!DOCTYPE html [<!ENTITY local "ok.svg">]><html xmlns="http://www.w3.org/1999/xhtml"><head></head><body><img src="&local;" alt=""/></body></html>'],
    ['SVG internal entity declaration', 'entity.svg', '<!DOCTYPE svg [<!ENTITY local "ok.svg">]><svg xmlns="http://www.w3.org/2000/svg"><image href="&local;"/></svg>']
  ]) {
    await t.test(`${name} is rejected before expansion or authorization`, async () => {
      await rejectsNested(path, source, /XML document-type or entity-declaration/);
    });
  }

  await t.test('only predefined XML entities are decoded with raw provenance retained', async () => {
    const source = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head></head><body><p title="A &amp; B">local</p></body></html>';
    const html = statusHtml({ tail: '<iframe src="predefined.xhtml"></iframe>' });
    let fixture = replaceFile(resources, 'predefined.xhtml', source);
    fixture = replaceFile(fixture, 'index.html', html);
    assert.equal((await inspect(html, fixture)).pass, true);
  });

  await t.test('literal active XHTML children inside script are inspected by namespace policy', async () => {
    const source = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head></head><body><script><img src="/base/ok.svg" alt=""/></script></body></html>';
    await rejectsNested('literal-script-child.xhtml', source, /authored img src reference/);
  });

  await t.test('duplicate XML element attributes retain source evidence and fail lexically', async () => {
    const source = '<?xml version="1.0"?><root data-note="one" data-note="two"/>';
    await rejectsNested('duplicate.xml', source, /duplicate data-note attributes/);
  });
});

test('XML-family URL policy uses namespace URI and local name in every supported MIME mode', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
  const cases = [
    {
      name: 'application/xhtml+xml',
      path: 'namespace.xhtml',
      contentType: 'application/xhtml+xml',
      source: '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:n="urn:unsupported"><head></head><body><n:img n:src="ok.svg"/></body></html>'
    },
    {
      name: 'application/xml',
      path: 'namespace-application.xml',
      contentType: 'application/xml',
      source: '<?xml version="1.0"?><root xmlns:n="urn:unsupported"><n:img n:src="ok.svg"/></root>'
    },
    {
      name: 'text/xml',
      path: 'namespace-text.xml',
      contentType: 'text/xml',
      source: '<?xml version="1.0"?><root xmlns:n="urn:unsupported"><n:img n:src="ok.svg"/></root>'
    },
    {
      name: 'image/svg+xml',
      path: 'namespace.svg',
      contentType: 'image/svg+xml',
      source: '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:any="http://www.w3.org/1999/xlink"><image any:href="ok.svg"/></svg>'
    }
  ];

  for (const mode of cases) {
    await t.test(mode.name + ' rejects arbitrary namespace prefixes before controlled resource loading', async () => {
      const html = statusHtml({ tail: '<iframe src="' + mode.path + '"></iframe>' });
      let fixture = replaceFile(resources, mode.path, mode.source);
      fixture = replaceFile(fixture, 'index.html', html);
      const fetchedPaths = [];
      const loader = localResourceLoader(fixture, fetchedPaths);
      const routeEvidence = { navigations: 0, routeInvocations: 0 };
      await assert.rejects(
        inspect(html, fixture, {
          browser: browserWithRouteEvidence(routeEvidence),
          fetchResourceImpl: async path => {
            const resource = await loader(path);
            if (path === mode.path) resource.headers['content-type'] = mode.contentType;
            return resource;
          }
        }),
        /namespace URL\/resource|unsupported SVG/
      );
      assert.equal(fetchedPaths.filter(path => path === 'ok.svg').length, 0);
      assert.deepEqual(routeEvidence, { navigations: 0, routeInvocations: 0 });
    });
  }
});

test('unsupported XML-family applications cannot borrow shared approved transport or application proof', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
  const modes = [
    {
      name: 'XHTML',
      path: 'shared.xhtml',
      contentType: 'application/xhtml+xml',
      standalone: '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:s="http://www.w3.org/2000/svg" xmlns:l="http://www.w3.org/1999/xlink"><head></head><body><s:svg><s:image l:href="ok.svg"/></s:svg></body></html>',
      shared: '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:s="http://www.w3.org/2000/svg" xmlns:l="http://www.w3.org/1999/xlink"><head></head><body><img src="ok.svg" alt=""/><s:svg><s:image l:href="ok.svg"/></s:svg></body></html>'
    },
    {
      name: 'application XML',
      path: 'shared-application.xml',
      contentType: 'application/xml',
      standalone: '<?xml version="1.0"?><root xmlns:s="http://www.w3.org/2000/svg" xmlns:l="http://www.w3.org/1999/xlink"><s:svg><s:image l:href="ok.svg"/></s:svg></root>',
      shared: '<?xml version="1.0"?><root xmlns:h="http://www.w3.org/1999/xhtml" xmlns:s="http://www.w3.org/2000/svg" xmlns:l="http://www.w3.org/1999/xlink"><h:img src="ok.svg" alt=""/><s:svg><s:image l:href="ok.svg"/></s:svg></root>'
    },
    {
      name: 'text XML',
      path: 'shared-text.xml',
      contentType: 'text/xml',
      standalone: '<?xml version="1.0"?><root xmlns:s="http://www.w3.org/2000/svg" xmlns:l="http://www.w3.org/1999/xlink"><s:svg><s:image l:href="ok.svg"/></s:svg></root>',
      shared: '<?xml version="1.0"?><root xmlns:h="http://www.w3.org/1999/xhtml" xmlns:s="http://www.w3.org/2000/svg" xmlns:l="http://www.w3.org/1999/xlink"><h:img src="ok.svg" alt=""/><s:svg><s:image l:href="ok.svg"/></s:svg></root>'
    },
    {
      name: 'SVG XML',
      path: 'shared.svg',
      contentType: 'image/svg+xml',
      standalone: '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:l="http://www.w3.org/1999/xlink"><image l:href="ok.svg"/></svg>',
      shared: '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml" xmlns:l="http://www.w3.org/1999/xlink"><h:img src="ok.svg" alt=""/><image l:href="ok.svg"/></svg>'
    }
  ];

  for (const mode of modes) {
    for (const [shape, source] of [['standalone', mode.standalone], ['shared destination', mode.shared]]) {
      await t.test(mode.name + ' ' + shape + ' application fails before authorization', async () => {
        const html = statusHtml({ tail: '<iframe src="' + mode.path + '"></iframe>' });
        let fixture = replaceFile(resources, mode.path, source);
        fixture = replaceFile(fixture, 'index.html', html);
        const fetchedPaths = [];
        const loader = localResourceLoader(fixture, fetchedPaths);
        const routeEvidence = { navigations: 0, routeInvocations: 0 };
        await assert.rejects(
          inspect(html, fixture, {
            browser: browserWithRouteEvidence(routeEvidence),
            fetchResourceImpl: async path => {
              const resource = await loader(path);
              if (path === mode.path) resource.headers['content-type'] = mode.contentType;
              return resource;
            }
          }),
          /namespace URL\/resource|unsupported SVG/
        );
        assert.equal(fetchedPaths.filter(path => path === 'ok.svg').length, 0);
        assert.deepEqual(routeEvidence, { navigations: 0, routeInvocations: 0 });
      });
    }
  }
});

test('foreign namespace URL, inclusion, and base carriers fail closed by default', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
  const sources = [
    '<?xml version="1.0"?><root xml:base="ok.svg"/>',
    '<?xml version="1.0"?><root xmlns:n="urn:unsupported" n:payload="ok.svg"/>',
    '<?xml version="1.0"?><root xmlns:n="http://www.w3.org/2001/XInclude"><n:include href="ok.svg"/></root>',
    '<?xml version="1.0"?><root xmlns:n="urn:unsupported" n:location="plain"/>',
    '<?xml version="1.0"?><math xmlns="http://www.w3.org/1998/Math/MathML" definitionURL="plain"/>',
    '<?xml version="1.0"?><math xmlns="http://www.w3.org/1998/Math/MathML" altimg="plain"/>',
    '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" base="plain"/>'
  ];
  for (const [index, source] of sources.entries()) {
    await t.test('closed-default namespace case ' + (index + 1), async () => {
      const path = 'closed-' + index + '.xml';
      const html = statusHtml({ tail: '<iframe src="' + path + '"></iframe>' });
      let fixture = replaceFile(resources, path, source);
      fixture = replaceFile(fixture, 'index.html', html);
      const fetchedPaths = [];
      const routeEvidence = { navigations: 0, routeInvocations: 0 };
      await assert.rejects(
        inspect(html, fixture, {
          browser: browserWithRouteEvidence(routeEvidence),
          fetchResourceImpl: localResourceLoader(fixture, fetchedPaths)
        }),
        /namespace URL\/resource|XInclude|unknown XML URL-bearing/
      );
      assert.equal(fetchedPaths.filter(item => item === 'ok.svg').length, 0);
      assert.deepEqual(routeEvidence, { navigations: 0, routeInvocations: 0 });
    });
  }
  await t.test('HTML-parsed MathML URL-like controls use the same closed default', async () => {
    const html = statusHtml({
      tail: '<math definitionURL="plain"><mtext>local</mtext></math><img src="ok.svg" alt="">'
    });
    const fixture = replaceFile(resources, 'index.html', html);
    const fetchedPaths = [];
    const routeEvidence = { navigations: 0, routeInvocations: 0 };
    await assert.rejects(
      inspect(html, fixture, {
        browser: browserWithRouteEvidence(routeEvidence),
        fetchResourceImpl: localResourceLoader(fixture, fetchedPaths)
      }),
      /namespace URL\/resource/
    );
    assert.equal(fetchedPaths.filter(item => item === 'ok.svg').length, 0);
    assert.deepEqual(routeEvidence, { navigations: 0, routeInvocations: 0 });
  });
});

test('structural provenance and canonical HTML shells reject parser compensation before authorization', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
  async function rejectsBeforeResource(html, fixture, expected) {
    const fetchedPaths = [];
    const routeEvidence = { navigations: 0, routeInvocations: 0 };
    await assert.rejects(
      inspect(html, fixture, {
        browser: browserWithRouteEvidence(routeEvidence),
        fetchResourceImpl: localResourceLoader(fixture, fetchedPaths)
      }),
      expected
    );
    assert.equal(fetchedPaths.filter(path => path === 'ok.svg').length, 0);
    assert.deepEqual(routeEvidence, { navigations: 0, routeInvocations: 0 });
  }
  function encoded(source) {
    return source.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  await t.test('same-name parser reconstruction cannot preserve a false authored identity', async () => {
    const html = statusHtml({
      tail: '<a href="#app-main"><a href="#companion-home"><img src="ok.svg" alt=""></a></a>'
    });
    await rejectsBeforeResource(html, replaceFile(resources, 'index.html', html), /authored-token provenance|reconstructed HTML/);
  });

  await t.test('ignored end-tag compensation is rejected', async () => {
    const html = statusHtml({ tail: '</br><img src="ok.svg" alt="">' });
    await rejectsBeforeResource(html, replaceFile(resources, 'index.html', html), /reconstructed HTML|authored-token provenance/);
  });

  const shellWithoutDoctype = '<html><head></head><body><img src="ok.svg" alt=""></body></html>';
  await t.test('root HTML requires the canonical prolog', async () => {
    const html = shellWithoutDoctype.replace(
      '<body>',
      '<body><small id="release-badge">' + label + '</small><p class="release-note">' + notice + '</p>'
    );
    await rejectsBeforeResource(html, replaceFile(resources, 'index.html', html), /canonical HTML doctype/);
  });
  await t.test('nested HTML requires the canonical prolog', async () => {
    const html = statusHtml({ tail: '<iframe src="shell.html"></iframe>' });
    let fixture = replaceFile(resources, 'shell.html', shellWithoutDoctype);
    fixture = replaceFile(fixture, 'index.html', html);
    await rejectsBeforeResource(html, fixture, /canonical HTML doctype/);
  });
  await t.test('srcdoc requires the canonical prolog', async () => {
    const html = statusHtml({ tail: '<iframe srcdoc="' + encoded(shellWithoutDoctype) + '"></iframe>' });
    await rejectsBeforeResource(html, replaceFile(resources, 'index.html', html), /canonical HTML doctype/);
  });
  await t.test('a pre-doctype comment is not a canonical prolog', async () => {
    const html = '<!--prolog-->' + statusHtml({ tail: '<img src="ok.svg" alt="">' });
    await rejectsBeforeResource(html, replaceFile(resources, 'index.html', html), /canonical HTML doctype/);
  });
});

test('authored-token provenance rejects parser-created elements in every recursive HTML placement', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');

  async function rejectsBeforeOkSvg(html, fixture) {
    const fetchedPaths = [];
    await assert.rejects(
      inspect(html, fixture, { fetchResourceImpl: localResourceLoader(fixture, fetchedPaths) }),
      /authored-token provenance/
    );
    assert.equal(fetchedPaths.filter(path => path === 'ok.svg').length, 0);
  }

  await t.test('root HTML cannot borrow an implied head element', async () => {
    const html = '<!doctype html><html><body><img src="ok.svg" alt=""><small id="release-badge">Test version</small><p class="release-note">Physical phone testing is still required. This is not yet a field release.</p></body></html>';
    await rejectsBeforeOkSvg(html, replaceFile(resources, 'index.html', html));
  });

  await t.test('nested HTML cannot borrow an implied head element', async () => {
    const nested = '<!doctype html><html><body><img src="ok.svg" alt=""></body></html>';
    const html = statusHtml({ tail: '<iframe src="implied.html"></iframe>' });
    let fixture = replaceFile(resources, 'implied.html', nested);
    fixture = replaceFile(fixture, 'index.html', html);
    await rejectsBeforeOkSvg(html, fixture);
  });

  await t.test('srcdoc cannot borrow implied document-shell elements', async () => {
    const html = statusHtml({ tail: '<iframe srcdoc="&lt;img src=&quot;ok.svg&quot; alt=&quot;&quot;&gt;"></iframe>' });
    await rejectsBeforeOkSvg(html, replaceFile(resources, 'index.html', html));
  });

  await t.test('template content cannot borrow an implied table body', async () => {
    const html = statusHtml({ tail: '<template><table><tr><td><img src="ok.svg" alt=""></td></tr></table></template>' });
    await rejectsBeforeOkSvg(html, replaceFile(resources, 'index.html', html));
  });

  await t.test('HTML foreign-content children cannot borrow an HTML script-data boundary', async () => {
    const html = statusHtml({ tail: '<svg><script><image href="ok.svg"></image></script></svg>' });
    await rejectsBeforeOkSvg(html, replaceFile(resources, 'index.html', html));
  });
});

test('template content is recursively inspected without authorizing browser routes', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
  resources = replaceFile(resources, 'nested/template.html', '<!doctype html><html><head></head><body><template><form action="/evil"></form></template></body></html>');
  const attacks = [
    ['form action', '<template><form action="/evil"></form></template>'],
    ['button formaction', '<template><button formaction="/evil">Go</button></template>'],
    ['anchor ping', '<template><a href="#app-main" ping="/evil">Main</a></template>'],
    ['blockquote cite', '<template><blockquote cite="/evil">Quote</blockquote></template>'],
    ['image srcset', '<template><img srcset="ok.svg 1x" alt=""></template>'],
    ['link imagesrcset', '<template><link imagesrcset="ok.svg 1x"></template>'],
    ['meta refresh', '<template><meta http-equiv="refresh" content="0;url=/evil"></template>'],
    ['nested template resource', '<template><template><img src="ok.svg" alt=""></template></template>'],
    ['srcdoc template navigation', '<iframe srcdoc="<template><form action=\'/evil\'></form></template>"></iframe>'],
    ['external nested-document template navigation', '<iframe src="nested/template.html"></iframe>']
  ];
  for (const [name, tail] of attacks) {
    await t.test(name, async () => {
      const html = statusHtml({ tail });
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /template|form action|formaction|ping|cite|srcset|imagesrcset|meta refresh/);
    });
  }
  await t.test('nested inert templates without URL-bearing syntax remain accepted', async () => {
    const html = statusHtml({ tail: '<template><template><p>Stored local wording</p></template></template>' });
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });
  await t.test('eight nested inert template levels remain within the depth bound', async () => {
    const tail = '<template>'.repeat(8) + '<p>bounded</p>' + '</template>'.repeat(8);
    const html = statusHtml({ tail });
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });
  await t.test('nine nested inert template levels exceed the depth bound', async () => {
    const tail = '<template>'.repeat(9) + '<p>too deep</p>' + '</template>'.repeat(9);
    const html = statusHtml({ tail });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /template content exceeds the bounded recursive inspection limit/);
  });
  await t.test('63 template fragments plus the root document fit the combined count', async () => {
    const html = statusHtml({ tail: '<template></template>'.repeat(63) });
    assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
  });
  await t.test('64 template fragments plus the root document exceed the combined count', async () => {
    const html = statusHtml({ tail: '<template></template>'.repeat(64) });
    await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /template content exceeds|combined document\/template inspection count/);
  });
});

test('supported images and iframes require usable rendered geometry', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
  resources = replaceFile(resources, 'frame.html', '<!doctype html><html><head></head><body>frame</body></html>');
  const attacks = [
    ['zero-width image', '<img src="ok.svg" alt="" style="width:0">'],
    ['zero-height image', '<img src="ok.svg" alt="" style="height:0">'],
    ['fully clipped image', '<div style="width:0;height:0;overflow:hidden"><img src="ok.svg" alt=""></div>'],
    ['far-offscreen image', '<img src="ok.svg" alt="" style="position:absolute;left:100000px">'],
    ['zero-scale image', '<img src="ok.svg" alt="" style="transform:scale(0)">'],
    ['zero-width iframe', '<iframe src="frame.html" style="width:0"></iframe>'],
    ['zero-height iframe', '<iframe src="frame.html" style="height:0"></iframe>'],
    ['fully clipped iframe', '<div style="width:0;height:0;overflow:hidden"><iframe src="frame.html"></iframe></div>'],
    ['far-offscreen iframe', '<iframe src="frame.html" style="position:absolute;left:100000px"></iframe>'],
    ['zero-scale iframe', '<iframe src="frame.html" style="transform:scale(0)"></iframe>']
  ];
  for (const [name, tail] of attacks) {
    await t.test(name, async () => {
      const html = statusHtml({ tail });
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /zero-area|zero-size|clipping|bounded inspection distance|zero-scale|inspection viewport/);
    });
  }
  for (const [name, tail] of [
    ['below-fold image', '<div style="height:3000px"></div><img src="ok.svg" alt="">'],
    ['below-fold iframe', '<div style="height:3000px"></div><iframe src="frame.html"></iframe>']
  ]) {
    await t.test(`${name} is deterministically scrolled and accepted`, async () => {
      const html = statusHtml({ tail });
      assert.equal((await inspect(html, replaceFile(resources, 'index.html', html))).pass, true);
    });
  }
});

test('longdesc and adjacent legacy navigation attributes fail in every document placement', async t => {
  const { files } = await deploymentFiles();
  let resources = replaceFile(files, 'ok.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
  resources = replaceFile(resources, 'nested/legacy.html', '<!doctype html><html><head></head><body><img src="../ok.svg" longdesc="/evil" alt=""></body></html>');
  const attacks = [
    ['root longdesc', '<img src="ok.svg" longdesc="/evil" alt="">'],
    ['template longdesc', '<template><img src="ok.svg" longdesc="/evil" alt=""></template>'],
    ['srcdoc longdesc', '<iframe srcdoc="<img src=\'ok.svg\' longdesc=\'/evil\' alt=\'\'>"></iframe>'],
    ['nested-document longdesc', '<iframe src="nested/legacy.html"></iframe>'],
    ['legacy lowsrc', '<img src="ok.svg" lowsrc="/evil" alt="">'],
    ['legacy usemap', '<img src="ok.svg" usemap="/evil" alt="">'],
    ['legacy dynsrc', '<img src="ok.svg" dynsrc="/evil" alt="">'],
    ['legacy datasrc', '<img src="ok.svg" datasrc="/evil" alt="">'],
    ['microdata itemid', '<div itemid="/evil"></div>']
  ];
  for (const [name, tail] of attacks) {
    await t.test(name, async () => {
      const html = statusHtml({ tail });
      await assert.rejects(inspect(html, replaceFile(resources, 'index.html', html)), /longdesc|lowsrc|usemap|dynsrc|datasrc|itemid/);
    });
  }
});

test('deployment URL canonicalization rejects traversal, separators, escapes, queries, and fragments', async t => {
  const allowed = new Set(['index.html', 'css/companion.css']);
  assert.equal(canonicalDeploymentPath('css/companion.css', testUrl, allowed), 'css/companion.css');
  assert.equal(canonicalDeploymentPath(new URL('css/companion.css', testUrl), testUrl, allowed), 'css/companion.css');
  const attacks = [
    '../outside.css',
    'https://candidate-verifier.invalid/base/%2e%2e%2foutside.css',
    'https://candidate-verifier.invalid/base/css%2fcompanion.css',
    'https://candidate-verifier.invalid/base/css%5ccompanion.css',
    '/absolute.css',
    '//outside.invalid/escape.css',
    'https://outside.invalid/escape.css',
    'https://candidate-verifier.invalid/outside.css',
    'css/companion.css?x=1',
    'css/companion.css#fragment',
    'unknown.css'
  ];
  for (const attack of attacks) await t.test(attack, () => assert.throws(() => canonicalDeploymentPath(attack, testUrl, allowed)));
});

test('every verifier-controlled resource load is bounded and returns control to retries', async t => {
  const { files } = await deploymentFiles();
  const hangOn = target => async path => {
    if (path === target) return new Promise(() => {});
    return localResourceLoader(files)(path);
  };
  for (const [name, path] of [
    ['initial HTML', 'index.html'],
    ['release metadata', 'release.json'],
    ['offline bundle identity', 'offline-bundle.json'],
    ['web manifest identity', 'manifest.webmanifest'],
    ['service-worker identity', 'service-worker.js']
  ]) {
    await t.test(`never-settling ${name} loader`, () => assert.rejects(
      verify(files, { fetchResourceImpl: hangOn(path), resourceTimeoutMs: 25 }),
      new RegExp(`${path.replaceAll('.', '\\.')} resource load timed out`)
    ));
  }
  await t.test('never-settling post-render integrity reload', async () => {
    const counts = new Map();
    const loader = async path => {
      const count = (counts.get(path) || 0) + 1;
      counts.set(path, count);
      if (path === 'css/companion.css' && count >= 2) return new Promise(() => {});
      return localResourceLoader(files)(path);
    };
    await assert.rejects(verify(files, { fetchResourceImpl: loader, resourceTimeoutMs: 25 }), /css\/companion\.css resource load timed out/);
  });
  await t.test('default fetch loader is aborted on timeout without network access', async () => {
    let abortCount = 0;
    const fetchImpl = async (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        abortCount += 1;
        reject(signal.reason || new Error('aborted'));
      }, { once: true });
    });
    await assert.rejects(verify(files, { fetchImpl, resourceTimeoutMs: 25 }), /resource load timed out/);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(abortCount >= 1);
  });
  await t.test('retry loop advances after loader timeout', async () => {
    let attempts = 0;
    await assert.rejects(runWithRetries({
      attemptsValue: '2',
      delayValue: '0',
      sleepImpl: async () => {},
      checkOnceImpl: async () => {
        attempts += 1;
        await verify(files, { fetchResourceImpl: hangOn('index.html'), resourceTimeoutMs: 15 });
      }
    }), /index\.html resource load timed out/);
    assert.equal(attempts, 2);
  });
  await t.test('late loader resolution cannot mutate a completed attempt', async () => {
    let lateResolutions = 0;
    const loader = async path => {
      if (path !== 'release.json') return localResourceLoader(files)(path);
      return new Promise(resolve => setTimeout(async () => {
        lateResolutions += 1;
        resolve(await localResourceLoader(files)(path));
      }, 35));
    };
    await assert.rejects(verify(files, { fetchResourceImpl: loader, resourceTimeoutMs: 10 }), /release\.json resource load timed out/);
    await new Promise(resolve => setTimeout(resolve, 45));
    assert.equal(lateResolutions, 1);
  });
  await t.test('late loader rejection is consumed without unhandled rejection', async () => {
    const unhandled = [];
    const listener = reason => unhandled.push(reason);
    process.on('unhandledRejection', listener);
    try {
      const loader = async path => {
        if (path !== 'release.json') return localResourceLoader(files)(path);
        return new Promise((_, reject) => setTimeout(() => reject(new Error('late loader rejection')), 35));
      };
      await assert.rejects(verify(files, { fetchResourceImpl: loader, resourceTimeoutMs: 10 }), /release\.json resource load timed out/);
      await new Promise(resolve => setTimeout(resolve, 45));
      assert.deepEqual(unhandled, []);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });
});

function fakeLifecycle({ fail = {}, evaluationResult } = {}) {
  const calls = [];
  const page = {
    route: async () => { calls.push('route'); if (fail.route) throw new Error('route primary'); },
    goto: async () => { calls.push('goto'); if (fail.goto) throw new Error('navigation primary'); },
    evaluate: async (_callback, argument) => {
      calls.push('evaluate');
      if (argument?.source && argument?.owner) return { forbidden: [], references: [], srcdocs: [], stylesheetSources: [] };
      if (argument?.operation === 'browser-resource-status') return { applications: [], nestedIssues: [] };
      if (Array.isArray(argument)) return [];
      if (fail.evaluate) throw new Error('evaluation primary');
      if (argument === undefined) return { references: [], cssResourceReferences: [] };
      if (typeof argument === 'string') return '0,0,0,0,100,20';
      return evaluationResult || { pass: true };
    },
    waitForTimeout: async () => {},
    close: async () => { calls.push('page.close'); if (fail.pageClose) throw new Error('page close'); }
  };
  const context = {
    newPage: async () => { calls.push('newPage'); if (fail.newPage) throw new Error('page creation primary'); return page; },
    close: async () => { calls.push('context.close'); if (fail.contextClose) throw new Error('context close'); }
  };
  const ownedBrowser = {
    newContext: async options => { calls.push(`newContext:${options.javaScriptEnabled}`); if (fail.newContext) throw new Error('context creation primary'); return context; },
    close: async () => { calls.push('browser.close'); if (fail.browserClose) throw new Error('browser close'); }
  };
  const launchBrowser = async () => { calls.push('launch'); if (fail.launch) throw new Error('launch primary'); return ownedBrowser; };
  return { calls, context, launchBrowser, ownedBrowser, page };
}

async function inspectWithFake(lifecycle, { lifecycleTimeoutMs = 50 } = {}) {
  return inspectVisibleTestVersionDisclosure(statusHtml(), {
    launchBrowser: lifecycle.launchBrowser,
    liveBaseUrl: testUrl,
    allowedResourcePaths: new Set(['index.html']),
    lifecycleTimeoutMs,
    fetchResourceImpl: async () => ({ bytes: Buffer.from(''), finalUrl: testUrl.href })
  });
}

test('browser lifecycle failures preserve the primary error and attempt every owned cleanup', async t => {
  await t.test('launch failure', async () => {
    const lifecycle = fakeLifecycle({ fail: { launch: true } });
    await assert.rejects(inspectWithFake(lifecycle), /launch primary/);
    assert.deepEqual(lifecycle.calls, ['launch']);
  });
  for (const [name, failure, primary, expectedCalls] of [
    ['context creation', 'newContext', /context creation primary/, ['launch', 'newContext:false', 'browser.close']],
    ['page creation', 'newPage', /page creation primary/, ['launch', 'newContext:false', 'newPage', 'context.close', 'browser.close']],
    ['routing', 'route', /route primary/, ['launch', 'newContext:false', 'newPage', 'route', 'page.close', 'context.close', 'browser.close']],
    ['navigation', 'goto', /navigation primary/, ['launch', 'newContext:false', 'newPage', 'route', 'evaluate', 'goto', 'page.close', 'context.close', 'browser.close']],
    ['evaluation', 'evaluate', /evaluation primary/, ['launch', 'newContext:false', 'newPage', 'route', 'evaluate', 'goto', 'evaluate', 'evaluate', 'page.close', 'context.close', 'browser.close']]
  ]) {
    await t.test(name, async () => {
      const lifecycle = fakeLifecycle({ fail: { [failure]: true } });
      await assert.rejects(inspectWithFake(lifecycle), primary);
      assert.deepEqual(lifecycle.calls, expectedCalls);
    });
  }
  await t.test('all cleanup stages attempted and recorded', async () => {
    const lifecycle = fakeLifecycle({ fail: { goto: true, pageClose: true, contextClose: true, browserClose: true } });
    let caught;
    try { await inspectWithFake(lifecycle); } catch (error) { caught = error; }
    assert.match(caught.message, /^navigation primary; cleanup failures:/);
    assert.equal(caught.cleanupErrors.length, 3);
    assert.deepEqual(lifecycle.calls.slice(-3), ['page.close', 'context.close', 'browser.close']);
  });
  for (const cleanup of ['pageClose', 'contextClose', 'browserClose']) {
    await t.test(`${cleanup} without primary`, async () => {
      const lifecycle = fakeLifecycle({ fail: { [cleanup]: true } });
      await assert.rejects(inspectWithFake(lifecycle), /verifier cleanup failed/);
      assert.ok(lifecycle.calls.includes('browser.close'));
    });
  }
  await t.test('hanging cleanup is bounded and later closes are attempted', async () => {
    const lifecycle = fakeLifecycle();
    const originalLaunch = lifecycle.launchBrowser;
    lifecycle.launchBrowser = async () => {
      const ownedBrowser = await originalLaunch();
      const originalNewContext = ownedBrowser.newContext;
      ownedBrowser.newContext = async options => {
        const context = await originalNewContext(options);
        const originalNewPage = context.newPage;
        context.newPage = async () => {
          const page = await originalNewPage();
          page.close = async () => { lifecycle.calls.push('page.close'); return new Promise(() => {}); };
          return page;
        };
        return context;
      };
      return ownedBrowser;
    };
    await assert.rejects(inspectWithFake(lifecycle), /page cleanup timed out/);
    assert.ok(lifecycle.calls.includes('context.close'));
    assert.ok(lifecycle.calls.includes('browser.close'));
  });
});

test('timed-out late browser launches retain ownership and cannot leak processes', async t => {
  function lateLaunch({ reject = false, closeFails = false, delay = 35 } = {}) {
    const state = { closes: 0 };
    const lateBrowser = {
      close: async () => {
        state.closes += 1;
        if (closeFails) throw new Error('late close failure');
      }
    };
    const launchBrowser = () => new Promise((resolve, rejectLaunch) => setTimeout(() => {
      if (reject) rejectLaunch(new Error('late launch rejection'));
      else resolve(lateBrowser);
    }, delay));
    return { state, launchBrowser };
  }

  await t.test('late-created browser is closed', async () => {
    const late = lateLaunch();
    let caught;
    try {
      await inspectVisibleTestVersionDisclosure(statusHtml(), {
        launchBrowser: late.launchBrowser,
        liveBaseUrl: testUrl,
        allowedResourcePaths: new Set(['index.html']),
        lifecycleTimeoutMs: 15,
        fetchResourceImpl: async () => ({ bytes: Buffer.from(''), finalUrl: testUrl.href })
      });
    } catch (error) { caught = error; }
    assert.match(caught.message, /browser launch timed out/);
    await caught.lateCleanup;
    assert.equal(late.state.closes, 1);
  });

  await t.test('late launch rejection is consumed and retained', async () => {
    const late = lateLaunch({ reject: true });
    let caught;
    try {
      await inspectVisibleTestVersionDisclosure(statusHtml(), {
        launchBrowser: late.launchBrowser,
        liveBaseUrl: testUrl,
        allowedResourcePaths: new Set(['index.html']),
        lifecycleTimeoutMs: 15,
        fetchResourceImpl: async () => ({ bytes: Buffer.from(''), finalUrl: testUrl.href })
      });
    } catch (error) { caught = error; }
    await caught.lateCleanup;
    assert.match(caught.message, /browser launch timed out/);
    assert.match(caught.lateLaunchError.message, /late launch rejection/);
    assert.equal(late.state.closes, 0);
  });

  await t.test('late close failure is diagnostic and does not mask launch timeout', async () => {
    const late = lateLaunch({ closeFails: true });
    let caught;
    try {
      await inspectVisibleTestVersionDisclosure(statusHtml(), {
        launchBrowser: late.launchBrowser,
        liveBaseUrl: testUrl,
        allowedResourcePaths: new Set(['index.html']),
        lifecycleTimeoutMs: 15,
        fetchResourceImpl: async () => ({ bytes: Buffer.from(''), finalUrl: testUrl.href })
      });
    } catch (error) { caught = error; }
    await caught.lateCleanup;
    assert.match(caught.message, /browser launch timed out/);
    assert.equal(caught.lateCleanupErrors.length, 1);
    assert.match(caught.lateCleanupErrors[0].message, /late close failure/);
  });

  await t.test('repeated late launches close every acquired browser', async () => {
    const launches = Array.from({ length: 3 }, () => lateLaunch());
    const errors = [];
    for (const late of launches) {
      try {
        await inspectVisibleTestVersionDisclosure(statusHtml(), {
          launchBrowser: late.launchBrowser,
          liveBaseUrl: testUrl,
          allowedResourcePaths: new Set(['index.html']),
          lifecycleTimeoutMs: 15,
          fetchResourceImpl: async () => ({ bytes: Buffer.from(''), finalUrl: testUrl.href })
        });
      } catch (error) { errors.push(error); }
    }
    await Promise.all(errors.map(error => error.lateCleanup));
    assert.deepEqual(launches.map(late => late.state.closes), [1, 1, 1]);
  });
});

test('timed context and page acquisition adopts every late-owned resource for bounded cleanup', async t => {
  async function captureError(promise) {
    try {
      await promise;
      assert.fail('expected verifier acquisition to fail');
    } catch (error) {
      return error;
    }
  }
  function delayedContext({ mode = 'resolve', closeFails = false, delay = 35 } = {}) {
    const state = { closes: 0 };
    const context = {
      close: async () => {
        state.closes += 1;
        if (closeFails) throw new Error('late context close failure');
      }
    };
    const browser = {
      newContext: () => mode === 'never'
        ? new Promise(() => {})
        : new Promise((resolveContext, rejectContext) => setTimeout(() => {
          if (mode === 'reject') rejectContext(new Error('late context rejection'));
          else resolveContext(context);
        }, delay))
    };
    return { browser, state };
  }
  function delayedPage({ mode = 'resolve', pageCloseFails = false, contextCloseFails = false, browserCloseFails = false, delay = 35 } = {}) {
    const state = { browserCloses: 0, contextCloses: 0, pageCloses: 0 };
    const page = {
      close: async () => {
        state.pageCloses += 1;
        if (pageCloseFails) throw new Error('late page close failure');
      }
    };
    const context = {
      newPage: () => mode === 'never'
        ? new Promise(() => {})
        : new Promise((resolvePage, rejectPage) => setTimeout(() => {
          if (mode === 'reject') rejectPage(new Error('late page rejection'));
          else resolvePage(page);
        }, delay)),
      close: async () => {
        state.contextCloses += 1;
        if (contextCloseFails) throw new Error('context close failure');
      }
    };
    const browser = {
      newContext: async () => context,
      close: async () => {
        state.browserCloses += 1;
        if (browserCloseFails) throw new Error('browser close failure');
      }
    };
    return { browser, context, launchBrowser: async () => browser, state };
  }
  function acquisitionOptions(overrides = {}) {
    return {
      liveBaseUrl: testUrl,
      allowedResourcePaths: new Set(['index.html']),
      lifecycleTimeoutMs: 15,
      fetchResourceImpl: async () => ({ bytes: Buffer.from(''), finalUrl: testUrl.href }),
      ...overrides
    };
  }

  await t.test('late-resolving context is directly closed for a supplied browser', async () => {
    const late = delayedContext();
    const error = await captureError(inspectVisibleTestVersionDisclosure(statusHtml(), acquisitionOptions({ browser: late.browser })));
    assert.match(error.message, /^browser context creation timed out/);
    await error.lateCleanup;
    assert.equal(late.state.closes, 1);
  });
  await t.test('late-rejecting context is consumed and retained', async () => {
    const late = delayedContext({ mode: 'reject' });
    const error = await captureError(inspectVisibleTestVersionDisclosure(statusHtml(), acquisitionOptions({ browser: late.browser })));
    await error.lateCleanup;
    assert.match(error.message, /^browser context creation timed out/);
    assert.match(error.lateContextError.message, /late context rejection/);
    assert.equal(late.state.closes, 0);
  });
  await t.test('never-resolving context returns the primary timeout', async () => {
    const late = delayedContext({ mode: 'never' });
    const error = await captureError(inspectVisibleTestVersionDisclosure(statusHtml(), acquisitionOptions({ browser: late.browser })));
    assert.match(error.message, /^browser context creation timed out/);
    assert.equal(late.state.closes, 0);
  });
  await t.test('late-resolving page is directly closed after its context and owned browser cleanup', async () => {
    const late = delayedPage();
    const error = await captureError(inspectVisibleTestVersionDisclosure(statusHtml(), acquisitionOptions({ launchBrowser: late.launchBrowser })));
    assert.match(error.message, /^browser page creation timed out/);
    assert.equal(late.state.contextCloses, 1);
    assert.equal(late.state.browserCloses, 1);
    await error.lateCleanup;
    assert.equal(late.state.pageCloses, 1);
  });
  await t.test('late-rejecting page is consumed and retained', async () => {
    const late = delayedPage({ mode: 'reject' });
    const error = await captureError(inspectVisibleTestVersionDisclosure(statusHtml(), acquisitionOptions({ launchBrowser: late.launchBrowser })));
    await error.lateCleanup;
    assert.match(error.message, /^browser page creation timed out/);
    assert.match(error.latePageError.message, /late page rejection/);
    assert.equal(late.state.pageCloses, 0);
    assert.equal(late.state.contextCloses, 1);
    assert.equal(late.state.browserCloses, 1);
  });
  await t.test('never-resolving page returns the primary timeout and closes its parents', async () => {
    const late = delayedPage({ mode: 'never' });
    const error = await captureError(inspectVisibleTestVersionDisclosure(statusHtml(), acquisitionOptions({ launchBrowser: late.launchBrowser })));
    assert.match(error.message, /^browser page creation timed out/);
    assert.equal(late.state.pageCloses, 0);
    assert.equal(late.state.contextCloses, 1);
    assert.equal(late.state.browserCloses, 1);
  });
  await t.test('late context cleanup rejection is diagnostic without masking its timeout', async () => {
    const late = delayedContext({ closeFails: true });
    const error = await captureError(inspectVisibleTestVersionDisclosure(statusHtml(), acquisitionOptions({ browser: late.browser })));
    await error.lateCleanup;
    assert.match(error.message, /^browser context creation timed out/);
    assert.match(error.lateCleanupErrors[0].message, /late context close failure/);
  });
  await t.test('late page and parent cleanup rejections remain secondary to page timeout', async () => {
    const late = delayedPage({ pageCloseFails: true, contextCloseFails: true, browserCloseFails: true });
    const error = await captureError(inspectVisibleTestVersionDisclosure(statusHtml(), acquisitionOptions({ launchBrowser: late.launchBrowser })));
    assert.match(error.message, /^browser page creation timed out.*cleanup failures:/);
    assert.equal(error.cleanupErrors.length, 2);
    await error.lateCleanup;
    assert.equal(error.lateCleanupErrors.length, 1);
    assert.match(error.lateCleanupErrors[0].message, /late page close failure/);
  });
  await t.test('repeated supplied-browser context timeouts close every late context', async () => {
    const contexts = Array.from({ length: 3 }, () => delayedContext());
    let call = 0;
    const browser = { newContext: () => contexts[call++].browser.newContext() };
    const errors = [];
    for (let attempt = 0; attempt < contexts.length; attempt += 1) {
      errors.push(await captureError(inspectVisibleTestVersionDisclosure(statusHtml(), acquisitionOptions({ browser }))));
    }
    await Promise.all(errors.map(error => error.lateCleanup));
    assert.deepEqual(contexts.map(item => item.state.closes), [1, 1, 1]);
  });
  await t.test('repeated owned-browser page timeouts close every page, context, and browser', async () => {
    const attempts = Array.from({ length: 3 }, () => delayedPage());
    const errors = [];
    for (const late of attempts) {
      errors.push(await captureError(inspectVisibleTestVersionDisclosure(statusHtml(), acquisitionOptions({ launchBrowser: late.launchBrowser }))));
    }
    await Promise.all(errors.map(error => error.lateCleanup));
    assert.deepEqual(attempts.map(item => item.state), [
      { browserCloses: 1, contextCloses: 1, pageCloses: 1 },
      { browserCloses: 1, contextCloses: 1, pageCloses: 1 },
      { browserCloses: 1, contextCloses: 1, pageCloses: 1 }
    ]);
  });
});

test('geometry frame waits are bounded and preserve cleanup and retry control', async t => {
  await t.test('never-settling frame wait times out and attempts every cleanup', async () => {
    const lifecycle = fakeLifecycle();
    lifecycle.page.waitForTimeout = async () => { lifecycle.calls.push('frame.wait'); return new Promise(() => {}); };
    await assert.rejects(inspectWithFake(lifecycle, { lifecycleTimeoutMs: 15 }), /#release-badge geometry frame wait timed out/);
    assert.ok(lifecycle.calls.includes('page.close'));
    assert.ok(lifecycle.calls.includes('context.close'));
    assert.ok(lifecycle.calls.includes('browser.close'));
  });
  await t.test('late-resolving frame wait cannot mutate a completed inspection', async () => {
    const lifecycle = fakeLifecycle();
    let settlements = 0;
    lifecycle.page.waitForTimeout = async () => new Promise(resolve => setTimeout(() => { settlements += 1; resolve(); }, 35));
    await assert.rejects(inspectWithFake(lifecycle, { lifecycleTimeoutMs: 15 }), /#release-badge geometry frame wait timed out/);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(settlements, 1);
    assert.ok(lifecycle.calls.includes('browser.close'));
  });
  await t.test('late-rejecting frame wait is consumed without an unhandled rejection', async () => {
    const lifecycle = fakeLifecycle();
    const unhandled = [];
    const listener = reason => unhandled.push(reason);
    process.on('unhandledRejection', listener);
    try {
      lifecycle.page.waitForTimeout = async () => new Promise((_, reject) => setTimeout(() => reject(new Error('late frame rejection')), 35));
      await assert.rejects(inspectWithFake(lifecycle, { lifecycleTimeoutMs: 15 }), /#release-badge geometry frame wait timed out/);
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.deepEqual(unhandled, []);
      assert.ok(lifecycle.calls.includes('browser.close'));
    } finally {
      process.off('unhandledRejection', listener);
    }
  });
  await t.test('repeated slow frame waits cannot multiply the geometry operation deadline', async () => {
    const lifecycle = fakeLifecycle();
    lifecycle.page.waitForTimeout = async () => new Promise(resolve => setTimeout(resolve, 12));
    await assert.rejects(inspectWithFake(lifecycle, { lifecycleTimeoutMs: 25 }), /#release-badge geometry (?:frame wait|stabilization).*timed out/);
    assert.ok(lifecycle.calls.includes('browser.close'));
  });
  await t.test('retry loop regains control after every frame-wait timeout', async () => {
    const lifecycles = [];
    let attempts = 0;
    await assert.rejects(runWithRetries({
      attemptsValue: '2',
      delayValue: '0',
      sleepImpl: async () => {},
      checkOnceImpl: async () => {
        attempts += 1;
        const lifecycle = fakeLifecycle();
        lifecycles.push(lifecycle);
        lifecycle.page.waitForTimeout = async () => new Promise(() => {});
        await inspectWithFake(lifecycle, { lifecycleTimeoutMs: 15 });
      }
    }), /#release-badge geometry frame wait timed out/);
    assert.equal(attempts, 2);
    assert.ok(lifecycles.every(lifecycle => lifecycle.calls.includes('browser.close')));
  });
});

test('retry configuration cannot produce a successful no-op', async t => {
  assert.deepEqual(validateRetryConfiguration('2', '0'), { attempts: 2, delayMs: 0 });
  assert.deepEqual(validateRetryConfiguration('20', '250'), { attempts: 20, delayMs: 250 });
  for (const value of ['', ' ', '0', '-1', '-2', '+2', '1.5', '2.0', '2e1', '0x2', '0b10', '0o2', '02', 'abc', 'NaN', 'Infinity', '2junk', String(Number.MAX_SAFE_INTEGER + 1)]) {
    await t.test(`attempts=${JSON.stringify(value)}`, () => assert.throws(() => validateRetryConfiguration(value, '0'), /LIVE_CHECK_ATTEMPTS/));
  }
  for (const value of ['', ' ', '-1', '+2', '1.5', '2.0', '2e1', '0x2', '0b10', '0o2', '02', 'abc', 'NaN', 'Infinity', '2junk', String(Number.MAX_SAFE_INTEGER + 1)]) {
    await t.test(`delay=${JSON.stringify(value)}`, () => assert.throws(() => validateRetryConfiguration('1', value), /LIVE_CHECK_DELAY_MS/));
  }
  let calls = 0;
  await runWithRetries({ attemptsValue: '2', delayValue: '0', checkOnceImpl: async () => { calls += 1; if (calls === 1) throw new Error('retry'); }, sleepImpl: async () => {} });
  assert.equal(calls, 2);
  await assert.rejects(runWithRetries({ attemptsValue: '2', delayValue: '0', checkOnceImpl: async () => { throw new Error('final failure'); }, sleepImpl: async () => {} }), /final failure/);
});

test('version, release, URL, manifest, bundle, web manifest, and service-worker checks remain enforced', async t => {
  const { files } = await deploymentFiles();
  const cases = [
    ['candidate version', replaceJson(files, 'release.json', value => { value.companion_version = '0.6.0-candidate.5'; }), /candidate version mismatch/],
    ['release status', replaceJson(files, 'release.json', value => { value.release_status = 'field-release'; }), /release status mismatch/],
    ['public URL', replaceJson(files, 'release.json', value => { value.pwa_url = 'https://example.test/'; }), /public URL contract mismatch/],
    ['canonical manifest fingerprint', replaceJson(files, 'release.json', value => { value.manifest_sha256 = '0'.repeat(64); }), /canonical manifest fingerprint mismatch/],
    ['release/bundle identity', replaceJson(files, 'release.json', value => { value.bundle_id = 'wrong-bundle'; }), /release\/offline bundle identity mismatch/],
    ['offline bundle bytes', replaceFile(files, 'offline-bundle.json', Buffer.concat([files.get('offline-bundle.json'), Buffer.from('\n')])), /deployed offline-bundle\.json differs from the validated commit/],
    ['web manifest', replaceJson(files, 'manifest.webmanifest', value => { delete value.start_url; }), /manifest\.webmanifest live integrity mismatch/],
    ['service-worker identity', replaceFile(files, 'service-worker.js', files.get('service-worker.js').toString('utf8').replace(JSON.parse(files.get('release.json')).bundle_id, 'wrong-bundle')), /deployed service worker identity mismatch/]
  ];
  for (const [name, changedFiles, expectedError] of cases) await t.test(name, () => assert.rejects(verify(changedFiles), expectedError));
  await t.test('HTTPS live URL', () => assert.rejects(verify(files, { liveBaseUrl: new URL('http://candidate-verifier.invalid/base/') }), /live Companion URL is not HTTPS/));
});

test('resource count, byte-count, and checksum integrity checks remain enforced', async t => {
  const { bundle, files } = await deploymentFiles();
  const resource = bundle.resources.find(entry => entry.path === 'css/companion.css') || bundle.resources[0];
  const original = files.get(resource.path);
  const changedSameLength = Buffer.from(original);
  changedSameLength[0] = changedSameLength[0] === 0x20 ? 0x21 : 0x20;
  const missingResource = replaceFile(files, 'offline-bundle.json', JSON.stringify({ ...bundle, resources: bundle.resources.slice(1) }));
  await t.test('resource count', () => assert.rejects(verify(missingResource), /deployed offline-bundle\.json differs from the validated commit/));
  await t.test('byte count', () => assert.rejects(verify(replaceFile(files, resource.path, Buffer.concat([original, Buffer.from('x')]))), /live integrity mismatch/));
  await t.test('checksum at same byte count', () => assert.rejects(verify(replaceFile(files, resource.path, changedSameLength)), /live integrity mismatch/));
});

test('PNG resource MIME, path, hash, and integrity policies enforce fail-closed verification', async t => {
  const { bundle, files } = await deploymentFiles();
  const pngResources = bundle.resources.filter(resource => resource.path.endsWith('.png'));
  assert.equal(pngResources.length, 5);

  await t.test('all approved Field Guide PNG resources with image/png are accepted', async () => {
    const fieldGuidePngs = ['generated/field-guide-p1.png', 'generated/field-guide-p2.png', 'generated/field-guide-p3.png'];
    for (const path of fieldGuidePngs) {
      assert.equal(expectedDeliveredContentType(path), 'image/png');
    }
    const verified = await verify(files);
    assert.ok(verified.verifiedResourceCount >= 5);
  });

  await t.test('all approved Pocket Card PNG resources with image/png are accepted', async () => {
    const pocketCardPngs = ['generated/pocket-card-p1.png', 'generated/pocket-card-p2.png'];
    for (const path of pocketCardPngs) {
      assert.equal(expectedDeliveredContentType(path), 'image/png');
    }
    const verified = await verify(files);
    assert.ok(verified.verifiedResourceCount >= 5);
  });

  for (const wrongMime of ['image/jpeg', 'text/plain', 'application/pdf', 'image/svg+xml', 'application/octet-stream']) {
    await t.test(`approved Field Guide PNG with wrong MIME ${wrongMime} fails closed`, async () => {
      await assert.rejects(
        verify(files, { fetchResourceImpl: contentTypeOverrideLoader(files, 'generated/field-guide-p1.png', wrongMime) }),
        /generated\/field-guide-p1\.png returned unsupported Content-Type/
      );
    });
    await t.test(`approved Pocket Card PNG with wrong MIME ${wrongMime} fails closed`, async () => {
      await assert.rejects(
        verify(files, { fetchResourceImpl: contentTypeOverrideLoader(files, 'generated/pocket-card-p1.png', wrongMime) }),
        /generated\/pocket-card-p1\.png returned unsupported Content-Type/
      );
    });
  }

  await t.test('unapproved PNG path in request fails closed', async () => {
    const allowed = new Set(bundle.resources.map(r => r.path));
    assert.throws(() => canonicalDeploymentPath('generated/unapproved.png', testUrl, allowed));
    assert.throws(() => canonicalDeploymentPath('images/extra.png', testUrl, allowed));
  });

  await t.test('unapproved PNG resource in offline bundle fails closed', async () => {
    const forgedBundle = {
      ...bundle,
      resources: [
        ...bundle.resources,
        {
          path: 'generated/unapproved.png',
          sha256: '0'.repeat(64),
          bytes: 100,
          role: 'field-guide-page-image',
          required: true
        }
      ]
    };
    let forgedFiles = replaceFile(files, 'offline-bundle.json', JSON.stringify(forgedBundle));
    forgedFiles = replaceFile(forgedFiles, 'generated/unapproved.png', Buffer.from('unapproved'));
    await assert.rejects(verify(forgedFiles), /deployed offline-bundle\.json differs from the validated commit/);
  });

  await t.test('approved Field Guide PNG with wrong byte count fails closed', async () => {
    const originalBytes = files.get('generated/field-guide-p1.png');
    const truncatedBytes = originalBytes.subarray(0, originalBytes.length - 1);
    const corruptedFiles = replaceFile(files, 'generated/field-guide-p1.png', truncatedBytes);
    await assert.rejects(verify(corruptedFiles), /generated\/field-guide-p1\.png live integrity mismatch/);
  });

  await t.test('approved Pocket Card PNG with wrong byte count fails closed', async () => {
    const originalBytes = files.get('generated/pocket-card-p1.png');
    const truncatedBytes = originalBytes.subarray(0, originalBytes.length - 1);
    const corruptedFiles = replaceFile(files, 'generated/pocket-card-p1.png', truncatedBytes);
    await assert.rejects(verify(corruptedFiles), /generated\/pocket-card-p1\.png live integrity mismatch/);
  });

  await t.test('approved Field Guide PNG with hash mismatch at identical byte count fails closed', async () => {
    const originalBytes = files.get('generated/field-guide-p1.png');
    const corruptedBytes = Buffer.from(originalBytes);
    corruptedBytes[corruptedBytes.length - 1] ^= 0xff;
    const corruptedFiles = replaceFile(files, 'generated/field-guide-p1.png', corruptedBytes);
    await assert.rejects(verify(corruptedFiles), /generated\/field-guide-p1\.png live integrity mismatch/);
  });

  await t.test('approved Pocket Card PNG with hash mismatch at identical byte count fails closed', async () => {
    const originalBytes = files.get('generated/pocket-card-p1.png');
    const corruptedBytes = Buffer.from(originalBytes);
    corruptedBytes[corruptedBytes.length - 1] ^= 0xff;
    const corruptedFiles = replaceFile(files, 'generated/pocket-card-p1.png', corruptedBytes);
    await assert.rejects(verify(corruptedFiles), /generated\/pocket-card-p1\.png live integrity mismatch/);
  });
});

test('CI and Pages prove pinned local-only Playwright installation and local injected execution', async () => {
  const packageJson = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(await readFile(resolve(repoRoot, 'package-lock.json'), 'utf8'));
  const ci = await readFile(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  const pages = await readFile(resolve(repoRoot, '.github/workflows/pages.yml'), 'utf8');
  const docs = await readFile(resolve(repoRoot, 'docs/pages-verifier-operations.md'), 'utf8');
  const version = packageJson.devDependencies['@playwright/test'];
  assert.equal(version, '1.62.1');
  assert.equal(packageLock.packages['node_modules/@playwright/test'].version, version);
  assert.equal(packageJson.scripts['test:live-verifier'], 'node --test scripts/test-live-site-verifier.mjs');
  assert.match(ci, new RegExp(`mcr\\.microsoft\\.com/playwright:v${version.replaceAll('.', '\\.')}\\-noble`));
  assert.match(ci, /run: npm run test:live-verifier/);
  assert.match(pages, /installed_version=.*@playwright\/test\/package\.json/);
  assert.match(pages, /test "\$installed_version" = "\$expected_version"/);
  assert.match(pages, /test "\$cli_version" = "Version \$expected_version"/);
  assert.match(pages, /npx --no-install playwright install --with-deps chromium/);
  assert.doesNotMatch(pages, /npx playwright install/);
  assert.match(pages, /run: npm run check:live/);
  assert.match(docs, /local-only/i);
  assert.match(docs, /structured ledger/i);
  assert.match(docs, /at most 64 documents/i);
  assert.match(docs, /at most 8 levels below the root/i);
  assert.match(docs, /requestfailed/i);
  assert.match(docs, /all SRI-bearing resource constructs/i);
  assert.match(docs, /CSP in authored metadata or verifier-loaded response headers/i);
  assert.match(docs, /share one deadline/i);
});
