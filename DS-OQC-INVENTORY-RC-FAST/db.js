(function(global){
  "use strict";

  const DB_NAME="ds_oqc_inventory_rc_v1";
  const DB_VERSION=1;
  let dbPromise=null;

  function requestToPromise(request){
    return new Promise((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("IndexedDB request failed"));
    });
  }

  function transactionDone(tx){
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error("IndexedDB transaction failed"));
      tx.onabort=()=>reject(tx.error||new Error("IndexedDB transaction aborted"));
    });
  }

  function openDb(){
    if(dbPromise) return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(!("indexedDB" in global)){
        reject(new Error("此瀏覽器不支援 IndexedDB"));
        return;
      }
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=event=>{
        const db=event.target.result;

        if(!db.objectStoreNames.contains("batches")){
          const store=db.createObjectStore("batches",{keyPath:"batchId"});
          store.createIndex("status","status",{unique:false});
          store.createIndex("rt","rt",{unique:false});
          store.createIndex("updatedAt","updatedAt",{unique:false});
        }

        if(!db.objectStoreNames.contains("items")){
          const store=db.createObjectStore("items",{keyPath:"itemId"});
          store.createIndex("batchId","batchId",{unique:false});
          store.createIndex("ctn","ctn",{unique:false});
          store.createIndex("recordStatus","recordStatus",{unique:false});
          store.createIndex("scannedAt","scannedAt",{unique:false});
        }

        if(!db.objectStoreNames.contains("events")){
          const store=db.createObjectStore("events",{keyPath:"eventId"});
          store.createIndex("batchId","batchId",{unique:false});
          store.createIndex("ctn","ctn",{unique:false});
          store.createIndex("eventAt","eventAt",{unique:false});
        }

        if(!db.objectStoreNames.contains("meta")){
          db.createObjectStore("meta",{keyPath:"key"});
        }
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("無法開啟 OQC RC 本機資料庫"));
      request.onblocked=()=>reject(new Error("OQC RC 資料庫被其他頁面占用，請關閉舊頁面後重試"));
    });
    return dbPromise;
  }

  async function getAll(storeName){
    const db=await openDb();
    const tx=db.transaction(storeName,"readonly");
    const result=await requestToPromise(tx.objectStore(storeName).getAll());
    await transactionDone(tx);
    return result||[];
  }

  async function get(storeName,key){
    const db=await openDb();
    const tx=db.transaction(storeName,"readonly");
    const result=await requestToPromise(tx.objectStore(storeName).get(key));
    await transactionDone(tx);
    return result||null;
  }

  async function put(storeName,value){
    const db=await openDb();
    const tx=db.transaction(storeName,"readwrite");
    await requestToPromise(tx.objectStore(storeName).put(value));
    await transactionDone(tx);
    return value;
  }

  async function putMany(storeName,values){
    if(!Array.isArray(values)||!values.length) return [];
    const db=await openDb();
    const tx=db.transaction(storeName,"readwrite");
    const store=tx.objectStore(storeName);
    values.forEach(value=>store.put(value));
    await transactionDone(tx);
    return values;
  }

  async function remove(storeName,key){
    const db=await openDb();
    const tx=db.transaction(storeName,"readwrite");
    tx.objectStore(storeName).delete(key);
    await transactionDone(tx);
  }

  async function clearAll(){
    const db=await openDb();
    const stores=["batches","items","events","meta"];
    const tx=db.transaction(stores,"readwrite");
    stores.forEach(name=>tx.objectStore(name).clear());
    await transactionDone(tx);
  }

  async function setMeta(key,value){
    return put("meta",{key,value,updatedAt:new Date().toISOString()});
  }

  async function getMeta(key,fallback=null){
    const row=await get("meta",key);
    return row ? row.value : fallback;
  }

  global.OqcRcDb=Object.freeze({
    DB_NAME,
    openDb,
    getAll,
    get,
    put,
    putMany,
    remove,
    clearAll,
    setMeta,
    getMeta
  });
})(window);
