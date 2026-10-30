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

(function (global) {
    'use strict';

    var h = global.UI.h;
    var SCROLL_THRESHOLD = 8;          /* 同 js/menu_nav.js：手指移動超過幾個舞台像素才算拖曳，沒超過就是點一下 */

    function sfx(name) { if (global.Sfx) { global.Sfx.unlock(); global.Sfx.play(name); } }

    var ctl = null;                    /* 開著的彈窗（Dlg.open 的控制物件）；null＝沒開 */

    function show() {
        if (ctl && ctl.isOpen()) return ctl;
        var O = global.FMOffline;
        var list = h('div', { 'class': 'lb-list off-list' });
        var thumb = h('div', { 'class': 'lb-thumb' });
        var viewport = h('div', { 'class': 'lb-viewport' }, [list, thumb]);
        var scroller = global.Scroller.make(viewport, list, thumb, { threshold: SCROLL_THRESHOLD });
        var upd = null;                /* 檢查更新的結果 */
        var closed = false, seq = 0;

        function render() {
            var my = ++seq;
            return O.status().then(function (s) {
                if (closed || my !== seq) return;
                list.innerHTML = '';
                if (!s.online) list.appendChild(h('div', { 'class': 'off-note', text: '目前離線中。可以繼續玩，成績會先存在這支手機。' }));
                O.buildRows(s, upd).forEach(function (r) { list.appendChild(rowEl(r)); });
                scroller.refresh();
            });
        }

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
        function act(a, btn) {
            var PWA = global.PWA, ID = global.Identity;
            function busy(text) { btn.disabled = true; btn.textContent = text; }
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

        function onNet() { render(); }
        global.addEventListener('online', onNet);
        global.addEventListener('offline', onNet);

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

    global.OfflineDialog = { show: show };
})(window);
