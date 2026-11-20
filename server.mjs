import {RoomManager,applyControl} from './rooms.mjs';
import {withRoomLink} from './telegram-messages.mjs';
import {commandOf,handleGroupCommand,startButtons,handleRoomStart} from './group-commands.mjs';
import http from 'node:http';
import {MediaCache} from './cache.mjs';
import {tmpdir} from 'node:os';
import {readFile, mkdir, stat, mkdtemp, rm} from 'node:fs/promises';
import {createReadStream,existsSync} from 'node:fs';
import {resolve, extname, join} from 'node:path';
import {randomBytes, createHmac, timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {validateInitData} from './auth.mjs';
import {catalog} from './catalog.mjs';
import {music, python} from './music.mjs';
import {prepareCookies} from './cookies.mjs';
import {syncBotMenu,retryDelay} from './telegram-setup.mjs';

const demo = process.env.DEMO_MODE === 'true';
const liveMusic = process.env.MUSIC_MODE !== 'sample';
const ffmpegPath=process.env.FFMPEG_PATH || (existsSync(resolve('vendor/ffmpeg.exe'))?resolve('vendor/ffmpeg.exe'):'');
const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN, owners = (process.env.OWNER_IDS || process.env.OWNER_ID || '').split(',').filter(Boolean).map(Number);
const port = Number(process.env.PORT || 3000), base = process.env.PUBLIC_URL;
if (!demo && (!token || !owners.length || !base?.startsWith('https://') || !process.env.MONGODB_URI)) throw Error('Configure BOT_TOKEN, OWNER_IDS, HTTPS PUBLIC_URL and MONGODB_URI, or set DEMO_MODE=true.');
let db;
if (!demo) {
  const {MongoClient} = await import('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:15000}); await client.connect();
  db = client.db(process.env.MONGODB_DATABASE || 'nix_music');
  await Promise.all(['users','groups'].map(c=>db.collection(c).createIndex({id:1},{unique:true})));
}
const memory = {users:new Map(),groups:new Map()};
const get = (c,id)=>db ? db.collection(c).findOne({id}) : memory[c].get(id);
async function save(c,id,data){ if(db) await db.collection(c).updateOne({id},{$set:data},{upsert:true}); else memory[c].set(id,{...memory[c].get(id),id,...data}); }
const list = c=>db ? db.collection(c).find({},{projection:{_id:0}}).limit(10000).toArray() : [...memory[c].values()];
const rooms = new Map(), sessions = new Map(), limits = new Map(), jobs = new Map(), tracks = new Map((liveMusic?[]:catalog).map(t=>[t.id,t]));
const mediaSecret = randomBytes(32), cache = resolve('cache'); await mkdir(cache,{recursive:true});
const mediaCache=new MediaCache(cache);await mediaCache.trim();
let busy = 0, broadcasting = false, botId;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function telegram(method,data){
  if(method==='sendMessage')data=withRoomLink(data);
  const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(40000)}); const result=await r.json();
  if(!result.ok) throw Object.assign(Error(`${method}: ${result.description || 'Telegram request failed'}`),{retry:result.parameters?.retry_after,code:result.error_code});
  if(method==='sendMessage'&&data.reply_markup?.inline_keyboard)console.log(`Telegram keyboard: ${result.result.reply_markup?.inline_keyboard?.length?'confirmed':'missing in API response'} (message ${result.result.message_id})`);
  return result.result;
}
async function run(args){
 const cookies=await prepareCookies();
 try{return await runProcess([...cookies.args,...args]);}
 finally{await cookies.cleanup();}
}
function extractionFailure(detail){
 const reasons=[
  [/ffprobe|ffmpeg.*(?:not found|does not exist)|Postprocessing:/i,503,'The server could not convert this track. Check its FFmpeg installation.'],
  [/no module named|no such option/i,503,'The server’s audio downloader needs the version in requirements.txt.'],
  [/sign in|not a bot|cookies.*(?:invalid|expired)|login required/i,502,'The music provider needs a fresh sign-in from the server. Refresh the server cookie export.'],
  [/private video|unavailable|not available in your country|copyright|removed by/i,422,'This recording is unavailable from the music provider. Choose another version.'],
  [/requested format|no audio formats|no formats found/i,422,'The provider returned no playable audio for this recording.'],
  [/403|429|too many requests/i,502,'The music provider declined the server’s download. Try again later.'],
  [/timed out|failed to resolve|unable to download|connection refused/i,503,'The server could not reach the music provider. Try again shortly.']
 ];
 const reason=reasons.find(([pattern])=>pattern.test(detail));
 return reason?fail(reason[2],reason[1]):fail('The music provider could not deliver this recording. Try again or choose another version.',502);
}
function runProcess(args){return new Promise((ok,no)=>{
  if(busy>=3) return no(fail('Music server is busy. Try again shortly.',429)); busy++;
  const executable=process.env.YT_DLP_PATH || python;
  const prefix=process.env.YT_DLP_PATH?[]:['-m','yt_dlp'];
  const p=spawn(executable,[...prefix,'--js-runtimes',`node:${process.execPath}`,...(ffmpegPath?['--ffmpeg-location',ffmpegPath]:[]),...args],{shell:false,windowsHide:true}); let out='',err='',finished=false;
  const finish=(error)=>{if(finished)return;finished=true;clearTimeout(timer);busy--;error?no(error):ok(out);};
  const timer=setTimeout(()=>{p.kill();finish(fail('Music request timed out.',504));},120000);
  p.stdout.on('data',b=>{out+=b;if(out.length>4e6){p.kill();finish(fail('Result too large'));}}); p.stderr.on('data',b=>{err=(err+b).slice(-2000);});
  p.on('error',()=>finish(fail('The audio downloader is missing on the server.',503)));p.on('close',code=>finish(code===0?null:extractionFailure(err)));
});}
function clean(t){return {id:t.id,title:String(t.title||'Untitled').slice(0,200),artist:String(t.uploader||t.channel||'YouTube').slice(0,100),duration:Number(t.duration)||0,art:'orbit',thumbnail:`https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`};}
function remember(data){for(const t of data.tracks||[])tracks.set(t.id,t);return data;}
async function search(q){if(!liveMusic)return catalog.filter(t=>`${t.title} ${t.genre} ${t.artist}`.toLowerCase().includes(q.toLowerCase()));
 return remember(await music('search',q)).tracks;}
async function audio(id){
 if(!/^[\w-]{11}$/.test(id))throw fail('Invalid video');const path=join(cache,`${id}.mp3`);
 if(jobs.has(id))return jobs.get(id);
 try{if((await stat(path)).size>0&&!jobs.has(id))return path;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!jobs.has(id)){const job=(async()=>{
  const staging=await mkdtemp(join(tmpdir(),'nix-audio-'));
  try{
   await run(['--no-playlist','--max-filesize','35M','--match-filters','duration < 900 & !is_live','-f','bestaudio/best[acodec!=none]','-x','--audio-format','mp3','--audio-quality','5','--write-info-json','-o',join(staging,`${id}.%(ext)s`),'--',`https://www.youtube.com/watch?v=${id}`]);
   const output=await stat(join(staging,`${id}.mp3`)).catch(error=>{if(error.code!=='ENOENT')throw error;});
   if(!output?.size)throw fail('This recording could not be downloaded within the track limits (under 15 minutes and up to 35 MB).',422);
   await mediaCache.install(staging);return path;
  }finally{await rm(staging,{recursive:true,force:true});}
 })().finally(()=>jobs.delete(id));jobs.set(id,job);}return jobs.get(id);
}
function ticket(id,uid){const exp=Date.now()+3600000,body=`${id}:${uid}:${exp}`,sig=createHmac('sha256',mediaSecret).update(body).digest('hex');return `/media/${id}?u=${uid}&e=${exp}&s=${sig}`;}
function rate(key,max=80){const now=Date.now(),v=limits.get(key)||{n:0,t:now};if(now-v.t>60000){v.n=0;v.t=now;}v.n++;limits.set(key,v);if(v.n>max)throw fail('Too many requests. Try again in a minute.',429);}
async function identity(req){const sid=req.headers.authorization?.replace(/^Bearer /,'');const s=sessions.get(sid);if(!s||s.expires<Date.now())throw fail('Session expired. Reopen the app.',401);const u=await get('users',s.id);if(u?.banned)throw fail('Your account is suspended.',403);rate(`user:${s.id}`);return u;}
const manager=new RoomManager({rooms,getGroup:id=>get('groups',id),saveGroup:(id,data)=>save('groups',id,data),telegram,owners,botId:()=>botId,
 prepare:async track=>{
  if(liveMusic){await audio(track.id);try{const info=JSON.parse(await readFile(join(cache,`${track.id}.info.json`),'utf8'));if(Number(info.duration)>0)track.duration=Number(info.duration);}catch{}
   if(!track.duration){const info=JSON.parse(await run(['--no-playlist','--skip-download','--dump-single-json','--',`https://www.youtube.com/watch?v=${track.id}`]));track.duration=Number(info.duration)||0;}
  }
  else track.duration=30;
  if(!track.duration)throw fail('Duration is unavailable for this track. Try another version.',422);
  return track;
 }});
setInterval(()=>manager.tick(),1000).unref();
async function restoreRoom(id,user){
 if(rooms.has(id))return rooms.get(id);
 const group=db?await db.collection('groups').findOne({roomId:id}):(await list('groups')).find(g=>g.roomId===id);
 if(group)return manager.group(user,{id:group.id,title:group.title});
 throw fail('Room not found. Use /room in your group.',404);
}

async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000)throw fail('Request too large',413);}try{return JSON.parse(raw||'{}');}catch{throw fail('Invalid JSON');}}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');const path=url.pathname;
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer');
  if(path==='/api/health')return json({ok:true,demo,liveMusic});
  if(path==='/api/session'&&req.method==='POST'){
   rate(req.socket.remoteAddress,30);const b=await body(req);let user;
   try{user=demo?{id:101,first_name:'Alex',username:'alex_listens'}:validateInitData(b.initData,token);}catch(e){throw fail(e.message,401);}
   const existing=await get('users',user.id);if(existing?.banned)throw fail('Your account is suspended.',403);
   await save('users',user.id,{first_name:user.first_name,last_name:user.last_name||'',username:user.username||'',photo_url:user.photo_url||'',lastSeen:Date.now(),likes:existing?.likes||[],playlists:existing?.playlists||[],savedTracks:existing?.savedTracks||{}});
   let roomId=null;if(!demo){const signed=new URLSearchParams(b.initData),start=signed.get('start_param')||'',match=/^room_([a-f0-9]{18})$/.exec(start);if(match){const r=await restoreRoom(match[1],user);await manager.access(r,user);roomId=r.id;}else{const chat=JSON.parse(signed.get('chat')||'null');if(chat&&['group','supergroup'].includes(chat.type)){const r=await manager.group(user,chat);await manager.access(r,user);roomId=r.id;}}}
   const sid=randomBytes(32).toString('hex');sessions.set(sid,{id:user.id,expires:Date.now()+3600000});return json({token:sid,user:await get('users',user.id),owner:!demo&&owners.includes(user.id),roomId,demo,liveMusic,botUsername:process.env.BOT_USERNAME||''});
  }
  if(path.startsWith('/media/')){
   const id=path.slice(7),uid=Number(url.searchParams.get('u')),exp=Number(url.searchParams.get('e')),sig=url.searchParams.get('s')||'';
   const expected=createHmac('sha256',mediaSecret).update(`${id}:${uid}:${exp}`).digest('hex');
   if(exp<Date.now()||!Number.isFinite(exp)||!/^[a-f0-9]{64}$/.test(sig)||!timingSafeEqual(Buffer.from(expected),Buffer.from(sig)))throw fail('Expired media link',403);
   if((await get('users',uid))?.banned)throw fail('Account suspended',403);
   const file=await audio(id),s=await stat(file);const range=req.headers.range;
   res.setHeader('Content-Type','audio/mpeg');res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control','private, max-age=1800');
   if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m)throw fail('Unsupported range',416);const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),s.size-1):s.size-1;if(start>end||start>=s.size)throw fail('Invalid range',416);res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${s.size}`,'Content-Length':end-start+1});createReadStream(file,{start,end}).pipe(res);}else{res.setHeader('Content-Length',s.size);createReadStream(file).pipe(res);}return;
  }
  if(path.startsWith('/api/')){
   const u=await identity(req);const b=req.method==='POST'?await body(req):{};
   if(path==='/api/catalog'||path==='/api/home')return json(liveMusic?remember(await music('home')):{tracks:catalog,sections:[{title:'Sample catalog',tracks:catalog}]});
   if(path==='/api/lyrics'){
    rate(`lyrics:${u.id}`,15);const id=url.searchParams.get('id')||'';
    if(!/^[\w-]{11}$/.test(id))return json({available:false,lines:[],text:'',source:''});
    return json(await music('lyrics',id));
   }
   if(path==='/api/trending')return json(liveMusic?remember(await music('charts','',url.searchParams.get('country')||'IN')):{tracks:catalog,title:'Sample catalog'});
   if(path==='/api/search'){rate(`search:${u.id}`,10);const q=(url.searchParams.get('q')||'').trim();if(!q||q.length>150)throw fail('Enter 1–150 characters');return json({tracks:await search(q)});}
   if(path==='/api/play'&&req.method==='POST'){const t=tracks.get(b.id)||u.savedTracks?.[b.id];if(!t)throw fail('Search for this track first',404);tracks.set(t.id,t);if(!liveMusic)return json({track:t,demo:true});if(t.id.startsWith('demo-'))throw fail('Sample tracks are disabled in live music mode.');await audio(t.id);return json({track:t,url:ticket(t.id,u.id)});}
   if(path==='/api/playlist/track'&&req.method==='POST'){
    const playlists=u.playlists||[],p=playlists.find(p=>p.id===b.playlistId),t=tracks.get(b.trackId)||u.savedTracks?.[b.trackId];
    if(!p||!t)throw fail('Playlist or track not found',404);p.tracks=p.tracks||[];
    p.tracks=b.remove?p.tracks.filter(id=>id!==t.id):[...new Set([...p.tracks,t.id])].slice(-200);
    await save('users',u.id,{playlists,savedTracks:{...u.savedTracks,[t.id]:t}});return json(await get('users',u.id));
   }
   if(path==='/api/profile'&&req.method==='POST'){if(b.like){if(typeof b.like!=='string'||b.like.length>100)throw fail('Invalid track');const likes=u.likes||[];await save('users',u.id,{likes:likes.includes(b.like)?likes.filter(x=>x!==b.like):[...likes,b.like].slice(-500),savedTracks:{...u.savedTracks,...(tracks.has(b.like)?{[b.like]:tracks.get(b.like)}:{})}});}if(b.playlist){const name=String(b.playlist).trim().slice(0,60);if(!name)throw fail('Name required');await save('users',u.id,{playlists:[...(u.playlists||[]),{id:randomBytes(6).toString('hex'),name}].slice(-50)});}return json(await get('users',u.id));}
   if(path==='/api/rooms'&&req.method==='GET')return json({rooms:[]});
   if(path==='/api/rooms'&&req.method==='POST')throw fail('Listening rooms belong to Telegram groups. Use /room in your group.',403);
   const rm=/^\/api\/rooms\/([a-f0-9]{18})(?:\/(\w+))?$/.exec(path);
   if(rm){
    const r=await restoreRoom(rm[1],u),access=await manager.access(r,u),action=rm[2];
    if(req.method==='GET')return json(await manager.view(r,u,access));
    if(req.method!=='POST')throw fail('Method not allowed',405);
    if(action==='join'){r.members.set(u.id,{id:u.id,name:u.first_name,seen:Date.now()});r.lastActive=Date.now();return json(await manager.view(r,u,access));}
    if(action==='leave'){r.members.delete(u.id);return json({ok:true});}
    if(!r.members.has(u.id))throw fail('Join the room first',403);
    if(action==='queue'){const t=tracks.get(b.id)||u.savedTracks?.[b.id];if(!t)throw fail('Unknown track');await manager.enqueue(r,u,t);return json(await manager.view(r,u));}
    if(action==='control'){await manager.control(r,u,b);return json(await manager.view(r,u));}
    if(action==='settings')return json(await manager.settings(r,u,b.adminsOnly));
   }
   if(path.startsWith('/api/admin')){
    if(demo||!owners.includes(u.id))throw fail('Owner access required',403);
    if(path==='/api/admin'&&req.method==='GET')return json({users:await list('users'),groups:await list('groups'),rooms:rooms.size});
    if(path==='/api/admin/ban'&&req.method==='POST'){const collection=b.type==='group'?'groups':'users',id=Number(b.id);if(!Number.isSafeInteger(id)||!id||owners.includes(id))throw fail('Invalid target');await save(collection,id,{banned:!!b.banned});if(collection==='groups'&&b.banned){for(const [key,r]of rooms)if(r.group===id)rooms.delete(key);try{await telegram('leaveChat',{chat_id:id});}catch{}}return json({ok:true});}
    if(path==='/api/admin/broadcast'&&req.method==='POST'){
     if(broadcasting)throw fail('A broadcast is already running',409);const message=String(b.message||'').trim();if(!message||message.length>4000)throw fail('Message must be 1–4000 characters');broadcasting=true;
     let sent=0,failed=0;try{for(const g of await list('groups')){if(g.banned||g.active===false)continue;try{await telegram('sendMessage',{chat_id:g.id,text:message});sent++;}catch(e){if(e.retry){await new Promise(r=>setTimeout(r,Math.min(e.retry,60)*1000));try{await telegram('sendMessage',{chat_id:g.id,text:message});sent++;}catch{failed++;}}else failed++;}await new Promise(r=>setTimeout(r,1100));}}finally{broadcasting=false;}return json({sent,failed});
    }
   }
   throw fail('Not found',404);
  }
  if(!['GET','HEAD'].includes(req.method))throw fail('Method not allowed',405);
  const file=resolve('public',path==='/'?'index.html':`.${path}`);if(!file.startsWith(resolve('public')+'/')&&!file.startsWith(resolve('public')+'\\'))throw fail('Not found',404);
  const content=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(content);
 }catch(e){if(res.headersSent){res.destroy();return;}res.writeHead(e.status||(e.code==='ENOENT'?404:500),{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.status?e.message:e.code==='ENOENT'?'Not found':'Server error. Check server configuration.'}));if(!e.status&&e.code!=='ENOENT')console.error(e.message);}
});
server.listen(port,demo?'127.0.0.1':'0.0.0.0',()=>console.log(`Nix Music: http://localhost:${port} (${demo?'local demo':'production'})`));
setInterval(async()=>{const now=Date.now();for(const [k,s]of sessions)if(s.expires<now)sessions.delete(k);for(const [k,l]of limits)if(now-l.t>120000)limits.delete(k);for(const [k,r]of rooms)if(now-r.lastActive>86400000)rooms.delete(k);try{await mediaCache.trim();}catch(error){console.warn('Cache cleanup:',error.message);}},60000).unref();
async function bot(){
 const me=await telegram('getMe',{});botId=me.id;process.env.BOT_USERNAME=me.username;
 const webhook=await telegram('getWebhookInfo',{});
 if(webhook.url)throw Error('This bot has an existing webhook. Remove it before using polling.');
 await syncBotMenu(telegram,base);
 let offset=0;console.log('Telegram polling started');
 while(true){try{const updates=await telegram('getUpdates',{offset,timeout:25,allowed_updates:['message','my_chat_member','callback_query']});for(const update of updates){offset=update.update_id+1;try{
  const callback=update.callback_query;
  if(callback){
   let notice='Unknown action';
   try{
    if(!['music:admins','music:everyone'].includes(callback.data))throw fail('Unknown action');
    if((await get('users',callback.from.id))?.banned)throw fail('Account suspended',403);
    const chat=callback.message?.chat;if(!chat||!['group','supergroup'].includes(chat.type))throw fail('Use settings in a group');
    const r=await manager.group(callback.from,chat);await manager.settings(r,callback.from,callback.data==='music:admins');notice=callback.data==='music:admins'?'Music control: group admins only':'Music control: all members';
   }catch(error){notice=error.message;}
   await telegram('answerCallbackQuery',{callback_query_id:callback.id,text:notice.slice(0,180),show_alert:true});continue;
  }
  const member=update.my_chat_member;if(member){const c=member.chat;if(['group','supergroup'].includes(c.type)){const old=await get('groups',c.id);if(old?.banned){await telegram('leaveChat',{chat_id:c.id});continue;}await save('groups',c.id,{title:c.title,active:!['left','kicked'].includes(member.new_chat_member.status)});if(!['administrator','creator'].includes(member.new_chat_member.status)){for(const r of rooms.values())if(r.group===c.id)applyControl(r,{playing:false});}}continue;}
  const m=update.message;if(!m?.from||!m.text)continue;const group=['group','supergroup'].includes(m.chat.type);if((await get('users',m.from.id))?.banned)continue;
  if(group){if((await get('groups',m.chat.id))?.banned){await telegram('leaveChat',{chat_id:m.chat.id});continue;}await save('groups',m.chat.id,{title:m.chat.title,active:true});}
  const parsed=commandOf(m.text,process.env.BOT_USERNAME);if(!parsed)continue;
  const command='/'+parsed.name;const reply=(text,reply_markup)=>telegram('sendMessage',{chat_id:m.chat.id,text,reply_markup});
  rate(`botcommand:${m.from.id}`,12);
  if(m.chat.type==='private'&&command==='/start'&&await handleRoomStart({args:parsed.args,user:m.from,restoreRoom,manager,base,send:reply}))continue;
  if(await handleGroupCommand({message:m,command:parsed,manager,search,send:reply,username:process.env.BOT_USERNAME}))continue;
  if(command==='/id'){await reply(`Your Telegram ID: ${m.from.id}\nChat ID: ${m.chat.id}`);continue;}
  if(command==='/help'){await reply('Use /room to join your group room, /play song name to queue, /pause, /resume, /skip, /queue, /settings. Group admins can use /settings admins or /settings everyone. Use /id to see IDs. Owner moderation and group broadcasts are in the Mini App. Audio plays in the Mini App, not in a Telegram voice chat.');continue;}
  if(!['/start','/room'].includes(command))continue;
  let r;if(group){try{await manager.requireBotAdmin(m.chat.id);}catch(error){await reply(error.message);continue;}r=await manager.group(m.from,m.chat);}else if(command==='/room'){await reply('Rooms are for Telegram groups. Add Nix Music as a group admin, then send /room there. Private listening stays independent.',startButtons(process.env.BOT_USERNAME,base));continue;}
  if(!group&&command==='/start'){await reply('Welcome to Nix Music. Listen on your own or bring your group together.\n\nAdd me to a group as an administrator, then send /play song name. Every member can queue, pause and skip by default. Group admins can enable restricted controls in /settings.',startButtons(process.env.BOT_USERNAME,base));continue;}
  const link=`https://t.me/${process.env.BOT_USERNAME}?start=${r?'room_'+r.id:'music'}`;
  await telegram('sendMessage',{chat_id:m.chat.id,text:r?`Listen together in ${r.name}. Open the room and tap play to enable audio.`:'Your next favorite sound is here. Open Nix Music.',reply_markup:{inline_keyboard:[[group?{text:r?'Join listening room':'Open Nix Music',url:link}:{text:r?'Join listening room':'Open Nix Music',web_app:{url:r?`${base}?room=${r.id}`:base}}]]}});
 }catch(e){console.error('Bot update:',e.message);}}}catch(e){const delay=retryDelay(e);console.error(`Bot polling: ${e.message}. Retrying in ${Math.ceil(delay/1000)} seconds.`);await new Promise(r=>setTimeout(r,delay));}}
}
if(!demo)bot().catch(e=>{console.error('Bot setup failed:',e.message);process.exit(1);});
