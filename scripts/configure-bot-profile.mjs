const token=process.env.TELEGRAM_BOT_TOKEN||process.env.BOT_TOKEN;
async function call(method,body={}){
 const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await response.json();
 if(!data.ok)throw Error(`${method} failed (${data.error_code})`);
 return data.result;
}
try{
 await call('setMyName',{name:'Nix Music'});
 await call('setMyDescription',{description:'Your music. Your people. Listen together with Nix Music.\n\nMade with love by detergentman — t.me/Detergentman3'});
 await call('setMyShortDescription',{short_description:'Music, shared rooms and good company. Made with love by detergentman · t.me/Detergentman3'});
 const me=await call('getMe');
 const description=await call('getMyDescription');
 console.log(JSON.stringify({username:me.username,name:me.first_name,description:description.description}));
}catch(e){console.error(e.message);process.exitCode=1;}
