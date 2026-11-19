export function avatarMarkup(user, escape) {
 const initials=[user.first_name,user.last_name].filter(Boolean).map(x=>x[0]).join('').slice(0,2)||'♪';
 let photo='';
 try {const url=new URL(user.photo_url);if(url.protocol==='https:')photo=url.href;}catch{}
 return `<span class="avatar-initials">${escape(initials)}</span>${photo?`<img class="telegram-avatar" src="${escape(photo)}" alt="" referrerpolicy="no-referrer">`:''}`;
}

export function renderProfile({user,owner,demo,room,tracks,esc,icon,section,song}) {
 const name=[user.first_name,user.last_name].filter(Boolean).join(' ');
 const saved=user.savedTracks||{};
 const likes=(user.likes||[]).map(id=>saved[id]||tracks.find(t=>t.id===id)).filter(Boolean);
 return `<section class="profile-hero glass"><div class="profile-aura" aria-hidden="true"></div>
 <span class="profile-kicker">YOUR NIX MUSIC SPACE</span>
 <div class="profile-avatar">${avatarMarkup(user,esc)}</div>
 <h1>${esc(name)}</h1><p class="profile-handle">${user.username?'@'+esc(user.username):'Your personal listening space'}</p>
 <span class="profile-role">${icon(owner?'shield':'headphones')} ${owner?'Bot owner':demo?'Preview listener':'Telegram connected'}</span>
 <button class="id-badge" id="copy-id" aria-label="Copy Telegram ID ${user.id}"><span>TELEGRAM ID</span><strong>${user.id}</strong>${icon('copy')}</button>
 </section>
 <div class="stats glass profile-stats"><div><strong>${user.playlists.length}</strong><small>Playlists</small></div><div><strong>${user.likes.length}</strong><small>Liked songs</small></div><div><strong>${room?room.members.length:0}</strong><small>In your room</small></div></div>
 <div class="profile-callout"><div><h2>Your people. Your soundtrack.</h2><p>${room?'You’re sharing a frequency in '+esc(room.name)+'.':'Good music is even better together.'}</p></div><button class="icon-button" data-page="rooms" aria-label="Open listening rooms">${icon('arrow')}</button></div>
 ${section('Your library','id="new-playlist"','New playlist')}
 <p class="profile-caption">Keep your favorite sounds close. Save the current track to any collection below.</p>
 ${section('Liked songs')}${likes.length?likes.map(song).join(''):'<div class="empty">'+icon('heart')+'<p>Your next favorite is out there.</p><button class="text-button" data-page="search">Find a song '+icon('arrow')+'</button></div>'}
 ${section('Your account')}<div class="account-card glass"><div class="settings-row">Connected with <span>${demo?'Local preview':'Telegram'}</span></div><div class="settings-row">Profile details <span>Synced when you reopen the app</span></div><div class="settings-row">Playback <span>On this device</span></div></div>
 ${section('Stay connected')}<div class="profile-community"><a class="community-link glass" href="https://t.me/Deadgroupchat2" target="_blank" rel="noopener noreferrer">${icon('rooms')}<span>Support Chat<small>Get help and meet the community</small></span>${icon('arrow')}</a><a class="community-link glass" href="https://t.me/detergentlab" target="_blank" rel="noopener noreferrer">${icon('bell')}<span>Update Channel<small>News and the latest updates</small></span>${icon('arrow')}</a></div>
 ${owner?'<button class="primary owner-entry" data-page="admin">'+icon('shield')+' Open owner console</button>':''}`;
}
