import test from 'node:test';
import assert from 'node:assert/strict';
import {launchRoomId} from '../public/room-launch.js';
import {withRoomLink} from '../telegram-messages.mjs';
import {handleRoomStart} from '../group-commands.mjs';
const id='abcdef0123456789ab';
test('room handoff uses the current tunnel and checks group membership before sending',async()=>{
 const sent=[],checked=[];
 const args={args:`room_${id}`,user:{id:2},restoreRoom:async key=>({id:key,name:'Our group'}),manager:{access:async(room,user)=>checked.push([room.id,user.id])},base:'https://new-tunnel.example',send:async(text,markup)=>sent.push({text,markup})};
 assert.equal(await handleRoomStart(args),true);
 assert.deepEqual(checked,[[id,2]]);
 assert.equal(sent[0].markup.inline_keyboard[0][0].web_app.url,`https://new-tunnel.example/?room=${id}`);
 await handleRoomStart({...args,base:'https://replacement-tunnel.example'});
 assert.equal(new URL(sent[1].markup.inline_keyboard[0][0].web_app.url).host,'replacement-tunnel.example');
 await handleRoomStart({...args,manager:{access:async()=>{throw Object.assign(Error('Join the Telegram group first.'),{status:403});}}});
 assert.equal(sent[2].markup,undefined);assert.match(sent[2].text,/Join the Telegram group/);
 assert.equal(await handleRoomStart({...args,args:'music'}),false);
});
test('group launch resolves server identity and both Telegram launch formats',()=>{
 assert.equal(launchRoomId({roomId:id}),id);
 assert.equal(launchRoomId({startParam:`room_${id}`}),id);
 assert.equal(launchRoomId({search:`?tgWebAppStartParam=room_${id}`}),id);
 assert.equal(launchRoomId({search:`?room=${id}`}),id);
 assert.equal(launchRoomId({}),null);
 assert.equal(launchRoomId({startParam:'room_invalid'}),null);
 assert.equal(launchRoomId({roomId:id,startParam:'room_111111111111111111'}),id);
});
test('group messages retain inline button and include a bounded clickable fallback',()=>{
 const url=`https://t.me/nixmusicbot?start=room_${id}`;
 const original={chat_id:-1001,text:'a'.repeat(4000),reply_markup:{inline_keyboard:[[{text:'Join group room',url}]]}};
 const result=withRoomLink(original);
 assert.equal(result.reply_markup,original.reply_markup);assert.ok(result.text.endsWith(url));assert.ok(result.text.length<=4096);
 assert.deepEqual(withRoomLink(result),result);
 assert.deepEqual(withRoomLink({text:'Private welcome'}),{text:'Private welcome'});
});
