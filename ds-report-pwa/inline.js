  const STORAGE_KEY = "ds_report_draft_v2";
  const VISIBLE_ERROR_ATTR = "data-has-visible-error";
  const ERROR_DISPLAY_MS = 3000;

  const formData = { 
    date:"",
    person:"",
    site:"",
    workers:[],

    sb_frame_remove:"",
    sb_frame_pairs:[],
    sb_pre_complete:"",
    sb_neck_grind:"",
    sb_pre_ctn_protect:"",
    sb_frame_scan:"",
    sb_cylinder_scan:"",
    sb_note:"",

    ut_load_count:"",
    ut_unload_frame:"",
    ut_fixture_install:"",
    ut_sand_count:"",
    ut_note:"",

    stamp_ht_mark:"",
    stamp_ut_mark:"",
    stamp_wait_sand:"",
    stamp_rework_count:"",
    stamp_ship:"",
    stamp_note:"",

    bundle_frame_count:1,
    bundle_frames:[],

    project_item:"",
    proj_new_cylinder:"",
    proj_register:"",
    proj_valve_install:"",
    proj_cylinder_frame:"",
    proj_bundle_install:"",
    proj_bundle_leak:"",
    proj_repair_ctn:"",
    proj_note:"",
    photo:""
  };

  const scanState = {
    sb_frame_pairs:[],
    sb_cylinder_scan:[]
  };

  let sending = false;
  let projectOptionsLoaded = false;

  function getValue(id){
    const el = document.getElementById(id);
    return el ? el.value : "";
  }

  async function loadProjectOptions(){
    const select = document.getElementById("project_item");
    if(!select) return;

    const previousValue = formData.project_item || select.value || "";

    select.innerHTML = '<option value="">載入中...</option>';
    select.disabled = true;

    try{
      const projects = await fetchProjectOptions();
      select.innerHTML = "";

      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "請選擇";
      select.appendChild(defaultOption);

      projects.forEach(projectName => {
        const option = document.createElement("option");
        option.value = projectName;
        option.textContent = projectName;
        select.appendChild(option);
      });

      if(previousValue && projects.includes(previousValue)){
        select.value = previousValue;
      } else {
        select.value = "";
        if(previousValue){
          formData.project_item = "";
        }
      }

      select.disabled = false;
      projectOptionsLoaded = true;
    }
    catch(err){
      console.error("專案清單讀取失敗", err);
      select.innerHTML = `
        <option value="">讀取失敗，請稍後重整</option>
        <option value="報廢鋼瓶">報廢鋼瓶</option>
      `;
      if(previousValue === "報廢鋼瓶"){
        select.value = "報廢鋼瓶";
      }
      select.disabled = false;
      projectOptionsLoaded = true;
    }
  }

  function nextPage(pageId){
    saveData();

    const current = document.querySelector(".page.active");
    const next = document.getElementById(pageId);

    if(!next || !current || current === next) return;

    current.classList.remove("active");
    next.classList.add("active");

    if(pageId === "page7"){
      renderConfirm();
      updateStep(3);
    }
    else{
      updateStep(2);
    }

    persistDraft();
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  function prevPage(pageId){
    saveData();

    const current = document.querySelector(".page.active");
    const prev = document.getElementById(pageId);

    if(!prev || !current || current === prev) return;

    current.classList.remove("active");
    prev.classList.add("active");

    if(pageId === "page1"){
      updateStep(1);
    }
    else{
      updateStep(2);
    }

    persistDraft();
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  function backToSite(){
    let targetPage = "";

    if(formData.site === "自動噴砂站"){
      targetPage = "pageSandblast";
    }
    else if(formData.site === "UT站"){
      targetPage = "pageUT";
    }
    else if(formData.site === "鋼印鎖瓶站"){
      targetPage = "pageStamp";
    }
    else if(formData.site === "集束中心"){
      targetPage = "pageBundle";
    }
    else if(formData.site === "專案"){
      targetPage = "pageProject";
    }
    else{
      targetPage = "page1";
    }

    prevPage(targetPage);
  }

  function getActivePageId(){
    const active = document.querySelector(".page.active");
    return active ? active.id : "page1";
  }

  function getFirstVisibleErrorCard(){
    return document.querySelector(`[${VISIBLE_ERROR_ATTR}="true"]`);
  }

  function handlePreviewNavigation(){
    saveData();

    if(formData.site === "自動噴砂站" && !validateSandblastFramePairs(true)){
      return;
    }

    const visibleErrorCard = getFirstVisibleErrorCard();

    if(visibleErrorCard){
      visibleErrorCard.scrollIntoView({
        behavior:"smooth",
        block:"center"
      });

      visibleErrorCard.classList.remove("shake");
      void visibleErrorCard.offsetWidth;
      visibleErrorCard.classList.add("shake");

      setTimeout(()=>{
        visibleErrorCard.classList.remove("shake");
      }, 450);

      return;
    }

    nextPage("page7");
  }

  function saveData(){
    formData.date = getValue("date");
    formData.person = getValue("person");

    const site = document.querySelector('input[name="site"]:checked');
    formData.site = site ? site.value : "";

    const workers = [];
    document.querySelectorAll(".checkbox-group input:checked").forEach(c => workers.push(c.value));
    formData.workers = workers;

    collectFramePairRowsFromUI();
    formData.sb_frame_remove = scanState.sb_frame_pairs.map(item => item.frameId).filter(Boolean).join("\n");
    formData.sb_pre_complete = getValue("sb_pre_complete");
    formData.sb_neck_grind = getValue("sb_neck_grind");
    formData.sb_pre_ctn_protect = getValue("sb_pre_ctn_protect");
    formData.sb_frame_pairs = JSON.parse(JSON.stringify(scanState.sb_frame_pairs));
    formData.sb_frame_scan = scanState.sb_frame_pairs.map(item => item.ctn).filter(Boolean).join("\n");
    formData.sb_cylinder_scan = scanState.sb_cylinder_scan.join("\n");
    formData.sb_note = getValue("sb_note");

    formData.ut_load_count = getValue("ut_load_count");
    formData.ut_unload_frame = getValue("ut_unload_frame");
    formData.ut_fixture_install = getValue("ut_fixture_install");
    formData.ut_sand_count = getValue("ut_sand_count");
    formData.ut_note = getValue("ut_note");

    formData.stamp_ht_mark = getValue("stamp_ht_mark");
    formData.stamp_ut_mark = getValue("stamp_ut_mark");
    formData.stamp_wait_sand = getValue("stamp_wait_sand");
    formData.stamp_rework_count = getValue("stamp_rework_count");
    formData.stamp_ship = getValue("stamp_ship");
    formData.stamp_note = getValue("stamp_note");

    collectBundleFramesFromUI();

    formData.project_item = getValue("project_item");
    formData.proj_new_cylinder = getValue("proj_new_cylinder");
    formData.proj_register = getValue("proj_register");
    formData.proj_valve_install = getValue("proj_valve_install");
    formData.proj_cylinder_frame = getValue("proj_cylinder_frame");
    formData.proj_bundle_install = getValue("proj_bundle_install");
    formData.proj_bundle_leak = getValue("proj_bundle_leak");
    formData.proj_repair_ctn = toUpperSafe(getValue("proj_repair_ctn"));
    formData.proj_note = getValue("proj_note");
  }

  function hasMeaningfulDraftContent(){
    const today = new Date().toISOString().split("T")[0];

    if(formData.site) return true;
    if(Array.isArray(formData.workers) && formData.workers.length > 0) return true;
    if(formData.date && formData.date !== today) return true;

    if(Array.isArray(scanState.sb_cylinder_scan) && scanState.sb_cylinder_scan.length > 0) return true;
    if(Array.isArray(scanState.sb_frame_pairs) && scanState.sb_frame_pairs.some(item => item && (item.frameId || item.ctn))) return true;

    const ignoredKeys = new Set(["date", "person", "workers", "site", "photo", "bundle_frame_count", "bundle_frames", "sb_frame_pairs"]);
    return Object.keys(formData).some(key => {
      if(ignoredKeys.has(key)) return false;
      const value = formData[key];
      if(Array.isArray(value)) return value.length > 0;
      return String(value || "").trim() !== "";
    });
  }

  function persistDraft(){
    try{
      saveData();

      if(!hasMeaningfulDraftContent()){
        localStorage.removeItem(STORAGE_KEY);
        if(formData.person){
          localStorage.setItem("report_person", formData.person);
        }
        return;
      }

      const draft = {
        formData: JSON.parse(JSON.stringify(formData)),
        scanState: JSON.parse(JSON.stringify(scanState)),
        activePageId: getActivePageId(),
        savedAt: new Date().toISOString()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));

      if(formData.person){
        localStorage.setItem("report_person", formData.person);
      }
    }
    catch(err){
      console.error("草稿儲存失敗", err);
    }
  }

  function loadDraft(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;

    try{
      const draft = JSON.parse(raw);
      if(!draft || !draft.formData) return;

      const today = new Date().toISOString().split("T")[0];
      const draftDate = draft.formData.date || "";
      const isCrossDayDraft = draftDate && draftDate !== today;

      if(isCrossDayDraft){
        const shouldApply = window.confirm(
          `偵測到前一日未送出草稿（${draftDate}），是否套用內容到今天？`
        );

        if(!shouldApply){
          localStorage.removeItem(STORAGE_KEY);
          showDraftBanner("已略過前一日草稿，系統將以今日空白表單開始", {
            autoHide: true,
            duration: 5000,
            countdown: true
          });
          return;
        }
      }

      Object.keys(formData).forEach(key => {
        if(draft.formData.hasOwnProperty(key)){
          if(key === "date"){
            formData.date = today;
          }
          else{
            formData[key] = draft.formData[key];
          }
        }
      });

      if(draft.scanState){
        scanState.sb_frame_pairs = Array.isArray(draft.scanState.sb_frame_pairs)
          ? draft.scanState.sb_frame_pairs
          : [];

        scanState.sb_cylinder_scan = Array.isArray(draft.scanState.sb_cylinder_scan)
          ? draft.scanState.sb_cylinder_scan
          : [];
      }

      applyFormDataToUI(draft.activePageId || "page1");

      if(isCrossDayDraft){
        showDraftBanner(`已套用 ${draftDate} 的未送出草稿內容，日期已更新為今天`, {
          autoHide: true,
          duration: 5000
        });
      }
      else{
        showDraftBanner("已恢復上次未送出的草稿", {
          autoHide: true,
          duration: 5000,
          countdown: true
        });
      }

      persistDraft();
    }
    catch(err){
      console.error("草稿讀取失敗", err);
    }
  }

  function applyFormDataToUI(activePageId){
    document.getElementById("date").value = formData.date || "";
    document.getElementById("person").value = formData.person || "";

    if(formData.site){
      const siteRadio = document.querySelector(`input[name="site"][value="${formData.site}"]`);
      if(siteRadio){
        siteRadio.checked = true;
      }
    }

    document.querySelectorAll(".checkbox-group input").forEach(c => {
      c.checked = formData.workers.includes(c.value);
    });

    const fillMap = {
      sb_pre_complete:"sb_pre_complete",
      sb_neck_grind:"sb_neck_grind",
      sb_pre_ctn_protect:"sb_pre_ctn_protect",
      sb_note:"sb_note",

      ut_load_count:"ut_load_count",
      ut_unload_frame:"ut_unload_frame",
      ut_fixture_install:"ut_fixture_install",
      ut_sand_count:"ut_sand_count",
      ut_note:"ut_note",

      stamp_ht_mark:"stamp_ht_mark",
      stamp_ut_mark:"stamp_ut_mark",
      stamp_wait_sand:"stamp_wait_sand",
      stamp_rework_count:"stamp_rework_count",
      stamp_ship:"stamp_ship",
      stamp_note:"stamp_note",

      project_item:"project_item",
      proj_new_cylinder:"proj_new_cylinder",
      proj_register:"proj_register",
      proj_valve_install:"proj_valve_install",
      proj_cylinder_frame:"proj_cylinder_frame",
      proj_bundle_install:"proj_bundle_install",
      proj_bundle_leak:"proj_bundle_leak",
      proj_repair_ctn:"proj_repair_ctn",
      proj_note:"proj_note"
    };

    Object.keys(fillMap).forEach(key => {
      const el = document.getElementById(fillMap[key]);
      if(el){
        if(key === "project_item"){
          return;
        }
        el.value = formData[key] || "";
      }
    });

    if(Array.isArray(formData.sb_frame_pairs)){
      scanState.sb_frame_pairs = formData.sb_frame_pairs.map((item, index) => ({
        rowId: item.rowId || ("pair_" + index + "_" + Date.now()),
        frameId: toUpperSafe(item.frameId || ""),
        ctn: normalizeCTN(item.ctn || "")
      }));
    }
    renderFramePairTable();

    const projRepairCtnEl = document.getElementById("proj_repair_ctn");
    if(projRepairCtnEl){
      projRepairCtnEl.value = toUpperSafe(projRepairCtnEl.value);
    }

    const bundleCountInput = document.getElementById("bundle_frame_count");
    if(bundleCountInput){
      bundleCountInput.value = normalizeBundleFrameCount(formData.bundle_frame_count || 1);
    }

    ensureBundleFramesLength(normalizeBundleFrameCount(formData.bundle_frame_count || 1));
    renderBundleCards();

    renderFramePairTable();
    renderScanDisplay("sb_cylinder_scan");

    goToPageImmediately(activePageId);
  }

  function goToPageImmediately(pageId){
    document.querySelectorAll(".page").forEach(page => {
      page.classList.remove("active","exit");
    });

    const target = document.getElementById(pageId) || document.getElementById("page1");
    target.classList.add("active");

    if(pageId === "page1"){
      updateStep(1);
    }
    else if(pageId === "page7"){
      renderConfirm();
      updateStep(3);
    }
    else{
      updateStep(2);
    }
  }

  function clearDraft(showMessage, options = {}){
    const {
      requireConfirm = true
    } = options;

    if(requireConfirm){
      const confirmed = window.confirm("是否清除草稿？\n清除後，當前所有未送出的資料都會消失。");

      if(!confirmed){
        return;
      }
    }

    localStorage.removeItem(STORAGE_KEY);

    Object.keys(formData).forEach(key => {
      if(Array.isArray(formData[key])){
        formData[key] = [];
      }
      else{
        formData[key] = "";
      }
    });

    formData.workers = [];
    formData.bundle_frame_count = 1;
    formData.bundle_frames = [];

    scanState.sb_frame_pairs = [];
    scanState.sb_cylinder_scan = [];

    document.querySelectorAll("input, textarea, select").forEach(el => {
      const type = (el.type || "").toLowerCase();

      if(type === "radio" || type === "checkbox"){
        el.checked = false;
      }
      else if(type === "file"){
        el.value = "";
      }
      else{
        el.value = "";
      }
    });

    const today = new Date().toISOString().split("T")[0];
    const dateInput = document.getElementById("date");
    if(dateInput){
      dateInput.value = today;
      formData.date = today;
    }

    const savedPerson = localStorage.getItem("report_person");
    const personInput = document.getElementById("person");
    if(savedPerson && personInput){
      personInput.value = savedPerson;
      formData.person = savedPerson;
    }

    const bundleCountInput = document.getElementById("bundle_frame_count");
    if(bundleCountInput){
      bundleCountInput.value = 1;
    }

    renderBundleCards();
    renderFramePairTable();
    renderScanDisplay("sb_cylinder_scan");
    clearErrors();
    goToPageImmediately("page1");
    updateStep(1);
    window.scrollTo({top:0,behavior:"smooth"});

    if(projectOptionsLoaded){
      loadProjectOptions();
    }

    if(showMessage){
      showDraftBanner("草稿已清除，已返回首頁", {
        autoHide: true,
        duration: 3000,
        countdown: true
      });
    }
  }

  function showDraftBanner(message, options = {}){
    const {
      autoHide = true,
      duration = 5000,
      countdown = false
    } = options;

    const banner = document.getElementById("draftBanner");

    if(window.__draftBannerTimer){
      clearTimeout(window.__draftBannerTimer);
      window.__draftBannerTimer = null;
    }

    if(window.__draftBannerCountdownTimer){
      clearInterval(window.__draftBannerCountdownTimer);
      window.__draftBannerCountdownTimer = null;
    }

    const closeButtonId = "draftBannerCloseBtn";

    banner.innerHTML = `
      <div>${message}</div>
      <div class="draft-actions">
        <button type="button" class="btn-danger" id="${closeButtonId}" onclick="hideDraftBanner()">關閉提示</button>
      </div>
    `;

    banner.style.display = "block";
    setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }, 50);

    if(autoHide){
      if(countdown){
        const btn = document.getElementById(closeButtonId);
        let remain = Math.ceil(duration / 1000);

        if(btn){
          btn.innerText = `關閉提示(${remain})`;
        }

        window.__draftBannerCountdownTimer = setInterval(()=>{
          remain--;

          if(remain > 0){
            if(btn){
              btn.innerText = `關閉提示(${remain})`;
            }
          }
        }, 1000);
      }

      window.__draftBannerTimer = setTimeout(()=>{
        hideDraftBanner();
      }, duration);
    }
  }

  function hideDraftBanner(){
    const banner = document.getElementById("draftBanner");
    banner.style.display = "none";

    if(window.__draftBannerTimer){
      clearTimeout(window.__draftBannerTimer);
      window.__draftBannerTimer = null;
    }

    if(window.__draftBannerCountdownTimer){
      clearInterval(window.__draftBannerCountdownTimer);
      window.__draftBannerCountdownTimer = null;
    }
  }
  function bindDraftLifecycleGuards(){
    const guardedSave = () => {
      if(window.__pairDraftTimer){
        clearTimeout(window.__pairDraftTimer);
        window.__pairDraftTimer = null;
      }
      persistDraft();
    };

    window.addEventListener("pagehide", guardedSave);
    window.addEventListener("beforeunload", guardedSave);
    window.addEventListener("popstate", guardedSave);

    document.addEventListener("visibilitychange", function(){
      if(document.visibilityState === "hidden"){
        guardedSave();
      }
    });
  }


  function normalizeCTN(value){
    return (value || "").trim().toUpperCase();
  }

  function isValidCTN(value){
    return /^[A-Z]{2}\d{2}[A-Z]{2}[A-Z0-9]$/.test(value);
  }

  function getCardIds(fieldKey){
    if(fieldKey === "sb_frame_scan"){
      return {
        cardId:"scan-card-frame",
        errorId:"sb_frame_scan_error",
        countId:"frame-count-text",
        title:"框架CTN掃描"
      };
    }

    return {
      cardId:"scan-card-cylinder",
      errorId:"sb_cylinder_scan_error",
      displayId:"sb_cylinder_scan_display",
      inputId:"sb_cylinder_scan_input",
      countId:"cylinder-count-text",
      title:"散支鋼瓶CTN掃描"
    };
  }

  function findDuplicateOwner(ctn){
    if(scanState.sb_frame_pairs.some(item => item.ctn === ctn)){
      return "框架CTN掃描";
    }

    if(scanState.sb_cylinder_scan.includes(ctn)){
      return "散支鋼瓶CTN掃描";
    }

    return "";
  }

  function beepError(){
    try{
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if(!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(680, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.12, ctx.currentTime);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.15);

      oscillator.onended = function(){
        ctx.close();
      };
    }
    catch(err){
      console.warn("提示音播放失敗", err);
    }
  }

  function showScanError(fieldKey, message){
    const config = getCardIds(fieldKey);
    const card = document.getElementById(config.cardId);
    const errorEl = document.getElementById(config.errorId);

    errorEl.innerText = message;

    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("scan-card-error","shake");
    card.setAttribute(VISIBLE_ERROR_ATTR, "true");

    beepError();

    setTimeout(()=>{
      card.classList.remove("shake");
    }, 450);

    setTimeout(()=>{
      card.classList.remove("scan-card-error");
      card.removeAttribute(VISIBLE_ERROR_ATTR);
      errorEl.innerText = "";
    }, ERROR_DISPLAY_MS);
  }

  function renderScanDisplay(fieldKey){
    const config = getCardIds(fieldKey);
    const list = scanState[fieldKey];

    const displayEl = document.getElementById(config.displayId);
    const countEl = document.getElementById(config.countId);

    countEl.innerText = `目前數量：${list.length}`;

    if(list.length === 0){
      displayEl.classList.add("empty");
      displayEl.innerText = "尚未掃描任何 CTN";
    }
    else{
      displayEl.classList.remove("empty");
      displayEl.innerText = list.join("\n");
      displayEl.scrollTop = displayEl.scrollHeight;
    }

    formData[fieldKey] = list.join("\n");
  }


  function createFramePairRow(data = {}){
    return {
      rowId: data.rowId || ("pair_" + Date.now() + "_" + Math.random().toString(36).slice(2,8)),
      frameId: toUpperSafe(data.frameId || ""),
      ctn: normalizeCTN(data.ctn || "")
    };
  }

  function addFramePairRow(prefill = {}){
    collectFramePairRowsFromUI();
    scanState.sb_frame_pairs.push(createFramePairRow(prefill));
    renderFramePairTable();
    persistDraft();
  }

  function removeFramePairRow(rowId){
    scanState.sb_frame_pairs = scanState.sb_frame_pairs.filter(item => item.rowId !== rowId);
    renderFramePairTable();
    persistDraft();
  }

  function renderFramePairTable(){
    const body = document.getElementById("frame-pair-table-body");
    const emptyEl = document.getElementById("frame-pair-empty");
    const countEl = document.getElementById("frame-count-text");
    if(!body) return;

    if(!Array.isArray(scanState.sb_frame_pairs)){
      scanState.sb_frame_pairs = [];
    }

    if(scanState.sb_frame_pairs.length === 0){
      scanState.sb_frame_pairs = [createFramePairRow()];
    }

    body.innerHTML = scanState.sb_frame_pairs.map((item, index) => `
      <tr>
        <td>
          <input
            type="text"
            class="pair-table-input js-frame-id"
            data-row-id="${item.rowId}"
            value="${escapeAttribute(toUpperSafe(item.frameId || ""))}"
            placeholder="請輸入或掃描框架編號"
          >
        </td>
        <td>
          <input
            type="text"
            class="pair-table-input js-frame-ctn"
            data-row-id="${item.rowId}"
            value="${escapeAttribute(normalizeCTN(item.ctn || ""))}"
            placeholder="請輸入或掃描CTN"
          >
        </td>
        <td>
          <button type="button" class="btn-danger pair-table-delete" onclick="removeFramePairRow('${item.rowId}')">${index === 0 && scanState.sb_frame_pairs.length === 1 ? "清空" : "刪除"}</button>
        </td>
      </tr>
    `).join("");

    if(countEl){
      const filledCount = scanState.sb_frame_pairs.filter(item => item.frameId || item.ctn).length;
      countEl.innerText = `目前數量：${filledCount}`;
    }
    if(emptyEl){
      emptyEl.style.display = scanState.sb_frame_pairs.some(item => item.frameId || item.ctn) ? "none" : "block";
    }
  }

  function collectFramePairRowsFromUI(){
    const frameInputs = document.querySelectorAll(".js-frame-id");
    const ctnInputs = document.querySelectorAll(".js-frame-ctn");
    if(!frameInputs.length || !ctnInputs.length) return;

    const nextRows = [];
    for(let i = 0; i < frameInputs.length; i++){
      const rowId = frameInputs[i].dataset.rowId || ctnInputs[i].dataset.rowId || ("pair_fallback_" + i);
      const frameId = toUpperSafe(frameInputs[i].value || "");
      const ctn = normalizeCTN(ctnInputs[i].value || "");
      if(!frameId && !ctn) continue;
      nextRows.push({ rowId, frameId, ctn });
    }

    scanState.sb_frame_pairs = nextRows.length > 0 ? nextRows : [createFramePairRow()];
  }

  
function validateSandblastFramePairs(showErrorMessage){
    collectFramePairRowsFromUI();

    const pairSeen = new Set();
    for(let i = 0; i < scanState.sb_frame_pairs.length; i++){
      const item = scanState.sb_frame_pairs[i];
      const rowNo = i + 1;
      const frameId = toUpperSafe(item.frameId || "");
      const ctn = normalizeCTN(item.ctn || "");

      if(!frameId && !ctn){
        continue;
      }

      if(!frameId || !ctn){
        if(showErrorMessage){
          showScanError("sb_frame_scan", `第${rowNo}列框架編號與CTN必須成對填寫`);
        }
        return false;
      }

      if(!isValidCTN(ctn)){
        if(showErrorMessage){
          showScanError("sb_frame_scan", `${ctn} 格式錯誤，CTN必須為7碼：前2英文、第3-4數字、第5-6英文、第7碼英數皆可`);
        }
        return false;
      }

      if(pairSeen.has(ctn)){
        if(showErrorMessage){
          showScanError("sb_frame_scan", `${ctn} 在框架CTN掃描表格內重複`);
        }
        return false;
      }

      if(scanState.sb_cylinder_scan.includes(ctn)){
        if(showErrorMessage){
          showScanError("sb_frame_scan", `${ctn} 已存在於散支鋼瓶CTN掃描`);
        }
        return false;
      }

      pairSeen.add(ctn);
    }

    return true;
  }

function bindFramePairTableEvents(){
    const body = document.getElementById("frame-pair-table-body");
    if(!body) return;

    body.addEventListener("input", function(e){
      const target = e.target;
      const rowId = target.dataset.rowId || "";
      const row = scanState.sb_frame_pairs.find(item => item.rowId === rowId);
      if(!row) return;

      if(target.classList.contains("js-frame-id")){
        const upper = toUpperSafe(target.value);
        target.value = upper;
        row.frameId = upper;
      }

      if(target.classList.contains("js-frame-ctn")){
        const normalized = normalizeCTN(target.value);
        target.value = normalized;
        row.ctn = normalized;
      }

      updateFramePairCountOnly();
      persistDraftDebounced();
    });

    body.addEventListener("blur", function(e){
      const target = e.target;
      if(!target.classList.contains("js-frame-ctn")) return;

      const rowId = target.dataset.rowId || "";
      const ctn = normalizeCTN(target.value || "");
      const row = scanState.sb_frame_pairs.find(item => item.rowId === rowId);

      if(ctn && !isValidCTN(ctn)){
        target.value = "";
        if(row) row.ctn = "";
        showScanError("sb_frame_scan", `${ctn} 格式錯誤，CTN必須為7碼：前2英文、第3-4數字、第5-6英文、第7碼英數皆可`);
        updateFramePairCountOnly();
        persistDraft();
        return;
      }

      const owner = findDuplicateOwnerExcludingRow(ctn, rowId);

      if(ctn && owner){
        target.value = "";
        if(row) row.ctn = "";
        showScanError("sb_frame_scan", `${ctn} 已存在於${owner}`);
      }

      updateFramePairCountOnly();
      persistDraft();
    }, true);
  }

  function updateFramePairCountOnly(){
    const countEl = document.getElementById("frame-count-text");
    const emptyEl = document.getElementById("frame-pair-empty");
    if(countEl){
      const filledCount = scanState.sb_frame_pairs.filter(item => item.frameId || item.ctn).length;
      countEl.innerText = `目前數量：${filledCount}`;
    }
    if(emptyEl){
      emptyEl.style.display = scanState.sb_frame_pairs.some(item => item.frameId || item.ctn) ? "none" : "block";
    }
  }

  function persistDraftDebounced(){
    clearTimeout(window.__pairDraftTimer);
    window.__pairDraftTimer = setTimeout(() => {
      persistDraft();
    }, 200);
  }

  function findDuplicateOwnerExcludingRow(ctn, rowId){
    if(!ctn) return "";
    if(scanState.sb_frame_pairs.some(item => item.rowId !== rowId && item.ctn === ctn)){
      return "框架CTN掃描";
    }
    if(scanState.sb_cylinder_scan.includes(ctn)){
      return "散支鋼瓶CTN掃描";
    }
    return "";
  }

  async function validateSandblastPairsBeforeSubmit(reportDate, pairs){
    const ctns = (pairs || []).map(item => normalizeCTN(item.ctn)).filter(Boolean);
    if(ctns.length === 0){
      return { duplicates: [], duplicateDetails: [] };
    }
    try{
      const result = await validateSandblastPairsAPI(reportDate, ctns);
      return {
        duplicates: Array.isArray(result.duplicates) ? result.duplicates : [],
        duplicateDetails: Array.isArray(result.duplicateDetails) ? result.duplicateDetails : []
      };
    } catch(err){
      console.error("後端CTN重複驗證失敗", err);
      return { duplicates: [], duplicateDetails: [] };
    }
  }

  function processScanInput(fieldKey){
    const config = getCardIds(fieldKey);
    const inputEl = document.getElementById(config.inputId);

    const raw = inputEl.value;
    if(!raw || !raw.trim()) return;

    const lines = raw
      .split(/\r?\n/)
      .map(normalizeCTN)
      .filter(Boolean);

    if(lines.length === 0){
      inputEl.value = "";
      return;
    }

    const invalidList = [];
    const duplicateList = [];
    const batchSeen = new Set();
    const validList = [];

    lines.forEach(line => {
      if(!isValidCTN(line)){
        invalidList.push(line);
        return;
      }

      if(batchSeen.has(line)){
        duplicateList.push(`${line}（本次輸入重複）`);
        return;
      }

      const owner = findDuplicateOwner(line);
      if(owner){
        duplicateList.push(`${line}（已存在於${owner}）`);
        return;
      }

      batchSeen.add(line);
      validList.push(line);
    });

    if(validList.length > 0){
      scanState[fieldKey].push(...validList);
      renderScanDisplay(fieldKey);
      persistDraft();
    }

    inputEl.value = "";

    if(invalidList.length > 0){
      showScanError(fieldKey, `格式錯誤：${invalidList.slice(0,3).join("、")}${invalidList.length > 3 ? "..." : ""}`);
      return;
    }

    if(duplicateList.length > 0){
      showScanError(fieldKey, `CTN重複：${duplicateList.slice(0,2).join("、")}${duplicateList.length > 2 ? "..." : ""}`);
    }
  }

  function bindScanInput(fieldKey){
    const config = getCardIds(fieldKey);
    const inputEl = document.getElementById(config.inputId);

    inputEl.addEventListener("blur", function(){
      processScanInput(fieldKey);
    });

    inputEl.addEventListener("keydown", function(e){
      if(e.key === "Enter" && !e.shiftKey){
        setTimeout(()=>{
          processScanInput(fieldKey);
        }, 0);
      }
    });

    inputEl.addEventListener("paste", function(){
      setTimeout(()=>{
        processScanInput(fieldKey);
      }, 0);
    });
  }

  function renderConfirm(){
    saveData();

    const el = document.getElementById("confirm");

    let html = `
      <div>日期：${escapeHtml(formData.date)}</div>
      <div>填表人：${escapeHtml(formData.person)}</div>
      <div>站別：${escapeHtml(formData.site)}</div>
      <div>人員：${escapeHtml(formData.workers.join(", "))}</div>
    `;

    if(formData.site === "自動噴砂站"){
      const pairPreview = scanState.sb_frame_pairs
        .map(item => `${escapeHtml(item.frameId)} ｜ ${escapeHtml(item.ctn)}`)
        .join("<br>");

      html += `
        <div class="confirm-section">
          <div>框架CTN配對數量：${scanState.sb_frame_pairs.filter(item => item.frameId || item.ctn).length}</div>
          <div>前置完全（框）：${escapeHtml(formData.sb_pre_complete)}</div>
          <div>前置瓶頸研磨：${escapeHtml(formData.sb_neck_grind)}</div>
          <div>前置CTN防護：${escapeHtml(formData.sb_pre_ctn_protect)}</div>
          <div>框架編號／CTN：<br>${pairPreview || "未填寫"}</div>
          <div>散支鋼瓶CTN掃描數量：${scanState.sb_cylinder_scan.length}</div>
          <div>噴砂備註：${nl2br(formData.sb_note)}</div>
        </div>
      `;
    }

    if(formData.site === "UT站"){
      html += `
        <div class="confirm-section">
          <div>UT上下料鋼瓶數量（支）：${escapeHtml(formData.ut_load_count)}</div>
          <div>噴砂後下框（框）：${escapeHtml(formData.ut_unload_frame)}</div>
          <div>治具安裝（框）：${escapeHtml(formData.ut_fixture_install)}</div>
          <div>噴砂數量(支)：${escapeHtml(formData.ut_sand_count)}</div>
          <div>UT站別備註：${nl2br(formData.ut_note)}</div>
        </div>
      `;
    }

    if(formData.site === "鋼印鎖瓶站"){
      html += `
        <div class="confirm-section">
          <div>HT鋼印（支）：${escapeHtml(formData.stamp_ht_mark)}</div>
          <div>UT鋼印（支）：${escapeHtml(formData.stamp_ut_mark)}</div>
          <div>待噴砂鋼瓶（框）：${escapeHtml(formData.stamp_wait_sand)}</div>
          <div>改瓶數量(支)：${escapeHtml(formData.stamp_rework_count)}</div>
          <div>出貨（框）：${escapeHtml(formData.stamp_ship)}</div>
          <div>鋼印鎖瓶站備註：${nl2br(formData.stamp_note)}</div>
        </div>
      `;
    }

    if(formData.site === "集束中心"){
      collectBundleFramesFromUI();

      html += `
        <div class="confirm-section">
          <div>完成框數：${escapeHtml(formData.bundle_frame_count)}</div>
        </div>
      `;

      formData.bundle_frames.forEach((frame, index) => {
        html += `
          <div class="confirm-section">
            <div><strong>第${index + 1}框</strong></div>
            <div>集束狀態：${escapeHtml(frame.status)}</div>
            <div>集束類別：${escapeHtml(frame.type)}</div>
            <div>框架種類：${escapeHtml(frame.frameType)}</div>
            <div>框架編號（組裝）：${escapeHtml(frame.frameId)}</div>
            <div>RT料號：${escapeHtml(frame.rtNo)}</div>
            <div>框架CTN（組裝）：${escapeHtml(frame.frameCtn)}</div>
            <div>集束備註：${nl2br(buildBundleNoteText(frame))}</div>
          </div>
        `;
      });
    }

    if(formData.site === "專案"){
      html += `
        <div class="confirm-section">
          <div>專案項目：${escapeHtml(formData.project_item)}</div>
          <div>新鋼瓶下棧板（支）：${escapeHtml(formData.proj_new_cylinder)}</div>
          <div>鋼瓶註冊（支）：${escapeHtml(formData.proj_register)}</div>
          <div>瓶閥安裝（支）：${escapeHtml(formData.proj_valve_install)}</div>
          <div>鋼瓶入框（框）：${escapeHtml(formData.proj_cylinder_frame)}</div>
          <div>集束安裝（框）：${escapeHtml(formData.proj_bundle_install)}</div>
          <div>集束測漏（框）：${escapeHtml(formData.proj_bundle_leak)}</div>
          <div>維修框架CTN：${nl2br(formData.proj_repair_ctn)}</div>
          <div>專案備註：${nl2br(formData.proj_note)}</div>
          <div>照片上傳：${document.getElementById("proj_photo").files.length ? `已選擇 ${document.getElementById("proj_photo").files.length} 張照片（重新開頁不恢復）` : "未選擇"}</div>
        </div>
      `;
    }

    el.innerHTML = html;
  }

  function escapeHtml(value){
    return String(value || "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");
  }

  function nl2br(value){
    const safe = escapeHtml(value);
    return safe ? safe.replace(/\n/g,"<br>") : "";
  }

  function selectAllWorkers(){
    document.querySelectorAll(".checkbox-group input").forEach(c => {
      c.checked = true;
    });
    persistDraft();
  }

  function clearWorkers(){
    document.querySelectorAll(".checkbox-group input").forEach(c => {
      c.checked = false;
    });
    persistDraft();
  }


  function showLoadingMessage(message){
    const loadingBox = document.getElementById("loadingBox");
    if(!loadingBox) return;
    loadingBox.innerHTML = `<div class="loading-text">${message}</div>`;
    loadingBox.style.display = "flex";
  }

  function hideLoadingMessage(){
    const loadingBox = document.getElementById("loadingBox");
    if(loadingBox){
      loadingBox.style.display = "none";
    }
  }

  function waitForPaint(){
    return new Promise(resolve => {
      requestAnimationFrame(() => resolve());
    });
  }

  async function submitReport(){
    if(sending) return;

    saveData();
    sending = true;
    showLoadingMessage('送出中...<br><span style="font-size:14px;color:rgba(255,255,255,.72);">資料驗證中，請稍候</span>');
    await waitForPaint();

    let payload = null;

    try {
      if(formData.site === "自動噴砂站"){
        collectFramePairRowsFromUI();

        payload = {
          "日期": formData.date || "",
          "填表人員": formData.person || "",
          "站別": formData.site || "",
          "人員姓名": Array.isArray(formData.workers) ? formData.workers.join(", ") : "",
          "框架編號(拆卸)": scanState.sb_frame_pairs.map(item => item.frameId).filter(Boolean).join("\n"),
          "前置完全(框)": formData.sb_pre_complete || "",
          "前置瓶頸研磨": formData.sb_neck_grind || "",
          "前置CTN防護": formData.sb_pre_ctn_protect || "",
          "框架CTN掃描": scanState.sb_frame_pairs.map(item => item.ctn).filter(Boolean).join("\n"),
          "散支鋼瓶CTN掃描": formData.sb_cylinder_scan || "",
          "噴砂備註": formData.sb_note || "",
          "框架CTN配對表": scanState.sb_frame_pairs
        };
      }
      else if(formData.site === "UT站"){
        payload = {
          "日期": formData.date || "",
          "填表人員": formData.person || "",
          "站別": formData.site || "",
          "人員姓名": Array.isArray(formData.workers) ? formData.workers.join(", ") : "",

          "UT上下料鋼瓶數量(支)": formData.ut_load_count || "",
          "噴砂後下框(框)": formData.ut_unload_frame || "",
          "治具安裝(框)": formData.ut_fixture_install || "",
          "噴砂數量(支)": formData.ut_sand_count || "",
          "UT站別備註": formData.ut_note || ""
        };
      }
      else if(formData.site === "集束中心"){
        collectBundleFramesFromUI();

        payload = {
          "日期": formData.date || "",
          "填表人員": formData.person || "",
          "站別": formData.site || "",
          "人員姓名": Array.isArray(formData.workers) ? formData.workers.join(", ") : "",
          "bundle_frames": Array.isArray(formData.bundle_frames) ? formData.bundle_frames : []
        };
      }
      else if(formData.site === "鋼印鎖瓶站"){
        payload = {
          "日期": formData.date || "",
          "填表人員": formData.person || "",
          "站別": formData.site || "",
          "人員姓名": Array.isArray(formData.workers) ? formData.workers.join(", ") : "",

          "HT鋼印(支)": formData.stamp_ht_mark || "",
          "UT鋼印(支)": formData.stamp_ut_mark || "",
          "待噴砂鋼瓶(框)": formData.stamp_wait_sand || "",
          "改瓶數量(支)": formData.stamp_rework_count || "",
          "出貨(框)": formData.stamp_ship || "",
          "鋼印鎖瓶站備註": formData.stamp_note || ""
        };
      }
      else if(formData.site === "專案"){
        payload = {
          "日期": formData.date || "",
          "填表人員": formData.person || "",
          "站別": formData.site || "",
          "人員姓名": Array.isArray(formData.workers) ? formData.workers.join(", ") : "",

          "專案項目": formData.project_item || "",
          "新鋼瓶下棧板（支）": formData.proj_new_cylinder || "",
          "鋼瓶註冊（支）": formData.proj_register || "",
          "瓶閥安裝（支）": formData.proj_valve_install || "",
          "鋼瓶入框（框）": formData.proj_cylinder_frame || "",
          "集束安裝（框）": formData.proj_bundle_install || "",
          "集束測漏（框）": formData.proj_bundle_leak || "",
          "維修框架CTN": formData.proj_repair_ctn || "",
          "專案備註": formData.proj_note || "",
          "照片上傳": []
        };

        const fileInput = document.getElementById("proj_photo");
        if(fileInput && fileInput.files && fileInput.files.length > 0){
          showLoadingMessage('送出中...<br><span style="font-size:14px;color:rgba(255,255,255,.72);">照片讀取中，請稍候</span>');
          await waitForPaint();

          const files = Array.from(fileInput.files);
          payload["照片上傳"] = await Promise.all(
            files.map(file => {
              return new Promise((resolve, reject) => {
                const reader = new FileReader();

                reader.onload = function(e){
                  resolve({
                    name: file.name || ("project_photo_" + Date.now()),
                    content: e.target.result || ""
                  });
                };

                reader.onerror = function(){
                  reject(new Error(`照片讀取失敗：${file.name || "未知檔案"}`));
                };

                reader.readAsDataURL(file);
              });
            })
          );
        }
      }
      else{
        sending = false;
        hideLoadingMessage();
        return;
      }

      if(formData.site === "自動噴砂站"){
        if(!validateSandblastFramePairs(true)){
          sending = false;
          hideLoadingMessage();
          backToSite();
          return;
        }

        const serverCheck = await validateSandblastPairsBeforeSubmit(formData.date, scanState.sb_frame_pairs);
        if(serverCheck.duplicates.length > 0){
          const duplicateText = (serverCheck.duplicateDetails && serverCheck.duplicateDetails.length)
            ? serverCheck.duplicateDetails.slice(0,3).map(item => `${item.ctn}（${item.date || "既有資料"}）`).join("、")
            : serverCheck.duplicates.slice(0,3).join("、");
          showScanError("sb_frame_scan", `後端已有重複CTN：${duplicateText}${serverCheck.duplicates.length > 3 ? "..." : ""}`);
          sending = false;
          hideLoadingMessage();
          backToSite();
          return;
        }
      }

      showLoadingMessage('送出中...');
      await waitForPaint();

      const result = await submitDailyReportAPI(payload);
      console.log("送出成功：", result);

      clearDraft(false, {
        requireConfirm: false
      });

      showLoadingMessage('✅ 送出成功');

      setTimeout(()=>{
        location.reload();
      }, 1200);

    } catch (err) {
      console.error("送出失敗", err);
      sending = false;
      showLoadingMessage(`❌ 送出失敗：${escapeHtml(err.message || "未知錯誤")}`);

      setTimeout(()=>{
        hideLoadingMessage();
      }, 2200);
    }
  }

  function validatePage1(){
    clearErrors();

    const date = document.getElementById("date").value;
    const person = document.getElementById("person").value;
    const site = document.querySelector('input[name="site"]:checked');

    let firstError = null;

    if(!date){
      showError("date","card-date","請填寫日期");
      if(!firstError) firstError = "card-date";
    }

    if(!person){
      showError("person","card-person","請選擇填表人員");
      if(!firstError) firstError = "card-person";
    }

    if(!site){
      showError("site","card-site","請選擇站別");
      if(!firstError) firstError = "card-site";
    }

    if(firstError){
      document.getElementById(firstError).scrollIntoView({behavior:"smooth",block:"start"});
      return;
    }

    const siteValue = site.value;
    let targetPage = "page1";

    if(siteValue === "自動噴砂站"){
      targetPage = "pageSandblast";
    }
    else if(siteValue === "UT站"){
      targetPage = "pageUT";
    }
    else if(siteValue === "鋼印鎖瓶站"){
      targetPage = "pageStamp";
    }
    else if(siteValue === "集束中心"){
      targetPage = "pageBundle";
    }
    else if(siteValue === "專案"){
      targetPage = "pageProject";
    }

    nextPage(targetPage);
  }

  function showError(name,cardId,msg){
    document.getElementById(cardId).classList.add("error-card");
    document.getElementById("error-" + name).innerText = msg;
  }

  function clearErrors(){
    document.querySelectorAll(".error-card").forEach(el => {
      el.classList.remove("error-card");
    });

    document.querySelectorAll(".error-text").forEach(el => {
      el.innerText = "";
    });
  }

  function loadPerson(){
    const saved = localStorage.getItem("report_person");
    if(saved && !formData.person){
      document.getElementById("person").value = saved;
      formData.person = saved;
    }
  }

  function updateStep(step){
    document.querySelectorAll(".step").forEach(s => {
      s.classList.remove("active");
    });

    document.getElementById("step" + step).classList.add("active");
  }

  function bindAutoSave(){
    if(window.__draftAutoSaveBound) return;
    window.__draftAutoSaveBound = true;

    const shouldSkip = function(target){
      if(!target) return true;
      if(target.id === "proj_photo") return true;
      if(target.closest && target.closest("#loadingBox")) return true;
      return false;
    };

    const saveFromEvent = function(target){
      if(shouldSkip(target)) return;
      persistDraft();
    };

    document.addEventListener("input", function(e){
      saveFromEvent(e.target);
    }, true);

    document.addEventListener("change", function(e){
      saveFromEvent(e.target);
    }, true);
  }

  function bindUppercaseInputs(){
    const uppercaseTargets = [
      document.getElementById("proj_repair_ctn")
    ];

    uppercaseTargets.forEach(target => {
      if(!target) return;

      target.addEventListener("input", function(){
        const start = this.selectionStart;
        const end = this.selectionEnd;

        this.value = toUpperSafe(this.value);

        if(typeof start === "number" && typeof end === "number"){
          this.setSelectionRange(start, end);
        }

        persistDraft();
      });

      target.addEventListener("change", function(){
        this.value = toUpperSafe(this.value);
        persistDraft();
      });
    });
  }

  window.onload = async function(){
    updateStep(1);

    const today = new Date().toISOString().split("T")[0];
    const dateInput = document.getElementById("date");

    if(!dateInput.value){
      dateInput.value = today;
    }

    bindScanInput("sb_cylinder_scan");
    renderFramePairTable();
    bindAutoSave();
    bindDraftLifecycleGuards();
    bindUppercaseInputs();
    bindFramePairTableEvents();
    renderBundleCards();
    bindBundleEvents();
    loadPerson();
    loadDraft();
    await loadProjectOptions();

    const projectSelect = document.getElementById("project_item");
    if(projectSelect && formData.project_item){
      const values = Array.from(projectSelect.options).map(option => option.value);
      if(values.includes(formData.project_item)){
        projectSelect.value = formData.project_item;
      }
    }
  };

function getDefaultBundleNote(inDate = "", doneDate = ""){
  const inText = inDate ? `${inDate} 入框` : "入框";
  const doneText = doneDate ? `${doneDate} 完成` : "完成";
  return `${inText}\n${doneText}`;
}

function buildBundleNoteText(frame){
  const lines = [];

  if(frame.inDate){
    lines.push(`${frame.inDate} 入框`);
  }

  if(frame.doneDate){
    lines.push(`${frame.doneDate} 完成`);
  }

  if(frame.manifoldPressure){
    lines.push(`Manifold飽壓測試${frame.manifoldPressure}kg`);
  }

  if(frame.extraNote && String(frame.extraNote).trim()){
    lines.push(String(frame.extraNote).trim());
  }

  return lines.join("\n");
}

function createEmptyBundleFrame(index){
  return {
    frameNo:index + 1,
    status:"",
    type:"",
    typeOther:"",
    frameType:"",
    frameTypeOther:"",
    frameId:"",
    rtNo:"",
    frameCtn:"",
    inDate:"",
    manifoldPressure:"",
    doneDate:"",
    extraNote:""
  };
}

function normalizeBundleFrameCount(value){
  const n = parseInt(value, 10);
  if(isNaN(n) || n < 1) return 1;
  return n;
}

function ensureBundleFramesLength(targetCount){
  if(!Array.isArray(formData.bundle_frames)){
    formData.bundle_frames = [];
  }

  while(formData.bundle_frames.length < targetCount){
    formData.bundle_frames.push(createEmptyBundleFrame(formData.bundle_frames.length));
  }

  if(formData.bundle_frames.length > targetCount){
    formData.bundle_frames = formData.bundle_frames.slice(0, targetCount);
  }

  formData.bundle_frames = formData.bundle_frames.map((frame, index) => ({
    frameNo:index + 1,
    status:frame.status || "",
    type:frame.type || "",
    typeOther:frame.typeOther || "",
    frameType:frame.frameType || "",
    frameTypeOther:frame.frameTypeOther || "",
    frameId:frame.frameId || "",
    rtNo:frame.rtNo || "",
    frameCtn:frame.frameCtn || "",
    inDate:frame.inDate || "",
    manifoldPressure:frame.manifoldPressure || "",
    doneDate:frame.doneDate || "",
    extraNote:frame.extraNote || ""
  }));
}


function normalizeOtherText(value){
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getBundleTypeBaseOptions(){
  return ["H2", "He", "N2", "Ar", "O2", "Co2", "A/C", "HN"];
}

function getBundleFrameTypeBaseOptions(){
  return ["H2 200bar", "HP", "MEGA", "n12", "7m", "6m"];
}

function isBundleTypeOtherValue(value){
  const v = String(value || "");
  return !!v && !getBundleTypeBaseOptions().includes(v);
}

function isBundleFrameTypeOtherValue(value){
  const v = String(value || "");
  return !!v && !getBundleFrameTypeBaseOptions().includes(v);
}

function renderBundleOtherInput(kind, index, value, active){
  const inputClass = kind === "type" ? "bundle-type-other" : "bundle-frame-type-other";
  const placeholder = kind === "type" ? "請輸入混合氣體代碼（英文/數字）" : "請輸入框架種類代碼（英文/數字）";
  return `
    <div class="bundle-other-input ${active ? "active" : ""}" id="${inputClass}_${index}_wrap">
      <input
        type="text"
        class="form-input ${inputClass}"
        data-frame-index="${index}"
        value="${escapeAttribute(normalizeOtherText(value || ""))}"
        placeholder="${placeholder}"
      >
    </div>
  `;
}


function renderBundleCards(){
  const input = document.getElementById("bundle_frame_count");
  const container = document.getElementById("bundleCardsContainer");

  if(!input || !container) return;

  const count = normalizeBundleFrameCount(input.value);
  input.value = count;
  formData.bundle_frame_count = count;

  ensureBundleFramesLength(count);

  container.innerHTML = formData.bundle_frames.map((frame, index) => {
    const typeIsOther = isBundleTypeOtherValue(frame.type) || frame.type === "other";
    const frameTypeIsOther = isBundleFrameTypeOtherValue(frame.frameType) || frame.frameType === "other";
    const typeOtherValue = frame.typeOther || (typeIsOther && frame.type !== "other" ? frame.type : "");
    const frameTypeOtherValue = frame.frameTypeOther || (frameTypeIsOther && frame.frameType !== "other" ? frame.frameType : "");

    return `
    <div class="form-card bundle-frame-card">
      <div class="bundle-frame-title">第${index + 1}框</div>

      <div class="bundle-field-block">
        <div class="form-title">集束狀態</div>
        <div class="bundle-radio-grid">
          ${renderBundleRadioOptions(`bundle_status_${index}`, frame.status, [
            { value:"OCYL", label:"OCYL" },
            { value:"MNT1", label:"MNT1" },
            { value:"other", label:"other" }
          ])}
        </div>
      </div>

      <div class="bundle-field-block">
        <div class="form-title">集束類別</div>
        <div class="bundle-subtitle">單一氣體</div>
        <div class="bundle-radio-grid">
          ${renderBundleRadioOptions(`bundle_type_${index}`, typeIsOther ? "other" : frame.type, [
            { value:"H2", label:"H2" },
            { value:"He", label:"He" },
            { value:"N2", label:"N2" },
            { value:"Ar", label:"Ar" },
            { value:"O2", label:"O2" },
            { value:"Co2", label:"Co2" }
          ])}
        </div>

        <div class="bundle-subtitle">混合氣體</div>
        <div class="bundle-radio-grid">
          ${renderBundleRadioOptions(`bundle_type_${index}`, typeIsOther ? "other" : frame.type, [
            { value:"A/C", label:"A/C" },
            { value:"HN", label:"HN" },
            { value:"other", label:"other" }
          ])}
        </div>
        ${renderBundleOtherInput("type", index, typeOtherValue, typeIsOther)}
      </div>

      <div class="bundle-field-block">
        <div class="form-title">框架種類</div>
        <div class="bundle-radio-grid two-col">
          ${renderBundleRadioOptions(`bundle_frame_type_${index}`, frameTypeIsOther ? "other" : frame.frameType, [
            { value:"H2 200bar", label:"H2 200bar" },
            { value:"HP", label:"HP" },
            { value:"MEGA", label:"MEGA" },
            { value:"n12", label:"n12" },
            { value:"7m", label:"7m" },
            { value:"6m", label:"6m" },
            { value:"other", label:"other" }
          ])}
        </div>
        ${renderBundleOtherInput("frameType", index, frameTypeOtherValue, frameTypeIsOther)}
      </div>

      <div class="bundle-field-block">
        <div class="form-title">框架編號（組裝）</div>
        <input
          type="text"
          class="form-input bundle-frame-id"
          data-frame-index="${index}"
          value="${escapeAttribute(toUpperSafe(frame.frameId))}"
        >
      </div>

      <div class="bundle-field-block">
        <div class="form-title">RT料號</div>
        <input
          type="text"
          class="form-input bundle-rt-no"
          data-frame-index="${index}"
          value="${escapeAttribute(frame.rtNo)}"
        >
      </div>

      <div class="bundle-field-block">
        <div class="form-title">框架CTN（組裝）</div>
        <input
          type="text"
          class="form-input bundle-frame-ctn"
          data-frame-index="${index}"
          value="${escapeAttribute(toUpperSafe(frame.frameCtn))}"
        >
      </div>

      <div class="bundle-field-block">
        <div class="form-title">集束備註</div>

        <div class="bundle-note-date-row bundle-note-in-row">
          <input
            type="date"
            class="bundle-in-date"
            data-frame-index="${index}"
            value="${escapeAttribute(frame.inDate || "")}"
          >
          <span class="bundle-note-fixed-text">入框</span>
          <span class="bundle-note-fixed-text manifold-fixed-label">Manifold飽壓測試</span>
          <input
            type="number"
            class="bundle-manifold-pressure"
            data-frame-index="${index}"
            min="0"
            step="0.1"
            inputmode="decimal"
            value="${escapeAttribute(frame.manifoldPressure || "")}"
            placeholder="kg"
          >
          <span class="bundle-note-fixed-text">kg</span>
        </div>

        <div class="bundle-note-date-row">
          <input
            type="date"
            class="bundle-done-date"
            data-frame-index="${index}"
            value="${escapeAttribute(frame.doneDate || "")}"
          >
          <span class="bundle-note-fixed-text">完成</span>
        </div>

        <textarea
          class="form-input bundle-note-textarea"
          data-frame-index="${index}"
          placeholder="請輸入其他集束備註..."
        >${escapeHtml(frame.extraNote || "")}</textarea>
      </div>
    </div>
  `;
  }).join("");
}

function renderBundleRadioOptions(groupName, currentValue, options){
  return options.map(option => `
    <label>
      <input
        type="radio"
        name="${groupName}"
        value="${escapeAttribute(option.value)}"
        ${currentValue === option.value ? "checked" : ""}
      >
      <span>${escapeHtml(option.label)}</span>
    </label>
  `).join("");
}

function collectBundleFramesFromUI(){
  const countInput = document.getElementById("bundle_frame_count");
  const count = normalizeBundleFrameCount(countInput ? countInput.value : 1);

  ensureBundleFramesLength(count);

  const frames = [];

  for(let i = 0; i < count; i++){
    const statusEl = document.querySelector(`input[name="bundle_status_${i}"]:checked`);
    const typeEl = document.querySelector(`input[name="bundle_type_${i}"]:checked`);
    const frameTypeEl = document.querySelector(`input[name="bundle_frame_type_${i}"]:checked`);
    const typeOtherEl = document.querySelector(`.bundle-type-other[data-frame-index="${i}"]`);
    const frameTypeOtherEl = document.querySelector(`.bundle-frame-type-other[data-frame-index="${i}"]`);
    const frameIdEl = document.querySelector(`.bundle-frame-id[data-frame-index="${i}"]`);
    const rtNoEl = document.querySelector(`.bundle-rt-no[data-frame-index="${i}"]`);
    const frameCtnEl = document.querySelector(`.bundle-frame-ctn[data-frame-index="${i}"]`);
    const inDateEl = document.querySelector(`.bundle-in-date[data-frame-index="${i}"]`);
    const manifoldPressureEl = document.querySelector(`.bundle-manifold-pressure[data-frame-index="${i}"]`);
    const doneDateEl = document.querySelector(`.bundle-done-date[data-frame-index="${i}"]`);
    const extraNoteEl = document.querySelector(`.bundle-note-textarea[data-frame-index="${i}"]`);

    const typeOther = normalizeOtherText(typeOtherEl ? typeOtherEl.value : "");
    const frameTypeOther = normalizeOtherText(frameTypeOtherEl ? frameTypeOtherEl.value : "");
    const typeValue = typeEl
      ? (typeEl.value === "other" ? (typeOther || "other") : typeEl.value)
      : "";
    const frameTypeValue = frameTypeEl
      ? (frameTypeEl.value === "other" ? (frameTypeOther || "other") : frameTypeEl.value)
      : "";

    const inDate = inDateEl ? inDateEl.value : "";
    const manifoldPressure = manifoldPressureEl ? String(manifoldPressureEl.value || "").trim() : "";
    const doneDate = doneDateEl ? doneDateEl.value : "";
    const extraNote = extraNoteEl ? extraNoteEl.value : "";

    frames.push({
      frameNo:i + 1,
      status:statusEl ? statusEl.value : "",
      type:typeValue,
      typeOther:typeOther,
      frameType:frameTypeValue,
      frameTypeOther:frameTypeOther,
      frameId:frameIdEl ? toUpperSafe(frameIdEl.value) : "",
      rtNo:rtNoEl ? rtNoEl.value : "",
      frameCtn:frameCtnEl ? toUpperSafe(frameCtnEl.value) : "",
      inDate:inDate,
      manifoldPressure:manifoldPressure,
      doneDate:doneDate,
      extraNote:extraNote
    });
  }

  formData.bundle_frame_count = count;
  formData.bundle_frames = frames;
}

function bindBundleEvents(){
  const countInput = document.getElementById("bundle_frame_count");
  const container = document.getElementById("bundleCardsContainer");

  if(countInput){
    countInput.addEventListener("focus", function(){
      if(String(this.value).trim() === "1"){
        this.select();
      }
    });

    countInput.addEventListener("input", function(){
      const raw = String(this.value).trim();

      if(raw === ""){
        return;
      }

      const onlyDigits = raw.replace(/[^\d]/g, "");
      if(raw !== onlyDigits){
        this.value = onlyDigits;
      }
    });

    countInput.addEventListener("blur", function(){
      let raw = String(this.value).trim();

      if(raw === ""){
        raw = "1";
      }

      const count = normalizeBundleFrameCount(raw);
      this.value = count;

      collectBundleFramesFromUI();
      ensureBundleFramesLength(count);
      renderBundleCards();
      persistDraft();
    });

    countInput.addEventListener("change", function(){
      let raw = String(this.value).trim();

      if(raw === ""){
        raw = "1";
      }

      const count = normalizeBundleFrameCount(raw);
      this.value = count;

      collectBundleFramesFromUI();
      ensureBundleFramesLength(count);
      renderBundleCards();
      persistDraft();
    });
  }

  if(container){
    container.addEventListener("input", function(e){
      const target = e.target;

      if(
        target.classList.contains("bundle-frame-id") ||
        target.classList.contains("bundle-frame-ctn")
      ){
        const start = target.selectionStart;
        const end = target.selectionEnd;
        target.value = toUpperSafe(target.value);

        if(typeof start === "number" && typeof end === "number"){
          target.setSelectionRange(start, end);
        }
      }

      if(
        target.classList.contains("bundle-type-other") ||
        target.classList.contains("bundle-frame-type-other")
      ){
        const start = target.selectionStart;
        const cleaned = normalizeOtherText(target.value);
        target.value = cleaned;
        if(typeof start === "number"){
          const pos = Math.min(start, cleaned.length);
          target.setSelectionRange(pos, pos);
        }
      }

      collectBundleFramesFromUI();
      persistDraftDebounced();
    });

    container.addEventListener("change", function(e){
      const target = e.target;

      if(target.classList.contains("bundle-frame-id") || target.classList.contains("bundle-frame-ctn")){
        target.value = toUpperSafe(target.value);
      }

      if(target.classList.contains("bundle-type-other") || target.classList.contains("bundle-frame-type-other")){
        target.value = normalizeOtherText(target.value);
      }

      if(target.name && (target.name.indexOf("bundle_type_") === 0 || target.name.indexOf("bundle_frame_type_") === 0)){
        collectBundleFramesFromUI();
        renderBundleCards();
      } else {
        collectBundleFramesFromUI();
      }

      persistDraft();
    });
  }
}

function escapeAttribute(value){
  return String(value || "")
    .replaceAll("&","&amp;")
    .replaceAll('"',"&quot;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
function toUpperSafe(value){
  return String(value || "").toUpperCase();
}
