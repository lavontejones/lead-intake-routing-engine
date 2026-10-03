import { readdir, readFile, access } from 'node:fs/promises';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseCSV, toCSV } from '../src/csv.js';
import { processLeads, CRM_FIELDS } from '../src/engine.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const excluded = new Set(['.git', 'node_modules', 'output', 'data', 'uploads', 'coverage']);
const failures = [], files = [];
async function walk(dir = '') {
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name === '.DS_Store') continue;
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) { failures.push(`Symlink cannot be published: ${path}`); continue; }
    if (entry.isDirectory()) await walk(path); else files.push(path);
  }
}
await walk();
const secretPatterns = [
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{40,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{24,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /Bearer\s+[A-Za-z0-9_.-]{25,}/i
];
const unfinished = new RegExp(`\\b(?:${['TO' + 'DO', 'FIX' + 'ME', 'T' + 'BD', 'YOUR_' + 'API_KEY'].join('|')})\\b`);
const localPath = new RegExp('/(?:' + ['Us' + 'ers', 'ho' + 'me', 'work' + 'space'].join('|') + ')/');
const unwantedBrand = new RegExp('jon' + 'esys', 'i');
const extensions = new Set(['.js', '.json', '.md', '.csv', '.svg', '.html', '.css', '.yml']);
for (const path of files) {
  if (!extensions.has(extname(path)) && !['LICENSE', '.gitignore'].includes(path)) failures.push(`Unexpected publication file: ${path}`);
  if (/(^|\/)\.env(?:\.|$)|\.(?:pem|key|log)$|\.local\./i.test(path)) failures.push(`Private or local file: ${path}`);
  const text = await readFile(join(root, path), 'utf8');
  if (secretPatterns.some(pattern => pattern.test(text))) failures.push(`Possible secret: ${path}`);
  if (unfinished.test(text)) failures.push(`Unfinished marker: ${path}`);
  if (localPath.test(text)) failures.push(`Nonportable absolute path: ${path}`);
  if (unwantedBrand.test(text)) failures.push(`Unwanted branding: ${path}`);
  if (path.endsWith('.js')) { const check = spawnSync(process.execPath, ['--check', join(root, path)]); if (check.status !== 0) failures.push(`JavaScript syntax failure: ${path}`); }
  if (path.endsWith('.json')) { try { JSON.parse(text); } catch { failures.push(`Invalid JSON: ${path}`); } }
  if (path.endsWith('.md')) {
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^(https?:|mailto:)/.test(target)) continue;
      try { await access(resolve(dirname(join(root, path)), target)); } catch { failures.push(`Broken local link in ${path}: ${target}`); }
    }
  }
}
for (const required of ['README.md', 'LICENSE', '.gitignore', 'package.json', 'package-lock.json', 'config/rules.json', '.github/workflows/validate.yml', 'docs/sample-results.svg']) if (!files.includes(required)) failures.push(`Missing required file: ${required}`);
const rules = JSON.parse(await readFile(join(root, 'config/rules.json'), 'utf8'));
const sample = parseCSV(await readFile(join(root, 'samples/leads.csv'), 'utf8'));
const form = JSON.parse(await readFile(join(root, 'samples/form-lead.json'), 'utf8'));
const inventory = parseCSV(await readFile(join(root, 'samples/existing-contacts.csv'), 'utf8'));
for (const lead of [...sample, form, ...inventory]) {
  if (lead.email && !/@example\.(com|org|net)$/i.test(lead.email)) failures.push('Sample email must use a reserved example domain.');
  if (lead.company && !lead.company.trim().startsWith('Example ')) failures.push('Sample company must explicitly identify itself as an example.');
  if (lead.phone && lead.phone !== '555' && !/^(?:1)?[2-9]\d{2}55501\d{2}$/.test(lead.phone.replace(/\s*(?:ext\.?|x)\s*\d+$/i, '').replace(/\D/g, ''))) failures.push('Sample phone must use the fictional US 555-0100–0199 range.');
}
const result = processLeads(sample, rules);
const expected = {
  'processed-leads.json': JSON.stringify(result, null, 2) + '\n',
  'crm-ready.json': JSON.stringify(result.crm_ready, null, 2) + '\n',
  'crm-ready.csv': toCSV(result.crm_ready, CRM_FIELDS),
  'review-queue.csv': toCSV(result.leads.filter(lead => lead.status !== 'ready_for_crm'), [...CRM_FIELDS, 'flags', 'duplicate_matches'])
};
for (const [path, contents] of Object.entries(expected)) {
  try { if (await readFile(join(root, 'docs/example-output', path), 'utf8') !== contents) failures.push(`Stale example export: ${path}`); }
  catch { failures.push(`Missing example export: ${path}`); }
}
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
if (pkg.name !== lock.name || pkg.version !== lock.version || Object.keys(pkg.dependencies || {}).length || Object.keys(pkg.devDependencies || {}).length || Object.keys(lock.packages).length !== 1) failures.push('Dependency metadata must agree with this dependency-free implementation.');
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else if (process.argv.includes('--list')) console.log(files.sort().join('\n'));
else console.log(`Publication audit passed: ${files.length} files; synthetic examples match current engine output; no flagged secrets, broken documentation links, or unfinished markers.`);
