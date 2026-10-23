(function(){
  'use strict';
  const A=RegistrationAlignment,$=id=>document.getElementById(id),dialog=$('alignment-dialog');
  let image,draft,accept,mode='corners',zoom=1,drag=null,returnY=0,focus,worker=null,ticket=0,cornersDirty=false;
  const svg=(tag,attrs)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));return el;};
  function overlay(){
    const canvas=$('alignment-image'),out=$('alignment-overlay'),w=canvas.width,h=canvas.height;
    out.setAttribute('viewBox',`0 0 ${w} ${h}`);out.replaceChildren();
    const scale=w/Math.max(1,out.getBoundingClientRect().width),radius=10*scale;
    const handle=(p,index)=>{
      const chosen=String(index)===$('align-target').value;
      out.append(svg('circle',{cx:p[0]*w,cy:p[1]*h,r:radius,class:'handle'+(chosen?' selected':'')+(mode==='grid'&&draft.unmatched?.includes(index)?' unmatched':''),'data-index':index}));
      out.append(svg('circle',{cx:p[0]*w,cy:p[1]*h,r:22*scale,class:'hit','data-index':index}));
    };
    if(mode==='corners'){
      out.append(svg('polygon',{points:draft.quad.map(p=>`${p[0]*w},${p[1]*h}`).join(' ')}));draft.quad.forEach((p,i)=>handle(p,i));
    }else{
      draft.rowLines.forEach((v,i)=>{out.append(svg('line',{x1:0,y1:v*h,x2:w,y2:v*h}));if(i&&i<draft.rowCount)handle([.07,v],i);});
      out.append(svg('line',{x1:draft.split*w,y1:0,x2:draft.split*w,y2:h}));handle([draft.split,.03],'split');
    }
  }
  function paint(){
    const c=$('alignment-image'),ctx=c.getContext('2d');
    if(mode==='corners'){
      const ratio=Math.min(1,1000/image.width);c.width=Math.round(image.width*ratio);c.height=Math.round(image.height*ratio);
      const source=document.createElement('canvas');source.width=image.width;source.height=image.height;source.getContext('2d').putImageData(image,0,0);ctx.drawImage(source,0,0,c.width,c.height);
    }else{
      const q=draft.quad,dist=(a,b)=>Math.hypot((a[0]-b[0])*image.width,(a[1]-b[1])*image.height),width=(dist(q[0],q[1])+dist(q[3],q[2]))/2,height=(dist(q[0],q[3])+dist(q[1],q[2]))/2;
      const ratio=Math.min(1,850/width,1600/height);c.width=Math.max(2,Math.round(width*ratio));c.height=Math.max(2,Math.round(height*ratio));
      const rect=A.raster(image,q,c.width,c.height);ctx.putImageData(new ImageData(rect.data,rect.width,rect.height),0,0);
    }
    $('alignment-stage').style.width=(100*zoom)+'%';$('align-zoom-label').textContent=Math.round(100*zoom)+'%';overlay();
  }
  function changeMode(value){
    if(value==='grid'&&cornersDirty)snap();
    mode=value;const select=$('align-target');select.replaceChildren();
    const option=(value,label)=>{const el=document.createElement('option');el.value=value;el.textContent=label;select.append(el);};
    if(mode==='corners'){['左上','右上','右下','左下'].forEach((s,i)=>option(i,s));$('alignment-help').textContent='只框 CTN＋鋼號的資料區：從第一列上緣到最後一列下緣，不含表頭、RT 欄或備註。';}
    else{for(let i=1;i<draft.rowCount;i++)option(i,`第 ${i}／${i+1} 列分界`);option('split','CTN／鋼號分界');$('alignment-help').textContent='拉正後檢查每條橫線。上下拖曳圓點可調整列分界；頂端圓點左右拖曳可調整兩欄分界。';}
    $('align-left').disabled=$('align-right').disabled=mode==='grid'&&select.value!=='split';
    $('align-up').disabled=$('align-down').disabled=mode==='grid'&&select.value==='split';paint();
  }
  function move(index,x,y){
    if(mode==='corners'){
      const q=draft.quad.map(p=>p.slice());q[Number(index)]=[Math.max(.002,Math.min(.998,x)),Math.max(.002,Math.min(.998,y))];
      if(RegistrationModel.quadValid(q)){draft.quad=q;cornersDirty=true;}
    }else if(index==='split')draft.split=Math.max(.2,Math.min(.75,x));
    else {const i=Number(index),gap=.004;draft.rowLines[i]=Math.max(draft.rowLines[i-1]+gap,Math.min(draft.rowLines[i+1]-gap,y));}
    overlay();
  }
  const out=$('alignment-overlay');
  out.addEventListener('pointerdown',e=>{const index=e.target.getAttribute('data-index');if(index===null)return;e.preventDefault();drag={id:e.pointerId,index};$('align-target').value=index;$('align-target').onchange();out.setPointerCapture(e.pointerId);});
  out.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;e.preventDefault();const r=out.getBoundingClientRect();move(drag.index,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])out.addEventListener(event,()=>{drag=null;});
  $('align-target').onchange=()=>{$('align-left').disabled=$('align-right').disabled=mode==='grid'&&$('align-target').value!=='split';$('align-up').disabled=$('align-down').disabled=mode==='grid'&&$('align-target').value==='split';overlay();};
  for(const [id,dx,dy]of[['align-left',-1,0],['align-right',1,0],['align-up',0,-1],['align-down',0,1]])$(id).onclick=()=>{
    const index=$('align-target').value,p=mode==='corners'?draft.quad[Number(index)]:index==='split'?[draft.split,.03]:[.07,draft.rowLines[Number(index)]];
    const r=out.getBoundingClientRect();move(index,p[0]+dx*2/r.width,p[1]+dy*2/r.height);
  };
  $('align-corners').onclick=()=>changeMode('corners');$('align-grid').onclick=()=>changeMode('grid');
  function snap(){
    const result=A.snap(image,draft.quad,draft.rowCount,draft.split,draft.rowLines);
    draft.rowLines=result.rowLines;draft.split=result.split;cornersDirty=false;
    $('alignment-message').textContent=`已自動貼齊 ${result.matched.length}／${draft.rowCount-1} 條內部分界。`+(result.missing?'未找到的線保留原位置，請檢查黃色圓點。':'請核對第一列、最後一列與兩欄分界後確認。');
    draft.unmatched=Array.from({length:draft.rowCount-1},(_,i)=>i+1).filter(i=>!result.matched.includes(i));
  }
  $('align-snap').onclick=()=>{snap();changeMode('grid');};
  $('align-zoom-in').onclick=()=>{zoom=Math.min(3,zoom+.5);$('alignment-stage').style.width=(100*zoom)+'%';$('align-zoom-label').textContent=Math.round(100*zoom)+'%';overlay();};
  $('align-zoom-out').onclick=()=>{zoom=Math.max(1,zoom-.5);$('alignment-stage').style.width=(100*zoom)+'%';$('align-zoom-label').textContent=Math.round(100*zoom)+'%';overlay();};
  $('close-alignment').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{drag=null;document.body.classList.remove('modal-open');focus?.focus({preventScroll:true});window.scrollTo(0,returnY);image=null;draft=null;});
  $('accept-alignment').onclick=()=>{
    if(mode==='corners'){changeMode('grid');return;}
    if(!RegistrationModel.quadValid(draft.quad)||!A.validLines(draft.rowLines,draft.rowCount))return;
    const result=structuredClone(draft),callback=accept;dialog.close();callback(result);
  };
  function open(source,settings,onAccept,message,automatic=false){
    image=source;draft=structuredClone(settings);accept=onAccept;zoom=1;returnY=window.scrollY;focus=document.activeElement;cornersDirty=!automatic;
    $('alignment-message').textContent=message;dialog.showModal();document.body.classList.add('modal-open');changeMode(automatic?'grid':'corners');
  }
  function detect(source,rowCount){
    const current=++ticket;if(worker)worker.terminate();
    return new Promise(resolve=>{
      const scale=Math.min(1,900/Math.max(source.width,source.height)),canvas=document.createElement('canvas'),full=document.createElement('canvas');
      full.width=source.width;full.height=source.height;full.getContext('2d').putImageData(source,0,0);canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);canvas.getContext('2d').drawImage(full,0,0,canvas.width,canvas.height);
      const sampled=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
      let timeout;const done=result=>{clearTimeout(timeout);if(current!==ticket)return;worker?.terminate();worker=null;resolve(result);};
      try{worker=new Worker('alignment-worker.js');worker.onmessage=e=>done(e.data);worker.onerror=()=>done({ok:false,reason:'自動校正無法啟動，請手動設定四角'});timeout=setTimeout(()=>done({ok:false,reason:'自動校正逾時，請手動設定四角'}),12000);worker.postMessage({image:sampled,rowCount},[sampled.data.buffer]);}catch(_){done({ok:false,reason:'此瀏覽器無法自動校正，請手動設定四角'});}
    });
  }
  window.RegistrationAligner={open,detect};
})();
