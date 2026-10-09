/* ═══════════════════════════════════════════════════════════════════
   reaction_maxexpr.js — 秒反應・拼出最大的數
   上方是算式「□ op □ op □」（兩個運算符號隨機：＋ － × ÷，乘除先算），下方 6 張數字牌；
   依序點 3 張牌填進三個空格，讓算式的值「最大」，再按「確定」。「重來」把已填的牌放回原位。
   關卡制，答錯或逾時就結束，成績＝通過關數。
   ───────────────────────────────────────────────────────────────────
   · 最佳解：窮舉 6 選 3 的排列（120 種），用「分數」精確比較（除法不四捨五入）。
     乘除先算：op2 是 × ÷、op1 是 ＋ － 時 ＝ a op1 (b op2 c)；其他一律由左到右。
   · 直覺做法＝「最大的三張由大到小填」。從第 3 關起，它不是最佳解的題目比例由 GREEDY_FAIL_START
     線性升到 GREEDY_FAIL_END（出題用重抽法），玩家不能永遠只填最大的三張。
   · 難度（線性，RAMP_LEVELS 關走完）：限時 TIME_S 40→20 秒；數字範圍 1～9／1～20／1～99；
     第 4 關起加入 ÷。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'maxexpr';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 30 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂（也是最後一關） */
    var TIME_S = [40, 20];                      /* 每關限時（秒） */
    var GREEDY_FAIL = [0.3, 0.8];               /* 「直覺做法不是最佳」的題目比例：第 3 關 → 到頂 */
    var GREEDY_FROM = 3;                        /* 第幾關起控制直覺做法失敗的比例 */
    var DIV_FROM = 4;                           /* 第幾關起加入 ÷ */
    var TRIES = 600;
    var SYM = { '+': '＋', '-': '－', '*': '×', '/': '÷' };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }
    function fr(n, d) { if (d < 0) { n = -n; d = -d; } var g = gcd(Math.abs(n), d) || 1; return { n: n / g, d: d / g }; }
    function apply(x, op, y) {
        if (op === '+') return fr(x.n * y.d + y.n * x.d, x.d * y.d);
        if (op === '-') return fr(x.n * y.d - y.n * x.d, x.d * y.d);
        if (op === '*') return fr(x.n * y.n, x.d * y.d);
        return fr(x.n * y.d, x.d * y.n);
    }
    function cmp(a, b) { return a.n * b.d - b.n * a.d; }
    function isHigh(op) { return op === '*' || op === '/'; }
    /* 算式的值（精確分數）：乘除先算 */
    function evalExpr(a, op1, b, op2, c) {
        var A = fr(a, 1), B = fr(b, 1), C = fr(c, 1);
        if (isHigh(op2) && !isHigh(op1)) return apply(A, op1, apply(B, op2, C));
        return apply(apply(A, op1, B), op2, C);
    }
    function valText(v) { return v.d === 1 ? String(v.n) : v.n + '/' + v.d + ' ＝ ' + (v.n / v.d).toFixed(4); }
    function exprText(a, op1, b, op2, c) { return a + ' ' + SYM[op1] + ' ' + b + ' ' + SYM[op2] + ' ' + c; }
    /* 窮舉：回傳 { best: 最大值, arrs: 達到最大值的排列（牌的索引）, worst: 最小值, worstArr } */
    function solve(cards, ops) {
        var best = null, arrs = [], worst = null, worstArr = null;
        for (var i = 0; i < cards.length; i++) for (var j = 0; j < cards.length; j++) for (var k = 0; k < cards.length; k++) {
            if (i === j || j === k || i === k) continue;
            var v = evalExpr(cards[i], ops[0], cards[j], ops[1], cards[k]);
            if (!best || cmp(v, best) > 0) { best = v; arrs = [[i, j, k]]; } else if (cmp(v, best) === 0) arrs.push([i, j, k]);
            if (!worst || cmp(v, worst) < 0) { worst = v; worstArr = [i, j, k]; }
        }
        return { best: best, arrs: arrs, worst: worst, worstArr: worstArr };
    }
    /* 直覺做法：最大的三張由大到小依序填 */
    function greedyArr(cards) {
        var idx = cards.map(function (v, i) { return i; }).sort(function (x, y) { return cards[y] - cards[x]; });
        return idx.slice(0, 3);
    }
    function opsFor(level) { return level >= DIV_FROM ? ['+', '-', '*', '/'] : ['+', '-', '*']; }
    function rangeFor(level) { return level <= 5 ? [1, 9] : (level <= 15 ? [1, 20] : [1, 99]); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function greedyFailFrac(level) { return level < GREEDY_FROM ? 0 : kit.ramp(level - GREEDY_FROM + 1, GREEDY_FAIL[0], GREEDY_FAIL[1], RAMP_LEVELS - GREEDY_FROM + 1); }
    function distinct(lo, hi, n, rand) {
        var pool = []; for (var v = lo; v <= hi; v++) pool.push(v);
        return kit.shuffle(pool, rand).slice(0, n);
    }
    /* 出題：回傳 { ops, cards, best, arrs, greedyFails, worst } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var wantFail = level >= GREEDY_FROM ? rand() < greedyFailFrac(level) : null, last = null;
        for (var t = 0; t < TRIES; t++) {
            var pool = opsFor(level), ops = [kit.pick(pool, rand), kit.pick(pool, rand)];
            var r = rangeFor(level), cards = distinct(r[0], r[1], 6, rand);
            var s = solve(cards, ops), g = greedyArr(cards);
            var gv = evalExpr(cards[g[0]], ops[0], cards[g[1]], ops[1], cards[g[2]]);
            var gf = cmp(gv, s.best) < 0;
            last = { ops: ops, cards: cards, best: s.best, arrs: s.arrs, greedyFails: gf, worst: s.worst, worstArr: s.worstArr };
            if (wantFail == null || gf === wantFail) return last;
        }
        return last;
    }
    function rating(n) {
        if (n >= 20) return '算式大師！全部通關！';
        if (n >= 14) return '高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '多想想乘除先算的規則，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: RAMP_LEVELS, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), picked = [], used = {};
        api.info = q;
        console.log('[拼出最大的數] 第 ' + level + ' 關：□ ' + SYM[q.ops[0]] + ' □ ' + SYM[q.ops[1]] + ' □，牌 ' + q.cards.join(',') + '；最大 ' + valText(q.best) + '（' + q.arrs.map(function (a) { return exprText(q.cards[a[0]], q.ops[0], q.cards[a[1]], q.ops[1], q.cards[a[2]]); }).join('；') + '）；直覺做法' + (q.greedyFails ? '失敗' : '可行') + '；限時 ' + timeMs(level) + ' ms');

        var slots = [0, 1, 2].map(function () { return h('div', { 'class': 'mx-slot' }); });
        var expr = h('div', { 'class': 'mx-expr' }, [slots[0], h('div', { 'class': 'mx-op', text: SYM[q.ops[0]] }), slots[1], h('div', { 'class': 'mx-op', text: SYM[q.ops[1]] }), slots[2]]);
        var tip = h('div', { 'class': 'mx-tip', text: '依序點 3 張牌填入空格，讓算式的值最大（乘除先算）' });
        var cardEls = q.cards.map(function (v, i) {
            var el = h('div', { 'class': 'mx-card', text: String(v) });
            kit.onTap(el, function () { pick(i); });
            return el;
        });
        var grid = h('div', { 'class': 'mx-cards' }, cardEls);
        var info = h('div', { 'class': 'mx-info' });
        var bReset = h('button', { 'class': 'btn btn--line', text: '重來' });
        var bOk = h('button', { 'class': 'btn btn--go', text: '確定' });
        bOk.disabled = true;
        [expr, tip, grid, info, h('div', { 'class': 'rx-btnrow' }, [bReset, bOk])].forEach(function (e) { stage.appendChild(e); });
        var hint = null;
        /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「最大算式的第一張牌」上（第一關的正確答案） */
        if (level === 1 && kit.once('maxexpr.hint')) hint = kit.hintOn(stage, cardEls[q.arrs[0][0]], { mode: 'tap', text: '請依序點擊數字牌' });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        function paint() {
            slots.forEach(function (s, i) { s.textContent = i < picked.length ? String(q.cards[picked[i]]) : ''; s.classList.toggle('mx-slot--on', i < picked.length); });
            cardEls.forEach(function (el, i) { el.classList.toggle('mx-card--used', !!used[i]); });
            bOk.disabled = picked.length < 3;
        }
        function pick(i) {
            if (api.over || used[i] || picked.length >= 3) return;
            hideHint(); used[i] = true; picked.push(i); Sfx.play('click'); paint();
        }
        function reset() { if (api.over) return; picked = []; used = {}; Sfx.play('click'); paint(); }
        kit.onTap(bReset, reset);
        function bestText() {
            var a = q.arrs[0];
            return exprText(q.cards[a[0]], q.ops[0], q.cards[a[1]], q.ops[1], q.cards[a[2]]) + ' ＝ ' + valText(q.best);
        }
        function confirm() {
            if (api.over || picked.length < 3) return;
            var v = evalExpr(q.cards[picked[0]], q.ops[0], q.cards[picked[1]], q.ops[1], q.cards[picked[2]]);
            var mine = exprText(q.cards[picked[0]], q.ops[0], q.cards[picked[1]], q.ops[1], q.cards[picked[2]]) + ' ＝ ' + valText(v);
            if (cmp(v, q.best) >= 0) {
                info.textContent = '最大了！' + mine; info.classList.add('mx-info--ok');
                api.pass({ delay: 900 });
            } else {
                info.textContent = '你的：' + mine + '　最大：' + bestText(); info.classList.add('mx-info--bad');
                api.fail({ delay: 2200, lines: ['你的排法：' + mine, '最大的排法：' + bestText(), '不是把最大的牌放前面就最大——要看符號'] });
            }
        }
        kit.onTap(bOk, confirm);
        api.timer(timeMs(level), function () {
            info.textContent = '時間到！最大的是：' + bestText(); info.classList.add('mx-info--bad');
            api.fail({ delay: 2200, lines: ['時間到！', '最大的排法：' + bestText()] });
        });
        api.solve = function () { picked = q.arrs[0].slice(); used = {}; picked.forEach(function (i) { used[i] = true; }); paint(); confirm(); };
        api.wrong = function () {
            if (cmp(q.worst, q.best) === 0) { api.solve(); return; }
            picked = q.worstArr.slice(); used = {}; picked.forEach(function (i) { used[i] = true; }); paint(); confirm();
        };
    }

    var G = {
        id: ID,
        name: '拼出最大的數',
        rule: '上方有一個算式，三個空格之間有兩個運算符號（乘除先算）。從下方 6 張數字牌依序選 3 張填進空格，讓算式的值最大，按「確定」。填錯了按「重來」。答錯或時間到就結束，看你能過幾關！',
        mount: mount,
        score: SCORE,
        test: { fr: fr, apply: apply, cmp: cmp, evalExpr: evalExpr, valText: valText, exprText: exprText, solve: solve, greedyArr: greedyArr, opsFor: opsFor, rangeFor: rangeFor, timeMs: timeMs, greedyFailFrac: greedyFailFrac, makeLevel: makeLevel, rating: rating, RAMP_LEVELS: RAMP_LEVELS, GREEDY_FAIL: GREEDY_FAIL, GREEDY_FROM: GREEDY_FROM, DIV_FROM: DIV_FROM, TIME_S: TIME_S }
    };
    Reaction.register(G);
})();
