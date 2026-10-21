(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RegistrationModel = factory();
})(typeof window === 'undefined' ? this : window, function() {
  'use strict';
  const VERSION = 'CYL-REG-DEMO-0.1-20261021';
  const normalize = value => String(value || '').normalize('NFKC').toUpperCase().replace(/\s+/g, '');
  const id = () => globalThis.crypto.randomUUID();
  function row(sourceIndex = null) {
    return { id: id(), sourceIndex, ctn: '', steel: '', rawCtn: '', rawSteel: '', confirmed: false, edited: false, prefixApplied: false };
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
      if (s && !/^[A-Z0-9][A-Z0-9-]*$/.test(s)) out.push('鋼號含待確認字元');
      if (ctn.get(c) > 1) out.push('CTN 重複');
      if (steel.get(s) > 1) out.push('鋼號重複');
      return out;
    });
  }
  function applyPrefixes(rows, ctnPrefix, steelPrefix) {
    const cp = normalize(ctnPrefix), sp = normalize(steelPrefix);
    if (cp && !/^[A-Z0-9]{4}$/.test(cp)) throw Error('CTN 共用前綴須為 4 碼英數字');
    if (sp && !/^[A-Z0-9-]+$/.test(sp)) throw Error('請確認鋼號共用前綴');
    let changed = 0;
    for (const r of rows) {
      let applied = false;
      if (cp && /^[A-Z0-9]{3}$/.test(normalize(r.ctn))) { r.ctn = cp + normalize(r.ctn); applied = true; }
      if (sp && /^\d{6}$/.test(normalize(r.steel))) { r.steel = sp + normalize(r.steel); applied = true; }
      if (applied) { r.confirmed = false; r.edited = true; r.prefixApplied = true; changed++; }
    }
    return changed;
  }
  function applyCandidate(r, ctn, steel) {
    if (r.edited || r.confirmed) return false;
    r.rawCtn = String(ctn || '').trim(); r.rawSteel = String(steel || '').trim();
    r.ctn = normalize(r.rawCtn); r.steel = normalize(r.rawSteel);
    r.confirmed = false; return true;
  }
  function ready(rows) { return rows.length > 0 && issues(rows).every((v, i) => !v.length && rows[i].confirmed); }
  function cell(value) { return '"' + String(value).replace(/"/g, '""') + '"'; }
  function csv(rows) {
    if (!ready(rows)) throw Error('請先逐列核對，並處理空值與重複');
    const lines = [['序號', 'CTN（文字）', '鋼瓶鋼號（文字）', '紙本列', '核對狀態', '現場註冊確認']];
    rows.forEach((r, i) => lines.push([i + 1, normalize(r.ctn), normalize(r.steel), r.sourceIndex == null ? '手動新增' : r.sourceIndex + 1, '已核對', '']));
    return '\ufeff' + lines.map(r => r.map(cell).join(',')).join('\r\n');
  }
  function quadValid(q) {
    if (!Array.isArray(q) || q.length !== 4 || q.some(p => p.length !== 2 || p.some(n => !Number.isFinite(n) || n < 0 || n > 1))) return false;
    const cross = q.map((p, i) => { const a = q[(i+1)%4], b = q[(i+2)%4]; return (a[0]-p[0])*(b[1]-a[1])-(a[1]-p[1])*(b[0]-a[0]); });
    return cross.every(v => v > .001) && q[0][1] < q[3][1] && q[1][1] < q[2][1];
  }
  return { VERSION, normalize, row, issues, applyPrefixes, applyCandidate, ready, csv, quadValid };
});
