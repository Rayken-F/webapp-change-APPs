(function(global){
  "use strict";
  function create({url}){
    const channel="DS_AUTH_BRIDGE_K4";
    let nonce=global.crypto.randomUUID();
    const pending=new Map();
    let peer=null,peerOrigin="",frame=null;
    function receive(event){
      const m=event.data;
      if(!m||m.channel!==channel||m.nonce!==nonce)return;
      // Google serves HtmlService in a nested sandbox. Bind the READY sender
      // using our unguessable page nonce, then require that exact window/origin.
      if(!/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(event.origin))return;
      if(m.type==="READY"){
        if(!peer&&event.source){peer=event.source;peerOrigin=event.origin;}
        return;
      }
      if(event.source!==peer||event.origin!==peerOrigin)return;
      const item=pending.get(m.id);
      if(item&&m.type===item.type){pending.delete(m.id);item.finish(m.data);}
    }
    global.addEventListener("message",receive);
    function start(){
      if(frame)return;
      frame=document.createElement("iframe");
      frame.title="工作台登入連線";frame.hidden=true;
      frame.setAttribute("aria-hidden","true");frame.setAttribute("tabindex","-1");
      frame.referrerPolicy="no-referrer";
      const src=new URL(url);src.searchParams.set("api","workstation_bridge");src.searchParams.set("bridge_nonce",nonce);
      frame.src=src.href;document.body.appendChild(frame);
    }
    function exchange(type,payload,signal,timeout){
      const id=global.crypto.randomUUID();
      return new Promise((resolve,reject)=>{
        let timer;
        const abort=()=>finish(null,Object.assign(new Error("已取消等待"),{code:"AUTH_CANCELLED"}));
        function finish(value,error){pending.delete(id);clearTimeout(timer);signal?.removeEventListener("abort",abort);error?reject(error):resolve(value);}
        if(signal?.aborted){abort();return;}
        signal?.addEventListener("abort",abort,{once:true});
        pending.set(id,{type:type==="PING"?"PONG":"RESULT",finish});
        if(timeout)timer=setTimeout(()=>finish(false),timeout);
        try{peer.postMessage({channel,nonce,id,type,payload},peerOrigin);}catch(_){finish(false);}
      });
    }
    function reconnect(){
      frame?.remove();frame=null;peer=null;peerOrigin="";nonce=global.crypto.randomUUID();start();
    }
    async function send(payload,signal,record){
      if(!peer){record.bridge="not_ready";return null;}
      const started=Date.now();
      // Probe before sending credentials. Fallback is allowed only before AUTH.
      const alive=await exchange("PING",undefined,signal,1200);
      record.bridgeCheckMs=Date.now()-started;
      if(alive===false){record.bridge="unresponsive";reconnect();return null;}
      record.transport="google_rpc";
      const data=await exchange("AUTH",payload,signal);
      if(!data)throw Object.assign(new Error("登入通道中斷，請重試。"),{code:"AUTH_BRIDGE_FAILED"});
      return data;
    }
    start();
    return {send};
  }
  global.DsAuthBridge={create};
})(window);
