if(window.IqcProduction?.allowed){
  document.addEventListener('DOMContentLoaded',()=>{
    const open=()=>document.getElementById('iqcImageRcTool')?.click();
    if(!window.__DS_IQC_SUBMIT31||window.__DS_IQC_RC31?.booting){toast('影像程式尚未載入完成，請重新開啟。',true);return;}
    open();
    // Switching modules must stop OCR, just like leaving the app; saved photos remain.
    const frame=window.frameElement;
    if(frame)new MutationObserver(()=>{if(frame.classList.contains('hidden'))document.getElementById('iqc31Cancel')?.click();}).observe(frame,{attributes:true,attributeFilter:['class']});
  },{once:true});
}
