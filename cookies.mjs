import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';

export async function prepareCookies(configured=process.env.YT_DLP_COOKIES_FILE,root=process.cwd()){
 const explicit=!!configured?.trim();
 const file=resolve(root,explicit?configured.trim():'cookies/cookies.txt');
 let content;
 try{content=await readFile(file,'utf8');}
 catch(error){
  if(!explicit&&error.code==='ENOENT')return {args:[],cleanup:async()=>{}};
  throw Object.assign(Error('Cookie file could not be read. Check YT_DLP_COOKIES_FILE or cookies/cookies.txt.'),{status:503});
 }
 if(!/^#(?: Netscape)? HTTP Cookie File\s*$/m.test(content.replace(/^\uFEFF/,'')))
  throw Object.assign(Error('Use a Netscape-format cookies.txt export, not JSON.'),{status:503});
 const directory=await mkdtemp(join(tmpdir(),'nix-cookies-'));
 const cleanup=()=>rm(directory,{recursive:true,force:true});
 try{
  const temporary=join(directory,'cookies.txt');
  await writeFile(temporary,content.replace(/^\uFEFF/,''),{mode:0o600});
  return {args:['--cookies',temporary],cleanup};
 }catch(error){await cleanup();throw error;}
}
