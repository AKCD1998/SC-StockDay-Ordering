// Locate contrast-consistent text lines independently of OCR/model loading.
// Boxes returned here are unclassified visual candidates, never extracted values.
export function locateText(gray,w,h){
 const integral=new Float64Array((w+1)*(h+1));
 for(let y=0;y<h;y++){let sum=0;for(let x=0;x<w;x++){sum+=gray[y*w+x];integral[(y+1)*(w+1)+x+1]=integral[y*(w+1)+x+1]+sum;}}
 const delta=new Int16Array(w*h),radius=10;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const l=Math.max(0,x-radius),r=Math.min(w,x+radius+1),t=Math.max(0,y-radius),b=Math.min(h,y+radius+1),mean=(integral[b*(w+1)+r]-integral[t*(w+1)+r]-integral[b*(w+1)+l]+integral[t*(w+1)+l])/((r-l)*(b-t));delta[y*w+x]=gray[y*w+x]-mean;}
 const visited=new Uint8Array(w*h),stack=new Int32Array(w*h),components=[];
 for(const polarity of [1,-1]){
  visited.fill(0);
  for(let seed=0;seed<gray.length;seed++){
   if(visited[seed]||delta[seed]*polarity<=20)continue;
   let n=1,area=0,x0=w,y0=h,x1=0,y1=0,light=0;stack[0]=seed;visited[seed]=1;
   while(n){const at=stack[--n],x=at%w,y=Math.floor(at/w);area++;light+=Math.abs(delta[at]);x0=Math.min(x0,x);x1=Math.max(x1,x+1);y0=Math.min(y0,y);y1=Math.max(y1,y+1);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if((!dx&&!dy)||xx<0||xx>=w||yy<0||yy>=h)continue;const p=yy*w+xx;if(!visited[p]&&delta[p]*polarity>20){visited[p]=1;stack[n++]=p;}}
   }
   const cw=x1-x0,ch=y1-y0,density=area/(cw*ch);
   if(ch>=5&&ch<=Math.min(64,h*.11)&&cw>=1&&cw<=w*.16&&cw/ch>=.06&&cw/ch<=6&&area>=5&&density>=.08&&density<=.94)components.push({x0,y0,x1,y1,w:cw,h:ch,polarity,contrast:light/area});
  }
 }
 const lines=[];
 for(const polarity of [1,-1])for(const c of components.filter(c=>c.polarity===polarity).sort((a,b)=>a.x0-b.x0)){
  let target=null,distance=Infinity;
  for(const l of lines){if(l.polarity!==polarity)continue;const mh=l.hs/l.n,cy=l.ys/l.n,dy=Math.abs((c.y0+c.y1)/2-cy),gap=c.x0-l.x1;if(dy<Math.max(c.h,mh)*.55&&Math.max(c.h,mh)/Math.min(c.h,mh)<2.5&&gap<Math.max(12,mh*2.3)&&gap>-Math.max(c.w,mh)&&dy<distance){target=l;distance=dy;}}
  const cy=(c.y0+c.y1)/2;
  if(target){Object.assign(target,{x0:Math.min(target.x0,c.x0),x1:Math.max(target.x1,c.x1),y0:Math.min(target.y0,c.y0),y1:Math.max(target.y1,c.y1)});target.n++;target.hs+=c.h;target.h2+=c.h*c.h;target.ys+=cy;target.y2+=cy*cy;target.contrast+=c.contrast;}
  else lines.push({x0:c.x0,y0:c.y0,x1:c.x1,y1:c.y1,polarity,n:1,hs:c.h,h2:c.h*c.h,ys:cy,y2:cy*cy,contrast:c.contrast});
 }
 const ranked=lines.filter(l=>{const mh=l.hs/l.n;return l.n>=3&&l.x1-l.x0>mh*1.3&&l.x1-l.x0<w*.8;}).map(l=>{const mh=l.hs/l.n,hcv=Math.sqrt(Math.max(0,l.h2/l.n-mh*mh))/mh,ycv=Math.sqrt(Math.max(0,l.y2/l.n-(l.ys/l.n)**2))/mh;return {bbox:{x0:l.x0,y0:l.y0,x1:l.x1,y1:l.y1},polarity:l.polarity,quality:l.n/(1+hcv*5+ycv*3),characters:l.n};}).sort((a,b)=>b.quality-a.quality);
 const out=[];for(const c of ranked){if(out.some(b=>intersection(c.bbox,b.bbox)>.5))continue;out.push(c);if(out.length===18)break;}return out;
}
export function intersection(a,b){const area=Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));return area/Math.max(1,Math.min((a.x1-a.x0)*(a.y1-a.y0),(b.x1-b.x0)*(b.y1-b.y0)));}
export function pixels(canvas){const c=document.createElement('canvas'),s=Math.min(1,640/Math.max(canvas.width,canvas.height));c.width=Math.round(canvas.width*s);c.height=Math.round(canvas.height*s);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,c.width,c.height);const d=ctx.getImageData(0,0,c.width,c.height).data,gray=new Uint8Array(c.width*c.height);for(let i=0;i<gray.length;i++)gray[i]=Math.round(.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2]);return {gray,w:c.width,h:c.height};}
export function patchFeature(frame,b){const out=new Float32Array(128);let sum=0;for(let y=0;y<8;y++)for(let x=0;x<16;x++){const xx=Math.max(0,Math.min(frame.w-1,Math.round(b.x0+(x+.5)*(b.x1-b.x0)/16))),yy=Math.max(0,Math.min(frame.h-1,Math.round(b.y0+(y+.5)*(b.y1-b.y0)/8))),i=y*16+x;out[i]=frame.gray[yy*frame.w+xx];sum+=out[i];}const mean=sum/out.length;let norm=0;for(let i=0;i<out.length;i++){out[i]-=mean;norm+=out[i]*out[i];}norm=Math.sqrt(norm);if(norm<20)return null;for(let i=0;i<out.length;i++)out[i]/=norm;return out;}
export function correlation(a,b){if(!a||!b)return -1;let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
export function matchPatch(track,candidates,frame){
 const b=track.region,expected={x0:b.x0*frame.w,y0:b.y0*frame.h,x1:b.x1*frame.w,y1:b.y1*frame.h};let best=null,score=-1;
 const stationary=correlation(track.feature,patchFeature(frame,expected));if(stationary>.82)return {bbox:expected};
 for(const c of candidates){const r=c.bbox,ew=expected.x1-expected.x0,eh=expected.y1-expected.y0,hr=(r.y1-r.y0)/Math.max(1,eh),distance=Math.hypot((r.x0+r.x1-expected.x0-expected.x1)/2/frame.w,(r.y0+r.y1-expected.y0-expected.y1)/2/frame.h);if(hr<.5||hr>1.8||distance>.22)continue;
  const variants=[r],ww=ew*hr;
  if(r.x1-r.x0>ww*1.15)for(let i=0;i<=6;i++){const x=r.x0+(r.x1-r.x0-ww)*i/6;variants.push({x0:x,y0:r.y0,x1:x+ww,y1:r.y1});}
  for(const rect of variants){const wr=(rect.x1-rect.x0)/Math.max(1,ew);if(wr<.5||wr>1.8)continue;const similarity=correlation(track.feature,patchFeature(frame,rect)),near=intersection(rect,expected),value=similarity-distance*.7;if(similarity>(near>.2?.48:.76)&&value>score){score=value;best={...c,bbox:rect};}}
 }return best;
}
export class LabelVision {
 constructor({onFrame,onError}){this.onFrame=onFrame;this.onError=onError;this.busy=false;this.closed=false;this.worker=new Worker(new URL('./label-vision-worker.mjs?aim=3',import.meta.url),{type:'module'});this.worker.onmessage=e=>{this.busy=false;if(!this.closed)this.onFrame(e.data);};this.worker.onerror=()=>{this.busy=false;if(!this.closed)this.onError?.();};}
 scan(canvas){if(this.busy||this.closed)return;const frame=pixels(canvas);this.busy=true;this.worker.postMessage(frame,[frame.gray.buffer]);}
 close(){this.closed=true;this.worker.terminate();}
}
