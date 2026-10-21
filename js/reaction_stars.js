/* ═══════════════════════════════════════════════════════════════════
   reaction_stars.js — 秒反應・找星座（企劃 339，依使用者的修改改成「散開的字慢慢拼回來」）
   題目是**筆劃較多的繁體字**，字大約佔畫面的 90%。把字**切成 5×5～20×20 的小方塊**，**隨機散佈**在畫面上；
   每個小方塊會在一段時間（例如 10 秒）內**慢慢回到原來的位置**——**速度不同、開始的時間不同、而且故意延後**。
   你要猜這是哪個字（4～5 個選項）。**時間限制是回位時間的 80%**：等你看到完整的字之前就已經到時。
   ───────────────────────────────────────────────────────────────────
   · 每個小方塊 i：起點 s_i（隨機散在畫面上）、終點 t_i（它在字裡原本的位置）、延遲 d_i 秒才開始動、花 m_i 秒走過去（ease-in-out）。
     到達時間 a_i = d_i + m_i 在 [ARRIVE_MIN × T, T] 之間（T 是回位時間），其中一定有幾塊剛好在最後（約 T 才到），所以要到 T 才完整；
     而時間限制是 LIMIT × T（80%），所以一定有一部分的小方塊在時限時還沒到位（makeLevel 保證至少 STRAGGLE 比例還沒到）。
   · 字畫在一張看不見的畫布上，再依每個小方塊目前的位置，一塊一塊貼到顯示的畫布上（每個畫格 N² 次 drawImage，N 最大 20＝400 次，沒問題）。
   · 選項：同一個字群的形近字（SimilarChars），4 個（第 FIVE_FROM 關起 5 個）；答案隨機。
   · 難度（線性）：小方塊 5×5 → 20×20（TILES）、回位時間 10 → 6 秒（RETURN_S）→ 作答時限 8 → 4.8 秒、字群的平均筆劃範圍 10～16 → 16～24（STROKES）。
   · 揭曉：所有小方塊飛回原位，字整個露出來；答錯時標出正確的字。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'stars';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TILES = [5, 20];                        /* 字切成 N×N 個小方塊：第 1 關 → 到頂 */
    var RETURN_S = [10, 6];                     /* 所有小方塊回到原位要多久（秒）：第 1 關 → 到頂 */
    var LIMIT = 0.8;                            /* 作答的時間限制 ＝ 回位時間 × 這個比例（看到完整的字之前就到時） */
    var ARRIVE_MIN = 0.35;                      /* 每個小方塊最早在回位時間的幾成就到位 */
    var MOVE = [0.3, 0.7];                      /* 每個小方塊走過去花回位時間的幾成（範圍） */
    var STRAGGLE = 0.15;                        /* 時限到的時候，至少要有幾成的小方塊還沒到位 */
    var STROKES_LO = [10, 16], STROKES_HI = [16, 24];   /* 字群的平均筆劃範圍：第 1 關 → 到頂 */
    var FIVE_FROM = 12;                         /* 第幾關起有 5 個選項 */
    var MIN_GROUP = 5;                          /* 字群至少幾個字（5 個選項要夠） */
    var MAX_LEVEL = 90;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function tilesFor(level) { return Math.round(ramp(level, TILES)); }
    function returnS(level) { return Math.round(ramp(level, RETURN_S) * 100) / 100; }
    function limitMs(level) { return Math.round(returnS(level) * LIMIT * 1000); }
    function optsFor(level) { return level >= FIVE_FROM ? 5 : 4; }
    function strokeRange(level) { return [ramp(level, STROKES_LO), ramp(level, STROKES_HI)]; }
    function easeInOut(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
    /* 小方塊在 t 秒時的位置（起點 s、終點 e 都是 {x, y}；tile 有 d（延遲）、m（花多久））：還沒開始在起點、走完就在終點 */
    function tilePos(tile, s, e, t) {
        var p = kit.clamp((t - tile.d) / tile.m, 0, 1), k = easeInOut(p);
        return { x: s.x + (e.x - s.x) * k, y: s.y + (e.y - s.y) * k };
    }
    /* 時間 t 秒時已經到位的小方塊比例 */
    function arrivedFraction(tiles, t) { var n = 0; tiles.forEach(function (x) { if (t >= x.d + x.m - 1e-9) n++; }); return n / tiles.length; }
    /* 出一關：{ answer, options, group, N, tret（秒）, tiles（[{ sx, sy（起點，佔畫面寬高的比例）, d, m }]，由左到右由上到下，第 k 個是字裡第 (k%N, ⌊k/N⌋) 格）, limitMs, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var rg = strokeRange(level), no = optsFor(level), N = tilesFor(level), T = returnS(level);
        var pool = SimilarChars.groups({ minSize: MIN_GROUP, minStrokes: rg[0], maxStrokes: rg[1] });
        if (!pool.length) pool = SimilarChars.groups({ minSize: MIN_GROUP });
        var g = kit.pick(pool, rand), answer = kit.pick(g.chars, rand);
        var mates = g.chars.filter(function (c) { return c !== answer; }), options = kit.shuffle(kit.shuffle(mates.slice(), rand).slice(0, no - 1).concat([answer]), rand);
        var n2 = N * N, tiles = [], k;
        for (k = 0; k < n2; k++) {
            var m = kit.randFloat(MOVE[0], MOVE[1], rand) * T, a = kit.randFloat(ARRIVE_MIN, 1, rand) * T;
            if (a < m) a = m;
            tiles.push({ sx: kit.randFloat(0.02, 0.98, rand), sy: kit.randFloat(0.02, 0.98, rand), d: a - m, m: m });
        }
        /* 保證：至少有一些剛好在最後才到（整個字要到 T 才完整），而且時限（T × LIMIT）時至少有 STRAGGLE 比例還沒到位 */
        var order = kit.shuffle(tiles.map(function (x, i) { return i; }), rand), lastN = Math.max(2, Math.ceil(n2 * 0.06)), lateN = Math.max(lastN, Math.ceil(n2 * (STRAGGLE + 0.05)));
        order.slice(0, lastN).forEach(function (i) { tiles[i].d = T - tiles[i].m; });                                              /* 剛好在 T 到 */
        order.slice(lastN, lateN).forEach(function (i) { var x = tiles[i], a = kit.randFloat(LIMIT + 0.03, 1, rand) * T; if (a < x.m) a = x.m; x.d = a - x.m; });   /* 時限之後才到 */
        return { answer: answer, options: options, answerIdx: options.indexOf(answer), group: g.chars, N: N, tret: T, tiles: tiles, limitMs: limitMs(level), strokes: rg, level: level };
    }
    function rating(n) {
        if (n >= 15) return '火眼金睛！';
        if (n >= 10) return '一眼就看出來了！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '不用等拼完，先看出一部分就猜！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'stz-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), N = q.N;
        api.info = q;
        console.log('[找星座] 第 ' + level + ' 關：答案 ' + q.answer + '，選項 ' + q.options.join('') + '；' + N + '×' + N + ' 個小方塊，' + q.tret + ' 秒拼完、時限 ' + q.limitMs + ' 毫秒；字群平均筆劃範圍 ' + q.strokes.map(function (x) { return x.toFixed(1); }).join('～'));

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, S = Math.min(Math.round(W * 0.9), H - 210), fx = Math.round((W - S) / 2), fy = 56;
        var field = h('div', { 'class': 'stz-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note stz-tip', text: '碎片慢慢拼回來，猜是哪個字' });
        field.appendChild(tip);
        /* 看不見的畫布：把字畫上去（字大約佔 S 的 90%）；顯示用的畫布：依小方塊目前的位置一塊塊貼上去 */
        var off = document.createElement('canvas'); off.width = off.height = S;
        var ox = off.getContext('2d'), inkColor = getComputedStyle(document.documentElement).getPropertyValue('--c-ink').trim() || '#4A3B1E';
        ox.fillStyle = inkColor; ox.font = '900 ' + Math.round(S * 0.9) + 'px "Noto Serif TC","Songti TC","PMingLiU",serif'; ox.textAlign = 'center'; ox.textBaseline = 'middle'; ox.fillText(q.answer, S / 2, S / 2 + S * 0.04);
        var cv = h('canvas', { 'class': 'stz-canvas' }); cv.width = W; cv.height = S + 20; cv.style.cssText = 'left:0;top:' + (fy - 10) + 'px;width:' + W + 'px;height:' + (S + 20) + 'px;';
        field.appendChild(cv);
        var cx = cv.getContext('2d'), tw = S / N;
        /* 每個小方塊：終點是它在字裡的位置（加上字盒的位移），起點是畫布上的隨機位置 */
        var starts = q.tiles.map(function (t) { return { x: t.sx * (W - tw), y: t.sy * (S + 20 - tw) }; });
        var ends = q.tiles.map(function (t, k) { return { x: fx + (k % N) * tw, y: 10 + Math.floor(k / N) * tw }; });
        var info = h('div', { 'class': 'qz-note stz-info', text: '' }); info.style.top = (fy + S + 6) + 'px'; field.appendChild(info);
        var phase = 'play', done = false, t0 = performance.now(), snapAt = null;
        function draw(t, snapP) {
            cx.clearRect(0, 0, cv.width, cv.height);
            for (var k = 0; k < q.tiles.length; k++) {
                var p = snapP == null ? tilePos(q.tiles[k], starts[k], ends[k], t) : { x: snapP.from[k].x + (ends[k].x - snapP.from[k].x) * snapP.k, y: snapP.from[k].y + (ends[k].y - snapP.from[k].y) * snapP.k };
                cx.drawImage(off, (k % N) * tw, Math.floor(k / N) * tw, tw, tw, p.x, p.y, tw + 0.6, tw + 0.6);        /* +0.6：避免拼好之後方塊之間有細縫 */
            }
        }
        draw(0);
        var grid = kit.btnGrid(field, q.options.map(function (c, i) { return { text: c, kind: 'line', cls: 'stz-opt', onTap: function () { judge(i); } }; }), { cols: q.options.length, h: 92, gap: 8 });
        api.timer(q.limitMs, function () { judge(-1); });
        var loop = api.my.loop(function (now) {
            if (!cv.isConnected) return false;
            if (phase === 'play') draw((now - t0) / 1000);
            else if (snapAt) { var p = Math.min(1, (now - snapAt.t) / 500); draw(0, { from: snapAt.from, k: kit.easeOutCubic(p) }); if (p >= 1) return false; }
        });
        function judge(i) {
            if (done || api.over || phase !== 'play') return;
            done = true; phase = 'end';
            var ok = i === q.answerIdx, nowT = (performance.now() - t0) / 1000;
            grid.btns[q.answerIdx].classList.add('stz-ok'); if (i >= 0 && !ok) grid.btns[i].classList.add('stz-bad');
            /* 揭曉：所有小方塊在 0.5 秒內飛回原位 */
            snapAt = { t: performance.now(), from: q.tiles.map(function (t, k) { return tilePos(t, starts[k], ends[k], nowT); }) };
            info.textContent = ok ? '是「' + q.answer + '」，答對了！（拼好了 ' + Math.round(100 * arrivedFraction(q.tiles, nowT)) + '%）' : '正確的字是「' + q.answer + '」' + (i >= 0 ? '，你選了「' + q.options[i] + '」' : '（時間到）');
            kit.flash(stage, ok, api.my);
            if (ok) { api.pass({ delay: 1500 }); return; }
            api.fail({ delay: 3000, lines: ['正確的字是「' + q.answer + '」' + (i >= 0 ? '，你選了「' + q.options[i] + '」' : '（時間到）'), '選項：' + q.options.join('、')] });
        }
        api.solve = function () { judge(q.answerIdx); };
        api.wrong = function () { judge((q.answerIdx + 1) % q.options.length); };
    }

    var G = {
        id: ID,
        name: '找星座',
        rule: '題目是一個筆劃很多的字，大大的佔滿畫面。這個字被切成很多小方塊，散落在畫面各處，然後**一塊一塊慢慢飛回原來的位置**——每一塊的速度不同、開始的時間也不同。你要猜**這是哪個字**。**時間限制只有拼回來時間的 80%**，所以等不到完整的字，要靠先拼好的那些碎片猜！答錯或來不及就結束，看你能過幾關。越後面，碎片越多越小、拼得越快！',
        mount: mount,
        score: SCORE,
        test: {
            tilesFor: tilesFor, returnS: returnS, limitMs: limitMs, optsFor: optsFor, strokeRange: strokeRange, easeInOut: easeInOut, tilePos: tilePos, arrivedFraction: arrivedFraction, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, TILES: TILES, RETURN_S: RETURN_S, LIMIT: LIMIT, ARRIVE_MIN: ARRIVE_MIN, MOVE: MOVE, STRAGGLE: STRAGGLE, STROKES_LO: STROKES_LO, STROKES_HI: STROKES_HI, FIVE_FROM: FIVE_FROM, MIN_GROUP: MIN_GROUP, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
