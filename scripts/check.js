import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
for(const file of [manifest.action.default_popup,manifest.background.service_worker,manifest.options_page,'styles.css'])if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
for(const file of fs.readdirSync('src').filter(f=>f.endsWith('.js')))execFileSync(process.execPath,['--check',`src/${file}`]);
if(manifest.host_permissions || manifest.externally_connectable)throw new Error('Unexpected external permissions');
console.log('Manifest paths, JavaScript syntax, and minimal permissions verified.');
