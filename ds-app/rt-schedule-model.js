(function(root){
  'use strict';
  const plants=['7201','7209','7973','7A39','Other'];
  const priority={'緊急':0,'中等':1,'暫緩':2,'常態':3};
  function plant(item){const code=String(item.plantCode||'').trim().toUpperCase();return plants.includes(code)?code:'Other';}
  function size(item){
    const cap=String(item.capacity||'').trim().toUpperCase().replace(/\s/g,'');
    const bundle=cap.match(/^(\d+)X(\d+(?:\.\d+)?)([A-Z]*)$/);
    if(bundle)return [0,+bundle[1],+bundle[2],bundle[3]];
    const loose=cap.match(/^X(\d+(?:\.\d+)?)([A-Z]*)$/);
    return loose?[1,0,+loose[1],loose[2]]:[2,0,Number.MAX_SAFE_INTEGER,cap];
  }
  function compare(a,b){
    let d=plants.indexOf(plant(a))-plants.indexOf(plant(b));if(d)return d;
    d=(priority[a.status]??4)-(priority[b.status]??4);if(d)return d;
    const sa=size(a),sb=size(b);
    for(let i=0;i<3;i++){d=sa[i]-sb[i];if(d)return d;}
    return sa[3].localeCompare(sb[3],'en')||String(a.rtNo).localeCompare(String(b.rtNo),'en',{numeric:true})||(a.sourceRow||0)-(b.sourceRow||0);
  }
  function visible(items,filter){return items.filter(x=>filter==='ALL'||plant(x)===filter).slice().sort(compare);}
  const api=Object.freeze({plant,size,compare,visible,plants});root.DS_RT_SCHEDULE_MODEL=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
