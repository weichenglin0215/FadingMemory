/* 瀏覽器驗證小幫手（只在手動／AI 驗證時用，不會被任何頁面載入）
   用法（在 reaction.html?game=<id> 那一頁，用主控台或瀏覽器工具注入）：
     await fetch('/test/reaction/browser_helper.js').then(r => r.text()).then(t => (0, eval)(t));
     await __go();                       略過說明與排行榜彈窗，開始遊戲
     __ev(el, 'pointerdown', x, y);      在舞台座標 (x, y)（邏輯 px，相對於 el 左上角）送一個真的 PointerEvent
     await __drag(el, [[x,y],[x,y],…]);  用一串座標模擬手指按下、移動、放開
     __result()                          取得結算卡片文字（沒有就是 null）
   會把頁面的 rAF 換成 16ms 計時器（預覽窗格被隱藏時 rAF 會被暫停）。 */
(function () {
    window.__sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    window.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(performance.now()); }, 16); };
    window.cancelAnimationFrame = function (x) { clearTimeout(x); };
    window.__errs = window.__errs || [];
    window.addEventListener('error', function (e) { window.__errs.push(String(e.message)); });
    window.addEventListener('unhandledrejection', function (e) { window.__errs.push('promise: ' + (e.reason && e.reason.message || e.reason)); });
    window.__btn = function (t) { return [].slice.call(document.querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === t; })[0]; };
    window.__go = async function () {
        await __sleep(500);
        if (__btn('下一步')) { __btn('下一步').click(); await __sleep(350); }
        if (__btn('開始挑戰')) __btn('開始挑戰').click();
        await __sleep(700);
    };
    window.__pt = function (el, x, y) {
        var r = el.getBoundingClientRect(), sc = r.width / (el.clientWidth || r.width) || 1;
        return { clientX: r.left + x * sc, clientY: r.top + y * sc };
    };
    window.__ev = function (el, type, x, y, id) {
        var p = __pt(el, x, y);
        el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id || 7, clientX: p.clientX, clientY: p.clientY, pointerType: 'touch', isPrimary: true }));
    };
    window.__drag = async function (el, pts, gap) {
        __ev(el, 'pointerdown', pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) { await __sleep(gap == null ? 8 : gap); __ev(el, 'pointermove', pts[i][0], pts[i][1]); }
        __ev(el, 'pointerup', pts[pts.length - 1][0], pts[pts.length - 1][1]);
    };
    window.__result = function () {
        var c = document.querySelector('.dlg--result[data-sfx] .dlg__card');
        return c ? c.innerText : null;
    };
    window.__stage = function () { return document.querySelector('.rx-stage'); };
})();
