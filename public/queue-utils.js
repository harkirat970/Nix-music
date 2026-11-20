export function queueAfter(items,id){const index=items.findIndex(t=>t.id===id);return index<0?[]:items.slice(index+1);}
export function shuffled(items,random=Math.random){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export function roomUiKey(room){return JSON.stringify(room&&[room.id,room.revision,room.members,room.canControl,room.canQueue,room.canManage,room.adminsOnly]);}
