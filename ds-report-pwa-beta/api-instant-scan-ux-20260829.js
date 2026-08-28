/**
 * Grinding WIP｜Instant scan acknowledgement UX
 * 2026-08-29
 *
 * 目的：掃描/手動輸入 CTN 後，第一個 UI frame 就顯示「辨識中…」，
 * 不再等待 revision / wip_lookup 網路往返後才讓使用者看到 CTN。
 * 不改 WIP 寫入、API URL、token、client version 或後端判斷規則。
 */
(function () {
  const pendingScans = Object.create(null);

  function ensureSelectedStrip_() {
    const input = document.getElementById("wipBarcodeInput");
    const scanGrid = input && input.closest ? input.closest(".scan-grid") : null;
    if (!scanGrid) return null;

    let strip = document.getElementById("barcodeSelectedStrip");
    if (!strip) {
      strip = document.createElement("div");
      strip.id = "barcodeSelectedStrip";
      strip.className = "barcode-recent";
      strip.setAttribute("aria-label", "目前已掃描選取 CTN");
      scanGrid.insertAdjacentElement("afterend", strip);
    }
    return strip;
  }

  function selectedCtnGroups_() {
    const grouped = Object.create(null);
    if (typeof state === "undefined") return grouped;

    const assets = state.wip && Array.isArray(state.wip.grindingAssets)
      ? state.wip.grindingAssets
      : [];
    const assetByKey = Object.create(null);
    assets.forEach(function (asset) {
      if (asset && asset.assetKey) assetByKey[asset.assetKey] = asset;
    });

    Object.keys(state.barcodeSelected || {}).forEach(function (assetKey) {
      if (!state.selected || !state.selected[assetKey]) return;
      const asset = assetByKey[assetKey];
      if (!asset) return;

      const isLot = String(asset.trackingType || "").toUpperCase() === "BUNDLE_LOT";
      const ctn = String(isLot ? asset.sourceCtn || "" : asset.assetCtn || "")
        .trim()
        .toUpperCase();
      if (!ctn) return;

      const qty = Number(
        state.selectedQty && state.selectedQty[assetKey] !== undefined
          ? state.selectedQty[assetKey]
          : asset.qty || 1
      );
      grouped[ctn] = Number(grouped[ctn] || 0) + (Number.isFinite(qty) ? qty : 1);
    });
    return grouped;
  }

  function renderInstantStrip_() {
    const strip = ensureSelectedStrip_();
    if (!strip) return;

    const selected = selectedCtnGroups_();
    const html = [];

    Object.keys(selected).forEach(function (ctn) {
      html.push(
        `<span class="barcode-chip ok">${escapeHtml(ctn)}｜已選 ${selected[ctn]} 支</span>`
      );
    });

    Object.keys(pendingScans).forEach(function (ctn) {
      if (selected[ctn]) return;
      html.push(
        `<span class="barcode-chip warn" data-scan-pending="${escapeHtml(ctn)}">${escapeHtml(ctn)}｜辨識中…</span>`
      );
    });

    strip.innerHTML = html.join("");
    strip.style.display = html.length ? "flex" : "none";
  }

  function markPending_(ctn) {
    pendingScans[ctn] = Date.now();
    renderInstantStrip_();
  }

  function clearPending_(ctn) {
    delete pendingScans[ctn];
    renderInstantStrip_();
  }

  function install_() {
    if (typeof findAssetByCtnInList_ !== "function" ||
        typeof findGrindingAssetsByCtn_ !== "function" ||
        typeof pushBarcodeRecent_ !== "function") return;

    // 讓原本 MutationObserver 之後也使用含「辨識中」狀態的 renderer。
    window.renderGrindingBarcodeSelectedStrip_ = renderInstantStrip_;

    window.scanGrindingWipBarcode = async function () {
      if (!ensureClientWriteAllowed()) return;

      const input = document.getElementById("wipBarcodeInput");
      const ctn = normalizeCtn(input && input.value || "");
      if (input) input.value = "";

      if (!CTN_RE.test(ctn)) {
        pushBarcodeRecent_(
          ctn || "格式錯誤",
          "bad",
          "Barcoder CTN 格式錯誤，需為 7 碼。未寫入任何資料。"
        );
        if (navigator.vibrate) navigator.vibrate([80,40,80]);
        focusWipBarcode();
        return;
      }

      // 關鍵 UX：任何網路 await 之前，立即回饋掃描器/手動輸入已被接收。
      markPending_(ctn);
      if (navigator.vibrate) navigator.vibrate(25);
      focusWipBarcode();

      let assets = findGrindingAssetsByCtn_(ctn);

      if (!assets.length &&
          Date.now() - Number(state.lastBootstrapAt || 0) > 15000 &&
          !state.refreshing) {
        try {
          await checkRemoteRevision(true);
        } catch (ignore) {}
        assets = findGrindingAssetsByCtn_(ctn);
      }

      if (!assets.length) {
        let message = describeRejectedBarcode_(ctn);
        if (!message) {
          try {
            const result = await fetchBetaWipLookup(ctn);
            message = normalizeBetaPreciseCtnStatusMessage_(result);
          } catch (err) {
            message = "CTN狀態查詢失敗，請確認連線後重試";
          }
        }

        clearPending_(ctn);
        if (!message) message = "CTN狀態無法判定，請重新查詢";
        pushBarcodeRecent_(ctn, "bad", message);
        if (navigator.vibrate) navigator.vibrate([100,50,100]);
        focusWipBarcode();
        return;
      }

      const unselected = assets.filter(function (asset) {
        return !state.selected[asset.assetKey];
      });

      if (!unselected.length) {
        assets.forEach(function (asset) {
          state.barcodeSelected[asset.assetKey] = true;
        });
        clearPending_(ctn);
        pushBarcodeRecent_(
          ctn,
          "warn",
          "CTN已進入Grinding WIP｜此 CTN 已經選取，不會重複計數。"
        );
        if (navigator.vibrate) navigator.vibrate(70);
        focusWipBarcode();
        return;
      }

      unselected.forEach(function (asset) {
        state.selected[asset.assetKey] = true;
        state.selectedQty[asset.assetKey] = Number(asset.qty || 1);
        state.barcodeSelected[asset.assetKey] = true;
        updateAssetSelectionDom_(asset.assetKey, true);
      });

      // 本機已能判斷的 WIP CTN 不等任何 API，立即轉成「已選」。
      clearPending_(ctn);
      renderWipAssets();
      renderSticky();
      renderInstantStrip_();

      const selectedQty = unselected.reduce(function (sum, asset) {
        return sum + Number(asset.qty || 1);
      }, 0);
      const segmentText = unselected.length > 1
        ? `｜${unselected.length}筆在製片段`
        : "";

      pushBarcodeRecent_(
        ctn,
        "ok",
        `CTN已進入Grinding WIP｜已選取 ${selectedQty} 支${segmentText}。尚未改帳。`
      );
      if (navigator.vibrate) navigator.vibrate(35);
      focusWipBarcode();
    };

    renderInstantStrip_();
  }

  window.addEventListener("DOMContentLoaded", function () {
    setTimeout(install_, 60);
  });
})();
