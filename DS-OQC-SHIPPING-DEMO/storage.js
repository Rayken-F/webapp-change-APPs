/* A local outbox is a transmission safety net, never a server receipt. */
(function(g){
 'use strict';
 let opening;
 const name='ds_oqc_shipping_demo_v02';
 function open(){
   if(!opening)opening=new Promise((resolve,reject)=>{
     const r=indexedDB.open(name,1);
     r.onupgradeneeded=()=>r.result.createObjectStore('kv');
     r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};
     r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('請關閉另一個舊 DEMO 頁面'));
   });return opening;
 }
 function checkUnique(docs){
   const seen=new Map();
   Object.values(docs||{}).forEach(doc=>(doc.items||[]).filter(i=>!i.voided).forEach(i=>{
     if(seen.has(i.ctn)&&seen.get(i.ctn)!==doc.id){const e=new Error('CTN '+i.ctn+' 已在其他批次，不重複收錄');e.code='DUPLICATE_CTN';throw e;}
     seen.set(i.ctn,doc.id);
   }));
 }
 function blank(){return {docs:{},pending:[],inflight:null,receipts:{},active:'',actor:'DEMO測試人員',blocked:'',lastMessage:''};}
 async function change(key,fn){
   const db=await open();
   return new Promise((resolve,reject)=>{
     let tx;try{tx=db.transaction(['kv'],'readwrite',{durability:'strict'});}catch(_){tx=db.transaction(['kv'],'readwrite');}
     let result,failure;
     tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||new Error('本機保存未完成，請重掃'));
     tx.onerror=()=>{};
     const store=tx.objectStore('kv'),r=store.get(key);
     r.onsuccess=()=>{try{const value=r.result||blank();result=fn(value);checkUnique(value.docs);store.put(value,key);}catch(e){failure=e;tx.abort();}};
   });
 }
 async function read(key){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('kv').objectStore('kv').get(key);r.onsuccess=()=>resolve(r.result||blank());r.onerror=()=>reject(r.error);});}
 g.OqcStore={name,open,change,read,blank};
})(window);
