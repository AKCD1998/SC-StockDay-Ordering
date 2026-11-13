// Guided OCR only: connect dot-matrix strokes and straighten a small text region.
// This temporary canvas never replaces the original photo or leaves the device.
export function labelRegion(image,r){
 const small=document.createElement('canvas');small.width=Math.max(1,Math.ceil(r.width));small.height=Math.max(1,Math.ceil(r.height));
 const ctx=small.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,r.left,r.top,r.width,r.height,0,0,small.width,small.height);
 const {width:w,height:h}=small,d=ctx.getImageData(0,0,w,h),gray=new Uint8Array(w*h),hist=new Uint32Array(256);
 for(let i=0;i<gray.length;i++){gray[i]=Math.round(.299*d.data[i*4]+.587*d.data[i*4+1]+.114*d.data[i*4+2]);hist[gray[i]]++;}
 let sum=0;for(let t=0;t<256;t++)sum+=t*hist[t];let count=0,partial=0,best=0,threshold=110;
 for(let t=0;t<256;t++){count+=hist[t];if(!count)continue;const other=gray.length-count;if(!other)break;partial+=t*hist[t];const between=count*other*(partial/count-(sum-partial)/other)**2;if(between>best){best=between;threshold=t;}}
 threshold=Math.max(70,Math.min(155,threshold));const points=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let dark=false;for(let dy=-1;dy<=1&&!dark;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h&&gray[yy*w+xx]<threshold){dark=true;break;}}const v=dark?0:255,i=(y*w+x)*4;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;if(dark&&x>w*.14&&x<w*.86&&y>h*.08&&y<h*.92)points.push([x-w/2,y-h/2]);}
 ctx.putImageData(d,0,0);let angle=0,score=0;
 for(let deg=-7;deg<=7;deg++){const a=deg*Math.PI/180,s=Math.sin(a),c=Math.cos(a),projection=new Uint32Array(h+w+4),step=Math.max(1,Math.floor(points.length/40000));for(let i=0;i<points.length;i+=step){const [x,y]=points[i],bin=Math.round(y*c+x*s+(h+w)/2);if(bin>=0&&bin<projection.length)projection[bin]++;}let value=0;for(const n of projection)value+=n*n;if(value>score){score=value;angle=a;}}
 const scale=Math.min(4,Math.max(2,1000/w)),canvas=document.createElement('canvas'),pad=12;
 canvas.width=Math.ceil((w+2*pad)*scale);canvas.height=Math.ceil((h+Math.abs(Math.sin(angle)*w)+2*pad)*scale);const out=canvas.getContext('2d');out.fillStyle='white';out.fillRect(0,0,canvas.width,canvas.height);out.translate(canvas.width/2,canvas.height/2);out.rotate(angle);out.scale(scale,scale);out.drawImage(small,-w/2,-h/2);
 return canvas;
}
