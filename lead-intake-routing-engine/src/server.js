import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const routes = new Map([
  ['/', ['public/index.html', 'text/html']],
  ['/app.js', ['public/app.js', 'text/javascript']],
  ['/styles.css', ['public/styles.css', 'text/css']],
  ['/src/engine.js', ['src/engine.js', 'text/javascript']],
  ['/src/csv.js', ['src/csv.js', 'text/javascript']],
  ['/config/rules.json', ['config/rules.json', 'application/json']],
  ['/samples/leads.csv', ['samples/leads.csv', 'text/csv']]
]);

export async function handleRequest(req, res) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); res.end('Local access only.'); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed.'); return; }
    const path = (req.url || '/').split('?')[0];
    if (!routes.has(path)) { res.writeHead(404); res.end('Not found.'); return; }
    const [file, type] = routes.get(path);
    try {
      const contents = await readFile(join(root, file));
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : contents);
    } catch { res.writeHead(500); res.end('Could not load application file.'); }
}

export function createLocalServer() {
  return createServer(handleRequest);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createLocalServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port 4173 is already in use.' : 'Could not start local server.'); process.exitCode = 1; });
  server.listen(4173, '127.0.0.1', () => console.log('Lead Intake + Routing Engine: http://127.0.0.1:4173'));
}
