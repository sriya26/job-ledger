import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root=process.cwd(),profile=await fs.mkdtemp(path.join(os.tmpdir(),'job-ledger-capture-'));
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`,'--enable-unsafe-extension-debugging']});
context.setDefaultTimeout(10000);
try{
 const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
 const page=await context.newPage();
 await page.route('https://careers.acme.test/**',route=>route.fulfill({contentType:'text/html',path:'tests/fixtures/structured.html'}));
 await page.goto('https://careers.acme.test/jobs/123');await page.bringToFront();
 const cdp=await context.browser().newBrowserCDPSession();
 const {targetInfos}=await cdp.send('Target.getTargets',{filter:[{type:'tab',exclude:false}]});
 const targetInfo=targetInfos.find(t=>t.url.includes('careers.acme.test'));
 if(!targetInfo)throw new Error('Job tab target not found: '+JSON.stringify(targetInfos));
 await cdp.send('Extensions.triggerAction',{id,targetId:targetInfo.targetId});
 let popupTarget;
 for(let attempt=0;attempt<30;attempt++){
  const {targetInfos:targets}=await cdp.send('Target.getTargets',{filter:[{exclude:false}]});
  popupTarget=targets.find(t=>t.url===`chrome-extension://${id}/popup.html`);
  if(popupTarget)break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!popupTarget)throw new Error('Action popup target was not opened.');
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:popupTarget.targetId,flatten:false});
 let seq=0;const pending=new Map();
 cdp.on('Target.receivedMessageFromTarget',event=>{const message=JSON.parse(event.message);if(pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id);}});
 async function evaluate(expression){
  const callId=++seq,response=new Promise(resolve=>pending.set(callId,resolve));
  await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:callId,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}})});
  const result=await response;if(result.error||result.result?.exceptionDetails)throw new Error(JSON.stringify(result));return result.result.result.value;
 }
 async function waitFor(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Popup wait failed: '+expression+'; feedback: '+await evaluate('document.querySelector("#feedback")?.textContent'));}
 await waitFor('!!document.querySelector("#field-company")');
 await evaluate('document.querySelector("#capture").click()');
 await waitFor('document.querySelector("#feedback").textContent === "Captured. Review before saving."');
 assert.equal(await evaluate('document.querySelector("#field-company").value'),'Acme');
 assert.equal(await evaluate('document.querySelector("#field-position").value'),'Software Engineer');
 assert.equal(await evaluate('document.querySelector("#field-location").value'),'Remote · New York, NY, US');
 await evaluate('document.querySelector("#save").click()');
 await waitFor('document.querySelector("#feedback").textContent === "Saved to your dashboard."');
 const dashboard=await context.newPage();await dashboard.goto(`chrome-extension://${id}/dashboard.html`);await dashboard.waitForSelector('#table-body tr');assert.equal(await dashboard.getByLabel('company for Acme',{exact:true}).inputValue(),'Acme');
 console.log('✓ Actual Chrome action → activeTab grant → Capture → editable preview → Save → dashboard');
}finally{await context.close();}
