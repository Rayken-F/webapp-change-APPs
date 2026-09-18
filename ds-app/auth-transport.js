(function(global){
  "use strict";
  function create(options){
    const fetcher=options.fetch||global.fetch.bind(global);
    const timeoutMs=options.timeoutMs||15000;
    async function post(api,payload={}){
      const controller=new AbortController();
      let timer;
      const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{
        const error=new Error("連線超過 15 秒，已停止等待；請確認網路後重試。");
        error.code="NETWORK_TIMEOUT";reject(error);controller.abort();
      },timeoutMs);});
      try{
        return await Promise.race([expired,(async()=>{
          const response=await fetcher(options.url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},
            body:JSON.stringify({...payload,api,client_version:options.clientVersion}),redirect:"follow",cache:"no-store",signal:controller.signal});
          const text=await response.text();let data;
          try{data=JSON.parse(text);}catch(_){throw new Error("登入服務回應不完整，請稍後重試。");}
          if(!response.ok||!data.ok){const error=new Error(data.message||"登入服務暫時無法使用");error.code=data.code||"AUTH_ERROR";throw error;}
          return data;
        })()]);
      }catch(error){
        if(error.name==="TypeError")throw new Error("目前網路無法連接登入服務，請確認連線後重試。");
        throw error;
      }finally{clearTimeout(timer);}
    }
    return {post};
  }
  global.DsAuthTransport={create};
  if(typeof module!=="undefined")module.exports={create};
})(typeof window!=="undefined"?window:globalThis);
