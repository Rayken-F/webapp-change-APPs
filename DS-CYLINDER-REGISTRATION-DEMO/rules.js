/* Identifier rules shared by OCR, review, scanner and barcode output. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RegistrationRules=factory();})(typeof self==='undefined'?this:self,function(){
  'use strict';
  const normalize=v=>String(v??'').normalize('NFKC').toUpperCase().replace(/\s+/g,'');
  const ctnValid=v=>/^[A-Z]{2}[0-9]{2}[A-Z]{2}[A-Z0-9]$/.test(normalize(v));
  const ctnTail=v=>/^[A-Z]{2}[A-Z0-9]$/.test(normalize(v));
  const steelValid=v=>/^[0-9]{2}[A-Z][0-9]*$/.test(normalize(v));
  function allowed(field,index,length){
    if(field==='ctn'){
      if(length===3)return index<2?/^[A-Z]$/:/^[A-Z0-9]$/;
      if(length!==7)return null;
      return index===6?/^[A-Z0-9]$/:index===2||index===3?/^[0-9]$/:/^[A-Z]$/;
    }
    return field==='steel'&&length>=3?(index===2?/^[A-Z]$/:/^[0-9]$/):null;
  }
  function rank(value,field){
    const v=normalize(value);
    if(field==='ctn')return ctnValid(v)?3:ctnTail(v)?2:v.length===7?1:0;
    return steelValid(v)?3:/^[0-9]{6}$/.test(v)?1:0;
  }
  return {normalize,ctnValid,ctnTail,steelValid,allowed,rank};
});
