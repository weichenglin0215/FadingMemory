/* ═══════════════════════════════════════════════════════════════════
   reaction_mathcheck.js — 秒反應・算式對不對
   畫面上顯示一個算式（17 × 6 ＝ 102），判斷「對」還是「錯」；錯的算式都只差一點點
   （個位差 1、十位個位對調、差 10、差 100）。關卡制，答錯或逾時就結束，成績＝連續答對幾題。
   V1.25：題目會一直顯示（不會消失、也不會變成「？？？」）；答對題目變綠色、答錯變紅色；
   題目的算式是錯的時候，正確的算式用黑色顯示在題目下面；時間超過沒回答，題目下方顯示紅字「超出時間未回答」；
   作答限時是 V1.24 的 1.5 倍。
   V1.27（玩家意見）：每一題的作答限時固定（不再越來越短）；難度慢慢提高；第 15 題起出現負數（減去負數、兩個負數、負數乘法）；
   中高難度（第 10 題起）錯的算式個位數一律跟正解一樣——個位最容易辨識，只改十位、百位或正負號，不能只看個位就答對。
   ───────────────────────────────────────────────────────────────────
   · 題型隨題號解鎖：個位數乘／加 → 兩位數×一位數、兩位數加兩位數 → 兩位數減兩位數（第 9 題）→
     負數：小減大／加負數（第 15 題）→ 減去負數（第 20 題）→ 兩個負數（第 28 題）→ 負數乘法、兩位數×兩位數（第 35 題）；數字範圍也隨題號慢慢變大。
   · 對錯各約一半；同一種結果不連續超過 4 次（nextCorrect）。
   · 作答總限時 ANS_S 固定 6.0 秒（V1.27 起不縮短）；數字範圍 RAMP_LEVELS 題走到頂。
   · 答錯：顯示正確算式與速算拆法（例如 17×6 ＝ 10×6 ＋ 7×6 ＝ 60 ＋ 42 ＝ 102）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'mathcheck';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後數字範圍到頂（範圍從第 1 題慢慢變大） */
    var ANS_S = 6.0;                            /* 作答總限時（秒）：每一題都一樣，不再縮短（V1.27 玩家意見） */
    var MAX_LEVEL = 90;
    var SAME_MAX = 4;                           /* 對（或錯）最多連續幾次 */
    var NEG_FROM = 15;                          /* 第幾題起出現負數 */
    var KEEP_UNIT_FROM = 10;                    /* 第幾題起，錯的算式個位數一律跟正解一樣（個位最容易看出來，不能讓玩家只看個位） */
    var KEEP_UNIT_P_EARLY = 0.5;                /* 在那之前，錯的算式有多少比例也保留個位 */
    var BIG_DIFF_FROM = 25;                     /* 第幾題起，錯的算式也可能差 20 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ansMs() { return Math.round(ANS_S * 1000); }
    /* 數字範圍：第 1 題 a、第 RAMP_LEVELS 題 b，之後維持 */
    function R(level, a, b) { return Math.round(kit.ramp(level, a, b, RAMP_LEVELS)); }
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
    /* 這一題有哪些題型（重複寫的題型＝比較常出現）：慢慢加難，第 NEG_FROM 題起才有負數 */
    function typesFor(level) {
        if (level <= 4) return ['mul1', 'add1'];
        if (level <= 8) return ['mul1', 'mul21', 'add2'];
        if (level <= 14) return ['mul21', 'add2', 'sub2'];
        if (level <= 19) return ['mul21', 'add2', 'sub2', 'negsub', 'addneg'];
        if (level <= 27) return ['mul21', 'add2', 'sub2', 'negsub', 'addneg', 'subneg'];
        if (level <= 34) return ['mul21', 'add2', 'sub2', 'negsub', 'addneg', 'subneg', 'negneg'];
        return ['mul21', 'add2', 'sub2', 'mul22', 'negsub', 'addneg', 'subneg', 'negneg', 'mulneg'];
    }
    /* 數字的顯示：負數用「−」（U+2212）；放在運算符號後面的負數要加括號 */
    function num(x) { return x < 0 ? '−' + (-x) : String(x); }
    function par(x) { return x < 0 ? '(−' + (-x) + ')' : String(x); }
    /* 算出算式：回傳 { a, b, op, lhs, truth, explain, type, neg }（lhs＝等號左邊的字，truth＝正解，neg＝有沒有負數） */
    function makeEquation(type, rand, level) {
        rand = rand || Math.random; level = level || 1;
        var a, b, op, truth, explain, lhs, neg = false, t, o;
        if (type === 'mul1') { a = kit.randInt(3, 9, rand); b = kit.randInt(3, 9, rand); op = '×'; truth = a * b; explain = a + '×' + b + ' ＝ ' + truth; }
        else if (type === 'add1') { a = kit.randInt(4, 9, rand); b = kit.randInt(4, 9, rand); op = '＋'; truth = a + b; explain = a + ' ＋ ' + b + ' ＝ ' + truth; }
        else if (type === 'mul21') {
            a = kit.randInt(12, R(level, 29, 49), rand); b = kit.randInt(3, R(level, 7, 9), rand); op = '×'; truth = a * b;
            t = Math.floor(a / 10) * 10; o = a % 10;
            explain = a + '×' + b + ' ＝ ' + t + '×' + b + ' ＋ ' + o + '×' + b + ' ＝ ' + (t * b) + ' ＋ ' + (o * b) + ' ＝ ' + truth;
        } else if (type === 'add2') { var hi = R(level, 49, 99); a = kit.randInt(16, hi, rand); b = kit.randInt(16, hi, rand); op = '＋'; truth = a + b; explain = a + ' ＋ ' + b + ' ＝ ' + truth; }
        else if (type === 'sub2') {
            a = kit.randInt(40, R(level, 70, 99), rand); b = kit.randInt(12, a - 8, rand); op = '－'; truth = a - b; explain = a + ' － ' + b + ' ＝ ' + truth;
        } else if (type === 'mul22') {
            a = kit.randInt(12, R(level, 29, 39), rand); b = kit.randInt(12, R(level, 24, 29), rand); op = '×'; truth = a * b;
            t = Math.floor(a / 10) * 10; o = a % 10;
            explain = a + '×' + b + ' ＝ ' + t + '×' + b + ' ＋ ' + o + '×' + b + ' ＝ ' + (t * b) + ' ＋ ' + (o * b) + ' ＝ ' + truth;
        } else if (type === 'negsub') {
            /* 小的減大的，答案是負數：17 － 45 ＝ −28 */
            neg = true; a = kit.randInt(10, R(level, 40, 70), rand); b = a + kit.randInt(5, R(level, 20, 45), rand); op = '－'; truth = a - b;
            explain = a + ' － ' + b + ' ＝ −(' + b + ' － ' + a + ') ＝ ' + num(truth);
        } else if (type === 'addneg') {
            /* 加上負數：23 ＋ (−17) ＝ 23 － 17 ＝ 6 */
            neg = true; var hi2 = R(level, 40, 80); a = kit.randInt(12, hi2, rand); b = -kit.randInt(12, hi2, rand); op = '＋'; truth = a + b;
            explain = a + ' ＋ ' + par(b) + ' ＝ ' + a + ' － ' + (-b) + ' ＝ ' + num(truth);
        } else if (type === 'subneg') {
            /* 減去負數（減負等於加正）：23 － (−17) ＝ 23 ＋ 17 ＝ 40 */
            neg = true; var hi3 = R(level, 40, 89); a = kit.randInt(12, hi3, rand); b = -kit.randInt(12, hi3, rand); op = '－'; truth = a - b;
            explain = a + ' － ' + par(b) + ' ＝ ' + a + ' ＋ ' + (-b) + ' ＝ ' + num(truth);
        } else if (type === 'negneg') {
            /* 兩個負數：−23 － 17、−23 ＋ (−17)、(−23) － (−17) */
            neg = true; var hi4 = R(level, 40, 89); a = -kit.randInt(12, hi4, rand); var form = kit.randInt(0, 2, rand), m = kit.randInt(12, hi4, rand);
            if (form === 0) { b = m; op = '－'; truth = a - b; explain = num(a) + ' － ' + b + ' ＝ −(' + (-a) + ' ＋ ' + b + ') ＝ ' + num(truth); }
            else if (form === 1) { b = -m; op = '＋'; truth = a + b; explain = num(a) + ' ＋ ' + par(b) + ' ＝ −(' + (-a) + ' ＋ ' + m + ') ＝ ' + num(truth); }
            else { b = -m; op = '－'; truth = a - b; explain = par(a) + ' － ' + par(b) + ' ＝ ' + num(a) + ' ＋ ' + m + ' ＝ ' + num(truth); }
        } else {
            /* mulneg：(−23) × 4 ＝ −92；(−6) × (−7) ＝ 42（負負得正） */
            neg = true; a = -kit.randInt(6, R(level, 14, 29), rand); b = kit.randInt(3, R(level, 9, 15), rand); op = '×';
            if (rand() < 0.4) b = -b;
            truth = a * b;
            explain = par(a) + ' × ' + par(b) + ' ＝ ' + (truth < 0 ? '−' : '') + '(' + (-a) + '×' + Math.abs(b) + ') ＝ ' + num(truth);
        }
        lhs = (a < 0 && (op === '×' || type === 'negneg' && op === '－' && b < 0) ? par(a) : num(a)) + ' ' + op + ' ' + par(b);
        return { a: a, b: b, op: op, lhs: lhs, truth: truth, explain: explain, type: type, neg: neg };
    }
    /* 「只差一點點」的錯誤答案。keepUnit＝個位數保持跟正解一樣（只改十位、百位、或正負號）：
       差 10（高難度還有差 20）、差 100、十位與百位對調、（有負數的題）正負號顛倒；
       沒有要求保留個位時，還可能個位差 1、十位個位對調。結果不會等於正解；沒有負數的題一定是正數 */
    function wrongOf(truth, rand, o) {
        rand = rand || Math.random; o = o || {};
        var c = [], abs = Math.abs(truth), sgn = truth < 0 ? -1 : 1;
        function add(v, w) { for (var i = 0; i < (w || 1); i++) c.push(v); }
        add(truth + 10, 2); add(truth - 10, 2);
        if (o.big) { add(truth + 20); add(truth - 20); }
        if (abs >= 200) { add(truth + 100); add(truth - 100); }
        if (abs >= 100) {
            var hu = Math.floor(abs / 100) % 10, te = Math.floor(abs / 10) % 10, un = abs % 10, big = Math.floor(abs / 1000) * 1000;
            var swp = sgn * (big + te * 100 + hu * 10 + un);
            if (swp !== truth) add(swp, 3);
        }
        if (o.neg && truth !== 0) add(-truth, 3);
        if (!o.keepUnit) {
            add(truth + 1); add(truth - 1);
            if (abs >= 10) {
                var sw = sgn * (Math.floor(abs / 100) * 100 + (abs % 10) * 10 + Math.floor((abs % 100) / 10));
                if (sw !== truth) add(sw, 2);
            }
        }
        c = c.filter(function (v) {
            if (v === truth || v === 0) return false;
            if (!o.neg) return v > 0;
            return v === -truth || (v < 0) === (truth < 0);          /* 有負數的題：正負號不變，除非是「正負號顛倒」這一種 */
        });
        if (!c.length) c = [truth + 10];
        return kit.pick(c, rand);
    }
    function makeQuestion(level, rand, wantCorrect) {
        rand = rand || Math.random;
        var eq = makeEquation(kit.pick(typesFor(level), rand), rand, level);
        if (wantCorrect == null) wantCorrect = rand() < 0.5;
        eq.isCorrect = wantCorrect;
        var keep = level >= KEEP_UNIT_FROM || rand() < KEEP_UNIT_P_EARLY;
        eq.shown = wantCorrect ? eq.truth : wrongOf(eq.truth, rand, { keepUnit: keep, neg: eq.neg, big: level >= BIG_DIFF_FROM });
        eq.text = eq.lhs + ' ＝ ' + num(eq.shown);
        eq.right = eq.lhs + ' ＝ ' + num(eq.truth);
        return eq;
    }
    /* 算式字太長（有負數、括號）會超出畫面寬度時，把字縮小。每個字的寬度（單位：字級的倍數，實測這個字型）：
       數字與負號「−」0.63、括號 0.42、空格 0.27、全形的 ＋－＝× 約 1.02；每個字之間還有 2px 的字距（letter-spacing） */
    var EQ_FONT = 58, EQ_MAX_W = 452, EQ_SPACING = 2;
    function eqUnits(text) {
        var u = 0;
        for (var i = 0; i < text.length; i++) { var ch = text[i]; u += ch === '(' || ch === ')' ? 0.42 : (ch === ' ' ? 0.27 : (text.charCodeAt(i) > 0x2000 && ch !== '−' ? 1.02 : 0.63)); }
        return u;
    }
    function eqFontPx(text) {
        return Math.max(30, Math.min(EQ_FONT, Math.floor((EQ_MAX_W - EQ_SPACING * text.length) / eqUnits(text))));
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
        console.log('[算式對不對] 第 ' + level + ' 題：' + q.text + '（' + (q.isCorrect ? '對' : '錯，正解 ' + num(q.truth)) + '），限時 ' + ansMs() + ' ms');

        var eq = h('div', { 'class': 'mc-eq', text: q.text });
        var px = eqFontPx(q.text);
        if (px < EQ_FONT && eq.style) eq.style.fontSize = px + 'px';
        var fix = h('div', { 'class': 'mc-fix' });          /* 題目是錯的時候，黑色顯示正確算式 */
        var msg = h('div', { 'class': 'mc-msg' });          /* 時間到：紅字「超出時間未回答」 */
        stage.appendChild(eq); stage.appendChild(fix); stage.appendChild(msg);
        var bYes = h('button', { 'class': 'btn btn--go', text: '對' });
        var bNo = h('button', { 'class': 'btn btn--primary', text: '錯' });
        stage.appendChild(h('div', { 'class': 'rx-btnrow' }, [bNo, bYes]));
        api.timer(ansMs(), function () { judge(null); });

        function judge(sayCorrect) {
            if (api.over) return;
            /* 題目一直留在畫面上；算式是錯的就在下面用黑色顯示正確算式（不管玩家答對答錯） */
            if (!q.isCorrect) fix.textContent = '正確：' + q.right;
            if (sayCorrect === q.isCorrect) {
                eq.classList.add('mc-eq--ok');
                api.pass({ delay: q.isCorrect ? 650 : 1100 });
            } else {
                eq.classList.add('mc-eq--bad');
                if (sayCorrect == null) msg.textContent = '超出時間未回答';
                api.fail({ delay: 2000, lines: [
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
        rule: '畫面上有一個算式，**判斷這個算式是「對」還是「錯」**，錯的算式都只差一點點（差 10、十位個位對調、正負號顛倒…）。**第 15 題起會出現負數**，小心「減去負數」和兩個負數！答對題目變綠色、答錯變紅色，**錯的算式會把正確答案用黑字寫在下面**。答錯或來不及就結束，看你能連續答對幾題。每題限時一樣。',
        mount: mount,
        score: SCORE,
        test: { eqUnits: eqUnits, EQ_SPACING: EQ_SPACING, EQ_MAX_W: EQ_MAX_W, eqFontPx: eqFontPx, EQ_FONT: EQ_FONT, num: num, NEG_FROM: NEG_FROM, KEEP_UNIT_FROM: KEEP_UNIT_FROM, BIG_DIFF_FROM: BIG_DIFF_FROM, ansMs: ansMs, nextCorrect: nextCorrect, typesFor: typesFor, makeEquation: makeEquation, wrongOf: wrongOf, makeQuestion: makeQuestion, rating: rating, RAMP_LEVELS: RAMP_LEVELS, ANS_S: ANS_S, SAME_MAX: SAME_MAX, MAX_LEVEL: MAX_LEVEL }
    };
    Reaction.register(G);
})();
