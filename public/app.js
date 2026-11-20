import {artworkUrl,displayDuration,activeLyricIndex} from './player-utils.js';
import {avatarMarkup,renderProfile} from './profile.js';
import {queueAfter,shuffled,roomUiKey} from './queue-utils.js';
import {launchRoomId} from './room-launch.js';
const $=s=>document.querySelector(s), main=$('#main'), audio=$('#audio');
const paths={home:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',trending:'m3 17 6-6 4 4 8-11M15 4h6v6',profile:'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',rooms:'M16 21v-2a5 5 0 0 0-10 0v2M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M18 4a4 4 0 0 1 0 8M21 21v-2a5 5 0 0 0-3-4',play:'m9 5 11 7-11 7Z',pause:'M8 5v14M16 5v14',next:'m5 5 10 7-10 7ZM19 5v14',prev:'m19 5-10 7 10 7ZM5 5v14',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',shuffle:'m3 4 18 16M17 20h4v-4M3 20l6-6M15 8l6-4M17 4h4v4',repeat:'M4 7h13l3 3M17 4l3 3v3M20 17H7l-3-3M7 20l-3-3v-3',volume:'m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',expand:'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',arrow:'M5 12h14m-5-5 5 5-5 5',plus:'M12 5v14M5 12h14',close:'m6 6 12 12M6 18 18 6',down:'m6 9 6 6 6-6',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',queue:'M4 6h16M4 12h12M4 18h8',shield:'m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z',copy:'M8 8h13v13H8ZM16 8V3H3v13h5',headphones:'M3 14v-3a9 9 0 0 1 18 0v3M3 12h4v9H3ZM17 12h4v9h-4Z'};
const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n]||paths.play}"/></svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let loadingTrack=false,lyricsOpen=false,roomReceivedAt=0,roomAudioEnabled=true;
function acceptRoom(value){if(room?.id===value.id&&(value.revision<room.revision||(value.revision===room.revision&&value.serverTime<room.serverTime)))return room;room=value;roomReceivedAt=performance.now();return room;}
function waitForMetadata(){if(audio.readyState>=1)return Promise.resolve();return new Promise((resolve,reject)=>{const finish=error=>{clearTimeout(timer);audio.removeEventListener('loadedmetadata',loaded);audio.removeEventListener('error',failed);error?reject(error):resolve();},loaded=()=>finish(),failed=()=>finish(Error('Audio could not load. Try again.')),timer=setTimeout(()=>finish(Error('Audio loading timed out.')),20000);audio.addEventListener('loadedmetadata',loaded,{once:true});audio.addEventListener('error',failed,{once:true});audio.load();});}
const lyricsCache=new Map();
let searchGeneration=0,recentPlayed=[];
let privateQueue=[],playHistory=[],playerKey='',railKey='',queueKey='',queueReturn=false,demoObjectUrl=null;
let session,tracks=[],current,page='home',playing=false,shuffle=false,repeat=false,room=null,filter='All',searchResults=null,roomTimer,toastTimer,playGeneration=0,refreshing=false;
const names={home:'Home',search:'Search',trending:'Trending',rooms:'Rooms',profile:'Profile',admin:'Owner console'};
async function api(path,body){const r=await fetch(`/api${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
const time=n=>`${Math.floor((n||0)/60)}:${String(Math.floor((n||0)%60)).padStart(2,'0')}`;
function art(t,classes='cover'){return `<div class="${classes} art ${esc(t.art||'orbit')}">${t.thumbnail?`<img src="${esc(artworkUrl(t.thumbnail))}" data-original="${esc(t.thumbnail)}" alt="" loading="${classes.includes('full-art')?'eager':'lazy'}" decoding="async">`:''}</div>`;}
const heart=()=>session.user.likes?.includes(current?.id);
function nav(){for(const target of ['desktop-nav','mobile-nav'])$(`#${target}`).innerHTML=Object.keys(names).filter(k=>k!=='admin'||session.owner).map(k=>`<button data-page="${k}" class="${target==='desktop-nav'?'nav-item ':''}${page===k?'active':''}" aria-label="${names[k]}" ${page===k?'aria-current="page"':''}>${icon(k==='admin'?'shield':k)}<span>${names[k]}</span>${k==='rooms'&&target==='desktop-nav'?'<span class="new">LIVE</span>':''}</button>`).join('');$('#page-name').textContent=page==='home'?'Discover':names[page];}
function heading(title,subtitle){return `<div class="intro"><div>${subtitle?`<p>${subtitle}</p>`:''}<h1>${title}</h1></div><span class="date-label">${new Intl.DateTimeFormat('en',{month:'short',day:'numeric',weekday:'short'}).format(new Date())}</span></div>`;}
function section(title,action='',label='See all'){return `<div class="section-heading"><h2>${title}</h2>${action?`<button class="text-button" ${action}>${label} ${icon('arrow')}</button>`:''}</div>`;}
function song(t,index){return `<button class="chart-row" data-play="${esc(t.id)}"><span class="rank">${String(index+1).padStart(2,'0')}</span>${art(t)}<span class="song-meta"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span><span class="duration">${time(t.duration)}</span>${icon('play')}</button>`;}
function cards(items){return `<div class="card-grid">${items.map(t=>`<button class="music-card" data-play="${esc(t.id)}">${art(t,'tile')}<span class="card-copy"><h3>${esc(t.title)}</h3><p>${esc(t.genre||t.artist)}</p></span><span class="card-play" aria-hidden="true">${icon('play')}</span></button>`).join('')}</div>`;}
function topPicks(items){return `<div class="section-heading picks-heading"><div><h2>Top Picks</h2></div><span class="picks-swipe">Swipe to explore ${icon('arrow')}</span></div><div class="picks-carousel" aria-label="Top picks">${items.slice(0,6).map((t,i)=>`<button class="pick-card" data-play="${esc(t.id)}" aria-label="Play ${esc(t.title)}"><span class="pick-label">${i===0?'IN THE SPOTLIGHT':'PICKED FOR YOU'}</span>${art(t,'pick-art')}<span class="pick-caption"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small><span class="pick-play" aria-hidden="true">${icon('play')}</span></span></button>`).join('')}</div>`;}
function recentSection(){return recentPlayed.length?section('Recently Played')+cards(recentPlayed):'';}
function sampleHome(){return `${heading('Listen Now','NIX MUSIC')}${topPicks(tracks)}${recentSection()}${section('Made for your mood','data-page="search"','Explore')}${cards(tracks.slice(0,6))}`;}

function searchPage(){return `${heading('Your next obsession.','DISCOVER SOMETHING NEW')}<form id="search-form" class="search-box">${icon('search')}<input name="q" aria-label="Search music" placeholder="Artists, songs, and a little serendipity…" maxlength="150" autocomplete="off"><button type="submit">Search</button></form>${session.liveMusic?'<p class="source-note">Search songs, albums, and artists on Nix Music.</p>':'<p class="notice">Offline sample catalog</p>'}<div id="search-results">${searchResults?section('Search results')+ (searchResults.length?searchResults.map(song).join(''):'<div class="empty">No tracks found. Try another artist or song.</div>'):''}</div>${section('Browse your mood')}<div class="genre-grid">${['Pop','Electronic','Indie','Hip-Hop','Chill','Focus'].map((g,i)=>`<button class="genre art ${['bloom','orbit','dust','chrome','daylight','midnight'][i]}" data-genre="${g}"><span>${g}</span></button>`).join('')}</div>`;}
function sampleTrending(){return `${heading('In heavy rotation.','THE SOUNDS WE KEEP COMING BACK TO')}<p class="notice">Nix Music editorial picks${session.demo?' · Sample catalog':''}. Live popularity charts are not connected.</p><section class="hero"><div class="hero-art art midnight"></div><div class="hero-content"><span class="hero-kicker">✦ EDITOR’S PICK</span><h2>Midnight Static</h2><p>After hours. Beyond the ordinary.</p><div class="hero-bottom"><button class="primary" data-play="demo-midnight">${icon('play')} Listen now</button></div></div></section>${section('The Nix Music chart')} ${[...tracks].reverse().map(song).join('')}`;}
function profile(){return renderProfile({user:session.user,owner:session.owner,demo:session.demo,room,tracks,esc,icon,section,song});}

async function render(){
 main.dataset.page=page;main.classList.add('page-enter');if(!matchMedia('(prefers-reduced-motion: reduce)').matches)main.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:200,easing:'ease-out'});nav();
 if(page==='home'){if(session.liveMusic)return renderDiscovery('home');main.innerHTML=sampleHome();return;}
 if(page==='search'){main.innerHTML=searchPage();return;}
 if(page==='trending'){if(session.liveMusic)return renderDiscovery('trending');main.innerHTML=sampleTrending();return;}
 if(page==='profile'){main.innerHTML=profile();enhanceProfile();return;}
 if(page==='rooms')return renderRooms();
 if(page==='admin')return renderAdmin();
}
function rail(){const key=JSON.stringify([current?.id,roomUiKey(room),privateQueue.map(t=>t.id),heart(),session.liveMusic]);if(key===railKey)return;railKey=key;const t=current||tracks[0];if(!t){$('#right-rail').innerHTML='<div class="empty">Find a song to start your soundtrack.</div>';return;}$('#right-rail').innerHTML=`<div class="rail-title"><h3>Your soundtrack</h3><span>NOW PLAYING</span></div>${art(t,'rail-cover')}<div class="rail-song"><div><h3>${esc(t.title)}</h3><p>${esc(t.artist)}</p></div><button class="icon-button heart ${heart()?'liked':''}" data-action="like" aria-label="Like track">${icon('heart')}</button></div><div class="rail-label">${!session.liveMusic?'NIX MUSIC DEMO SESSION':room?'LISTENING TOGETHER':'YOUR PERSONAL MIX'}</div><div class="room-promo"><span class="eyebrow"><i class="live-dot"></i> &nbsp; SHARED FREQUENCIES</span><h3>Good music finds good company.</h3><p>Open your Telegram group’s room.<br>Listen together, in sync.</p><div class="avatar-stack"><span>♫</span><span>✦</span><span>♡</span><small>${room?room.members.length+' in your room':'Your people belong here'}</small></div><button class="primary" data-page="rooms">${icon('rooms')} ${room?'Back to your room':'Group listening'}</button></div><div class="section-heading"><h3>Up next</h3><button class="text-button" data-action="queue">View queue</button></div>${(room?room.queue:privateQueue).slice(0,3).map(t=>`<button class="queue-row" style="width:100%;text-align:left" data-action="queue">${art(t)}<span class="song-meta"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span><span class="duration">${time(t.duration)}</span></button>`).join('')}`;}
function transport(){return `<div class="transport"><button class="shuffle ${shuffle?'active-control':''}" data-action="shuffle" aria-label="Shuffle" aria-pressed="${shuffle}">${icon('shuffle')}</button><button class="prev" data-action="prev" aria-label="Previous">${icon('prev')}</button><button class="play-button" data-action="toggle" aria-label="${playing?'Pause':'Play'}">${icon(playing?'pause':'play')}</button><button data-action="next" aria-label="Next">${icon('next')}</button><button class="repeat ${repeat?'active-control':''}" data-action="repeat" aria-label="Repeat" aria-pressed="${repeat}">${icon('repeat')}</button></div>`;}
function timeline(){const duration=displayDuration(audio.duration,current?.duration);return `<div class="timeline"><span class="elapsed">${time(audio.currentTime)}</span><input class="seek" aria-label="Playback position" type="range" min="0" max="${duration||1}" value="${audio.currentTime}" step="1" ${!audio.src||loadingTrack?'disabled':''}><span class="total">${duration?time(duration):'—:—'}</span></div>`;}

function player(){if(!$('#overlay').hidden&&$('.queue-panel'))renderQueue();rail();const key=JSON.stringify([current,playing,loadingTrack,heart(),room?.id,room?.name,room?.canControl,shuffle,repeat,audio.volume,!!audio.src]);if(key===playerKey){updateTimeline();return;}playerKey=key;const t=current;if(!t){$('#mini-player').innerHTML='<span class="song-meta">Search for a song to start listening.</span>';rail();return;}$('#mini-player').innerHTML=`<button class="player-track" data-action="expand" aria-label="Open full player">${art(t)}<span class="song-meta"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span></button><button class="player-heart heart ${heart()?'liked':''}" data-action="like" aria-label="Like">${icon('heart')}</button><div class="player-controls">${transport()}${timeline()}</div><div class="player-tools"><button data-action="queue" aria-label="Queue">${icon('queue')}</button>${icon('volume')}<input id="volume" aria-label="Volume" type="range" min="0" max="1" step="0.01" value="${audio.volume}"><button data-action="expand" aria-label="Expand player">${icon('expand')}</button></div>`;rail();if(!$('#overlay').hidden && $('.full-player'))expand();}
function expand(){
 if(!current)return;const wasOpen=!$('#overlay').hidden&&!!$('.full-player'),oldScroll=$('#overlay').scrollTop;
 $('#overlay').hidden=false;$('#overlay').innerHTML=`<div class="player-atmosphere" aria-hidden="true">${art(current,'atmosphere-art')}</div><div class="full-player ${wasOpen?'is-open':''}" role="dialog" aria-label="Now playing"><div class="sheet-handle" aria-hidden="true"></div><div class="full-header"><button class="icon-button" data-action="close" aria-label="Close player">${icon('down')}</button><p>PLAYING FROM<strong>${room?esc(room.name):'Your music'}</strong></p><button class="icon-button" data-action="queue" aria-label="Queue">${icon('queue')}</button></div>${art(current,'full-art')}<div class="listener-chip"><span class="chip-avatar">${avatarMarkup(session.user,esc)}</span><span>${room?esc(room.name):esc(session.user.first_name)}</span></div><div class="rail-song"><div><h3>${esc(current.title)}</h3><p>${esc(current.artist)}</p></div><button class="icon-button heart ${heart()?'liked':''}" data-action="like" aria-label="Like track">${icon('heart')}</button></div><p class="play-status" role="status">${loadingTrack?'Preparing your track…':audio.error?'Could not load audio. Tap play to retry.':''}</p>${timeline()}<div class="full-transport">${transport()}</div><div class="full-volume">${icon('volume')}<input data-volume aria-label="Player volume" type="range" min="0" max="1" step="0.01" value="${audio.volume}">${icon('volume')}</div><div class="full-bottom"><button data-action="lyrics" aria-expanded="${lyricsOpen}">${icon('queue')}<span>Lyrics</span></button><button class="listening-pill" data-action="share">${icon('rooms')}<span>${room?room.members.length+' listening':'Listen together'}</span></button><button data-action="queue">${icon('queue')}<span>Queue</span></button></div>${!session.liveMusic?'<p class="sample-caption">Original ambient preview</p>':''}<section id="lyrics-panel" class="lyrics-panel glass" ${lyricsOpen?'':'hidden'}></section></div>`;
 if(wasOpen)$('#overlay').scrollTop=oldScroll;if(lyricsOpen)loadLyrics(current.id);
}

function modal(title,content,submit,label='Save'){$('#overlay').hidden=false;$('#overlay').innerHTML=`<form class="modal" id="modal-form"><h2>${title}</h2>${content}<div class="modal-actions"><button type="button" data-action="close">Cancel</button><button class="primary" type="submit">${label}</button></div></form>`;$('#modal-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await submit(new FormData(e.target));$('#overlay').hidden=true;}catch(e){toast(e.message);}finally{button.disabled=false;}};$('#overlay input')?.focus();}
function closeOverlay(){const back=!!$('.queue-panel')&&queueReturn;queueReturn=false;if(back)expand();else{$('#overlay').hidden=true;$('#mini-player button')?.focus();}}
function renderQueue(open=false){
 const items=room?room.queue:privateQueue,now=room?room.track:current;
 const key=JSON.stringify([now,items,room?.revision,room?.canControl,playing]);
 if(!open&&key===queueKey)return;queueKey=key;
 const overlay=$('#overlay'),scroll=$('.queue-list')?.scrollTop||0,focused=document.activeElement?.dataset?.removeQueue;
 overlay.hidden=false;overlay.innerHTML=`<section class="modal queue-panel" role="dialog" aria-modal="true" aria-labelledby="queue-title"><header class="queue-heading"><div><p class="eyebrow">${room?'GROUP LISTENING':'YOUR MUSIC'}</p><h2 id="queue-title">Listening queue</h2></div><button class="icon-button" data-action="close" aria-label="${queueReturn?'Back to player':'Close queue'}">${icon('close')}</button></header><p class="queue-caption">${room?'Shared with '+esc(room.name):'Songs play in the order below.'}</p><h3>Now playing</h3>${now?`<div class="queue-item queue-current">${art(now)}<span class="song-meta"><strong>${esc(now.title)}</strong><small>${esc(now.artist)}</small></span><span class="queue-badge">${playing?'Playing':'Paused'}</span></div>`:'<div class="empty">Nothing playing yet.</div>'}<h3>Up next <span>${items.length}</span></h3><div class="queue-list">${items.length?items.map((t,i)=>`<div class="queue-item"><span class="queue-number">${i+1}</span>${art(t)}<span class="song-meta"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span>${!room||room.canControl?`<button class="icon-button" data-remove-queue="${i}" data-revision="${room?.revision??0}" aria-label="Remove ${esc(t.title)} from queue">${icon('close')}</button>`:''}</div>`).join(''):'<div class="empty">You’re all caught up.<br>Choose music from Home or Search.</div>'}</div>${room&&!room.canControl?'<p class="queue-caption">Only group admins can edit this queue.</p>':''}</section>`;
 if(open)$('.queue-heading button').focus();else{if($('.queue-list'))$('.queue-list').scrollTop=scroll;if(focused!==undefined)$(`[data-remove-queue="${focused}"]`)?.focus();}
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-remove-queue]');if(!button)return;
 button.disabled=true;
 try{const index=Number(button.dataset.removeQueue);if(room)await control({removeIndex:index,revision:Number(button.dataset.revision)});else privateQueue.splice(index,1);renderQueue();rail();}
 catch(error){toast(error.message);button.disabled=false;}
});
document.addEventListener('keydown',event=>{
 if(event.key!=='Tab'||$('#overlay').hidden)return;
 const buttons=[...$('#overlay').querySelectorAll('button:not(:disabled),input:not(:disabled),select,textarea,a[href]')].filter(x=>x.getClientRects().length);
 const first=buttons[0],last=buttons.at(-1);if(!first)return;
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
function demoAudio(index){const sr=22050,seconds=30,n=sr*seconds,buffer=new ArrayBuffer(44+n*2),v=new DataView(buffer);const str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*2,true);const root=[130.81,146.83,110,164.81,98,174.61][Math.max(0,index)%6];for(let i=0;i<n;i++){const t=i/sr,fade=Math.min(t/2,(seconds-t)/3,1),p=t%3,env=Math.exp(-p*1.3);let s=0;for(const ratio of [1,1.25,1.5,2])s+=Math.sin(2*Math.PI*root*ratio*t)*.036*(.6+.4*Math.sin(t*.5));s+=Math.sin(2*Math.PI*root*[2,2.5,3,4][Math.floor(t/3)%4]*t)*env*.08;v.setInt16(44+i*2,s*fade*32767,true);}return URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));}
async function play(id,remote=false,keepQueue=false){
 if(room&&!remote){const roomId=room.id;if(!room.canQueue)throw Error('Only group admins can add music.');const result=await api(`/rooms/${roomId}/queue`,{id});if(room?.id!==roomId)return;acceptRoom(result);toast('Added to the shared queue');await syncRoom();if(page==='rooms')await renderRooms();return;}
 const gen=++playGeneration,t=tracks.find(t=>t.id===id)||searchResults?.find(t=>t.id===id)||room?.queue.find(t=>t.id===id)||room?.track;
 if(!t)return;if(!remote&&!keepQueue){const source=page==='search'&&searchResults?.some(x=>x.id===id)?searchResults:tracks;privateQueue=queueAfter(source,id);if(shuffle)privateQueue=shuffled(privateQueue);playHistory=[];}audio.pause();if(demoObjectUrl){URL.revokeObjectURL(demoObjectUrl);demoObjectUrl=null;}playing=false;current=t;loadingTrack=true;audio.removeAttribute('src');audio.load();player();
 try{
  const data=await api('/play',{id});if(gen!==playGeneration)return;
  audio.src=data.demo?(demoObjectUrl=demoAudio(tracks.findIndex(t=>t.id===id))):data.url;
  if(remote){await waitForMetadata();if(gen!==playGeneration)return;}else{await audio.play();if(gen!==playGeneration)return;playing=true;recentPlayed=[t,...recentPlayed.filter(x=>x.id!==t.id)].slice(0,12);}

 }catch(e){if(gen===playGeneration){playing=false;if(e.name==='NotAllowedError'){roomAudioEnabled=false;toast('Tap play to enable audio on this device.');}else{audio.removeAttribute('src');audio.load();toast(e.message);}} }
 finally{if(gen===playGeneration){loadingTrack=false;player();}}
}

async function control(data){if(!room)return;const id=room.id,result=await api(`/rooms/${id}/control`,data);if(room?.id!==id)return;acceptRoom(result);await syncRoom();}
async function next(direction=1){
 if(room){if(!room.canControl)throw Error('Only authorized room controllers can skip.');await control(direction<0?{position:0}:{next:true});return;}
 if(direction<0){if(audio.currentTime>3){audio.currentTime=0;return;}const previous=playHistory.pop();if(previous){if(current)privateQueue.unshift(current);await play(previous.id,false,true);}return;}
 const upcoming=privateQueue.shift();if(!upcoming){audio.pause();playing=false;player();toast('Queue finished. Choose another song.');return;}if(current)playHistory.push(current);await play(upcoming.id,false,true);
}

async function action(name){if(name==='close'){closeOverlay();return;}if(name==='expand')return expand();if(name==='lyrics'){lyricsOpen=!lyricsOpen;expand();return;}if(name==='toggle'){
 if(loadingTrack)return;
 if(room){
  if(!roomAudioEnabled){roomAudioEnabled=true;await syncRoom();return;}
  if(room.canControl){await control({playing:!room.playing});return;}
  roomAudioEnabled=audio.paused;if(roomAudioEnabled)await syncRoom();else audio.pause();playing=!audio.paused;player();toast(roomAudioEnabled?'Room audio enabled':'Muted on this device');return;
 }
 if(!audio.src){if(!current){toast('Choose a song first');return;}return play(current.id);}
 if(audio.paused)await audio.play();else audio.pause();playing=!audio.paused;player();
}if(name==='next')await next();if(name==='prev')await next(-1);if(name==='shuffle'){if(room){toast('Rooms play the shared queue in order.');return;}shuffle=!shuffle;if(shuffle)privateQueue=shuffled(privateQueue);player();}if(name==='repeat'){if(room){toast('Rooms automatically advance through the shared queue.');return;}repeat=!repeat;player();}if(name==='like'){if(!current)return;session.user=await api('/profile',{like:current.id});player();if(page==='profile')await render();}if(name==='share'){$('#overlay').hidden=true;page='rooms';await render();}if(name==='queue'){queueReturn=!!$('.full-player')&&!$('#overlay').hidden;renderQueue(true);}}

async function renderRooms(){if(room){main.innerHTML=`${heading('Together sounds better.','YOUR LISTENING ROOM')}<div class="room-card glass"><span class="eyebrow"><i class="live-dot"></i> LIVE ROOM</span><h2 style="margin-top:15px">${esc(room.name)}</h2><p>${room.group?(room.adminsOnly?'Admin control is on. Only group admins can add or control music.':'Everyone in this group can queue and control music.'):'The host controls playback; guests can add songs.'}</p><p class="room-presence">${room.members.length} listening · ${room.queue.length} in queue</p><div class="room-members">${room.members.map(m=>`<span class="member">${esc(m.name)}${!room.group&&m.id===room.host?' ♛':''}</span>`).join('')}</div><button class="primary" id="invite-room">${icon('copy')} Copy invite</button><button class="text-button" style="display:inline-flex" id="leave-room">Leave room</button>${room.canManage?`<button class="chip room-permission" id="room-admin-toggle" role="switch" aria-checked="${room.adminsOnly}" aria-label="Admin-only music controls">${icon('shield')} Admin-only control <strong>${room.adminsOnly?'On':'Off'}</strong></button>`:''}<button class="chip" id="room-local-audio" aria-pressed="${!roomAudioEnabled}">${roomAudioEnabled?'Mute this device':'Enable audio'}</button><p class="room-state" aria-live="polite">${room.track?`${room.playing?'Playing':'Paused'} · ${esc(room.track.title)}`:'Choose a song to start the room'}</p></div>${section('Room queue','data-page="search"','Add music')}${room.queue.length?room.queue.map((t,i)=>`<div class="settings-row">${i+1}. ${esc(t.title)} · ${esc(t.artist)}</div>`).join(''):'<div class="empty">The queue is open. Find a song and add your energy.</div>'}`;return;}main.innerHTML=`${heading('Your group. Your soundtrack.','GROUP LISTENING')}<div class="room-card glass"><h2>Listen with your Telegram group</h2><p>Send <strong>/room</strong> or <strong>/play song name</strong> in your group, then tap <strong>Join group room</strong>.</p><p>Only members of that group can join. Its listeners share playback and one queue. Other groups and your private listening stay independent.</p>${session.botUsername?`<a class="primary" href="https://t.me/${esc(session.botUsername)}?startgroup=music&admin=manage_chat" target="_blank" rel="noopener noreferrer">${icon('plus')} Add Nix Music to a group</a>`:''}<p class="notice">Make Nix Music a group admin first. Everyone in the group can control music unless admins enable restrictions.</p></div>`;}

async function joinRoom(id){
 if(room&&room.id!==id)await api(`/rooms/${room.id}/leave`,{});
 acceptRoom(await api(`/rooms/${id}/join`,{}));roomAudioEnabled=true;page='rooms';await render();rail();clearInterval(roomTimer);
 roomTimer=setInterval(()=>heartbeat().catch(e=>{audio.pause();playing=false;player();toast(e.message);}),3000);await syncRoom();
}
async function heartbeat(){if(!room||refreshing)return;const id=room.id;refreshing=true;try{const result=await api(`/rooms/${id}/join`,{});if(room?.id!==id)return;const changed=roomUiKey(room)!==roomUiKey(result);acceptRoom(result);await syncRoom();if(changed&&page==='rooms'&&!document.hidden)await renderRooms();rail();}finally{refreshing=false;}}
async function syncRoom(){
 if(!room||loadingTrack)return;
 if(!room.track){audio.pause();playing=false;player();return;}
 const r=room,received=roomReceivedAt;
 if(current?.id!==r.track.id||!audio.src){if(!tracks.some(t=>t.id===r.track.id))tracks.push(r.track);await play(r.track.id,true);}
 if(!room||room.id!==r.id||room.revision!==r.revision||current?.id!==r.track.id)return;
 const target=r.position+(r.playing?(performance.now()-received)/1000:0);
 if(Number.isFinite(audio.duration)&&Math.abs(audio.currentTime-target)>1.5)audio.currentTime=Math.min(target,audio.duration);
 if(r.playing&&roomAudioEnabled&&audio.paused)try{await audio.play();}catch{roomAudioEnabled=false;toast('Tap play to enable audio on this device.');}
 if(!r.playing||!roomAudioEnabled)audio.pause();playing=!audio.paused;player();
}

async function renderAdmin(){main.innerHTML='<div class="loading">Loading owner console…</div>';const data=await api('/admin');main.innerHTML=`${heading('You’re in control.','OWNER CONSOLE')}<div class="stats glass"><div><strong>${data.users.length}</strong><small>Users</small></div><div><strong>${data.groups.length}</strong><small>Groups</small></div><div><strong>${data.rooms}</strong><small>Rooms</small></div></div>${section('Group announcement')}<p style="font-size:12px;color:var(--muted)">Send a plain-text message to all active, unblocked groups.</p><form id="broadcast-form"><textarea class="field" name="message" required maxlength="4000" rows="4" placeholder="Write your announcement…"></textarea><button class="primary">Review broadcast</button></form>${section('Groups')}${data.groups.map(g=>`<div class="admin-item"><span>${esc(g.title||g.id)}<br><small>${g.id}</small></span><button class="danger" data-ban="${g.id}" data-type="group" data-banned="${!g.banned}">${g.banned?'Unblock':'Block & leave'}</button></div>`).join('')||'<div class="empty">Add the bot to a group to see it here.</div>'}${section('Users')}${data.users.map(u=>`<div class="admin-item"><span>${esc(u.first_name||u.id)}<br><small>${u.id}</small></span><button class="danger" data-ban="${u.id}" data-type="user" data-banned="${!u.banned}">${u.banned?'Unban':'Ban user'}</button></div>`).join('')}`;}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{if(b.dataset.page){page=b.dataset.page;$('#overlay').hidden=true;await render();window.scrollTo({top:0});}if(b.dataset.play)await play(b.dataset.play);if(b.dataset.action)await action(b.dataset.action);if(b.dataset.filter){filter=b.dataset.filter;await render();}if(b.dataset.genre){$('#search-form input').value=b.dataset.genre;$('#search-form').requestSubmit();}if(b.dataset.join)await joinRoom(b.dataset.join);if(b.id==='notifications')modal('You’re all caught up.','<p>Room invitations are shared through Telegram. Bot announcements arrive in your groups.</p>',async()=>{},'Got it');if(b.id==='copy-id'){await navigator.clipboard.writeText(String(session.user.id));toast('Telegram ID copied');}if(b.id==='clear-recent'){searchResults=null;toast('Search results cleared');}if(b.id==='new-playlist')modal('A home for your favorites.','<input class="field" name="name" placeholder="Playlist name" maxlength="60" required>',async f=>{session.user=await api('/profile',{playlist:f.get('name')});await render();});if(b.id==='leave-room'){audio.pause();playing=false;await api(`/rooms/${room.id}/leave`,{});room=null;privateQueue=[];playHistory=[];playGeneration++;loadingTrack=false;clearInterval(roomTimer);await render();rail();player();}if(b.id==='invite-room'){const link=session.botUsername?`https://t.me/${session.botUsername}?start=room_${room.id}`:`${location.origin}/?room=${room.id}`;await navigator.clipboard.writeText(link);toast('Room invitation copied');}if(b.dataset.ban){modal('Confirm moderation',`<p>${b.dataset.banned==='true'?'Block':'Unblock'} ${b.dataset.type} ${b.dataset.ban}?</p>`,async()=>{await api('/admin/ban',{id:Number(b.dataset.ban),type:b.dataset.type,banned:b.dataset.banned==='true'});await renderAdmin();},'Confirm');}}catch(e){toast(e.message);}});
document.addEventListener('submit',async e=>{if(e.target.id==='search-form'){e.preventDefault();const q=new FormData(e.target).get('q');if(!q.trim())return;const generation=++searchGeneration,result=$('#search-results');result.innerHTML='<div class="loading">Finding your frequency…</div>';try{const found=(await api('/search?q='+encodeURIComponent(q))).tracks;if(generation!==searchGeneration)return;searchResults=found;for(const t of searchResults)if(!tracks.some(x=>x.id===t.id))tracks.push(t);if(page==='search')$('#search-results').innerHTML=section('Search results')+(searchResults.length?searchResults.map(song).join(''):'<div class="empty">No results. Try another search.</div>');}catch(err){if(generation!==searchGeneration)return;result.innerHTML=`<div class="notice">${esc(err.message)}</div>`;}}if(e.target.id==='broadcast-form'){e.preventDefault();const message=new FormData(e.target).get('message');modal('Send to all active groups?',`<p style="white-space:pre-wrap">${esc(message)}</p><p>This sends a Telegram message to every active, unblocked group.</p>`,async()=>{toast('Sending broadcast…');const r=await api('/admin/broadcast',{message});toast(`Broadcast complete: ${r.sent} sent, ${r.failed} failed.`);},'Send broadcast');}});
document.addEventListener('change',async e=>{try{if(e.target.matches('.seek')){if(room){if(!room.canControl){toast('Only authorized controllers can seek.');return;}await control({position:Number(e.target.value)});}else audio.currentTime=Number(e.target.value);}if(e.target.id==='volume'||e.target.matches('[data-volume]'))audio.volume=Number(e.target.value);}catch(e){toast(e.message);}});
document.addEventListener('error',e=>{if(e.target.matches?.('.telegram-avatar'))e.target.remove();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeOverlay();});
function updateTimeline(){if(document.hidden)return;const duration=displayDuration(audio.duration,current?.duration);document.querySelectorAll('.seek').forEach(x=>{x.max=duration||1;if(document.activeElement!==x)x.value=audio.currentTime;x.disabled=!audio.src||loadingTrack;});document.querySelectorAll('.elapsed').forEach(x=>x.textContent=time(audio.currentTime));document.querySelectorAll('.total').forEach(x=>x.textContent=duration?time(duration):'—:—');highlightLyrics();}
for(const event of ['timeupdate','loadedmetadata','durationchange'])audio.addEventListener(event,updateTimeline);

audio.addEventListener('ended',async()=>{try{if(room){await heartbeat();return;}if(repeat){audio.currentTime=0;await audio.play();if(room)await control({position:0,playing:true});}else await next();}catch(e){toast(e.message);}});
audio.addEventListener('error',()=>toast('Audio could not load. Try playing this track again.'));
async function init(){
 main.innerHTML='<div class="loading">Connecting to your music…</div>';
 try{
  const tg=window.Telegram?.WebApp;if(tg?.isVersionAtLeast?.('6.1')){tg.setHeaderColor('#000000');tg.setBackgroundColor('#000000');}tg?.ready();tg?.expand();session=await api('/session',{initData:tg?.initData||''});
  tracks=Object.values(session.user.savedTracks||{}).filter(t=>!session.liveMusic||!t.id.startsWith('demo-'));
  if(!session.liveMusic)tracks=(await api('/catalog')).tracks;
  current=tracks[0];$('#mode-tag').textContent=session.liveMusic?'NIX MUSIC':'OFFLINE SAMPLES';
  $('#connection').textContent=session.demo?'Local listener · live music':'Connected to Telegram';
  $('#notifications').innerHTML=icon('bell');$('.avatar').innerHTML=avatarMarkup(session.user,esc);audio.volume=.6;player();
  const id=launchRoomId({roomId:session.roomId,search:location.search,startParam:tg?.initDataUnsafe?.start_param});
  if(id)await joinRoom(id);else await render();
 }catch(e){main.innerHTML=`<div class="notice">${esc(e.message)}</div>`;}
}

function enhanceProfile(){
 const add=document.createElement('button');add.className='primary';add.style.marginTop='20px';add.textContent='Add current track to a playlist';add.onclick=()=>{
  if(!current){toast('Choose a song first.');return;}if(!session.user.playlists.length){toast('Create a playlist first.');return;}
  modal('Save '+esc(current.title),'<select class="field" name="playlist">'+session.user.playlists.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select>',async f=>{session.user=await api('/playlist/track',{playlistId:f.get('playlist'),trackId:current.id});await render();toast('Track saved to playlist');});
 }; main.append(add);
 for(const p of session.user.playlists){const block=document.createElement('section');block.innerHTML=section(esc(p.name))+(p.tracks?.length?p.tracks.map(id=>session.user.savedTracks?.[id]).filter(Boolean).map(song).join(''):'<div class="empty">No tracks yet. Add the current track using the button above.</div>');main.append(block);}
}

let discoveryGeneration=0,chartCountry='IN';
const discoveryCache=new Map();
function addTracks(items){for(const t of items||[])if(!tracks.some(x=>x.id===t.id))tracks.push(t);if(!current&&tracks.length){current=tracks[0];player();}}
function sourceNote(data){return `<div class="source-note"><span>Fresh discoveries, daily.</span>${data.fetchedAt?`<span>Updated ${new Date(data.fetchedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>`:''}</div>${data.stale?'<p class="notice">Showing your last refresh. New music will be back shortly.</p>':''}`;}

function realHero(t,label){return `<section class="hero real-hero">${art(t,'hero-art')}${art(t,'feature-cover')}<div class="hero-content"><span class="hero-kicker"><i></i> ${esc(label)}</span><h2>${esc(t.title)}</h2><p>${esc(t.artist)}${t.album?' · '+esc(t.album):''}</p><div class="hero-bottom"><button class="primary" data-play="${esc(t.id)}">${icon('play')} Listen now</button><span class="feature-note">Find your next favorite.</span></div></div></section>`;}
async function renderDiscovery(kind,force=false){
 const generation=++discoveryGeneration;
 const key=kind==='home'?`home:${filter}`:`charts:${chartCountry}`;
 const top=kind==='home'?heading('Listen Now','NIX MUSIC'):heading('In heavy rotation.','NIX MUSIC CHARTS');
 const chips=kind==='home'?`<div class="chips">${['All','Chill','Workout','Focus','Electronic','Indie'].map(x=>`<button class="chip ${filter===x?'active':''}" data-filter="${x}">${x}</button>`).join('')}</div>`:`<div class="chips">${[['IN','India'],['ZZ','Global'],['US','United States'],['GB','United Kingdom']].map(([code,label])=>`<button class="chip ${chartCountry===code?'active':''}" data-country="${code}">${label}</button>`).join('')}</div>`;
 main.innerHTML=top+chips+'<div id="discovery-body" class="loading">Loading music from Nix Music…</div>';
 try{
  let data=discoveryCache.get(key);
  if(force||!data||Date.now()-(data.fetchedAt||0)>1800000){
   data=await api(kind==='home'?(filter==='All'?'/home':'/search?q='+encodeURIComponent(filter+' music')):'/trending?country='+chartCountry);
   discoveryCache.set(key,data);
  }
  addTracks(data.tracks);
  if(generation!==discoveryGeneration||page!==kind)return;
  const body=$('#discovery-body');body.className='';
  if(!data.tracks?.length){body.innerHTML='<div class="empty">No tracks are available from this source right now.</div>';return;}
  body.innerHTML=(kind==='home'?topPicks(data.tracks)+recentSection():sourceNote(data)+realHero(data.tracks[0],data.title||'CHART PLAYLIST'))+
   (kind==='trending'?section(esc(data.title||'Top music videos'))+data.tracks.map(song).join(''):
   (data.sections?.length?data.sections:[{title:filter==='All'?'Discover':filter+' songs',tracks:data.tracks}]).map(s=>section(esc(s.title))+cards(s.tracks.slice(0,6))).join(''));
 }catch(e){if(generation!==discoveryGeneration||page!==kind)return;$('#discovery-body').className='';$('#discovery-body').innerHTML=`<div class="notice">${esc(e.message)}</div><button class="primary" id="retry-discovery">Try again</button><button class="text-button" style="margin-top:20px" data-page="search">Search for a song instead</button>`;}
}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.country){chartCountry=b.dataset.country;await renderDiscovery('trending');}if(b.id==='retry-discovery')await renderDiscovery(page,true);});
init();

for(const event of ['play','pause','ended'])audio.addEventListener(event,()=>document.body.classList.toggle('music-playing',!audio.paused&&!audio.ended));

document.addEventListener('error',e=>{const img=e.target;if(img.matches?.('.art img')&&img.dataset.original&&img.src!==img.dataset.original){img.src=img.dataset.original;}},true);
async function loadLyrics(id){
 const panel=$('#lyrics-panel');if(!panel)return;
 panel.innerHTML='<p class="lyrics-message">Finding lyrics…</p>';
 try{
  if(lyricsCache.size>=30&&!lyricsCache.has(id))lyricsCache.delete(lyricsCache.keys().next().value);
  if(!lyricsCache.has(id))lyricsCache.set(id,api('/lyrics?id='+encodeURIComponent(id)).catch(e=>{lyricsCache.delete(id);throw e;}));
  const data=await lyricsCache.get(id);if(current?.id!==id||!lyricsOpen||!$('#lyrics-panel'))return;
  $('#lyrics-panel').innerHTML=data.available?`<h3>${data.synced?'Live lyrics':'Lyrics'}</h3><div class="lyrics-lines">${data.lines?.length?data.lines.map((l,i)=>`<p data-lyric="${i}" data-start="${l.start}">${esc(l.text)}</p>`).join(''):`<p class="plain-lyrics">${esc(data.text)}</p>`}</div><small>${esc(data.source||'')}</small>`:'<p class="lyrics-message">Lyrics aren’t available for this track yet.</p>';
  highlightLyrics();
 }catch{if(current?.id===id&&$('#lyrics-panel'))$('#lyrics-panel').innerHTML='<p class="lyrics-message">Lyrics couldn’t load. Close and reopen Lyrics to retry.</p>';}
}
function highlightLyrics(){if(!lyricsOpen)return;const lines=[...document.querySelectorAll('[data-lyric]')];const active=activeLyricIndex(lines.map(x=>({start:Number(x.dataset.start)})),audio.currentTime);lines.forEach((line,i)=>line.classList.toggle('active-line',i===active));}

document.addEventListener('click',async event=>{
 if(event.target.closest('#room-local-audio')&&room){roomAudioEnabled=!roomAudioEnabled;await syncRoom();await renderRooms();}
 if(event.target.closest('#room-admin-toggle')&&room?.canManage){try{acceptRoom(await api(`/rooms/${room.id}/settings`,{adminsOnly:!room.adminsOnly}));await renderRooms();}catch(error){toast(error.message);}}
});

document.addEventListener('input',event=>{if(event.target.matches('[data-volume],#volume')){audio.volume=Number(event.target.value);document.querySelectorAll('[data-volume],#volume').forEach(el=>{if(el!==event.target)el.value=audio.volume;});}});
