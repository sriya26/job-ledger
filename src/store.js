import {SCHEMA_VERSION, makeRecord, findDuplicates, parseBackup, mergeRecords} from './model.js';
export const emptyState = () => ({schemaVersion: SCHEMA_VERSION, records:[], preferences:{}, drafts:{}});
export async function readState(storage = chrome.storage.local) {
  const {ledger} = await storage.get('ledger');
  if (!ledger) return emptyState();
  if (ledger.schemaVersion !== SCHEMA_VERSION) throw new Error('This data was saved by a different version. Update the extension before editing it.');
  return {...emptyState(), ...ledger};
}
export async function mutate(storage, message) {
  const state = await readState(storage); let result = {};
  switch (message.type) {
    case 'save': {
      const previous = message.id ? state.records.find(r => r.id === message.id) : undefined;
      if (message.id && !previous) throw new Error('This application was deleted. Reopen the form to add it again.');
      const record = makeRecord(message.fields,previous);
      if (!previous && !message.allowDuplicate) {
        const duplicates = findDuplicates(state.records,record);
        if (duplicates.length) return {duplicates};
      }
      state.records = previous ? state.records.map(r => r.id === record.id ? record : r) : [...state.records,record];
      delete state.preferences.lastEmail;
      if (message.draftKey) delete state.drafts[message.draftKey];
      result = {record}; break;
    }
    case 'delete': state.records = state.records.filter(r => r.id !== message.id); break;
    case 'draft': {
      if (typeof message.key !== 'string' || !message.key.startsWith('draft:')) throw new Error('Invalid draft key.');
      if (message.value === null) delete state.drafts[message.key];
      else state.drafts[message.key] = message.value;
      break;
    }
    case 'preferences': state.preferences = {...state.preferences, ...message.value}; break;
    case 'import': {
      const parsed = parseBackup(message.backup,state.records);
      if (parsed.invalid.length) throw new Error('Fix invalid rows before importing.');
      if (!['merge','replace'].includes(message.mode)) throw new Error('Choose merge or replace.');
      if (message.mode === 'replace') state.records = parsed.valid;
      else { const merged = mergeRecords(state.records,parsed.valid); state.records = merged.records; result.skipped = merged.skipped; }
      break;
    }
    default: throw new Error('Unknown storage operation.');
  }
  await storage.set({ledger:state}); return result;
}
export async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'Could not save. Reopen the extension and try again.');
  return response.result;
}
