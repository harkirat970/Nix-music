import test from 'node:test';
import assert from 'node:assert/strict';
import {queueAfter,shuffled,roomUiKey} from '../public/queue-utils.js';
test('personal queue contains only upcoming tracks and shuffle leaves source intact',()=>{
 const tracks=[{id:'a'},{id:'b'},{id:'c'}];assert.deepEqual(queueAfter(tracks,'b'),[{id:'c'}]);assert.deepEqual(queueAfter(tracks,'c'),[]);
 assert.deepEqual(queueAfter(tracks,'unknown'),[]);assert.deepEqual(shuffled(tracks,()=>0),[{id:'b'},{id:'c'},{id:'a'}]);assert.deepEqual(tracks.map(t=>t.id),['a','b','c']);
});
test('heartbeat position updates do not invalidate room UI, but membership and permissions do',()=>{
 const room={id:'a',revision:1,members:[{id:1}],position:1,updated:1,canControl:true};
 assert.equal(roomUiKey(room),roomUiKey({...room,position:5,updated:5}));
 assert.notEqual(roomUiKey(room),roomUiKey({...room,canControl:false}));
 assert.notEqual(roomUiKey(room),roomUiKey({...room,members:[]}));
});
