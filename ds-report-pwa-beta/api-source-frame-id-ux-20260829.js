/**
 * Grinding WIP｜集束來源框架編號 UI
 * 2026-08-29
 *
 * Backend contract:
 *   BUNDLE_LOT asset may include sourceFrameId.
 *
 * UI:
 *   RT：...｜來源：...｜框架編號：...｜數量 ... 支
 *
 * 散支維持原顯示，不增加框架編號欄。
 */
(function () {
  function installGrindingSourceFrameIdUi_20260829() {
    if (typeof renderWipAssets !== "function") {
      setTimeout(installGrindingSourceFrameIdUi_20260829, 50);
      return;
    }

    renderWipAssets = function () {
      const list = filteredAssets();
      const countEl = document.getElementById("wipCountText");
      if (countEl) {
        countEl.textContent = `${list.length} 項／${list.reduce((n, a) => n + Number(a.qty || 0), 0)} 支`;
      }

      const assetList = document.getElementById("assetList");
      if (!assetList) return;

      assetList.innerHTML = list.length ? list.map(a => {
        const selected = !!state.selected[a.assetKey];
        const isLot = a.trackingType === "BUNDLE_LOT";
        const name = isLot ? `集束來源 ${a.sourceCtn}` : a.assetCtn;
        const qty = Number(state.selectedQty[a.assetKey] || a.qty || 0);
        const source = a.sourceFrameCtn || a.sourceCtn || "-";
        const frameIdPart = isLot
          ? `｜框架編號：${escapeHtml(a.sourceFrameId || "-")}`
          : "";

        return `<article class="asset-item ${selected ? "selected" : ""}" data-asset-key="${escapeHtml(a.assetKey)}">` +
          `<input data-asset-checkbox="1" type="checkbox" ${selected ? "checked" : ""} onchange="toggleAsset('${escapeHtml(a.assetKey)}',this.checked)">` +
          `<div>` +
            `<div class="asset-name">${escapeHtml(name)}</div>` +
            `<div class="asset-sub">RT：${escapeHtml(a.rt || "-")}｜來源：${escapeHtml(source)}${frameIdPart}｜數量 ${Number(a.qty || 0)} 支</div>` +
            `<span class="status-pill">${escapeHtml(statusLabel(a.stationStatus))}</span>` +
          `</div>` +
          `${isLot && selected ? `<input class="qty-input" type="number" min="1" max="${Number(a.qty || 0)}" value="${qty}" onchange="setAssetQty('${escapeHtml(a.assetKey)}',this.value)">` : ""}` +
        `</article>`;
      }).join("") : '<div class="empty">目前沒有符合篩選條件的 Grinding WIP。</div>';

      renderSticky();
    };

    if (typeof state !== "undefined" && state && state.wip) {
      renderWipAssets();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installGrindingSourceFrameIdUi_20260829, { once: true });
  } else {
    installGrindingSourceFrameIdUi_20260829();
  }
})();
