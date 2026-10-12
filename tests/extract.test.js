import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {extractJob} from '../src/extract.js';
function extract(html,url){const {document,HTMLElement}=parseHTML(html);HTMLElement.prototype.getClientRects=()=>[{}];return vm.runInNewContext(`(${extractJob.toString()})()`,{document,location:{href:url},URL});}
const fixture=name=>fs.readFileSync(new URL(`fixtures/${name}.html`,import.meta.url),'utf8');
test('structured nested JobPosting has priority over application heading',()=>{const r=extract(fixture('structured'),'https://careers.acme.test/123');assert.equal(r.position,'Software Engineer');assert.equal(r.company,'Acme');assert.equal(r.location,'Remote · New York, NY, US');assert.equal(r.jobId,'ENG-123');});
for(const [name,url,position,id] of [
 ['greenhouse','https://boards.greenhouse.io/acme/jobs/123','Backend Engineer','123'],
 ['lever','https://jobs.lever.co/acme/12345678-1234-1234-1234-123456789abc','Product Engineer','12345678-1234-1234-1234-123456789abc'],
 ['workday','https://acme.wd1.myworkdayjobs.com/en-US/jobs/job/Data-Engineer_R-123','Data Engineer','R-123'],
 ['linkedin','https://www.linkedin.com/jobs/view/12345','Design Engineer','12345'],
 ['generic','https://acme.test/jobs/1','Research Engineer','']])test(`${name} representative fixture extracts visible details`,()=>{const r=extract(fixture(name),url);assert.equal(r.company,'Acme');assert.equal(r.position,position);assert.equal(r.jobId,id);assert.ok(r.location);});
test('multiple ambiguous structured jobs are not arbitrarily selected',()=>{const r=extract('<script type="application/ld+json">[{"@type":"JobPosting","title":"A"},{"@type":"JobPosting","title":"B"}]</script><h1>Jobs</h1>','https://example.com');assert.equal(r.position,'');assert.equal(r.multiple,true);});
test('malformed structured data falls back and scripts remain inert text',()=>{const r=extract('<script type="application/ld+json">bad json</script><h1>&lt;img src=x onerror=alert(1)&gt;</h1>','https://example.com');assert.equal(r.position,'<img src=x onerror=alert(1)>');assert.equal(r.company,'');});
test('modern Greenhouse application form uses explicit document title for company and role',()=>{const r=extract('<title>Job Application for Software Engineer at Acme Labs</title><h1>Apply for this job</h1>','https://job-boards.greenhouse.io/acme/jobs/123');assert.equal(r.company,'Acme Labs');assert.equal(r.position,'Software Engineer');});
test('Greenhouse embedded forms fall back to OG title and preserve token identity',()=>{const r=extract('<meta property="og:title" content="Job Application for Data Engineer at Acme"><h2>Application</h2>','https://boards.greenhouse.io/embed/job_app?token=456');assert.equal(r.company,'Acme');assert.equal(r.position,'Data Engineer');assert.equal(r.jobId,'456');});
test('Greenhouse can itself be the employer when explicitly named',()=>{const r=extract('<title>Job Application for Software Engineer at Greenhouse</title><h1>Software Engineer</h1>','https://job-boards.greenhouse.io/greenhouse/jobs/123');assert.equal(r.company,'Greenhouse');});
test('custom career pages identify embedded Greenhouse jobs without reading their parent navigation',()=>{const r=extract('<title>Work at Acme | Acme</title><iframe src="https://job-boards.greenhouse.io/embed/job_app?for=acme&amp;token=1234567"></iframe>','https://careers.acme.example/job?gh_jid=1234567');assert.equal(r.embeddedGreenhouse[0].origin,'https://job-boards.greenhouse.io/*');assert.equal(r.embeddedGreenhouse[0].jobId,'1234567');});
