export const INPUT_FIELDS = ['first_name', 'last_name', 'title', 'company', 'gender', 'spouse_partner', 'email', 'phone', 'location', 'lead_source', 'service_interest', 'estimated_value', 'urgency', 'notes', 'info_field_1', 'info_field_2', 'info_field_3', 'info_field_4', 'tags'];
export const CRM_FIELDS = ['lead_id', ...INPUT_FIELDS, 'phone_extension', 'category', 'lead_score', 'priority', 'assignment', 'status', 'summary'];
export const MAX_LEADS = 2000;
const ALIASES = { spouse: 'spouse_partner', partner: 'spouse_partner', spouse_partner_field: 'spouse_partner', source: 'lead_source', 'e_mail': 'email' };
const clean = value => String(value ?? '').normalize('NFKC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/gu, ' ').trim();
const key = value => clean(value).toLowerCase().replace(/[\s/\-]+/g, '_');
const fold = value => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const validEmail = value => value.length <= 254 && /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(value) && !value.split('@')[0].includes('..') && !value.startsWith('.') && !value.split('@')[0].endsWith('.');
const issue = (code, severity, field, message) => ({ code, severity, field, message });

export function validateRules(rules) {
  const fail = message => { throw new Error(`Invalid rules: ${message}`); };
  const obj = value => value && typeof value === 'object' && !Array.isArray(value);
  const label = value => typeof value === 'string' && !!value.trim() && value.length <= 100;
  const points = value => Number.isInteger(value) && value >= 0 && value <= 100;
  if (!obj(rules)) fail('expected a configuration object.');
  if (!label(rules.version) || rules.currency !== 'USD') fail('version is required; this version supports USD only.');
  if (!label(rules.default_assignment) || !label(rules.review_assignment)) fail('assignment names are required.');
  if (!Array.isArray(rules.categories) || !rules.categories.length) fail('categories must be a nonempty array.');
  const names = new Set();
  for (const category of rules.categories) {
    if (!obj(category) || !/^[a-z][a-z0-9_]*$/.test(category.name) || category.name === 'general' || names.has(category.name)) fail('category names must be unique slugs, excluding general.');
    names.add(category.name);
    if (!label(category.label) || !label(category.assignment) || !points(category.points)) fail('each category needs a label, assignment and nonnegative integer points.');
    if (!Array.isArray(category.keywords) || !category.keywords.length || category.keywords.some(word => !label(word))) fail('category keywords must be nonempty strings.');
  }
  for (const [group, required] of Object.entries({ contact_points: ['email', 'phone', 'company'], urgency_points: ['high', 'medium', 'low'], source_points: ['other'] })) {
    if (!obj(rules[group]) || required.some(name => !Object.hasOwn(rules[group], name)) || Object.values(rules[group]).some(value => !points(value))) fail(`${group} has invalid or missing points.`);
  }
  if (!Array.isArray(rules.value_bands) || !rules.value_bands.length || rules.value_bands.some(band => !obj(band) || !Number.isFinite(band.minimum) || band.minimum < 0 || !points(band.points))) fail('invalid value bands.');
  if (new Set(rules.value_bands.map(band => band.minimum)).size !== rules.value_bands.length || !rules.value_bands.some(band => band.minimum === 0)) fail('value bands need unique minimums and a zero band.');
  if (!obj(rules.priority_thresholds) || !points(rules.priority_thresholds.high) || !points(rules.priority_thresholds.medium) || rules.priority_thresholds.high <= rules.priority_thresholds.medium) fail('high threshold must exceed medium.');
  if (!Number.isFinite(rules.high_value_tag_minimum) || rules.high_value_tag_minimum < 0) fail('invalid high value tag minimum.');
  return rules;
}

export function normalizePhone(input) {
  if (!input) return { phone: '', phone_extension: '', valid: false };
  const match = input.match(/\s*(?:ext\.?|extension|x|#)\s*(\d{1,8})\s*$/i);
  const base = match ? input.slice(0, match.index) : input;
  const digits = base.replace(/\D/g, '');
  if (!/^[+\d\s().-]+$/.test(base) || (base.includes('+') && !base.startsWith('+'))) return { phone: input, phone_extension: '', valid: false };
  let phone = '';
  if (base.startsWith('+') && /^[1-9]\d{7,14}$/.test(digits)) phone = `+${digits}`;
  else if (digits.length === 10 && /^[2-9]/.test(digits) && /^[2-9]/.test(digits.slice(3))) phone = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith('1') && /^[2-9]/.test(digits.slice(1)) && /^[2-9]/.test(digits.slice(4))) phone = `+${digits}`;
  return { phone: phone || input, phone_extension: match?.[1] || '', valid: !!phone };
}

function normalize(raw, leadId) {
  const flags = [], fields = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Each lead must be an object.');
  for (const [header, value] of Object.entries(raw)) {
    const canonical = ALIASES[key(header)] || key(header);
    if (!INPUT_FIELDS.includes(canonical)) { flags.push(issue('unknown_field', 'warning', header, 'Unrecognized input field was ignored.')); continue; }
    if (Object.hasOwn(fields, canonical)) throw new Error(`Multiple input fields map to ${canonical}.`);
    if (value != null && !['string', 'number'].includes(typeof value) && !(canonical === 'tags' && Array.isArray(value) && value.every(tag => typeof tag === 'string'))) throw new Error(`${canonical} must be text or a number; tags may also be an array of strings.`);
    if ((Array.isArray(value) ? value.join(';') : String(value ?? '')).length > 4000) throw new Error(`${canonical} exceeds the 4,000 character limit.`);
    fields[canonical] = Array.isArray(value) ? value.join(';') : clean(value);
  }
  const lead = Object.fromEntries(INPUT_FIELDS.map(field => [field, fields[field] || '']));
  lead.lead_id = leadId;
  for (const field of ['first_name', 'last_name']) if (!lead[field]) flags.push(issue('missing_name', 'warning', field, 'Name is incomplete.'));
  lead.email = lead.email.toLowerCase();
  const emailValid = !!lead.email && validEmail(lead.email);
  if (lead.email && !emailValid) flags.push(issue('invalid_email', 'error', 'email', 'Email syntax is invalid.'));
  const phone = normalizePhone(lead.phone);
  lead.phone = phone.phone;
  lead.phone_extension = phone.phone_extension;
  if (lead.phone && !phone.valid) flags.push(issue('invalid_phone', 'error', 'phone', 'Use a 10-digit US number or an explicit international +country code.'));
  if (!emailValid && !phone.valid) flags.push(issue('no_valid_contact', 'error', 'email', 'At least one valid email or phone is required.'));
  for (const field of ['company', 'location', 'lead_source', 'service_interest', 'estimated_value', 'urgency']) if (!lead[field]) flags.push(issue('missing_information', 'warning', field, 'Information was not supplied.'));
  if (lead.estimated_value === '') lead.estimated_value = null;
  else {
    const value = lead.estimated_value;
    // Explicit USD format; reject currency guessing, exponent notation and partial parses.
    if (!/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value) || !Number.isSafeInteger(Math.round(Number(value.replace(/[$,]/g, '')) * 100))) {
      flags.push(issue('invalid_value', 'error', 'estimated_value', 'Expected a nonnegative USD amount, for example 12500 or $12,500.00.'));
      lead.estimated_value = null;
    } else lead.estimated_value = Number(value.replace(/[$,]/g, ''));
  }
  lead.urgency = lead.urgency.toLowerCase();
  if (lead.urgency && !['high', 'medium', 'low'].includes(lead.urgency)) {
    flags.push(issue('invalid_urgency', 'error', 'urgency', 'Urgency must be high, medium or low.'));
    lead.urgency = '';
  }
  for (const [field, value] of Object.entries(lead)) {
    if (typeof value === 'string' && field !== 'phone' && /^[=+@-]/.test(value)) flags.push(issue('suspicious_text', 'review', field, 'Text starts with a spreadsheet formula character; review before use.'));
  }
  if (/https?:\/\//i.test(lead.notes)) flags.push(issue('external_link', 'review', 'notes', 'Notes contain an unverified external link.'));
  const suppliedTags = lead.tags.split(/[;,]/).map(clean).filter(Boolean);
  const reserved = tag => /^(vertical:|priority:|source:|high-value$|duplicate-review$|data-quality$)/i.test(tag);
  if (suppliedTags.some(reserved)) flags.push(issue('reserved_tag', 'warning', 'tags', 'Engine-managed tags were removed from source tags and recalculated.'));
  lead.tags = [...new Set(suppliedTags.filter(tag => !reserved(tag)))];
  return { lead, flags, emailValid, phoneValid: phone.valid };
}

function categorize(lead, rules) {
  // Demographic fields, partner details and notes are deliberately excluded.
  const text = `${lead.company} ${lead.service_interest}`.toLowerCase();
  const matches = rules.categories.map(category => ({ category, hits: category.keywords.filter(word => {
    const escaped = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(text);
  }) })).filter(match => match.hits.length);
  matches.sort((a, b) => b.hits.length - a.hits.length);
  if (!matches.length) return { category: null, ambiguous: false, hits: [] };
  if (matches[1]?.hits.length === matches[0].hits.length) return { category: null, ambiguous: true, hits: matches.flatMap(match => match.hits) };
  return { ...matches[0], ambiguous: false };
}

function score(normalized, classification, rules) {
  const { lead, emailValid, phoneValid } = normalized;
  const breakdown = [];
  const add = (rule, points, reason) => breakdown.push({ rule, points, reason });
  add('email', emailValid ? rules.contact_points.email : 0, emailValid ? 'Valid email syntax' : 'No valid email');
  add('phone', phoneValid ? rules.contact_points.phone : 0, phoneValid ? 'Valid phone syntax' : 'No valid phone');
  add('company', lead.company ? rules.contact_points.company : 0, lead.company ? 'Company supplied' : 'Company missing');
  add('urgency', Object.hasOwn(rules.urgency_points, lead.urgency) ? rules.urgency_points[lead.urgency] : 0, lead.urgency || 'Urgency not supplied');
  const band = [...rules.value_bands].sort((a, b) => b.minimum - a.minimum).find(item => lead.estimated_value !== null && lead.estimated_value >= item.minimum);
  add('estimated_value', band?.points || 0, band ? `Estimated value meets USD ${band.minimum} band` : 'No usable estimate');
  add('service_fit', classification.category?.points || 0, classification.category ? `Keyword match: ${classification.hits.join(', ')}` : classification.ambiguous ? 'Multiple equally strong category matches' : 'No configured category match');
  const source = lead.lead_source.toLowerCase();
  add('lead_source', Object.hasOwn(rules.source_points, source) ? rules.source_points[source] : rules.source_points.other, source || 'Source not supplied');
  const raw_score = breakdown.reduce((total, item) => total + item.points, 0);
  return { lead_score: Math.min(100, raw_score), raw_score, score_breakdown: breakdown };
}

export function processLeads(records, rules, { existing = [] } = {}) {
  validateRules(rules);
  if (!Array.isArray(records) || !Array.isArray(existing)) throw new Error('Leads and existing contacts must be arrays.');
  if (!records.length) throw new Error('Provide at least one lead.');
  if (records.length > MAX_LEADS || existing.length > MAX_LEADS) throw new Error(`Each batch or existing contact list is limited to ${MAX_LEADS} records.`);
  const emailIndex = new Map(), phoneIndex = new Map(), nameCompanyIndex = new Map();
  const signatures = normalized => {
    const { lead, emailValid, phoneValid } = normalized;
    return [[emailIndex, emailValid ? lead.email : '', 'same_email'], [phoneIndex, phoneValid ? `${lead.phone}|${lead.phone_extension}` : '', 'same_phone'], [nameCompanyIndex, lead.first_name && lead.last_name && lead.company ? [lead.first_name, lead.last_name, lead.company].map(fold).join('|') : '', 'same_name_company']];
  };
  const index = normalized => { for (const [map, signature] of signatures(normalized)) if (signature && !map.has(signature)) map.set(signature, normalized.lead.lead_id); };
  existing.forEach((raw, i) => index(normalize(raw, `existing-${String(i + 1).padStart(4, '0')}`)));
  const output = records.map((raw, i) => {
    const normalized = normalize(raw, `lead-${String(i + 1).padStart(4, '0')}`);
    const { lead, flags } = normalized;
    const duplicates = signatures(normalized).filter(([map, signature]) => signature && map.has(signature)).map(([map, signature, reason]) => ({ lead_id: map.get(signature), reason }));
    if (duplicates.length) flags.push(issue('likely_duplicate', 'review', '', 'Matched an earlier lead or supplied existing contact; review rather than creating another contact.'));
    index(normalized);
    const classification = categorize(lead, rules);
    if (classification.ambiguous) flags.push(issue('ambiguous_category', 'review', 'service_interest', 'Equally strong category matches; human review required.'));
    const scoring = score(normalized, classification, rules);
    const priority = scoring.lead_score >= rules.priority_thresholds.high ? 'high' : scoring.lead_score >= rules.priority_thresholds.medium ? 'medium' : 'low';
    const status = flags.some(flag => flag.severity === 'error') ? 'invalid' : flags.some(flag => flag.severity === 'review') ? 'needs_review' : 'ready_for_crm';
    const category = classification.category?.name || 'general';
    const assignment = status === 'ready_for_crm' ? classification.category?.assignment || rules.default_assignment : rules.review_assignment;
    const derivedTags = [`vertical:${category}`, `priority:${priority}`, `source:${lead.lead_source.toLowerCase() || 'unknown'}`];
    if (lead.estimated_value !== null && lead.estimated_value >= rules.high_value_tag_minimum) derivedTags.push('high-value');
    if (duplicates.length) derivedTags.push('duplicate-review');
    if (flags.length) derivedTags.push('data-quality');
    lead.tags = [...new Set([...lead.tags, ...derivedTags])];
    const person = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unnamed contact';
    const summary = `${person}${lead.company ? ` at ${lead.company}` : ''}: ${lead.service_interest || 'interest unspecified'}. ${lead.estimated_value === null ? 'Value unknown' : `Estimated USD ${lead.estimated_value.toLocaleString('en-US')}`}; urgency ${lead.urgency || 'unknown'}. Priority ${priority} (${scoring.lead_score}/100); ${assignment}; ${status}.`;
    return { ...lead, category, ...scoring, priority, assignment, status, summary, flags, duplicate_matches: duplicates, rules_version: rules.version };
  });
  const crm_ready = output.filter(lead => lead.status === 'ready_for_crm').map(lead => Object.fromEntries(CRM_FIELDS.map(field => [field, lead[field]])));
  return { schema_version: '1.0', rules_version: rules.version, currency: rules.currency, stats: { total: output.length, ready: crm_ready.length, review: output.filter(lead => lead.status === 'needs_review').length, invalid: output.filter(lead => lead.status === 'invalid').length, duplicates: output.filter(lead => lead.duplicate_matches.length).length }, leads: output, crm_ready };
}
