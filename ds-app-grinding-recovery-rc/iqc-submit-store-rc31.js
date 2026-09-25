/* Immutable, account/environment-bound submissions. Old RC records never enter this queue. */
(function(){
  'use strict';
  const model=window.IqcSubmitModel31,dbName='ds_iqc_image_rc_v1';
  function transaction(mode,work){return new Promise((resolve,reject)=>{
    let db,tx,result,error,ended=false;
    const finish=e=>{if(ended)return;ended=true;clearTimeout(timer);db?.close();e?reject(e):resolve(result);};
    const timer=setTimeout(()=>{error=Error('本機儲存逾時，原照片與批次保留。');try{tx?.abort();}catch(_){}finish(error);},15000);
    const req=indexedDB.open(dbName,1);req.onerror=()=>finish(req.error);
    req.onsuccess=()=>{db=req.result;if(ended){db.close();return;}try{
      tx=db.transaction(['batches','photos','submissions'],mode);tx.oncomplete=()=>finish();tx.onabort=()=>finish(error||tx.error||Error('本機送出紀錄保存失敗。'));
      work(tx,v=>{result=v;},e=>{error=e;tx.abort();});
    }catch(e){try{tx?.abort();}catch(_){}finish(e);}};
  });}
  function read(tx,id,done){
    const out={batch:null,photos:[],submissions:[]};let waiting=3;const ready=()=>{if(!--waiting){out.photos.sort((a,b)=>a.id.localeCompare(b.id));done(out);}};
    const b=tx.objectStore('batches').get(id);b.onsuccess=()=>{out.batch=b.result;ready();};
    const p=tx.objectStore('photos').index('batchId').openCursor(IDBKeyRange.only(id));p.onsuccess=()=>{const c=p.result;if(!c){ready();return;}const v=c.value;out.photos.push({id:v.id,batchId:v.batchId,seq:v.seq,status:v.status,updatedAt:v.updatedAt,ocrText:v.ocrText,rc31Review:v.rc31Review,rc31Quality:v.rc31Quality});c.continue();};
    const s=tx.objectStore('submissions').openCursor();s.onsuccess=()=>{const c=s.result;if(!c){ready();return;}if(c.value.batchId===id)out.submissions.push(c.value);c.continue();};
  }
  const stamp=s=>JSON.stringify([s.batch,s.photos,s.submissions]),snapshot=id=>transaction('readonly',(tx,done)=>read(tx,id,done));
  function freeze(expected,record){return transaction('readwrite',(tx,done,abort)=>read(tx,record.batchId,s=>{
    try{
      if(stamp(s)!==stamp(expected)||!s.batch||s.batch.status!=='DRAFT')throw Error('批次內容已變更，請重新預覽確認。');
      if(s.submissions.some(r=>r.status!=='REJECTED'))throw Error('此批次已有送出紀錄，請查收據／重試。');
      if(record.protocol!==model.protocol||record.environment!==model.environment||!record.account||!record.payload.items.length)throw Error('送出環境／帳號／資料不完整。');
      tx.objectStore('submissions').add(record);tx.objectStore('batches').put({...s.batch,status:'QUEUED',updatedAt:new Date().toISOString()});done(record);
    }catch(e){abort(e);}
  }));}
  function update(record,changes){return transaction('readwrite',(tx,done,abort)=>{
    const s=tx.objectStore('submissions'),r=s.get(record.submissionId);r.onsuccess=()=>{try{
      const old=r.result;if(!old||old.account!==record.account||old.payloadHash!==record.payloadHash||old.environment!==model.environment||old.protocol!==model.protocol)throw Error('送出紀錄不一致，停止更新。');
      if(old.status==='SYNCED'){done(old);return;}
      const next={...old,...changes,updatedAt:new Date().toISOString()};
      if(next.status==='SYNCED'&&!model.receipt({ok:true,protocol:model.protocol,environment:model.environment,receipt:next.receipt},old))throw Error('收據與本機送出資料不符。');
      s.put(next);const b=tx.objectStore('batches').get(old.batchId);b.onsuccess=()=>{if(b.result)tx.objectStore('batches').put({...b.result,status:next.status==='REJECTED'?'DRAFT':next.status==='SYNCED'?'SYNCED':'QUEUED',updatedAt:next.updatedAt});};done(next);
    }catch(e){abort(e);}};
  });}
  window.IqcSubmitStore31={snapshot,freeze,update,stamp};
})();
