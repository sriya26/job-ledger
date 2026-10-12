export const STAGES = ['To apply', 'Applied', 'Assessment', 'Interview', 'Offer', 'Rejected', 'Withdrawn'];
export const FIELDS = ['company', 'position', 'location', 'jobUrl', 'source', 'jobId', 'stage', 'email', 'appliedDate', 'responseDate', 'notes'];
export const SCHEMA_VERSION = 1;
export const RESPONSE_EXEMPT = ['To apply', 'Applied'];
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const safeUrl = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
export function normalizedUrl(value) {
  const safe = safeUrl(value); if (!safe) return '';
  const u = new URL(safe);
  for (const key of [...u.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid|trk|trackingId)$/i.test(key)) u.searchParams.delete(key);
  u.searchParams.sort(); u.pathname = u.pathname.replace(/\/$/, '') || '/';
  // Preserve fragments: some application sites use hash routing and job identifiers.
  return u.href;
}
export function validDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === value;
}
export function cleanFields(input) {
  const result = {};
  for (const field of FIELDS) if (Object.hasOwn(input, field)) {
    if (typeof input[field] !== 'string') throw new Error(`${field} must be text.`);
    result[field] = input[field].trim();
    if (result[field].length > (field === 'notes' ? 30000 : 3000)) throw new Error(`${field} is too long.`);
  }
  if (result.stage !== undefined && !STAGES.includes(result.stage)) throw new Error('Choose a valid stage.');
  for (const field of ['appliedDate','responseDate']) if (result[field] !== undefined && !validDate(result[field])) throw new Error(`${field} must be a real calendar date.`);
  if (result.jobUrl && !safeUrl(result.jobUrl)) throw new Error('Job URL must start with https:// or http://.');
  return result;
}
export function makeRecord(input, previous) {
  const fields = cleanFields(input);
  const record = {...Object.fromEntries(FIELDS.map(key => [key, ''])), stage: 'To apply', ...previous, ...fields};
  if (!record.company && !record.position) throw new Error('Enter at least a company or a position.');
  if (!record.appliedDate && (!previous || (record.stage === 'Applied' && previous.stage !== 'Applied'))) record.appliedDate = today();
  // A move past Applied is a response; a response date typed in the same edit wins.
  const typedResponse = Object.hasOwn(fields, 'responseDate') && fields.responseDate !== (previous?.responseDate || '');
  if (previous && record.stage !== previous.stage && !RESPONSE_EXEMPT.includes(record.stage) && !typedResponse) record.responseDate = today();
  const now = new Date().toISOString();
  record.id = previous?.id || crypto.randomUUID(); record.createdAt = previous?.createdAt || now; record.updatedAt = now;
  return record;
}
const fold = text => (text || '').toLowerCase().replace(/\s+/g,' ').trim();
export function duplicateKind(a, b) {
  if (a.jobId && b.jobId && a.jobId !== b.jobId) return null;
  const sameUrl = normalizedUrl(a.jobUrl) && normalizedUrl(a.jobUrl) === normalizedUrl(b.jobUrl);
  const sameCompany = fold(a.company) && fold(a.company) === fold(b.company);
  // ATS requisition IDs are scoped to an employer, not to the whole platform.
  if (sameUrl || (a.jobId && a.jobId === b.jobId && sameCompany && fold(a.source) === fold(b.source))) return 'exact';
  if (sameCompany && fold(a.position) && fold(a.position) === fold(b.position)) return 'possible';
  return null;
}
export function findDuplicates(records, candidate) {
  return records.filter(r => r.id !== candidate.id).map(record => ({record, kind: duplicateKind(record,candidate)})).filter(d => d.kind);
}
export function parseBackup(raw, existing = []) {
  if (!raw || raw.schemaVersion !== SCHEMA_VERSION || !Array.isArray(raw.records)) throw new Error('Choose a Job Ledger JSON backup with schemaVersion 1 and a records array.');
  if (raw.records.length > 20000) throw new Error('Import is limited to 20,000 records at a time.');
  const valid = [], invalid = [], duplicates = [], ids = new Set();
  raw.records.forEach((item, index) => {
    try {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Record must be an object.');
      const fields = cleanFields(item);
      if (!fields.company && !fields.position) throw new Error('Missing company and position.');
      if (typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id)) throw new Error('Missing or invalid record ID.');
      if (ids.has(item.id)) throw new Error('Repeated record ID in backup.');
      for (const key of ['createdAt','updatedAt']) if (typeof item[key] !== 'string' || Number.isNaN(Date.parse(item[key]))) throw new Error(`Invalid ${key}.`);
      const record = {...Object.fromEntries(FIELDS.map(key => [key, ''])), stage:'To apply', ...fields, id: item.id, createdAt:item.createdAt, updatedAt:item.updatedAt};
      ids.add(record.id);
      if (existing.some(r => r.id === record.id) || findDuplicates([...existing, ...valid],record).length) duplicates.push(index+1);
      valid.push(record);
    } catch (error) { invalid.push({row: index+1, reason: error.message}); }
  });
  return {valid, invalid, duplicates};
}
export function mergeRecords(existing, incoming) {
  const records = [...existing]; let skipped = 0;
  for (const record of incoming) {
    if (records.some(r => r.id === record.id || duplicateKind(r,record) === 'exact')) { skipped++; continue; }
    records.push(record);
  }
  return {records, skipped};
}
export function csvExport(records) {
  const columns = ['id', ...FIELDS, 'createdAt','updatedAt'];
  const cell = v => { let s = String(v ?? ''); if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"','""')}"`; };
  return '\uFEFF' + [columns, ...records.map(r => columns.map(c => r[c]))].map(row => row.map(cell).join(',')).join('\r\n');
}
export function visibleRecords(records, {search='', stage='', location='', email='', sort='newest'}={}) {
  const needle = fold(search);
  return records.filter(r => (!needle || [r.company,r.position,r.location,r.notes].some(v => fold(v).includes(needle))) && (!stage || (stage==='in-process' ? ['Assessment','Interview'].includes(r.stage) : r.stage === stage)) && (!location || r.location === location) && (!email || r.email === email)).sort((a,b) => {
    const normalized = ({newest:'createdAt:desc',company:'company:asc',stage:'stage:asc',applied:'appliedDate:desc'})[sort] || sort;
    const [requestedField,direction] = normalized.split(':');
    const field = [...FIELDS,'createdAt'].includes(requestedField) ? requestedField : 'createdAt';
    const left = a[field] || '', right = b[field] || '';
    // Empty dates and optional fields stay at the bottom in either direction.
    if (!left || !right) return left ? -1 : right ? 1 : 0;
    const comparison = field === 'stage' ? STAGES.indexOf(left)-STAGES.indexOf(right) : left.localeCompare(right,undefined,{numeric:true,sensitivity:'base'});
    return comparison * (direction === 'asc' ? 1 : -1);
  });
}
