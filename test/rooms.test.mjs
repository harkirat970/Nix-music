import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager,positionAt} from '../rooms.mjs';
import {commandOf,handleGroupCommand,startButtons} from '../group-commands.mjs';

function fixture(){
 let now=100000;const groups=new Map(),rooms=new Map(),members=new Map([[99,{status:'administrator'}],[1,{status:'creator'}],[2,{status:'member'}],[3,{status:'administrator'}],[4,{status:'left'}]]);
 const manager=new RoomManager({rooms,botId:99,now:()=>now,getGroup:async id=>groups.get(id),saveGroup:async(id,data)=>groups.set(id,{...groups.get(id),...data}),telegram:async(_,args)=>members.get(args.user_id)||{status:'left'},prepare:async t=>({...t,duration:60})});
 return {manager,groups,rooms,members,advance:seconds=>now+=seconds*1000,chat:{id:-1001,title:'Music group',type:'supergroup'},admin:{id:1},user:{id:2}};
}
test('concurrent group opens share one stable room, including recreation',async()=>{
 const f=fixture();const [a,b]=await Promise.all([f.manager.group(f.admin,f.chat),f.manager.group(f.user,f.chat)]);assert.equal(a,b);assert.equal(f.rooms.size,1);
 f.rooms.clear();assert.equal((await f.manager.group(f.user,f.chat)).id,a.id);
});

test('only Telegram groups can create rooms; groups have independent queues and playback',async()=>{
 const f=fixture();assert.throws(()=>f.manager.create(f.user,'Public room'),/only available for Telegram groups/);
 const a=await f.manager.group(f.user,f.chat),b=await f.manager.group(f.user,{...f.chat,id:-1002});
 await f.manager.enqueue(a,f.user,{id:'group-a'});await f.manager.enqueue(b,f.user,{id:'group-b'});
 await f.manager.control(a,f.user,{playing:false});
 assert.equal(a.playing,false);assert.equal(b.playing,true);assert.equal(b.track.id,'group-b');assert.notEqual(a.id,b.id);
 const call=f.manager.telegram;f.manager.telegram=async(method,args)=>args.chat_id===-1002&&args.user_id===2?{status:'left'}:call(method,args);
 await assert.rejects(f.manager.access(b,f.user),/Join the Telegram group/);
 assert.equal((await f.manager.access(a,f.user)).canControl,true);
});

test('group controls default to everyone and explicit settings survive reopening',async()=>{
 const f=fixture(),r=await f.manager.group(f.admin,f.chat);
 assert.equal(f.groups.get(f.chat.id).adminsOnly,false);
 assert.equal((await f.manager.access(r,f.user)).canControl,true);
 await f.manager.enqueue(r,f.user,{id:'song'});await f.manager.control(r,f.user,{playing:false});assert.equal(r.playing,false);
 await f.manager.settings(r,f.admin,true);f.rooms.clear();
 const reopened=await f.manager.group(f.user,f.chat);assert.equal((await f.manager.access(reopened,f.user)).canControl,false);
});

test('bot must be admin before playback, including demotion during extraction',async()=>{
 const f=fixture(),r=await f.manager.group(f.admin,f.chat);f.members.set(99,{status:'member'});
 await assert.rejects(f.manager.enqueue(r,f.user,{id:'song'}),/Make Nix Music a group administrator/);
 await assert.rejects(f.manager.control(r,f.admin,{playing:true}),/Make Nix Music/);
 f.members.set(99,{status:'administrator'});
 f.manager.prepare=async t=>{f.members.set(99,{status:'member'});return {...t,duration:60};};
 await assert.rejects(f.manager.enqueue(r,f.user,{id:'song'}),/Make Nix Music/);assert.equal(r.track,null);
});

test('start buttons open the app and request group admin setup',()=>{
 const rows=startButtons('nixmusicbot','https://example.com').inline_keyboard;
 assert.equal(rows[0][0].web_app.url,'https://example.com');
 const link=new URL(rows[1][0].url);assert.equal(link.pathname,'/nixmusicbot');assert.equal(link.searchParams.get('startgroup'),'music');assert.equal(link.searchParams.get('admin'),'manage_chat');
});
test('group setting restricts enqueue, pause and settings, even for room creator',async()=>{
 const f=fixture(),r=await f.manager.group(f.user,f.chat);await f.manager.settings(r,f.admin,true);
 await assert.rejects(f.manager.enqueue(r,f.user,{id:'song'}),/Only group admins/);
 await assert.rejects(f.manager.control(r,f.user,{playing:false}),/Only group admins/);
 await assert.rejects(f.manager.settings(r,f.user,false),/Only group admins/);
 assert.equal((await f.manager.access(r,{id:3})).canControl,true);
 await assert.rejects(f.manager.access(r,{id:4}),/Join the Telegram group/);
 f.members.set(4,{status:'restricted',is_member:false});await assert.rejects(f.manager.access(r,{id:4}));
 await f.manager.settings(r,f.admin,false);assert.equal((await f.manager.access(r,f.user)).canQueue,true);
});
test('pause preserves elapsed time, resume continues and server advances exactly once',async()=>{
 const f=fixture(),r=await f.manager.group(f.admin,f.chat);
 await f.manager.enqueue(r,f.user,{id:'first'});await f.manager.enqueue(r,f.user,{id:'second'});
 f.advance(25);await f.manager.control(r,f.user,{playing:false});assert.equal(r.position,25);
 f.advance(20);assert.equal(positionAt(r,145000),25);
 await f.manager.control(r,f.user,{playing:true});f.advance(35);f.manager.tick();assert.equal(r.track.id,'second');assert.equal(r.queue.length,0);
 f.manager.tick();assert.equal(r.track.id,'second');f.advance(60);f.manager.tick();assert.equal(r.track,null);assert.equal(r.playing,false);
});
test('permission is checked again after track preparation',async()=>{
 const f=fixture(),r=await f.manager.group(f.user,f.chat);
 f.manager.prepare=async t=>{await f.manager.settings(r,f.admin,true);return {...t,duration:60};};
 await assert.rejects(f.manager.enqueue(r,f.user,{id:'song'}),/restricted/);assert.equal(r.track,null);
});

test('queue removal respects permissions and rejects stale indices',async()=>{
 const f=fixture(),r=await f.manager.group(f.user,f.chat);
 for(const id of ['now','next','last'])await f.manager.enqueue(r,f.user,{id});
 const revision=r.revision;await f.manager.control(r,f.user,{removeIndex:0,revision});
 assert.equal(r.track.id,'now');assert.deepEqual(r.queue.map(t=>t.id),['last']);
 await assert.rejects(f.manager.control(r,f.user,{removeIndex:0,revision}),/queue changed/);
 await f.manager.settings(r,f.admin,true);
 await assert.rejects(f.manager.control(r,f.user,{removeIndex:0,revision:r.revision}),/Only group admins/);
 await f.manager.control(r,f.admin,{removeIndex:0,revision:r.revision});assert.equal(r.queue.length,0);
});

test('concurrent requests keep queue order and recover after extraction failure',async()=>{
 const f=fixture(),r=await f.manager.group(f.user,f.chat);let release;
 const gate=new Promise(resolve=>release=resolve),started=[];
 f.manager.prepare=async t=>{started.push(t.id);if(t.id==='first')await gate;if(t.id==='bad')throw Error('Unavailable');return {...t,duration:60};};
 const first=f.manager.enqueue(r,f.user,{id:'first'}),second=f.manager.enqueue(r,f.user,{id:'second'});
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(started,['first']);release();await Promise.all([first,second]);
 assert.equal(r.track.id,'first');assert.equal(r.queue[0].id,'second');
 await assert.rejects(f.manager.enqueue(r,f.user,{id:'bad'}),/Unavailable/);
 await f.manager.enqueue(r,f.user,{id:'third'});assert.deepEqual(r.queue.map(t=>t.id),['second','third']);
});
test('commands queue songs into the same group room and deny non-admin settings',async()=>{
 const f=fixture(),sent=[];const invoke=(name,args='',user=f.user)=>handleGroupCommand({message:{chat:f.chat,from:user},command:{name,args},manager:f.manager,search:async()=>[{id:args,title:args}],send:async(text,markup)=>sent.push({text,markup}),username:'nixmusicbot'});
 await invoke('play','First');await invoke('play','Second');const r=await f.manager.group(f.user,f.chat);assert.equal(r.track.id,'First');assert.equal(r.queue[0].id,'Second');
 await invoke('settings','admins');assert.match(sent.at(-1).text,/Only group admins/);
 await invoke('settings','admins',f.admin);await invoke('pause');assert.match(sent.at(-1).text,/Only group admins/);
 await invoke('pause','',f.admin);assert.equal(r.playing,false);
 assert.deepEqual(commandOf('/play@nixmusicbot hello','nixmusicbot'),{name:'play',args:'hello'});assert.equal(commandOf('/play@otherbot hello','nixmusicbot'),null);
});
