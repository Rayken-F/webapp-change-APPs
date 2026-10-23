importScripts('alignment.js');
self.onmessage=e=>{try{self.postMessage(RegistrationAlignment.detect(e.data.image,e.data.rowCount));}catch(_){self.postMessage({ok:false,reason:'自動對齊未完成，請手動設定四角'});}};
