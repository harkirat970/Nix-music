import assert from 'node:assert/strict';
const base=process.env.PUBLIC_URL;
const health=await fetch(base+'/api/health').then(r=>r.json());
assert.equal(health.ok,true);assert.equal(health.demo,false);assert.equal(health.liveMusic,true);
const html=await fetch(base).then(r=>r.text());assert.ok(html.includes('Nix Music'));assert.ok(html.includes('https://t.me/Detergentman3'));
const denied=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,401);
const token=process.env.TELEGRAM_BOT_TOKEN||process.env.BOT_TOKEN;
for(const method of ['getChatMenuButton','getMyCommands']){
 const data=await fetch(`https://api.telegram.org/bot${token}/${method}`).then(r=>r.json());assert.equal(data.ok,true);
 if(method==='getChatMenuButton'){assert.equal(new URL(data.result.web_app.url).href,new URL(base).href);console.log('Telegram menu button points to the live Mini App.');}
 else console.log('Registered commands: '+data.result.map(x=>'/'+x.command).join(', '));
}
console.log('Public HTTPS, live mode, Nix Music branding, credit link, and rejection of unsigned sessions verified.');
