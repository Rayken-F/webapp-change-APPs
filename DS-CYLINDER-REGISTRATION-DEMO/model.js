(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RegistrationModel = factory();
})(typeof window === 'undefined' ? this : window, function() {
  'use strict';
  const VERSION = 'CYL-REG-DEMO-0.6.1-20261024';
  const FLOW_VERSION = 'CYL-REG-DEMO-0.6-20261024';
  const ALIGNMENT_VERSION = 'CYL-REG-DEMO-0.5-20261023';
  const GLYPH_VERSION = 'CYL-REG-DEMO-0.4-20261022';
  const LEGACY_VERSION = 'CYL-REG-DEMO-0.1-20261021';
  const PREVIOUS_VERSION = 'CYL-REG-DEMO-0.2-20261021';
  const ZERO_VERSION = 'CYL-REG-DEMO-0.3-20261021';
  const normalize = value => String(value || '').normalize('NFKC').toUpperCase().replace(/\s+/g, '');
  const id = () => globalThis.crypto.randomUUID();
  function row(sourceIndex = null) {
    return { id: id(), sourceIndex, ctn: '', steel: '', rawCtn: '', rawSteel: '', ctnAlternatives: [], steelAlternatives: [], ctnSlashedZeros: 0, steelSlashedZeros: 0, ctnZeroReview: false, steelZeroReview: false, ctnGlyphReview: false, steelGlyphReview: false, ctnScore:null, steelScore:null, ctnLowConfidence:false, steelLowConfidence:false, registered:null, confirmed: false, edited: false, prefixApplied: false };
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
      if (s && !/^[A-Z0-9][A-Z0-9-]*$/.test(s)) out.push('鋼號含待確認字元');
      if (s.length>60) out.push('鋼號超過 60 碼，請核對');
      if (ctn.get(c) > 1) out.push('CTN 重複');
      if (steel.get(s) > 1) out.push('鋼號重複');
      return out;
    });
  }
  function applyPrefixes(rows, ctnPrefix, steelPrefix) {
    const cp = normalize(ctnPrefix), sp = normalize(steelPrefix);
    if (cp && !/^[A-Z0-9]{4}$/.test(cp)) throw Error('CTN 共用前綴須為 4 碼英數字');
    if (cp && !/^[0-9]{2}$/.test(cp.slice(2,4))) throw Error('CTN 前綴第 3、4 碼必須是數字');
    if (sp && !/^[A-Z0-9-]+$/.test(sp)) throw Error('請確認鋼號共用前綴');
    let changed = 0;
    for (const r of rows) {
      let applied = false;
      if (cp && /^[A-Z0-9]{3}$/.test(normalize(r.ctn))) { r.ctn = cp + normalize(r.ctn); applied = true; }
      if (sp && /^\d{6}$/.test(normalize(r.steel))) { r.steel = sp + normalize(r.steel); applied = true; }
      if (applied) { r.confirmed = false; r.registered=null; r.edited = true; r.prefixApplied = true; changed++; }
    }
    return changed;
  }
  function applyCandidate(r, ctn, steel) {
    if (r.edited || r.confirmed) return false;
    r.rawCtn = String(ctn?.text ?? ctn ?? '').trim(); r.rawSteel = String(steel?.text ?? steel ?? '').trim();
    r.ctnAlternatives = Array.isArray(ctn?.alternatives) ? ctn.alternatives.map(normalize).slice(0,4) : [];
    r.steelAlternatives = Array.isArray(steel?.alternatives) ? steel.alternatives.map(normalize).slice(0,4) : [];
    r.ctnSlashedZeros = Number.isInteger(ctn?.slashedZeros) ? Math.max(0,Math.min(16,ctn.slashedZeros)) : 0;
    r.steelSlashedZeros = Number.isInteger(steel?.slashedZeros) ? Math.max(0,Math.min(16,steel.slashedZeros)) : 0;
    r.ctnZeroReview = Number(ctn?.unverifiedZeros)>0; r.steelZeroReview = Number(steel?.unverifiedZeros)>0;
    r.ctnGlyphReview = ctn?.glyphReview===true; r.steelGlyphReview = steel?.glyphReview===true;
    for(const [field,candidate] of [['ctn',ctn],['steel',steel]]){
      r[field+'Score']=Number.isFinite(candidate?.score)?Math.max(0,Math.min(1,candidate.score)):null;
      r[field+'LowConfidence']=candidate?.lowConfidence===true;
    }
    r.ctn = normalize(r.rawCtn); r.steel = normalize(r.rawSteel);
    r.confirmed = false; return true;
  }
  function ready(rows) { return rows.length > 0 && issues(rows).every((v, i) => !v.length && rows[i].confirmed); }
  function confidence(r){
    const reasons=[];
    for(const [field,label] of [['ctn','CTN'],['steel','鋼號']]){
      if(r[field+'Score']==null||r[field+'Score']<.9||r[field+'LowConfidence'])reasons.push(label+' 字形信心不足');
      if(new Set((r[field+'Alternatives']||[]).map(normalize)).size>1)reasons.push(label+' 候選有差異，請檢查多字／少字');
      if(r[field+'ZeroReview']||r[field+'GlyphReview'])reasons.push(label+' 字形待確認');
    }
    return reasons;
  }
  const rtValid=rt=>/^[A-Z0-9][A-Z0-9-]{0,29}$/.test(normalize(rt));
  function registered(r,rt){const v=r.registered;return !!(r.confirmed&&/^[A-Z0-9]{2}[0-9]{2}[A-Z0-9]{3}$/.test(normalize(r.ctn))&&v&&v.rt===normalize(rt)&&v.ctn===normalize(r.ctn)&&v.steel===normalize(r.steel)&&typeof v.at==='string'&&Number.isFinite(Date.parse(v.at)));}
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
  return { VERSION, FLOW_VERSION, ALIGNMENT_VERSION, GLYPH_VERSION, LEGACY_VERSION, PREVIOUS_VERSION, ZERO_VERSION, normalize, row, issues, applyPrefixes, applyCandidate, ready, confidence, rtValid, registered, complete, outputReady, csv, quadValid };
});
