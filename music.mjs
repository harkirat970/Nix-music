import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

const localPython=['.venv/Scripts/python.exe','.venv/bin/python.exe','.venv/bin/python'].map(p=>resolve(p)).find(p=>existsSync(p))||'';
export const python=process.env.PYTHON_PATH || (existsSync(localPython)?localPython:'python3');
const cache=new Map(), pending=new Map();
let activeProviders=0;
function provider(input){return new Promise((resolvePromise,reject)=>{
 if(activeProviders>=4){reject(Error('Music discovery is busy. Try again shortly.'));return;}activeProviders++;
 const process=spawn(python,['scripts/music_provider.py'],{shell:false,windowsHide:true});
 let output='',done=false;
 const finish=(error,value)=>{if(done)return;done=true;activeProviders--;clearTimeout(timeout);error?reject(error):resolvePromise(value);};
 const timeout=setTimeout(()=>{process.kill();finish(Error('YouTube Music took too long to respond. Try again.'));},90000);
 process.stdout.on('data',chunk=>{output+=chunk;if(output.length>4e6){process.kill();finish(Error('Music response too large'));}});
 process.stderr.resume();
 process.on('error',()=>finish(Error('Music provider is not installed. Run pip install -r requirements.txt.')));
 process.on('close',code=>{try{const data=JSON.parse(output);if(code||data.error)finish(Error(data.error||'YouTube Music unavailable'));else finish(null,data);}catch{finish(Error('YouTube Music returned an invalid response.'));}});
 process.stdin.end(JSON.stringify(input));
});}
export async function music(kind,query='',country='IN'){
 if(!['IN','US','GB','ZZ'].includes(country))throw Object.assign(Error('Unsupported chart region'),{status:400});
 const key=JSON.stringify([kind,query,country]),old=cache.get(key),ttl=kind==='search'?600000:1800000;
 if(old&&Date.now()-old.fetchedAt<ttl)return old;
 if(pending.has(key))return pending.get(key);
 const promise=provider({kind,query,country}).then(data=>{const result={...data,country,fetchedAt:Date.now(),stale:false};cache.set(key,result);if(cache.size>150)cache.delete(cache.keys().next().value);return result;}).catch(error=>{if(old)return {...old,stale:true,warning:'Showing the last successful refresh. YouTube Music is temporarily unavailable.'};throw Object.assign(error,{status:503});}).finally(()=>pending.delete(key));
 pending.set(key,promise);return promise;
}
