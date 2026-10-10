/* 操作提示（手指圖示＋短文字）瀏覽器檢查（只在手動／AI 驗證時用，不會被任何頁面載入）
   把每款遊戲放進隱形 iframe、略過說明（有「開始」「出發」遮罩的也按掉），等到該款「該出現提示」的階段，檢查：
     · .rx-hint 有出現、模式（tap／drag／drag4／hold）對；
     · 一定有短文字（.rx-hint__label），而且文字與手指都在畫面內；
     · drag 一定有箭頭、drag4 有四支箭頭；
     · 在提示所在的容器第一次碰畫面（pointerdown）之後提示會消失（hintOn 做的提示才檢查；
       遊戲自己在拖曳開始時才收掉提示的，只在報告裡記錄不算錯）；
     · 沒有 JS 錯誤。
   null＝這款不需要提示（操作是按鈕）。
   用法：
     await fetch('/test/reaction/browser_hints.js').then(r => r.text()).then(t => (0, eval)(t));
     window.__job = __hintsAll();  window.__hrows    （不要 await，工具有 45 秒限制，用 __hrows 讀進度）
     await __hint1(['spot', 'tap', 900])             只檢查一款 */
(function () {
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    /* [id, 期望模式, 等幾毫秒（過了預備／記憶階段）, 提示是 hintOn（容器一碰就消失）嗎] */
    var LIST = [
        ['spot', 'tap', 900, 1], ['speed', null, 600], ['drop', null, 600], ['impossible', 'tap', 900, 1], ['shapes', 'tap', 900, 1], ['matchcolor', 'tap', 900, 1],
        ['rainbow', 'tap', 900, 1], ['pendulum', 'tap', 900, 1], ['tissue', 'drag', 900, 1], ['landolt', 'drag4', 900, 1], ['lights', 'tap', 12000, 1], ['cups', 'tap', 16000, 1],
        ['pattern', 'drag', 12000, 1], ['illusion', 'tap', 1500, 1], ['pour', 'hold', 900, 1], ['coins', 'tap', 1200, 1], ['invoice', null, 600], ['paint', 'tap', 900, 1],
        ['diff', 'tap', 1200, 1], ['bread', 'drag', 900, 1], ['candy', null, 600], ['curves', null, 600], ['rps', null, 600], ['balloon', 'hold', 900, 1],
        ['price', 'tap', 1500, 1], ['heartbeat', 'tap', 900, 1], ['sticks', 'tap', 900, 1], ['schulte', 'tap', 900, 1], ['same', null, 600], ['backnum', 'tap', 16000, 1],
        ['setclock', 'drag', 1200, 1], ['tearcal', 'tap', 1200, 1], ['pillbox', 'drag', 16000, 1], ['fridge', null, 600], ['scallion', 'tap', 900, 1],
        /* V1.20.0 的 28 款裡有提示的（kit.fingerHint／kit.hintOn） */
        ['area', 'drag', 900], ['blindcircle', 'drag', 900], ['rightangle', 'drag', 900], ['samelen', 'drag', 900], ['stamp', 'drag', 900], ['colorrecall', 'drag', 4500],
        ['focus', 'drag', 900], ['halfvol', 'drag', 900], ['scratch', 'drag', 900], ['ghostleg', 'drag', 900], ['twobags', 'drag', 900], ['fadee', 'drag', 900],
        ['basket', 'tap', 900, 1], ['maxexpr', 'tap', 900, 1], ['oddsock', 'tap', 900, 1], ['sum100', 'tap', 900, 1], ['timestable', 'tap', 900, 1],
        /* V1.21.0 的 7 款復活遊戲 */
        ['stackup', 'drag', 900], ['halfcrowd', 'drag', 900], ['catroad', 'drag', 900], ['numline', 'drag', 900], ['twinsock', 'tap', 900, 1], ['mixcolor', 'hold', 900, 1],
        /* V1.22.0 的 23 款（全部用 kit.hintOn：容器一碰就消失；等的時間＝記憶／預備階段＋提示延遲） */
        ['copycurve', 'drag', 900, 1], ['isequal', 'tap', 900, 1], ['orderops', 'tap', 900, 1], ['remainder', 'tap', 900, 1], ['hiddendigit', 'tap', 900, 1], ['timeafter', 'tap', 900, 1],
        ['wrongline', 'tap', 900, 1], ['fillop', 'tap', 900, 1], ['fastblink', 'tap', 900, 1], ['sneakmove', 'tap', 1200, 1], ['farpair', 'tap', 900, 1], ['dicechange', 'tap', 7000, 1],
        ['whosaid', 'tap', 4500, 1], ['tapback', 'tap', 5200, 1], ['nthshape', 'tap', 6500, 1], ['spingap', 'tap', 900, 1], ['sudokuone', 'tap', 1200, 1], ['chequeamt', 'tap', 900, 1],
        ['mergechar', 'tap', 1200, 1], ['flashlight', 'drag', 900, 1], ['racefirst', 'tap', 3600, 1], ['spinpick', 'tap', 6200, 1], ['alignchar', 'tap', 1300, 1]
    ];
    window.__HINT_LIST = LIST;
    async function check(item) {
        var id = item[0], mode = item[1], wait = item[2], viaHintOn = !!item[3];
        var fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:0;top:0;width:500px;height:850px;border:0;opacity:0.01;pointer-events:none;z-index:-1';
        fr.src = '/reaction.html?game=' + id + '&smoke=' + Date.now();
        document.body.appendChild(fr);
        var rep = { id: id, want: mode, found: null, errors: [], goneAfterTap: null, inside: null, label: null, labelInside: null };
        try {
            var W;
            for (var i = 0; i < 400; i++) { W = fr.contentWindow; try { if (W && W.Reaction && W.Reaction.current && W.document.readyState === 'complete') break; } catch (e) { } await sleep(50); }
            W.addEventListener('error', function (e) { rep.errors.push(String(e.message).slice(0, 160)); });
            W.requestAnimationFrame = function (cb) { return W.setTimeout(function () { cb(W.performance.now()); }, 16); };
            W.cancelAnimationFrame = function (x) { W.clearTimeout(x); };
            var btn = function (t) { return [].slice.call(W.document.querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === t; })[0]; };
            if (btn('下一步')) { btn('下一步').click(); await sleep(250); }
            if (btn('開始挑戰')) btn('開始挑戰').click();
            await sleep(500);
            /* 「開始」「出發」遮罩（kit.startCover）：按掉 */
            var cov = W.document.querySelector('.rx-cover .btn'); if (cov) { cov.dispatchEvent(new W.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 5 })); }
            /* 輪詢：最多等 wait＋20 秒，看到提示就停 */
            var t0 = Date.now(), el = null;
            while (Date.now() - t0 < wait + 20000) { el = W.document.querySelector('.rx-hint'); if (el || (mode == null && Date.now() - t0 > wait)) break; await sleep(200); }
            await sleep(500);
            rep.found = el ? (el.className.match(/rx-hint--(\w+)/) || [])[1] : null;
            if (el) {
                var sc = W.document.getElementById('screen'), r = el.getBoundingClientRect(), s = sc.getBoundingClientRect();
                rep.inside = r.left >= s.left - 2 && r.left <= s.right + 2 && r.top >= s.top - 2 && r.top <= s.bottom + 2;
                rep.arrows = el.querySelectorAll('.rx-hint__arrow').length; rep.ring = !!el.querySelector('.rx-hint__ring');
                var lab = el.parentNode.querySelector('.rx-hint__label'), lr = lab && lab.getBoundingClientRect();
                rep.label = lab ? lab.textContent : null;
                rep.labelInside = !!lr && lr.left >= s.left - 1 && lr.right <= s.right + 1 && lr.top >= s.top - 1 && lr.bottom <= s.bottom + 1;
                /* 提示碰一下就消失：在提示的容器上送一個 pointerdown */
                var host = el.parentNode, hr = host.getBoundingClientRect();
                host.dispatchEvent(new W.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 3, clientX: hr.left + 3, clientY: hr.top + 3 }));
                await sleep(200);
                rep.goneAfterTap = !W.document.querySelector('.rx-hint');
            }
        } catch (e) { rep.errors.push('harness: ' + e.message); }
        fr.remove();
        var modeOk = rep.want == null ? rep.found == null : rep.found === rep.want;
        var shape = rep.want == null || (rep.inside && rep.label && rep.labelInside && (rep.want !== 'drag' || rep.arrows >= 1) && (rep.want !== 'drag4' || rep.arrows === 4));
        rep.ok = !!(modeOk && shape && (!viaHintOn || rep.want == null || rep.goneAfterTap) && rep.errors.length === 0);
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
