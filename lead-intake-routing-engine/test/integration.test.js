import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { createLocalServer, handleRequest } from '../src/server.js';
import { parseCSV } from '../src/csv.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('CLI produces complete exports and strict mode identifies review work', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lead-engine-test-'));
  try {
    const result = spawnSync(
      process.execPath,
      ['src/cli.js', '--input', 'samples/leads.csv', '--out', dir, '--strict'],
      { cwd: root, encoding: 'utf8' }
    );

    assert.equal(result.status, 2, result.stderr);

    const full = JSON.parse(await readFile(join(dir, 'processed-leads.json'), 'utf8'));
    const ready = parseCSV(await readFile(join(dir, 'crm-ready.csv'), 'utf8'));
    const review = parseCSV(await readFile(join(dir, 'review-queue.csv'), 'utf8'));

    assert.equal(full.stats.total, 12);
    assert.equal(ready.length, 5);
    assert.equal(review.length, 7);
    assert.equal(JSON.parse(await readFile(join(dir, 'crm-ready.json'), 'utf8')).length, 5);
    assert.ok(ready.every(lead => lead.status === 'ready_for_crm'));
    assert.ok(ready.every(lead => lead.phone === '' || lead.phone.startsWith("'+")));

    const single = spawnSync(
      process.execPath,
      ['src/cli.js', '--input', 'samples/form-lead.json', '--out', dir],
      { cwd: root, encoding: 'utf8' }
    );

    assert.equal(single.status, 0, single.stderr);

    const invalid = join(dir, 'invalid.csv');
    await writeFile(invalid, 'email,phone\na@example.com\n');

    assert.equal(
      spawnSync(process.execPath, ['src/cli.js', '--input', invalid, '--out', dir], { cwd: root }).status,
      1
    );

    assert.equal(
      spawnSync(process.execPath, ['src/cli.js', '--input'], { cwd: root }).status,
      1
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('HTTP handler reads real assets and enforces the local access boundary', async () => {
  async function call(url, method = 'GET', host = '127.0.0.1:4173') {
    const response = {
      headers: {},
      status: 200,
      body: '',
      setHeader(k, v) {
        this.headers[k] = v;
      },
      writeHead(code, headers) {
        this.status = code;
        Object.assign(this.headers, headers);
      },
      end(body) {
        this.body = String(body || '');
      }
    };

    await handleRequest({ url, method, headers: { host } }, response);
    return response;
  }

  const page = await call('/');
  assert.equal(page.status, 200);
  assert.match(page.body, /Lead Intake/);
  assert.match(page.headers['Content-Security-Policy'], /frame-ancestors 'none'/);

  for (const path of [
    '/styles.css',
    '/app.js',
    '/src/engine.js',
    '/src/csv.js',
    '/config/rules.json',
    '/samples/leads.csv'
  ]) {
    assert.equal((await call(path)).status, 200);
  }

  for (const path of [
    '/package.json',
    '/.env',
    '/output/processed-leads.json',
    '/../config/rules.json',
    '/%2e%2e%2fconfig/rules.json'
  ]) {
    assert.equal((await call(path)).status, 404);
  }

  assert.equal((await call('/', 'POST')).status, 405);
  assert.equal((await call('/', 'HEAD')).body, '');
  assert.equal((await call('/', 'GET', 'untrusted.example.com')).status, 403);
});

test('live HTTP smoke test serves assets and rejects unsafe requests', async context => {
  const server = createLocalServer();

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    if (error.code === 'EPERM') {
      context.skip('Workspace blocks local listening sockets; handler contract is tested separately.');
      return;
    }
    throw error;
  }

  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Lead Intake/);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);

    for (const path of [
      '/styles.css',
      '/app.js',
      '/src/engine.js',
      '/src/csv.js',
      '/config/rules.json',
      '/samples/leads.csv'
    ]) {
      assert.equal((await fetch(base + path)).status, 200, path);
    }

    for (const path of [
      '/package.json',
      '/.env',
      '/output/processed-leads.json',
      '/docs/example-output/crm-ready.json',
      '/%2e%2e%2fconfig/rules.json'
    ]) {
      assert.equal((await fetch(base + path)).status, 404, path);
    }

    assert.equal((await fetch(base, { method: 'POST', body: 'test' })).status, 405);
    assert.equal((await fetch(base, { method: 'HEAD' })).status, 200);

    const status = await new Promise((resolve, reject) => {
      const req = request(
        base,
        { headers: { Host: 'untrusted.example.com' } },
        res => {
          res.resume();
          resolve(res.statusCode);
        }
      );

      req.on('error', reject);
      req.end();
    });

    assert.equal(status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
