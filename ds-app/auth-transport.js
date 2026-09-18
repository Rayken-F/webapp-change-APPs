(function(global){
  "use strict";
  function create(options){
    const fetcher=options.fetch||global.fetch.bind(global);
    const timeoutMs=options.timeoutMs||45000,slowMs=options.slowMs||15000;
    const now=options.now||Date.now;
    const schedule=options.setTimeout||setTimeout,cancelTimer=options.clearTimeout||clearTimeout;
    async function post(api,payload={},control={}){
      const controller=new AbortController();
      const requestId=global.crypto.randomUUID();
      const started=now(),record={requestId,api,startedAt:new Date(started).toISOString(),outcome:"pending"};
      let timer,slowTimer,abortHandler;
      const cancelled=new Promise((_,reject)=>{
        abortHandler=()=>{const error=new Error("已取消等待，可重新登入或驗證。");error.code="AUTH_CANCELLED";reject(error);controller.abort();};
        if(control.signal?.aborted)abortHandler();
        else control.signal?.addEventListener("abort",abortHandler,{once:true});
      });
      const expired=new Promise((_,reject)=>{timer=schedule(()=>{
        const error=new Error("登入回應等待過久，已停止等待；請確認網路後重試。");
        error.code="NETWORK_TIMEOUT";reject(error);controller.abort();
      },timeoutMs);});
      slowTimer=schedule(()=>control.onSlow?.(),slowMs);
      try{
        if(control.signal?.aborted)return await cancelled;
        return await Promise.race([expired,cancelled,(async()=>{
          const response=await fetcher(options.url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},
            body:JSON.stringify({...payload,api,request_id:requestId,client_version:options.clientVersion}),redirect:"follow",cache:"no-store",signal:controller.signal});
          record.headersMs=now()-started;
          const text=await response.text();record.bodyMs=now()-started;let data;
          try{data=JSON.parse(text);}catch(_){throw new Error("登入服務回應不完整，請稍後重試。");}
          const server=data.authDiagnostic;
          if(server?.requestId===requestId){
            record.server={totalMs:Number(server.totalMs)||0,phases:{}};
            for(const key of ["lock","open_access","read_account","password","write_account","token","open_audit","audit","flush","session"]){
              if(Number.isFinite(server.phases?.[key]))record.server.phases[key]=server.phases[key];
            }
          }
          if(!response.ok||!data.ok){const error=new Error(data.message||"登入服務暫時無法使用");error.code=data.code||"AUTH_ERROR";throw error;}
          return data;
        })()]);
      }catch(error){
        record.outcome=error.code==="NETWORK_TIMEOUT"?"timeout":error.code==="AUTH_CANCELLED"?"cancelled":"error";
        if(error.name==="TypeError"){const offline=new Error("目前網路無法連接登入服務，請確認連線後重試。");offline.code="NETWORK_ERROR";throw offline;}
        throw error;
      }finally{
        cancelTimer(timer);cancelTimer(slowTimer);control.signal?.removeEventListener("abort",abortHandler);
        record.totalMs=now()-started;if(record.outcome==="pending")record.outcome="received";
        // Only allowlisted timing fields are retained; never payloads, passwords or session tokens.
        options.onDiagnostic?.(JSON.parse(JSON.stringify(record)));
      }
    }
    return {post};
  }
  global.DsAuthTransport={create};
  if(typeof module!=="undefined")module.exports={create};
})(typeof window!=="undefined"?window:globalThis);
