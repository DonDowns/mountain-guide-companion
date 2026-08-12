import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');
const requestedBase = process.argv[2] || process.env.COMPANION_LIVE_URL || 'https://companion.vondadowns.com/';
const baseUrl = new URL(requestedBase.endsWith('/') ? requestedBase : `${requestedBase}/`);
const expectedPublicBase = 'https://companion.vondadowns.com/';
const testVersionLabel = 'Test version';
const fieldReleaseNotice = 'Physical phone testing is still required. This is not yet a field release.';
const defaultLifecycleTimeoutMs = 10000;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const deliveredMimeTypes = new Map([
  ['.html', ['text/html']],
  ['.htm', ['text/html']],
  ['.xhtml', ['application/xhtml+xml']],
  ['.xml', ['application/xml', 'text/xml']],
  ['.css', ['text/css']],
  ['.js', ['text/javascript', 'application/javascript']],
  ['.json', ['application/json']],
  ['.webmanifest', ['application/manifest+json', 'application/json']],
  ['.svg', ['image/svg+xml']],
  ['.pdf', ['application/pdf']]
]);

function extensionFor(path) {
  const match = /(?:^|\/)[^/]*(\.[^.\/]+)$/.exec(path.toLowerCase());
  return match?.[1] || '';
}

export function expectedDeliveredContentType(path) {
  const accepted = deliveredMimeTypes.get(extensionFor(path));
  if (!accepted) throw new Error(`${path} has no approved delivered Content-Type policy`);
  return accepted[0];
}

const httpTokenPattern = /[!#$%&'*+\-.^_`|~0-9A-Za-z]+/y;

function headerValues(headers, name) {
  if (!headers) return [];
  const normalizedName = name.toLowerCase();
  if (typeof headers.get === 'function') {
    const value = headers.get(name);
    return value === null ? [] : [String(value)];
  }
  const values = [];
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== normalizedName || value === undefined || value === null) continue;
    if (Array.isArray(value)) values.push(...value.map(item => String(item)));
    else values.push(String(value));
  }
  return values;
}

function parseDeliveredContentType(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) throw new Error('empty Content-Type');
  if (/[^\t\x20-\x7e]/.test(rawValue)) throw new Error('Content-Type contains controls or non-ASCII syntax');
  const source = rawValue.trim();
  let index = 0;
  function whitespace() {
    while (source[index] === ' ' || source[index] === '\t') index += 1;
  }
  function token(label) {
    httpTokenPattern.lastIndex = index;
    const match = httpTokenPattern.exec(source);
    if (!match) throw new Error(`Content-Type has malformed ${label}`);
    index = httpTokenPattern.lastIndex;
    return match[0];
  }
  const type = token('type').toLowerCase();
  if (source[index] !== '/') throw new Error('Content-Type is missing the media-type slash');
  index += 1;
  const subtype = token('subtype').toLowerCase();
  const parameters = new Map();
  while (index < source.length) {
    whitespace();
    if (index >= source.length) break;
    if (source[index] === ',') throw new Error('comma-joined Content-Type values are not accepted');
    if (source[index] !== ';') throw new Error('Content-Type has malformed parameter separation');
    index += 1;
    whitespace();
    const name = token('parameter name').toLowerCase();
    whitespace();
    if (source[index] !== '=') throw new Error(`Content-Type parameter ${name} is missing =`);
    index += 1;
    whitespace();
    let value;
    if (source[index] === '"') {
      index += 1;
      value = '';
      let closed = false;
      while (index < source.length) {
        const character = source[index++];
        if (character === '"') {
          closed = true;
          break;
        }
        if (character === '\\') {
          if (index >= source.length) throw new Error(`Content-Type parameter ${name} has an unterminated escape`);
          const escaped = source[index++];
          if (/[^\t\x20-\x7e]/.test(escaped)) throw new Error(`Content-Type parameter ${name} has an invalid escape`);
          value += escaped;
        } else {
          if (/[^\t\x20-\x7e]/.test(character)) throw new Error(`Content-Type parameter ${name} has invalid quoted syntax`);
          value += character;
        }
      }
      if (!closed) throw new Error(`Content-Type parameter ${name} has an unterminated quoted value`);
    } else {
      value = token(`parameter ${name} value`);
    }
    const normalizedValue = name === 'charset' ? value.toLowerCase() : value;
    if (parameters.has(name) && parameters.get(name) !== normalizedValue) {
      throw new Error(`Content-Type has conflicting duplicate ${name} parameters`);
    }
    parameters.set(name, normalizedValue);
  }
  return {
    identity: `${type}/${subtype};${[...parameters].sort().map(([name, value]) => `${name}=${value}`).join(';')}`,
    mediaType: `${type}/${subtype}`
  };
}

function rejectBlockingResponsePolicy(resource, requestedPath) {
  for (const name of ['content-security-policy', 'x-content-security-policy', 'x-webkit-csp']) {
    if (headerValues(resource?.headers, name).some(value => value.trim())) {
      throw new Error(`${requestedPath} returned unsupported ${name} response policy`);
    }
  }
  const deliveredValues = headerValues(resource?.headers, 'content-type');
  if (!deliveredValues.length || deliveredValues.some(value => !value.trim())) {
    throw new Error(`${requestedPath} returned no Content-Type; a delivered MIME type is required`);
  }
  let parsedValues;
  try {
    parsedValues = deliveredValues.map(parseDeliveredContentType);
  } catch (error) {
    throw new Error(`${requestedPath} returned malformed Content-Type: ${error.message}`);
  }
  if (new Set(parsedValues.map(value => value.identity)).size !== 1) {
    throw new Error(`${requestedPath} returned conflicting duplicate Content-Type values`);
  }
  const deliveredType = parsedValues[0].mediaType;
  const expectedTypes = deliveredMimeTypes.get(extensionFor(requestedPath));
  if (!expectedTypes) {
    throw new Error(`${requestedPath} has no approved delivered Content-Type policy`);
  }
  if (!expectedTypes.includes(deliveredType)) {
    throw new Error(
      `${requestedPath} returned unsupported Content-Type ${deliveredType}; expected ${expectedTypes.join(' or ')}`
    );
  }
  return { contentType: deliveredValues[0].trim(), mediaType: deliveredType };
}

function decodedSegments(pathname) {
  const segments = pathname.split('/');
  const decoded = [];
  for (const segment of segments) {
    let value;
    try {
      value = decodeURIComponent(segment);
    } catch {
      throw new Error('deployment resource path contains malformed percent encoding');
    }
    if (value === '.' || value === '..') throw new Error('deployment resource path contains a dot segment');
    if (value.includes('/') || value.includes('\\')) {
      throw new Error('deployment resource path contains an encoded or backslash separator');
    }
    decoded.push(value);
  }
  return decoded.join('/');
}

function canonicalBase(liveBaseUrl) {
  const base = new URL(liveBaseUrl);
  if (base.search || base.hash || base.username || base.password) {
    throw new Error('deployment base URL contains unsupported credentials, query, or fragment');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  base.pathname = decodedSegments(base.pathname);
  return base;
}

export function canonicalDeploymentPath(input, liveBaseUrl, allowedPaths) {
  const base = canonicalBase(liveBaseUrl);
  let target;
  if (input instanceof URL || /^[a-z][a-z\d+.-]*:/i.test(String(input))) {
    target = new URL(input);
  } else {
    const relative = String(input);
    if (!relative || relative.startsWith('/') || relative.startsWith('\\') || relative.startsWith('//')) {
      throw new Error('deployment resource path must be a nonempty relative path');
    }
    if (relative.includes('?') || relative.includes('#')) {
      throw new Error('deployment resource path contains an unsupported query or fragment');
    }
    decodedSegments(relative);
    target = new URL(relative, base);
  }
  if (target.username || target.password || target.search || target.hash) {
    throw new Error('deployment resource URL contains unsupported credentials, query, or fragment');
  }
  if (target.origin !== base.origin) throw new Error('deployment resource URL is outside the approved origin');
  const canonicalPathname = decodedSegments(target.pathname);
  if (!canonicalPathname.startsWith(base.pathname)) {
    throw new Error('deployment resource URL is outside the approved base path');
  }
  const path = canonicalPathname.slice(base.pathname.length) || 'index.html';
  decodedSegments(path);
  if (allowedPaths && !allowedPaths.has(path)) throw new Error(`${path} is not an approved deployment resource`);
  return path;
}

export function canonicalAuthoredResourcePath(input, allowedPaths, documentPath = 'index.html') {
  if (typeof input !== 'string' || !input) throw new Error('authored resource reference must be a nonempty string');
  if (input !== input.trim()) throw new Error('authored resource reference contains surrounding whitespace');
  if (input.startsWith('/') || input.startsWith('\\') || input.startsWith('//')) {
    throw new Error('authored resource reference must be deployment-relative');
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(input)) throw new Error('authored resource reference must not be an absolute URL');
  if (input.includes('?') || input.includes('#')) throw new Error('authored resource reference contains an unsupported query or fragment');
  if (input.includes('\\')) throw new Error('authored resource reference contains a backslash separator');
  if (input.includes('%')) throw new Error('authored resource reference contains unsupported percent encoding');
  const rawSegments = input.split('/');
  if (rawSegments.some(segment => segment === '')) throw new Error('authored resource reference contains an empty path segment');
  if (rawSegments[0] === '.') rawSegments.shift();
  if (!rawSegments.length) throw new Error('authored resource reference does not name a resource');
  const decoded = rawSegments.map(segment => {
    const value = segment;
    if (value === '.' || value === '..') throw new Error('authored resource reference contains a dot segment');
    if (value.includes('/') || value.includes('\\')) throw new Error('authored resource reference contains an encoded separator');
    if (value.includes('%')) throw new Error('authored resource reference contains ambiguous nested percent encoding');
    return value;
  });
  const documentDirectory = posix.dirname(documentPath);
  const path = documentDirectory === '.' ? decoded.join('/') : `${documentDirectory}/${decoded.join('/')}`;
  if (allowedPaths && !allowedPaths.has(path)) throw new Error(`${path} is not an approved deployment resource`);
  return path;
}

async function fetchDeploymentResource(path, { liveBaseUrl, allowedPaths, fetchImpl = fetch, signal }) {
  const canonicalPath = canonicalDeploymentPath(path, liveBaseUrl, allowedPaths);
  const requestedUrl = new URL(canonicalPath, canonicalBase(liveBaseUrl));
  const response = await fetchImpl(requestedUrl, { redirect: 'follow', cache: 'no-store', signal });
  if (!response.ok) throw new Error(`${canonicalPath} returned HTTP ${response.status}`);
  const finalPath = canonicalDeploymentPath(response.url, liveBaseUrl, allowedPaths);
  if (finalPath !== canonicalPath) throw new Error(`${canonicalPath} redirected to a different deployment resource`);
  return { bytes: Buffer.from(await response.arrayBuffer()), finalUrl: response.url, headers: response.headers };
}

function bounded(promise, label, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function boundedResourceLoad(loadResource, path, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const operation = Promise.resolve().then(() => loadResource(path, { signal: controller.signal }));
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new Error(`${path} resource load timed out after ${timeoutMs}ms`));
      reject(new Error(`${path} resource load timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function attachCleanupErrors(primaryError, cleanupErrors) {
  if (!cleanupErrors.length) return primaryError;
  Object.defineProperty(primaryError, 'cleanupErrors', {
    configurable: true,
    enumerable: false,
    value: cleanupErrors
  });
  primaryError.message += `; cleanup failures: ${cleanupErrors.map(error => error.message).join('; ')}`;
  return primaryError;
}

async function normalizeLoadedResource(result, requestedPath, liveBaseUrl, allowedPaths) {
  const resource = Buffer.isBuffer(result) || result instanceof Uint8Array
    ? { bytes: Buffer.from(result), finalUrl: new URL(requestedPath, canonicalBase(liveBaseUrl)).href }
    : result;
  if (!resource || !(Buffer.isBuffer(resource.bytes) || resource.bytes instanceof Uint8Array)) {
    throw new Error(`${requestedPath} loader returned no bytes`);
  }
  const finalPath = canonicalDeploymentPath(resource.finalUrl, liveBaseUrl, allowedPaths);
  if (finalPath !== requestedPath) throw new Error(`${requestedPath} redirected to ${finalPath}`);
  const deliveredContentType = rejectBlockingResponsePolicy(resource, requestedPath);
  const bytes = Buffer.from(resource.bytes);
  return Object.freeze({
    bytes,
    byteCount: bytes.length,
    contentType: deliveredContentType.contentType,
    finalUrl: resource.finalUrl,
    mediaType: deliveredContentType.mediaType,
    sha256: sha256(bytes)
  });
}

async function loadValidatedResource(loadResource, path, liveBaseUrl, allowedPaths, timeoutMs) {
  const first = await normalizeLoadedResource(
    await boundedResourceLoad(loadResource, path, timeoutMs),
    path,
    liveBaseUrl,
    allowedPaths
  );
  const confirmation = await normalizeLoadedResource(
    await boundedResourceLoad(loadResource, path, timeoutMs),
    path,
    liveBaseUrl,
    allowedPaths
  );
  for (const property of ['finalUrl', 'contentType', 'mediaType', 'byteCount', 'sha256']) {
    if (first[property] !== confirmation[property]) {
      throw new Error(`${path} changed between bounded response snapshots (${property} mismatch)`);
    }
  }
  return first;
}

function createValidatedSnapshotCache(loadResource, liveBaseUrl, allowedPaths, timeoutMs, initial = []) {
  const snapshots = new Map(initial);
  return {
    entries: () => snapshots.entries(),
    get(path) {
      if (!snapshots.has(path)) {
        snapshots.set(path, loadValidatedResource(loadResource, path, liveBaseUrl, allowedPaths, timeoutMs));
      }
      return Promise.resolve(snapshots.get(path));
    }
  };
}

async function acquireOwnedResource({ acquire, cleanup, label, lateErrorProperty, timeoutMs }) {
  const lateCleanupErrors = [];
  const acquisitionPromise = Promise.resolve().then(acquire);
  let timer;
  const timeoutError = new Error(`${label} timed out after ${timeoutMs}ms`);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError), timeoutMs);
  });
  try {
    return await Promise.race([acquisitionPromise, timeout]);
  } catch (error) {
    if (error === timeoutError) {
      const lateCleanup = acquisitionPromise.then(async lateResource => {
        try {
          await bounded(cleanup(lateResource), `late ${label} cleanup`, timeoutMs);
        } catch (cleanupError) {
          lateCleanupErrors.push(new Error(`late ${label} cleanup failed: ${cleanupError.message}`));
        }
      }, lateAcquisitionError => {
        Object.defineProperty(error, lateErrorProperty, {
          configurable: true,
          enumerable: false,
          value: lateAcquisitionError
        });
      });
      Object.defineProperties(error, {
        lateCleanup: { configurable: true, enumerable: false, value: lateCleanup },
        lateCleanupErrors: { configurable: true, enumerable: false, value: lateCleanupErrors }
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function acquireOwnedBrowser(launchBrowser, timeoutMs) {
  return acquireOwnedResource({
    acquire: launchBrowser,
    cleanup: lateBrowser => lateBrowser.close(),
    label: 'browser launch',
    lateErrorProperty: 'lateLaunchError',
    timeoutMs
  });
}

function acquireOwnedContext(browser, timeoutMs) {
  return acquireOwnedResource({
    acquire: () => browser.newContext({ javaScriptEnabled: false }),
    cleanup: lateContext => lateContext.close(),
    label: 'browser context creation',
    lateErrorProperty: 'lateContextError',
    timeoutMs
  });
}

function acquireOwnedPage(context, timeoutMs) {
  return acquireOwnedResource({
    acquire: () => context.newPage(),
    cleanup: latePage => latePage.close(),
    label: 'browser page creation',
    lateErrorProperty: 'latePageError',
    timeoutMs
  });
}

const authoredUrlAttributeNames = new Set([
  'action', 'archive', 'background', 'cite', 'classid', 'code', 'codebase', 'data',
  'datasrc', 'dynsrc', 'formaction', 'href', 'imagesrcset', 'itemid', 'longdesc',
  'lowsrc', 'manifest', 'ping', 'poster', 'profile', 'src', 'srcdoc', 'srcset',
  'usemap', 'xlink:href'
]);
function decodeSrcdocStructure(value, owner) {
  for (let index = value.indexOf('&'); index >= 0; index = value.indexOf('&', index + 1)) {
    const reference = /^&(?:#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);?/i.exec(value.slice(index));
    if (!reference || !/^&(amp|apos|gt|lt|quot);$/i.test(reference[0])) {
      throw new Error(`${owner} srcdoc contains a normalization-dependent character reference`);
    }
  }
  return value.replace(/&(amp|apos|gt|lt|quot);/gi, match => ({
    '&amp;': '&',
    '&apos;': "'",
    '&gt;': '>',
    '&lt;': '<',
    '&quot;': '"'
  })[match.toLowerCase()]);
}

const htmlVoidElementNames = new Set([
  'area', 'base', 'br', 'col', 'embed', 'frame', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr'
]);
const htmlRawTextElementNames = new Set(['iframe', 'noembed', 'noframes', 'style', 'xmp']);
const htmlRcdataElementNames = new Set(['textarea', 'title']);
const xmlMimeTypes = new Set(['application/xhtml+xml', 'application/xml', 'image/svg+xml', 'text/xml']);
const markupWhitespacePattern = /[\t\n\f\r ]/;

function authoredCharacterReferenceEvidence(value) {
  const evidence = [];
  for (let index = value.indexOf('&'); index >= 0; index = value.indexOf('&', index + 1)) {
    const reference = /^&(?:#(?:[xX][0-9A-Fa-f]+|\d+)|[A-Za-z][A-Za-z0-9]+);?/.exec(value.slice(index));
    evidence.push({ offset: index, raw: reference?.[0] || '&' });
  }
  return evidence;
}

function decodeXmlPredefinedReferences(value, owner) {
  for (let index = value.indexOf('&'); index >= 0; index = value.indexOf('&', index + 1)) {
    const reference = /^&(?:amp|apos|gt|lt|quot);/.exec(value.slice(index));
    if (!reference) {
      throw new Error(`${owner} contains an unsupported XML entity or character reference`);
    }
  }
  return value.replace(/&(amp|apos|gt|lt|quot);/g, match => ({
    '&amp;': '&',
    '&apos;': "'",
    '&gt;': '>',
    '&lt;': '<',
    '&quot;': '"'
  })[match]);
}

function htmlAttributeValueForDom(value) {
  return value.replace(/\r\n?/g, '\n');
}

function parseHtmlStartTag(source, opening, owner) {
  let cursor = opening + 1;
  const tagMatch = /^[A-Za-z][A-Za-z0-9:._-]*/.exec(source.slice(cursor));
  if (!tagMatch) throw new Error(`${owner} contains malformed HTML start-tag syntax`);
  const rawName = tagMatch[0];
  const name = rawName.toLowerCase();
  cursor += rawName.length;
  const attributes = [];
  const attributeNames = new Set();
  let selfClosing = false;
  while (cursor < source.length) {
    while (markupWhitespacePattern.test(source[cursor])) cursor += 1;
    if (source[cursor] === '>') {
      cursor += 1;
      break;
    }
    if (source[cursor] === '/' && source[cursor + 1] === '>') {
      selfClosing = true;
      cursor += 2;
      break;
    }
    const attributeMatch = /^[^\t\n\f\r =/>"'<`]+/.exec(source.slice(cursor));
    if (!attributeMatch) throw new Error(`${owner} <${name}> contains malformed attribute syntax`);
    const authoredName = attributeMatch[0];
    const attributeName = authoredName.toLowerCase();
    if (attributeNames.has(attributeName)) {
      throw new Error(`${owner} <${name}> contains duplicate ${authoredName} attributes`);
    }
    attributeNames.add(attributeName);
    cursor += authoredName.length;
    while (markupWhitespacePattern.test(source[cursor])) cursor += 1;
    let hasValue = false;
    let quote = '';
    let rawValue = '';
    if (source[cursor] === '=') {
      hasValue = true;
      cursor += 1;
      while (markupWhitespacePattern.test(source[cursor])) cursor += 1;
      quote = source[cursor] === '"' || source[cursor] === "'" ? source[cursor++] : '';
      const valueStart = cursor;
      if (quote) {
        while (cursor < source.length && source[cursor] !== quote) cursor += 1;
        if (cursor >= source.length) throw new Error(`${owner} <${name}> ${authoredName} has an unterminated quote`);
        rawValue = source.slice(valueStart, cursor);
        if (attributeName !== 'srcdoc' && rawValue.includes('<')) {
          throw new Error(`${owner} <${name}> ${authoredName} contains ambiguous less-than syntax`);
        }
        cursor += 1;
      } else {
        while (cursor < source.length && !markupWhitespacePattern.test(source[cursor]) && source[cursor] !== '>') cursor += 1;
        rawValue = source.slice(valueStart, cursor);
        if (!rawValue || /["'<=`]/.test(rawValue)) {
          throw new Error(`${owner} <${name}> ${authoredName} has malformed unquoted syntax`);
        }
      }
    } else if (authoredUrlAttributeNames.has(attributeName)) {
      throw new Error(`${owner} <${name}> ${authoredName} requires an explicit value`);
    }
    const characterReferences = authoredCharacterReferenceEvidence(rawValue);
    let value = htmlAttributeValueForDom(rawValue);
    if (characterReferences.length) {
      if (attributeName !== 'srcdoc') {
        throw new Error(`${owner} <${name}> ${authoredName} contains a normalization-dependent character reference`);
      }
      value = decodeSrcdocStructure(rawValue, owner);
    }
    attributes.push({
      characterReferences,
      hasValue,
      name: attributeName,
      quote,
      rawName: authoredName,
      rawValue,
      value: hasValue ? value : ''
    });
  }
  if (cursor > source.length || (source[cursor - 1] !== '>' && source.slice(cursor - 2, cursor) !== '/>')) {
    throw new Error(`${owner} <${name}> is unterminated`);
  }
  if (selfClosing && !htmlVoidElementNames.has(name)) {
    throw new Error(`${owner} <${name}> uses unsupported self-closing HTML syntax`);
  }
  return { attributes, end: cursor, name, rawName, selfClosing };
}

function parseHtmlEndTag(source, opening, owner, expectedName = null) {
  const match = /^<\/([A-Za-z][A-Za-z0-9:._-]*)([\s\S]*?)>/.exec(source.slice(opening));
  if (!match) throw new Error(`${owner} contains an unterminated HTML end tag`);
  const name = match[1].toLowerCase();
  if (expectedName && name !== expectedName) {
    throw new Error(`${owner} <${expectedName}> has a mismatched special-text end tag`);
  }
  if (!/^[\t\n\f\r ]*$/.test(match[2])) {
    throw new Error(`${owner} </${name}> uses an ambiguous browser-recognized end-tag boundary`);
  }
  return { end: opening + match[0].length, name };
}

function consumeHtmlSpecialText(source, index, tag, state, owner) {
  if (state === 'plaintext') {
    throw new Error(`${owner} contains unsupported HTML plaintext state`);
  }
  const lowerSource = source.toLowerCase();
  const marker = `</${tag}`;
  let search = index;
  while (search < source.length) {
    const boundary = lowerSource.indexOf(marker, search);
    if (boundary < 0) throw new Error(`${owner} <${tag}> has no browser-applicable closing tag`);
    const delimiter = source[boundary + marker.length];
    if (delimiter === '>' || delimiter === '/' || markupWhitespacePattern.test(delimiter)) {
      if (state === 'script-data') {
        const scriptData = source.slice(index, boundary).toLowerCase();
        if (scriptData.includes('<!--')) {
          throw new Error(`${owner} <script> contains unsupported escaped script-data syntax`);
        }
      }
      return parseHtmlEndTag(source, boundary, owner, tag).end;
    }
    search = boundary + marker.length;
  }
  throw new Error(`${owner} <${tag}> has no browser-applicable closing tag`);
}

function tokenizeHtmlAuthoredSource(source, owner, depth) {
  const elements = [];
  const stack = [];
  let doctypeSeen = false;
  let canonicalProlog = true;
  let startTagSeen = false;
  let index = 0;
  function currentParent() {
    return stack.at(-1) || null;
  }
  function assertTextPlacement(text) {
    if (!text || !text.trim()) return;
    const parent = currentParent();
    if (!parent || parent.name === 'html' || parent.name === 'head') {
      throw new Error(`${owner} contains noncanonical HTML document-shell text`);
    }
  }
  function recordStructure(token) {
    const parent = currentParent();
    token.parentOrdinal = parent?.ordinal ?? null;
    token.childIndex = parent ? parent.childCount++ : elements.filter(item => item.parentOrdinal === null).length;
    token.path = parent ? `${parent.path}/${token.childIndex}` : `${token.childIndex}`;
    token.childCount = 0;
  }
  while (index < source.length) {
    const opening = source.indexOf('<', index);
    assertTextPlacement(source.slice(index, opening < 0 ? source.length : opening));
    if (opening < 0) break;
    if (source.startsWith('<!--', opening)) {
      if (!doctypeSeen && !startTagSeen) canonicalProlog = false;
      const end = source.indexOf('-->', opening + 4);
      if (end < 0) throw new Error(`${owner} contains an unterminated or browser-divergent comment`);
      const comment = source.slice(opening + 4, end);
      if (comment.includes('--') || comment.includes('<!--') || comment.startsWith('>') || comment.startsWith('->')) {
        throw new Error(`${owner} contains a malformed or breakout-capable comment`);
      }
      index = end + 3;
      continue;
    }
    if (source.startsWith('</', opening)) {
      const endTag = parseHtmlEndTag(source, opening, owner);
      const expected = stack.pop();
      if (!expected || expected.name !== endTag.name) {
        throw new Error(`${owner} contains unmatched or reconstructed HTML end tag </${endTag.name}>`);
      }
      index = endTag.end;
      continue;
    }
    if (source.startsWith('<!', opening)) {
      const doctype = /^<!doctype[\t\n\f\r ]+html[\t\n\f\r ]*>/i.exec(source.slice(opening));
      if (!doctype || doctypeSeen || startTagSeen) {
        if (source.slice(opening, opening + 9).toLowerCase() === '<![cdata[') {
          throw new Error(`${owner} contains unsupported HTML CDATA-like syntax`);
        }
        throw new Error(`${owner} contains unsupported or bogus HTML declaration syntax`);
      }
      doctypeSeen = true;
      index = opening + doctype[0].length;
      continue;
    }
    if (source.startsWith('<?', opening)) {
      throw new Error(`${owner} contains unsupported HTML processing-instruction-like syntax`);
    }
    const token = parseHtmlStartTag(source, opening, owner);
    token.ordinal = elements.length;
    recordStructure(token);
    elements.push(token);
    startTagSeen = true;
    index = token.end;
    const srcdoc = token.attributes.find(attribute => attribute.name === 'srcdoc');
    if (srcdoc?.hasValue) {
      validateAuthoredMarkupLexically(srcdoc.value, `${owner} srcdoc`, depth + 1, 'text/html');
    }
    if (!token.selfClosing && !htmlVoidElementNames.has(token.name)) {
      let state = null;
      if (token.name === 'script') state = 'script-data';
      else if (htmlRawTextElementNames.has(token.name)) state = 'rawtext';
      else if (htmlRcdataElementNames.has(token.name)) state = 'rcdata';
      else if (token.name === 'plaintext') state = 'plaintext';
      if (state) index = consumeHtmlSpecialText(source, index, token.name, state, owner);
      else stack.push(token);
    }
  }
  if (stack.length) throw new Error(`${owner} <${stack.at(-1).name}> has no closing HTML tag`);
  const roots = elements.filter(token => token.parentOrdinal === null);
  const htmlRoot = roots[0];
  const shellChildren = htmlRoot
    ? elements.filter(token => token.parentOrdinal === htmlRoot.ordinal)
    : [];
  const canonicalShellError = !doctypeSeen || !canonicalProlog
    ? `${owner} authored source does not begin with the canonical HTML doctype`
    : roots.length !== 1 || htmlRoot?.name !== 'html' || shellChildren.length !== 2 ||
      shellChildren[0].name !== 'head' || shellChildren[1].name !== 'body'
      ? `${owner} authored source does not use the canonical html/head/body document shell`
      : '';
  return { canonicalShellError, elements, mode: 'text/html', processingInstructions: [] };
}

function parseXmlStartTag(source, opening, owner) {
  let cursor = opening + 1;
  const tagMatch = /^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(source.slice(cursor));
  if (!tagMatch) throw new Error(`${owner} contains malformed XML start-tag syntax`);
  const name = tagMatch[0];
  cursor += name.length;
  const attributes = [];
  const attributeNames = new Set();
  let selfClosing = false;
  while (cursor < source.length) {
    while (/[\t\n\r ]/.test(source[cursor])) cursor += 1;
    if (source[cursor] === '>') {
      cursor += 1;
      break;
    }
    if (source[cursor] === '/' && source[cursor + 1] === '>') {
      selfClosing = true;
      cursor += 2;
      break;
    }
    const attributeMatch = /^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(source.slice(cursor));
    if (!attributeMatch) throw new Error(`${owner} <${name}> contains malformed XML attribute syntax`);
    const attributeName = attributeMatch[0];
    if (attributeNames.has(attributeName)) {
      throw new Error(`${owner} <${name}> contains duplicate ${attributeName} attributes`);
    }
    attributeNames.add(attributeName);
    cursor += attributeName.length;
    while (/[\t\n\r ]/.test(source[cursor])) cursor += 1;
    if (source[cursor] !== '=') throw new Error(`${owner} <${name}> ${attributeName} requires an XML value`);
    cursor += 1;
    while (/[\t\n\r ]/.test(source[cursor])) cursor += 1;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") {
      throw new Error(`${owner} <${name}> ${attributeName} requires a quoted XML value`);
    }
    cursor += 1;
    const valueStart = cursor;
    while (cursor < source.length && source[cursor] !== quote) cursor += 1;
    if (cursor >= source.length) throw new Error(`${owner} <${name}> ${attributeName} has an unterminated XML quote`);
    const rawValue = source.slice(valueStart, cursor);
    if (rawValue.includes('<')) throw new Error(`${owner} <${name}> ${attributeName} contains invalid XML less-than syntax`);
    const characterReferences = authoredCharacterReferenceEvidence(rawValue);
    const value = decodeXmlPredefinedReferences(rawValue, `${owner} <${name}> ${attributeName}`)
      .replace(/[\t\n\r]/g, ' ');
    attributes.push({
      characterReferences,
      hasValue: true,
      name: attributeName,
      quote,
      rawName: attributeName,
      rawValue,
      value
    });
    cursor += 1;
  }
  if (cursor > source.length || (source[cursor - 1] !== '>' && source.slice(cursor - 2, cursor) !== '/>')) {
    throw new Error(`${owner} <${name}> is unterminated`);
  }
  return { attributes, end: cursor, name, rawName: name, selfClosing };
}

function tokenizeXmlAuthoredSource(source, owner, mimeType) {
  const elements = [];
  const processingInstructions = [];
  const stack = [];
  let index = 0;
  let xmlDeclarationSeen = false;
  while (index < source.length) {
    const opening = source.indexOf('<', index);
    const textEnd = opening < 0 ? source.length : opening;
    const text = source.slice(index, textEnd);
    if (text.includes(']]>')) throw new Error(`${owner} contains CDATA termination outside a CDATA section`);
    decodeXmlPredefinedReferences(text, `${owner} XML character data`);
    if (opening < 0) break;
    if (source.startsWith('<!--', opening)) {
      const end = source.indexOf('-->', opening + 4);
      if (end < 0) throw new Error(`${owner} contains an unterminated XML comment`);
      const comment = source.slice(opening + 4, end);
      if (comment.includes('--')) throw new Error(`${owner} contains a malformed XML comment`);
      index = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', opening)) {
      const end = source.indexOf(']]>', opening + 9);
      if (end < 0) throw new Error(`${owner} contains an unterminated CDATA section`);
      index = end + 3;
      continue;
    }
    if (source.startsWith('<?', opening)) {
      const end = source.indexOf('?>', opening + 2);
      if (end < 0) throw new Error(`${owner} contains an unterminated processing instruction`);
      const body = source.slice(opening + 2, end);
      const targetMatch = /^([A-Za-z_:][A-Za-z0-9_.:-]*)([\s\S]*)$/.exec(body);
      if (!targetMatch) throw new Error(`${owner} contains a malformed XML processing instruction`);
      const target = targetMatch[1];
      const data = targetMatch[2].replace(/^[\t\n\r ]*/, '');
      if (target.toLowerCase() === 'xml') {
        if (target !== 'xml' || opening !== 0 || xmlDeclarationSeen || elements.length || processingInstructions.length ||
            !/^version[\t\n\r ]*=[\t\n\r ]*(?:"1\.[01]"|'1\.[01]')(?:[\t\n\r ]+encoding[\t\n\r ]*=[\t\n\r ]*(?:"UTF-8"|'UTF-8'))?(?:[\t\n\r ]+standalone[\t\n\r ]*=[\t\n\r ]*(?:"(?:yes|no)"|'(?:yes|no)'))?[\t\n\r ]*$/.test(data)) {
          throw new Error(`${owner} contains a malformed XML declaration`);
        }
        xmlDeclarationSeen = true;
      } else {
        if (data.includes('&')) throw new Error(`${owner} XML processing instruction contains unsupported entity syntax`);
        processingInstructions.push({ data, ordinal: processingInstructions.length, raw: body, target });
      }
      index = end + 2;
      continue;
    }
    if (source.startsWith('</', opening)) {
      const endMatch = /^<\/([A-Za-z_:][A-Za-z0-9_.:-]*)[\t\n\r ]*>/.exec(source.slice(opening));
      if (!endMatch) throw new Error(`${owner} contains malformed XML end-tag syntax`);
      const expected = stack.pop();
      if (!expected || expected.name !== endMatch[1]) {
        throw new Error(`${owner} contains mismatched XML end tag </${endMatch[1]}>`);
      }
      index = opening + endMatch[0].length;
      continue;
    }
    if (source.startsWith('<!', opening)) {
      if (/^<!DOCTYPE\b/.test(source.slice(opening))) {
        throw new Error(`${owner} contains unsupported XML document-type or entity-declaration functionality`);
      }
      throw new Error(`${owner} contains malformed XML declaration syntax`);
    }
    const token = parseXmlStartTag(source, opening, owner);
    token.ordinal = elements.length;
    const parent = stack.at(-1) || null;
    token.parentOrdinal = parent?.ordinal ?? null;
    token.childIndex = parent ? parent.childCount++ : elements.filter(item => item.parentOrdinal === null).length;
    token.path = parent ? `${parent.path}/${token.childIndex}` : `${token.childIndex}`;
    token.childCount = 0;
    elements.push(token);
    if (!token.selfClosing) stack.push(token);
    index = token.end;
  }
  if (stack.length) throw new Error(`${owner} <${stack.at(-1).name}> has no closing XML tag`);
  return { elements, mode: mimeType, processingInstructions };
}

export function validateAuthoredMarkupLexically(
  source,
  owner = 'authored document',
  depth = 0,
  mimeType = 'text/html'
) {
  if (typeof source !== 'string') throw new Error(`${owner} source is not text`);
  if (depth > 8) throw new Error(`${owner} exceeds the bounded srcdoc lexical depth`);
  const normalizedMimeType = mimeType.toLowerCase();
  if (normalizedMimeType !== 'text/html' && !xmlMimeTypes.has(normalizedMimeType)) {
    throw new Error(`${owner} has no approved lexical mode for ${mimeType}`);
  }
  if (/\0|[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(source)) {
    throw new Error(`${owner} contains a null or unsupported control character`);
  }
  return normalizedMimeType === 'text/html'
    ? tokenizeHtmlAuthoredSource(source, owner, depth)
    : tokenizeXmlAuthoredSource(source, owner, normalizedMimeType);
}

async function extractAuthoredDocument(page, source, owner, mimeType, lexicalEvidence, lifecycleTimeoutMs) {
  return bounded(page.evaluate(({ source, owner, mimeType, lexicalEvidence }) => {
    const parsed = new DOMParser().parseFromString(source, mimeType);
    const references = [];
    const srcdocs = [];
    const stylesheetSources = [];
    const forbidden = [];
    const visitedRoots = new Set();
    let referenceOrdinal = 0;
    let srcdocOrdinal = 0;
    let inertTemplateDepth = 0;
    let inspectedTemplateCount = 0;
    const referenceOccurrences = new Map();
    const localMetadataRels = new Set(['icon', 'manifest']);
    const nonFetchingMetadataRels = new Set([
      'alternate', 'author', 'canonical', 'help', 'license', 'next', 'prev', 'search', 'tag'
    ]);
    const unsupportedFetchingRels = new Set([
      'dns-prefetch', 'modulepreload', 'preconnect', 'prefetch', 'preload', 'prerender'
    ]);
    const svgPresentationUrlAttributes = [
      'fill', 'stroke', 'mask', 'clip-path', 'filter', 'marker',
      'marker-start', 'marker-mid', 'marker-end', 'cursor'
    ];
    const xmlUrlAttributeNames = new Set([
      'action', 'altimg', 'archive', 'background', 'base', 'cdgroup', 'cite',
      'classid', 'code', 'codebase', 'data', 'datasrc', 'definitionurl', 'dynsrc',
      'formaction', 'href', 'imagesrcset', 'itemid',
      'location', 'longdesc', 'lowsrc', 'manifest', 'nonamespaceschemalocation',
      'ping', 'poster', 'profile', 'public', 'ref', 'reference', 'schema',
      'schemalocation', 'src', 'srcdoc', 'srcset', 'system', 'uri', 'url', 'usemap'
    ]);
    const htmlNamespace = 'http://www.w3.org/1999/xhtml';
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const xincludeNamespace = 'http://www.w3.org/2001/XInclude';
    const xmlNamespace = 'http://www.w3.org/XML/1998/namespace';
    const xmlnsNamespace = 'http://www.w3.org/2000/xmlns/';
    const provenanceByElement = new Map();
    const provenanceByInstruction = new Map();

    function proveAuthoredTokenProvenance() {
      const domElements = [];
      function collectElements(node, parentOrdinal = null, parentPath = '') {
        let childIndex = 0;
        for (const child of node.childNodes || []) {
          if (child.nodeType !== Node.ELEMENT_NODE) continue;
          const path = parentPath ? `${parentPath}/${childIndex}` : `${childIndex}`;
          const ordinal = domElements.length;
          domElements.push({ childIndex, element: child, parentOrdinal, path });
          if (child.namespaceURI === htmlNamespace &&
              child.localName.toLowerCase() === 'template' && child.content) {
            collectElements(child.content, ordinal, path);
          } else {
            collectElements(child, ordinal, path);
          }
          childIndex += 1;
        }
      }
      collectElements(parsed);
      if (domElements.length !== lexicalEvidence.elements.length) {
        forbidden.push(
          `authored-token provenance element-count mismatch (${lexicalEvidence.elements.length} source / ${domElements.length} DOM)`
        );
        return;
      }
      const htmlMode = mimeType === 'text/html';
      for (let ordinal = 0; ordinal < domElements.length; ordinal += 1) {
        const domRecord = domElements[ordinal];
        const element = domRecord.element;
        const token = lexicalEvidence.elements[ordinal];
        const domName = htmlMode ? element.localName.toLowerCase() : element.tagName;
        const tokenName = htmlMode ? token.name.toLowerCase() : token.name;
        if (domName !== tokenName) {
          forbidden.push(`authored-token provenance element ${ordinal} mismatch (${tokenName} source / ${domName} DOM)`);
          return;
        }
        if (domRecord.parentOrdinal !== token.parentOrdinal || domRecord.childIndex !== token.childIndex ||
            domRecord.path !== token.path) {
          forbidden.push(
            `authored-token provenance structure mismatch on <${tokenName}> occurrence ${ordinal}`
          );
          return;
        }
        const normalizeName = name => htmlMode ? name.toLowerCase() : name;
        const sourceAttributes = new Map(token.attributes.map(attribute => [normalizeName(attribute.name), attribute]));
        const domAttributes = [...element.attributes];
        if (sourceAttributes.size !== domAttributes.length) {
          forbidden.push(`authored-token provenance attribute-count mismatch on <${tokenName}> occurrence ${ordinal}`);
          return;
        }
        for (const attribute of domAttributes) {
          const sourceAttribute = sourceAttributes.get(normalizeName(attribute.name));
          if (!sourceAttribute || sourceAttribute.value !== attribute.value) {
            forbidden.push(
              `authored-token provenance attribute mismatch on <${tokenName}> ${attribute.name} occurrence ${ordinal}`
            );
            return;
          }
        }
        provenanceByElement.set(element, token);
      }

      if (mimeType !== 'text/html') {
        const instructions = [];
        const walker = parsed.createTreeWalker(parsed, NodeFilter.SHOW_PROCESSING_INSTRUCTION);
        let instruction;
        while ((instruction = walker.nextNode())) instructions.push(instruction);
        if (instructions.length !== lexicalEvidence.processingInstructions.length) {
          forbidden.push('authored-token provenance processing-instruction count mismatch');
          return;
        }
        for (let ordinal = 0; ordinal < instructions.length; ordinal += 1) {
          const domInstruction = instructions[ordinal];
          const token = lexicalEvidence.processingInstructions[ordinal];
          if (domInstruction.target !== token.target || domInstruction.data.trim() !== token.data.trim()) {
            forbidden.push(`authored-token provenance processing-instruction ${ordinal} mismatch`);
            return;
          }
          provenanceByInstruction.set(domInstruction, token);
        }
      }
    }

    function looksLikeXmlLocation(value) {
      return /(?:^[a-z][a-z\d+.-]*:|^\/\/|(?:^|[\s"'])(?:\.{0,2}[\\/]|[^\s"']+\.[a-z\d]{1,12}(?:[?#\s"']|$))|[\\%])/i.test(value);
    }

    function nextOccurrence(tag, attribute, value, fetchKind, browserFetching) {
      const signature = [tag, attribute, value, fetchKind, browserFetching ? 'active' : 'inactive'].join('\u0000');
      const occurrence = referenceOccurrences.get(signature) || 0;
      referenceOccurrences.set(signature, occurrence + 1);
      return occurrence;
    }

    function unqualifiedAttribute(element, localName) {
      return [...element.attributes].find(attribute =>
        !attribute.namespaceURI && attribute.localName.toLowerCase() === localName.toLowerCase()
      ) || null;
    }

    function addReference(element, attributeInput, {
      kind = 'resource',
      fetchKind = 'image',
      browserFetching = true,
      validation = 'strict-local',
      value
    } = {}) {
      const attributeNode = typeof attributeInput === 'string'
        ? unqualifiedAttribute(element, attributeInput)
        : attributeInput;
      const attribute = attributeNode?.name || String(attributeInput);
      const attributeValue = value ?? attributeNode?.value ?? '';
      const tag = element.localName;
      const token = provenanceByElement.get(element);
      const attributeEvidence = token?.attributes.find(item =>
        (mimeType === 'text/html' ? item.name.toLowerCase() : item.name) ===
        (mimeType === 'text/html' ? attribute.toLowerCase() : attribute)
      );
      references.push({
        active: browserFetching && inertTemplateDepth === 0,
        attribute,
        attributeLocalName: attributeNode?.localName || attribute,
        attributeNamespace: attributeNode?.namespaceURI || '',
        attributeQualifiedName: attributeNode?.name || attribute,
        authoredElementOrdinal: token?.ordinal,
        authoredElementPath: token?.path,
        authoredNodeKind: 'element',
        authoredCharacterReferences: attributeEvidence?.characterReferences || [],
        authoredRawValue: attributeEvidence?.rawValue,
        authoredTokenOrdinal: token?.ordinal,
        browserFetching: browserFetching && inertTemplateDepth === 0,
        fetchKind,
        inTemplate: inertTemplateDepth > 0,
        kind,
        elementLocalName: element.localName,
        elementNamespace: element.namespaceURI || '',
        occurrence: nextOccurrence(tag, attribute, attributeValue, fetchKind, browserFetching),
        owner,
        ordinal: referenceOrdinal++,
        tag,
        validation,
        value: attributeValue
      });
    }

    function addXmlStylesheetReference(attributes, instruction) {
      const token = provenanceByInstruction.get(instruction);
      references.push({
        active: true,
        attribute: 'href',
        attributeLocalName: 'href',
        attributeNamespace: '',
        attributeQualifiedName: 'href',
        authoredCharacterReferences: [],
        authoredRawValue: attributes.href,
        authoredInstructionOrdinal: token?.ordinal,
        authoredNodeKind: 'processing-instruction',
        authoredTokenOrdinal: token?.ordinal,
        browserFetching: true,
        fetchKind: 'stylesheet',
        kind: 'stylesheet',
        occurrence: nextOccurrence('?xml-stylesheet', 'href', attributes.href, 'stylesheet', true),
        owner,
        ordinal: referenceOrdinal++,
        elementLocalName: '?xml-stylesheet',
        elementNamespace: '',
        tag: '?xml-stylesheet',
        validation: 'strict-local',
        value: attributes.href
      });
    }

    function parseProcessingInstructionAttributes(data) {
      const attributes = {};
      const expression = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      for (const match of data.matchAll(expression)) {
        const name = match[1].toLowerCase();
        if (Object.hasOwn(attributes, name)) return null;
        attributes[name] = match[2] ?? match[3] ?? '';
      }
      const residue = data.replace(expression, '').trim();
      return residue ? null : attributes;
    }

    if (mimeType !== 'text/html' && parsed.querySelector('parsererror')) {
      forbidden.push(`${mimeType} parse error`);
    }
    if (!forbidden.length) proveAuthoredTokenProvenance();
    if (mimeType !== 'text/html') {
      const walker = parsed.createTreeWalker(parsed, NodeFilter.SHOW_PROCESSING_INSTRUCTION);
      let instruction;
      while ((instruction = walker.nextNode())) {
        if (instruction.target.toLowerCase() !== 'xml-stylesheet') {
          forbidden.push(`unsupported XML processing instruction ${instruction.target}`);
          continue;
        }
        const attributes = parseProcessingInstructionAttributes(instruction.data);
        if (!attributes?.href) {
          forbidden.push('malformed XML stylesheet processing instruction');
          continue;
        }
        if (Object.hasOwn(attributes, 'integrity')) {
          forbidden.push('XML stylesheet integrity metadata');
          continue;
        }
        const supportedAttributes = new Set(['alternate', 'charset', 'href', 'media', 'title', 'type']);
        if (Object.keys(attributes).some(attribute => !supportedAttributes.has(attribute))) {
          forbidden.push('unsupported XML stylesheet processing instruction attribute');
          continue;
        }
        if (attributes.type?.toLowerCase() !== 'text/css' ||
            (Object.hasOwn(attributes, 'alternate') && attributes.alternate.toLowerCase() !== 'no') ||
            (Object.hasOwn(attributes, 'media') && !['all', 'screen'].includes(attributes.media.toLowerCase()))) {
          forbidden.push('inactive or unsupported XML stylesheet processing instruction');
          continue;
        }
        addXmlStylesheetReference(attributes, instruction);
      }
    }

    function addSvgPresentationReference(element, attribute) {
      const value = element.getAttribute(attribute);
      if (/url\s*\(/i.test(value)) forbidden.push(`unsupported SVG ${attribute} external URL form`);
    }

    function walk(root, templateDepth = 0) {
      if (!root || visitedRoots.has(root)) return;
      if (templateDepth > 8 || ++inspectedTemplateCount > 64) {
        forbidden.push('template content exceeds the bounded recursive inspection limit');
        return;
      }
      visitedRoots.add(root);
      for (const element of root.querySelectorAll('*')) {
        const tag = element.localName;
        const normalizedTag = tag.toLowerCase();
        const namespace = element.namespaceURI;
        for (const attribute of element.attributes) {
          if (attribute.namespaceURI === xmlnsNamespace) continue;
          const localName = attribute.localName.toLowerCase();
          const foreignAttribute = Boolean(attribute.namespaceURI) && attribute.namespaceURI !== xmlnsNamespace;
          const unsupportedElementNamespace = namespace !== htmlNamespace;
          const unsupportedNamespaceControl = unsupportedElementNamespace &&
            (xmlUrlAttributeNames.has(localName) ||
             looksLikeXmlLocation(attribute.value) ||
             /url\s*\(/i.test(attribute.value));
          if ((foreignAttribute && (xmlUrlAttributeNames.has(localName) ||
                                    looksLikeXmlLocation(attribute.value) ||
                                    /url\s*\(/i.test(attribute.value))) ||
              unsupportedNamespaceControl ||
              (attribute.namespaceURI === xmlNamespace && localName === 'base')) {
            forbidden.push(
              `unsupported namespace URL/resource attribute {${attribute.namespaceURI || 'none'}}` +
              `${attribute.localName} on {${namespace || 'none'}}${tag}`
            );
          }
          const approvedSrcdocCarrier = namespace === htmlNamespace && normalizedTag === 'iframe' &&
            !attribute.namespaceURI && localName === 'srcdoc';
          if (/url\s*\(/i.test(attribute.value) && localName !== 'style' && !approvedSrcdocCarrier) {
            forbidden.push(`unsupported URL-bearing ${attribute.name} attribute on ${tag}`);
          }
        }
        if (normalizedTag === 'base' && element.hasAttribute('href')) forbidden.push('base href');
        if (normalizedTag === 'html' && element.hasAttribute('manifest')) forbidden.push('application cache manifest');
        if (normalizedTag === 'object' && element.hasAttribute('codebase')) forbidden.push('object codebase');
        if (normalizedTag === 'meta') {
          const httpEquiv = element.getAttribute('http-equiv')?.trim().toLowerCase();
          if (httpEquiv === 'refresh') forbidden.push('meta refresh');
          if (httpEquiv === 'content-security-policy') forbidden.push('meta Content-Security-Policy');
        }
        if (element.hasAttribute('integrity') &&
            ['href', 'src', 'data', 'poster'].some(attribute => element.hasAttribute(attribute))) {
          forbidden.push(`${tag} integrity metadata`);
        }
        if (element.hasAttribute('style')) {
          stylesheetSources.push({ owner: `${owner} inline style`, source: `.x{${element.getAttribute('style')}}` });
        }
        if (normalizedTag === 'style') stylesheetSources.push({ owner: `${owner} style element`, source: element.textContent });

        if (namespace === htmlNamespace) {
          if (['a', 'area'].includes(normalizedTag) && element.hasAttribute('href')) {
            addReference(element, 'href', {
              browserFetching: false,
              fetchKind: 'navigation',
              kind: 'navigation',
              validation: 'navigation'
            });
          }
          if (element.hasAttribute('ping')) forbidden.push(`${tag} ping navigation`);
          if (element.hasAttribute('cite')) forbidden.push(`${tag} cite navigation`);
          if (normalizedTag === 'form' && element.hasAttribute('action')) {
            forbidden.push('form action navigation');
          }
          if (['button', 'input'].includes(normalizedTag) && element.hasAttribute('formaction')) {
            forbidden.push(`${tag} formaction navigation`);
          }
          if (normalizedTag === 'link' && element.hasAttribute('href')) {
            const rel = new Set((element.getAttribute('rel') || '').toLowerCase().split(/\s+/).filter(Boolean));
            if (rel.has('stylesheet')) {
              const media = element.getAttribute('media')?.trim().toLowerCase();
              if (rel.has('alternate') || element.hasAttribute('disabled') || (media && !['all', 'screen'].includes(media))) {
                forbidden.push('inactive or alternate stylesheet link');
              }
              addReference(element, 'href', { kind: 'stylesheet', fetchKind: 'stylesheet' });
            } else if ([...rel].some(value => unsupportedFetchingRels.has(value))) {
              forbidden.push(`unsupported fetching link rel=${[...rel].join(' ')}`);
            } else if (rel.size && [...rel].every(value => localMetadataRels.has(value) || nonFetchingMetadataRels.has(value))) {
              const isLocalMetadata = [...rel].some(value => localMetadataRels.has(value));
              addReference(element, 'href', {
                browserFetching: false,
                fetchKind: 'metadata',
                kind: 'metadata',
                validation: isLocalMetadata ? 'strict-local' : 'metadata-url'
              });
            } else {
              forbidden.push(`unknown link relationship ${[...rel].join(' ') || '(empty)'}`);
            }
          }
          if (normalizedTag === 'frame' && element.hasAttribute('src')) forbidden.push('frame source');
          if (normalizedTag === 'iframe' && element.hasAttribute('src')) {
            if (element.getAttribute('loading')?.trim().toLowerCase() === 'lazy') forbidden.push(`lazy ${tag} source`);
            if (element.hasAttribute('sandbox')) forbidden.push(`sandboxed ${tag} content`);
            if (element.hasAttribute('srcdoc')) forbidden.push('iframe with both src and srcdoc');
            addReference(element, 'src', {
              fetchKind: 'document',
              kind: 'document'
            });
          }
          if (normalizedTag === 'img' && element.hasAttribute('src')) {
            if (element.getAttribute('loading')?.trim().toLowerCase() === 'lazy') forbidden.push('lazy img source');
            addReference(element, 'src');
          }
          if (normalizedTag === 'script' && element.hasAttribute('src')) {
            addReference(element, 'src', {
              browserFetching: false,
              fetchKind: 'script',
              kind: 'inactive-script'
            });
          }
          if (normalizedTag === 'embed' && element.hasAttribute('src')) {
            forbidden.push('embed source');
          }
          if (normalizedTag === 'object' && element.hasAttribute('data')) {
            forbidden.push('object data');
          }
          if (normalizedTag === 'portal' && element.hasAttribute('src')) forbidden.push('portal source');
          if (['audio', 'video', 'source', 'track'].includes(normalizedTag) && element.hasAttribute('src')) {
            forbidden.push(`${tag} src resource`);
          }
          if (normalizedTag === 'input' && element.type === 'image' && element.hasAttribute('src')) {
            forbidden.push('input type=image source');
          }
          if (normalizedTag === 'video' && element.hasAttribute('poster')) forbidden.push('video poster');
          if (element.hasAttribute('background')) forbidden.push(`${tag} legacy background resource`);
          if (element.hasAttribute('srcset')) {
            addReference(element, 'srcset', { browserFetching: false, kind: 'unsupported-list' });
          }
          if (normalizedTag === 'link' && element.hasAttribute('imagesrcset')) {
            addReference(element, 'imagesrcset', { browserFetching: false, kind: 'unsupported-list' });
          }
          if (normalizedTag === 'iframe' && element.hasAttribute('srcdoc')) {
            if (element.hasAttribute('sandbox')) forbidden.push('sandboxed iframe srcdoc');
            srcdocs.push({
              authoredElementOrdinal: provenanceByElement.get(element)?.ordinal,
              authoredElementPath: provenanceByElement.get(element)?.path,
              attributeLocalName: 'srcdoc',
              attributeNamespace: '',
              elementLocalName: element.localName,
              elementNamespace: element.namespaceURI || '',
              ordinal: srcdocOrdinal++,
              owner: `${owner} iframe srcdoc`,
              source: element.getAttribute('srcdoc')
            });
          }
          if (normalizedTag === 'template') {
            if ([...element.attributes].some(attribute => attribute.name.toLowerCase().startsWith('shadowroot'))) {
              forbidden.push('declarative shadow root');
            }
            inertTemplateDepth += 1;
            walk(element.content, templateDepth + 1);
            inertTemplateDepth -= 1;
          }
          if (element.hasAttribute('src') && ![
            'audio', 'embed', 'frame', 'iframe', 'img', 'input', 'portal', 'script', 'source', 'track', 'video'
          ].includes(normalizedTag)) {
            forbidden.push(`unsupported ${tag} src resource`);
          }
          if (element.hasAttribute('href') && !['a', 'area', 'base', 'link'].includes(normalizedTag)) {
            forbidden.push(`unsupported ${tag} href resource`);
          }
          for (const attribute of [
            'archive', 'classid', 'code', 'datasrc', 'dynsrc', 'itemid',
            'longdesc', 'lowsrc', 'profile', 'usemap'
          ]) {
            if (element.hasAttribute(attribute)) forbidden.push(`unsupported ${tag} ${attribute} resource`);
          }
        } else if (namespace === svgNamespace) {
          for (const attribute of svgPresentationUrlAttributes) {
            if (element.hasAttribute(attribute)) addSvgPresentationReference(element, attribute);
          }
          for (const attribute of element.attributes) {
            if (attribute.namespaceURI === xmlnsNamespace) continue;
            if (attribute.localName.toLowerCase() === 'href') {
              forbidden.push(`unsupported SVG ${tag} ${attribute.name} external reference`);
            }
          }
          for (const attribute of element.attributes) {
            const attributeName = attribute.name.toLowerCase();
            if (attributeName !== 'style' &&
                !svgPresentationUrlAttributes.includes(attributeName) &&
                /url\s*\(/i.test(attribute.value)) {
              forbidden.push(`unsupported SVG ${attribute.name} URL presentation attribute`);
            }
          }
        } else if (namespace === xincludeNamespace) {
          forbidden.push('XInclude element');
        } else {
          for (const attribute of element.attributes) {
            if (attribute.namespaceURI === xmlnsNamespace) continue;
            if (xmlUrlAttributeNames.has(attribute.localName.toLowerCase()) ||
                /url\s*\(/i.test(attribute.value) || looksLikeXmlLocation(attribute.value)) {
              forbidden.push(`unknown XML URL-bearing ${tag} ${attribute.name} construct`);
            }
          }
        }
        if (element.shadowRoot) forbidden.push('imperative shadow root');
      }
    }
    walk(parsed);
    return {
      forbidden,
      references,
      srcdocs,
      stylesheetSources,
      templateCount: Math.max(0, inspectedTemplateCount - 1)
    };
  }, { source, owner, mimeType, lexicalEvidence }), `${owner} authored document parsing`, lifecycleTimeoutMs);
}

async function inspectAuthoredStylesheets(page, stylesheetSources, lifecycleTimeoutMs) {
  if (!stylesheetSources.length) return [];
  return bounded(page.evaluate(sources => {
    const findings = [];
    function inspectRules(rules, owner) {
      for (const rule of rules) {
        if (rule.type === CSSRule.IMPORT_RULE || rule.cssText.toLowerCase().includes('url(')) {
          findings.push(`${owner}: ${rule.cssText}`);
        }
        if (rule.cssRules) inspectRules(rule.cssRules, owner);
      }
    }
    for (const { owner, source } of sources) {
      const cssDocument = document.implementation.createHTMLDocument('');
      const style = cssDocument.createElement('style');
      style.textContent = source;
      cssDocument.head.append(style);
      try {
        if (!style.sheet) findings.push(`${owner}: stylesheet could not be parsed`);
        else inspectRules(style.sheet.cssRules, owner);
      } catch (error) {
        findings.push(`${owner}: unreadable stylesheet (${error.message})`);
      }
    }
    return findings;
  }, stylesheetSources), 'authored stylesheet parsing', lifecycleTimeoutMs);
}

export async function inspectVisibleTestVersionDisclosure(html, options = {}) {
  const {
    fetchBytesImpl,
    fetchResourceImpl,
    liveBaseUrl = baseUrl,
    browser: suppliedBrowser,
    launchBrowser: suppliedLaunchBrowser,
    allowedResourcePaths = new Set(['index.html']),
    validatedResourceLoader,
    rootResourceSnapshot,
    rootContentType = 'text/html; charset=utf-8',
    lifecycleTimeoutMs = defaultLifecycleTimeoutMs,
    resourceTimeoutMs = lifecycleTimeoutMs
  } = options;
  const launchBrowser = suppliedLaunchBrowser || (() => chromium.launch({ headless: true, timeout: lifecycleTimeoutMs }));
  if (!fetchBytesImpl && !fetchResourceImpl) throw new Error('status disclosure inspection requires a resource loader');
  const approvedPaths = new Set(['index.html', ...allowedResourcePaths]);
  const loadResource = fetchResourceImpl || (async path => ({
    bytes: await fetchBytesImpl(path),
    finalUrl: new URL(path, canonicalBase(liveBaseUrl)).href
  }));
  const snapshotCache = validatedResourceLoader
    ? null
    : createValidatedSnapshotCache(loadResource, liveBaseUrl, approvedPaths, resourceTimeoutMs);
  const getValidatedResource = validatedResourceLoader || (path => snapshotCache.get(path));
  const parsedRootContentType = parseDeliveredContentType(rootContentType);
  if (parsedRootContentType.mediaType !== 'text/html') {
    throw new Error(`index.html returned unsupported Content-Type ${parsedRootContentType.mediaType}; expected text/html`);
  }
  const rootBytes = Buffer.from(html);
  const rootSnapshot = rootResourceSnapshot || Object.freeze({
    bytes: rootBytes,
    byteCount: rootBytes.length,
    contentType: rootContentType,
    finalUrl: new URL('index.html', canonicalBase(liveBaseUrl)).href,
    mediaType: parsedRootContentType.mediaType,
    sha256: sha256(rootBytes)
  });
  let browser;
  let context;
  let page;
  let result;
  let primaryError;
  const cleanupErrors = [];
  const renderFailures = [];
  const authoredReferenceLedger = [];
  const authoredSrcdocLedger = [];
  const requestPairings = new WeakMap();
  const consumptionByGroup = new Map();
  const approvedNavigationLiterals = new Set([
    '#app-main',
    '#companion-home',
    'https://mountainguide.vondadowns.com/',
    'tel:911'
  ]);

  function transportGroupKey(reference) {
    return [reference.ownerDocument, reference.fetchKind, reference.resolvedDestination].join('\u0000');
  }

  function referenceApplicationKey(reference) {
    return [
      reference.ownerKey,
      reference.authoredNodeKind,
      reference.authoredNodeKind === 'processing-instruction'
        ? reference.authoredInstructionOrdinal
        : reference.authoredElementPath,
      reference.elementNamespace || '',
      reference.elementLocalName,
      reference.attributeNamespace || '',
      reference.attributeLocalName,
      reference.value,
      reference.fetchKind
    ].join('\u0000');
  }

  function requestFetchKind(request) {
    const resourceType = request.resourceType();
    if (resourceType === 'stylesheet') return 'stylesheet';
    if (resourceType === 'image') return 'image';
    if (resourceType === 'document') return 'document';
    if (resourceType === 'media') return 'media';
    if (resourceType === 'font') return 'font';
    if (resourceType === 'script') return 'script';
    return resourceType;
  }

  function requestOwnerDocument(request) {
    let frame = request.frame();
    if (request.isNavigationRequest() && frame.parentFrame()) frame = frame.parentFrame();
    while (frame) {
      const frameUrl = frame.url();
      if (/^https?:/i.test(frameUrl)) {
        return canonicalDeploymentPath(frameUrl, liveBaseUrl, approvedPaths);
      }
      frame = frame.parentFrame();
    }
    return 'index.html';
  }

  function pairBrowserRequest(request, path) {
    const fetchKind = requestFetchKind(request);
    const ownerDocument = requestOwnerDocument(request);
    const references = authoredReferenceLedger.filter(reference =>
      reference.browserFetching &&
      reference.fetchKind === fetchKind &&
      reference.ownerDocument === ownerDocument &&
      reference.resolvedDestination === path
    );
    if (!references.length) {
      throw new Error(
        `${path} ${fetchKind} request from ${ownerDocument} has no qualifying authored fetch reference`
      );
    }
    const consumption = consumptionByGroup.get(transportGroupKey(references[0]));
    consumption.routed += 1;
    requestPairings.set(request, [consumption]);
  }

  try {
    browser = suppliedBrowser || (suppliedLaunchBrowser
      ? await acquireOwnedBrowser(launchBrowser, lifecycleTimeoutMs)
      : await launchBrowser());
    context = await acquireOwnedContext(browser, lifecycleTimeoutMs);
    page = await acquireOwnedPage(context, lifecycleTimeoutMs);
    if (typeof page.on === 'function') {
      page.on('requestfinished', request => {
        const consumptions = requestPairings.get(request);
        for (const consumption of consumptions || []) consumption.finished += 1;
      });
      page.on('requestfailed', request => {
        const failure = request.failure()?.errorText || 'unknown browser loading failure';
        const consumptions = requestPairings.get(request);
        for (const consumption of consumptions || []) consumption.failed += 1;
        renderFailures.push(new Error(`${request.url()}: browser request failed: ${failure}`));
      });
    }
    await bounded(page.route('**/*', async route => {
      const rawUrl = route.request().url();
      try {
        const path = canonicalDeploymentPath(rawUrl, liveBaseUrl, approvedPaths);
        if (path !== 'index.html') pairBrowserRequest(route.request(), path);
        const resource = path === 'index.html' ? rootSnapshot : await getValidatedResource(path);
        if (resource.byteCount !== resource.bytes.length || resource.sha256 !== sha256(resource.bytes)) {
          throw new Error(`${path} immutable response snapshot changed before Chromium fulfillment`);
        }
        await bounded(
          route.fulfill({ status: 200, body: resource.bytes, contentType: resource.contentType }),
          `${path} route fulfillment`,
          lifecycleTimeoutMs
        );
      } catch (error) {
        renderFailures.push(new Error(`${rawUrl}: ${error.message}`));
        try {
          await bounded(route.abort('blockedbyclient'), 'route abort', lifecycleTimeoutMs);
        } catch (abortError) {
          renderFailures.push(new Error(`${rawUrl}: route abort failed: ${abortError.message}`));
        }
      }
    }), 'browser route installation', lifecycleTimeoutMs);
    let inspectedDocumentCount = 0;
    let inspectedTemplateCount = 0;
    async function validateAuthoredDocument(
      source,
      documentPath,
      owner,
      depth = 0,
      ancestry = new Set([documentPath]),
      documentKey = 'root',
      mimeType
    ) {
      inspectedDocumentCount += 1;
      if (depth > 8 || inspectedDocumentCount > 64) {
        throw new Error(`${owner} exceeds the bounded nested-document inspection limit`);
      }
      const lexicalEvidence = validateAuthoredMarkupLexically(source, owner, depth, mimeType);
      const authored = await extractAuthoredDocument(
        page,
        source,
        owner,
        mimeType,
        lexicalEvidence,
        lifecycleTimeoutMs
      );
      inspectedTemplateCount += authored.templateCount || 0;
      if (inspectedDocumentCount + inspectedTemplateCount > 64) {
        throw new Error(`${owner} exceeds the combined document/template inspection count`);
      }
      if (authored.forbidden.length) {
        throw new Error(`${owner} contains unsupported authored navigation controls: ${authored.forbidden.join('; ')}`);
      }
      if (lexicalEvidence.canonicalShellError) {
        throw new Error(lexicalEvidence.canonicalShellError);
      }
      const inlineCssFindings = await inspectAuthoredStylesheets(page, authored.stylesheetSources, lifecycleTimeoutMs);
      if (inlineCssFindings.length) {
        throw new Error(`authored stylesheet resource references are not approved: ${inlineCssFindings.join('; ')}`);
      }
      for (const reference of authored.references) {
        if (reference.kind === 'unsupported-list') {
          throw new Error(`authored ${reference.tag} ${reference.attribute} references are not approved`);
        }
        let path = null;
        let resolvedDestination;
        if (reference.validation === 'strict-local') {
          try {
            path = canonicalAuthoredResourcePath(reference.value, approvedPaths, documentPath);
            resolvedDestination = path;
          } catch (error) {
            throw new Error(`authored ${reference.tag} ${reference.attribute} reference in ${owner} is invalid: ${error.message}`);
          }
        } else if (reference.validation === 'navigation') {
          if (!approvedNavigationLiterals.has(reference.value)) {
            throw new Error(
              `authored ${reference.tag} ${reference.attribute} navigation in ${owner} is invalid: ` +
              'destination is not one of the locked candidate.6 navigation literals'
            );
          }
          resolvedDestination = reference.value;
        } else {
          try {
            resolvedDestination = new URL(
              reference.value,
              new URL(documentPath, canonicalBase(liveBaseUrl))
            ).href;
          } catch (error) {
            throw new Error(`authored ${reference.tag} ${reference.attribute} metadata in ${owner} is invalid: ${error.message}`);
          }
        }
        const ledgerReference = {
          ...reference,
          documentBase: new URL(documentPath, canonicalBase(liveBaseUrl)).href,
          ownerDocument: documentPath,
          ownerKey: documentKey,
          resolvedDestination
        };
        authoredReferenceLedger.push(ledgerReference);
        if (reference.inTemplate) {
          throw new Error(`authored ${reference.tag} ${reference.attribute} in ${owner} is inside inert template content`);
        }
        if (reference.kind === 'stylesheet') {
          if (!path.endsWith('.css')) {
            throw new Error(`authored stylesheet ${path} does not use the supported text/css .css form`);
          }
          let cssBytes;
          try {
            cssBytes = (await getValidatedResource(path)).bytes;
          } catch (error) {
            throw new Error(`authored stylesheet ${path} could not be validated: ${error.message}`);
          }
          const findings = await inspectAuthoredStylesheets(page, [{ owner: `${owner} stylesheet ${path}`, source: cssBytes.toString('utf8') }], lifecycleTimeoutMs);
          if (findings.length) {
            throw new Error(`authored stylesheet resource references are not approved: ${findings.join('; ')}`);
          }
        }
        const nestedDocument = reference.kind === 'document' ||
          (reference.kind === 'potential-document' && /\.(?:html?|xhtml|xml|svg)$/i.test(path));
        if (reference.kind === 'potential-document' && !nestedDocument) {
          throw new Error(`authored ${reference.tag} ${reference.attribute} in ${owner} is not an approved document-capable resource`);
        }
        if (nestedDocument && ancestry.has(path)) {
          throw new Error(`${owner} contains a recursive nested-document reference to ${path}`);
        }
        if (nestedDocument) {
          let nestedSnapshot;
          try {
            nestedSnapshot = await getValidatedResource(path);
          } catch (error) {
            throw new Error(`authored nested document ${path} could not be validated: ${error.message}`);
          }
          await validateAuthoredDocument(
            nestedSnapshot.bytes.toString('utf8'),
            path,
            `${owner} nested document ${path}`,
            depth + 1,
            new Set([...ancestry, path]),
            `${documentKey}>${reference.ordinal}:${path}`,
            nestedSnapshot.mediaType
          );
        }
      }
      for (const srcdoc of authored.srcdocs) {
        const nestedKey = `${documentKey}>srcdoc:${srcdoc.authoredElementPath}`;
        authoredSrcdocLedger.push({
          ...srcdoc,
          nestedKey,
          ownerKey: documentKey
        });
        await validateAuthoredDocument(
          srcdoc.source,
          documentPath,
          srcdoc.owner,
          depth + 1,
          ancestry,
          nestedKey,
          'text/html'
        );
      }
    }
    await validateAuthoredDocument(html, 'index.html', 'index.html', 0, new Set(['index.html']), 'root', rootSnapshot.mediaType);
    const normalizationGroups = new Map();
    for (const reference of authoredReferenceLedger.filter(item => item.browserFetching)) {
      const key = [reference.ownerKey, reference.fetchKind, reference.resolvedDestination].join('\u0000');
      if (!normalizationGroups.has(key)) normalizationGroups.set(key, []);
      normalizationGroups.get(key).push(reference);
    }
    for (const references of normalizationGroups.values()) {
      const literals = new Set(references.map(reference => reference.value));
      if (literals.size > 1) {
        throw new Error(
          `ambiguous authored fetch references in document instance ${references[0].ownerKey} normalize to ` +
          `${references[0].resolvedDestination}: ${[...literals].join(', ')}`
        );
      }
    }
    const activeGroups = new Map();
    for (const reference of authoredReferenceLedger.filter(item => item.browserFetching)) {
      const groupKey = transportGroupKey(reference);
      if (!activeGroups.has(groupKey)) activeGroups.set(groupKey, []);
      activeGroups.get(groupKey).push(reference);
    }
    for (const [groupKey, references] of activeGroups) {
      consumptionByGroup.set(groupKey, {
        failed: 0,
        finished: 0,
        reference: references[0],
        referenceCount: references.length,
        routed: 0
      });
    }
    await bounded(
      page.goto(new URL('index.html', canonicalBase(liveBaseUrl)).href, { waitUntil: 'load', timeout: lifecycleTimeoutMs }),
      'browser navigation',
      lifecycleTimeoutMs
    );
    for (const consumption of consumptionByGroup.values()) {
      const { reference } = consumption;
      if (!consumption.routed) {
        renderFailures.push(new Error(
          `${reference.resolvedDestination} ${reference.fetchKind} from ${reference.ownerDocument} ` +
          `was required by authored ${reference.tag} ${reference.attribute} but was not consumed by Chromium`
        ));
      } else if (consumption.routed > consumption.referenceCount) {
        renderFailures.push(new Error(
          `${reference.resolvedDestination} ${reference.fetchKind} from ${reference.ownerDocument} ` +
          `was over-consumed by Chromium (${consumption.routed} routed requests for ` +
          `${consumption.referenceCount} authored occurrences)`
        ));
      } else if (consumption.finished !== consumption.routed || consumption.failed) {
        renderFailures.push(new Error(
          `${reference.resolvedDestination} ${reference.fetchKind} from ${reference.ownerDocument} ` +
          `did not finish successfully in Chromium (${consumption.finished}/${consumption.routed} finished)`
        ));
      }
    }
    if (renderFailures.length) {
      throw new AggregateError(renderFailures, `render resources were incomplete: ${renderFailures.map(error => error.message).join('; ')}`);
    }
    const browserResourceStatus = await bounded(page.evaluate(({ ledger, srcdocs }) => {
      const applications = [];
      const nestedIssues = [];
      const visitedDocuments = new Set();

      function sheetIsReadable(sheet) {
        if (!sheet) return false;
        try {
          void sheet.cssRules.length;
          return true;
        } catch {
          return false;
        }
      }

      function intersection(a, b) {
        const left = Math.max(a.left, b.left);
        const top = Math.max(a.top, b.top);
        const right = Math.min(a.right, b.right);
        const bottom = Math.min(a.bottom, b.bottom);
        return { width: Math.max(0, right - left), height: Math.max(0, bottom - top), left, top, right, bottom };
      }

      function visualGeometry(element) {
        const view = element.ownerDocument.defaultView;
        if (!view) return { pass: false, reason: 'resource has no inspection viewport' };
        if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) {
          return { pass: false, reason: 'resource is hidden or inactive' };
        }
        const elementStyle = view.getComputedStyle(element);
        if (Number.parseFloat(elementStyle.width) < 1 || Number.parseFloat(elementStyle.height) < 1) {
          return { pass: false, reason: 'resource has zero-size rendered content geometry' };
        }
        const initial = element.getBoundingClientRect();
        const distanceLimit = Math.max(16384, Math.max(view.innerWidth, view.innerHeight) * 8);
        if (initial.right < -distanceLimit || initial.bottom < -distanceLimit ||
            initial.left > view.innerWidth + distanceLimit || initial.top > view.innerHeight + distanceLimit) {
          return { pass: false, reason: 'resource is placed beyond the bounded inspection distance' };
        }
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
          const style = view.getComputedStyle(ancestor);
          if (style.clip !== 'auto' || style.clipPath !== 'none') {
            return { pass: false, reason: 'resource is explicitly clipped' };
          }
          if (style.transform !== 'none') {
            const matrix = new view.DOMMatrixReadOnly(style.transform);
            const scaleX = Math.hypot(matrix.m11, matrix.m12, matrix.m13);
            const scaleY = Math.hypot(matrix.m21, matrix.m22, matrix.m23);
            if (scaleX <= 0.01 || scaleY <= 0.01) {
              return { pass: false, reason: 'resource has an effectively zero-scale transform' };
            }
            if (Math.abs(matrix.m41) > distanceLimit || Math.abs(matrix.m42) > distanceLimit) {
              return { pass: false, reason: 'resource has an unreachable transform translation' };
            }
          }
        }
        element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return { pass: false, reason: 'resource has zero-area rendered geometry' };
        let visible = { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight };
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const style = view.getComputedStyle(ancestor);
          if (['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowX) ||
              ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY)) {
            const ancestorRect = ancestor.getBoundingClientRect();
            if (ancestorRect.width < 1 || ancestorRect.height < 1) {
              return { pass: false, reason: 'resource has a zero-size overflow-clipping ancestor' };
            }
            visible = intersection(visible, ancestorRect);
          }
        }
        const overlap = intersection(visible, rect);
        if (overlap.width < 1 || overlap.height < 1) {
          return { pass: false, reason: 'resource does not intersect the usable inspection viewport' };
        }
        return { pass: true, reason: '' };
      }

      function keyOf(reference) {
        return [
          reference.ownerKey,
          reference.authoredNodeKind,
          reference.authoredNodeKind === 'processing-instruction'
            ? reference.authoredInstructionOrdinal
            : reference.authoredElementPath,
          reference.elementNamespace || '',
          reference.elementLocalName,
          reference.attributeNamespace || '',
          reference.attributeLocalName,
          reference.value,
          reference.fetchKind
        ].join('\u0000');
      }

      const expectedByKey = new Map(ledger.filter(reference => reference.browserFetching)
        .map(reference => [keyOf(reference), reference]));
      function srcdocKey(reference) {
        return [
          reference.ownerKey,
          reference.authoredElementPath,
          reference.elementNamespace || '',
          reference.elementLocalName,
          reference.attributeNamespace || '',
          reference.attributeLocalName
        ].join('\u0000');
      }
      const expectedSrcdocsByKey = new Map(srcdocs.map(reference => [srcdocKey(reference), reference]));
      const srcdocApplicationCounts = new Map();

      function visitDocument(doc, ownerKey, ownerDocument) {
        if (!doc || visitedDocuments.has(doc)) return;
        visitedDocuments.add(doc);
        const documentElements = [];
        function collectElements(root, parentPath = '') {
          let childIndex = 0;
          for (const child of root.childNodes || []) {
            if (child.nodeType !== Node.ELEMENT_NODE) continue;
            const path = parentPath ? `${parentPath}/${childIndex}` : `${childIndex}`;
            documentElements.push({ element: child, path });
            if (child.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
                child.localName.toLowerCase() === 'template' && child.content) {
              collectElements(child.content, path);
            } else {
              collectElements(child, path);
            }
            childIndex += 1;
          }
        }
        collectElements(doc);

        function unqualifiedAttribute(element, localName) {
          return [...element.attributes].find(attribute =>
            !attribute.namespaceURI && attribute.localName.toLowerCase() === localName
          ) || null;
        }

        function record(elementRecord, attributeNode, fetchKind, state = {}) {
          const { element, path } = elementRecord;
          const reference = {
            attribute: attributeNode.name,
            attributeLocalName: attributeNode.localName,
            attributeNamespace: attributeNode.namespaceURI || '',
            authoredElementPath: path,
            authoredNodeKind: 'element',
            elementLocalName: element.localName,
            elementNamespace: element.namespaceURI || '',
            fetchKind,
            ownerKey,
            tag: element.localName,
            value: attributeNode.value
          };
          const expected = expectedByKey.get(keyOf(reference));
          applications.push({
            ...reference,
            occurrence: expected?.occurrence,
            applied: Boolean(state.applied),
            reason: state.reason || '',
            resolved: state.resolved || '',
            unexpected: !expected
          });
          return expected;
        }

        for (const elementRecord of documentElements) {
          const { element, path } = elementRecord;
          const htmlElement = element.namespaceURI === 'http://www.w3.org/1999/xhtml';
          const src = unqualifiedAttribute(element, 'src');
          const href = unqualifiedAttribute(element, 'href');
          const srcdoc = unqualifiedAttribute(element, 'srcdoc');
          if (htmlElement && element.localName === 'img' && src) {
            const geometry = visualGeometry(element);
            record(elementRecord, src, 'image', {
              applied: element.complete && element.naturalWidth > 0 && element.naturalHeight > 0 && geometry.pass,
              reason: !element.complete || element.naturalWidth < 1 || element.naturalHeight < 1
                ? 'browser could not decode the image'
                : geometry.reason,
              resolved: element.currentSrc || element.src
            });
          }
          if (htmlElement && element.localName === 'link' && element.relList?.contains('stylesheet') && href) {
            record(elementRecord, href, 'stylesheet', {
              applied: Boolean(element.sheet) && sheetIsReadable(element.sheet),
              reason: !element.sheet ? 'stylesheet was not applied' : !sheetIsReadable(element.sheet) ? 'stylesheet CSSOM is unreadable' : '',
              resolved: element.sheet?.href || element.href
            });
          }
          if (htmlElement && ['iframe', 'frame'].includes(element.localName) && src) {
            let nestedDocument = null;
            try {
              nestedDocument = element.contentDocument;
            } catch (error) {
              nestedIssues.push(`${ownerKey} ${element.localName} contentDocument is inaccessible: ${error.message}`);
            }
            const geometry = visualGeometry(element);
            const expected = record(elementRecord, src, 'document', {
              applied: Boolean(nestedDocument) && nestedDocument.readyState !== 'loading' && geometry.pass,
              reason: !nestedDocument
                ? 'nested document contentDocument is unavailable'
                : nestedDocument.readyState === 'loading'
                  ? 'nested document did not finish loading'
                  : geometry.reason,
              resolved: nestedDocument?.URL || element.src
            });
            if (nestedDocument && expected) {
              visitDocument(
                nestedDocument,
                `${ownerKey}>${expected.ordinal}:${expected.resolvedDestination}`,
                expected.resolvedDestination
              );
            }
          }
          if (htmlElement && element.localName === 'iframe' && srcdoc) {
            let nestedDocument = null;
            try {
              nestedDocument = element.contentDocument;
            } catch (error) {
              nestedIssues.push(`${ownerKey} iframe srcdoc is inaccessible: ${error.message}`);
            }
            const identity = {
              attributeLocalName: srcdoc.localName,
              attributeNamespace: srcdoc.namespaceURI || '',
              authoredElementPath: path,
              elementLocalName: element.localName,
              elementNamespace: element.namespaceURI || '',
              ownerKey
            };
            const expectedSrcdoc = expectedSrcdocsByKey.get(srcdocKey(identity));
            if (!expectedSrcdoc) {
              nestedIssues.push(`${ownerKey} has an uncontrolled iframe srcdoc application at authored path ${path}`);
              continue;
            }
            const nestedKey = expectedSrcdoc.nestedKey;
            const countKey = srcdocKey(expectedSrcdoc);
            srcdocApplicationCounts.set(countKey, (srcdocApplicationCounts.get(countKey) || 0) + 1);
            const geometry = visualGeometry(element);
            if (!nestedDocument) nestedIssues.push(`${nestedKey} contentDocument is unavailable`);
            else if (!geometry.pass) nestedIssues.push(`${nestedKey} ${geometry.reason}`);
            else visitDocument(nestedDocument, nestedKey, ownerDocument);
          }
        }

        const processingInstructions = [];
        const instructionWalker = doc.createTreeWalker(doc, NodeFilter.SHOW_PROCESSING_INSTRUCTION);
        let instruction;
        while ((instruction = instructionWalker.nextNode())) processingInstructions.push(instruction);
        for (const sheet of doc.styleSheets) {
          if (sheet.ownerNode?.nodeType === Node.PROCESSING_INSTRUCTION_NODE && sheet.href) {
            const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(sheet.ownerNode.data);
            const value = href?.[1] ?? href?.[2] ?? '';
            const reference = {
              attribute: 'href',
              attributeLocalName: 'href',
              attributeNamespace: '',
              authoredInstructionOrdinal: processingInstructions.indexOf(sheet.ownerNode),
              authoredNodeKind: 'processing-instruction',
              elementLocalName: '?xml-stylesheet',
              elementNamespace: '',
              fetchKind: 'stylesheet',
              ownerKey,
              tag: '?xml-stylesheet',
              value
            };
            applications.push({
              ...reference,
              occurrence: expectedByKey.get(keyOf(reference))?.occurrence,
              applied: sheetIsReadable(sheet),
              reason: sheetIsReadable(sheet) ? '' : 'XML stylesheet CSSOM is unreadable',
              resolved: sheet.href,
              unexpected: !expectedByKey.has(keyOf(reference))
            });
          }
        }
      }

      visitDocument(document, 'root', 'index.html');
      for (const expectedSrcdoc of srcdocs) {
        const count = srcdocApplicationCounts.get(srcdocKey(expectedSrcdoc)) || 0;
        if (count !== 1) {
          nestedIssues.push(
            `${expectedSrcdoc.nestedKey} has ${count} browser application records; expected exactly one`
          );
        }
      }
      return { applications, nestedIssues };
    }, {
      operation: 'browser-resource-status',
      ledger: authoredReferenceLedger,
      srcdocs: authoredSrcdocLedger
    }), 'browser resource application inspection', lifecycleTimeoutMs);
    const nestedIssues = browserResourceStatus?.nestedIssues || [];
    const browserApplications = browserResourceStatus?.applications || [];
    if (nestedIssues.length) {
      throw new Error(`nested document application is incomplete: ${nestedIssues.join('; ')}`);
    }
    const applicationsByKey = new Map();
    for (const application of browserApplications) {
      const key = referenceApplicationKey(application);
      if (!applicationsByKey.has(key)) applicationsByKey.set(key, []);
      applicationsByKey.get(key).push(application);
      if (application.unexpected) {
        throw new Error(
          `browser applied an uncontrolled ${application.tag} ${application.attribute} reference in ` +
          `document instance ${application.ownerKey}`
        );
      }
    }
    for (const reference of authoredReferenceLedger.filter(item => item.browserFetching)) {
      const applications = applicationsByKey.get(referenceApplicationKey(reference)) || [];
      if (applications.length !== 1) {
        throw new Error(
          `${reference.resolvedDestination} ${reference.fetchKind} in document instance ${reference.ownerKey} ` +
          `from authored ${reference.tag} ${reference.attribute} occurrence ${reference.occurrence} ` +
          `has ${applications.length} browser application records; expected exactly one`
        );
      }
      const [application] = applications;
      let appliedPath;
      try {
        appliedPath = canonicalDeploymentPath(application.resolved, liveBaseUrl, approvedPaths);
      } catch (error) {
        throw new Error(`browser applied an uncontrolled ${reference.fetchKind} resource: ${error.message}`);
      }
      if (appliedPath !== reference.resolvedDestination) {
        throw new Error(
          `browser applied ${appliedPath} for authored ${reference.tag} ${reference.attribute} in ` +
          `document instance ${reference.ownerKey}; expected ${reference.resolvedDestination}`
        );
      }
      if (!application.applied) {
        throw new Error(
          `${reference.resolvedDestination} was fetched but not successfully decoded/applied for authored ` +
          `${reference.tag} ${reference.attribute} occurrence ${reference.occurrence} in document instance ` +
          `${reference.ownerKey}: ${application.reason || 'unknown browser application failure'}`
        );
      }
    }
    async function settleDisclosureGeometry(selector) {
      const deadline = Date.now() + lifecycleTimeoutMs;
      function remainingTime(operation) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`${selector} geometry stabilization timed out during ${operation} after ${lifecycleTimeoutMs}ms`);
        return remaining;
      }
      await bounded(page.evaluate(targetSelector => {
        let override = document.querySelector('#companion-verifier-scroll-override');
        if (!override) {
          override = document.createElement('style');
          override.id = 'companion-verifier-scroll-override';
          override.textContent = 'html,body,*{scroll-behavior:auto!important}';
          document.head.append(override);
        }
        const matches = document.querySelectorAll(targetSelector);
        if (matches.length === 1) matches[0].scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      }, selector), `${selector} instant scroll`, remainingTime('instant scroll'));
      let previousGeometry = '';
      let stableFrames = 0;
      for (let frame = 0; frame < 8 && stableFrames < 2; frame += 1) {
        await bounded(page.waitForTimeout(16), `${selector} geometry frame wait`, remainingTime('frame wait'));
        const geometry = await bounded(page.evaluate(targetSelector => {
          const element = document.querySelector(targetSelector);
          if (!element) return 'missing';
          const rect = element.getBoundingClientRect();
          return [scrollX, scrollY, rect.left, rect.top, rect.width, rect.height]
            .map(value => Math.round(value * 100) / 100)
            .join(',');
        }, selector), `${selector} stable geometry sample`, remainingTime('geometry sample'));
        stableFrames = geometry === previousGeometry ? stableFrames + 1 : 0;
        previousGeometry = geometry;
      }
      return stableFrames >= 2;
    }

    const disclosureResults = {};
    for (const [selector, expectedText, key] of [
      ['#release-badge', testVersionLabel, 'badge'],
      ['.release-note', fieldReleaseNotice, 'notice']
    ]) {
      const geometryStable = await settleDisclosureGeometry(selector);
      disclosureResults[key] = await bounded(page.evaluate(({ selector, expectedText, geometryStable }) => {
      function normalized(text) {
        return text.replace(/\s+/g, ' ').trim();
      }

      function intersection(a, b) {
        const left = Math.max(a.left, b.left);
        const top = Math.max(a.top, b.top);
        const right = Math.min(a.right, b.right);
        const bottom = Math.min(a.bottom, b.bottom);
        return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
      }

      function filterOpacityIsZero(filter) {
        for (const match of filter.matchAll(/opacity\(([^)]+)\)/gi)) {
          const raw = match[1].trim();
          const value = Number.parseFloat(raw);
          if (Number.isFinite(value) && (raw.endsWith('%') ? value / 100 : value) <= 0.01) return true;
        }
        return false;
      }

      function colorAlpha(color) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return context.getImageData(0, 0, 1, 1).data[3] / 255;
      }

      function inspectChain(element, selector) {
        let effectiveOpacity = 1;
        let effectiveFilterOpacity = 1;
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
          if (ancestor.hidden) return `${selector} has a hidden text descendant or ancestor`;
          if (ancestor.inert) return `${selector} has an inert text descendant or ancestor`;
          if (ancestor.getAttribute('aria-hidden')?.trim().toLowerCase() === 'true') {
            return `${selector} has an aria-hidden text descendant or ancestor`;
          }
          const style = getComputedStyle(ancestor);
          if (style.display === 'none') return `${selector} has display:none in its text rendering chain`;
          if (style.visibility === 'hidden' || style.visibility === 'collapse') return `${selector} has hidden visibility in its text rendering chain`;
          if (style.contentVisibility === 'hidden') return `${selector} has content-visibility:hidden`;
          effectiveOpacity *= Number.parseFloat(style.opacity);
          for (const match of style.filter.matchAll(/opacity\(([^)]+)\)/gi)) {
            const raw = match[1].trim();
            const value = Number.parseFloat(raw);
            if (Number.isFinite(value)) effectiveFilterOpacity *= raw.endsWith('%') ? value / 100 : value;
          }
          if (effectiveOpacity <= 0.01) return `${selector} has zero cumulative opacity`;
          if (effectiveFilterOpacity <= 0.01 || filterOpacityIsZero(style.filter)) return `${selector} has cumulative filter opacity zero`;
          if (style.clip !== 'auto' || style.clipPath !== 'none') return `${selector} is explicitly clipped`;
          if (style.transform !== 'none') {
            const matrix = new DOMMatrixReadOnly(style.transform);
            const scaleX = Math.hypot(matrix.m11, matrix.m12, matrix.m13);
            const scaleY = Math.hypot(matrix.m21, matrix.m22, matrix.m23);
            if (scaleX <= 0.01 || scaleY <= 0.01) return `${selector} has an effectively zero-scale transform`;
            const horizontalLimit = Math.max(document.documentElement.scrollWidth, innerWidth) * 4;
            const verticalLimit = Math.max(document.documentElement.scrollHeight, innerHeight) * 4;
            if (Math.abs(matrix.m41) > horizontalLimit || Math.abs(matrix.m42) > verticalLimit) {
              return `${selector} has an unreachable transform translation`;
            }
          }
        }
        return null;
      }

      function textRunIsPerceptible(textNode, selector) {
        const container = textNode.parentElement;
        const chainFailure = inspectChain(container, selector);
        if (chainFailure) return { pass: false, reason: chainFailure };
        const style = getComputedStyle(container);
        if (colorAlpha(style.color) <= 0.01) return { pass: false, reason: `${selector} has transparent text` };
        if (colorAlpha(style.webkitTextFillColor || style.color) <= 0.01) {
          return { pass: false, reason: `${selector} has transparent text fill` };
        }
        if (Number.parseFloat(style.fontSize) < 1) return { pass: false, reason: `${selector} has non-rendered font geometry` };
        if (style.lineHeight !== 'normal' && Number.parseFloat(style.lineHeight) < 1) {
          return { pass: false, reason: `${selector} has non-rendered line geometry` };
        }
        let visible = { left: 0, top: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight };
        for (let ancestor = container; ancestor; ancestor = ancestor.parentElement) {
          const ancestorStyle = getComputedStyle(ancestor);
          if (['hidden', 'clip', 'scroll', 'auto'].includes(ancestorStyle.overflowX) ||
              ['hidden', 'clip', 'scroll', 'auto'].includes(ancestorStyle.overflowY)) {
            const rect = ancestor.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) {
              return { pass: false, reason: `${selector} has a zero-size overflow-clipping ancestor` };
            }
            visible = intersection(visible, rect);
          }
        }
        const range = document.createRange();
        let perceptibleText = '';
        let visibleCharacters = 0;
        let hiddenCharacters = 0;
        for (let offset = 0; offset < textNode.data.length; offset += 1) {
          range.setStart(textNode, offset);
          range.setEnd(textNode, offset + 1);
          const characterIsVisible = [...range.getClientRects()]
            .filter(rect => rect.width >= 1 && rect.height >= 1)
            .some(rect => {
              const overlap = intersection(visible, rect);
              return overlap.width >= 1 && overlap.height >= 1;
            });
          if (characterIsVisible) {
            perceptibleText += textNode.data[offset];
            visibleCharacters += 1;
          } else {
            perceptibleText += '\uFFFD';
            hiddenCharacters += 1;
          }
        }
        if (!visibleCharacters) return { pass: false, reason: `${selector} has zero-area, clipped, or unreachable rendered text` };
        return {
          pass: true,
          perceptibleText,
          reason: hiddenCharacters ? `${selector} has partially clipped rendered text` : null
        };
      }

      function inspect(selector, expectedText) {
        const matches = [...document.querySelectorAll(selector)];
        if (matches.length !== 1) return { pass: false, reason: `${selector} expected exactly once; found ${matches.length}` };
        const element = matches[0];
        const selectorFailure = inspectChain(element, selector);
        if (selectorFailure) return { pass: false, reason: selectorFailure };
        if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) {
          return { pass: false, reason: `${selector} is not rendered with computed visibility` };
        }
        const renderedText = normalized(element.innerText);
        if (!renderedText.includes(expectedText)) {
          return { pass: false, reason: `${selector} does not contain the approved visible wording` };
        }
        if (!geometryStable) return { pass: false, reason: `${selector} scrolling geometry did not stabilize` };
        const elementRect = element.getBoundingClientRect();
        if (elementRect.width < 1 || elementRect.height < 1) return { pass: false, reason: `${selector} has zero-area rendered geometry` };
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const visibleText = [];
        const hiddenReasons = [];
        let textNode;
        while ((textNode = walker.nextNode())) {
          if (!normalized(textNode.data)) continue;
          const perceptibility = textRunIsPerceptible(textNode, selector);
          if (perceptibility.pass) visibleText.push(perceptibility.perceptibleText);
          if (perceptibility.reason) hiddenReasons.push(perceptibility.reason);
        }
        if (!normalized(visibleText.join('')).includes(expectedText)) {
          return {
            pass: false,
            reason: `${selector} approved wording is not supplied by perceptible rendered text` +
              (hiddenReasons.length ? ` (${[...new Set(hiddenReasons)].join('; ')})` : '')
          };
        }
        return { pass: true, visibleText: normalized(visibleText.join('')) };
      }

      return inspect(selector, expectedText);
      }, { selector, expectedText, geometryStable }), `${selector} browser disclosure evaluation`, lifecycleTimeoutMs);
    }
    result = {
      pass: disclosureResults.badge.pass && disclosureResults.notice.pass,
      badge: disclosureResults.badge,
      notice: disclosureResults.notice
    };
  } catch (error) {
    primaryError = error;
  } finally {
    for (const [resource, close] of [
      ['page', page && (() => page.close())],
      ['context', context && (() => context.close())],
      ['browser', !suppliedBrowser && browser && (() => browser.close())]
    ]) {
      if (!close) continue;
      try {
        await bounded(close(), `${resource} cleanup`, lifecycleTimeoutMs);
      } catch (error) {
        cleanupErrors.push(new Error(`${resource} cleanup failed: ${error.message}`));
      }
    }
  }
  if (primaryError) throw attachCleanupErrors(primaryError, cleanupErrors);
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, `verifier cleanup failed: ${cleanupErrors.map(error => error.message).join('; ')}`);
  return result;
}

export function validateRetryConfiguration(attemptsValue, delayValue) {
  const canonicalDecimal = /^(?:0|[1-9]\d*)$/;
  if (typeof attemptsValue !== 'string' || !canonicalDecimal.test(attemptsValue)) {
    throw new Error('LIVE_CHECK_ATTEMPTS must use canonical unsigned decimal syntax');
  }
  if (typeof delayValue !== 'string' || !canonicalDecimal.test(delayValue)) {
    throw new Error('LIVE_CHECK_DELAY_MS must use canonical unsigned decimal syntax');
  }
  const attempts = Number(attemptsValue);
  const delayMs = Number(delayValue);
  if (!Number.isSafeInteger(attempts) || attempts <= 0) {
    throw new Error('LIVE_CHECK_ATTEMPTS must be a safe positive integer');
  }
  if (!Number.isSafeInteger(delayMs)) {
    throw new Error('LIVE_CHECK_DELAY_MS must be a safe nonnegative integer');
  }
  return { attempts, delayMs };
}

export async function runWithRetries({ attemptsValue, delayValue, checkOnceImpl = checkOnce, sleepImpl } = {}) {
  const { attempts, delayMs } = validateRetryConfiguration(attemptsValue, delayValue);
  const sleep = sleepImpl || (ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms)));
  let finalError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await checkOnceImpl();
      return;
    } catch (error) {
      finalError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw finalError;
}

export async function checkOnce(options = {}) {
  const {
    fetchBytesImpl,
    fetchResourceImpl,
    fetchImpl = fetch,
    liveBaseUrl = baseUrl,
    log = console.log,
    browser,
    resourceTimeoutMs = defaultLifecycleTimeoutMs
  } = options;
  if (liveBaseUrl.protocol !== 'https:') throw new Error('live Companion URL is not HTTPS');
  const topLevelPaths = new Set(['release.json', 'offline-bundle.json', 'index.html', 'manifest.webmanifest', 'service-worker.js']);
  const loadResource = fetchResourceImpl || (fetchBytesImpl
    ? async (path, loadOptions) => ({ bytes: await fetchBytesImpl(path, loadOptions), finalUrl: new URL(path, canonicalBase(liveBaseUrl)).href })
    : (path, loadOptions) => fetchDeploymentResource(path, { liveBaseUrl, allowedPaths: topLevelPaths, fetchImpl, signal: loadOptions.signal }));
  const [localBundleBytes, localManifestBytes, releaseResource, bundleResource, htmlResource, webManifestResource, workerResource] = await Promise.all([
    readFile(resolve(repoRoot, 'offline-bundle.json')),
    readFile(resolve(repoRoot, 'data/trip-manifest.json')),
    loadValidatedResource(loadResource, 'release.json', liveBaseUrl, topLevelPaths, resourceTimeoutMs),
    loadValidatedResource(loadResource, 'offline-bundle.json', liveBaseUrl, topLevelPaths, resourceTimeoutMs),
    loadValidatedResource(loadResource, 'index.html', liveBaseUrl, topLevelPaths, resourceTimeoutMs),
    loadValidatedResource(loadResource, 'manifest.webmanifest', liveBaseUrl, topLevelPaths, resourceTimeoutMs),
    loadValidatedResource(loadResource, 'service-worker.js', liveBaseUrl, topLevelPaths, resourceTimeoutMs)
  ]);
  const releaseBytes = releaseResource.bytes;
  const bundleBytes = bundleResource.bytes;
  const htmlBytes = htmlResource.bytes;
  const webManifestBytes = webManifestResource.bytes;
  const workerBytes = workerResource.bytes;
  const release = JSON.parse(releaseBytes.toString('utf8'));
  const bundle = JSON.parse(bundleBytes.toString('utf8'));
  const approvedPaths = new Set(['index.html', ...bundle.resources.map(resource => resource.path)]);
  const renderLoader = fetchResourceImpl || (fetchBytesImpl
    ? async (path, loadOptions) => ({ bytes: await fetchBytesImpl(path, loadOptions), finalUrl: new URL(path, canonicalBase(liveBaseUrl)).href })
    : (path, loadOptions) => fetchDeploymentResource(path, { liveBaseUrl, allowedPaths: approvedPaths, fetchImpl, signal: loadOptions.signal }));
  const errors = [];
  if (release.companion_version !== '0.6.0-candidate.6') errors.push('candidate version mismatch');
  if (release.release_status !== 'candidate') errors.push('release status mismatch');
  if (release.pwa_url !== expectedPublicBase) errors.push('public URL contract mismatch');
  if (release.manifest_sha256 !== sha256(localManifestBytes)) errors.push('canonical manifest fingerprint mismatch');
  if (release.bundle_id !== bundle.bundle_id) errors.push('release/offline bundle identity mismatch');
  if (sha256(bundleBytes) !== sha256(localBundleBytes)) errors.push('deployed offline-bundle.json differs from the validated commit');
  const responseSnapshots = createValidatedSnapshotCache(
    renderLoader,
    liveBaseUrl,
    approvedPaths,
    resourceTimeoutMs,
    [
      ['index.html', htmlResource],
      ['manifest.webmanifest', webManifestResource],
      ['release.json', releaseResource]
    ]
  );
  for (const resource of bundle.resources) {
    const snapshot = await responseSnapshots.get(resource.path);
    if (snapshot.byteCount !== resource.bytes || snapshot.sha256 !== resource.sha256) {
      errors.push(`${resource.path} live integrity mismatch`);
    }
  }
  if (errors.length) throw new Error(errors.join('; '));
  const disclosure = await inspectVisibleTestVersionDisclosure(htmlBytes.toString('utf8'), {
    fetchResourceImpl: renderLoader,
    validatedResourceLoader: path => responseSnapshots.get(path),
    liveBaseUrl,
    browser,
    allowedResourcePaths: approvedPaths,
    rootResourceSnapshot: htmlResource,
    rootContentType: htmlResource.contentType,
    resourceTimeoutMs
  });
  if (!disclosure.pass) {
    errors.push(
      `visible test-version disclosure is absent from deployed HTML ` +
      `(expected “${testVersionLabel}” and “${fieldReleaseNotice}”; ` +
      `badge: ${disclosure.badge.reason || 'pass'}; notice: ${disclosure.notice.reason || 'pass'})`
    );
  }
  if (!JSON.parse(webManifestBytes.toString('utf8')).start_url) errors.push('deployed web manifest is invalid');
  if (!workerBytes.toString('utf8').includes(release.bundle_id)) errors.push('deployed service worker identity mismatch');
  for (const resource of bundle.resources) {
    const snapshot = await responseSnapshots.get(resource.path);
    if (snapshot.byteCount !== resource.bytes || snapshot.sha256 !== resource.sha256) {
      errors.push(`${resource.path} immutable snapshot integrity mismatch`);
    }
  }
  if (errors.length) throw new Error(errors.join('; '));
  log('live_site_integrity=pass');
  log('live_url=' + liveBaseUrl.href);
  log('candidate_version=' + release.companion_version);
  log('release_status=' + release.release_status);
  log('bundle_id=' + release.bundle_id);
  log('manifest_sha256=' + release.manifest_sha256);
  log('verified_resource_count=' + bundle.resources.length);
  return { verifiedResourceCount: bundle.resources.length };
}

async function main() {
  try {
    await runWithRetries({
      attemptsValue: process.env.LIVE_CHECK_ATTEMPTS ?? '12',
      delayValue: process.env.LIVE_CHECK_DELAY_MS ?? '10000'
    });
  } catch (error) {
    console.error('live_site_integrity=fail');
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) await main();
