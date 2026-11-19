const token=process.env.TELEGRAM_BOT_TOKEN||process.env.BOT_TOKEN;
try{
 const response=await fetch(`https://api.telegram.org/bot${token}/getMe`,{signal:AbortSignal.timeout(20000)}).then(r=>r.json());
 console.log(JSON.stringify({telegram:response.ok,username:response.result?.username,name:response.result?.first_name,error:response.ok?undefined:'Token was rejected'}));
}catch{console.log('Telegram connection failed');}
try{
 const {MongoClient}=await import('mongodb');const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:15000});
 try{await client.connect();await client.db(process.env.MONGODB_DATABASE||'nix_music').command({ping:1});console.log('MongoDB connection and authentication passed');}
 finally{await client.close();}
}catch(e){console.log(JSON.stringify({mongo:false,errorType:e.name,code:e.code,reason:e.code===8000?'Authentication failed':'Check MongoDB network access, DNS, and credentials'}));}
