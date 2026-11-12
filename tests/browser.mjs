import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, resolve, relative, extname, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {runScenarios} from './browser-scenarios.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidates = process.platform === 'win32'
  ? [join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe')]
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const chrome = process.env.CHROME_PATH || candidates.find(existsSync);
if (!chrome) throw new Error('Set CHROME_PATH to a Chrome, Chromium or Edge executable.');
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const filename = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const local = relative(root, filename);
    if (local.startsWith('..') || isAbsolute(local)) { response.writeHead(403).end(); return; }
    const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png'};
    response.setHeader('Content-Type', (types[extname(filename)] || 'application/octet-stream') + '; charset=utf-8');
    response.end(await readFile(filename));
  } catch { response.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}/`;
const profile = await mkdtemp(join(tmpdir(), 'election-test-'));
let browser, socket, cdp;
const errors = [];
try {
  browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], {windowsHide: true, stdio: 'ignore'});
  let launchError;
  browser.on('error', error => { launchError = error; });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    if (browser.exitCode !== null) throw new Error('Browser exited before debugging was ready.');
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch {}
    await delay(100);
  }
  if (!port) throw new Error('Timed out starting browser.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((done, fail) => {
    socket.addEventListener('open', done, {once: true});
    socket.addEventListener('error', fail, {once: true});
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) pending.get(message.id)?.(message);
    else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  });
  cdp = (method, params = {}) => new Promise((done, fail) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); fail(new Error(`Timeout: ${method}`)); }, 10000);
    pending.set(id, message => {
      clearTimeout(timer); pending.delete(id);
      if (message.error) fail(new Error(JSON.stringify(message.error))); else done(message.result);
    });
    socket.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const ready = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (errors.length) throw new Error(errors.join('\n'));
      if (await evaluate("document.readyState === 'complete' && document.querySelectorAll('.panel-help-popover').length > 0")) return;
      await delay(50);
    }
    throw new Error('Page did not initialize.');
  };
  const reload = async () => { await cdp('Page.reload', {ignoreCache: true}); await ready(); };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', {width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false});
  await cdp('Page.navigate', {url}); await ready();
  await runScenarios({evaluate, cdp, reload});
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Browser regression checks passed; no runtime errors.');
} finally {
  if (cdp && socket.readyState === WebSocket.OPEN) await cdp('Browser.close').catch(() => {});
  socket?.close();
  if (browser && browser.exitCode === null) {
    await Promise.race([once(browser, 'exit'), delay(2000)]);
    if (browser.exitCode === null) browser.kill();
  }
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  // Only delete the unique temporary profile created by this test.
  const local = relative(resolve(tmpdir()), resolve(profile));
  if (local.startsWith('election-test-') && !local.includes('/') && !local.includes('\\')) {
    await rm(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}).catch(error => console.warn(`Temporary profile remains: ${error.message}`));
  }
}
