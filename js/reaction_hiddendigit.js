/* ═══════════════════════════════════════════════════════════════════
   reaction_hiddendigit.js — 秒反應・遮住的數字（企劃 126「個位數快算」的改版）
   上方是一道計算式（例如 37 × 43），中間的「答案區」顯示答案，但故意遮住其中一個數字（1 ？ 9 1），
   最下面是 0～9 十顆數字按鈕，猜被遮住的是哪一個數字。關卡制：答錯或來不及就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 看得到其他位數，所以有多種解法：整題硬算、只算被遮住那一位、或用「各位數字加起來除以 9」驗算（九去法）。
   · 題型隨題號解鎖：兩位數加法 → 加兩位數減法 → 加三位數加法 → 加「兩位數×一位數」→ 加「兩位數×兩位數」→
     加「三位數×一位數」。越後面越常遮住最前面或中間的位數（前期大多遮住個位數，最好算）。
   · 難度線性（RAMP_LEVELS 題走到頂）：作答限時＝各題型的基本秒數 × 倍率（1.3 → 0.8）。
   · 答錯／逾時：算式完整揭曉（例如 37 × 43 ＝ 1591），被遮住的位數標出來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'hiddendigit';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var MAX_LEVEL = 60;
    var TIME_MUL = [1.3, 0.8];                  /* 限時倍率：第 1 題 → 到頂 */
    /* 各題型：from＝第幾題起出現；sec＝基本限時（秒）；a／b＝兩個數字的範圍 */
    var TYPES = {
        add2: { from: 1, sec: 6, op: '+', a: [11, 89], b: [11, 89] },
        sub2: { from: 5, sec: 6, op: '−', a: [40, 99], b: [11, 60] },
        add3: { from: 10, sec: 8, op: '+', a: [101, 899], b: [101, 899] },
        mul1: { from: 6, sec: 9, op: '×', a: [12, 99], b: [3, 9] },
        mul2: { from: 14, sec: 14, op: '×', a: [12, 49], b: [12, 29] },
        mul31: { from: 22, sec: 12, op: '×', a: [101, 499], b: [3, 9] }
    };
    var LAST_W = [3, 1];                        /* 「個位數被遮住」的權重：第 1 題 → 到頂（其他位數權重一律 1） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function typesFor(level) {
        return Object.keys(TYPES).filter(function (k) { return level >= TYPES[k].from; });
    }
    function ansMs(level, type) {
        return Math.round(TYPES[type].sec * kit.ramp(level, TIME_MUL[0], TIME_MUL[1], RAMP_LEVELS) * 1000);
    }
    /* 算式的值 */
    function calc(type, a, b) {
        var op = TYPES[type].op;
        return op === '+' ? a + b : (op === '−' ? a - b : a * b);
    }
    /* 挑要遮住第幾位（0＝最左邊）：個位數（最後一位）權重隨題號從 LAST_W[0] 降到 LAST_W[1]，其他位數權重 1 */
    function pickHidden(len, level, rand) {
        var wLast = kit.ramp(level, LAST_W[0], LAST_W[1], RAMP_LEVELS);
        var ws = [], total = 0, i;
        for (i = 0; i < len; i++) { var w = i === len - 1 ? wLast : 1; ws.push(w); total += w; }
        var x = (rand || Math.random)() * total;
        for (i = 0; i < len; i++) { x -= ws[i]; if (x <= 0) return i; }
        return len - 1;
    }
    /* 出一題：{ type, a, b, op, result, digits（答案的每一位）, hidden（第幾位被遮住）, answer（被遮住的數字）, text 算式文字, full 完整算式 } */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        var type = kit.pick(typesFor(level), rand);
        /* 新解鎖的題型多出現一點：最新解鎖的那一種權重加倍 */
        var types = typesFor(level);
        var newest = types.slice().sort(function (x, y) { return TYPES[y].from - TYPES[x].from; })[0];
        if (rand() < 0.3) type = newest;
        var t = TYPES[type];
        for (var tr = 0; tr < 300; tr++) {
            var a = kit.randInt(t.a[0], t.a[1], rand), b = kit.randInt(t.b[0], t.b[1], rand);
            if (type === 'sub2' && b >= a - 5) continue;
            var result = calc(type, a, b);
            if (result < 10) continue;
            var digits = String(result).split('').map(Number);
            var hidden = pickHidden(digits.length, level, rand);
            return { type: type, a: a, b: b, op: t.op, result: result, digits: digits, hidden: hidden, answer: digits[hidden], text: a + ' ' + t.op + ' ' + b, full: a + ' ' + t.op + ' ' + b + ' ＝ ' + result };
        }
        return { type: 'add2', a: 37, b: 45, op: '+', result: 82, digits: [8, 2], hidden: 1, answer: 2, text: '37 + 45', full: '37 + 45 ＝ 82' };
    }
    function rating(n) {
        if (n >= 40) return '心算怪物！';
        if (n >= 25) return '高手！';
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
        console.log('[遮住的數字] 第 ' + level + ' 題：' + q.full + '，遮住第 ' + (q.hidden + 1) + ' 位（答案 ' + q.answer + '），限時 ' + ansMs(level, q.type) + ' ms');

        var eq = h('div', { 'class': 'qz-big hdg-eq', text: q.text });
        var ansRow = h('div', { 'class': 'hdg-ans' });
        var boxes = q.digits.map(function (d, i) {
            var b = h('div', { 'class': 'hdg-box' + (i === q.hidden ? ' hdg-box--hide' : ''), text: i === q.hidden ? '？' : String(d) });
            ansRow.appendChild(b);
            return b;
        });
        ansRow.insertBefore(h('div', { 'class': 'hdg-eqsign', text: '＝' }), ansRow.firstChild);
        var ask = h('div', { 'class': 'qz-note hdg-ask', text: '被遮住的是哪一個數字？' });
        stage.appendChild(eq); stage.appendChild(ansRow); stage.appendChild(ask);
        var items = [];
        for (var d = 0; d <= 9; d++) (function (d) { items.push({ text: String(d), kind: 'sky', cls: 'hdg-btn', onTap: function () { judge(d); } }); })(d);
        var grid = kit.btnGrid(stage, items, { cols: 5, h: 84, gap: 10 });
        api.timer(ansMs(level, q.type), function () { judge(null); });
        if (level === 1 && kit.once('hiddendigit.hint')) kit.hintOn(stage, grid.btns[q.answer], { mode: 'tap', delay: 500, text: '請點擊數字' });

        function judge(v) {
            if (api.over) return;
            var ok = v === q.answer;
            boxes[q.hidden].textContent = String(q.answer);
            boxes[q.hidden].classList.remove('hdg-box--hide');
            boxes[q.hidden].classList.add(ok ? 'hdg-box--ok' : 'hdg-box--bad');
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 900 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2200, lines: [
                (v == null ? '時間到！' : '你選了 ' + v) + '，被遮住的是 ' + q.answer,
                q.full
            ] });
        }
        api.solve = function () { judge(q.answer); };
        api.wrong = function () { judge((q.answer + 1) % 10); };
    }

    var G = {
        id: ID,
        name: '遮住的數字',
        rule: '上面是一道計算式，中間顯示答案，但故意遮住其中一個數字。算一算，點出下面 0～9 裡被遮住的是哪一個數字。答錯或來不及就結束，看你能連續答對幾題。越後面，算式越難、限時越短！',
        mount: mount,
        score: SCORE,
        test: {
            typesFor: typesFor, ansMs: ansMs, calc: calc, pickHidden: pickHidden, makeQuestion: makeQuestion, rating: rating,
            TYPES: TYPES, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, TIME_MUL: TIME_MUL, LAST_W: LAST_W
        }
    };
    Reaction.register(G);
})();
