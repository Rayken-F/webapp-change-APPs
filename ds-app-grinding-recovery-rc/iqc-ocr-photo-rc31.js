/* RC31: persist image bytes, never re-store database-backed Blob handles. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.IqcOcrPhoto31=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const fault=code=>Object.assign(new Error(code),{code});
  function valid(asset){return asset?.bytes instanceof ArrayBuffer&&asset.bytes.byteLength>0;}
  async function bytes(blob){
    if(!blob||!blob.size||typeof blob.arrayBuffer!=="function")throw fault("IMAGE_READ_ERROR");
    let timer;
    try{const data=await Promise.race([blob.arrayBuffer(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fault("IMAGE_READ_ERROR")),15000);})]);if(data.byteLength!==blob.size)throw Error();return {bytes:data,type:blob.type||"image/jpeg"};}
    catch(_){throw fault("IMAGE_READ_ERROR");}finally{clearTimeout(timer);}
  }
  async function encode(photo){
    const {blob,thumbnail,...stored}=photo;
    if(!valid(stored.rc31Image))stored.rc31Image=await bytes(blob);
    if(!valid(stored.rc31Thumbnail)&&thumbnail){
      // A missing thumbnail must not prevent reading the full-size image.
      try{stored.rc31Thumbnail=await bytes(thumbnail);}catch(_){delete stored.rc31Thumbnail;}
    }
    return stored;
  }
  const asBlob=asset=>valid(asset)?new Blob([asset.bytes],{type:asset.type||"image/jpeg"}):null;
  function hydrate(photo){return photo?{...photo,blob:asBlob(photo.rc31Image)||photo.blob,thumbnail:asBlob(photo.rc31Thumbnail)||photo.thumbnail}:photo;}
  function metadata(photo){const {blob,rc31Image,rc31Thumbnail,...meta}=photo;return {...meta,thumbnail:asBlob(rc31Thumbnail)||photo.thumbnail};}
  return {encode,hydrate,metadata,valid};
});
