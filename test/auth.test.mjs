import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validateInitData} from '../auth.mjs';
const token='123:secret';
function signed(age=0){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)-age),query_id:'abc',user:JSON.stringify({id:42,first_name:'Test'})});const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update([...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));return p.toString();}
test('valid Telegram payload resolves signed identity',()=>assert.equal(validateInitData(signed(),token).id,42));
test('tampering with user identity is rejected',()=>assert.throws(()=>validateInitData(signed().replace('Test','Owner'),token),/signature/));
test('expired and future timestamps are rejected',()=>{assert.throws(()=>validateInitData(signed(3601),token),/expired/);assert.throws(()=>validateInitData(signed(-100),token),/expired/);});
test('wrong token, missing and malformed signatures fail closed',()=>{assert.throws(()=>validateInitData(signed(),'wrong'));assert.throws(()=>validateInitData('',token));assert.throws(()=>validateInitData('hash=00',token));});
