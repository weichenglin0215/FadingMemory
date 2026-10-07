/* 瀏覽器裡用的版面檢查小工具（只在手動／AI 驗證時用，不會被任何頁面載入）。
   用法（在 reaction.html?game=xxx 的 F12 主控台貼上，或請 Claude 的瀏覽器工具注入）：
     fetch('/test/leaderboard/browser_check.js').then(r => r.text()).then(t => (0, eval)(t))
   提供：
     __chk.overflow()   找出「超出舞台左右邊界」或「被裁切（scrollWidth > clientWidth）」的文字元素
     __chk.texts()      列出舞台上目前所有帶小數點的文字（用來檢查數字是不是都是 4 位小數）
     __chk.click(文字)  按下文字剛好等於這串字的按鈕
     __chk.fast()       把 requestAnimationFrame 換成 16ms 計時器（預覽瀏覽器的 rAF 會被節流成約 1 秒一次）
     __chk.start()      略過玩法說明（與排行榜彈窗），直接開始遊戲
     __chk.sleep(ms)    等一下（Promise）
     __chk.until(條件函式, 最長毫秒)   一直等到條件成立（回傳 true），逾時回傳 false
     __chk.tap(元素或選擇器)   對元素送一組真的 PointerEvent（pointerdown → 稍等 → pointerup），回傳是否找到元素
     __chk.down(元素或選擇器) / __chk.up(元素或選擇器)   只送 pointerdown／pointerup（按住類的遊戲用）
     __chk.setup(暱稱)  一次做完：載入假資料庫（fake_backend.js）、把 rAF 換成計時器、設定暱稱（不會跳出問暱稱的彈窗） */
(function () {
    function stageBox() { return document.getElementById('stage').getBoundingClientRect(); }
    function el(x) { return typeof x === 'string' ? document.querySelector(x) : x; }
    function ptr(target, type) {
        var b = target.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
        target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
    }
    var chk = {
        sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
        until: async function (cond, ms) {
            var t0 = Date.now();
            while (Date.now() - t0 < (ms || 8000)) { if (cond()) return true; await chk.sleep(50); }
            return false;
        },
        tap: async function (x) { var t = el(x); if (!t) return false; ptr(t, 'pointerdown'); await chk.sleep(40); ptr(t, 'pointerup'); return true; },
        down: function (x) { var t = el(x); if (!t) return false; ptr(t, 'pointerdown'); return true; },
        up: function (x) { var t = el(x); if (!t) return false; ptr(t, 'pointerup'); return true; },
        setup: async function (nick) {
            await fetch('/test/leaderboard/fake_backend.js?x=' + Date.now()).then(function (r) { return r.text(); }).then(function (t) { return (0, eval)(t); });
            chk.fast();
            if (window.Leaderboard && Leaderboard.setNick) Leaderboard.setNick(nick || '測試員');
            return 'setup done: nick=' + (window.Leaderboard && Leaderboard.getNick());
        },
        fast: function () {
            window.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(performance.now()); }, 16); };
            window.cancelAnimationFrame = function (id) { clearTimeout(id); };
        },
        click: function (txt) {
            var b = [].slice.call(document.querySelectorAll('button')).filter(function (x) { return x.textContent.trim() === txt; })[0];
            if (!b) return false;
            b.click();
            return true;
        },
        start: async function () {
            var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
            if (chk.click('下一步')) { await sleep(300); chk.click('開始挑戰'); }
            else chk.click('開始挑戰');
            await sleep(300);
        },
        overflow: function () {
            var st = stageBox(), sc = st.width / 500, bad = [];
            [].forEach.call(document.querySelectorAll('#stage *'), function (el) {
                if (el.children.length || !el.textContent.trim()) return;
                var cs = getComputedStyle(el);
                if (cs.visibility === 'hidden' || cs.display === 'none') return;
                var isSvg = el instanceof SVGElement;
                /* 用 Range 量「文字實際佔的範圍」（元素本身的框不包含溢出去的文字） */
                var rg = document.createRange();
                rg.selectNodeContents(el);
                var r = rg.getBoundingClientRect(), box = el.getBoundingClientRect();
                if (!r.width) return;
                var l = (r.left - st.left) / sc, rt = (r.right - st.left) / sc;
                /* 文字比自己的框還寬＝溢出（SVG 內的文字是場景的一部分，不檢查跟框的關係，只檢查有沒有超出舞台） */
                var spill = !isSvg && (r.right - box.right) / sc > 2;
                var offStage = (l < -1 || rt > 501) && !isSvg;
                if (spill || offStage) {
                    bad.push({ tag: el.tagName, cls: isSvg ? '' : String(el.className).slice(0, 30), text: el.textContent.trim().slice(0, 36), left: Math.round(l), right: Math.round(rt), boxRight: Math.round((box.right - st.left) / sc) });
                }
            });
            return bad;
        },
        texts: function () {
            var out = [];
            [].forEach.call(document.querySelectorAll('#stage *'), function (el) {
                if (el.children.length) return;
                var t = el.textContent.trim();
                if (/\d\.\d/.test(t)) out.push(t.slice(0, 60));
            });
            return out;
        }
    };
    window.__chk = chk;
    return 'browser_check ready';
})();
