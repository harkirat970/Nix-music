import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareCookies} from '../cookies.mjs';

test('cookies are optional, but explicitly missing files fail clearly',async()=>{
 const root=await mkdtemp(join(tmpdir(),'nix-cookie-test-'));
 try{
  const result=await prepareCookies('',root);assert.deepEqual(result.args,[]);await result.cleanup();
  await assert.rejects(prepareCookies('missing.txt',root),/could not be read/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('each extraction uses a separate disposable cookie copy',async()=>{
 const root=await mkdtemp(join(tmpdir(),'nix-cookie-test-'));
 let a,b;
 try{
  await mkdir(join(root,'cookies'));
  const original=join(root,'cookies/cookies.txt');
  const fake='# Netscape HTTP Cookie File\n.example.test\tTRUE\t/\tFALSE\t0\ttest\tfake-value\n';
  await writeFile(original,fake);
  a=await prepareCookies('',root);b=await prepareCookies('',root);
  assert.equal(a.args[0],'--cookies');assert.notEqual(a.args[1],b.args[1]);
  assert.equal(await readFile(a.args[1],'utf8'),fake);
  await writeFile(a.args[1],'changed');assert.equal(await readFile(original,'utf8'),fake);
  await a.cleanup();await assert.rejects(access(a.args[1]));
  await writeFile(original,'{}');await assert.rejects(prepareCookies('',root),/Netscape/);
 }finally{await a?.cleanup();await b?.cleanup();await rm(root,{recursive:true,force:true});}
});

test('detects browser export names and honors an explicit override',async()=>{
 const root=await mkdtemp(join(tmpdir(),'nix-cookie-test-')),directory=join(root,'cookies');
 const content=name=>'# Netscape HTTP Cookie File\n# '+name+'\n';
 async function selected(configured=''){
  const copy=await prepareCookies(configured,root);
  try{return await readFile(copy.args[1],'utf8');}finally{await copy.cleanup();}
 }
 try{
  await mkdir(directory);
  await writeFile(join(directory,'xookies.txt'),content('custom'));
  assert.equal(await selected(),content('custom'));
  await writeFile(join(directory,'music.youtube.com_cookies.txt'),content('music'));
  await writeFile(join(directory,'www.youtube.com_cookies.txt'),content('www'));
  assert.equal(await selected(),content('www'));
  assert.equal(await selected('cookies/xookies.txt'),content('custom'));
  await writeFile(join(directory,'cookies.txt'),content('canonical'));
  assert.equal(await selected(),content('canonical'));
 }finally{await rm(root,{recursive:true,force:true});}
});
