/**
 * Grinding WIP v2.0.8 hotfix｜精確 CTN 狀態提示
 * candidate only：目前 production index.html 尚未載入此檔。
 * client_version 維持 v2.0.7，不改 API URL / token / version lock。
 */
window.addEventListener("DOMContentLoaded", function() {
  setTimeout(function() {
    window.describeRejectedBarcode_ = function(ctn) {
      const waiting = findAssetByCtnInList_(state.wip && state.wip.waitSandblastAssets, ctn);
      if (waiting) return "CTN已入噴砂框";
      const disposed = findAssetByCtnInList_(state.wip && state.wip.dispositions, ctn);
      if (disposed) {
        const status = String(disposed.lifecycleStatus || disposed.stationStatus || "").toUpperCase();
        if (status === "DCYL") return "CTN已轉DCYL";
        if (status === "HT") return "CTN已轉HT";
      }
      return "";
    };

    window.scanGrindingWipBarcode = async function() {
      if (!ensureClientWriteAllowed()) return;
      const input = document.getElementById("wipBarcodeInput");
      const ctn = normalizeCtn(input && input.value || "");
      if (input) input.value = "";
      if (!CTN_RE.test(ctn)) {
        pushBarcodeRecent_(ctn || "格式錯誤", "bad", "Barcoder CTN 格式錯誤，需為 7 碼。未寫入任何資料。");
        if (navigator.vibrate) navigator.vibrate([80,40,80]);
        focusWipBarcode();
        return;
      }
      let assets = findGrindingAssetsByCtn_(ctn);
      if (!assets.length && Date.now() - Number(state.lastBootstrapAt || 0) > 15000 && !state.refreshing) {
        await checkRemoteRevision(true);
        assets = findGrindingAssetsByCtn_(ctn);
      }
      if (!assets.length) {
        let message = describeRejectedBarcode_(ctn);
        if (!message) {
          try {
            const result = await fetchBetaWipLookup(ctn);
            message = String(result && result.message || "CTN狀態無法判定，請重新查詢");
          } catch (err) {
            message = "CTN狀態查詢失敗，請確認連線後重試";
          }
        }
        pushBarcodeRecent_(ctn, "bad", message);
        if (navigator.vibrate) navigator.vibrate([100,50,100]);
        focusWipBarcode();
        return;
      }
      const unselected = assets.filter(function(asset) { return !state.selected[asset.assetKey]; });
      if (!unselected.length) {
        assets.forEach(function(asset) { state.barcodeSelected[asset.assetKey] = true; });
        pushBarcodeRecent_(ctn, "warn", "CTN已進入Grinding WIP｜此 CTN 已經選取，不會重複計數。");
        if (navigator.vibrate) navigator.vibrate(70);
        focusWipBarcode();
        return;
      }
      unselected.forEach(function(asset) {
        state.selected[asset.assetKey] = true;
        state.selectedQty[asset.assetKey] = Number(asset.qty || 1);
        state.barcodeSelected[asset.assetKey] = true;
        updateAssetSelectionDom_(asset.assetKey, true);
      });
      renderWipAssets();
      renderSticky();
      const selectedQty = unselected.reduce(function(sum, asset) { return sum + Number(asset.qty || 1); }, 0);
      const segmentText = unselected.length > 1 ? "｜" + unselected.length + "筆在製片段" : "";
      pushBarcodeRecent_(ctn, "ok", "CTN已進入Grinding WIP｜已選取 " + selectedQty + " 支" + segmentText + "。尚未改帳。");
      if (navigator.vibrate) navigator.vibrate(35);
      focusWipBarcode();
    };
  }, 0);
});
