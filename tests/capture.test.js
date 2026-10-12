import test from 'node:test';
import assert from 'node:assert/strict';
import {selectEmbeddedJob} from '../src/capture.js';
const outer={jobUrl:'https://careers.acme.example/job?gh_jid=1234567',embeddedGreenhouse:[{jobId:'1234567'}]};
test('embedded capture uses the correct job and preserves the original application URL',()=>{const result=selectEmbeddedJob(outer,[{source:'Greenhouse',jobId:'111',company:'Other',position:'Wrong role'},{source:'Greenhouse',jobId:'1234567',company:'Acme',position:'Engineer'}]);assert.equal(result.company,'Acme');assert.equal(result.position,'Engineer');assert.equal(result.jobUrl,outer.jobUrl);});
test('embedded capture refuses unrelated or unloaded frames',()=>{assert.throws(()=>selectEmbeddedJob(outer,[]));assert.throws(()=>selectEmbeddedJob(outer,[{source:'Greenhouse',jobId:'111',position:'Wrong role'}]));});
