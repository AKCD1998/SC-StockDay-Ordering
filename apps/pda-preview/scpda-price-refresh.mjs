// Active-view reads only. Old results cannot update a stopped or replaced view.
export class PriceCheckRefresh {
 constructor({load,onData,onState,intervalMs=60000,setTimer=(f,ms)=>setTimeout(f,ms),clearTimer=id=>clearTimeout(id)}){
  Object.assign(this,{load,onData,onState,intervalMs,setTimer,clearTimer});this.version=0;this.active=false;this.paused=false;this.timer=null;this.job=null;this.product=null;
 }
 clear(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;}
 stop(){this.clear();this.version++;this.active=false;this.job=null;this.product=null;}
 start(product){this.stop();this.active=true;this.product=product;this.onState({refreshing:false,error:null});this.schedule();}
 schedule(){this.clear();if(this.active&&!this.paused)this.timer=this.setTimer(()=>{this.timer=null;this.refresh();},this.intervalMs);}
 pause(value){if(this.paused===value)return;this.paused=value;this.clear();this.version++;this.job=null;if(this.active&&!value)this.refresh();}
 refresh(){
  if(!this.active||this.paused)return Promise.resolve();if(this.job)return this.job;
  this.clear();const version=this.version,product=this.product,current=()=>this.active&&!this.paused&&this.version===version;
  this.onState({refreshing:true,error:null});
  this.job=Promise.resolve().then(()=>{if(current())return this.load(product);}).then(fresh=>{
   if(!current())return;this.product=fresh;this.onData(fresh);this.onState({refreshing:false,error:null});
  }).catch(error=>{if(current())this.onState({refreshing:false,error});}).finally(()=>{
   if(current()){this.job=null;this.schedule();}
  });return this.job;
 }
}
