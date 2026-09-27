const {test}=require('node:test'),assert=require('node:assert/strict');
const rules=require('../ds-app-grinding-recovery-rc/iqc-ocr-rules-rc31');
const word=(text,x,y,w=text.length*10)=>({text,confidence:95,bbox:{x0:x,y0:y,x1:x+w,y1:y+20}});
const line=words=>({words,text:words.map(w=>w.text).join(' '),bbox:{x0:Math.min(...words.map(w=>w.bbox.x0)),y0:Math.min(...words.map(w=>w.bbox.y0)),x1:Math.max(...words.map(w=>w.bbox.x1)),y1:Math.max(...words.map(w=>w.bbox.y1))}});
const pass=lines=>({data:{text:lines.map(l=>l.text).join('\n'),blocks:[{paragraphs:[{lines}]}]}});
const header=(rt,y,status='OCYL',plant='7A44')=>line([word(rt,70,y),word('CYLINDER',180,y),word(status,280,y),word(plant,340,y),word('TOTAL',410,y),word('16',480,y)]);
const ctn=(text,y)=>line([word(text,100,y)]);
const restore=(text,results)=>rules.parseText(rules.restoreMetadata(text,results));
test('numeric status keeps the status and plant in their respective columns',()=>{
 assert.deepEqual(rules.parseText('914321 CYLINDER 0006 7A44 TOTAL 16\nAB12CDE').groups[0],{rt:'914321',status:'0006',plant:'7A44',expected:16,ctns:['AB12CDE']});
});
test('separated noise cannot be concatenated into an RT; real seven-digit RT remains intact',()=>{
 assert.equal(rules.parseText('3 914321 CYLINDER OCYL 7A44\nAB12CDE').groups.length,0);
 assert.equal(rules.parseText('3914321 CYLINDER OCYL 7A44\nAB12CDE').groups[0].rt,'3914321');
});
test('word positions exclude a separate noise digit, retaining all CTNs',()=>{
 const h=header('914321',100);h.words.unshift(word('3',0,85,10));h.text='3          '+h.text;
 const r=pass([h,ctn('AB12CDE',200),ctn('FG34HIJ',260)]),out=restore(rules.reconcileRows([r]).text,[r]);
 assert.equal(out.groups[0].rt,'914321');assert.deepEqual(out.groups[0].ctns,['AB12CDE','FG34HIJ']);
});
test('one same-photo heading covers lower CTNs outside the header crop',()=>{
 const base=pass([ctn('AB12CDE',200),ctn('FG34HIJ',700),ctn('KL56MNP',900)]),focused=pass([header('914321',100,'0006')]);focused.rc31HeaderOnly=true;
 const out=restore(base.data.text,[base,focused]);assert.deepEqual(out.leading,[]);assert.deepEqual(out.groups[0].ctns,['AB12CDE','FG34HIJ','KL56MNP']);assert.equal(out.groups[0].status,'0006');
});
test('a lower header never claims a leading continuation; the next header is a boundary',()=>{
 const p=pass([ctn('AB12CDE',20),header('914321',100),ctn('FG34HIJ',200),header('914322',300),ctn('KL56MNP',400)]);
 const out=restore(p.data.text,[p]);assert.deepEqual(out.leading,['AB12CDE']);assert.deepEqual(out.groups.map(g=>[g.rt,g.ctns]),[['914321',['FG34HIJ']],['914322',['KL56MNP']]]);
});
test('unreadable middle RT still blocks inheritance from the preceding header',()=>{
 const p=pass([header('914321',100),ctn('AB12CDE',200),header('?',300),ctn('FG34HIJ',400)]),out=restore(p.data.text,[p]);
 assert.deepEqual(out.groups[0].ctns,['AB12CDE']);assert.deepEqual(out.leading,['FG34HIJ']);
});
test('conflicting RT readings are unassigned until the positioned digit crop resolves them',()=>{
 const a=pass([header('3914321',100),ctn('AB12CDE',200)]),b=pass([header('914321',100),ctn('AB12CDE',200)]);
 assert.deepEqual(restore(a.data.text,[a,b]).leading,['AB12CDE']);
 const digit={data:{text:'914321'},rc31RtReading:{bbox:header('914321',100).words[1].bbox,rt:'914321'}};
 assert.equal(restore(a.data.text,[a,b,digit]).groups[0].rt,'914321');
});
test('cropped heading coordinates map back to the original photograph',()=>{
 const r=pass([header('914321',100)]),before={...r.data.blocks[0].paragraphs[0].lines[0].words[1].bbox};
 rules.mapHeaderResult(r,{transform:{sx:30,sy:200,pad:16,scaleX:2,scaleY:2}});
 assert.deepEqual(r.data.blocks[0].paragraphs[0].lines[0].words[1].bbox,{x0:(before.x0-16)/2+30,x1:(before.x1-16)/2+30,y0:(before.y0-16)/2+200,y1:(before.y1-16)/2+200});assert.equal(r.rc31HeaderOnly,true);
});
test('results from an unrelated coordinate space do not move CTNs between headers',()=>{
 const a=pass([header('914321',100),ctn('AB12CDE',200)]),b=pass([header('914322',100),ctn('AB12CDE',200)]);b.rc31Space=false;
 assert.equal(restore(a.data.text,[a,b]).groups[0].rt,'914321');
});
test('valid split RT and plant use adjacent word evidence, not distant digits',()=>{
 const p=pass([line([word('914',70,100),word('321',106,100),word('CYLINDER',180,100),word('NRRT',280,100),word('7A',340,100),word('44',365,100),word('TOTAL',410,100),word('16',480,100)]),ctn('AB12CDE',200)]);
 const out=restore('AB12CDE',[p]);assert.equal(out.groups[0].rt,'914321');assert.equal(out.groups[0].plant,'7A44');
});
test('a distinct candidate from another RT pass survives for position-based reconciliation',()=>{
 const a=pass([header('914321',100),ctn('AB12CDE',200),ctn('FG34HIJ',260)]),b=pass([header('914322',100),ctn('KL56MNP',300)]);
 const out=rules.parseText(rules.mergeParsedPasses([a,b]));assert.ok(out.leading.includes('KL56MNP'));assert.equal(rules.structuralState(rules.mergeParsedPasses([a,b])).found,3);
});
test('a short CTN continuation near the top does not force a cleanup pass',()=>{
 assert.equal(rules.lateOnlyRows([pass([ctn('AB12CDE',200)])],1200),false);
 assert.equal(rules.lateOnlyRows([pass([ctn('AB12CDE',800)])],1200),true);
});
test('digit-only crop with no actual numeric evidence cannot fabricate an RT',()=>{
 const r={data:{text:'OOOOO'}};rules.mapHeaderResult(r,{digitsOnly:true,target:{bbox:header('914321',100).bbox},transform:{sx:0,sy:0,pad:0,scaleX:1,scaleY:1}});assert.equal(r.rc31RtReading.rt,'');
});
test('a real seven-digit RT split into adjacent words retains the first digit',()=>{
 const h=header('914321',100);h.words.unshift(word('3',54,100,10));h.text='3 '+h.text;
 const r=pass([h,ctn('AB12CDE',200)]);assert.equal(restore('AB12CDE',[r]).groups[0].rt,'3914321');
});
