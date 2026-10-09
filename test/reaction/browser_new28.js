/* 第三批 28 款遊戲的瀏覽器驗證（只在手動／AI 驗證時用，不會被任何頁面載入）
   做法：把遊戲放進隱形 iframe，換上假的排行榜資料庫與快速 rAF，略過說明，然後用各遊戲的 G.debug
   （solve＝答對、wrong＝答錯）一路玩到結算卡片，檢查：有沒有 JS 錯誤、有沒有結算、送榜的成績是不是有限數字。
   用法（在任何一頁，例如 http://localhost:8743/reaction.html?game=area）：
     await fetch('/test/reaction/browser_new28.js').then(r => r.text()).then(t => (0, eval)(t));
     await __new28('area')                 玩 area：先全部答對（solve），回報
     await __new28('area', 'wrong')        玩 area：答錯（wrong），回報
     window.__job = __new28All(); window.__rows   一次跑全部（不要 await，工具會逾時）；__rows 讀進度 */
(function () {
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var IDS = ['area', 'halfvol', 'blindcircle', 'samelen', 'rightangle', 'stamp', 'focus', 'scratch', 'mathcheck', 'sum100', 'timestable', 'fracduel', 'primetrap', 'maxexpr', 'glyphspin', 'oddsock', 'fadee', 'ghostleg', 'euler', 'colorrecall', 'basket', 'passersby', 'seenit', 'whofirst', 'watchoff', 'handsmeet', 'clearer', 'twobags'];
    window.__NEW28 = IDS;

    async function run(id, mode, maxMs) {
        mode = mode || 'solve'; maxMs = maxMs || 60000;
        var fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:0;top:0;width:500px;height:850px;border:0;opacity:0.01;pointer-events:none;z-index:-1';
        fr.src = '/reaction.html?game=' + id + '&smoke=' + Date.now();
        document.body.appendChild(fr);
        var rep = { id: id, mode: mode, name: null, reached: false, submitted: null, status: null, errors: [], result: null, calls: 0, ms: 0, state: null };
        var t0 = Date.now();
        try {
            var W;
            for (var i = 0; i < 400; i++) {
                W = fr.contentWindow;
                try { if (W && W.Reaction && W.Reaction.current && W.document.readyState === 'complete' && W.Leaderboard) break; } catch (e) { }
                await sleep(50);
            }
            if (!W || !W.Reaction || !W.Reaction.current) { rep.errors.push('頁面沒有載入完成'); return rep; }
            rep.name = W.Reaction.current.name;
            W.addEventListener('error', function (e) { rep.errors.push(String(e.message).slice(0, 200)); });
            W.addEventListener('unhandledrejection', function (e) { rep.errors.push('promise: ' + String(e.reason && e.reason.message || e.reason).slice(0, 200)); });
            var fake = await fetch('/test/leaderboard/fake_backend.js?x=' + Date.now()).then(function (r) { return r.text(); });
            W.eval(fake); W.__fake.latency = 5; W.__fake.seed(id, 0);
            W.requestAnimationFrame = function (cb) { return W.setTimeout(function () { cb(W.performance.now()); }, 16); };
            W.cancelAnimationFrame = function (x) { W.clearTimeout(x); };
            W.Leaderboard.setNick('驗證');
            var real = W.Leaderboard.submit;
            W.Leaderboard.submit = function (ref, v) {
                rep.reached = true; rep.submitted = { value: v, type: typeof v };
                var p = real.apply(this, arguments); p.then(function (r) { rep.status = r && r.status; }); return p;
            };
            var btn = function (txt) { return [].slice.call(W.document.querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === txt; })[0]; };
            if (btn('下一步')) { btn('下一步').click(); await sleep(250); }
            if (btn('開始挑戰')) btn('開始挑戰').click();
            await sleep(600);
            var done = function () { return !!W.document.querySelector('.drop-result-overlay'); };
            var D = function () { return W.Reaction.current.debug; };
            var lastKey = '';
            while (!done() && Date.now() - t0 < maxMs) {
                var d = D();
                if (d) {
                    var st = d.state ? JSON.stringify(d.state()) : '';
                    /* 同一個狀態每 300ms 才再呼叫一次（等過關動畫） */
                    try { if (mode === 'wrong' ? d.wrong : d.solve) { (mode === 'wrong' ? d.wrong : d.solve)(); rep.calls++; } } catch (e) { rep.errors.push('debug: ' + e.message); }
                    lastKey = st;
                }
                await sleep(300);
            }
            await sleep(500);
            var card = W.document.querySelector('.drop-result-card');
            rep.result = card ? card.innerText.replace(/\s+/g, ' ').slice(0, 160) : null;
            try { rep.state = D().state && D().state(); } catch (e) { }
        } catch (e) { rep.errors.push('harness: ' + e.message); }
        rep.ms = Date.now() - t0;
        fr.remove();
        return rep;
    }
    window.__new28 = run;
    window.__rows = [];
    window.__new28All = async function (ids, mode) {
        window.__rows = [];
        var list = ids || IDS;
        for (var i = 0; i < list.length; i++) {
            var r = await run(list[i], mode);
            window.__rows.push({ id: r.id, ok: !!r.result && r.errors.length === 0 && r.submitted && typeof r.submitted.value === 'number' && isFinite(r.submitted.value), sub: r.submitted && r.submitted.value, status: r.status, errs: r.errors.slice(0, 2), result: r.result, ms: r.ms });
        }
        return window.__rows;
    };
    /* 每款都玩兩次（答對一路到結算、答錯到結算），結果推進 window.__rows；不要 await（工具有 45 秒限制），用 __rows 讀進度 */
    window.__new28Both = async function (ids) {
        window.__rows = [];
        var list = ids || IDS;
        for (var i = 0; i < list.length; i++) {
            for (var m = 0; m < 2; m++) {
                var r = await run(list[i], m ? 'wrong' : 'solve');
                window.__rows.push({ id: r.id, mode: r.mode, ok: !!r.result && r.errors.length === 0 && !!r.submitted && typeof r.submitted.value === 'number' && isFinite(r.submitted.value), sub: r.submitted && r.submitted.value, status: r.status, errs: r.errors.slice(0, 2), result: (r.result || '').slice(0, 90), ms: r.ms });
            }
        }
        window.__rows.push({ done: true });
        return window.__rows;
    };
})();
