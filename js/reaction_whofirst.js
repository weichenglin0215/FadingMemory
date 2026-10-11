/* ═══════════════════════════════════════════════════════════════════
   reaction_whofirst.js — 秒反應・誰先亮
   左右兩盞燈先後亮起，點先亮的那一盞。時間差一關比一關小，縮到螢幕影格的極限。
   關卡制，答錯或逾時就結束，成績＝通過關數。
   ───────────────────────────────────────────────────────────────────
   · 時間差以「影格數」表示：第 1 關 FRAMES[0]＝18 影格（60Hz 約 0.3 秒）→ 到頂 FRAMES[1]＝2 影格（約 0.033 秒），線性。
     遊戲開始時先用 rAF 量 FRAME_SAMPLES 個影格的間隔取中位數當「1 影格＝幾毫秒」（量不到就當 60Hz）；
     顯示的時間差用實際量到的亮燈時刻差（4 位小數的秒）。
   · 兩盞燈都亮了才能按（不然只按已經亮的那盞就一定對）；按鈕在兩燈都亮之後才亮起。
   · 兩盞燈的位置、大小（±8%）、亮度略有不同，不能靠亮度判斷；先亮的一側隨機，同側最多連續 3 次。
   · rAF 被暫停（分頁在背景）時有 setTimeout 保底：照設計的時間差亮第二盞燈。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'whofirst';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 40 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 40;
    var FRAMES = [18, 2];                       /* 兩盞燈相差的影格數：第 1 關 → 到頂 */
    var WAIT_MS = [1200, 3000];                 /* 開始後隔多久第一盞燈亮 */
    var ANS_MS = 3000;                          /* 兩盞燈都亮之後的作答限時 */
    var SIZE_JIT = 0.08;                        /* 兩盞燈大小的隨機差 */
    var SAME_MAX = 3, FRAME_SAMPLES = 40;
    var frameMs = 1000 / 60;                    /* 1 影格幾毫秒（開始時量測） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function framesAt(level) { return Math.round(kit.ramp(level, FRAMES[0], FRAMES[1], RAMP_LEVELS)); }
    function median(arr) { var a = arr.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }
    /* 由量到的影格間隔（毫秒）算出「1 影格」：離譜的值（< 4 或 > 34）退回 60Hz */
    function frameFrom(samples) { var m = median(samples); return m >= 4 && m <= 34 ? m : 1000 / 60; }
    /* 先亮的一側：同側最多連續 SAME_MAX 次 */
    function nextSide(hist, rand) {
        rand = rand || Math.random;
        var n = hist.length;
        if (n >= SAME_MAX) {
            var last = hist[n - 1], same = true;
            for (var i = 1; i <= SAME_MAX; i++) if (hist[n - i] !== last) { same = false; break; }
            if (same) return last === 'L' ? 'R' : 'L';
        }
        return rand() < 0.5 ? 'L' : 'R';
    }
    function makeLevel(level, rand, hist) {
        rand = rand || Math.random;
        return {
            first: nextSide(hist || [], rand), frames: framesAt(level), wait: Math.round(kit.randFloat(WAIT_MS[0], WAIT_MS[1], rand)),
            sizeL: 1 + kit.randFloat(-SIZE_JIT, SIZE_JIT, rand), sizeR: 1 + kit.randFloat(-SIZE_JIT, SIZE_JIT, rand)
        };
    }
    function rating(n) {
        if (n >= 25) return '時間感知大師！';
        if (n >= 15) return '高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '先抓住「誰先」的感覺，再來一次！';
    }
    /* 開始時量測影格間隔（rAF 不動就維持 60Hz） */
    function measureFrame() {
        var last = null, samples = [];
        function tick(now) {
            if (last != null) samples.push(now - last);
            last = now;
            if (samples.length < FRAME_SAMPLES) window.requestAnimationFrame(tick);
            else frameMs = frameFrom(samples);
        }
        window.requestAnimationFrame(tick);
    }

    function mount(root, ctx) {
        measureFrame();
        var hist = [];
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關', '1 影格約 ' + (frameMs / 1000).toFixed(4) + ' 秒']; },
            setup: function (api) { if (api.level === 1) hist.length = 0; setup(api, hist); }
        });
    }

    function setup(api, hist) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand, hist);
        hist.push(q.first);
        api.info = q;
        console.log('[誰先亮] 第 ' + level + ' 關：' + (q.first === 'L' ? '左' : '右') + '邊先亮；時間差 ' + q.frames + ' 影格（約 ' + (q.frames * frameMs / 1000).toFixed(4) + ' 秒）；等 ' + q.wait + ' ms');

        var lampL = h('div', { 'class': 'wf-lamp wf-lamp--a' }), lampR = h('div', { 'class': 'wf-lamp wf-lamp--b' });
        lampL.style.transform = 'scale(' + q.sizeL.toFixed(3) + ')'; lampR.style.transform = 'scale(' + q.sizeR.toFixed(3) + ')';
        var lamps = { L: lampL, R: lampR };
        var tip = h('div', { 'class': 'wf-tip', text: '兩盞燈會先後亮起，哪一盞先亮？' });
        var row = h('div', { 'class': 'wf-row' }, [lampL, lampR]);
        var info = h('div', { 'class': 'wf-info', text: '準備…' });
        var bL = h('button', { 'class': 'btn btn--primary', text: '左邊先亮' }), bR = h('button', { 'class': 'btn btn--go', text: '右邊先亮' });
        bL.disabled = bR.disabled = true;
        stage.appendChild(tip); stage.appendChild(row); stage.appendChild(info);
        stage.appendChild(h('div', { 'class': 'rx-btnrow' }, [bL, bR]));

        var second = q.first === 'L' ? 'R' : 'L', lit = 0, tA = 0, tB = 0, ready = false, delta = q.frames * frameMs;
        function light(side) { lamps[side].classList.add('wf-lamp--on'); lit++; }
        function arm() {
            if (ready) return; ready = true;
            if (tB && tA) delta = tB - tA;
            bL.disabled = bR.disabled = false; info.textContent = '哪一盞先亮？';
            api.timer(ANS_MS, function () { judge(null); });
        }
        function begin() {
            var k = 0, loop = api.my.loop(function (now) {
                if (api.over || ready) return false;
                if (k === 0) { light(q.first); tA = now; }
                if (k === q.frames) { light(second); tB = now; arm(); return false; }
                k++;
            });
            /* 保底：rAF 被暫停時，照設計的時間差亮第二盞燈 */
            api.after(Math.round(q.frames * frameMs) + 400, function () { if (!ready) { loop.stop(); if (lit < 1) light(q.first); if (lit < 2) light(second); arm(); } });
        }
        api.after(q.wait, begin);

        function judge(side) {
            if (api.over) return;
            if (!ready) { if (lit < 1) light(q.first); if (lit < 2) light(second); ready = true; }
            var txt = '時間差 ' + (delta / 1000).toFixed(4) + ' 秒（' + q.frames + ' 影格）';
            info.textContent = txt;
            lamps[q.first].classList.add('wf-lamp--first');
            if (side === q.first) { api.pass({ delay: 800 }); return; }
            api.fail({ delay: 1900, lines: [
                (side == null ? '時間到！' : '選錯了！') + '先亮的是' + (q.first === 'L' ? '左邊' : '右邊') + '那一盞',
                txt, '這一關的極限是 ' + q.frames + ' 影格；螢幕更新率越高，能分辨的時間越短'
            ] });
        }
        kit.onTap(bL, function () { judge('L'); });
        kit.onTap(bR, function () { judge('R'); });
        api.solve = function () { judge(q.first); };
        api.wrong = function () { judge(second); };
    }

    var G = {
        id: ID,
        name: '誰先亮',
        rule: '左右兩盞燈會先後亮起，兩盞都亮了之後，**點「先亮的那一盞」**。兩盞燈的時間差一關比一關短，最後只差幾個畫面影格。答錯或來不及就結束，看你能過幾關。請讓畫面保持在前景。',
        mount: mount,
        score: SCORE,
        test: { framesAt: framesAt, median: median, frameFrom: frameFrom, nextSide: nextSide, makeLevel: makeLevel, rating: rating, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, FRAMES: FRAMES, WAIT_MS: WAIT_MS, SAME_MAX: SAME_MAX, SIZE_JIT: SIZE_JIT }
    };
    Reaction.register(G);
})();
