/** Small strict CSV reader: quoted commas, escaped quotes, BOM, CRLF and multiline cells. */
export function parseCSV(text) {
  if (typeof text !== 'string') throw new Error('CSV input must be text.');
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false, started = false;
  const pushCell = () => { row.push(cell); cell = ''; closed = false; started = false; };
  const pushRow = () => { pushCell(); if (row.some(value => value.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === ',') pushCell();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else if (closed) throw new Error('Unexpected text after a closing CSV quote.');
    else if (c === '"') { if (started) throw new Error('Unexpected quote in an unquoted CSV cell.'); quoted = true; started = true; }
    else { cell += c; started = true; }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (cell || row.length || closed) pushRow();
  if (!rows.length) throw new Error('CSV is empty.');
  const headers = rows.shift().map(value => value.trim());
  if (headers.some(value => !value)) throw new Error('CSV headers cannot be empty.');
  if (new Set(headers.map(value => value.toLowerCase())).size !== headers.length) throw new Error('Duplicate CSV headers.');
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Data row ${index + 1} has ${values.length} cells; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}

/** CSV quoting alone does not prevent spreadsheet formula execution. */
export function safeCell(value) {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const safe = /^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toCSV(records, fields) {
  return [fields.map(safeCell).join(','), ...records.map(row => fields.map(field => safeCell(row[field])).join(','))].join('\r\n') + '\r\n';
}
