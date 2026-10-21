'use strict';
importScripts('handwriting-core.js');
const MODEL='https://huggingface.co/PaddlePaddle/en_PP-OCRv5_mobile_rec_onnx/resolve/3fafbc3b5dcf93dd72add9f48368be8a3a2cd33b/inference.onnx';
const HASH='b5f833dfc5d0eb71da397b4efa06ebeee9b431b690a47d6af40d77d8eabc557f',BYTES=7848423;
const CDN='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
let session,chars,busy=false;
const fault=code=>Object.assign(new Error(code),{code});
const progress=(stage,loaded=0,total=0)=>postMessage({type:'progress',stage,loaded,total});
async function modelBytes(){
  let cache;try{cache=await caches.open('cylinder-handwriting-model-v1');}catch(_){}
  let response=await cache?.match(MODEL),cached=!!response;
  if(!response){response=await fetch(MODEL,{credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw fault('MODEL_DOWNLOAD');}
  const reader=response.body.getReader(),parts=[];let received=0;
  while(true){const {done,value}=await reader.read();if(done)break;received+=value.length;if(received>BYTES){await reader.cancel();if(cached)await cache?.delete(MODEL);throw fault('MODEL_INTEGRITY');}parts.push(value);progress('download',received,BYTES);}
  const bytes=new Uint8Array(received);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(received!==BYTES||hash!==HASH){if(cached)await cache?.delete(MODEL);throw fault('MODEL_INTEGRITY');}
  if(!cached&&cache)try{await cache.put(MODEL,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));}catch(_){}
  return bytes;
}
async function initialize(){
  progress('initialize');
  try{importScripts(CDN+'ort.wasm.min.js');}catch(_){throw fault('LIB_LOAD');}
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=CDN;ort.env.logLevel='error';
  const response=await fetch('handwriting-model.json');if(!response.ok)throw fault('MODEL_FORMAT');const metadata=await response.json();
  chars=['',...metadata.characters,' '];if(chars.length!==438)throw fault('MODEL_FORMAT');
  const bytes=await modelBytes();progress('prepare');
  session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
}
self.onmessage=async event=>{
  const {id,type,image,field}=event.data||{};
  if(busy){postMessage({id,error:'BUSY'});return;}busy=true;
  try{
    if(type==='init'){await initialize();postMessage({id,result:true});}
    else if(type==='recognize'){
      if(!session)throw fault('NOT_READY');
      const H=RegistrationHandwriting,raw=H.rgb(image),ink=H.blueInk(raw),results=[];
      for(const [source,variant] of [[raw,'原圖'],[ink,'藍筆去線']]){
        if(!source)continue;const input=H.tensor(source),tensor=new ort.Tensor('float32',input.data,input.dims);let output;
        try{output=await session.run({[session.inputNames[0]]:tensor});results.push({...H.decode(output[session.outputNames[0]],chars),variant});}
        finally{tensor.dispose();if(output)Object.values(output).forEach(t=>t.dispose());}
      }
      postMessage({id,result:H.choose(results,field)});
    }else throw fault('REQUEST');
  }catch(e){postMessage({id,error:e.code||'OCR_ERROR'});}finally{busy=false;}
};
