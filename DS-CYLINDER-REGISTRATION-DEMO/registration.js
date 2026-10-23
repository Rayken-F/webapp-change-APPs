(function(){
  'use strict';
  const M=RegistrationModel,$=id=>document.getElementById(id);
  window.RegistrationFlow=function(getState,onChange){
    const dialog=$('registration-dialog');let index=0,editing=false,focus,scroll=0,advanceAfter=0;
    function barcode(id,value,valid){
      const svg=$(id);svg.replaceChildren();svg.removeAttribute('data-value');svg.toggleAttribute('hidden',!valid);
      if(!valid)return;
      try{JsBarcode(svg,value,{format:'CODE128',width:3,height:64,margin:24,displayValue:false,background:'#ffffff',lineColor:'#000000'});svg.style.minWidth=Math.max(240,Number(svg.getAttribute('width'))/2.5)+'px';svg.setAttribute('data-value',value);}
      catch(_){svg.replaceChildren();svg.setAttribute('hidden','');$('registration-error').textContent='條碼無法產生，請核對編號。';}
    }
    function codes(){
      const state=getState(),r=state.rows[index],errors=M.issues(state.rows)[index]||[];
      $('registration-error').textContent=errors.join(' · ');
      $('registration-rt-value').textContent=M.normalize(state.rt);
      barcode('barcode-rt',M.normalize(state.rt),M.rtValid(state.rt));
      for(const field of ['ctn','steel']){
        $('registration-'+field+'-value').textContent=M.normalize(r[field])||'尚未填寫';
        barcode('barcode-'+field,M.normalize(r[field]),!errors.length);
      }
      $('complete-registration').disabled=editing||!M.ready(state.rows)||!M.rtValid(state.rt)||performance.now()<advanceAfter||['rt','ctn','steel'].some(f=>!$('barcode-'+f).hasAttribute('data-value'));
      $('registration-position').textContent=`第 ${index+1}／${state.rows.length} 支`+(M.registered(r,state.rt)?' · 已完成本機確認':'');
    }
    function paint(){
      const r=getState().rows[index];editing=false;$('registration-edit-fields').hidden=true;
      $('edit-registration').textContent='人工即時修改';$('registration-previous').disabled=index===0;
      $('registration-next').disabled=index===getState().rows.length-1;
      for(const field of ['ctn','steel'])$('registration-edit-'+field).value=r[field];
      codes();$('registration-body').scrollTop=0;
    }
    for(const field of ['ctn','steel'])$('registration-edit-'+field).addEventListener('input',()=>{
      const r=getState().rows[index];r[field]=$('registration-edit-'+field).value;r.edited=true;r.confirmed=false;r.registered=null;onChange();codes();
    });
    $('edit-registration').onclick=()=>{
      if(editing){
        const state=getState(),r=state.rows[index];if(M.issues(state.rows)[index].length){codes();return;}
        r.ctn=M.normalize(r.ctn);r.steel=M.normalize(r.steel);r.confirmed=true;onChange();paint();
      }else{editing=true;$('registration-edit-fields').hidden=false;$('edit-registration').textContent='確認修改與配對';codes();$('registration-edit-ctn').focus();}
    };
    $('complete-registration').onclick=()=>{
      if(editing||performance.now()<advanceAfter)return;
      const state=getState();
      try{M.complete(state.rows,state.rt,index);}catch(e){$('registration-error').textContent=e.message;return;}
      onChange();let next=state.rows.findIndex((r,i)=>i>index&&!M.registered(r,state.rt));
      if(next<0)next=state.rows.findIndex(r=>!M.registered(r,state.rt));
      if(next<0){dialog.close();$('output').scrollIntoView({behavior:'smooth'});return;}
      index=next;advanceAfter=performance.now()+700;paint();
      setTimeout(()=>{if(dialog.open)codes();},720);
    };
    for(const [id,delta]of [['registration-previous',-1],['registration-next',1]])$(id).onclick=()=>{
      if(editing){$('registration-error').textContent='請先按「確認修改與配對」再切換。';return;}
      const next=index+delta;if(next>=0&&next<getState().rows.length){index=next;paint();}
    };
    $('close-registration').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{document.body.classList.remove('modal-open');onChange();focus?.focus({preventScroll:true});window.scrollTo(0,scroll);});
    return {open(){
      const state=getState();if(!M.rtValid(state.rt)||!M.ready(state.rows))return;
      index=state.rows.findIndex(r=>!M.registered(r,state.rt));if(index<0)index=0;
      advanceAfter=0;focus=document.activeElement;scroll=window.scrollY;paint();dialog.showModal();document.body.classList.add('modal-open');
    }};
  };
})();
