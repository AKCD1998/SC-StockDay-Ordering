// One coordinate space: the exact visible, object-fit:cover camera frame.
export function coverCrop(sourceWidth,sourceHeight,viewWidth,viewHeight){
 if(![sourceWidth,sourceHeight,viewWidth,viewHeight].every(n=>Number.isFinite(n)&&n>0))return null;
 const scale=Math.max(viewWidth/sourceWidth,viewHeight/sourceHeight),width=viewWidth/scale,height=viewHeight/scale;
 return {left:(sourceWidth-width)/2,top:(sourceHeight-height)/2,width,height};
}
export function visibleFrame(video,stage,maxEdge=1280){
 const rect=stage.getBoundingClientRect(),r=coverCrop(video.videoWidth,video.videoHeight,rect.width,rect.height);if(!r)return null;
 const s=Math.min(1,maxEdge/Math.max(r.width,r.height)),c=document.createElement('canvas');c.width=Math.round(r.width*s);c.height=Math.round(r.height*s);
 c.getContext('2d').drawImage(video,r.left,r.top,r.width,r.height,0,0,c.width,c.height);return c;
}
export function normalizedBox(b,w,h){return {x0:Math.max(0,b.x0/w),y0:Math.max(0,b.y0/h),x1:Math.min(1,b.x1/w),y1:Math.min(1,b.y1/h)};}
export function frameBox(b,w,h){return {x0:b.x0*w,y0:b.y0*h,x1:b.x1*w,y1:b.y1*h};}
export function regionAt(p,w,h,lines=[]){
 const nearest=lines.map(l=>({l,d:Math.abs((l.bbox.y0+l.bbox.y1)/2-p.y)*3+Math.abs((l.bbox.x0+l.bbox.x1)/2-p.x)})).sort((a,b)=>a.d-b.d)[0];
 if(nearest&&nearest.d<w*.06&&nearest.l.bbox.x1-nearest.l.bbox.x0<w*.5)return {x0:Math.max(0,nearest.l.bbox.x0-w*.01),y0:Math.max(0,nearest.l.bbox.y0-h*.01),x1:Math.min(w,nearest.l.bbox.x1+w*.01),y1:Math.min(h,nearest.l.bbox.y1+h*.01)};
 const bw=w*.33,bh=h*.05,x=Math.max(0,Math.min(w-bw,p.x-bw/2)),y=Math.max(0,Math.min(h-bh,p.y-bh/2));return {x0:x,y0:y,x1:x+bw,y1:y+bh};
}
export function overlaps(a,b){const w=Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)),h=Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));return w*h>Math.min((a.x1-a.x0)*(a.y1-a.y0),(b.x1-b.x0)*(b.y1-b.y0))*.4;}
export function frameSignature(canvas){const c=document.createElement('canvas');c.width=48;c.height=64;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(canvas,0,0,48,64);const data=x.getImageData(0,0,48,64).data,out=new Uint8Array(48*64);for(let i=0;i<out.length;i++)out[i]=Math.round(data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114);return out;}
export function sceneChanged(a,b){if(!a||!b||a.length!==b.length)return false;let sum=0,changed=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);sum+=d;if(d>30)changed++;}return sum/a.length>8||changed/a.length>.018;}
