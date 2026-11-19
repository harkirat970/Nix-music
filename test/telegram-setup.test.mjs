import test from 'node:test';
import assert from 'node:assert/strict';
import {commands,syncBotMenu,retryDelay} from '../telegram-setup.mjs';
test('unchanged settings do not trigger writes or profile edits',async()=>{
 const calls=[];await syncBotMenu(async method=>{calls.push(method);if(method==='getMyCommands')return commands;if(method==='getChatMenuButton')return {type:'web_app',text:'Open Nix Music',web_app:{url:'https://example.com/'}};throw Error('Unexpected write');},'https://example.com');
 assert.deepEqual(calls,['getMyCommands','getChatMenuButton']);
});
test('rate-limited optional settings do not prevent bot startup',async()=>{
 const calls=[],warnings=[];await syncBotMenu(async method=>{calls.push(method);if(method==='getMyCommands')return [];if(method==='getChatMenuButton')return {type:'default'};throw Object.assign(Error('429'),{retry:53595});},'https://example.com',message=>warnings.push(message));
 assert.equal(warnings.length,2);assert.ok(!calls.includes('setMyName'));assert.ok(warnings[0].includes('53595'));
 assert.equal(retryDelay({retry:53595}),53595000);assert.equal(retryDelay({}),5000);
});
