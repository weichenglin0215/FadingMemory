/* ═══════════════════════════════════════════════════════════════════
   reaction_orderops.js — 秒反應・先乘除（企劃 122）
   出一道四則運算（例如 8 − 3 × 2），下面兩顆按鈕是兩個答案（10 和 2），點出正確的那一個。
   錯的那個答案，是「不管先乘除，由左到右一路算下去」（或「忽略括號」）的結果，專門釣粗心的人。
   關卡制：答錯或來不及就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 難度線性（RAMP_LEVELS 題走到頂）：數字個數 3 → 6 個；數字大小 1～9 → 1～12；
     從第 DIV_FROM 題起出現除法；第 PAREN1_FROM 題起有 1 組括號、第 PAREN2_FROM 題起有 2 組括號。
   · 出題：先隨機排出算式，再用下面的「算式還原器」reduceExpr 照數學規則算一遍：
     所有除法都要除得盡（不出現小數）、每一步都不是負數、答案 0～MAX_ANS；
     錯誤答案也一定是整數、不是負數、而且不等於正確答案（看起來才像真的答案）。
   · 答錯／逾時：把運算順序標出來給你看（① 先算 3 × 2 ＝ 6　② 再算 8 − 6 ＝ 2）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'orderops';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var NUMS = [3, 6];                          /* 算式裡的數字個數：第 1 題 → 到頂 */
    var NUM_MAX = [9, 12];                      /* 數字最大是多少：第 1 題 → 到頂（最小一律 1） */
    var DIV_FROM = 4;                           /* 第幾題起出現除法 */
    var PAREN1_FROM = 8, PAREN2_FROM = 20;      /* 第幾題起有 1 組／2 組括號 */
    var TIME_BASE = 2.2, TIME_PER_NUM = 1.2;    /* 限時（秒）＝ (TIME_BASE ＋ TIME_PER_NUM × (數字個數 − 2)) × 倍率 */
    var TIME_MUL = [1.3, 0.85];                 /* 倍率：第 1 題 → 到頂（越後面越趕） */
    var MAX_ANS = 200;                          /* 正確答案最大多少 */
    var MAX_LEVEL = 60;
    var SAME_MAX = 4;                           /* 正確答案放左邊（或右邊）最多連續幾次 */

    var OP_TEXT = { '+': '+', '-': '−', '*': '×', '/': '÷', '(': '(', ')': ')' };
    var CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function numsFor(level) { return kit.clamp(Math.round(kit.ramp(level, NUMS[0], NUMS[1], RAMP_LEVELS)), NUMS[0], NUMS[1]); }
    function numMaxFor(level) { return Math.round(kit.ramp(level, NUM_MAX[0], NUM_MAX[1], RAMP_LEVELS)); }
    function parensFor(level, nums) {
        var p = level >= PAREN2_FROM ? 2 : (level >= PAREN1_FROM ? 1 : 0);
        if (p === 2 && nums < 5) p = 1;
        if (p === 1 && nums < 4) p = 0;
        return p;
    }
    function ansMs(level) {
        var n = numsFor(level);
        return Math.round((TIME_BASE + TIME_PER_NUM * (n - 2)) * kit.ramp(level, TIME_MUL[0], TIME_MUL[1], RAMP_LEVELS) * 1000);
    }
    /* 算式還原器：tokens 是 [數字, '+'|'-'|'*'|'/', 數字, …, '(' , ')' …] 的陣列。
       mode：'std'＝照數學規則（括號先算、再乘除、最後加減）；'ltr'＝不管先乘除、由左到右一路算（括號還是先算）；
             'noparen'＝照數學規則，但假裝括號不存在。
       回傳 { value 結果, steps 每一步的文字, bad 有除以 0, frac 有除不盡的除法, neg 有算出負數 } */
    function reduceExpr(tokens, mode) {
        var steps = [], bad = false, frac = false, neg = false;
        var arr = tokens.slice();
        if (mode === 'noparen') arr = arr.filter(function (t) { return t !== '(' && t !== ')'; });
        /* a[i] 是運算符號，a[i-1]、a[i+1] 是左右數字：算完換成一個結果 */
        function apply(a, i) {
            var x = a[i - 1], op = a[i], y = a[i + 1], r;
            if (op === '+') r = x + y;
            else if (op === '-') r = x - y;
            else if (op === '*') r = x * y;
            else { if (y === 0) { bad = true; r = 0; } else { r = x / y; if (r !== Math.floor(r)) frac = true; } }
            if (r < 0) neg = true;
            steps.push(x + ' ' + OP_TEXT[op] + ' ' + y + ' ＝ ' + (r === Math.floor(r) ? r : Math.round(r * 10000) / 10000));
            a.splice(i - 1, 3, r);
        }
        function flat(a) {
            a = a.slice();
            if (mode === 'ltr') { while (a.length > 1) apply(a, 1); return a[0]; }
            for (;;) {
                var idx = -1;
                for (var i = 1; i < a.length; i += 2) if (a[i] === '*' || a[i] === '/') { idx = i; break; }
                if (idx < 0) break;
                apply(a, idx);
            }
            while (a.length > 1) apply(a, 1);
            return a[0];
        }
        while (arr.indexOf('(') >= 0) {
            var close = arr.indexOf(')'), open = arr.lastIndexOf('(', close);
            var v = flat(arr.slice(open + 1, close));
            arr.splice(open, close - open + 1, v);
        }
        var value = flat(arr);
        return { value: value, steps: steps, bad: bad, frac: frac, neg: neg };
    }
    /* tokens → 畫面上的字（運算符號換成 × ÷ −，數字與符號之間留空白） */
    function toText(tokens) {
        var parts = tokens.map(function (t) { return typeof t === 'number' ? String(t) : OP_TEXT[t]; });
        var out = '';
        parts.forEach(function (s, i) {
            if (i > 0 && s !== ')' && parts[i - 1] !== '(') out += ' ';     /* 左括號後面、右括號前面不留空白 */
            out += s;
        });
        return out;
    }
    /* 步驟文字 → 「① 3 × 2 ＝ 6　② 8 − 6 ＝ 2」 */
    function stepsText(steps) { return steps.map(function (s, i) { return CIRCLED[i] + ' ' + s; }).join('　'); }
    /* 隨機排一個算式；回傳 tokens 與括號的位置記錄 */
    function randomTokens(level, rand) {
        var n = numsFor(level), mx = numMaxFor(level);
        var nums = [], i;
        for (i = 0; i < n; i++) nums.push(kit.randInt(1, mx, rand));
        var pool = ['+', '-', '*'];
        if (level >= DIV_FROM) pool.push('/');
        var ops = [];
        for (i = 0; i < n - 1; i++) ops.push(kit.pick(pool, rand));
        /* 至少要有一個乘除、一個加減，不然「先乘除」就沒有意義 */
        var mdCount = ops.filter(function (o) { return o === '*' || o === '/'; }).length;
        if (mdCount === 0) ops[kit.randInt(0, n - 2, rand)] = level >= DIV_FROM && rand() < 0.4 ? '/' : '*';
        else if (mdCount === ops.length) ops[kit.randInt(0, n - 2, rand)] = rand() < 0.5 ? '+' : '-';
        /* 括號：隨機挑不重疊的 2～3 個數字包起來（至少 2 個數字、至少 1 個運算符號） */
        var parens = parensFor(level, n), spans = [], t;
        for (t = 0; t < 30 && spans.length < parens; t++) {
            var len = kit.randInt(2, Math.min(3, n - 1), rand), st = kit.randInt(0, n - len, rand);
            if (len >= n) continue;
            if (spans.every(function (s) { return st + len - 1 < s[0] || st > s[1]; })) spans.push([st, st + len - 1]);
        }
        var tokens = [];
        for (i = 0; i < n; i++) {
            spans.forEach(function (s) { if (s[0] === i) tokens.push('('); });
            tokens.push(nums[i]);
            spans.forEach(function (s) { if (s[1] === i) tokens.push(')'); });
            if (i < n - 1) tokens.push(ops[i]);
        }
        return { tokens: tokens, spans: spans.length };
    }
    /* 出一題：{ tokens, text, truth 正確答案, decoy 錯誤答案, decoyKind 'ltr'|'noparen', steps 還原步驟, wrongSteps 錯誤算法的步驟 } */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        for (var tr = 0; tr < 3000; tr++) {
            var q = randomTokens(level, rand), tokens = q.tokens;
            var std = reduceExpr(tokens, 'std');
            if (std.bad || std.frac || std.neg || std.value < 0 || std.value > MAX_ANS) continue;
            var decoys = [];
            ['ltr', 'noparen'].forEach(function (m) {
                if (m === 'noparen' && !q.spans) return;
                var r = reduceExpr(tokens, m);
                if (r.bad || r.neg || r.value !== Math.floor(r.value) || r.value < 0 || r.value > MAX_ANS * 2) return;
                if (r.value === std.value) return;
                decoys.push({ kind: m, value: r.value, steps: r.steps });
            });
            if (!decoys.length) continue;
            var d = kit.pick(decoys, rand);
            return { tokens: tokens, text: toText(tokens), truth: std.value, decoy: d.value, decoyKind: d.kind, steps: std.steps, wrongSteps: d.steps };
        }
        var fb = [8, '-', 3, '*', 2];
        return { tokens: fb, text: toText(fb), truth: 2, decoy: 10, decoyKind: 'ltr', steps: ['3 × 2 ＝ 6', '8 − 6 ＝ 2'], wrongSteps: ['8 − 3 ＝ 5', '5 × 2 ＝ 10'] };
    }
    function nextLeft(hist, rand) {
        rand = rand || Math.random;
        var n = hist.length;
        if (n >= SAME_MAX) {
            var last = hist[n - 1], same = true;
            for (var i = 1; i <= SAME_MAX; i++) if (hist[n - i] !== last) { same = false; break; }
            if (same) return !last;
        }
        return rand() < 0.5;
    }
    function rating(n) {
        if (n >= 40) return '運算順序大師！';
        if (n >= 25) return '眼明手快！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '先乘除、後加減，再來一次！';
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
        var q = makeQuestion(level, api.rand);
        var truthLeft = nextLeft(hist, api.rand);
        hist.push(truthLeft);
        api.info = q;
        console.log('[先乘除] 第 ' + level + ' 題：' + q.text + ' ＝ ？ 正確 ' + q.truth + '，錯誤 ' + q.decoy + '（' + (q.decoyKind === 'ltr' ? '由左到右' : '忽略括號') + '），限時 ' + ansMs(level) + ' ms');

        var eq = h('div', { 'class': 'qz-big ord-eq', text: q.text });
        /* 算式越長，字越小（約略估算：每個字寬 0.62 倍字級），保證一行放得下 */
        var fs = Math.max(30, Math.min(58, Math.floor(430 / (q.text.length * 0.62))));
        eq.style.fontSize = fs + 'px';
        var ask = h('div', { 'class': 'qz-note ord-ask', text: '正確答案是哪一個？' });
        var reveal = h('div', { 'class': 'qz-note ord-reveal' });
        stage.appendChild(eq); stage.appendChild(ask); stage.appendChild(reveal);
        var vals = truthLeft ? [q.truth, q.decoy] : [q.decoy, q.truth];
        var grid = kit.btnGrid(stage, vals.map(function (v) {
            return { text: String(v), kind: 'sky', cls: 'ord-btn', onTap: function () { judge(v); } };
        }), { h: 120 });
        var bTruth = grid.btns[truthLeft ? 0 : 1];
        api.timer(ansMs(level), function () { judge(null); });
        if (level === 1 && kit.once('orderops.hint')) kit.hintOn(stage, bTruth, { mode: 'tap', delay: 500, text: '請點擊按鈕' });

        function judge(v) {
            if (api.over) return;
            var ok = v === q.truth;
            eq.classList.add(ok ? 'qz-ok' : 'qz-bad');
            reveal.textContent = stepsText(q.steps);
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1000 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2400, lines: [
                (v == null ? '時間到！' : '你選了 ' + v) + '，正確答案是 ' + q.truth,
                '運算順序：' + stepsText(q.steps),
                (q.decoyKind === 'ltr' ? '由左到右算會得到 ' : '忽略括號會得到 ') + q.decoy + '（錯）'
            ] });
        }
        api.solve = function () { judge(q.truth); };
        api.wrong = function () { judge(q.decoy); };
    }

    var G = {
        id: ID,
        name: '先乘除',
        rule: '畫面上有一道四則運算，下面兩個答案只有一個是對的。要記得：**括號先算，再算乘除，最後才算加減**。另一個答案，是**「由左到右一路算下去」的陷阱**。答錯或來不及就結束，看你能連續答對幾題。越後面，算式越長、還會有除法和括號！',
        mount: mount,
        score: SCORE,
        test: {
            numsFor: numsFor, numMaxFor: numMaxFor, parensFor: parensFor, ansMs: ansMs, reduceExpr: reduceExpr, toText: toText, stepsText: stepsText,
            randomTokens: randomTokens, makeQuestion: makeQuestion, nextLeft: nextLeft, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, NUMS: NUMS, NUM_MAX: NUM_MAX, DIV_FROM: DIV_FROM, PAREN1_FROM: PAREN1_FROM, PAREN2_FROM: PAREN2_FROM, MAX_ANS: MAX_ANS, MAX_LEVEL: MAX_LEVEL, SAME_MAX: SAME_MAX
        }
    };
    Reaction.register(G);
})();
