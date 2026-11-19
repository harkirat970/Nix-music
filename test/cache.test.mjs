import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readdir,stat,utimes,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MediaCache} from '../cache.mjs';
test('cache evicts oldest files, counts metadata, and serializes concurrent admissions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'nix-cache-test-'));
 try{
  const cache=join(root,'cache');await mkdir(cache);const manager=new MediaCache(cache,100);
  await writeFile(join(cache,'old.mp3'),Buffer.alloc(70));await utimes(join(cache,'old.mp3'),new Date(0),new Date(0));
  const dirs=await Promise.all(['one','two'].map(async name=>{const dir=join(root,name);await mkdir(dir);await writeFile(join(dir,name+'.mp3'),Buffer.alloc(55));await writeFile(join(dir,name+'.json'),'12345');return dir;}));
  await Promise.all(dirs.map(dir=>manager.install(dir)));
  const names=await readdir(cache);assert.ok(!names.includes('old.mp3'));
  const size=(await Promise.all(names.map(async name=>(await stat(join(cache,name))).size))).reduce((a,b)=>a+b,0);assert.ok(size<=100);
  const huge=join(root,'huge');await mkdir(huge);await writeFile(join(huge,'large'),Buffer.alloc(101));await assert.rejects(manager.install(huge),/exceeds/);
  await writeFile(join(cache,'external'),Buffer.alloc(150));await manager.trim();assert.ok((await readdir(cache)).length===0);
 }finally{await rm(root,{recursive:true,force:true});}
});
