(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.RegistrationModel = factory(root.RegistrationRules);
})(typeof window === 'undefined' ? this : window, function(R) {
  'use strict';
  const VERSION = 'CYL-REG-DEMO-0.7-20261106';
  const RULES_PREVIOUS_VERSION = 'CYL-REG-DEMO-0.6.1-20261024';
  const FLOW_VERSION = 'CYL-REG-DEMO-0.6-20261024';
  const ALIGNMENT_VERSION = 'CYL-REG-DEMO-0.5-20261023';
  const GLYPH_VERSION = 'CYL-REG-DEMO-0.4-20261022';
  const LEGACY_VERSION = 'CYL-REG-DEMO-0.1-20261021';
  const PREVIOUS_VERSION = 'CYL-REG-DEMO-0.2-20261021';
  const ZERO_VERSION = 'CYL-REG-DEMO-0.3-20261021';
  const normalize = value => String(value || '').normalize('NFKC').toUpperCase().replace(/\s+/g, '');
  const id = () => globalThis.crypto.randomUUID();
  function row(sourceIndex = null) {
    return { id: id(), sourceIndex, ctn: '', steel: '', rawCtn: '', rawSteel: '', ctnAlternatives: [], steelAlternatives: [], ctnSlashedZeros: 0, steelSlashedZeros: 0, ctnZeroReview: false, steelZeroReview: false, ctnGlyphReview: false, steelGlyphReview: false, ctnScore:null, steelScore:null, ctnLowConfidence:false, steelLowConfidence:false, ctnSource:'', ctnEdited:false, steelEdited:false, ctnLastReview:false, registered:null, confirmed: false, edited: false, prefixApplied: false };
  }
  function issues(rows) {
    const ctn = new Map(), steel = new Map();
    for (const r of rows) {
      for (const [map, value] of [[ctn, normalize(r.ctn)], [steel, normalize(r.steel)]]) {
        if (value) map.set(value, (map.get(value) || 0) + 1);
      }
    }
    return rows.map(r => {
      const c = normalize(r.ctn), s = normalize(r.steel), out = [];
      if (!c || !s) out.push('CTN 與鋼號都要填寫');
      // Never replace O/0, I/1 or remove leading zeroes in identifiers.
      if (c && !/^[A-Z0-9]{7}$/.test(c)) out.push('請填完整 7 碼 CTN');
      if (/^[A-Z0-9]{7}$/.test(c) && !/^[0-9]{2}$/.test(c.slice(2,4))) out.push('CTN 第 3、4 碼必須是數字');
      if (c.length===7 && !/^[A-Z]{2}$/.test(c.slice(0,2))) out.push('CTN 第 1、2 碼必須是英文');
      if (c.length===7 && !/^[A-Z]{2}$/.test(c.slice(4,6))) out.push('CTN 第 5、6 碼必須是英文');
      if (s && !R.steelValid(s)) out.push('鋼號第 3 碼必須是英文，其餘必須是數字');
      if (ctn.get(c) > 1) out.push('CTN 重複');
      if (steel.get(s) > 1) out.push('鋼號重複');
      return out;
    });
  }
  function applyPrefixes(rows, ctnPrefix, steelPrefix) {
    const cp = normalize(ctnPrefix), sp = normalize(steelPrefix);
    if (cp && !/^[A-Z]{2}[0-9]{2}$/.test(cp)) throw Error('CTN 共用前綴須為 2 碼英文＋2 碼數字');
    if (sp && !R.steelValid(sp)) throw Error('請確認鋼號共用前綴');
    let changed = 0;
    for (const r of rows) {
      let applied = false;
      if (cp && R.ctnTail(r.ctn)) { r.ctn = cp + normalize(r.ctn); r.ctnEdited=true; r.ctnSource='prefix'; applied = true; }
      if (sp && /^\d{6}$/.test(normalize(r.steel))) { r.steel = sp + normalize(r.steel); r.steelEdited=true; applied = true; }
      if (applied) { r.confirmed = false; r.registered=null; r.prefixApplied = true; changed++; }
    }
    return changed;
  }
  function locked(r,field) { return r.confirmed || r.edited || r[field+'Edited'] || (field==='ctn'&&r.ctnSource==='scanner'); }
  function edit(r,field,value) {
    r[field]=value;r[field+'Edited']=true;if(field==='ctn')r.ctnSource='manual';
    r.confirmed=false;r.registered=null;
  }
  function scanCtn(rows,index,value) {
    // Accept only scanner terminators/outer whitespace, never strip embedded characters to make a code fit.
    const c=String(value??'').normalize('NFKC').trim().toUpperCase(),r=rows[index];
    if(!r)throw Error('請先建立校對列並選擇掃描對應列');
    if(!/^[A-Z]{2}[0-9]{2}[A-Z]{2}[A-Z0-9]$/.test(c))throw Error('掃描 CTN 格式不符：須為英文 2 碼、數字 2 碼、英文 2 碼、最後英數 1 碼');
    if(rows.some((v,i)=>i!==index&&normalize(v.ctn)===c))throw Error('CTN 重複，請確認是否掃錯列');
    if(r.ctnSource==='scanner'&&normalize(r.ctn)===c)return false;
    r.ctn=c;r.ctnSource='scanner';r.ctnEdited=true;r.confirmed=false;r.registered=null;
    return true;
  }
  function applyCandidate(r, ctn, steel) {
    let changed=false;
    for(const [field,candidate] of [['ctn',ctn],['steel',steel]]){
      if(candidate==null||locked(r,field))continue;
      const raw='raw'+field[0].toUpperCase()+field.slice(1);
      r[raw]=String(candidate?.text??candidate).trim();r[field]=normalize(r[raw]);
      r[field+'Alternatives']=Array.isArray(candidate?.alternatives)?candidate.alternatives.map(normalize).slice(0,8):[];
      r[field+'Score']=Number.isFinite(candidate?.score)?Math.max(0,Math.min(1,candidate.score)):null;
      r[field+'LowConfidence']=candidate?.lowConfidence===true;
      r[field+'GlyphReview']=candidate?.glyphReview===true;
      r[field+'SlashedZeros']=0;r[field+'ZeroReview']=false;
      if(field==='ctn'){r.ctnSource='ocr';r.ctnLastReview=candidate?.lastReview===true;}
      changed=true;
    }
    if(changed){r.confirmed=false;r.registered=null;}return changed;
  }
  function ready(rows) { return rows.length > 0 && issues(rows).every((v, i) => !v.length && rows[i].confirmed); }
  function confidence(r){
    const reasons=[];
    for(const [field,label] of [['ctn','CTN'],['steel','鋼號']]){
      if(field==='ctn'&&r.ctnSource==='scanner')continue;
      if(r[field+'Score']==null||r[field+'Score']<.9||r[field+'LowConfidence'])reasons.push(label+' 字形信心不足');
      if(new Set((r[field+'Alternatives']||[]).map(normalize)).size>1)reasons.push(label+' 候選有差異，請檢查多字／少字');
      if(r[field+'GlyphReview'])reasons.push(label+' 字形待確認');
    }
    if(r.ctnSource!=='scanner'&&r.ctnLastReview)reasons.push('CTN 最後一碼候選不同或信心不足，請核對英數字');
    return reasons;
  }
  const rtValid=rt=>/^[A-Z0-9][A-Z0-9-]{0,29}$/.test(normalize(rt));
  function registered(r,rt){const v=r.registered;return !!(r.confirmed&&R.ctnValid(r.ctn)&&R.steelValid(r.steel)&&v&&v.rt===normalize(rt)&&v.ctn===normalize(r.ctn)&&v.steel===normalize(r.steel)&&typeof v.at==='string'&&Number.isFinite(Date.parse(v.at)));}
  function complete(rows,rt,index){
    if(!rtValid(rt)||!ready(rows)||!rows[index])throw Error('請先填寫 RT 並逐列核對完整編號');
    const r=rows[index];if(!registered(r,rt))r.registered={rt:normalize(rt),ctn:normalize(r.ctn),steel:normalize(r.steel),at:new Date().toISOString()};
    return rows.findIndex((v,i)=>i>index&&!registered(v,rt));
  }
  function outputReady(rows,rt){return rtValid(rt)&&ready(rows)&&rows.every(r=>registered(r,rt));}
  function cell(value) { return '"' + String(value).replace(/"/g, '""') + '"'; }
  function csv(rows,rt) {
    if (!outputReady(rows,rt)) throw Error('請先填寫 RT、逐列核對並完成逐支註冊確認');
    const lines = [['序號', 'RT（文字）', 'CTN（文字）', '鋼瓶鋼號（文字）', '紙本列', '核對狀態', '本機註冊確認時間']];
    rows.forEach((r, i) => lines.push([i + 1, normalize(rt), normalize(r.ctn), normalize(r.steel), r.sourceIndex == null ? '手動新增' : r.sourceIndex + 1, '已核對', r.registered.at]));
    return '\ufeff' + lines.map(r => r.map(cell).join(',')).join('\r\n');
  }
  function quadValid(q) {
    if (!Array.isArray(q) || q.length !== 4 || q.some(p => p.length !== 2 || p.some(n => !Number.isFinite(n) || n < 0 || n > 1))) return false;
    const cross = q.map((p, i) => { const a = q[(i+1)%4], b = q[(i+2)%4]; return (a[0]-p[0])*(b[1]-a[1])-(a[1]-p[1])*(b[0]-a[0]); });
    return cross.every(v => v > .001) && q[0][1] < q[3][1] && q[1][1] < q[2][1];
  }
  return { VERSION, RULES_PREVIOUS_VERSION, FLOW_VERSION, ALIGNMENT_VERSION, GLYPH_VERSION, LEGACY_VERSION, PREVIOUS_VERSION, ZERO_VERSION, normalize, row, issues, applyPrefixes, locked, edit, scanCtn, applyCandidate, ready, confidence, rtValid, registered, complete, outputReady, csv, quadValid };
});
