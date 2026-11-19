import assert from 'node:assert/strict';
const base='http://127.0.0.1:3000';
const session=await fetch(base+'/api/session',{method:'POST',body:'{}'}).then(r=>r.json());
assert.equal(session.liveMusic,true);
async function api(path,body){const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${session.token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
const [home,charts,result]=await Promise.all([api('/home'),api('/trending?country=IN'),api('/search?q=Daft%20Punk%20Get%20Lucky')]);
assert.ok(home.sections.length);assert.ok(home.tracks.length);assert.ok(charts.tracks.length);assert.ok(result.tracks.length);
for(const track of [...home.tracks,...charts.tracks,...result.tracks])assert.match(track.id,/^[\w-]{11}$/);
console.log(JSON.stringify({homeSections:home.sections.map(s=>s.title),chart:charts.title,chartTracks:charts.tracks.length,search:result.tracks[0].title}));
const playback=await api('/play',{id:result.tracks[0].id});assert.ok(playback.url);assert.ok(!playback.demo);
const media=await fetch(base+playback.url,{headers:{Range:'bytes=0-1023'}});
assert.equal(media.status,206);assert.equal(media.headers.get('content-type'),'audio/mpeg');assert.equal((await media.arrayBuffer()).byteLength,1024);
console.log('Real audio extraction, signed media URL and seekable MP3 streaming passed.');
