'use strict';
importScripts('handwriting-core.js','slashed-zero.js');
const MODEL='https://huggingface.co/PaddlePaddle/en_PP-OCRv5_mobile_rec_onnx/resolve/3fafbc3b5dcf93dd72add9f48368be8a3a2cd33b/inference.onnx';
const HASH='b5f833dfc5d0eb71da397b4efa06ebeee9b431b690a47d6af40d77d8eabc557f',BYTES=7848423;
const REVIEW_MODEL='https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx/resolve/b8f84f0b80c529de40b4fbb3544b84fa7233a513/inference.onnx';
const REVIEW_HASH='5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634',REVIEW_BYTES=21159378;
const CDN='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
let session,chars,reviewSession,reviewChars,busy=false;
const fault=code=>Object.assign(new Error(code),{code});
const progress=(stage,loaded=0,total=0)=>postMessage({type:'progress',stage,loaded,total});
async function modelBytes(url=MODEL,hashExpected=HASH,bytesExpected=BYTES){
  let cache;try{cache=await caches.open('cylinder-handwriting-model-v1');}catch(_){}
  let response=await cache?.match(url),cached=!!response;
  if(!response){response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw fault('MODEL_DOWNLOAD');}
  const reader=response.body.getReader(),parts=[];let received=0;
  while(true){const {done,value}=await reader.read();if(done)break;received+=value.length;if(received>bytesExpected){await reader.cancel();if(cached)await cache?.delete(url);throw fault('MODEL_INTEGRITY');}parts.push(value);progress('download',received,bytesExpected);}
  const bytes=new Uint8Array(received);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(received!==bytesExpected||hash!==hashExpected){if(cached)await cache?.delete(url);throw fault('MODEL_INTEGRITY');}
  if(!cached&&cache)try{await cache.put(url,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));}catch(_){}
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
  const reviewResponse=await fetch('handwriting-review-model.json');if(!reviewResponse.ok)throw fault('MODEL_FORMAT');const reviewMetadata=await reviewResponse.json();
  if(reviewMetadata.size!==18710)throw fault('MODEL_FORMAT');
  // Preserve out-of-domain output as invalid, never silently drop non-ASCII characters.
  reviewChars=Array(reviewMetadata.size).fill('�');reviewChars[0]='';
  for(const [index,text]of reviewMetadata.ascii){if(!Number.isInteger(index)||index<1||index>=reviewChars.length||!/[\x20-\x7e]/.test(text)||text.length!==1)throw fault('MODEL_FORMAT');reviewChars[index]=text;}
  const reviewBytes=await modelBytes(REVIEW_MODEL,REVIEW_HASH,REVIEW_BYTES);progress('prepare');
  reviewSession=await ort.InferenceSession.create(reviewBytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
}
async function reread(source,engine=session,dictionary=chars){
  const input=RegistrationHandwriting.tensor(source),tensor=new ort.Tensor('float32',input.data,input.dims);let output;
  try{output=await engine.run({[engine.inputNames[0]]:tensor});return RegistrationHandwriting.decode(output[engine.outputNames[0]],dictionary);}
  finally{tensor.dispose();if(output)Object.values(output).forEach(t=>t.dispose());}
}
self.onmessage=async event=>{
  const {id,type,image,field}=event.data||{};
  if(busy){postMessage({id,error:'BUSY'});return;}busy=true;
  try{
    if(type==='init'){await initialize();postMessage({id,result:true});}
    else if(type==='recognize'){
      if(!session)throw fault('NOT_READY');
      const H=RegistrationHandwriting,Z=RegistrationSlashedZero,raw=H.rgb(image),ink=H.blueInk(raw),results=[],zeros=Z.detect(ink||raw);
      for(const [source,variant] of [[raw,'原圖'],[ink,'藍筆去線']]){
        if(!source)continue;const input=H.tensor(source),tensor=new ort.Tensor('float32',input.data,input.dims);let output;
        try{
          output=await session.run({[session.inputNames[0]]:tensor});const decoded=H.decode(output[session.outputNames[0]],chars);results.push({...decoded,variant});
          const corrected=Z.apply(decoded,zeros,source.width,input.resizedWidth,input.dims[3],source===raw&&ink?ink.offsetX:0);
          if(corrected)results.push({...corrected,variant:variant+'／斜線0'});
        }
        finally{tensor.dispose();if(output)Object.values(output).forEach(t=>t.dispose());}
      }
      let result=H.choose(results,field);
      if(ink&&/R/i.test(result.text)){
        const checks=[];for(const radius of [1,2])checks.push(await reread(H.thicken(ink,radius)));
        result=H.refine(result,checks,'R','Y',.65);
      }
      if(/6/.test(result.text)){
        const checks=[];for(const source of [raw,ink||H.padded(raw)])checks.push(await reread(source,reviewSession,reviewChars));
        result=H.refine(result,checks,'6','0',.9);
      }
      postMessage({id,result});
    }else throw fault('REQUEST');
  }catch(e){postMessage({id,error:e.code||'OCR_ERROR'});}finally{busy=false;}
};
