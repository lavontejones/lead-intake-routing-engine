import { processLeads, validateRules, CRM_FIELDS, MAX_LEADS } from '/src/engine.js';
import { parseCSV, toCSV } from '/src/csv.js';

const $ = id => document.getElementById(id);
let rules, records = [], existing = [], result, selected;
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = el('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function render() {
  for (const field of ['total', 'ready', 'review', 'invalid']) $(field).textContent = result?.stats[field] || 0;
  $('rows').replaceChildren();
  const leads = (result?.leads || []).filter(lead => $('filter').value === 'all' || lead.status === $('filter').value);
  if (!leads.length) { const row = el('tr'), cell = el('td', 'No leads in this view.', 'empty'); cell.colSpan = 4; row.append(cell); $('rows').append(row); }
  for (const lead of leads) {
    const row = el('tr'), contact = el('td'), button = el('button', `${lead.first_name} ${lead.last_name}`.trim() || 'Unnamed contact', 'contact');
    button.addEventListener('click', () => { selected = lead.lead_id; showDetail(lead); });
    contact.append(button, el('small', lead.company || 'Company not supplied'));
    const priority = el('td', `${lead.lead_score}/100`, 'priority'); priority.append(el('small', `${lead.priority} priority`));
    const state = el('td'); state.append(el('span', lead.status.replaceAll('_', ' '), `pill ${lead.status}`));
    row.append(contact, priority, el('td', lead.assignment), state); $('rows').append(row);
  }
  $('export-csv').disabled = !result?.crm_ready.length;
  $('export-json').disabled = !result;
  $('export-review').disabled = !result?.leads.some(lead => lead.status !== 'ready_for_crm');
  const selectedLead = result?.leads.find(lead => lead.lead_id === selected) || result?.leads[0];
  if (selectedLead) showDetail(selectedLead);
}
function showDetail(lead) {
  const detail = $('detail'); detail.replaceChildren(el('p', 'DECISION TRAIL', 'eyebrow'), el('h2', `${lead.first_name} ${lead.last_name}`.trim() || 'Unnamed contact'), el('p', lead.summary));
  const list = el('dl');
  for (const [label, value] of [['Category', lead.category.replaceAll('_', ' ')], ['Email', lead.email || 'Not supplied'], ['Phone', `${lead.phone}${lead.phone_extension ? ` ext ${lead.phone_extension}` : ''}` || 'Not supplied'], ['Rules', lead.rules_version]]) list.append(el('dt', label), el('dd', value));
  detail.append(list, el('h3', `Priority score · ${lead.lead_score}/100`));
  const scores = el('ul');
  for (const item of lead.score_breakdown) { const entry = el('li'), line = el('div', null, 'score-line'); line.append(el('span', item.rule.replaceAll('_', ' ')), el('b', `+${item.points}`)); entry.append(line, el('span', item.reason)); scores.append(entry); }
  if (lead.raw_score > 100) scores.append(el('li', `Raw score ${lead.raw_score}; capped at 100.`));
  detail.append(scores, el('h3', 'Data quality'));
  const flags = el('ul'); for (const flag of lead.flags) flags.append(el('li', `${flag.severity.toUpperCase()}${flag.field ? ` · ${flag.field}` : ''}: ${flag.message}`));
  if (!lead.flags.length) flags.append(el('li', 'No flags.'));
  for (const match of lead.duplicate_matches) flags.append(el('li', `Possible duplicate of ${match.lead_id}: ${match.reason.replaceAll('_', ' ')}`));
  detail.append(flags, el('h3', 'Tags'), el('p', lead.tags.join(' · '), 'tags'));
}
function process(nextRecords = records, nextRules = rules, nextExisting = existing) {
  const next = processLeads(nextRecords, nextRules, { existing: nextExisting });
  records = nextRecords; rules = nextRules; existing = nextExisting; result = next;
  $('existing-count').textContent = existing.length ? `${existing.length} existing contacts checked` : 'No existing contact list';
  render(); message(`${result.stats.total} processed · ${result.stats.duplicates} likely duplicates · ${result.stats.ready} eligible for CRM import.`);
}
async function fileRecords(file) {
  if (!file) return null;
  if (file.size > 2 * 1024 * 1024) throw new Error('File exceeds the 2 MB limit.');
  const text = await file.text();
  const data = file.name.toLowerCase().endsWith('.csv') ? parseCSV(text) : JSON.parse(text);
  const leads = Array.isArray(data) ? data : [data];
  if (leads.length > MAX_LEADS) throw new Error(`Limit: ${MAX_LEADS} contacts.`);
  return leads;
}
$('sample').addEventListener('click', async () => { try { const response = await fetch('/samples/leads.csv'); if (!response.ok) throw new Error('Could not load samples.'); selected = null; process(parseCSV(await response.text())); } catch (error) { message(error.message, true); } });
$('import').addEventListener('change', async event => { try { const data = await fileRecords(event.target.files[0]); if (data) { selected = null; process(data); } } catch (error) { message(error.message, true); } finally { event.target.value = ''; } });
$('existing').addEventListener('change', async event => { try { const data = await fileRecords(event.target.files[0]); if (data) { if (records.length) process(records, rules, data); else { processLeads([{}], rules, { existing: data }); existing = data; $('existing-count').textContent = `${data.length} existing contacts checked`; message('Existing contacts loaded. Import a batch or add a lead.'); } } } catch (error) { message(error.message, true); } finally { event.target.value = ''; } });
$('lead-form').addEventListener('submit', event => { event.preventDefault(); try { process([...records, Object.fromEntries(new FormData(event.target))]); event.target.reset(); } catch (error) { message(error.message, true); } });
$('filter').addEventListener('change', render);
$('export-csv').addEventListener('click', () => download('crm-ready.csv', toCSV(result.crm_ready, CRM_FIELDS), 'text/csv'));
$('export-json').addEventListener('click', () => download('processed-leads.json', JSON.stringify(result, null, 2), 'application/json'));
$('export-review').addEventListener('click', () => download('review-queue.csv', toCSV(result.leads.filter(lead => lead.status !== 'ready_for_crm'), [...CRM_FIELDS, 'flags', 'duplicate_matches']), 'text/csv'));
$('apply-rules').addEventListener('click', () => { try { const next = validateRules(JSON.parse($('rules').value)); if (records.length) process(records, next); else { rules = next; message('Rules applied.'); } } catch (error) { message(error.message, true); } });
$('save-rules').addEventListener('click', () => download('rules.json', JSON.stringify(rules, null, 2), 'application/json'));
try {
  const response = await fetch('/config/rules.json'); if (!response.ok) throw new Error('Could not load rules.');
  rules = validateRules(await response.json()); $('rules').value = JSON.stringify(rules, null, 2);
  for (const id of ['sample', 'add-lead', 'apply-rules', 'save-rules']) $(id).disabled = false;
  message('Ready. Load the sample batch, import a file, or add a lead.');
} catch (error) { message(error.message, true); }
