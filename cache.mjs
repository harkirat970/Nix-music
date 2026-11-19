import {readdir,stat,unlink,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
export const CACHE_LIMIT=100_000_000;
export class MediaCache{
 constructor(directory,limit=CACHE_LIMIT){this.directory=directory;this.limit=limit;this.pending=Promise.resolve();}
 exclusive(action){const task=this.pending.catch(()=>{}).then(action);this.pending=task;return task;}
 async files(directory=this.directory){const result=[];for(const name of await readdir(directory)){const path=join(directory,name),info=await stat(path);if(info.isFile())result.push({name,path,size:info.size,time:info.mtimeMs});}return result;}
 async prune(reserve=0){
  const files=(await this.files()).sort((a,b)=>a.time-b.time);let total=files.reduce((n,f)=>n+f.size,0);
  for(const file of files){if(total+reserve<=this.limit&&Date.now()-file.time<=86400000)continue;
   try{await unlink(file.path);total-=file.size;}catch(error){if(error.code==='ENOENT')total-=file.size;else if(!['EBUSY','EPERM','EACCES'].includes(error.code))throw error;}
  }
  if(total+reserve>this.limit)throw Object.assign(Error('Music cache is busy. Try again shortly.'),{status:503});
 }
 trim(){return this.exclusive(()=>this.prune());}
 install(directory){return this.exclusive(async()=>{
  const files=await this.files(directory),size=files.reduce((n,f)=>n+f.size,0);
  if(size>this.limit)throw Object.assign(Error('This track exceeds the 100 MB cache limit.'),{status:413});
  await this.prune(size);
  for(const file of files)await copyFile(file.path,join(this.directory,file.name));
 });}
}
