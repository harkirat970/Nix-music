export function launchRoomId({roomId,search='',startParam=''}){
 const params=new URLSearchParams(search);
 for(const value of [roomId,params.get('room'),startParam,params.get('tgWebAppStartParam')]){
  const id=String(value||'').replace(/^room_/,'');
  if(/^[a-f0-9]{18}$/.test(id))return id;
 }
 return null;
}
