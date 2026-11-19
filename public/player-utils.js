export function artworkUrl(raw){
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:')return '';
  if(/(^|\.)(googleusercontent\.com|ggpht\.com)$/.test(url.hostname)){
   url.pathname=url.pathname.replace(/=w\d+(?:-h\d+)?[^/]*$/, '=w800-h800-l90-rj');
   url.pathname=url.pathname.replace(/=s\d+[^/]*$/, '=s800');
  }
  return url.href;
 }catch{return '';}
}
export function displayDuration(actual,metadata){return Number.isFinite(actual)&&actual>0?actual:Number(metadata)>0?Number(metadata):0;}
export function activeLyricIndex(lines,time){let index=-1;for(let i=0;i<lines.length;i++){if(lines[i].start<=time)index=i;else break;}return index;}
