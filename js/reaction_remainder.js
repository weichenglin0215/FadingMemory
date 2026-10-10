/* ═══════════════════════════════════════════════════════════════════
   reaction_remainder.js — 秒反應・求餘數（企劃 123「整除秒判」的改版）
   畫面出現一個除法，例如  4521 ÷ 7，問「餘數是多少？」，下方有五顆數字按鈕，點出正確的餘數。
   五個選項裡，錯的四個都是「合理的餘數」（0 到除數−1 之間），而且大多緊貼著正確答案（差 1、差 2、互補…），
   所以不能用「看起來不可能」來刪去。
   關卡制：答錯或來不及就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 出題（規範 Q1：先決定結果、再反推畫面）：先挑除數 d、商 q、餘數 r，再算被除數 N ＝ q × d ＋ r，
     所以正確答案一定是 r，不會算錯。
   · 除數隨題號解鎖：{5, 10}（只看個位）→ 加 {6, 9} → {6,7,8,9,11} → 加 {12,13} → 加 {14～19}。
     除數是 5 時五顆按鈕剛好是 0～4，其他除數的選項是「正確答案 ＋ 4 個其他合理餘數」。
   · 被除數的位數隨題號線性變多（3 位 → 4 位）；作答限時 12 秒 → 7 秒。
   · 答錯／逾時：揭曉 N ＝ d × 商 ＋ 餘數（例如 4521 ＝ 7 × 645 ＋ 6）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'remainder';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var ANS_S = [12, 7];                        /* 作答限時（秒）：第 1 題 → 到頂 */
    var N_MAX = [300, 9999];                    /* 被除數最大是多少：第 1 題 → 到頂（最小一律 N_MIN） */
    var N_MIN = 100;
    var MAX_LEVEL = 60;
    var OPTIONS = 5;                            /* 幾顆答案按鈕 */
    /* 除數清單：從第 from 題起加入 divs 這些除數 */
    var DIV_STEPS = [
        { from: 1, divs: [5, 10] },
        { from: 3, divs: [6, 9] },
        { from: 6, divs: [7, 8, 11] },
        { from: 11, divs: [12, 13] },
        { from: 21, divs: [14, 15, 16, 17, 18, 19] }
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    function nMaxFor(level) { return Math.round(kit.ramp(level, N_MAX[0], N_MAX[1], RAMP_LEVELS)); }
    function divsFor(level) {
        var out = [];
        DIV_STEPS.forEach(function (s) { if (level >= s.from) out = out.concat(s.divs); });
        return out;
    }
    /* 選項：正確餘數 r ＋ OPTIONS−1 個其他合理餘數（0～d−1），越接近正確答案（差 1、差 2、互補 d−r）越容易被選上；
       由小到大排好。除數剛好等於 OPTIONS（5）時，就是 0～4 全部。 */
    function makeOptions(d, r, rand) {
        rand = rand || Math.random;
        var all = [], i;
        for (i = 0; i < d; i++) if (i !== r) all.push(i);
        var need = OPTIONS - 1;
        if (all.length <= need) return [r].concat(all).sort(function (a, b) { return a - b; });
        var picked = [];
        while (picked.length < need) {
            /* 權重：離 r 越近越大；互補數（d − r，與 r 互補的那個餘數）額外加權 */
            var weights = all.map(function (v) {
                var w = 1 / Math.pow(1 + Math.abs(v - r), 2);
                if (v === d - r) w += 0.5;
                return w;
            });
            var total = weights.reduce(function (a, b) { return a + b; }, 0), x = rand() * total, idx = 0;
            for (i = 0; i < all.length; i++) { x -= weights[i]; if (x <= 0) { idx = i; break; } idx = i; }
            picked.push(all[idx]);
            all.splice(idx, 1);
        }
        return picked.concat([r]).sort(function (a, b) { return a - b; });
    }
    /* 出一題：{ d 除數, q 商, r 餘數, n 被除數, options 五個選項（由小到大）, explain 揭曉文字 } */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        var nMax = nMaxFor(level);
        for (var tr = 0; tr < 500; tr++) {
            var d = kit.pick(divsFor(level), rand), r = kit.randInt(0, d - 1, rand);
            var qLo = Math.max(1, Math.ceil((N_MIN - r) / d)), qHi = Math.floor((nMax - r) / d);
            if (qHi < qLo) continue;
            var q = kit.randInt(qLo, qHi, rand), n = q * d + r;
            if (n < N_MIN || n > nMax) continue;
            return { d: d, q: q, r: r, n: n, options: makeOptions(d, r, rand), explain: n + ' ＝ ' + d + ' × ' + q + ' ＋ ' + r };
        }
        return { d: 7, q: 35, r: 2, n: 247, options: makeOptions(7, 2, rand), explain: '247 ＝ 7 × 35 ＋ 2' };
    }
    function rating(n) {
        if (n >= 40) return '餘數大師！';
        if (n >= 25) return '心算高手！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '先熟悉一下，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8,
            head: function (lv) { return '第 ' + lv + ' 題'; },
            numText: function (v) { return v + ' 題'; },
            rating: rating,
            lines: function (S) { return ['連續答對 ' + S.cleared + ' 題']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeQuestion(level, api.rand);
        api.info = q;
        console.log('[求餘數] 第 ' + level + ' 題：' + q.n + ' ÷ ' + q.d + '，餘數 ' + q.r + '（商 ' + q.q + '），選項 ' + q.options.join(',') + '，限時 ' + ansMs(level) + ' ms');

        var eq = h('div', { 'class': 'qz-big rem-eq', text: q.n + ' ÷ ' + q.d });
        var ask = h('div', { 'class': 'qz-note rem-ask', text: '餘數是多少？' });
        var reveal = h('div', { 'class': 'qz-note rem-reveal' });
        stage.appendChild(eq); stage.appendChild(ask); stage.appendChild(reveal);
        var grid = kit.btnGrid(stage, q.options.map(function (v) {
            return { text: String(v), kind: 'sky', cls: 'rem-btn', onTap: function () { judge(v); } };
        }), { h: 120, gap: 8 });
        var bRight = grid.btns[q.options.indexOf(q.r)];
        api.timer(ansMs(level), function () { judge(null); });
        if (level === 1 && kit.once('remainder.hint')) kit.hintOn(stage, bRight, { mode: 'tap', delay: 500, text: '請點擊數字' });

        function judge(v) {
            if (api.over) return;
            var ok = v === q.r;
            eq.classList.add(ok ? 'qz-ok' : 'qz-bad');
            reveal.textContent = q.explain + '，餘數是 ' + q.r;
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1000 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2300, lines: [
                (v == null ? '時間到！' : '你選了 ' + v) + '，正確餘數是 ' + q.r,
                q.explain
            ] });
        }
        api.solve = function () { judge(q.r); };
        api.wrong = function () { judge(q.options[0] === q.r ? q.options[1] : q.options[0]); };
    }

    var G = {
        id: ID,
        name: '求餘數',
        rule: '畫面上有一個除法，例如 4521 ÷ 7，請點出「餘數」是多少。下面有五顆數字按鈕，錯的選項都只差一點點。答錯或來不及就結束，看你能連續答對幾題。越後面，被除數越大、除數越難、限時越短！',
        mount: mount,
        score: SCORE,
        test: {
            ansMs: ansMs, nMaxFor: nMaxFor, divsFor: divsFor, makeOptions: makeOptions, makeQuestion: makeQuestion, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ANS_S: ANS_S, N_MAX: N_MAX, N_MIN: N_MIN, OPTIONS: OPTIONS, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
