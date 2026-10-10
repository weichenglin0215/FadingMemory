/* ═══════════════════════════════════════════════════════════════════
   reaction_sudokuone.js — 秒反應・數獨猜一格（企劃 181「四格數獨」的改版）
   一個 6×6 的迷你數獨，由四個 3×3 的「宮」組成（左上、右上、左下、右下，每一宮 9 格）。
   規則：每一宮裡 1～9 各出現一次；同一橫排、同一直排的數字不重複（一排只有 6 格，所以 9 個數字裡只用到 6 個）。
   盤面上只有一格被標成黃色，只要猜出「那一格」是幾就好，點下面的 1～9 數字鍵。
   關卡制：猜錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 出題（規範 Q1、Q2）：先用「隨機回溯」做出一個完整正確的 6×6 盤面（解答），挑一格當目標，
     再把其他格子一個一個拿掉，每拿一格就用「推理器」deduce() 檢查：只靠邏輯（排除法＋宮裡的「唯一能放的位置」）
     還能不能推出目標那一格？能才真的拿掉，不能就放回去。所以每一題「可以靠推理得到唯一答案」，不用靠猜。
   · 難度線性（RAMP_LEVELS 關走到頂）：盤面上留下的提示數字個數 GIVENS 26 → 9（越少越要多繞幾步推理；目標的橫排＋直排＋宮最少要看到 8 種不同數字才能直接排除）；
     作答限時 30 → 18 秒。盤面上會用淡黃色標出目標那一格所在的橫排、直排和宮，幫你看該看哪裡（不會揭露答案）。
   · 揭曉：整個盤面的解答都填出來（目標那一格用大字標出）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'sudokuone';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 25;                       /* 幾關之後難度到頂 */
    var DEEP_P = [0, 0.9];                      /* 出「要先推出別格、再推目標」這種題目的機率：第 1 關 → 到頂 */
    var GIVENS = [26, 9];                       /* 盤面上留下幾個提示數字（不含目標那格）：第 1 關 → 到頂；留不下這麼少時，留到不能再拿為止 */
    var ANS_S = [30, 18];                       /* 作答限時（秒）：第 1 關 → 到頂 */
    var MAX_LEVEL = 60;
    var SIZE = 6;                               /* 盤面邊長 */
    var BLOCK = 3;                              /* 每一宮的邊長（宮是 3×3） */
    var ALL = 0x3FE;                            /* 1～9 的位元遮罩（bit1～bit9） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function givensFor(level) { return Math.round(kit.ramp(level, GIVENS[0], GIVENS[1], RAMP_LEVELS)); }
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    function deepP(level) { return kit.ramp(level, DEEP_P[0], DEEP_P[1], RAMP_LEVELS); }
    function rowOf(i) { return Math.floor(i / SIZE); }
    function colOf(i) { return i % SIZE; }
    function blockOf(i) { return Math.floor(rowOf(i) / BLOCK) * 2 + Math.floor(colOf(i) / BLOCK); }
    /* 每一格的「鄰居」（同橫排、同直排、同宮的其他格） */
    var PEERS = [];
    var BLOCKS = [[], [], [], []];
    (function () {
        for (var i = 0; i < SIZE * SIZE; i++) BLOCKS[blockOf(i)].push(i);
        for (i = 0; i < SIZE * SIZE; i++) {
            var p = [];
            for (var j = 0; j < SIZE * SIZE; j++) if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || blockOf(j) === blockOf(i))) p.push(j);
            PEERS.push(p);
        }
    })();
    function bitCount(m) { var c = 0; while (m) { c += m & 1; m >>= 1; } return c; }
    function onlyDigit(m) { for (var d = 1; d <= 9; d++) if (m === (1 << d)) return d; return 0; }
    /* 隨機回溯：做出一個完整正確的盤面（36 個數字，每個 1～9） */
    function makeSolution(rand) {
        rand = rand || Math.random;
        var g = [], i;
        for (i = 0; i < SIZE * SIZE; i++) g.push(0);
        function ok(idx, d) {
            for (var k = 0; k < PEERS[idx].length; k++) if (g[PEERS[idx][k]] === d) return false;
            return true;
        }
        function rec(idx) {
            if (idx === SIZE * SIZE) return true;
            var ds = kit.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand);
            for (var k = 0; k < 9; k++) if (ok(idx, ds[k])) { g[idx] = ds[k]; if (rec(idx + 1)) return true; g[idx] = 0; }
            return false;
        }
        rec(0);
        return g;
    }
    /* 推理器：givens＝每格的數字（0＝空格）。只用兩種邏輯——
         ① 排除法：某格的候選數字只剩一個，就填它；
         ② 宮裡的唯一位置：某個數字在這一宮裡只剩一格能放，就填它。
       反覆做到推不動為止。回傳 { grid（推理後的盤面，0＝推不出）, steps（用了幾輪）, solved（目標是否推出）, value（推出的目標數字或 0） } */
    function deduce(givens, target) {
        var cand = [], g = givens.slice(), i, d;
        for (i = 0; i < SIZE * SIZE; i++) cand.push(ALL);
        function place(idx, dg) {
            g[idx] = dg; cand[idx] = 1 << dg;
            PEERS[idx].forEach(function (p) { if (g[p] !== dg) cand[p] &= ~(1 << dg); });
        }
        for (i = 0; i < SIZE * SIZE; i++) if (g[i]) place(i, g[i]);
        var steps = 0, changed = true;
        while (changed) {
            changed = false;
            for (i = 0; i < SIZE * SIZE; i++) {
                if (!g[i] && bitCount(cand[i]) === 1) { place(i, onlyDigit(cand[i])); changed = true; }
            }
            for (var b = 0; b < 4; b++) {
                for (d = 1; d <= 9; d++) {
                    if (BLOCKS[b].some(function (c) { return g[c] === d; })) continue;
                    var spots = BLOCKS[b].filter(function (c) { return !g[c] && (cand[c] & (1 << d)); });
                    if (spots.length === 1) { place(spots[0], d); changed = true; }
                }
            }
            if (changed) steps++;
            if (target != null && g[target]) break;
        }
        return { grid: g, steps: steps, solved: target != null ? !!g[target] : false, value: target != null ? g[target] : 0 };
    }
    /* 出一題：{ solution（完整解答）, target（要猜的那一格）, givens（提示盤面，0＝空格，目標那格一定是 0）, steps（推理需要幾輪）, answer, count（提示個數） }
       做法：試最多 40 次，每次「做出解答 → 挑目標 → 能拿的提示都拿掉」；提示個數離目標（givensFor）不超過 SLACK 個就收，
       否則記下提示最少的那次，最後用它。「繞一圈」題型（先拿目標的鄰居、留下不相干的格子）前 10 次試不到才改用普通的拿法。 */
    var SLACK = 3;
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var want = givensFor(level), best = null;
        for (var tr = 0; tr < 40; tr++) {
            var sol = makeSolution(rand), target = kit.randInt(0, SIZE * SIZE - 1, rand);
            var givens = sol.slice(); givens[target] = 0;
            var others = [];
            for (var i = 0; i < SIZE * SIZE; i++) if (i !== target) others.push(i);
            var count = others.length;
            var order = kit.shuffle(others, rand);
            /* 「繞一圈」的題目：先拿「跟目標同橫排、同直排、同宮」的提示，留下不相干的格子，推理就得先靠它們推出別格，再推目標 */
            if (tr < 10 && rand() < deepP(level)) {
                var near = order.filter(function (c) { return PEERS[target].indexOf(c) >= 0; }), far = order.filter(function (c) { return PEERS[target].indexOf(c) < 0; });
                order = near.concat(far);
            }
            order.forEach(function (c) {
                if (count <= want) return;
                var save = givens[c]; givens[c] = 0;
                var r = deduce(givens, target);
                if (r.solved && r.value === sol[target]) count--; else givens[c] = save;
            });
            var fin = deduce(givens, target);
            if (!fin.solved || fin.value !== sol[target]) continue;
            var pz = { solution: sol, target: target, givens: givens, steps: fin.steps, answer: sol[target], count: count };
            if (count <= want + SLACK) return pz;
            if (!best || count < best.count) best = pz;
        }
        if (best) return best;
        /* 保底：目標那一宮其他 8 格都是提示 */
        var fbSol = makeSolution(rand), fbT = 0, fbG = fbSol.slice(); fbG[fbT] = 0;
        return { solution: fbSol, target: fbT, givens: fbG, steps: deduce(fbG, fbT).steps, answer: fbSol[fbT], count: 35 };
    }
    function rating(n) {
        if (n >= 25) return '數獨高手！';
        if (n >= 15) return '推理很敏捷！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先看同一宮缺哪個數字，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makePuzzle(level, api.rand);
        api.info = q;
        console.log('[數獨猜一格] 第 ' + level + ' 關：目標第 ' + (rowOf(q.target) + 1) + ' 排第 ' + (colOf(q.target) + 1) + ' 格，答案 ' + q.answer + '；提示 ' + q.count + ' 個（想要 ' + givensFor(level) + '），推理 ' + q.steps + ' 輪；限時 ' + ansMs(level) + ' ms');

        var board = h('div', { 'class': 'sdk-board' });
        var cells = [];
        for (var i = 0; i < SIZE * SIZE; i++) {
            var c = h('div', { 'class': 'sdk-cell' });
            c.className += ' sdk-r' + (rowOf(i) % BLOCK) + ' sdk-c' + (colOf(i) % BLOCK);
            if (i === q.target) c.className += ' sdk-cell--target';
            else if (rowOf(i) === rowOf(q.target) || colOf(i) === colOf(q.target) || blockOf(i) === blockOf(q.target)) c.className += ' sdk-cell--peer';
            if (q.givens[i]) { c.textContent = String(q.givens[i]); c.className += ' sdk-cell--given'; }
            else if (i === q.target) c.textContent = '？';
            board.appendChild(c); cells.push(c);
        }
        var tip = h('div', { 'class': 'qz-note sdk-tip', text: '黃色那一格是幾？（一宮 3×3 裡 1～9 各一個）' });
        stage.appendChild(board); stage.appendChild(tip);
        var items = [];
        for (var d = 1; d <= 9; d++) (function (d) { items.push({ text: String(d), kind: 'sky', cls: 'sdk-btn', onTap: function () { judge(d); } }); })(d);
        var grid = kit.btnGrid(stage, items, { cols: 3, h: 62, gap: 8 });
        api.timer(ansMs(level), function () { judge(null); });
        if (level === 1 && kit.once('sudokuone.hint')) kit.hintOn(stage, grid.btns[q.answer - 1], { mode: 'tap', delay: 700, text: '請點擊數字' });

        function judge(v) {
            if (api.over) return;
            var ok = v === q.answer;
            /* 揭曉：整個解答都填出來，目標那一格標大字 */
            cells.forEach(function (c, k) {
                if (!q.givens[k]) { c.textContent = String(q.solution[k]); c.classList.add('sdk-cell--fill'); }
            });
            cells[q.target].classList.add(ok ? 'sdk-cell--ok' : 'sdk-cell--bad');
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1200 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2500, lines: [
                (v == null ? '時間到！' : '你選了 ' + v) + '，黃色那一格是 ' + q.answer,
                '第 ' + (rowOf(q.target) + 1) + ' 排第 ' + (colOf(q.target) + 1) + ' 格；整個盤面的解答已填出'
            ] });
        }
        api.solve = function () { judge(q.answer); };
        api.wrong = function () { judge(q.answer % 9 + 1); };
    }

    var G = {
        id: ID,
        name: '數獨猜一格',
        rule: '6×6 的迷你數獨，由四個 3×3 的宮組成：每一宮裡 1～9 各出現一次，同一橫排、同一直排不重複。盤面上黃色的那一格，只要猜出它是幾就好。猜錯或來不及就結束，看你能過幾關。越後面，提示數字越少，要多推理幾步！',
        mount: mount,
        score: SCORE,
        test: {
            givensFor: givensFor, ansMs: ansMs, deepP: deepP, rowOf: rowOf, colOf: colOf, blockOf: blockOf, PEERS: PEERS, BLOCKS: BLOCKS, makeSolution: makeSolution, deduce: deduce, makePuzzle: makePuzzle, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, GIVENS: GIVENS, ANS_S: ANS_S, SIZE: SIZE, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
