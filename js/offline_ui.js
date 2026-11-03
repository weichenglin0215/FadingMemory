/* ═══════════════════════════════════════════════════════════════════
   offline_ui.js — 「安裝與離線」彈窗（OfflineDialog；V1.38.0，只在主選單載入；入口：左上角漢堡選單）
   ───────────────────────────────────────────────────────────────────
   一眼看到：有沒有加到主畫面、能不能離線玩、雲端同步了沒、佔了多少儲存空間，並提供「檢查更新」「清除離線資料」兩個動作。
   每一列的內容由 FMOffline.buildRows 決定（js/offline.js，純函式、有測試）；這個檔案只負責把它畫出來、接上按鈕的動作：
     加到主畫面   → PWA.openGuide（依平台給不同說明）／PWA.inAppNotice（LINE 等內建瀏覽器：請改用瀏覽器）
     離線遊玩     →「重新檢查」重新問 Service Worker 備份了幾個檔案
     雲端同步     →「立即同步」補送成績、意見、個人最佳；「登入帳號」「重新登入」「建立密碼」交給 Identity 的彈窗
     儲存空間     → 只顯示
     檢查更新     → 讀 version.json，有新版就變成「立即更新」（請 Service Worker 整份重新備份再重新載入）
     清除離線資料 → 先問一次（彈窗公版），確定才清；成績、暱稱、設定不動
   列表用 js/scroller.js（手指拖曳＋慣性，跟成績彈窗同一個元件），按鈕在捲動區裡照常點得到。
   彈窗開著的時候，網路斷了／恢復了會自動重畫。所有文字都用 textContent。
   ═══════════════════════════════════════════════════════════════════ */

/* 新手導讀：這個檔案畫「安裝與離線」彈窗（只負責畫出來與接按鈕）；每一列要顯示什麼是 js/offline.js 的 FMOffline.buildRows 算出來的。
   整個檔案包在 (function (global) { ... })(window); 裡：global 就是 window，裡面的變數是私有的，最後把 show 函式掛在 window.OfflineDialog 讓選單呼叫。
   流程：show() 建彈窗 → render() 向 FMOffline 要狀態並畫成一列一列 → 按鈕被按到時交給 act() 處理。 */
(function (global) {
    'use strict';

    var h = global.UI.h;                                /* h：建立網頁元素的小工具（js/ui.js） */
    var SCROLL_THRESHOLD = 8;          /* 同 js/menu_nav.js：手指移動超過幾個舞台像素才算拖曳，沒超過就是點一下 */  /* 手指移動超過幾個舞台像素才算「拖曳捲動」，沒超過就當成點一下（跟 js/menu_nav.js 一樣的設定） */

    /* 播音效的小工具：先 unlock（瀏覽器規定要有使用者手勢才能出聲）再播 */
    function sfx(name) { if (global.Sfx) { global.Sfx.unlock(); global.Sfx.play(name); } }  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */

    var ctl = null;                    /* 開著的彈窗（Dlg.open 的控制物件）；null＝沒開 */  /* ctl：目前開著的彈窗控制物件（Dlg.open 回傳的）；null 代表沒有開 */

    /* 開啟彈窗（已經開著就直接回傳，不重複開） */
    function show() {
        if (ctl && ctl.isOpen()) return ctl;
        var O = global.FMOffline;
        var list = h('div', { 'class': 'lb-list off-list' });  /* 列表的畫面元素：list 放每一列內容、thumb 是捲動軸的小滑塊、viewport 是可視範圍；Scroller 讓它能用手指拖曳＋慣性捲動（跟成績彈窗同一個元件） */
        var thumb = h('div', { 'class': 'lb-thumb' });
        var viewport = h('div', { 'class': 'lb-viewport' }, [list, thumb]);
        var scroller = global.Scroller.make(viewport, list, thumb, { threshold: SCROLL_THRESHOLD });
        var upd = null;                /* 檢查更新的結果 */    /* upd：「檢查更新」的結果（null＝還沒檢查） */
        var closed = false, seq = 0;                    /* closed：彈窗已關閉；seq：重畫的流水號（網路慢時舊的結果回來，發現不是最新一次就丟掉，避免畫面被舊資料蓋掉） */

        /* 重畫整個列表：向 FMOffline 要目前狀態（Promise＝承諾，資料到了才執行 then 裡的函式），把每一列畫出來 */
        function render() {
            var my = ++seq;
            return O.status().then(function (s) {
                if (closed || my !== seq) return;
                list.innerHTML = '';                    /* innerHTML = ''：把元素裡面的東西全部清掉 */
                if (!s.online) list.appendChild(h('div', { 'class': 'off-note', text: '目前離線中。可以繼續玩，成績會先存在這支手機。' }));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
                O.buildRows(s, upd).forEach(function (r) { list.appendChild(rowEl(r)); });  /* forEach：對陣列的每個元素各做一次 */
                scroller.refresh();
            });
        }

        /* 畫一列：標題、說明文字，有動作的話再加一顆按鈕（清除用外框按鈕，其餘用天藍按鈕）；按鈕的 click 用 e.stopPropagation() 避免被捲動區誤判成拖曳 */
        function rowEl(r) {
            var kids = [h('div', { 'class': 'off-row__t', text: r.title }), h('div', { 'class': 'off-row__x', text: r.text })];
            if (r.action) {
                kids.push(h('button', {
                    'class': 'btn btn--' + (r.id === 'clear' ? 'line' : 'sky') + ' off-btn', text: r.action.label, attrs: { 'data-act': r.action.act },
                    on: { click: function (e) { e.stopPropagation(); sfx('click'); act(r.action.act, e.currentTarget); } }
                }));
            }
            return h('div', { 'class': 'off-row' + (r.ok ? ' off-row--ok' : ''), attrs: { 'data-id': r.id } }, kids);
        }

        /* 按鈕的動作；btn 是被按的那顆（要改字、要鎖住時用） */
        /* 按鈕的動作分流：依 data-act 的名稱決定做什麼（教學、重新檢查、立即同步、登入、檢查更新、套用更新、清除離線資料）；btn 是被按的按鈕，需要時改字或鎖住 */
        function act(a, btn) {
            var PWA = global.PWA, ID = global.Identity;
            /* 把按鈕鎖住並改字（例如「檢查中…」），避免玩家連按 */
            function busy(text) { btn.disabled = true; btn.textContent = text; }  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (a === 'guide') { if (PWA) PWA.openGuide(); }
            else if (a === 'inapp') { if (PWA && PWA.inAppNotice) PWA.inAppNotice(); }
            else if (a === 'recheck') { busy('檢查中…'); render(); }
            else if (a === 'sync') { busy('同步中…'); O.syncNow().then(render); }
            else if (a === 'login' || a === 'relogin') { if (ID && ID.askLogin) ID.askLogin().then(render); }
            else if (a === 'legacy') { if (ID && ID.ensureLegacy) ID.ensureLegacy({}).then(render); }
            else if (a === 'update') { busy('檢查中…'); O.checkUpdate().then(function (res) { upd = res; render(); }); }
            else if (a === 'apply') { busy('更新中…'); O.applyUpdate(); }
            else if (a === 'clear') confirmClear();
        }

        /* 清除離線資料前先問一次（彈窗公版 Dlg.open）：確定才呼叫 O.clearAll()；成績、暱稱、設定不會被清掉 */
        function confirmClear() {
            global.Dlg.open({
                cls: 'dlg--off-confirm', title: '清除離線資料？',
                text: '會清掉存在手機裡的遊戲檔案並重新載入頁面，之後會重新下載。你的成績、暱稱與設定都不會被清掉。',
                btnRow: true,
                buttons: [
                    { text: '取消', kind: 'line', cls: 'nav-close' },
                    { text: '清除', kind: 'primary', cls: 'nav-close', onClick: function () { O.clearAll(); } }
                ]
            });
        }

        /* 網路狀態改變（斷線／恢復）時重畫，讓「目前離線中」的提示跟著更新 */
        function onNet() { render(); }
        global.addEventListener('online', onNet);       /* 監聽瀏覽器的 online／offline 事件；彈窗關閉時要記得移除（見 onClose），不然會一直累積 */
        global.addEventListener('offline', onNet);

        /* 真的開出彈窗：tall 高版面、cls 樣式、title 標題、onClose 關閉時要清理的事、children 內容、buttons 按鈕 */
        ctl = global.Dlg.open({
            tall: true, cls: 'dlg--offline', title: '安裝與離線',
            onClose: function () { closed = true; scroller.destroy(); global.removeEventListener('online', onNet); global.removeEventListener('offline', onNet); },
            children: [viewport],
            buttons: [{ text: '關閉', kind: 'line', cls: 'nav-close' }]
        });
        list.appendChild(h('div', { 'class': 'off-note', text: '讀取中…' }));
        render();
        return ctl;
    }

    global.OfflineDialog = { show: show };              /* 對外提供：選單的漢堡選單會呼叫 OfflineDialog.show() 打開這個彈窗 */
})(window);
