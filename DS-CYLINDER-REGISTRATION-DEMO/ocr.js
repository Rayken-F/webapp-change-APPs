/* Isolated local handwriting worker. Stopping terminates computation and pending downloads. */
(function(){
  'use strict';
  const URL_WORKER=new URL('handwriting-worker.js',document.currentScript.src).href;
  let worker,ready,nextId=0,idle;const pending=new Map();
  const fault=code=>Object.assign(new Error(code),{code});
  function stop(code='CANCELLED'){
    clearTimeout(idle);worker?.terminate();worker=null;ready=null;
    for(const job of pending.values()){clearTimeout(job.timer);job.reject(fault(code));}pending.clear();
  }
  function request(type,body={},timeout=45000){
    return new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>stop(type==='init'?'MODEL_TIMEOUT':'OCR_TIMEOUT'),timeout);pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,...body});});
  }
  function initialize(){
    if(ready)return ready;
    const current=worker=new Worker(URL_WORKER);
    current.onmessage=({data})=>{
      if(current!==worker)return;
      if(data.type==='progress'){window.dispatchEvent(new CustomEvent('registration-ocr-progress',{detail:data}));return;}
      const job=pending.get(data.id);if(!job)return;pending.delete(data.id);clearTimeout(job.timer);
      if(data.error)job.reject(fault(data.error));else job.resolve(data.result);
    };
    current.onerror=()=>{if(current===worker)stop('WORKER_CRASH');};
    current.onmessageerror=()=>{if(current===worker)stop('WORKER_CRASH');};
    ready=request('init',{},180000).catch(e=>{if(current===worker)stop(e.code||'OCR_ERROR');throw e;});return ready;
  }
  window.RegistrationOcr={
    async recognize(canvas,field='ctn'){
      clearTimeout(idle);await initialize();
      const image=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);
      return request('recognize',{image:{width:image.width,height:image.height,data:image.data},field});
    },
    stop:()=>stop(),release:()=>{clearTimeout(idle);idle=setTimeout(()=>stop(),30000);}
  };
})();
