/* ═══════════════════════════════════════════════════════════════════
   reaction_piggybank.js — 秒反應・撲滿有多少（原創篇 525「撲滿有多少」，照使用者的修改）
   樣式：css/games/reaction_piggybank.css（class 一律以「piggybank-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：不能打開的小豬撲滿，裡面有 2～3 種「遊戲硬幣」，**每種硬幣的重量都是質數（11 克以上）**。
     只知道撲滿裡的硬幣總重（簡單的關卡另外告訴你一共幾枚），還有一條規矩：
       「每種都是 1～9 枚」（個位數）或「每種都是偶數枚（2～18 枚）」。
     用每種硬幣旁邊的「−」「＋」調出你推算的枚數，按「打開撲滿」。只有一種答案；**猜錯一次這一局就結束**，會列出正確的算式。
   · 頓悟：個位數的限制讓「總重的個位數」大幅縮小可能（13×□ 的個位數只有 10 種）；偶數枚＝先把總重除以 2；
     有總枚數時就是雞兔同籠（全部當成輕的，多出來的重量÷重量差）。
   · 關卡（使用者要求「簡單關卡可以提供總硬幣數量」）：
       第 1～6 關 2 種、給總枚數 → 第 7～12 關 2 種、只給總重 → 第 13～20 關 3 種、給總枚數 → 第 21 關起 3 種、只給總重（質數 23～47）。
     第 7 關起每關有 EVEN_P 的機會是「偶數枚」。
   · 出題：亂數挑質數重量與枚數 → 窮舉所有符合規矩的組合，**只有一種組合重量（與枚數）對得上才出**。
     實測（note/原創篇實驗/exp_impl8.cjs ①）：3 種只給總重、質數 23～47 的唯一率約 43%，唯一題的答案不會偏向 1 或 9（含 1 或 9 枚的比例 54%，跟隨便亂出的 53% 差不多）；
     4 種硬幣的唯一題有 95% 含 1 或 9 枚（答案太好猜），所以最多只做到 3 種。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'piggybank';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [                              /* to＝這個階段的最後一關；k＝幾種硬幣；giveN＝給不給總枚數；primes＝重量從哪些質數挑 */
        { to: 6, k: 2, giveN: true, primes: [11, 13, 17, 19, 23, 29, 31] },
        { to: 12, k: 2, giveN: false, primes: [11, 13, 17, 19, 23, 29, 31] },
        { to: 20, k: 3, giveN: true, primes: [11, 13, 17, 19, 23, 29, 31, 37] },
        { to: 9999, k: 3, giveN: false, primes: [23, 29, 31, 37, 41, 43, 47] }
    ];
    var EVEN_FROM = 7;                          /* 第幾關起會出現「偶數枚」的規矩 */
    var EVEN_P = 0.35;                          /* 「偶數枚」出現的機會 */
    var TRIES = 400;                            /* 找不到唯一解的題目時，最多重試幾次 */
    var MAX_LEVEL = 90;
    var PASS_DELAY_MS = 1600;
    var FAIL_HOLD_MS = 6000;                    /* 猜錯時顯示正確算式的時間 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function stageOf(level) {
        level = Math.max(1, level);
        for (var i = 0; i < STAGES.length; i++) if (level <= STAGES[i].to || i === STAGES.length - 1) return STAGES[i];
    }
    /* 枚數的規矩：digit＝1～9 枚；even＝2、4、…、18 枚 */
    function rangeOf(mode) { return mode === 'even' ? { lo: 2, hi: 18, step: 2 } : { lo: 1, hi: 9, step: 1 }; }
    function weightOf(ws, cs) { var s = 0; for (var i = 0; i < ws.length; i++) s += ws[i] * cs[i]; return s; }
    function countOf(cs) { return cs.reduce(function (a, b) { return a + b; }, 0); }
    /* 窮舉：符合規矩、總重＝W（N 不是 null 時總枚數也要＝N）的組合有幾種（最多數到 limit） */
    function countSolutions(ws, W, N, mode, limit) {
        var r = rangeOf(mode), k = ws.length, n = 0, cs = [];
        (function rec(i, w, cnt) {
            if (n >= limit) return;
            if (i === k) { if (w === W && (N == null || cnt === N)) n++; return; }
            for (var v = r.lo; v <= r.hi; v += r.step) {
                if (w + ws[i] * v > W) break;
                cs[i] = v; rec(i + 1, w + ws[i] * v, cnt + v);
            }
        })(0, 0, 0);
        return n;
    }
    /* 出一題：{ ws（由輕到重）, cs（答案）, W, N（不給就是 null）, mode } */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var st = stageOf(level), last = null;
        var mode = level >= EVEN_FROM && rand() < EVEN_P ? 'even' : 'digit', r = rangeOf(mode);
        for (var tr = 0; tr < TRIES; tr++) {
            var ws = kit.shuffle(st.primes, rand).slice(0, st.k).sort(function (a, b) { return a - b; });
            var cs = ws.map(function () { return r.lo + r.step * kit.randInt(0, (r.hi - r.lo) / r.step, rand); });
            var W = weightOf(ws, cs), N = st.giveN ? countOf(cs) : null;
            last = { ws: ws, cs: cs, W: W, N: N, mode: mode };
            if (countSolutions(ws, W, N, mode, 2) === 1) return last;
        }
        return last;        /* 保底（實測不會用到） */
    }
    /* 玩家的答案對不對：符合規矩、重量（與枚數）都對得上——題目只有一種組合，所以對得上就是答案 */
    function isRight(pz, cs) {
        var r = rangeOf(pz.mode);
        for (var i = 0; i < cs.length; i++) if (cs[i] < r.lo || cs[i] > r.hi || (cs[i] - r.lo) % r.step) return false;
        return weightOf(pz.ws, cs) === pz.W && (pz.N == null || countOf(cs) === pz.N);
    }
    /* 算式：「13×4 ＋ 17×6 ＝ 154 克」 */
    function equation(ws, cs) { return ws.map(function (w, i) { return w + '×' + cs[i]; }).join(' ＋ ') + ' ＝ ' + weightOf(ws, cs) + ' 克'; }
    function rating(n) {
        if (n >= 25) return '撲滿透視眼！';
        if (n >= 12) return '尾數推得很準！';
        if (n >= 5) return '越來越有感覺了！';
        return '先看總重的個位數，能縮小很多可能！';
    }

    /* ═══ 畫面 ═══ */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var pz = makePuzzle(level, api.rand), k = pz.ws.length, r = rangeOf(pz.mode);
        api.info = pz;
        console.log('[撲滿有多少] 第 ' + level + ' 關：' + pz.ws.join('、') + ' 克，' + (pz.mode === 'even' ? '偶數枚' : '1～9 枚') + (pz.N != null ? '，共 ' + pz.N + ' 枚' : ''));
        var cs = pz.ws.map(function () { return r.lo; }), over = false;

        var wrap = h('div', { 'class': 'piggybank-wrap' });
        var pig = h('div', { 'class': 'piggybank-pig' }, [
            h('div', { 'class': 'piggybank-pig__icon', text: '🐷' }),
            h('div', { 'class': 'piggybank-pig__info' }, [
                h('div', { 'class': 'piggybank-weight', text: '總重 ' + pz.W + ' 克' }),
                pz.N != null ? h('div', { 'class': 'piggybank-count', text: '一共 ' + pz.N + ' 枚' }) : null
            ].filter(Boolean))
        ]);
        var ruleBox = h('div', { 'class': 'piggybank-rule', text: pz.mode === 'even' ? '每種硬幣都是「偶數枚」（2～18 枚）' : '每種硬幣都是「1～9 枚」' });
        var list = h('div', { 'class': 'piggybank-list' });
        var nums = [];
        pz.ws.forEach(function (w, i) {
            var num = h('div', { 'class': 'piggybank-num' });
            var minus = h('button', { 'class': 'btn btn--line piggybank-step', type: 'button', text: '−' });
            var plus = h('button', { 'class': 'btn btn--line piggybank-step', type: 'button', text: '＋' });
            kit.onTap(minus, function () { bump(i, -1); });
            kit.onTap(plus, function () { bump(i, 1); });
            var coin = h('div', { 'class': 'piggybank-coin piggybank-coin--' + i }, [h('span', { 'class': 'piggybank-coin__w', text: String(w) }), h('span', { 'class': 'piggybank-coin__g', text: '克' })]);
            list.appendChild(h('div', { 'class': 'piggybank-row' }, [coin, h('div', { 'class': 'piggybank-times', text: '×' }), minus, num, plus, h('div', { 'class': 'piggybank-unit', text: '枚' })]));
            nums.push(num);
        });
        var tip = h('div', { 'class': 'piggybank-tip', text: '調好每種的枚數，再按「打開撲滿」' });
        var btnOpen = h('button', { 'class': 'btn btn--primary piggybank-open', type: 'button', text: '打開撲滿' });
        kit.onTap(btnOpen, openIt);
        wrap.appendChild(pig); wrap.appendChild(ruleBox); wrap.appendChild(list); wrap.appendChild(tip); wrap.appendChild(btnOpen);
        stage.appendChild(wrap);

        function paint() { nums.forEach(function (el, i) { el.textContent = String(cs[i]); }); }
        function bump(i, d) {
            if (over) return;
            var v = cs[i] + d * r.step;
            if (v < r.lo) v = r.hi; else if (v > r.hi) v = r.lo;      /* 繞一圈：1 再按 − 變 9 */
            cs[i] = v; paint();
        }
        function openIt() {
            if (over) return;
            over = true; btnOpen.disabled = true;
            var lines = ['正確：' + equation(pz.ws, pz.cs)];
            if (isRight(pz, cs)) {
                tip.textContent = equation(pz.ws, cs);
                list.classList.add('piggybank-list--ok');
                kit.flash(stage, true, api.my);
                api.pass({ delay: PASS_DELAY_MS });
                return;
            }
            var yw = weightOf(pz.ws, cs), why = yw !== pz.W ? '你的組合重 ' + yw + ' 克，對不上 ' + pz.W + ' 克' : '重量對了，但一共是 ' + countOf(cs) + ' 枚，不是 ' + pz.N + ' 枚';
            tip.textContent = why;
            nums.forEach(function (el, i) { el.textContent = cs[i] === pz.cs[i] ? String(cs[i]) : cs[i] + '→' + pz.cs[i]; if (cs[i] !== pz.cs[i]) el.classList.add('piggybank-num--bad'); });
            wrap.appendChild(h('div', { 'class': 'piggybank-answer', text: lines[0] }));
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: [why].concat(lines) });
        }
        api.solve = function () { cs = pz.cs.slice(); paint(); openIt(); };
        api.wrong = function () { cs = pz.cs.slice(); cs[0] = cs[0] + r.step <= r.hi ? cs[0] + r.step : cs[0] - r.step; paint(); openIt(); };
        api.state = function () { return { cs: cs.slice(), over: over }; };
        paint();
    }

    var G = {
        id: ID,
        name: '撲滿有多少',
        rule: '小豬撲滿打不開，裡面有幾種遊戲硬幣，**每種硬幣的重量都是質數**（寫在硬幣上）。你只知道**撲滿裡硬幣的總重**（前面幾關還會告訴你一共幾枚），以及一條規矩：**每種都是 1～9 枚，或每種都是偶數枚**。用「−」「＋」調出每種硬幣有幾枚，按「打開撲滿」。答案只有一種；**猜錯一次就結束**，會列出正確的算式。沒有時間限制，慢慢算。',
        mount: mount,
        score: SCORE,
        test: {
            stageOf: stageOf, rangeOf: rangeOf, weightOf: weightOf, countOf: countOf, countSolutions: countSolutions, makePuzzle: makePuzzle,
            isRight: isRight, equation: equation, rating: rating, STAGES: STAGES, EVEN_FROM: EVEN_FROM, EVEN_P: EVEN_P, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
