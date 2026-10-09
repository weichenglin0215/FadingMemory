/* 前 35 款遊戲的操作提示（手指圖示）瀏覽器檢查（只在手動／AI 驗證時用，不會被任何頁面載入）
   把每款遊戲放進隱形 iframe、略過說明，等到該款「該出現提示」的階段，檢查：
     · .rx-hint 有出現、模式（tap／drag）對、位置在畫面內；
     · 第一次碰畫面（pointerdown）之後提示消失；
     · 沒有 JS 錯誤。
   用法：
     await fetch('/test/reaction/browser_hints.js').then(r => r.text()).then(t => (0, eval)(t));
     window.__job = __hintsAll();  window.__hrows    （不要 await，工具有 45 秒限制，用 __hrows 讀進度） */
(function () {
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    /* [id, 期望模式, 等幾毫秒（過了預備／記憶階段）] ；null＝這款不需要提示（按鈕、按住） */
    var LIST = [
        ['spot', 'tap', 900], ['speed', null, 600], ['drop', null, 600], ['impossible', 'tap', 900], ['shapes', 'tap', 900], ['matchcolor', 'tap', 900],
        ['rainbow', 'tap', 900], ['pendulum', 'tap', 900], ['tissue', 'drag', 900], ['landolt', 'drag', 900], ['lights', 'tap', 12000], ['cups', 'tap', 16000],
        ['pattern', 'drag', 12000], ['illusion', 'tap', 1500], ['pour', null, 600], ['coins', 'tap', 1200], ['invoice', null, 600], ['paint', 'drag', 900],
        ['diff', 'tap', 1200], ['bread', 'drag', 900], ['candy', null, 600], ['curves', null, 600], ['rps', null, 600], ['balloon', null, 600],
        ['price', 'tap', 1500], ['heartbeat', 'tap', 900], ['sticks', 'tap', 900], ['schulte', 'tap', 900], ['same', null, 600], ['backnum', 'tap', 16000],
        ['setclock', 'drag', 1200], ['tearcal', 'tap', 1200], ['pillbox', 'drag', 16000], ['fridge', null, 600], ['scallion', 'tap', 900]
    ];
    window.__HINT_LIST = LIST;
    async function check(item) {
        var id = item[0], mode = item[1], wait = item[2];
        var fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:0;top:0;width:500px;height:850px;border:0;opacity:0.01;pointer-events:none;z-index:-1';
        fr.src = '/reaction.html?game=' + id + '&smoke=' + Date.now();
        document.body.appendChild(fr);
        var rep = { id: id, want: mode, found: null, errors: [], goneAfterTap: null, inside: null };
        try {
            var W;
            for (var i = 0; i < 400; i++) { W = fr.contentWindow; try { if (W && W.Reaction && W.Reaction.current && W.document.readyState === 'complete') break; } catch (e) { } await sleep(50); }
            W.addEventListener('error', function (e) { rep.errors.push(String(e.message).slice(0, 160)); });
            W.requestAnimationFrame = function (cb) { return W.setTimeout(function () { cb(W.performance.now()); }, 16); };
            W.cancelAnimationFrame = function (x) { W.clearTimeout(x); };
            var btn = function (t) { return [].slice.call(W.document.querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === t; })[0]; };
            if (btn('下一步')) { btn('下一步').click(); await sleep(250); }
            if (btn('開始挑戰')) btn('開始挑戰').click();
            /* 輪詢：最多等 wait＋20 秒，看到提示就停 */
            var t0 = Date.now(), el = null;
            while (Date.now() - t0 < wait + 20000) { el = W.document.querySelector('.rx-hint'); if (el || (mode == null && Date.now() - t0 > wait)) break; await sleep(200); }
            rep.found = el ? (el.classList.contains('rx-hint--drag') ? 'drag' : 'tap') : null;
            if (el) {
                var sc = W.document.getElementById('screen'), r = el.getBoundingClientRect(), s = sc.getBoundingClientRect();
                rep.inside = r.left >= s.left - 2 && r.left <= s.right + 2 && r.top >= s.top - 2 && r.top <= s.bottom + 2;
                rep.arrow = !!el.querySelector('.rx-hint__arrow'); rep.ring = !!el.querySelector('.rx-hint__ring');
                sc.dispatchEvent(new W.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 3, clientX: s.left + 5, clientY: s.top + 5 }));
                await sleep(150);
                rep.goneAfterTap = !W.document.querySelector('.rx-hint');
            }
        } catch (e) { rep.errors.push('harness: ' + e.message); }
        fr.remove();
        rep.ok = (rep.want == null ? rep.found == null : (rep.found === rep.want && rep.inside && rep.goneAfterTap)) && rep.errors.length === 0;
        return rep;
    }
    window.__hint1 = check;
    window.__hrows = [];
    window.__hintsAll = async function (ids) {
        window.__hrows = [];
        for (var i = 0; i < LIST.length; i++) { if (ids && ids.indexOf(LIST[i][0]) < 0) continue; window.__hrows.push(await check(LIST[i])); }
        window.__hrows.push({ done: true });
    };
})();
