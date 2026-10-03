import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV } from '../src/csv.js';
import { processLeads } from '../src/engine.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rules = JSON.parse(await readFile(join(root, 'config/rules.json'), 'utf8'));
const result = processLeads(parseCSV(await readFile(join(root, 'samples/leads.csv'), 'utf8')), rules);
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const text = (x, y, value, size = 14, color = '#19282c', weight = 400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${escape(value)}</text>`;
const height = 330 + result.leads.length * 56;
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}" role="img" aria-labelledby="title desc"><title id="title">Lead intake sample batch results</title><desc id="desc">Generated from twelve fictional leads. Five ready, four for review, three invalid.</desc><rect width="1100" height="${height}" fill="#f2f4ef"/><g font-family="Arial, Helvetica, sans-serif">`];
svg.push(text(36, 38, 'LEAD INTAKE + ROUTING ENGINE', 12, '#22594c', 700), text(36, 83, 'From inquiry to a clear next step.', 32, '#19282c', 600), text(36, 112, 'Actual engine output · Synthetic contacts · Rules version ' + result.rules_version, 13, '#5e6d70'));
const metrics = [['LEADS RECEIVED', result.stats.total], ['CRM-READY', result.stats.ready], ['NEEDS REVIEW', result.stats.review], ['INVALID', result.stats.invalid]];
for (let i = 0; i < metrics.length; i++) {
  const x = 36 + i * 258;
  svg.push(`<rect x="${x}" y="142" width="246" height="96" rx="5" fill="#fff" stroke="#dbe1d8"/>`, text(x + 18, 168, metrics[i][0], 10, '#5e6d70', 700), text(x + 18, 212, metrics[i][1], 32));
}
svg.push(`<rect x="36" y="260" width="1028" height="${40 + result.leads.length * 56}" rx="5" fill="#fff" stroke="#dbe1d8"/>`, text(54, 285, 'CONTACT / COMPANY', 10, '#5e6d70', 700), text(450, 285, 'SCORE', 10, '#5e6d70', 700), text(560, 285, 'ASSIGNED TEAM', 10, '#5e6d70', 700), text(872, 285, 'STATUS', 10, '#5e6d70', 700));
result.leads.forEach((lead, i) => {
  const y = 300 + i * 56;
  const state = lead.status === 'ready_for_crm' ? ['CRM-ready', '#e6efdf', '#385731'] : lead.status === 'needs_review' ? ['Needs review', '#fff2d9', '#815519'] : ['Invalid', '#fde9e6', '#9b302b'];
  svg.push(`<line x1="36" y1="${y}" x2="1064" y2="${y}" stroke="#edf0ea"/>`, text(54, y + 23, `${lead.first_name} ${lead.last_name}`, 13, '#22594c', 600), text(54, y + 41, lead.company, 11, '#5e6d70'), text(450, y + 24, `${lead.lead_score}/100`, 14, '#19282c', 600), text(450, y + 42, `${lead.priority} priority`, 11, '#5e6d70'), text(560, y + 28, lead.assignment, 12), `<rect x="872" y="${y + 14}" width="135" height="26" rx="4" fill="${state[1]}"/>`, text(884, y + 31, state[0], 11, state[2], 600));
});
svg.push(text(36, height - 12, `${result.stats.duplicates} likely duplicate records held for review. No automatic merging or CRM connection.`, 11, '#5e6d70'), '</g></svg>');
await writeFile(join(root, 'docs/sample-results.svg'), svg.join('\n') + '\n');
console.log('Generated docs/sample-results.svg from the current sample engine output.');
