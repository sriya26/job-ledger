import {updateAnalytics} from './analytics.js';
import {STAGES,SCHEMA_VERSION,visibleRecords,safeUrl,csvExport,parseBackup,today} from './model.js';
import {readState,request} from './store.js';
import {$,el,notify,jobForm,formFields,changedFields,locationOptions,emailSelect,stageClass,download} from './ui.js';
const columns = [
  ['number','#',52],['company','Aa  Company',220],['stage','◉  Stage',155],['position','Aa  Position',280],
  ['appliedDate','▦  Applied date',150],['responseDate','▦  Response date',150],['email','@  Email used',240],['location','⌖  Job location',240],['jobUrl','↗  Job URL',260],['notes','≡  Notes',270]
];
let state, detailForm, original=null, detailId=null, panelBusy=false, incoming=null, draftQueue=Promise.resolve(), pendingRender=false;
const draftKey='draft:dashboard';
const reportError = error => notify(error.message,true);
const filters = () => ({search:$('#search').value,stage:$('#stage-filter').value,location:$('#location-filter').value,email:$('#email-filter').value,sort:$('#sort').value});
function selectOptions(id, values, label) {
  const select=$(id), value=select.value;
  select.replaceChildren(el('option',{value:''},label),...values.map(v=>el('option',{value:v},v==='in-process'?'In process':v))); select.value=values.includes(value)?value:'';
}
function render() {
  if (!state) return;
  updateAnalytics(state.records,{openRecord:openEditor,showStage:stage=>{clearFilters();$('#stage-filter').value=stage;switchView('all');render();}});
  selectOptions('#stage-filter',[...STAGES,'in-process'],'All stages');
  selectOptions('#location-filter',[...new Set(state.records.map(r=>r.location).filter(Boolean))].sort(),'All locations');
  selectOptions('#email-filter',[...new Set(state.records.map(r=>r.email).filter(Boolean))].sort(),'All emails');
  const hidden=state.preferences.hiddenColumns || [], visible=columns.filter(([key])=>!hidden.includes(key));
  $('#table-cols').replaceChildren(...visible.map(([, ,width])=>el('col',{style:`width:${width}px`})));
  const currentSort = $('#sort').value;
  $('#table-head').replaceChildren(...visible.map(([key,label])=>{
    const active=currentSort.startsWith(`${key}:`), ascending=currentSort.endsWith(':asc');
    const header=el('th',{scope:'col',class:['company','stage','position'].includes(key)?`pin pin-${key}`:'','aria-sort':active?(ascending?'ascending':'descending'):'none'});
    header.append(key==='number'?document.createTextNode(label):el('button',{class:'column-sort',title:`Sort ${label.replace(/^[^ ]+ +/,'')} ${active&&ascending?'descending':'ascending'}`,onclick:()=>setSort(`${key}:${active&&ascending?'desc':'asc'}`)},label,el('span',{'aria-hidden':'true'},active?(ascending?' ↑':' ↓'):' ↕')));
    return header;
  }));
  const records=visibleRecords(state.records,filters());
  $('#record-count').textContent=`${records.length}${records.length!==state.records.length?` of ${state.records.length}`:''}`;
  $('#table-body').replaceChildren(...records.map((record,index)=>el('tr',{},visible.map(([key])=>tableCell(record,key,index)))));
  const empty=$('#empty'); empty.hidden=records.length>0;
  if (!records.length) empty.replaceChildren(el('div',{class:'empty-symbol'},'▤'),el('h2',{},state.records.length?'No matching applications':'Your next chapter starts here'),el('p',{},state.records.length?'Try another search or clear your filters.':'Capture a job with the extension, or add your first application here.'),el('button',{class:'primary',onclick:()=>state.records.length?clearFilters():openEditor()},state.records.length?'Clear filters':'＋ Add an application'));
  locationOptions(state); renderColumnMenu();
}
function tableCell(record,key,index) {
  const td=el('td',{class:['company','stage','position'].includes(key)?`pin pin-${key}`:key==='number'?'number-cell':''});
  if(key==='number'){td.textContent=index+1;return td;}
  let control;
  if(key==='stage'){control=el('select',{class:`stage ${stageClass(record.stage)}`,'aria-label':`Stage for ${record.company}`},STAGES.map(s=>el('option',{value:s},`● ${s}`)));}
  else if(key==='email')control=emailSelect({'aria-label':`email for ${record.company || record.position}`},record.email || '');
  else control=el('input',{type:key.endsWith('Date')?'date':key==='email'?'email':key==='jobUrl'?'url':'text','aria-label':`${key} for ${record.company || record.position}`,title:record[key] || '',maxlength:key==='notes'?'30000':'3000',list:key==='location'?'saved-locations':null,autocomplete:'off'});
  control.value=record[key] || '';
  if(key.endsWith('Date')&&!record[key])control.classList.add('empty-date');
  control.addEventListener('change',async()=>{
    if(!control.checkValidity()){control.reportValidity();return;}
    const fields={[key]:control.value}; if(key==='stage'&&control.value==='Applied'&&!record.appliedDate)fields.appliedDate=today();
    control.disabled=true;
    try {await request({type:'save',id:record.id,fields});notify('Saved locally.');state=await readState();render();}
    catch(error){reportError(error);control.value=record[key] || '';control.disabled=false;}
  });
  control.addEventListener('keydown',event=>{if(event.key==='Enter')control.blur();if(event.key==='Escape'){control.value=record[key] || '';control.blur();}});
  if(key==='company')td.append(el('div',{class:'company-cell'},el('button',{class:'row-open','aria-label':`Open ${record.company || record.position}`,title:'Open details',onclick:()=>openEditor(record)},'▧'),control));
  else if(key==='jobUrl'){const wrap=el('div',{class:'url-cell'},control);if(safeUrl(record.jobUrl))wrap.append(el('a',{href:safeUrl(record.jobUrl),target:'_blank',rel:'noopener noreferrer','aria-label':`Open job at ${record.company}`},'↗'));td.append(wrap);}
  else td.append(control);
  return td;
}
function renderColumnMenu() {
  $('#columns').replaceChildren(...columns.filter(([key])=>!['company','stage','position'].includes(key)).map(([key,label])=>{
    const input=el('input',{type:'checkbox'});input.checked=!(state.preferences.hiddenColumns||[]).includes(key);
    input.addEventListener('change',async()=>{try{const hidden=new Set(state.preferences.hiddenColumns||[]);input.checked?hidden.delete(key):hidden.add(key);await request({type:'preferences',value:{hiddenColumns:[...hidden]}});state=await readState();render();}catch(error){reportError(error);}});
    return el('label',{},input,label.replace(/^[^A-Za-z]* /,''));
  }));
}
function saveDraft() {
  const value={fields:formFields(detailForm),original,recordId:detailId};
  draftQueue=draftQueue.then(()=>request({type:'draft',key:draftKey,value})).catch(error=>{$('#editor-feedback').textContent=error.message;});
}
function openEditor(record=null, restore=false) {
  const draft=restore?state.drafts[draftKey]:null;
  original=draft?.original || record; detailId=original?.id || null;
  const fields=draft?.fields || record || {email:''};
  detailForm=jobForm(fields,saveDraft);detailForm.id='detail-form';detailForm.addEventListener('submit',saveEditor);
  $('#editor-form').replaceChildren(detailForm);$('#editor-title').textContent=record?.company || (detailId?'Edit application':'New application');
  $('#editor-hint').textContent=draft?'Your unsaved draft has been restored.':'Edit the details below. Save when you’re ready.';
  $('#editor-feedback').textContent='';$('#editor-duplicates').hidden=true;$('#delete').hidden=!detailId;
  if(!$('#editor').open)$('#editor').showModal();
}
async function saveEditor(event) {
  event.preventDefault();if(panelBusy||!detailForm.reportValidity())return;
  panelBusy=true;$('#save-editor').disabled=true;
  try {
    await draftQueue;
    const fields=detailId?changedFields(original,formFields(detailForm)):formFields(detailForm);
    let result=await request({type:'save',id:detailId,fields,draftKey});
    if(result.duplicates){
      const area=$('#editor-duplicates');area.hidden=false;area.replaceChildren(el('strong',{},'Matching or similar applications:'),...result.duplicates.map(({record,kind})=>el('div',{},`${record.company} · ${record.position} (${kind}) `,el('button',{type:'button',onclick:()=>openEditor(record)},'Edit existing'))));
      if(!confirm('A matching or similar application exists. Save as a separate application?'))return;
      result=await request({type:'save',fields,draftKey,allowDuplicate:true});
    }
    state=await readState();$('#editor').close();render();notify('Application saved locally.');
  }catch(error){$('#editor-feedback').textContent=error.message;$('#editor-feedback').classList.add('error');}
  finally{panelBusy=false;$('#save-editor').disabled=false;}
}
async function closeEditor() {await draftQueue;$('#editor').close();}
$('#close-editor').addEventListener('click',closeEditor);
$('#editor').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
$('#delete').addEventListener('click',async()=>{
  if(!detailId||panelBusy||!confirm('Delete this application? This cannot be undone.'))return;
  panelBusy=true;
  try{await draftQueue;await request({type:'delete',id:detailId});await request({type:'draft',key:draftKey,value:null});$('#editor').close();state=await readState();render();notify('Application deleted.');}catch(error){$('#editor-feedback').textContent=error.message;}finally{panelBusy=false;}
});
function newApplication(){if(state.drafts[draftKey]){if(confirm('You have an unsaved draft. Restore it? Choose Cancel to start a new application.')){openEditor(null,true);return;}}openEditor();}
for(const id of ['#add','#add-bottom'])$(id).addEventListener('click',newApplication);
function clearFilters() {$('#search').value='';for(const id of ['#stage-filter','#location-filter','#email-filter'])$(id).value='';render();}
$('#clear-filters').addEventListener('click',clearFilters);
$('#filter-toggle').addEventListener('click',()=>{const node=$('#filters');node.hidden=!node.hidden;$('#filter-toggle').setAttribute('aria-expanded',String(!node.hidden));});
$('#search').addEventListener('input',render);
for(const id of ['#stage-filter','#location-filter','#email-filter'])$(id).addEventListener('change',render);
async function setSort(value){$('#sort').value=value;render();try{await request({type:'preferences',value:{sort:value}});}catch(error){reportError(error);}}
$('#sort').addEventListener('change',()=>setSort($('#sort').value));
function initializeSort(){
  const options=[el('option',{value:'createdAt:desc'},'Newest added'),el('option',{value:'createdAt:asc'},'Oldest added')];
  for(const [key,label] of columns.filter(([key])=>key!=='number')){
    const name=label.replace(/^[^ ]+ +/,'');
    for(const direction of ['asc','desc'])options.push(el('option',{value:`${key}:${direction}`},`${name} ${direction==='asc'?'↑':'↓'}`));
  }
  $('#sort').replaceChildren(...options);
  const saved=state.preferences.sort;
  const value=({newest:'createdAt:desc',company:'company:asc',stage:'stage:asc',applied:'appliedDate:desc'})[saved] || saved || 'createdAt:desc';
  $('#sort').value=options.some(option=>option.value===value)?value:'createdAt:desc';
}
$('#export-json').addEventListener('click',async()=>{try{const current=await readState();download(`job-ledger-${today()}.json`,JSON.stringify({schemaVersion:SCHEMA_VERSION,exportedAt:new Date().toISOString(),records:current.records},null,2),'application/json');notify('JSON backup exported.');}catch(error){reportError(error);}});
$('#export-csv').addEventListener('click',async()=>{try{download(`job-ledger-${today()}.csv`,csvExport((await readState()).records),'text/csv;charset=utf-8');notify('CSV exported.');}catch(error){reportError(error);}});
$('#import').addEventListener('click',()=>{$('#import-dialog').showModal();});
$('#cancel-import').addEventListener('click',()=>$('#import-dialog').close());
$('#import-file').addEventListener('change',async()=>{
  incoming=null;$('#confirm-import').disabled=true;
  try{
    const file=$('#import-file').files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('Choose a backup smaller than 20 MB.');
    const raw=JSON.parse(await file.text()),parsed=parseBackup(raw,state.records);
    $('#import-preview').replaceChildren(el('strong',{},`${parsed.valid.length} valid · ${parsed.invalid.length} invalid · ${parsed.duplicates.length} duplicate candidates`),...parsed.invalid.slice(0,12).map(v=>el('div',{},`Row ${v.row}: ${v.reason}`)),el('p',{},parsed.invalid.length?'Fix invalid rows before importing.':'Ready to import. Existing records are preserved when merging.'));
    if(!parsed.invalid.length){incoming=raw;$('#confirm-import').disabled=false;}
  }catch(error){$('#import-preview').textContent=error.message;}
});
$('#confirm-import').addEventListener('click',async()=>{
  if(!incoming)return;
  const mode=$('input[name="import-mode"]:checked').value;
  if(mode==='replace'&&!confirm(`Replace all ${state.records.length} existing applications with this backup? Export a backup first if you want to keep them.`))return;
  $('#confirm-import').disabled=true;
  try{const result=await request({type:'import',backup:incoming,mode});state=await readState();render();$('#import-dialog').close();notify(`Import complete.${result.skipped?` ${result.skipped} exact duplicates skipped.`:''}`);}catch(error){$('#import-preview').textContent=error.message;}finally{$('#confirm-import').disabled=false;}
});
function switchView(view){
  for(const name of ['all','daily','stats']){
    const active=name===view,tab=$(`#tab-${name}`);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$(`#${name}-view`).hidden=!active;
  }
  $('#record-count').hidden=view!=='all';
}
const tabs=[...document.querySelectorAll('[role="tab"]')];
for(const [index,tab] of tabs.entries()){
  tab.addEventListener('click',()=>switchView(tab.dataset.view));
  tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();tabs[next].focus();switchView(tabs[next].dataset.view);});
}
async function init(){
  try{
    state=await readState();initializeSort();render();
    function openHash(){const id=decodeURIComponent(location.hash.slice(1)),record=state.records.find(r=>r.id===id);if(record)openEditor(record);}
    openHash();window.addEventListener('hashchange',openHash);
    chrome.storage.onChanged.addListener(async(changes,area)=>{if(area==='local'&&changes.ledger){try{state=await readState();if(document.activeElement?.closest('#table-body')){pendingRender=true;}else render();}catch(error){reportError(error);}}});
    $('#table-body').addEventListener('focusout',()=>setTimeout(()=>{if(pendingRender&&!document.activeElement?.closest('#table-body')){pendingRender=false;render();}},0));
  }catch(error){reportError(error);for(const id of ['#add','#add-bottom','#import','#export-json','#export-csv'])$(id).disabled=true;}
}
init();
