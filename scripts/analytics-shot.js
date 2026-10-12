// Renders the Daily activity and Overview tabs with seeded data in an isolated profile for visual review.
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root=process.cwd(),out=process.argv[2]||'artifacts',profile=await fs.mkdtemp(path.join(os.tmpdir(),'job-ledger-viz-'));
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
const errors=[];
try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/dashboard.html`);
  await page.getByText('Your next chapter starts here').waitFor();
  await page.evaluate(async()=>{
    const {request}=await import('./src/store.js');const {today}=await import('./src/model.js');
    const companies=['Adobe','Figma','Bloomberg','Stripe','Notion','Datadog','Ramp','Plaid','Airbnb','Snowflake','Databricks','Spotify','Etsy','Squarespace','Two Sigma','Jane Street','Palantir','Asana','Duolingo','Robinhood'];
    const places=['New York, NY','New York, NY','San Francisco, CA','Remote','Seattle, WA','Boston, MA','Austin, TX'];
    const stages=['Applied','Applied','Applied','Applied','Rejected','Rejected','Assessment','Interview','Withdrawn','Offer'];
    let seed=7;const rand=()=>(seed=(seed*9301+49297)%233280)/233280;
    const base=new Date(`${today()}T12:00:00`);const backup={schemaVersion:1,records:[]};
    for(let back=0;back<200;back++){
      const d=new Date(base);d.setDate(d.getDate()-back);const date=d.toISOString().slice(0,10);
      const n=back<60?Math.floor(rand()*(d.getDay()%6?6:2)):rand()<.35?Math.floor(rand()*4):0;
      for(let k=0;k<n;k++){
        const stage=back<5?'Applied':stages[Math.floor(rand()*stages.length)];const r=new Date(d);r.setDate(r.getDate()+3+Math.floor(rand()*30));
        backup.records.push({id:`r${back}-${k}`,company:companies[Math.floor(rand()*companies.length)],position:`Software Engineer ${back}-${k}`,location:places[Math.floor(rand()*places.length)],stage,appliedDate:date,responseDate:stage!=='Applied'&&rand()<.7&&r<base?r.toISOString().slice(0,10):'',jobUrl:`https://example.com/${back}/${k}`,createdAt:d.toISOString(),updatedAt:d.toISOString()});
      }
    }
    for(let k=0;k<6;k++)backup.records.push({id:`t${k}`,company:'Later Co',position:`Role ${k}`,stage:'To apply',appliedDate:'',createdAt:base.toISOString(),updatedAt:base.toISOString()});
    await request({type:'import',backup,mode:'replace'});
  });
  await page.setViewportSize({width:1500,height:1000});
  for(const [tab,name] of [['Daily activity','daily'],['Overview','stats']]){
    await page.getByRole('tab',{name}).click().catch(()=>page.locator(`#tab-${name}`).click());
    await page.waitForTimeout(300);
    await page.screenshot({path:`${out}/${name}.png`,fullPage:true});
  }
  await page.locator('#tab-daily').click();await page.locator('.col').nth(25).hover();await page.waitForTimeout(100);await page.screenshot({path:`${out}/daily-hover.png`});
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:`${out}/daily-mobile.png`,fullPage:true});
  await page.locator('#tab-stats').click();await page.screenshot({path:`${out}/stats-mobile.png`,fullPage:true});
  console.log('errors',errors);
}finally{await context.close();}
