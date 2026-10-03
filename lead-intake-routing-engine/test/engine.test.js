import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { processLeads, normalizePhone, validateRules } from '../src/engine.js';
import { parseCSV } from '../src/csv.js';
const rules = JSON.parse(readFileSync(new URL('../config/rules.json', import.meta.url), 'utf8'));
const base = () => ({ first_name: 'Avery', last_name: 'Morgan', company: 'Example Ridge Plumbing', email: 'avery@example.com', phone: '3125550101', lead_source: 'referral', service_interest: 'Plumbing intake', estimated_value: '12500', urgency: 'high' });
const run = (rows, config = rules, options) => processLeads(rows, config, options);

test('normalization preserves names and supplied optional fields without inventing demographics', () => {
  const raw = { ...base(), first_name: '  Ana   María ', last_name: "de la Cruz", company: ' Example  Ridge Plumbing ', email: ' AVERY@EXAMPLE.COM ', phone: '(312) 555-0101 ext. 42', estimated_value: '$12,500.00', gender: 'self-described', spouse: 'Taylor', 'Info Field 1': ' two   locations ' };
  const lead = run([raw]).leads[0];
  assert.equal(lead.first_name, 'Ana María'); assert.equal(lead.last_name, 'de la Cruz');
  assert.equal(lead.company, 'Example Ridge Plumbing'); assert.equal(lead.email, 'avery@example.com');
  assert.equal(lead.phone, '+13125550101'); assert.equal(lead.phone_extension, '42');
  assert.equal(lead.estimated_value, 12500); assert.equal(lead.spouse_partner, 'Taylor'); assert.equal(lead.gender, 'self-described');
  assert.equal(lead.info_field_1, 'two locations');
  assert.equal(run([base()]).leads[0].gender, ''); assert.equal(run([base()]).leads[0].spouse_partner, '');
  assert.equal(raw.first_name, '  Ana   María ');
});

test('default scoring is explainable and routing excludes protected fields', () => {
  const normal = run([base()]).leads[0];
  const changed = run([{ ...base(), gender: 'different', spouse_partner: 'Someone', info_field_1: 'hotel', title: 'restaurant', notes: 'boutique' }]).leads[0];
  assert.equal(normal.lead_score, 100); assert.equal(normal.score_breakdown.reduce((s, x) => s + x.points, 0), 100);
  assert.equal(normal.assignment, 'Home services sales');
  assert.equal(changed.lead_score, normal.lead_score); assert.equal(changed.category, normal.category); assert.equal(changed.assignment, normal.assignment);
});

test('exact duplicate emails and normalized phones are held rather than merged or exported', () => {
  const result = run([base(), { ...base(), first_name: 'Other', email: 'AVERY@EXAMPLE.COM', phone: '(312) 555-0101' }]);
  assert.equal(result.stats.duplicates, 1); assert.equal(result.crm_ready.length, 1);
  assert.equal(result.leads[1].status, 'needs_review'); assert.equal(result.leads[1].assignment, 'Intake review');
  assert.deepEqual(result.leads[1].duplicate_matches.map(x => x.reason), ['same_email', 'same_phone']);
});

test('name and company candidates need full names; shared phones and extensions are conservative', () => {
  const result = run([base(), { ...base(), email: 'second@example.org', phone: '3125550102', company: 'example ridge plumbing' }]);
  assert.equal(result.leads[1].duplicate_matches[0].reason, 'same_name_company');
  const extensions = run([{ ...base(), phone: '3125550101 x11' }, { ...base(), first_name: 'Other', email: 'other@example.org', phone: '3125550101 x12' }]);
  assert.equal(extensions.stats.duplicates, 0);
  const sharedPhone = run([base(), { ...base(), first_name: 'Other', email: 'other@example.org' }]);
  assert.equal(sharedPhone.stats.duplicates, 1);
  const missingName = run([{ ...base(), first_name: '', phone: '' }, { ...base(), first_name: '', email: 'other@example.org', phone: '' }]);
  assert.equal(missingName.stats.duplicates, 0);
});

test('an existing contact inventory identifies duplicates across imports', () => {
  const result = run([base()], rules, { existing: [base()] });
  assert.equal(result.crm_ready.length, 0); assert.equal(result.leads[0].duplicate_matches[0].lead_id, 'existing-0001');
});

test('invalid email, invalid phone and missing contact are quarantined', () => {
  for (const email of ['a..b@example.com', '.a@example.com', 'a.@example.com', 'name@localhost', 'x@-example.com', 'a@@example.com', 'https://example.com']) {
    const lead = run([{ ...base(), email }]).leads[0]; assert.equal(lead.status, 'invalid', email);
  }
  for (const phone of ['555', 'call me', '12+34567890', '1234567890']) assert.equal(run([{ ...base(), phone }]).leads[0].status, 'invalid', phone);
  assert.equal(run([{ ...base(), email: '', phone: '' }]).leads[0].status, 'invalid');
  assert.equal(run([{ ...base(), email: '', phone: '3125550101' }]).leads[0].status, 'ready_for_crm');
});

test('international phone syntax and US defaults are explicit', () => {
  assert.equal(normalizePhone('+44 20 5550 0101').phone, '+442055500101');
  assert.equal(normalizePhone('020 5550 0101').valid, false);
  assert.equal(normalizePhone('+000000000').valid, false);
  assert.equal(normalizePhone('13125550101').phone, '+13125550101');
});

test('currency parsing rejects misleading amounts and never uses partial numeric parsing', () => {
  for (const estimated_value of ['-10', 'NaN', 'Infinity', '1e4', '500USD', '€500', '$5,00', '1.999', '9'.repeat(30)]) {
    const lead = run([{ ...base(), estimated_value }]).leads[0]; assert.equal(lead.status, 'invalid', estimated_value); assert.equal(lead.estimated_value, null);
  }
  assert.equal(run([{ ...base(), estimated_value: 0 }]).leads[0].estimated_value, 0);
  assert.equal(run([{ ...base(), estimated_value: '' }]).leads[0].status, 'ready_for_crm');
});

test('suspicious formulas and unverified links require review', () => {
  for (const notes of ['=SUM(1,2)', '+formula', '@lookup', '-formula', 'Visit https://example.com']) {
    const result = run([{ ...base(), notes }]); assert.equal(result.leads[0].status, 'needs_review'); assert.equal(result.crm_ready.length, 0);
  }
});

test('keyword boundaries prevent partial matches and ties require category review', () => {
  const general = run([{ ...base(), company: 'Example Acme', service_interest: 'retailer relationship management' }]).leads[0];
  assert.equal(general.category, 'general'); assert.equal(general.assignment, 'General sales');
  const ambiguous = run([{ ...base(), company: 'Example Acme', service_interest: 'retail and plumbing' }]).leads[0];
  assert.equal(ambiguous.category, 'general'); assert.equal(ambiguous.status, 'needs_review');
  const custom = structuredClone(rules); custom.categories[0].keywords = ['service (a+b)'];
  assert.equal(run([{ ...base(), company: 'Example Acme', service_interest: 'service (a+b)' }], custom).leads[0].category, 'home_services');
});

test('configurable scoring is capped; unknown sources cannot inherit object properties', () => {
  const custom = structuredClone(rules); custom.contact_points.email = 100; custom.default_assignment = 'New queue';
  const lead = run([base()], custom).leads[0]; assert.equal(lead.lead_score, 100); assert.ok(lead.raw_score > 100);
  const weird = run([{ ...base(), lead_source: 'constructor' }]).leads[0]; assert.equal(weird.score_breakdown.at(-1).points, 0);
  const unknown = run([{ ...base(), urgency: 'immediate' }]).leads[0]; assert.equal(unknown.status, 'invalid'); assert.equal(unknown.score_breakdown.find(x => x.rule === 'urgency').points, 0);
});

test('source tags cannot impersonate calculated tags', () => {
  const lead = run([{ ...base(), estimated_value: 0, urgency: 'low', tags: ['priority:high', 'high-value', 'original', 'original'] }]).leads[0];
  assert.ok(!lead.tags.includes('high-value')); assert.ok(lead.tags.includes(`priority:${lead.priority}`)); assert.ok(lead.tags.includes('original'));
  assert.equal(lead.tags.filter(x => x === 'original').length, 1); assert.ok(lead.flags.some(x => x.code === 'reserved_tag'));
});

test('rules fail early for invalid points, currency, duplicate bands and malformed groups', () => {
  for (const modify of [r => { r.contact_points.email = -1; }, r => { r.urgency_points.high = '25'; }, r => { r.currency = 'EUR'; }, r => { r.categories[0].keywords = []; }, r => { r.categories.push(r.categories[0]); }, r => { r.value_bands.push(r.value_bands[0]); }, r => { r.priority_thresholds.medium = 90; }, r => { r.source_points = null; }]) {
    const custom = structuredClone(rules); modify(custom); assert.throws(() => validateRules(custom), /Invalid rules/);
  }
});

test('input shape, batch limits, colliding aliases and overlong cells fail without partial results', () => {
  for (const rows of [[], {}, [null], ['text'], [{ email: {} }], [{ tags: [1] }], [{ email: 'a'.repeat(4001) }], [{ first_name: 'A', 'First Name': 'B' }], Array.from({ length: 2001 }, base)]) assert.throws(() => run(rows));
});

test('synthetic batch yields reproducible ready/review/invalid totals', () => {
  const leads = parseCSV(readFileSync(new URL('../samples/leads.csv', import.meta.url), 'utf8'));
  const result = run(leads);
  assert.deepEqual(result.stats, { total: 12, ready: 5, review: 4, invalid: 3, duplicates: 2 });
  assert.deepEqual(result, run(leads));
  assert.ok(result.crm_ready.every(lead => lead.status === 'ready_for_crm'));
  assert.equal(result.leads[1].gender, 'nonbinary');
});
