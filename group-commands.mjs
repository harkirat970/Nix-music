export function startButtons(username,base){return {inline_keyboard:[[{text:'Open Nix Music',web_app:{url:base}}],[{text:'Add to group',url:`https://t.me/${username}?startgroup=music&admin=manage_chat`}]]};}
export async function handleRoomStart({args,user,restoreRoom,manager,base,send}){
 const match=/^room_([a-f0-9]{18})$/.exec(args);if(!match)return false;
 try{
  const room=await restoreRoom(match[1],user);await manager.access(room,user);
  const url=new URL(base);url.searchParams.set('room',room.id);
  await send(`Open ${room.name} below. You will join your group's shared playback and queue automatically.`,{inline_keyboard:[[{text:'Open group room',web_app:{url:url.href}}]]});
 }catch(error){await send(error.status?error.message:'Could not open this room. Use /room in your group and try again.');}
 return true;
}
export function commandOf(text,username){
 const match=/^\/(\w+)(?:@([\w]+))?(?:\s+([\s\S]*))?$/.exec(text.trim());
 if(!match||(match[2]&&match[2].toLowerCase()!==username.toLowerCase()))return null;
 return {name:match[1].toLowerCase(),args:(match[3]||'').trim()};
}
export async function handleGroupCommand({message,command,manager,search,send,username}){
 if(!['play','pause','resume','skip','queue','settings'].includes(command.name))return false;
 const chat=message.chat,user=message.from;
 if(!['group','supergroup'].includes(chat.type)){await send('Use this command in a Telegram group.');return true;}
 try{
  const room=await manager.group(user,chat);
  const access=await manager.access(room,user);
  const link={inline_keyboard:[[{text:'Join group room',url:`https://t.me/${username}?start=room_${room.id}`}]]};
  if(command.name==='settings'){
   if(command.args){
    if(!/^(admins|everyone)$/i.test(command.args))throw Error('Use /settings admins or /settings everyone.');
    await manager.settings(room,user,command.args.toLowerCase()==='admins');
   }
   const view=await manager.view(room,user);
   await send(`Music controls: ${view.adminsOnly?'Group admins only':'All group members'}.\nThis applies to adding songs, pause, resume, skip and seeking.`,view.canManage?{inline_keyboard:[[{text:'Admins only',callback_data:'music:admins'},{text:'Everyone',callback_data:'music:everyone'}]]}:undefined);
  }else if(command.name==='queue'){
   await send(`Now: ${room.track?.title||'Nothing playing'}\n\n${room.queue.map((t,i)=>`${i+1}. ${t.title}`).join('\n')||'Queue is empty.'}`.slice(0,4000),link);
  }else if(command.name==='play'&&command.args){
   if(!access.canQueue)throw Error('Only group admins can add music while admin control is enabled.');
   if(command.args.length>150)throw Error('Keep your song search under 150 characters.');
   const results=await search(command.args);if(!results.length)throw Error('No songs found. Try an artist and song title.');
   await manager.enqueue(room,user,results[0]);
   await send(`Added: ${results[0].title}\nOpen the room to listen in sync.`,link);
  }else{
   if(!room.track&&command.name!=='skip'){await send('Nothing is playing. Use /play song name.',link);return true;}
   await manager.control(room,user,command.name==='skip'?{next:true}:{playing:command.name!=='pause'});
   await send(command.name==='skip'?(room.track?`Now playing: ${room.track.title}`:'Queue finished. Use /play song name to add music.'):command.name==='pause'?'Room playback paused.':'Room playback resumed.',link);
  }
 }catch(error){await send(error.status||!error.code?error.message:'Music request failed. Please try again.');}
 return true;
}
