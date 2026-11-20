import {readFile,mkdtemp,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';

async function cookieFile(configured,root){
 const explicit=!!configured?.trim();
 let file;
 if(explicit)file=resolve(root,configured.trim());
 else{
  const directory=resolve(root,'cookies');
  const entries=await readdir(directory,{withFileTypes:true}).catch(error=>{
   if(error.code==='ENOENT')return [];
   throw error;
  });
  const names=entries.filter(entry=>entry.isFile()&&entry.name.toLowerCase().endsWith('.txt')).map(entry=>entry.name);
  const preferred=['cookies.txt','www.youtube.com_cookies.txt','music.youtube.com_cookies.txt'];
  const name=preferred.map(candidate=>names.find(n=>n.toLowerCase()===candidate)).find(Boolean);
  if(!name&&names.length>1)throw Object.assign(Error('Choose a cookie export using YT_DLP_COOKIES_FILE.'),{status:503});
  if(!names.length)return null;
  file=join(directory,name||names[0]);
 }
 try{return await readFile(file,'utf8');}
 catch(error){
  throw Object.assign(Error('Cookie file could not be read. Check YT_DLP_COOKIES_FILE or cookies/cookies.txt.'),{status:503});
 }
}

export async function prepareCookies(configured=process.env.YT_DLP_COOKIES_FILE,root=process.cwd(),inline=process.env.YT_DLP_COOKIES){
 const useInline=!configured?.trim()&&Boolean(inline?.trim());
 const content=useInline?inline:await cookieFile(configured,root);
 if(content===null)return {args:[],cleanup:async()=>{}};
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
