import {mutate} from './store.js';
// One writer serializes popup/dashboard mutations and prevents lost updates.
let queue = Promise.resolve();
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(console.error);
chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  queue = queue.then(() => mutate(chrome.storage.local,message));
  queue.then(result => respond({ok:true,result}), error => respond({ok:false,error:error.message}));
  queue = queue.catch(() => {});
  return true;
});
