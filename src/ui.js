import {STAGES, RESPONSE_EXEMPT, today} from './model.js';
export const $ = (selector, root=document) => root.querySelector(selector);
export function el(tag, attributes={}, ...children) {
  const node = document.createElement(tag);
  for (const [key,value] of Object.entries(attributes)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2),value);
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
export function notify(message, error=false) {
  const node = $('#feedback'); node.textContent = message; node.classList.toggle('error',error);
}
// Personal settings live in the gitignored config.js (copy config.example.js); without it the list starts empty.
const config = await import('../config.js').catch(() => ({}));
export const EMAIL_CHOICES = (Array.isArray(config.EMAIL_CHOICES) ? config.EMAIL_CHOICES : []).filter(email => typeof email === 'string' && email.trim()).map(email => email.trim());
export function emailSelect(attributes={}, value='') {
  const choices = [...EMAIL_CHOICES];
  // Keep older saved addresses editable without silently replacing them.
  if (value && !choices.includes(value)) choices.push(value);
  const select = el('select',attributes,el('option',{value:''},'Choose email…'),choices.map(email=>el('option',{value:email},email)));
  select.value=value; return select;
}
export const stageClass = stage => `stage-${STAGES.indexOf(stage)}`;
const labels = {company:'Company',position:'Position',location:'Job location',jobUrl:'Job URL',source:'Source',jobId:'Job / requisition ID',stage:'Stage',email:'Email used',appliedDate:'Applied date',responseDate:'Response date',notes:'Notes'};
export function jobForm(record={}, onChange=()=>{}) {
  const form = el('form',{class:'job-form'});
  for (const field of ['company','stage','position','location','email','appliedDate','responseDate','jobUrl','source','jobId','notes']) {
    const attrs = {name:field,id:`field-${field}`, 'aria-label':labels[field]}; let input;
    if (field === 'stage') input = el('select',attrs,STAGES.map(s => el('option',{value:s},s)));
    else if (field === 'email') input = emailSelect(attrs,record.email || '');
    else if (field === 'notes') input = el('textarea',{...attrs,rows:'4',maxlength:'30000',placeholder:'Follow-ups, interview notes, or anything to remember…'});
    else input = el('input',{...attrs,type:field.endsWith('Date') ? 'date' : field === 'jobUrl' ? 'url' : field === 'email' ? 'email' : 'text',maxlength:'3000',placeholder:field === 'jobUrl' ? 'https://…' : field === 'company' ? 'Company name' : field === 'position' ? 'Job title' : '',list:field === 'location' ? 'saved-locations' : null,autocomplete:'off'});
    input.value = record[field] ?? (field === 'stage' ? 'To apply' : field === 'appliedDate' ? today() : '');
    const label = el('label',{class:['notes','jobUrl','position'].includes(field) ? 'wide' : ''},el('span',{},labels[field]),input);
    form.append(label);
  }
  form.addEventListener('input',onChange);
  form.addEventListener('change',event => {
    if (event.target.name === 'stage' && event.target.value === 'Applied' && !form.elements.appliedDate.value) form.elements.appliedDate.value = today();
    if (event.target.name === 'stage' && record.id) form.elements.responseDate.value = event.target.value !== record.stage && !RESPONSE_EXEMPT.includes(event.target.value) ? today() : record.responseDate || '';
    onChange();
  });
  return form;
}
export const formFields = form => Object.fromEntries(new FormData(form));
export function changedFields(before, after) { return Object.fromEntries(Object.entries(after).filter(([key,value]) => value !== (before?.[key] || ''))); }
export function locationOptions(state) {
  const choices = [...new Map(state.records.map(r=>r.location?.trim()).filter(Boolean).map(value=>[value.toLocaleLowerCase(),value])).values()].sort((a,b)=>a.localeCompare(b));
  let list = $('#saved-locations');
  const signature = JSON.stringify(choices);
  if (list?.dataset.choices === signature) return;
  if (!list) {list=el('datalist',{id:'saved-locations'});document.body.append(list);}
  list.replaceChildren(...choices.map(value=>el('option',{value})));
  list.dataset.choices=signature;
}
export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text],{type}));
  const link = el('a',{href:url,download:name}); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
