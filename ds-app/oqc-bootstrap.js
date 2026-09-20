/* Read-only OQC preparation, shared by the shell and its OQC frame. */
(function(g){
  'use strict';
  const ENV='OQC_SHIPPING_PROD_V1_20260918',PATCH='OQC-BOOTSTRAP-K9-20260920';
  function create({url,context,fetcher=(...args)=>fetch(...args),now=Date.now,maxAgeMs=60000,timeoutMs=25000}){
    let scope='',epoch=0,pending=null,snapshot=null;
    const fail=(code,message)=>Object.assign(new Error(message),{code});
    function clear(){epoch++;pending?.controller.abort();pending=null;snapshot=null;scope='';}
    function identity(){const c=context()||{};return c.token&&c.allowed===true?JSON.stringify([c.token,c.account||'']):'';}
    function align(){const value=identity();if(scope!==value){clear();scope=value;}if(!value)throw fail('SESSION_REQUIRED','請先完成工作台登入並確認 OQC 權限');return epoch;}
    function get(){
      let generation;try{generation=align();}catch(e){return Promise.reject(e);}
      if(snapshot&&now()-snapshot.startedAt<maxAgeMs)return Promise.resolve(snapshot);
      if(pending)return pending.promise;
      snapshot=null;const requestedScope=scope,token=context().token,startedAt=now(),controller=new AbortController();
      const task={controller,promise:null};pending=task;
      task.promise=(async()=>{
        let timer;
        try{
          const network=(async()=>{
            const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({api:'bootstrap',environment:ENV,client_version:ENV,session_token:token,rt_catalog_requested:true}),signal:controller.signal,cache:'no-store',redirect:'follow'});
            if(!response.ok)throw fail('UPSTREAM_ERROR','OQC 服務暫時無法回應，請按「同步／重試」');
            let data;try{data=await response.json();}catch(_){throw fail('INVALID_RESPONSE','OQC 回應不完整，請按「同步／重試」');}
            if(!data.ok)throw fail(data.code||'BOOTSTRAP_FAILED',data.message||'OQC 準備失敗，請按「同步／重試」');
            if(data.environment!==ENV||data.productionEnabled!==true||data.productionBuild!=='OQC-PROD-20260918-01'||data.bootstrapPatch!==PATCH||!data.actor||!Array.isArray(data.docs))throw fail('BOOTSTRAP_INCOMPATIBLE','OQC 前後端版本不符，請重新整理工作台');
            return data;
          })();
          const data=await Promise.race([network,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(fail('TIMEOUT','OQC 資料準備逾時，請按「同步／重試」；原資料保留'));},timeoutMs);})]);
          if(generation!==epoch||requestedScope!==identity()||controller.signal.aborted)throw fail('CONTEXT_CHANGED','登入已變更，已捨棄舊的 OQC 回應');
          snapshot={data,startedAt};return snapshot;
        }catch(e){
          if(generation!==epoch||requestedScope!==identity())throw fail('CONTEXT_CHANGED','登入已變更，已捨棄舊的 OQC 回應');
          throw e;
        }finally{clearTimeout(timer);if(pending===task)pending=null;}
      })();
      return task.promise;
    }
    async function take(){const generation=align(),result=await get();if(generation!==align())throw fail('CONTEXT_CHANGED','登入已變更，已捨棄舊的 OQC 回應');if(snapshot===result)snapshot=null;return result;}
    return {get,take,clear};
  }
  // A prefetched read must never replace an unsent edit or a newer local revision.
  function mergeDocs(root,docs){
    if(root.pending.length||root.inflight||root.blocked)return false;
    for(const doc of docs){
      if(!doc?.id||!Number.isFinite(doc.revision))throw new Error('OQC 批次回應不完整');
      if(root.docs[doc.id]&&root.docs[doc.id].revision>doc.revision)continue;
      root.docs[doc.id]=doc;if(doc.receipt)root.receipts[doc.id]=doc.receipt;
    }
    if(!root.active)root.active=docs[0]?.id||'';
    return true;
  }
  g.DsOqcBootstrap={create,mergeDocs,ENV,PATCH};
})(typeof globalThis!=='undefined'?globalThis:this);
