const test=require('node:test'),assert=require('node:assert/strict');
const photo=require('../ds-app-grinding-recovery-rc/iqc-ocr-photo-rc31.js');
test('legacy conversion detaches image bytes and retains all review/result metadata',async()=>{
  const original={id:'p',blob:new Blob(['image'],{type:'image/jpeg'}),thumbnail:new Blob(['thumb'],{type:'image/png'}),ocrText:'AB12CDE',rc31Review:{history:['kept']}};
  const stored=await photo.encode(original);
  assert.equal(stored.blob,undefined);assert.equal(stored.thumbnail,undefined);
  assert.equal(await photo.hydrate(stored).blob.text(),'image');assert.equal(await photo.hydrate(stored).thumbnail.text(),'thumb');
  assert.deepEqual(stored.rc31Review,original.rc31Review);assert.equal(stored.ocrText,original.ocrText);assert.ok(original.blob);
});
test('status updates reuse saved bytes without rereading the old Blob',async()=>{
  const stored=await photo.encode({blob:new Blob(['image'])});const hydrated=photo.hydrate(stored);
  hydrated.blob.arrayBuffer=()=>{throw Error('file handle no longer readable');};
  assert.equal((await photo.encode({...hydrated,status:'PROCESSING'})).rc31Image,stored.rc31Image);
});
test('queue metadata never retains full-size bytes or Blob',async()=>{
  const stored=await photo.encode({blob:new Blob(['image']),thumbnail:new Blob(['thumb']),seq:1});const meta=photo.metadata(stored);
  assert.equal(meta.blob,undefined);assert.equal(meta.rc31Image,undefined);assert.equal(meta.rc31Thumbnail,undefined);assert.equal(meta.thumbnail.size,5);
});
test('unreadable legacy Blob has an image-read error without destroying its record',async()=>{
  const original={blob:{size:5,arrayBuffer:async()=>{throw new DOMException('PRIVATE CONTENT','NotReadableError');}},ocrText:'keep'};
  await assert.rejects(()=>photo.encode(original),e=>e.code==='IMAGE_READ_ERROR'&&!e.message.includes('PRIVATE'));
  assert.equal(original.ocrText,'keep');assert.ok(original.blob);
});
test('truncated image bytes are rejected before migration',async()=>{
  await assert.rejects(()=>photo.encode({blob:{size:100,arrayBuffer:async()=>new ArrayBuffer(2)}}),{code:'IMAGE_READ_ERROR'});
});
test('broken thumbnail does not block the full-size photo',async()=>{
  const stored=await photo.encode({blob:new Blob(['image']),thumbnail:{size:4,arrayBuffer:async()=>{throw Error();}}});
  assert.equal(stored.rc31Thumbnail,undefined);assert.equal(await photo.hydrate(stored).blob.text(),'image');
});
