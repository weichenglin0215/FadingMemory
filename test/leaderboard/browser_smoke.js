/* 瀏覽器煙霧測試：把「某一款遊戲」放進隱形的 iframe 真的玩到結算畫面，確認「送排行榜」那一步有被呼叫、
   而且送的是「一個有限的數字」（只在手動／AI 驗證時用，不會被任何頁面載入）。
   為什麼需要它：Node 的單元測試只能檢查設定與接線的文字，沒辦法證明「結算那一刻 score 運算式真的算得出數字」；
   eslint 能保證變數存在，但存在不等於是數字（字串、undefined 都會被 Leaderboard.submit 靜默略過，榜上永遠沒有成績）。
   用法（在任何一頁，例如 http://localhost:8743/reaction.html?game=speed 的 F12 主控台，或請 Claude 的瀏覽器工具注入）：
     await fetch('/test/leaderboard/browser_smoke.js').then(r => r.text()).then(t => (0, eval)(t));
     await __smoke('cake', 30000)        // 玩 cake，最多 30 秒，回傳報告
     window.__smokeJob = __smokeAll();   // 一次跑完全部 50 款（亂點打不到的用內建的 DRIVERS），約 10 分鐘；不要 await（工具會逾時）
     window.__smokeRows                  // 跑的過程中隨時讀：已經完成的每款報告（reached 要全部是 true、submitted.type 要是 number）
     await __smokeAll(['cake', 'pour'])  // 只跑指定的幾款
   報告欄位：
     id／name        遊戲
     reached         有沒有玩到「送排行榜」（Leaderboard.submit 被呼叫並印出「結算」那行）
     submitted       送出的原始數字（Leaderboard.submit 收到的 value）與型別
     status          Leaderboard.submit 的結果：skip（例如 0 關不在有效範圍）／saved／not-qualified…
     errors          玩的過程中 iframe 裡丟出的 JavaScript 錯誤（正常應該是空的）
   做法：iframe 載入 reaction.html?game=<id>，換上假的資料庫（fake_backend.js）、把 rAF 換成計時器，
   略過說明直接開始，然後「亂點」畫面上的按鈕與格子（模擬什麼都不會的玩家），通常很快就會失敗進入結算；
   有些遊戲需要特定操作才會結算，亂點打不到的就回報 reached:false，改用各遊戲自己的 G.debug 另外驗證：
     await __smoke('scallion', 30000, async (W, sleep) => { W.Reaction.current.debug.mash(40, 90); W.Reaction.current.debug.finish(); await sleep(1500); })
   第三個參數 driver(W, sleep) 會取代「亂點」：W 是遊戲所在的 iframe window（W.Reaction.current.debug 就是該遊戲的 G.debug），
   driver 做完之後這個工具再等一下 Leaderboard.submit 的結果。 */
(function () {
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    async function smoke(id, maxMs, driver) {
        maxMs = maxMs || 30000;
        var fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:0;top:0;width:500px;height:850px;border:0;opacity:0.01;pointer-events:none;z-index:-1';
        fr.src = '/reaction.html?game=' + id + '&smoke=' + Date.now();
        document.body.appendChild(fr);
        var report = { id: id, name: null, reached: false, submitted: null, status: null, errors: [], clicks: 0, ms: 0 };
        var t0 = Date.now();
        try {
            // 等遊戲頁面載入完成（Reaction.current 有值＝reaction.js 已經選好遊戲）
            var W;
            for (var i = 0; i < 400; i++) {
                W = fr.contentWindow;
                try { if (W && W.Reaction && W.Reaction.current && W.document.readyState === 'complete' && W.Leaderboard) break; } catch (e) { }
                await sleep(50);
            }
            if (!W || !W.Reaction || !W.Reaction.current) { report.errors.push('頁面沒有載入完成'); return report; }
            report.name = W.Reaction.current.name;
            W.addEventListener('error', function (e) { report.errors.push(String(e.message).slice(0, 160)); });
            W.addEventListener('unhandledrejection', function (e) { report.errors.push('promise: ' + String(e.reason && e.reason.message || e.reason).slice(0, 160)); });
            // 假資料庫（空榜單：任何成績都有機會進榜）、快速 rAF、暱稱
            var fake = await fetch('/test/leaderboard/fake_backend.js?x=' + Date.now()).then(function (r) { return r.text(); });
            W.eval(fake);
            W.__fake.latency = 5;
            W.__fake.seed(id, 0);
            W.requestAnimationFrame = function (cb) { return W.setTimeout(function () { cb(W.performance.now()); }, 16); };
            W.cancelAnimationFrame = function (x) { W.clearTimeout(x); };
            W.Leaderboard.setNick('煙霧測試');
            // 攔截 Leaderboard.submit，記下收到的原始值
            var realSubmit = W.Leaderboard.submit;
            W.Leaderboard.submit = function (ref, v) {
                report.reached = true; report.submitted = { value: v, type: typeof v };
                var p = realSubmit.apply(this, arguments);
                p.then(function (r) { report.status = r && r.status; });
                return p;
            };
            // 略過說明與排行榜彈窗，開始遊戲
            var btn = function (txt) { return [].slice.call(W.document.querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === txt; })[0]; };
            if (btn('下一步')) { btn('下一步').click(); await sleep(250); }
            if (btn('開始挑戰')) btn('開始挑戰').click();
            await sleep(400);
            // 亂點：只點 #screen 裡面的東西（不要點到標題列的「返回」）
            var Ev = function (type, el, x, y) {
                var o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, view: W };
                el.dispatchEvent(type.indexOf('pointer') === 0 ? new W.PointerEvent(type, o) : new W.MouseEvent(type, o));
            };
            var tap = function (el) {
                var b = el.getBoundingClientRect();
                if (!b.width || !b.height) return;
                var x = b.left + b.width / 2, y = b.top + b.height / 2;
                Ev('pointerdown', el, x, y); Ev('mousedown', el, x, y); Ev('pointerup', el, x, y); Ev('mouseup', el, x, y); Ev('click', el, x, y);
                report.clicks++;
            };
            if (driver) {
                // 指定的操作（通常是呼叫該遊戲的 G.debug），做完等到送榜發生或逾時
                await driver(W, sleep);
                while (!report.reached && Date.now() - t0 < maxMs) await sleep(100);
            }
            while (!driver && !report.reached && Date.now() - t0 < maxMs) {
                var screen = W.document.getElementById('screen');
                var pool = [].slice.call(screen.querySelectorAll('button:not([disabled]), [class*="cell"], [class*="btn"], [class*="card"], [class*="opt"], [class*="key"], [class*="num"], svg, svg *, canvas'));
                // 彈窗（暱稱／排行榜）在 #screen 外面，不會被點到；新規則彈窗的「知道了」在 #screen 裡，要點得到
                if (pool.length) tap(pool[Math.floor(Math.random() * pool.length)]);
                tap(screen);
                await sleep(120);
            }
            await sleep(400);        // 等 Leaderboard.submit 的結果
        } catch (e) { report.errors.push('harness: ' + e.message); }
        report.ms = Date.now() - t0;
        fr.remove();
        return report;
    }
    /* ═══ 亂點打不到的遊戲：各自的「驗證用操作」（多半靠遊戲自己的 G.debug；2026-10-07 逐款驗證過） ═══
       沒列在這裡的遊戲，亂點就會自己失敗進入結算。新增遊戲如果亂點到不了結算，在這裡補一個 driver。 */
    var done = function (W) { return !!W.document.querySelector('.dlg--result[data-sfx]'); };
    var waitState = async function (W, st, ms) {
        var t0 = Date.now();
        while (Date.now() - t0 < (ms || 10000)) { if (W.Reaction.current.debug.state().state === st) return true; await sleep(60); }
        return false;
    };
    /* 過 passes 關（G.debug.solve），再一直讓時間到（G.debug.timeUp）直到結算 */
    var levelDriver = function (passes) {
        return async function (W) {
            var D = function () { return W.Reaction.current.debug; };
            for (var k = 0; k < passes; k++) { await waitState(W, 'play', 10000); D().solve(); await sleep(1500); }
            for (var i = 0; i < 12 && !done(W); i++) { if (D().state().state === 'play') D().timeUp(); await sleep(1500); }
        };
    };
    var tapScreen = function (W, delay) {
        return sleep(delay).then(function () {
            var el = W.document.getElementById('screen'), b = el.getBoundingClientRect();
            var o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, button: 0, buttons: 1, view: W };
            el.dispatchEvent(new W.PointerEvent('pointerdown', o));
            return sleep(40).then(function () { el.dispatchEvent(new W.PointerEvent('pointerup', Object.assign({}, o, { buttons: 0 }))); });
        });
    };
    var DRIVERS = {
        pipes: { ms: 40000, run: levelDriver(2) },
        lightsout: { ms: 40000, run: levelDriver(2) },
        coins: { ms: 40000, run: levelDriver(2) },
        invoice: { ms: 30000, run: async function (W) {
            var D = function () { return W.Reaction.current.debug; };
            for (var k = 0; k < 3; k++) { await waitState(W, 'ask', 10000); D().answerRight(); await sleep(700); }
            D().finish(); await sleep(1500);
        } },
        schulte: { ms: 30000, run: async function (W) { W.Reaction.current.debug.play(36); await sleep(2500); } },
        scallion: { ms: 30000, run: async function (W) { var D = W.Reaction.current.debug; D.mash(40, 100); D.finish(); await sleep(1500); } },
        pillbox: { ms: 60000, run: async function (W) {
            var D = function () { return W.Reaction.current.debug; };
            for (var k = 0; k < 2; k++) { await waitState(W, 'fill', 10000); D().fill(false); D().submit(); await sleep(2200); }
            for (var i = 0; i < 12 && !done(W); i++) { if (D().state().state === 'fill') { D().fill(true); D().submit(); } await sleep(2200); }
        } },
        mirror: { ms: 40000, run: async function (W) {
            var D = function () { return W.Reaction.current.debug; };
            await waitState(W, 'play', 10000); D().solve(); await sleep(2000);
            for (var i = 0; i < 12 && !done(W); i++) { if (D().state().state === 'play') D().wall(); await sleep(1800); }
        } },
        chicks: { ms: 120000, run: async function (W) {
            var D = function () { return W.Reaction.current.debug; };
            await waitState(W, 'pick', 30000); D().findAll(); await sleep(2500);
            for (var i = 0; i < 6 && !done(W); i++) { await waitState(W, 'pick', 30000); D().tapEmpty(); await sleep(2600); }
        } },
        /* 抽光它：很多筆「按下→往下滑→放開」，用假的時間戳在約 3 秒內抽完 100 屏 */
        tissue: { ms: 60000, run: async function (W) {
            var D = W.Reaction.current.debug, t = 1000, guard = 0;
            while (D.state().phase !== 'done' && guard++ < 2000) {
                D.down(0);
                for (var k = 1; k <= 6 && D.state().phase !== 'done'; k++) { t += 5; D.move(k * 100, t); }
                D.up();
            }
            await sleep(2000);
        } },
        /* 刷油漆：一行一行掃過整個方塊；筆刷每沾一次縮小 15%，所以行距用「前後兩行筆刷直徑的平均 × 0.95」，剛好不留縫（共約 3～4 次沾漆） */
        paint: { ms: 60000, run: async function (W) {
            var D = W.Reaction.current.debug, SQ = D.SQ, y = null, prevD = null, guard = 0;
            while (D.state().state === 'play' && guard++ < 40) {
                if (D.state().budget < SQ - 4) D.dip();
                var Dn = D.state().D;
                y = y == null ? Dn / 2 - 1 : y + (prevD / 2 + Dn / 2) * 0.95;
                if (y > SQ - 1) y = SQ - 1;
                D.stroke([{ x: 2, y: y }, { x: SQ - 2, y: y }]);
                prevD = Dn;
                if (y >= SQ - 1) break;
            }
            await sleep(2500);
        } },
        /* 掛畫：只有一次機會，轉一個小角度就送出，等鏡頭推進完、結算卡片出現 */
        hangpic: { ms: 60000, run: async function (W) {
            var D = function () { return W.Reaction.current.debug; };
            await waitState(W, 'play', 30000); D().setTheta(0.37); D().submit();
            for (var i = 0; i < 80 && !done(W); i++) await sleep(500);
        } },
        /* 一心二用：只有一回合 30 秒，把「超過 5 秒」的計時縮成 1/30（30 秒變 1 秒），重新開始後等到回答階段，再用 answerRight 作答 */
        dualtask: { ms: 60000, run: async function (W) {
            var D = function () { return W.Reaction.current.debug; };
            var realST = W.setTimeout.bind(W);
            W.setTimeout = function (fn, ms) { return realST.apply(null, [fn, ms > 5000 ? ms / 30 : ms].concat([].slice.call(arguments, 2))); };
            D().restart();
            var t0 = Date.now();
            while (Date.now() - t0 < 20000 && D().state().state !== 'ask') await sleep(60);
            D().answerRight(); await sleep(3600);
        } },
        same: { ms: 45000 },          /* 不需要 driver，亂點就會答錯結算，只是偶爾要等比較久 */
        pour: { ms: 30000, run: async function (W) { var D = W.Reaction.current.debug; await sleep(800); D.pour(Math.round(D.msFor(80))); await sleep(2500); } },
        pendulum: { ms: 40000, run: async function (W) { await tapScreen(W, 1500); await sleep(3000); } },
        matchcolor: { ms: 40000, run: async function (W) { await tapScreen(W, 2500); await sleep(2500); } },
        /* 神準落下：ALT+A 是遊戲自己的測試熱鍵（強制插中正中央＝1000 分，剛好是分數上限） */
        drop: { ms: 60000, run: async function (W) {
            await sleep(6000);
            W.document.dispatchEvent(new W.KeyboardEvent('keydown', { altKey: true, code: 'KeyA', key: 'a', bubbles: true }));
            await sleep(8000);
        } },
        /* 不可能任務：點一下開始下墜，等照片離警戒線只剩 0.3～14.7px（成功要在 15px 內；每個畫面約移動 13px，視窗寬 14px 保證至少有一個畫面落在裡面）再點第二下。
           注意：摔到警戒線（沒點第二下）不會送榜（距離 0 公分不能算成績），所以這種情況 reached 會是 false，那是正確的 */
        impossible: { ms: 60000, run: async function (W) {
            var field = W.document.querySelector('.imp-field'), t = function (type) {
                var b = field.getBoundingClientRect();
                field.dispatchEvent(new W.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, button: 0, buttons: 1, view: W }));
            };
            await sleep(800); t('pointerdown');
            await new Promise(function (res) {
                var n = 0, iv = W.setInterval(function () {
                    n++;
                    var img = field.querySelector('image'), bar = field.querySelector('.imp-bar-rect');
                    var gap = parseFloat(bar.getAttribute('y')) - (parseFloat(img.getAttribute('y')) + parseFloat(img.getAttribute('height')));
                    if (gap > 0.3 && gap < 14.7) { W.clearInterval(iv); t('pointerdown'); res(); }
                    if (gap <= 0 || n > 20000) { W.clearInterval(iv); res(); }
                }, 1);
            });
            await sleep(9000);
        } }
    };

    /* 一次跑完全部（或指定的幾款）遊戲，回傳每款的報告陣列。全部約需 10 分鐘；瀏覽器分頁被隱藏時計時器較慢，請耐心等。
       用法：window.__smokeJob = __smokeAll();（不要 await，以免工具逾時）；稍後讀 window.__smokeRows。 */
    async function smokeAll(ids) {
        ids = ids || [];
        if (!ids.length) { var W0 = window.Reaction ? window : null; ids = (W0 ? W0.Reaction.list() : []).map(function (g) { return g.id; }); }
        window.__smokeRows = [];
        for (var i = 0; i < ids.length; i++) {
            var d = DRIVERS[ids[i]];
            var r = await smoke(ids[i], d ? d.ms : 25000, d && d.run);
            window.__smokeRows.push(r);
        }
        return window.__smokeRows.map(function (r) { return [r.id, r.reached, r.submitted && r.submitted.type, r.submitted && r.submitted.value, r.status, r.errors.join('|')].join(' / '); });
    }

    window.__smoke = smoke;
    window.__smokeAll = smokeAll;
    return 'browser_smoke ready';
})();
