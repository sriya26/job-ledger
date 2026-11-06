// Runs capture extraction in real Chromium layout for split-pane boards whose markup has no stable labels.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {extractJob} from '../src/extract.js';
const cases=[
  ['linkedin-2026','https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer&currentJobId=4310000003',{position:'Software Engineer',company:'Yext',location:'New York, NY (Hybrid)',jobId:'4310000003',jobUrl:'https://www.linkedin.com/jobs/view/4310000003/',source:'LinkedIn'}],
  ['linkedin-2026','https://www.linkedin.com/jobs/search-results/?keywords=software%20engineer',{position:'Software Engineer',company:'Yext',jobId:'4310000003'}],
  ['handshake','https://app.joinhandshake.com/job-search/10257865?page=1&per_page=25',{position:'Software Engineer, Product',company:'Numeric',location:'San Francisco, CA (Onsite)',jobId:'10257865',jobUrl:'https://app.joinhandshake.com/jobs/10257865',source:'Handshake'}],
  ['handshake-button','https://app.joinhandshake.com/job-search/10257865',{position:'Software Engineer, Product',company:'Numeric',location:'San Francisco, CA (Onsite)'}],
  ['linkedin-search','https://www.linkedin.com/jobs/search/?currentJobId=4300000001',{position:'Software Engineer',company:'LTM',location:'Los Angeles, CA (Remote)'}],
];
const browser=await chromium.launch();
try{
  for(const width of [1400,1024]){
  const page=await browser.newPage({viewport:{width,height:800}});
  for(const [fixture,url,expected] of cases){
    const html=await fs.readFile(`tests/fixtures/${fixture}.html`,'utf8');
    await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
    await page.goto(url);const result=await page.evaluate(extractJob);await page.unrouteAll();
    for(const [key,value] of Object.entries(expected))assert.equal(result[key],value,`${fixture} ${key}`);
    console.log(`✓ ${fixture} at ${width}px: ${result.position} · ${result.company} · ${result.location}`);
  }
  await page.close();
  }
}finally{await browser.close();}
