/* ═══════════════════════════════════════════════════════════════════
   reaction_wrongline.js — 秒反應・哪一行算錯（企劃 130）
   一份「計算過程」有好幾行（例如  25 × 3 ＝ 75／18 × 2 ＝ 36／75 ＋ 36 ＝ 111），其中「有一行算錯」，
   點出算錯的那一行。不是只看最後答案，而是檢查每一行的過程。
   關卡制：點錯行或來不及就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 兩種計算過程：
       run  連續計算（48 ＋ 27 ＝ 75、75 − 18 ＝ 57、57 × 3 ＝ 171…），每一行的第一個數字是上一行的結果；
       shop 買東西結帳（單價 × 數量、兩項相加、付錢找零），上方有一行說明。
   · 出題（規範 Q1：先決定結果、再反推畫面）：先算出每一行「正確的結果」，再挑一行把結果寫錯；
     「寫錯的結果」會被後面的行照單全收（接著算下去），所以後面的行「自己」都是對的，
     全部行裡只有一行寫錯，答案唯一（測試會逐題檢查）。
   · 難度線性（RAMP_LEVELS 題走到頂）：行數 3 → 6 行；寫錯的幅度從「差 10、差 100」（很明顯）
     變成「差 1、十位個位對調」（很細）；限時＝(基本秒數＋每行秒數×行數)×倍率。
   · 答錯／逾時：算錯的那一行用紅字寫出正確結果。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'wrongline';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var LINES = [3, 6];                         /* 計算過程有幾行：第 1 題 → 到頂 */
    var TIME_BASE = 3.0, TIME_PER_LINE = 1.4;   /* 限時（秒）＝ (TIME_BASE ＋ TIME_PER_LINE × 行數) × 倍率 */
    var TIME_MUL = [1.3, 0.85];                 /* 倍率：第 1 題 → 到頂 */
    var MAX_LEVEL = 60;
    var SHOP_P = 0.5;                           /* 出「買東西」題型的機率（其他是連續計算） */
    var ITEMS = [['飲料', '瓶'], ['麵包', '個'], ['便當', '個'], ['水果', '盒'], ['牛奶', '瓶'], ['雞蛋', '盒']];
    var MUL = '×', ADD = '＋', SUB = '−';

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function linesFor(level) { return kit.clamp(Math.round(kit.ramp(level, LINES[0], LINES[1], RAMP_LEVELS)), LINES[0], LINES[1]); }
    function ansMs(level) { return Math.round((TIME_BASE + TIME_PER_LINE * linesFor(level)) * kit.ramp(level, TIME_MUL[0], TIME_MUL[1], RAMP_LEVELS) * 1000); }
    function apply(op, x, y) { return op === ADD ? x + y : (op === SUB ? x - y : x * y); }
    /* 把結果寫錯：回傳一個「看起來合理的錯誤結果」（正整數、位數不變、不等於正確結果）。hard＝0（很明顯）～1（很細） */
    function wrongOf(truth, hard, rand) {
        rand = rand || Math.random;
        var c = [];
        function add(v, w) { if (v > 0 && v !== truth && String(v).length === String(truth).length) c.push({ v: v, w: w }); }
        add(truth + 10, (1 - hard) * 3 + 1); add(truth - 10, (1 - hard) * 3 + 1);
        if (truth >= 200) { add(truth + 100, (1 - hard) * 2 + 0.3); add(truth - 100, (1 - hard) * 2 + 0.3); }
        add(truth + 1, 0.5 + 2 * hard); add(truth - 1, 0.5 + 2 * hard);
        if (truth >= 10) {                                         /* 十位個位對調（只換最後兩位） */
            var t = truth % 100, ti = Math.floor(t / 10), u = t % 10;
            if (ti !== u) add(truth - t + u * 10 + ti, 1 + 2 * hard);
        }
        var total = c.reduce(function (a, x) { return a + x.w; }, 0), x = rand() * total;
        for (var i = 0; i < c.length; i++) { x -= c[i].w; if (x <= 0) return c[i].v; }
        return c.length ? c[c.length - 1].v : truth + 10;
    }
    /* 依「步驟表」算出每一行：steps 的每一項是 { op, x, y }，x／y 若是 { ref: i } 就是第 i 行（從 0 起算）的「寫出來的結果」。
       wrongIdx 那一行把結果寫錯（用 wrongVal），其餘行都照寫出來的數字正確計算。回傳每一行 { x, op, y, shown, truth, ok } */
    function evalSteps(steps, wrongIdx, wrongVal) {
        var shown = [], out = [];
        steps.forEach(function (st, i) {
            var x = typeof st.x === 'object' ? shown[st.x.ref] : st.x, y = typeof st.y === 'object' ? shown[st.y.ref] : st.y;
            var truth = apply(st.op, x, y);
            var s = i === wrongIdx ? wrongVal : truth;
            shown.push(s);
            out.push({ x: x, op: st.op, y: y, shown: s, truth: truth, ok: s === truth, text: x + ' ' + st.op + ' ' + y + ' ＝ ' + s, right: x + ' ' + st.op + ' ' + y + ' ＝ ' + truth });
        });
        return out;
    }
    /* 「連續計算」的步驟表：n 行，起始數字、每一步的運算符號與第二個數字都要讓結果保持在 1～999 的正整數 */
    function runSteps(n, rand) {
        for (var tr = 0; tr < 200; tr++) {
            var cur = kit.randInt(20, 99, rand), steps = [], good = true;
            for (var i = 0; i < n && good; i++) {
                var op = kit.pick([ADD, ADD, SUB, SUB, MUL], rand), y, r;
                if (op === ADD) { y = kit.randInt(11, 99, rand); r = cur + y; }
                else if (op === SUB) { if (cur < 14) { good = false; break; } y = kit.randInt(11, Math.max(11, cur - 3), rand); r = cur - y; }
                else { y = kit.randInt(2, 9, rand); r = cur * y; }
                if (r < 10 || r > 999) { good = false; break; }
                steps.push({ op: op, x: i === 0 ? cur : { ref: i - 1 }, y: y });
                cur = r;
            }
            if (good && steps.length === n) return steps;
        }
        return [{ op: ADD, x: 48, y: 27 }, { op: SUB, x: { ref: 0 }, y: 18 }, { op: MUL, x: { ref: 1 }, y: 3 }].slice(0, n);
    }
    /* 「買東西」的步驟表與說明文字：n＝3 行（兩項相乘＋相加）、4 行（再付錢找零）、5 行（三項）、6 行（三項＋找零） */
    function shopSteps(n, rand) {
        var items = kit.sample(ITEMS, 3, rand), k = (n >= 5) ? 3 : 2, steps = [], head = [];
        var priceMax = 60;
        var counts = [], prices = [];
        for (var i = 0; i < k; i++) { counts.push(kit.randInt(2, 6, rand)); prices.push(kit.randInt(12, priceMax, rand)); }
        steps.push({ op: MUL, x: prices[0], y: counts[0] });
        steps.push({ op: MUL, x: prices[1], y: counts[1] });
        steps.push({ op: ADD, x: { ref: 0 }, y: { ref: 1 } });
        var last = 2;
        if (k === 3) { steps.push({ op: MUL, x: prices[2], y: counts[2] }); steps.push({ op: ADD, x: { ref: last }, y: { ref: 3 } }); last = 4; }
        var total = steps.length ? null : 0;
        for (i = 0; i < k; i++) head.push(items[i][0] + ' ' + prices[i] + ' 元 × ' + counts[i] + ' ' + items[i][1]);
        if (n === 4 || n === 6) {
            var sum = prices.reduce(function (a, p, j) { return a + p * counts[j]; }, 0);
            var pay = Math.ceil((sum + 1) / 100) * 100;
            steps.push({ op: SUB, x: pay, y: { ref: last } });
            head.push('付 ' + pay + ' 元');
        }
        return { steps: steps, head: head.join('　') };
    }
    /* 出一題：{ type, head 說明文字（run 沒有）, lines 每一行, wrong 算錯的是第幾行（從 0 起算） } */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        var n = linesFor(level), hard = kit.ramp(level, 0, 1, RAMP_LEVELS);
        for (var tr = 0; tr < 200; tr++) {
            var type = rand() < SHOP_P ? 'shop' : 'run', steps, head = '';
            if (type === 'shop') { var sp = shopSteps(n, rand); steps = sp.steps; head = sp.head; }
            else steps = runSteps(n, rand);
            if (steps.length !== n) continue;
            var base = evalSteps(steps, -1, 0);
            if (base.some(function (l) { return l.truth <= 0 || l.truth > 9999 || !Number.isInteger(l.truth); })) continue;
            var wrong = kit.randInt(0, n - 1, rand);
            var wv = wrongOf(base[wrong].truth, hard, rand);
            if (wv === base[wrong].truth) continue;
            var lines = evalSteps(steps, wrong, wv);
            if (lines.some(function (l, i) { return l.shown <= 0 || l.shown > 9999 || (i !== wrong && !l.ok); })) continue;
            return { type: type, head: head, lines: lines, wrong: wrong };
        }
        var fb = evalSteps([{ op: MUL, x: 25, y: 3 }, { op: MUL, x: 18, y: 2 }, { op: ADD, x: { ref: 0 }, y: { ref: 1 } }], 1, 38);
        return { type: 'shop', head: '飲料 25 元 × 3 瓶　麵包 18 元 × 2 個', lines: fb, wrong: 1 };
    }
    function rating(n) {
        if (n >= 40) return '火眼金睛！';
        if (n >= 25) return '檢查很仔細！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '一行一行檢查，再來一次！';
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

    var CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'];
    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeQuestion(level, api.rand);
        api.info = q;
        console.log('[哪一行算錯] 第 ' + level + ' 題（' + q.type + '）：' + q.lines.map(function (l, i) { return CIRCLED[i] + ' ' + l.text + (l.ok ? '' : '（錯，應為 ' + l.truth + '）'); }).join('；') + '，限時 ' + ansMs(level) + ' ms');

        /* 上面一欄由上往下排：說明文字（買東西才有，可能兩行）→「哪一行算錯了？」→ 每一行的按鈕；排在同一個直欄裡，不會互相蓋住 */
        var col = h('div', { 'class': 'wln-col' });
        var ask = h('div', { 'class': 'qz-note wln-ask', text: q.head ? q.head : '連續計算，哪一行算錯了？' });
        col.appendChild(ask);
        if (q.head) col.appendChild(h('div', { 'class': 'wln-sub', text: '哪一行算錯了？' }));
        var list = h('div', { 'class': 'wln-list' });
        var rowH = q.lines.length >= 5 ? 74 : 84;
        var rows = q.lines.map(function (l, i) {
            var r = h('button', { 'class': 'wln-row', html: '<span class="wln-no">' + CIRCLED[i] + '</span><span class="wln-txt">' + l.text + '</span>' });
            r.style.height = rowH + 'px';
            kit.onTap(r, function () { judge(i); });
            list.appendChild(r);
            return r;
        });
        col.appendChild(list);
        stage.appendChild(col);
        api.timer(ansMs(level), function () { judge(null); });
        if (level === 1 && kit.once('wrongline.hint')) kit.hintOn(stage, rows[q.wrong], { mode: 'tap', delay: 500, text: '請點擊算錯的那一行' });

        function judge(i) {
            if (api.over) return;
            var ok = i === q.wrong;
            var wl = rows[q.wrong];
            wl.classList.add('wln-row--wrong');
            wl.querySelector('.wln-txt').innerHTML = q.lines[q.wrong].text + '<br><span class="wln-fix">應該是 ' + q.lines[q.wrong].right + '</span>';
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1200 }); return; }
            if (i != null) rows[i].classList.add('wln-row--miss');
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2500, lines: [
                (i == null ? '時間到！' : '那一行是對的') + '，算錯的是第 ' + (q.wrong + 1) + ' 行',
                q.lines[q.wrong].text + ' → 應該是 ' + q.lines[q.wrong].right
            ] });
        }
        api.solve = function () { judge(q.wrong); };
        api.wrong = function () { judge((q.wrong + 1) % q.lines.length); };
    }

    var G = {
        id: ID,
        name: '哪一行算錯',
        rule: '一份計算過程有好幾行，其中「有一行算錯」，點出算錯的那一行。算錯的結果，後面幾行會接著用下去，所以要一行一行檢查。點錯或來不及就結束，看你能連續答對幾題。越後面，行數越多、錯得越細！',
        mount: mount,
        score: SCORE,
        test: {
            linesFor: linesFor, ansMs: ansMs, apply: apply, wrongOf: wrongOf, evalSteps: evalSteps, runSteps: runSteps, shopSteps: shopSteps, makeQuestion: makeQuestion, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, LINES: LINES, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
