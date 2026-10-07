if(window.IqcProduction?.allowed){
/* IQC V1.3.1: remove drafts after confirmed rejection; preserve submission evidence. */
(function(){
  'use strict';
  const DB=window.IqcProduction.key("ds_iqc_image_rc_v1"),stores=['batches','photos','submissions'];
  function transaction(mode,work){return new Promise((resolve,reject)=>{
    let db,tx,result,error,ended=false;
    const timer=setTimeout(()=>{error=new Error('本機儲存逾時，請重試。');try{tx?.abort();}catch(_){}finish(error);},15000);
    const finish=e=>{if(ended)return;ended=true;clearTimeout(timer);db?.close();e?reject(e):resolve(result);};
    const req=indexedDB.open(DB,1);
    req.onerror=()=>finish(req.error);
    req.onsuccess=()=>{db=req.result;if(ended){db.close();return;}
      try{tx=db.transaction(stores,mode);tx.oncomplete=()=>finish();tx.onabort=()=>finish(error||tx.error||new Error('本機變更未完成，原批次保留。'));
        work(tx,v=>{result=v;},e=>{error=e;tx.abort();});
      }catch(e){try{tx?.abort();}catch(_){}finish(e);}
    };
  });}
  function rejected(record){
    const model=window.IqcSubmitModel31,production=window.IqcProduction;
    // REJECTED is saved only after the server confirms no write and its ID/hash match.
    // Never treat a timeout, unknown status, or any receipt as a rejected submission.
    return !!(model&&record.status==='REJECTED'&&!record.receipt&&record.submissionId&&record.payloadHash&&
      record.protocol===model.protocol&&record.environment===model.environment&&
      record.endpoint===production.endpoint&&record.account===production.owner);
  }
  // Discard image bytes as the cursor advances; confirmation retains metadata only.
  function read(tx,id,done,abort){
    const state={batch:null,photos:[],submissions:[],rejectedCount:0,protected:false};let pending=3;
    const ready=()=>{if(!--pending){
      if(state.batch?.submissionId&&!state.submissions.some(r=>r.submissionId===state.batch.submissionId))state.protected=true;
      state.photos.sort((a,b)=>a.id.localeCompare(b.id));done(state);
    }};
    const b=tx.objectStore('batches').get(id);b.onsuccess=()=>{state.batch=b.result||null;state.protected=state.protected||!!(b.result?.status&&b.result.status!=='DRAFT');ready();};
    const p=tx.objectStore('photos').index('batchId').openCursor(IDBKeyRange.only(id));
    p.onsuccess=()=>{try{const c=p.result;if(!c){ready();return;}const v=c.value;state.photos.push({id:v.id,updatedAt:v.updatedAt||'',status:v.status||'',revision:JSON.stringify([v.ocrText,v.rc31Review,v.rc31Quality]),candidates:window.IqcReviewModel31.candidates(v).length});c.continue();}catch(e){abort(e);}};
    const s=tx.objectStore('submissions').openCursor();s.onsuccess=()=>{const c=s.result;if(c){if(c.value.batchId===id){
      state.submissions.push(c.value);
      if(rejected(c.value))state.rejectedCount++;else state.protected=true;
    }c.continue();}else ready();};
  }
  const stamp=s=>JSON.stringify([s.batch,s.photos,s.submissions]);
  const inspect=id=>transaction('readonly',(tx,done,abort)=>read(tx,id,done,abort));
  function remove(snapshot){return transaction('readwrite',(tx,done,abort)=>read(tx,snapshot.batch.id,current=>{
    try{
      if(!current.batch)throw new Error('此批次已移除，請重新開啟影像頁。');
      if(current.protected)throw new Error('此批次有尚未核對的送出紀錄或入帳收據，不能移除。');
      if(stamp(current)!==stamp(snapshot))throw new Error('批次內容已變更，請重新確認後再移除。');
      current.photos.forEach(p=>tx.objectStore('photos').delete(p.id));
      // Rejected submissions remain unchanged for audit; they are never replayed.
      tx.objectStore('batches').delete(current.batch.id);done(current.photos.length);
    }catch(e){abort(e);}
  },abort));}
  function updateBatch(batch){return transaction('readwrite',(tx,done,abort)=>{
    const s=tx.objectStore('batches'),r=s.get(batch.id);r.onsuccess=()=>{try{if(!r.result)throw new Error('批次已移除，請重新開啟影像頁。');if(r.result.status!=='DRAFT')throw new Error('本批已有送出紀錄，不能修改；請查收據／重試。');s.put(batch);done(batch);}catch(e){abort(e);}};
  });}
  // This result is a local selection check, NOT permission to create IQC records.
  // A future submitter must call it again immediately before queueing each payload.
  function preflight(ids){return transaction('readonly',(tx,done,abort)=>{
    const result={nonempty:[],empty:[],blocked:[]},unique=[...new Set(ids||[])];let pending=unique.length;done(result);
    unique.forEach(id=>read(tx,id,s=>{
      if(!s.batch||s.protected)result.blocked.push({id,reason:!s.batch?'批次不存在':'已有送出紀錄'});
      else if(!s.photos.length)result.empty.push(id);
      else if(!s.photos.some(p=>p.candidates))result.blocked.push({id,reason:'有照片，尚無可用 CTN，請先辨識或校對'});
      else result.nonempty.push(id);
      if(!--pending)done(result);
    },abort));
  });}
  function deleteDraftPhoto(id){return transaction('readwrite',(tx,done,abort)=>{
    const photos=tx.objectStore('photos'),r=photos.get(id);r.onsuccess=()=>{if(!r.result){done();return;}const b=tx.objectStore('batches').get(r.result.batchId);b.onsuccess=()=>{
      if(!b.result||b.result.status!=='DRAFT'){abort(new Error('本批已送出或待確認，不能移除照片。'));return;}photos.delete(id);done();
    };};
  });}
  window.IqcBatchStore31={inspect,remove,updateBatch,preflight,deleteDraftPhoto};
})();

}
