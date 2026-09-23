/* RC31: one owned worker, shared initialization, bounded jobs and explicit disposal. */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.IqcOcrEngine31=factory();
})(typeof window!=="undefined"?window:this,function(){
  "use strict";
  function fault(code){const e=new Error(code);e.code=code;return e;}
  class Engine {
    constructor({create,onEvent=()=>{},initMs=60000,jobMs=55000,idleMs=120000}){
      this.create=create;this.onEvent=onEvent;this.initMs=initMs;this.jobMs=jobMs;this.idleMs=idleMs;
      this.slot=null;this.serial=0;this.running=false;this.idle=null;
    }
    emit(stage,extra={}){this.onEvent({stage,...extra});}
    dispose(code="CANCELLED"){
      clearTimeout(this.idle);const s=this.slot;this.slot=null;
      if(!s||s.dead)return;s.dead=true;
      // Reject our waiters AND terminate the native Worker, even before createWorker resolves.
      for(const reject of s.waiters)reject(fault(code));s.waiters.clear();
      try{s.handle?.terminate();}catch(_){}
      this.emit("disposed",{generation:s.id,code});
    }
    async bounded(s,work,ms,stage){
      if(s.dead)throw fault("CANCELLED");
      const started=Date.now();let timer,rejectWait;
      const gate=new Promise((_,reject)=>{
        rejectWait=reject;s.waiters.add(reject);
        timer=setTimeout(()=>{if(this.slot===s)this.dispose(stage+"_TIMEOUT");},ms);
      });
      this.emit(stage,{generation:s.id,outcome:"started"});
      try{
        const value=await Promise.race([Promise.resolve().then(()=>{if(s.dead)throw fault("CANCELLED");return work();}),gate]);
        if(s.dead||this.slot!==s)throw fault("CANCELLED");
        this.emit(stage,{generation:s.id,outcome:"ok",ms:Date.now()-started});return value;
      }catch(e){
        this.emit(stage,{generation:s.id,outcome:"error",ms:Date.now()-started,code:e.code||"WORKER_ERROR"});
        if(this.slot===s)this.dispose(e.code||"WORKER_ERROR");throw e;
      }finally{clearTimeout(timer);s.waiters.delete(rejectWait);}
    }
    ensure(){
      clearTimeout(this.idle);
      if(this.slot)return this.slot.ready;
      const s={id:++this.serial,dead:false,waiters:new Set(),handle:null,ready:null};this.slot=s;
      s.ready=this.bounded(s,async()=>{
        s.handle=this.create(m=>{if(!s.dead)this.emit("engine_progress",{generation:s.id,status:m.status,progress:m.progress});});
        const w=await s.handle.ready;
        if(s.dead){s.handle.terminate();throw fault("CANCELLED");}
        await w.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_:-. ",preserve_interword_spaces:"1",tessedit_pageseg_mode:"6"});
        return w;
      },this.initMs,"initialize");
      return s.ready;
    }
    async recognize(image,psm="6"){
      // The controller serializes photos; reject accidental parallel calls defensively.
      if(this.running)throw fault("OCR_BUSY");
      this.running=true;
      try{
        const w=await this.ensure(),s=this.slot;
        return await this.bounded(s,async()=>{
          await w.setParameters({tessedit_pageseg_mode:psm});
          return w.recognize(image,{}, {text:true,blocks:true,hocr:false,tsv:false,box:false,unlv:false,osd:false});
        },this.jobMs,"recognize");
      }finally{this.running=false;}
    }
    release(){
      clearTimeout(this.idle);
      if(this.slot&&!this.running)this.idle=setTimeout(()=>this.dispose("IDLE_RELEASE"),this.idleMs);
    }
  }
  return {Engine,fault};
});
