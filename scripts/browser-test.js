import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {extractJob} from '../src/extract.js';
const root=process.cwd(),profile=await fs.mkdtemp(path.join(os.tmpdir(),'job-ledger-test-'));
const browserOptions={channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]};
let context=await chromium.launchPersistentContext(profile,browserOptions);
context.setDefaultTimeout(12000);
let errors=[],externalRequests=[];context.on('request',r=>{if(/^https?:/.test(r.url()))externalRequests.push(r.url());});
async function setup(){const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(`chrome-extension://${id}/dashboard.html`);await page.getByText('Your next chapter starts here').waitFor();return {page,id};}
let {page,id}=await setup();
const check=label=>console.log(`✓ ${label}`);
try{
  await page.getByRole('button',{name:'＋ New',exact:true}).click();
  await page.locator('#editor').getByLabel('Company',{exact:true}).fill('Acme');
  await page.locator('#editor').getByLabel('Position',{exact:true}).fill('Software Engineer');
  await page.locator('#editor').getByLabel('Job location',{exact:true}).fill('New York, NY');
  await page.locator('#editor').getByLabel('Job URL',{exact:true}).fill('https://careers.example/jobs/123');
  await page.locator('#editor').getByLabel('Notes',{exact:true}).fill('Referral from Sam\nFollow up next week.');
  const emailField=page.locator('#editor').getByLabel('Email used',{exact:true}),configuredEmail=await emailField.evaluate(select=>[...select.options].map(o=>o.value).find(Boolean));if(configuredEmail)await emailField.selectOption(configuredEmail); // config.js is optional
  await page.locator('#editor').getByLabel('Stage',{exact:true}).selectOption('Applied');
  assert.ok(await page.locator('#editor').getByLabel('Applied date',{exact:true}).inputValue());
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.locator('#editor').waitFor({state:'hidden'});
  assert.equal(await page.locator('#table-body tr').count(),1);check('Add application, local applied date, and dashboard render');
  await page.getByLabel('notes for Acme',{exact:true}).fill('Changed inline');
  await page.getByLabel('notes for Acme',{exact:true}).press('Tab');
  await page.waitForFunction(()=>document.querySelector('#feedback').textContent==='Saved locally.');
  await page.reload();assert.equal(await page.getByLabel('notes for Acme',{exact:true}).inputValue(),'Changed inline');check('Inline edits persist through reload');
  await page.getByLabel('Search applications').fill('no match');await page.getByText('No matching applications').waitFor();
  await page.getByLabel('Search applications').fill('Acme');assert.equal(await page.locator('#table-body tr').count(),1);
  await page.getByRole('button',{name:'☷ Filter',exact:true}).click();await page.getByLabel('Filter by stage').selectOption('Rejected');await page.getByText('No matching applications').waitFor();await page.getByLabel('Filter by stage').selectOption('Applied');check('Search and stage filtering');
  await page.locator('summary').filter({hasText:'Columns'}).click();await page.locator('#columns label').filter({hasText:'Notes'}).locator('input').uncheck();await page.waitForFunction(()=>!document.querySelector('input[aria-label="notes for Acme"]'));await page.reload();await page.waitForSelector('#table-body tr');assert.equal(await page.locator('input[aria-label="notes for Acme"]').count(),0);check('Column visibility persists');
  const popup=await context.newPage();popup.on('pageerror',error=>errors.push(error.message));await popup.goto(`chrome-extension://${id}/popup.html`);
  assert.equal(await popup.getByLabel('Email used',{exact:true}).inputValue(),'');assert.equal(await popup.locator('#saved-locations option[value="New York, NY"]').count(),1);await popup.getByLabel('Company',{exact:true}).fill('Beta');await popup.getByLabel('Position',{exact:true}).fill('Data Engineer');await popup.getByLabel('Job URL',{exact:true}).fill('https://beta.example/jobs/2');await popup.getByRole('button',{name:'Save application',exact:true}).click();await popup.getByText('Saved to your dashboard.').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('#table-body tr').length===2);check('Popup saves and dashboard updates across tabs');
  await popup.getByLabel('Notes',{exact:true}).fill('Draft survives popup reload');await popup.waitForTimeout(200);await popup.reload();assert.equal(await popup.getByLabel('Notes',{exact:true}).inputValue(),'Draft survives popup reload');check('Unsaved popup draft restoration');
  await popup.getByRole('button',{name:'Update application',exact:true}).click();await popup.getByText('Saved to your dashboard.').waitFor();
  popup.once('dialog',dialog=>dialog.accept());await popup.getByRole('button',{name:'New / manual entry'}).click();
  await popup.getByLabel('Company',{exact:true}).fill('Beta');await popup.getByLabel('Position',{exact:true}).fill('Data Engineer');await popup.getByLabel('Job URL',{exact:true}).fill('https://beta.example/jobs/2');await popup.getByText('This job may already be in your tracker.').waitFor();await popup.getByRole('button',{name:'Load existing',exact:true}).click();assert.equal(await popup.getByLabel('Notes',{exact:true}).inputValue(),'Draft survives popup reload');check('Duplicate capture preview loads existing notes');
  // Run the exact serialized extraction function against real rendered fixture DOM.
  const fixturePage=await context.newPage();
  for(const name of ['structured','greenhouse','lever','workday','linkedin','generic']){
    await fixturePage.setContent(await fs.readFile(`tests/fixtures/${name}.html`,'utf8'));
    if(name==='structured'||name==='generic'){const extracted=await fixturePage.evaluate(extractJob);assert.ok(extracted.company);assert.ok(extracted.position);}
  }
  await fixturePage.close();check('Structured and generic extraction in rendered Chromium DOM (platform selectors covered by unit fixtures)');
  await page.evaluate(async()=>{const {request}=await import('./src/store.js');await request({type:'save',fields:{company:'<img src=x onerror=alert(1)>',position:'<script>alert(1)</script>',notes:'Untrusted text'}});});
  await page.waitForFunction(()=>document.querySelectorAll('#table-body tr').length===3);assert.equal(await page.locator('#table-body img, #table-body script').count(),0);check('Captured text renders without HTML execution');
  const backup=await page.evaluate(async()=>{const {readState}=await import('./src/store.js');const state=await readState();return {schemaVersion:1,records:state.records};});
  await page.getByRole('button',{name:'Import',exact:true}).click();await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.getByText('3 valid · 0 invalid · 3 duplicate candidates').waitFor();await page.getByRole('button',{name:'Import applications',exact:true}).click();await page.getByText('Import complete. 3 exact duplicates skipped.').waitFor();assert.equal(await page.locator('#table-body tr').count(),3);check('Import preview and merge skip exact duplicates');
  await page.locator('summary').filter({hasText:'Export'}).click();const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'JSON backup',exact:true}).click();const download=await downloadPromise;const exported=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.deepEqual(exported.records,backup.records);check('Exported JSON preserves all application fields');
  await page.getByRole('button',{name:'Open Acme',exact:true}).click();await page.locator('#editor').getByLabel('Notes',{exact:true}).fill('Unfinished dashboard draft');await page.waitForTimeout(200);await page.getByRole('button',{name:'Close details'}).click();
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'＋ New',exact:true}).click();assert.equal(await page.locator('#editor').getByLabel('Notes',{exact:true}).inputValue(),'Unfinished dashboard draft');await page.getByRole('button',{name:'Close details'}).click();check('Dashboard draft restoration');
  await context.close();context=await chromium.launchPersistentContext(profile,browserOptions);page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(`chrome-extension://${id}/dashboard.html`);await page.waitForSelector('#table-body tr');assert.equal(await page.locator('#table-body tr').count(),3);check('Records persist after closing and restarting browser');
  // Visual review with representative data in this isolated test profile only.
  await page.evaluate(async()=>{const {request,readState}=await import('./src/store.js');for(const r of (await readState()).records)await request({type:'delete',id:r.id});await request({type:'preferences',value:{hiddenColumns:[]}});const records=[['Adobe','Software Engineer Intern','Applied','San Jose, CA'],['Figma','Product Engineer','Interview','New York, NY'],['Bloomberg','Software Engineer','Assessment','New York, NY'],['Salesforce','Full Stack Engineer','To apply','San Francisco, CA'],['Microsoft','Data Engineer','Rejected','Redmond, WA'],['Notion','Frontend Engineer','Applied','New York, NY']];for(const [company,position,stage,location]of records)await request({type:'save',fields:{company,position,stage,location,email:'me@example.com',jobUrl:`https://example.com/${company.toLowerCase()}`}});});
  await page.setViewportSize({width:1500,height:960});await page.waitForTimeout(200);await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/dashboard.png',fullPage:true});
  const shotPopup=await context.newPage();await shotPopup.goto(`chrome-extension://${id}/popup.html`);await shotPopup.getByLabel('Company',{exact:true}).fill('Acme');await shotPopup.getByLabel('Position',{exact:true}).fill('Software Engineer');await shotPopup.setViewportSize({width:420,height:1000});await shotPopup.screenshot({path:'artifacts/popup.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);check('No browser JavaScript errors or external HTTP requests from the dashboard/popup');
}catch(error){await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/failure.png',fullPage:true});console.error('UI feedback:',await page.locator('#editor-feedback').textContent());console.error('Errors:',errors);throw error;}finally{await context.close();}
console.log('Browser checks complete. Isolated profile:',profile);
