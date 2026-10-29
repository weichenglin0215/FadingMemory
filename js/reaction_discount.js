/* ═══════════════════════════════════════════════════════════════════
   reaction_discount.js — 秒反應・打了幾折（企劃 403）
   百貨公司週年慶的吊牌：「原價 800 元，**特價 560 元**」。**這是打幾折？**點下面的折數按鈕。答錯就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 台灣的「折」：**打 7 折＝付原價的 70%**（不是減 30%）。折數 r 換成「付幾 %」：pctOf(r)＝ r < 10 ? r × 10 : r
     （1～9 折＝10%～90%；75 折＝75%、85 折＝85%、95 折＝95%、65 折＝65%）。特價 ＝ 原價 × pctOf(r) ÷ 100。
     很多人會把「7 折」和「打 3 折（減 30%）」搞混——所以按鈕裡一直有「互補」的折數（7 折對 3 折），**答案是 7 折時 3 折就是最誘人的錯誤選項**。
   · 一題（makeQuestion）：從目前的折數池 poolFor(n) 抽一個折數 r；原價 orig 是 20 的倍數（這樣 5% 的折數算出來的特價一定是整數）；
     特價 sale ＝ orig × pct ÷ 100。早期的原價是整百（200～1000）；後來原價越來越大、越來越不整（1260、1780…）。
   · 折數池與按鈕（依連續答對題數 n）：一開始 5～9 折；n ≥ 5 加 2、3、4 折；n ≥ 10 加 75、85、95 折；n ≥ 20 加 65 折、1 折。
     按鈕一直都有 1～9 折（共 9 顆）；有 75／85／95／65 折出現之後，這幾顆也加進按鈕。
   · 難度（線性，依連續答對題數 n）：每題限時 8 → 4 秒（到 RAMP_Q 題到頂）；原價的上限 1000 → 6000、不是整百的機率 0 → 0.8。
   · 揭曉：寫出 560 ÷ 800 ＝ 0.7 ＝ 7 折；如果你選的是「互補」的折數（7 折選成 3 折），特別說明「3 折是付 30%，7 折才是付 70%」。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'discount';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 300 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_Q = 40;                            /* 答對幾題之後難度到頂 */
    var TIME_S = [8, 4];                        /* 每題限時（秒）：第 0 題 → 到頂 */
    var MAX_ORIG = [1000, 6000];                /* 原價的上限：第 0 題 → 到頂 */
    var P_ODD = [0, 0.8];                       /* 原價不是整百的機率：第 0 題 → 到頂 */
    var MIN_ORIG = 200;                         /* 原價的下限 */
    var POOL0 = [5, 6, 7, 8, 9];                /* 一開始的折數池 */
    var STAGES = [{ from: 5, add: [2, 3, 4] }, { from: 10, add: [75, 85, 95] }, { from: 20, add: [65, 1] }];   /* 答對幾題之後加入哪些折數 */
    var BASE_BTN = [1, 2, 3, 4, 5, 6, 7, 8, 9]; /* 一直都有的按鈕 */
    var SOLVE_CAP = 10;                         /* 驗證用：api.solve 最多幫忙答對幾題 */
    var MAX_LEVEL = 90;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(n) { return Math.min(1, Math.max(0, n / RAMP_Q)); }
    function lerp(pair, n) { return pair[0] + (pair[1] - pair[0]) * prog(n); }
    function timeMs(n) { return Math.round(lerp(TIME_S, n) * 1000); }
    function maxOrigFor(n) { return Math.round(lerp(MAX_ORIG, n)); }
    function pOddFor(n) { return Math.round(lerp(P_ODD, n) * 1000) / 1000; }
    /* 折數 r ＝ 付幾 %：1～9 折＝10%～90%；兩位數的折（75、85、95、65）就是那個 % */
    function pctOf(r) { return r < 10 ? r * 10 : r; }
    function labelOf(r) { return r + ' 折'; }
    /* 目前會出現的折數（答案的候選）：POOL0 加上已經解鎖的 */
    function poolFor(n) { var p = POOL0.slice(); STAGES.forEach(function (s) { if (n >= s.from) p = p.concat(s.add); }); return p; }
    /* 目前的按鈕：1～9 折，再加上池裡兩位數的折（由小到大） */
    function buttonsFor(n) { var extra = poolFor(n).filter(function (r) { return r >= 10; }); return BASE_BTN.concat(extra.sort(function (a, b) { return a - b; })); }
    /* 「互補」的折數（打 7 折 ↔ 打 3 折：7 折是付 70%，3 折是付 30%）：r ＋ 互補 ＝ 10；兩位數的折沒有互補 */
    function complementOf(r) { return r < 10 ? 10 - r : null; }
    /* 一題：{ n, r（正確折數）, pct, orig, sale, label, buttons, time } */
    function makeQuestion(n, rand) {
        rand = rand || Math.random;
        var pool = poolFor(n), r = kit.pick(pool, rand), pct = pctOf(r), hi = maxOrigFor(n), orig;
        if (rand() < pOddFor(n)) { var lo20 = Math.ceil(MIN_ORIG / 20); orig = 20 * kit.randInt(lo20, Math.floor(hi / 20), rand); if (orig % 100 === 0) orig += 20; }
        else orig = 100 * kit.randInt(Math.ceil(MIN_ORIG / 100), Math.max(2, Math.floor(hi / 100)), rand);
        var sale = orig * pct / 100;
        return { n: n, r: r, pct: pct, orig: orig, sale: sale, label: labelOf(r), buttons: buttonsFor(n), time: timeMs(n) };
    }
    /* 失敗時的算式說明：560 ÷ 800 ＝ 0.7 ＝ 7 折 */
    function formula(q) { var d = q.sale / q.orig; return q.sale + ' ÷ ' + q.orig + ' ＝ ' + (Math.round(d * 10000) / 10000) + ' ＝ ' + q.label; }
    function whyText(q, picked) {
        if (picked == null) return '時間到！' + formula(q);
        var t = '選錯了！' + formula(q) + '，你選了 ' + labelOf(picked);
        if (q.r < 10 && picked === 10 - q.r) t += '。' + labelOf(picked) + '是付 ' + pctOf(picked) + '%，' + q.label + '才是付 ' + q.pct + '%';
        return t;
    }
    function rating(n) {
        if (n >= 30) return '折扣達人！';
        if (n >= 20) return '買東西最精！';
        if (n >= 10) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '7 折是付 70%！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 10, stageClass: 'dsc-stage', resume: false,
            head: function () { return '打了幾折'; },
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
        var count = 0, q = null, phase = 'ask', grid = null, picked = null;
        api.info = { get count() { return count; }, get q() { return q; }, get phase() { return phase; } };
        S.score = 0; api.setInfo('答對 0 題');
        console.log('[打了幾折] 開始：每題限時 ' + timeMs(0) + ' → ' + timeMs(RAMP_Q) + ' 毫秒；折數池 ' + poolFor(0).join(',') + ' → ' + poolFor(RAMP_Q).join(','));

        var field = h('div', { 'class': 'dsc-field' });
        stage.appendChild(field);
        var tag = h('div', { 'class': 'dsc-tag' }); field.appendChild(tag);
        var info = h('div', { 'class': 'qz-note dsc-info', text: '' }); field.appendChild(info);

        function ask() {
            if (api.over) return;
            q = makeQuestion(count, api.rand); phase = 'ask'; picked = null; info.textContent = ''; info.className = 'qz-note dsc-info';
            tag.innerHTML = '';
            tag.appendChild(h('div', { 'class': 'dsc-tag__sale', text: '特價' }));
            tag.appendChild(h('div', { 'class': 'dsc-tag__orig' })); tag.lastChild.appendChild(document.createTextNode('原價 ')); tag.lastChild.appendChild(h('s', { text: q.orig + ' 元' }));
            var sp = h('div', { 'class': 'dsc-tag__price' }); sp.appendChild(h('span', { 'class': 'dsc-tag__n', text: String(q.sale) })); sp.appendChild(document.createTextNode(' 元')); tag.appendChild(sp);
            tag.appendChild(h('div', { 'class': 'dsc-tag__q', text: '這是打幾折？' }));
            if (grid) grid.el.remove();
            var btns = q.buttons, cols = btns.length > 9 ? 4 : 3;
            grid = kit.btnGrid(field, btns.map(function (r) { return { text: labelOf(r), kind: 'line', cls: 'dsc-btn', onTap: function () { answer(r); } }; }), { cols: cols, h: btns.length > 9 ? 76 : 96, gap: 8, bottom: 8 });
            api.stopTimer(); api.timer(q.time, function () { fail(null); });
            if (count === 0 && kit.once('discount.hint')) kit.hintOn(stage, grid.btns[q.buttons.indexOf(q.r)], { mode: 'tap', delay: 900, text: '7 折＝付 70%' });
        }
        ask();
        function answer(r) {
            if (phase !== 'ask' || api.over) return;
            phase = 'judge'; api.stopTimer(); picked = r;
            var k = q.buttons.indexOf(r);
            if (r === q.r) {
                grid.btns[k].classList.add('dsc-btn--ok'); count++; S.score = count; api.setInfo('答對 ' + count + ' 題'); Sfx.play('ok');
                info.textContent = formula(q); info.classList.add('dsc-info--ok');
                api.after(520, ask); return;
            }
            grid.btns[k].classList.add('dsc-btn--bad'); fail(r);
        }
        /* 結束：寫出算式；選的是互補的折數就特別說明 */
        function fail(r) {
            if (api.over || phase === 'end') return;
            phase = 'end'; api.stopTimer();
            var k = q.buttons.indexOf(q.r); grid.btns[k].classList.add('dsc-btn--ok');
            var why = whyText(q, r);
            info.textContent = why; info.classList.add('dsc-info--bad');
            kit.flash(stage, false, api.my);
            api.fail({ delay: 4200, lines: [why, '特價 ÷ 原價 ＝ 付幾成：' + q.sale + ' ÷ ' + q.orig + ' ＝ ' + (q.sale / q.orig), '打 ' + q.label + '＝付原價的 ' + q.pct + '%（不是減 ' + q.pct + '%）'] });
        }
        /* 驗證用：點正確的按鈕（最多 SOLVE_CAP 題）／點一個錯的；可重複呼叫 */
        api.solve = function () { if (phase !== 'ask' || count >= SOLVE_CAP) return; answer(q.r); };
        api.wrong = function () { if (phase !== 'ask') return; var comp = complementOf(q.r), w = (comp != null && q.buttons.indexOf(comp) >= 0) ? comp : q.buttons.filter(function (b) { return b !== q.r; })[0]; answer(w); };
    }

    var G = {
        id: ID,
        name: '打了幾折',
        rule: '百貨公司吊牌：「原價 800 元，特價 560 元」，**這是打幾折？** 點下面的折數按鈕。**台灣的「7 折」是付原價的 70%**（不是減 30%），所以**7 折和 3 折（付 30%）很容易搞混**——小心！後面會出現 75 折、85 折、95 折、65 折（兩位數的折），原價越來越大、也越來越不整齊。每題限時越來越短（8 → 4 秒）。答錯或超過時間就結束，看你能連續答對幾題。',
        mount: mount,
        score: SCORE,
        test: {
            timeMs: timeMs, maxOrigFor: maxOrigFor, pOddFor: pOddFor, pctOf: pctOf, labelOf: labelOf, poolFor: poolFor, buttonsFor: buttonsFor, complementOf: complementOf, makeQuestion: makeQuestion, formula: formula, whyText: whyText, rating: rating,
            RAMP_Q: RAMP_Q, TIME_S: TIME_S, MAX_ORIG: MAX_ORIG, P_ODD: P_ODD, MIN_ORIG: MIN_ORIG, POOL0: POOL0, STAGES: STAGES, BASE_BTN: BASE_BTN, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
