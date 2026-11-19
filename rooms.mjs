import {randomBytes} from 'node:crypto';
const denied=message=>Object.assign(Error(message),{status:403});
export function positionAt(room,now=Date.now()){
 return Math.max(0,room.position+(room.playing?(now-room.updated)/1000:0));
}
export function applyControl(room,change,now=Date.now()){
 room.position=positionAt(room,now);
 if(typeof change.position==='number'&&Number.isFinite(change.position))room.position=Math.max(0,Math.min(change.position,room.track?.duration||900));
 if(typeof change.playing==='boolean')room.playing=change.playing&&!!room.track;
 room.updated=now;room.revision++;
}
export class RoomManager{
 constructor({rooms,getGroup,saveGroup,telegram,botId,owners=[],prepare=async t=>t,now=Date.now}){Object.assign(this,{rooms,getGroup,saveGroup,telegram,botId,owners,prepare,now});this.pendingGroups=new Map();}
 async requireBotAdmin(group){
  let member;
  try{const id=typeof this.botId==='function'?this.botId():this.botId;if(!id)throw Error('Bot starting');member=await this.telegram('getChatMember',{chat_id:group,user_id:id});}
  catch{throw denied('Cannot verify Nix Music permissions. Make the bot a group administrator, then try again.');}
  if(!['administrator','creator'].includes(member.status))throw denied('Make Nix Music a group administrator first: Group info → Administrators → Add administrator. Then use /play song name. Everyone in the group can control music by default.');
 }
 create(user,name,group=null,id=randomBytes(9).toString('hex')){
  if(!Number.isSafeInteger(group)||group>=0)throw denied('Listening rooms are only available for Telegram groups.');
  if(this.rooms.size>=500)throw Object.assign(Error('Room limit reached'),{status:429});
  const room={id,name:String(name).slice(0,60),host:user.id,group,members:new Map(),track:null,playing:false,position:0,updated:this.now(),lastActive:this.now(),queue:[],revision:0};
  this.rooms.set(id,room);return room;
 }
 async group(user,chat){
  if(this.pendingGroups.has(chat.id))return this.pendingGroups.get(chat.id);
  const promise=(async()=>{
   const settings=await this.getGroup(chat.id)||{};if(settings.banned)throw denied('This group is blocked.');
   const existing=[...this.rooms.values()].find(r=>r.group===chat.id);if(existing)return existing;
   const id=settings.roomId||randomBytes(9).toString('hex');
   await this.saveGroup(chat.id,{roomId:id,title:chat.title||settings.title||'Group listening room',adminsOnly:settings.adminsOnly===true});
   return this.create(user,chat.title||settings.title||'Group listening room',chat.id,id);
  })().finally(()=>this.pendingGroups.delete(chat.id));
  this.pendingGroups.set(chat.id,promise);return promise;
 }
 async access(room,user){
  if(!room)throw Object.assign(Error('Room not found. Use /room in your group to reopen it.'),{status:404});
  if(!room.group)throw denied('Listening rooms are only available for Telegram groups.');
  const settings=await this.getGroup(room.group)||{};if(settings.banned)throw denied('This group is blocked.');
  await this.requireBotAdmin(room.group);
  let member;
  try{member=await this.telegram('getChatMember',{chat_id:room.group,user_id:user.id});}
  catch{throw denied('Cannot verify group membership. Make the bot a group admin and try again.');}
  if(['left','kicked'].includes(member.status)||(member.status==='restricted'&&!member.is_member))throw denied('Join the Telegram group first.');
  const admin=['creator','administrator'].includes(member.status)||this.owners.includes(user.id);
  const adminsOnly=settings.adminsOnly===true;
  return {canControl:!adminsOnly||admin,canQueue:!adminsOnly||admin,canManage:admin,adminsOnly};
 }
 async settings(room,user,adminsOnly){
  const access=await this.access(room,user);if(!access.canManage)throw denied('Only group admins can change music settings.');
  if(typeof adminsOnly!=='boolean')throw Object.assign(Error('adminsOnly must be true or false'),{status:400});
  await this.saveGroup(room.group,{adminsOnly});room.revision++;return this.view(room,user);
 }
 async enqueue(room,user,track){
  const previous=room.pendingEnqueue||Promise.resolve();
  const task=previous.catch(()=>{}).then(()=>this.enqueuePrepared(room,user,track));
  room.pendingEnqueue=task;
  try{return await task;}finally{if(room.pendingEnqueue===task)delete room.pendingEnqueue;}
 }
 async enqueuePrepared(room,user,track){
  if(!(await this.access(room,user)).canQueue)throw denied('Only group admins can add music while admin control is enabled.');
  if(room.queue.length>=50)throw Object.assign(Error('Queue is full'),{status:400});
  const prepared=await this.prepare(track);
  // Recheck after a potentially slow extraction: settings may have changed.
  if(!(await this.access(room,user)).canQueue)throw denied('Music controls are now restricted to group admins.');
  if(room.queue.length>=50)throw Object.assign(Error('Queue is full'),{status:400});
  if(!room.track){room.track=prepared;room.position=0;room.playing=true;room.updated=this.now();}
  else room.queue.push(prepared);
  room.revision++;room.lastActive=this.now();
 }
 advance(room){
  room.track=room.queue.shift()||null;room.position=0;room.playing=!!room.track;room.updated=this.now();room.revision++;
 }
 async control(room,user,change){
  if(!(await this.access(room,user)).canControl)throw denied(room.group?'Only group admins can control music.':'Only the host can control playback.');
  if(change.id)throw Object.assign(Error('Add tracks to the room queue instead of replacing playback.'),{status:400});
  if(change.next)this.advance(room);else applyControl(room,change,this.now());
  room.lastActive=this.now();
 }
 tick(){for(const room of this.rooms.values())if(room.playing&&room.track?.duration>0&&positionAt(room,this.now())>=room.track.duration)this.advance(room);}
 async view(room,user,access){
  access=access||await this.access(room,user);const now=this.now();
  for(const [id,member]of room.members)if(now-member.seen>18000)room.members.delete(id);
  return {id:room.id,name:room.name,host:room.host,group:room.group,members:[...room.members.values()].map(({seen,...m})=>m),track:room.track,playing:room.playing,position:positionAt(room,now),updated:now,serverTime:now,queue:room.queue,revision:room.revision,...access};
 }
}
