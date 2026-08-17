import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const offlineTestMode = process.env.OFFLINE_TEST_MODE === '1';
const previousFixtureRoot = resolve(repoRoot, 'tests/fixtures/offline-update/previous');
let testState = { release: 'current', failPath: '', corruptPath: '', failureStatus: 503 };
let requestLog = [];
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.pdf', 'application/pdf'], ['.png', 'image/png']
]);

function safePathForRoot(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return candidate;
}

function safePath(urlPath) {
  return safePathForRoot(repoRoot, urlPath);
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function testControl(request, response, pathname) {
  if (!offlineTestMode || !pathname.startsWith('/__test__/')) return false;
  if (request.method === 'POST' && pathname === '/__test__/state') {
    const next = await readRequestJson(request);
    testState = {
      release: next.release === 'previous' ? 'previous' : 'current',
      failPath: typeof next.failPath === 'string' ? next.failPath.replace(/^\/+/, '') : '',
      corruptPath: typeof next.corruptPath === 'string' ? next.corruptPath.replace(/^\/+/, '') : '',
      failureStatus: Number.isInteger(next.failureStatus) ? next.failureStatus : 503
    };
    json(response, 200, testState);
    return true;
  }
  if (request.method === 'POST' && pathname === '/__test__/reset-requests') {
    requestLog = [];
    json(response, 200, { reset: true });
    return true;
  }
  if (request.method === 'GET' && pathname === '/__test__/requests') {
    json(response, 200, requestLog);
    return true;
  }
  if (request.method === 'GET' && pathname === '/__test__/state') {
    json(response, 200, testState);
    return true;
  }
  json(response, 404, { error: 'Unknown offline-test control' });
  return true;
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${host}:${port}`);
  if (await testControl(request, response, requestUrl.pathname)) return;
  const relative = requestUrl.pathname === '/' ? 'index.html' : decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
  if (offlineTestMode) requestLog.push({ method: request.method, path: relative });
  if (offlineTestMode && testState.failPath === relative) {
    response.writeHead(testState.failureStatus, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('Injected offline test failure');
    return;
  }
  const path = testState.release === 'previous' && offlineTestMode
    ? safePathForRoot(previousFixtureRoot, request.url || '/')
    : safePath(request.url || '/');
  if (!path) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = await stat(path);
    const target = info.isDirectory() ? resolve(path, 'index.html') : path;
    const headers = {
      'Content-Type': mimeTypes.get(extname(target)) || 'application/octet-stream',
      'Cache-Control': ['service-worker.js', 'offline-bundle.json', 'release.json'].includes(relative) ? 'no-store' : 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    };
    if (relative === 'service-worker.js') headers['Service-Worker-Allowed'] = './';
    if (offlineTestMode && testState.corruptPath === relative) {
      const bytes = await readFile(target);
      const corrupted = Buffer.from(bytes);
      if (corrupted.length) corrupted[Math.floor(corrupted.length / 2)] ^= 1;
      response.writeHead(200, headers).end(corrupted);
      return;
    }
    response.writeHead(200, headers);
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`pwa_server=http://${host}:${port}`);
});
