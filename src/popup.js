import {selectEmbeddedJob} from './capture.js';
import {extractJob} from './extract.js';
import {readState,request} from './store.js';
import {findDuplicates,today} from './model.js';
import {$,el,notify,jobForm,formFields,changedFields,locationOptions} from './ui.js';
let state, form, original, recordId, draftKey='draft:popup', activeTab, busy=false, draftQueue=Promise.resolve(), duplicateSignature='';
const showError = error => notify(error.message,true);
function persistDraft() {
  const value = {fields:formFields(form),recordId,original};
  draftQueue = draftQueue.then(() => request({type:'draft',key:draftKey,value})).catch(showError);
}
function mount(fields={}, existing=null) {
  original = existing; recordId = existing?.id;
  form = jobForm(fields,() => { persistDraft(); showDuplicates(); }); form.id = 'capture-form';
  form.addEventListener('submit',save); $('#form-host').replaceChildren(form);
  $('#save').textContent = recordId ? 'Update application' : 'Save application';
  showDuplicates();
}
function showDuplicates() {
  const container = $('#duplicates');
  const matches = findDuplicates(state.records,{...formFields(form),id:recordId});
  const signature = JSON.stringify(matches);
  if (signature === duplicateSignature) return;
  duplicateSignature = signature; container.replaceChildren();
  container.hidden = !matches.length;
  if (matches.length) {
    container.append(el('strong',{},'This job may already be in your tracker.'));
    for (const {record,kind} of matches.slice(0,3)) container.append(el('div',{},`${record.company} · ${record.position} (${kind === 'exact' ? 'matching job' : 'possible duplicate'})`,el('button',{type:'button',onclick:() => { mount(record,record); persistDraft(); notify('Existing application loaded.'); }},'Load existing'),el('button',{type:'button',onclick:() => chrome.tabs.create({url:chrome.runtime.getURL(`dashboard.html#${encodeURIComponent(record.id)}`)})},'Open')));
  }
}
async function save(event) {
  event.preventDefault(); if (busy || !form.reportValidity()) return;
  busy=true; $('#save').disabled=true;
  try {
    await draftQueue;
    const fields = recordId ? changedFields(original,formFields(form)) : formFields(form);
    let result = await request({type:'save',id:recordId,fields,draftKey});
    if (result.duplicates) {
      if (!confirm('A matching or similar application exists. Save this as a separate application? Choose Cancel to load the existing record.')) return;
      result = await request({type:'save',fields,draftKey,allowDuplicate:true});
    }
    state = await readState(); mount(result.record,result.record); locationOptions(state); notify('Saved to your dashboard.');
  } catch(error) { showError(error); } finally { busy=false; $('#save').disabled=false; }
}
$('#dashboard').addEventListener('click',() => chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')}));
$('#clear').addEventListener('click',async () => {
  if (Object.entries(formFields(form)).some(([key,value]) => value && value !== ({stage:'To apply',email:'',appliedDate:today()}[key] || '')) && !confirm('Clear this preview and start a new application? Saved applications will remain.')) return;
  mount({email:''}); persistDraft(); $('#capture-info').textContent='Enter details manually or capture the current job page.'; notify('New application');
});
async function capture() {
  if (busy) return;
  if ((form.elements.company.value || form.elements.position.value) && !confirm('Replace this preview with details from the current page? Saved applications will remain.')) return;
  busy=true; $('#capture').disabled=true; notify('Reading this page…');
  try {
    if (!activeTab?.id || !/^https?:/.test(activeTab.url || '')) throw new Error('Capture works on web pages. Open a job listing, or enter the details manually below.');
    const results = await chrome.scripting.executeScript({target:{tabId:activeTab.id},func:extractJob});
    let data = results[0]?.result; if (!data) throw new Error('No readable job details found. You can enter them manually.');
    if (data.embeddedGreenhouse?.length) {
      const origins=[...new Set(data.embeddedGreenhouse.map(frame=>frame.origin))];
      if (!(await chrome.permissions.contains({origins}))) {
        mount({jobUrl:data.jobUrl,source:'Greenhouse',jobId:data.embeddedGreenhouse[0].jobId,email:''});
        const enable=el('button',{type:'button',class:'primary',onclick:async()=>{
          try {
            // Invoke directly from the user's click so Chrome can show its permission prompt.
            const granted=await chrome.permissions.request({origins});
            if(granted)await capture();else notify('Permission not granted. Open the job directly on Greenhouse or enter details manually.',true);
          }catch(error){showError(error);}
        }},'Enable embedded Greenhouse capture');
        $('#capture-info').replaceChildren(document.createTextNode('This job is inside a Greenhouse frame. Allow access to read its company and role. '),enable);
        notify('Greenhouse page permission needed.'); return;
      }
      const frames=await chrome.scripting.executeScript({target:{tabId:activeTab.id,allFrames:true},func:extractJob});
      data=selectEmbeddedJob(data,frames.map(frame=>frame.result));
    }
    mount({...data,email:''});
    $('#capture-info').textContent = `${data.method}. ${data.multiple ? 'Multiple jobs found; open a single listing for a better capture. ' : ''}${data.review}`;
    persistDraft(); notify('Captured. Review before saving.');
  } catch(error) { notify(`${error.message} You can still enter details manually.`,true); } finally { busy=false; $('#capture').disabled=false; }
}
$('#capture').addEventListener('click',capture);
async function init() {
  try {
    [state,[activeTab]] = await Promise.all([readState(),chrome.tabs.query({active:true,currentWindow:true})]);
    draftKey = `draft:popup:${activeTab?.id || 'manual'}`;
    const draft = state.drafts[draftKey];
    mount(draft?.fields || {email:''},draft?.original || null);
    locationOptions(state);
    if (draft) notify('Unsaved preview restored.');
    chrome.storage.onChanged.addListener(async (changes,area) => { if (area==='local' && changes.ledger) { try { state=await readState(); locationOptions(state); showDuplicates(); } catch(error) { showError(error); } } });
  } catch(error) { showError(error); $('#capture').disabled=true; $('#save').disabled=true; }
}
init();
