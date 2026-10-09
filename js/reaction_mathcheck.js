/* ═══════════════════════════════════════════════════════════════════
   reaction_mathcheck.js — 秒反應・算式對不對
   算式閃現一下（17 × 6 ＝ 102），判斷「對」還是「錯」；錯的算式都只差一點點
   （個位差 1、十位個位對調、差 10、差 100）。關卡制，答錯或逾時就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 題型隨題號解鎖：個位數乘／加 → 兩位數×一位數、兩位數加兩位數 → 加入兩位數減兩位數 →
     加入兩位數×兩位數。
   · 對錯各約一半；同一種結果不連續超過 4 次（nextCorrect）。
   · 全部線性（RAMP_LEVELS 題走到頂）：算式顯示時間 SHOW_S 2.0→0.6 秒、作答總限時 ANS_S 4.0→2.0 秒。
   · 答錯：顯示正確算式與速算拆法（例如 17×6 ＝ 10×6 ＋ 7×6 ＝ 60 ＋ 42 ＝ 102）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'mathcheck';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var SHOW_S = [2.0, 0.6];                    /* 算式顯示秒數：第 1 題 → 到頂 */
    var ANS_S = [4.0, 2.0];                     /* 作答總限時（從算式出現開始算）：第 1 題 → 到頂 */
    var MAX_LEVEL = 60;
    var SAME_MAX = 4;                           /* 對（或錯）最多連續幾次 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function showMs(level) { return Math.round(kit.ramp(level, SHOW_S[0], SHOW_S[1], RAMP_LEVELS) * 1000); }
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    /* 這一題要不要「對」：一半一半，連續太多次就換邊 */
    function nextCorrect(hist, rand) {
        rand = rand || Math.random;
        var n = hist.length;
        if (n >= SAME_MAX) {
            var last = hist[n - 1], same = true;
            for (var i = 1; i <= SAME_MAX; i++) if (hist[n - i] !== last) { same = false; break; }
            if (same) return !last;
        }
        return rand() < 0.5;
    }
    /* 這一題有哪些題型 */
    function typesFor(level) {
        if (level <= 5) return ['mul1', 'add1'];
        if (level <= 15) return ['mul21', 'add2'];
        if (level <= 24) return ['mul21', 'add2', 'sub2'];
        return ['mul21', 'add2', 'sub2', 'mul22'];
    }
    /* 算出算式：回傳 { a, b, op, truth, explain } */
    function makeEquation(type, rand) {
        var a, b, op, truth, explain;
        if (type === 'mul1') { a = kit.randInt(3, 9, rand); b = kit.randInt(3, 9, rand); op = '×'; truth = a * b; explain = a + '×' + b + ' ＝ ' + truth; }
        else if (type === 'add1') { a = kit.randInt(4, 9, rand); b = kit.randInt(4, 9, rand); op = '＋'; truth = a + b; explain = a + ' ＋ ' + b + ' ＝ ' + truth; }
        else if (type === 'mul21') {
            a = kit.randInt(12, 49, rand); b = kit.randInt(3, 9, rand); op = '×'; truth = a * b;
            var t = Math.floor(a / 10) * 10, o = a % 10;
            explain = a + '×' + b + ' ＝ ' + t + '×' + b + ' ＋ ' + o + '×' + b + ' ＝ ' + (t * b) + ' ＋ ' + (o * b) + ' ＝ ' + truth;
        } else if (type === 'add2') { a = kit.randInt(16, 79, rand); b = kit.randInt(16, 79, rand); op = '＋'; truth = a + b; explain = a + ' ＋ ' + b + ' ＝ ' + truth; }
        else if (type === 'sub2') {
            a = kit.randInt(40, 99, rand); b = kit.randInt(12, a - 8, rand); op = '－'; truth = a - b; explain = a + ' － ' + b + ' ＝ ' + truth;
        } else {
            a = kit.randInt(12, 39, rand); b = kit.randInt(12, 29, rand); op = '×'; truth = a * b;
            var t2 = Math.floor(a / 10) * 10, o2 = a % 10;
            explain = a + '×' + b + ' ＝ ' + t2 + '×' + b + ' ＋ ' + o2 + '×' + b + ' ＝ ' + (t2 * b) + ' ＋ ' + (o2 * b) + ' ＝ ' + truth;
        }
        return { a: a, b: b, op: op, truth: truth, explain: explain, type: type };
    }
    /* 「只差一點點」的錯誤答案：個位差 1、十位個位對調、差 10、差 100（結果一定是正數、不等於正解） */
    function wrongOf(truth, rand) {
        rand = rand || Math.random;
        var c = [truth + 1, truth - 1, truth + 10, truth - 10];
        if (truth >= 200) c.push(truth + 100, truth - 100);
        if (truth >= 10) {
            var sw = Math.floor(truth / 100) * 100 + (truth % 10) * 10 + Math.floor((truth % 100) / 10);
            if (sw !== truth) c.push(sw, sw);                 /* 對調的權重放大一點 */
        }
        c = c.filter(function (v) { return v > 0 && v !== truth; });
        return kit.pick(c, rand);
    }
    function makeQuestion(level, rand, wantCorrect) {
        rand = rand || Math.random;
        var eq = makeEquation(kit.pick(typesFor(level), rand), rand);
        if (wantCorrect == null) wantCorrect = rand() < 0.5;
        eq.isCorrect = wantCorrect;
        eq.shown = wantCorrect ? eq.truth : wrongOf(eq.truth, rand);
        eq.text = eq.a + ' ' + eq.op + ' ' + eq.b + ' ＝ ' + eq.shown;
        eq.right = eq.a + ' ' + eq.op + ' ' + eq.b + ' ＝ ' + eq.truth;
        return eq;
    }
    function rating(n) {
        if (n >= 40) return '心算怪物！';
        if (n >= 25) return '高手！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '先熟悉一下，再來一次！';
    }

    function mount(root, ctx) {
        var hist = [];
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8,
            head: function (lv) { return '第 ' + lv + ' 題'; },
            numText: function (v) { return v + ' 題'; },
            rating: rating,
            lines: function (S) { return ['連續答對 ' + S.cleared + ' 題']; },
            setup: function (api) { if (api.level === 1) hist.length = 0; setup(api, hist); }
        });
    }

    function setup(api, hist) {
        var stage = api.stage, level = api.level;
        var want = nextCorrect(hist, api.rand);
        var q = makeQuestion(level, api.rand, want);
        hist.push(want);
        api.info = q;
        console.log('[算式對不對] 第 ' + level + ' 題：' + q.text + '（' + (q.isCorrect ? '對' : '錯，正解 ' + q.truth) + '），顯示 ' + showMs(level) + ' ms，限時 ' + ansMs(level) + ' ms');

        var eq = h('div', { 'class': 'mc-eq', text: q.text });
        stage.appendChild(eq);
        var bYes = h('button', { 'class': 'btn btn--go', text: '對' });
        var bNo = h('button', { 'class': 'btn btn--primary', text: '錯' });
        stage.appendChild(h('div', { 'class': 'rx-btnrow' }, [bNo, bYes]));
        api.after(showMs(level), function () { if (api.over) return; eq.textContent = '？？？'; eq.classList.add('mc-eq--hide'); });
        api.timer(ansMs(level), function () { judge(null); });

        function judge(sayCorrect) {
            if (api.over) return;
            if (sayCorrect === q.isCorrect) {
                eq.textContent = q.right; eq.classList.remove('mc-eq--hide'); eq.classList.add('mc-eq--ok');
                api.pass({ delay: 650 });
            } else {
                eq.textContent = q.right; eq.classList.remove('mc-eq--hide'); eq.classList.add('mc-eq--bad');
                api.fail({ delay: 1700, lines: [
                    (sayCorrect == null ? '時間到！' : (q.isCorrect ? '這個算式是對的' : '這個算式是錯的')) + '：' + q.text,
                    '正確算式：' + q.right,
                    '速算拆法：' + q.explain
                ] });
            }
        }
        kit.onTap(bYes, function () { judge(true); });
        kit.onTap(bNo, function () { judge(false); });
        api.solve = function () { judge(q.isCorrect); };
        api.wrong = function () { judge(!q.isCorrect); };
    }

    var G = {
        id: ID,
        name: '算式對不對',
        rule: '算式只會閃一下。判斷這個算式是「對」還是「錯」，錯的算式都只差一點點（個位差 1、十位個位對調、差 10…）。答錯或來不及就結束，看你能連續答對幾題。越後面，算式顯示的時間越短！',
        mount: mount,
        score: SCORE,
        test: { showMs: showMs, ansMs: ansMs, nextCorrect: nextCorrect, typesFor: typesFor, makeEquation: makeEquation, wrongOf: wrongOf, makeQuestion: makeQuestion, rating: rating, RAMP_LEVELS: RAMP_LEVELS, SHOW_S: SHOW_S, ANS_S: ANS_S, SAME_MAX: SAME_MAX, MAX_LEVEL: MAX_LEVEL }
    };
    Reaction.register(G);
})();
