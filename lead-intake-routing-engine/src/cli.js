#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV, toCSV } from './csv.js';
import { processLeads, CRM_FIELDS } from './engine.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function readInput(path) {
  const text = await readFile(path, 'utf8');
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('Input exceeds the 2 MB limit.');
  if (path.toLowerCase().endsWith('.csv')) return parseCSV(text);
  if (!path.toLowerCase().endsWith('.json')) throw new Error('Input must be a .csv or .json file.');
  const value = JSON.parse(text);
  return Array.isArray(value) ? value : [value];
}

export async function runCLI(args) {
  const usage = 'Usage: node src/cli.js --input FILE.csv|FILE.json --out DIRECTORY [--rules FILE.json] [--existing FILE.csv|FILE.json] [--strict]';
  if (args.includes('--help')) { console.log(usage); return 0; }
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--input', '--out', '--rules', '--existing', '--strict'].includes(flag) || Object.hasOwn(options, flag)) throw new Error(usage);
    if (flag === '--strict') { options[flag] = true; continue; }
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(usage);
    options[flag] = args[++i];
  }
  if (!options['--input'] || !options['--out']) throw new Error(usage);
  const rules = JSON.parse(await readFile(options['--rules'] || join(root, 'config/rules.json'), 'utf8'));
  const records = await readInput(options['--input']);
  const existing = options['--existing'] ? await readInput(options['--existing']) : [];
  const result = processLeads(records, rules, { existing });
  const out = resolve(options['--out']);
  await mkdir(out, { recursive: true });
  const json = value => JSON.stringify(value, null, 2) + '\n';
  await writeFile(join(out, 'processed-leads.json'), json(result));
  await writeFile(join(out, 'crm-ready.json'), json(result.crm_ready));
  await writeFile(join(out, 'crm-ready.csv'), toCSV(result.crm_ready, CRM_FIELDS));
  await writeFile(join(out, 'review-queue.csv'), toCSV(result.leads.filter(lead => lead.status !== 'ready_for_crm'), [...CRM_FIELDS, 'flags', 'duplicate_matches']));
  console.log(`Processed ${result.stats.total}: ${result.stats.ready} CRM-ready, ${result.stats.review} for review, ${result.stats.invalid} invalid, ${result.stats.duplicates} likely duplicates.`);
  console.log(`Saved four export files to ${out}`);
  return options['--strict'] && (result.stats.invalid || result.stats.review) ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runCLI(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
