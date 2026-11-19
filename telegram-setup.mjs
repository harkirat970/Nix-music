// Profile edits are an explicit operation (scripts/configure-bot-profile.mjs),
// never part of an ordinary bot restart.
export const commands=[{command:'start',description:'Open Nix Music'},{command:'room',description:'Join your group listening room'},{command:'play',description:'Queue a song: /play artist song'},{command:'pause',description:'Pause room playback'},{command:'resume',description:'Resume room playback'},{command:'skip',description:'Skip to the next queued song'},{command:'queue',description:'Show the shared queue'},{command:'settings',description:'Group music control settings'},{command:'id',description:'Show your Telegram ID'},{command:'help',description:'Commands and setup'}];

export async function syncBotMenu(call,base,log=console.warn){
 const operations=[
  async()=>{const current=await call('getMyCommands',{});if(JSON.stringify(current)!==JSON.stringify(commands))await call('setMyCommands',{commands});},
  async()=>{const current=await call('getChatMenuButton',{});const same=current.type==='web_app'&&current.text==='Open Nix Music'&&new URL(current.web_app.url).href===new URL(base).href;if(!same)await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Open Nix Music',web_app:{url:base}}});}
 ];
 for(const operation of operations){
  try{await operation();}
  catch(error){log(`Optional Telegram menu setup skipped: ${error.message}${error.retry?` (retry allowed after ${error.retry} seconds)`:''}. Bot commands can still run; /start opens the current app URL.`);}
 }
}

export function retryDelay(error){return Math.max(5000,(Number(error.retry)||0)*1000);}
