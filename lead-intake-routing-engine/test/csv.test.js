import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, toCSV, safeCell } from '../src/csv.js';

test('reads BOM, CRLF, quoted commas, quotes and multiline cells', () => {
  assert.deepEqual(parseCSV('\uFEFFfirst_name,notes\r\nAvery,"hello, ""friend""\nnext line"\r\n'), [{ first_name: 'Avery', notes: 'hello, "friend"\nnext line' }]);
});
test('rejects malformed rows and headers instead of silently shifting fields', () => {
  for (const text of ['', 'a,,b\n1,2,3', 'a,A\n1,2', 'a,b\n1', 'a,b\n1,2,3', 'a\n"unclosed', 'a\n"x"tail', 'a\nquote"inside']) assert.throws(() => parseCSV(text));
});
test('exports exact field order, escaped data and safe spreadsheet cells', () => {
  const csv = toCSV([{ a: 'hello, "friend"', b: '=SUM(1,2)', c: ['pilot', 'owner'] }], ['a', 'b', 'c']);
  assert.deepEqual(parseCSV(csv), [{ a: 'hello, "friend"', b: "'=SUM(1,2)", c: '["pilot","owner"]' }]);
  for (const text of ['=1+1', '+13125550101', '@lookup', '-2', '\t=1', '  =1', '\r=1', '\uFEFF=1']) assert.ok(safeCell(text).startsWith('"\''));
});
test('trailing empty fields and empty export bodies are valid', () => {
  assert.deepEqual(parseCSV('a,b\nx,'), [{ a: 'x', b: '' }]);
  assert.deepEqual(parseCSV(toCSV([], ['a', 'b'])), []);
});
