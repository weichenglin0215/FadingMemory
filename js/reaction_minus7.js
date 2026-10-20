/* ═══════════════════════════════════════════════════════════════════
   reaction_minus7.js — 秒反應・一路減七（企劃 392，依使用者的流程）
   一開始顯示提示「**請從 1000 開始計數**」。然後出現大大的「**−7**」，下面是**三個連續數字的按鈕**（例如 992　993　994）——
   **選出「目前的數字減 7」的正確答案**。答對：「−7」縮小消失，再出現大大的「**再 −7**」，下面的三個按鈕也一起縮小、換成新的數字再放大出現。
   **目前的數字不會顯示**——要自己記住剛剛的答案、一路算下去。答錯、或超過時間沒按就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 題目的數列（stepDelta）：第 i 題（從 0 算起）的變化量：
       i < 15：−7（一路減七）；15 ≤ i < 25：−13；i ≥ 25：加 17、減 9 輪流（+17、−9、+17、−9…）。
     每次規則換了（第 15 題、第 25 題之前），會先跳出一個提示框預告「從現在起每次 −13」，提示的時候不計時。
   · 三個選項（makeOptions）：正確答案 ans 的「連續三個整數」——ans 在第 1、2 或 3 個位置（平均）。所以只能算出來，猜不到；
     選項差 1，借位算錯一點點（例如 93 − 7 算成 87）也不會剛好出現在選項裡。
   · 難度（線性，依連續答對題數 n）：每題限時 6 → 2.5 秒（到 RAMP_Q 題到頂）。
   · 揭曉：把整串數字列出來（最後 10 步），錯的那一步寫出算式（例如「986 − 7 ＝ 979，你選了 989」）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'minus7';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 300 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var START = 1000;                           /* 從幾開始數（使用者規定 1000） */
    var RAMP_Q = 40;                            /* 答對幾題之後難度到頂 */
    var TIME_S = [6, 2.5];                      /* 每題限時（秒）：第 0 題 → 到頂 */
    var DEC = 7;                                /* 一開始每次減多少 */
    var RULE2_FROM = 15, DEC2 = 13;             /* 第幾題起改成減 13 */
    var RULE3_FROM = 25, ADD3 = 17, SUB3 = 9;   /* 第幾題起改成「加 17、減 9」輪流 */
    var INTRO_MS = 2300;                        /* 一開始「請從 1000 開始計數」顯示多久 */
    var NOTICE_MS = 2200;                       /* 規則換的時候預告框顯示多久 */
    var SHRINK_MS = 190, GROW_MS = 240;         /* 縮小消失、放大出現的動畫時間 */
    var SOLVE_CAP = 10;                         /* 驗證用：api.solve 最多幫忙答對幾題 */
    var MAX_LEVEL = 60;
    var MINUS = '−';                            /* 減號（U+2212） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function timeMs(n) { var p = Math.min(1, Math.max(0, n / RAMP_Q)); return Math.round((TIME_S[0] + (TIME_S[1] - TIME_S[0]) * p) * 1000); }
    /* 第 i 題（從 0 算起）的變化量 */
    function stepDelta(i) { if (i < RULE2_FROM) return -DEC; if (i < RULE3_FROM) return -DEC2; return ((i - RULE3_FROM) % 2 === 0) ? ADD3 : -SUB3; }
    /* 答對 i 題之後的數字（i＝0 是起始值）：START ＋ 前 i 題的變化量總和 */
    function valueAfter(i) { var v = START; for (var k = 0; k < i; k++) v += stepDelta(k); return v; }
    /* 這個變化量要顯示成什麼字：「−7」「＋17」 */
    function deltaText(d) { return (d < 0 ? MINUS : '＋') + Math.abs(d); }
    /* 第 i 題大字：第 0 題「−7」；同一個規則的後續題目「再 −7」；規則剛換、或加減輪流時只寫「−13」「＋17」 */
    function bigText(i) { var d = stepDelta(i), t = deltaText(d); if (i === 0) return t; return (stepDelta(i - 1) === d) ? '再 ' + t : t; }
    /* 這一題前要不要先預告規則換了：回傳預告文字或 null */
    function noticeBefore(i) {
        if (i === RULE2_FROM) return '規則換了！從現在起每次 ' + deltaText(-DEC2);
        if (i === RULE3_FROM) return '規則又換了！從現在起「' + deltaText(ADD3) + '」和「' + deltaText(-SUB3) + '」輪流';
        return null;
    }
    /* 三個選項：ans 的連續三個整數，ans 在第 pos（0、1、2）個；回傳 { options, idx } */
    function makeOptions(ans, rand) {
        rand = rand || Math.random;
        var pos = kit.randInt(0, 2, rand), start = ans - pos;
        return { options: [start, start + 1, start + 2], idx: pos };
    }
    /* 一題：{ i, from（目前的數字，不顯示）, delta, ans, options, idx, big（大字）, notice, time（毫秒）} */
    function makeQuestion(i, rand) {
        var from = valueAfter(i), d = stepDelta(i), ans = from + d, op = makeOptions(ans, rand);
        return { i: i, from: from, delta: d, ans: ans, options: op.options, idx: op.idx, big: bigText(i), notice: noticeBefore(i), time: timeMs(i) };
    }
    /* 失敗時的說明：選了 picked（null＝沒選）；算式寫出「986 − 7 ＝ 979」 */
    function formula(q) { return q.from + ' ' + (q.delta < 0 ? MINUS : '＋') + ' ' + Math.abs(q.delta) + ' ＝ ' + q.ans; }
    function whyText(q, picked) { return picked == null ? '時間到！' + formula(q) : '算錯了！' + formula(q) + '，你選了 ' + picked; }
    /* 整串數字（最後 count 步）：['1000', '993', ...] */
    function chain(upTo, count) { var out = [], from = Math.max(0, upTo - count + 1); for (var k = from; k <= upTo; k++) out.push(valueAfter(k)); return out; }
    function rating(n) {
        if (n >= 30) return '心算天才！';
        if (n >= 20) return '腦袋很靈光！';
        if (n >= 10) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '記住剛剛的答案、一直算下去！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 10, stageClass: 'mn7-stage', resume: false,
            head: function () { return '一路減七'; },
            info: function (S) { return '答對 ' + S.score + ' 題'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 題'; },
            rating: rating,
            lines: function (S) { return ['連續答對 ' + S.score + ' 題']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, S = api.S;
        var count = 0, q = null, phase = 'intro', picked = null;
        api.info = { get count() { return count; }, get q() { return q; }, get phase() { return phase; } };
        S.score = 0; api.setInfo('答對 0 題');
        console.log('[一路減七] 開始：從 ' + START + ' 開始；每題限時 ' + timeMs(0) + ' → ' + timeMs(RAMP_Q) + ' 毫秒');

        var field = h('div', { 'class': 'mn7-field' });
        stage.appendChild(field);
        var banner = h('div', { 'class': 'mn7-banner', text: '請從 ' + START + ' 開始計數' }); field.appendChild(banner);
        var big = h('div', { 'class': 'mn7-big mn7-pop--out', text: '' }); field.appendChild(big);
        var info = h('div', { 'class': 'qz-note mn7-info', text: '' }); field.appendChild(info);
        var grid = h('div', { 'class': 'mn7-grid mn7-pop--out' }); field.appendChild(grid);
        var btns = [0, 1, 2].map(function (k) { var b = h('button', { 'class': 'btn btn--line mn7-btn', text: '' }); grid.appendChild(b); kit.onTap(b, function () { answer(k); }); return b; });

        /* 開場：先顯示「請從 1000 開始計數」，然後出第 0 題 */
        api.after(INTRO_MS, function () { banner.classList.add('mn7-banner--hide'); api.after(260, function () { ask(); }); });

        function pop(inn) { big.classList.toggle('mn7-pop--out', !inn); grid.classList.toggle('mn7-pop--out', !inn); }
        /* 出一題：（規則換了先預告）→ 換字、換按鈕 → 放大出現 → 開始計時 */
        function ask() {
            if (api.over) return;
            q = makeQuestion(count, api.rand);
            var go = function () {
                if (api.over) return;
                big.textContent = q.big; q.options.forEach(function (v, k) { btns[k].textContent = String(v); btns[k].classList.remove('mn7-btn--ok', 'mn7-btn--bad'); });
                pop(true); phase = 'wait';
                api.after(GROW_MS, function () {
                    if (api.over || phase !== 'wait') return;
                    phase = 'ask'; api.stopTimer(); api.timer(q.time, function () { fail(null); });
                    if (count === 0 && kit.once('minus7.hint')) kit.hintOn(stage, btns[q.idx], { mode: 'tap', delay: 700, text: START + ' 減 7 是多少？' });
                });
            };
            if (q.notice) {
                banner.textContent = q.notice; banner.classList.remove('mn7-banner--hide'); phase = 'notice';
                api.after(NOTICE_MS, function () { banner.classList.add('mn7-banner--hide'); api.after(260, go); });
            } else go();
        }
        function answer(k) {
            if (phase !== 'ask' || api.over) return;
            phase = 'judge'; api.stopTimer(); picked = q.options[k];
            if (k === q.idx) {
                btns[k].classList.add('mn7-btn--ok'); count++; S.score = count; api.setInfo('答對 ' + count + ' 題'); Sfx.play('ok');
                api.after(120, function () { pop(false); api.after(SHRINK_MS, ask); });         /* 「−7」和三個按鈕一起縮小消失，再出新題 */
                return;
            }
            btns[k].classList.add('mn7-btn--bad'); btns[q.idx].classList.add('mn7-btn--ok'); fail(picked);
        }
        /* 結束：把整串數字列出來，錯的那一步寫出算式 */
        function fail(pk) {
            if (api.over || phase === 'end') return;
            phase = 'end'; api.stopTimer(); btns[q.idx].classList.add('mn7-btn--ok');
            var why = whyText(q, pk);
            banner.textContent = why; banner.classList.remove('mn7-banner--hide'); banner.classList.add('mn7-banner--bad');          /* 結果寫在最上面的提示框（下面要留給整串數字） */
            var box = h('div', { 'class': 'mn7-chain' }), nums = chain(count, 10);
            nums.forEach(function (v, k) { var last = k === nums.length - 1; box.appendChild(h('span', { 'class': 'mn7-chain__n' + (last ? ' mn7-chain__n--now' : ''), text: String(v) })); if (!last) box.appendChild(h('span', { 'class': 'mn7-chain__a', text: '→' })); });
            box.appendChild(h('span', { 'class': 'mn7-chain__a', text: '→' })); box.appendChild(h('span', { 'class': 'mn7-chain__n mn7-chain__n--ans', text: q.ans + '？' }));
            field.appendChild(box);
            kit.flash(stage, false, api.my);
            api.fail({ delay: 4200, lines: [why, '數字一路是：' + chain(count, 10).join(' → ') + ' → ' + q.ans, '這一題的規則：' + deltaText(q.delta)] });
        }
        /* 驗證用：答對目前這題（最多 SOLVE_CAP 題）／選一個錯的；可重複呼叫 */
        api.solve = function () { if (phase !== 'ask' || count >= SOLVE_CAP) return; answer(q.idx); };
        api.wrong = function () { if (phase !== 'ask') return; answer((q.idx + 1) % 3); };
    }

    var G = {
        id: ID,
        name: '一路減七',
        rule: '一開始提示「**請從 1000 開始計數**」。然後出現大大的「−7」，下面有三個連續數字的按鈕——選出**目前的數字減 7** 的答案。答對了，就再 −7。**目前的數字不會顯示**，要自己記住答案一路算下去。每題限時越來越短；**第 15 題起改成 −13**，第 25 題起「＋17、−9」輪流。答錯或超過時間就結束，看你能連續答對幾題。',
        mount: mount,
        score: SCORE,
        test: {
            timeMs: timeMs, stepDelta: stepDelta, valueAfter: valueAfter, deltaText: deltaText, bigText: bigText, noticeBefore: noticeBefore, makeOptions: makeOptions, makeQuestion: makeQuestion, formula: formula, whyText: whyText, chain: chain, rating: rating,
            START: START, RAMP_Q: RAMP_Q, TIME_S: TIME_S, DEC: DEC, RULE2_FROM: RULE2_FROM, DEC2: DEC2, RULE3_FROM: RULE3_FROM, ADD3: ADD3, SUB3: SUB3, INTRO_MS: INTRO_MS, NOTICE_MS: NOTICE_MS, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
