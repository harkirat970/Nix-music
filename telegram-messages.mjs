export function withRoomLink(message){
 const buttons=message.reply_markup?.inline_keyboard?.flat()||[];
 const button=buttons.find(b=>b.url&&/^https:\/\/t\.me\/\w+\?start=room_[a-f0-9]{18}$/.test(b.url));
 if(!button||message.text?.includes(button.url))return message;
 const suffix=`\n\nOpen group room: ${button.url}`;
 return {...message,text:String(message.text||'').slice(0,4096-suffix.length)+suffix,link_preview_options:{is_disabled:true}};
}
