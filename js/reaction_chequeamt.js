/* ═══════════════════════════════════════════════════════════════════
   reaction_chequeamt.js — 秒反應・支票金額（企劃 198）
   一張支票上，小寫金額（阿拉伯數字，例如 4,308）和大寫金額（肆仟參佰零捌元整）要一模一樣，
   判斷兩者「相符」還是「不符」。不符的地方都很小：少寫一個零、仟與佰互換、兩個數字對調…
   關卡制：答錯或來不及就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 大寫金額由程式照台灣支票的寫法產生（upper()）：壹貳參肆伍陸柒捌玖、拾佰仟萬、中間連續的 0 只寫一個「零」、
     最後加「元整」。測試會用 fromUpper() 反過來讀回數字，檢查 5 萬個金額都能「來回」。
   · 「不符」的題目＝大寫那一行改寫成「另一個很接近的金額」的正確大寫（所以大寫本身的寫法永遠是合法的，
     只是跟小寫的數字對不起來），這樣玩家不能靠「大寫寫法怪怪的」來猜。
   · 難度線性（RAMP_LEVELS 題走到頂）：金額位數 4 → 8 位；金額中間有 0 的機率 30% → 70%（要判斷「零」的寫法）；
     「不符」從「差一個零、位數差很多」變成「兩位數字對調、末位差 1」；限時＝(基本秒數＋每位秒數×位數)×倍率。
   · 答錯／逾時：把「正確的大寫」與「支票上寫的」並排，不一樣的地方用橘紅色標出來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'chequeamt';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var DIGITS = [4, 8];                        /* 金額有幾位數：第 1 題 → 到頂 */
    var ZERO_P = [0.3, 0.7];                    /* 金額中間（不是最前面）至少有一個 0 的機率：第 1 題 → 到頂 */
    var TIME_BASE = 4.5, TIME_PER_DIGIT = 0.8;  /* 限時（秒）＝ (TIME_BASE ＋ TIME_PER_DIGIT × 位數) × 倍率 */
    var TIME_MUL = [1.3, 0.8];                  /* 倍率：第 1 題 → 到頂 */
    var MAX_LEVEL = 60;
    var SAME_MAX = 4;                           /* 「相符」（或「不符」）最多連續幾次 */
    var DIG = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
    var UNIT = ['仟', '佰', '拾', ''];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function digitsFor(level) { return kit.clamp(Math.round(kit.ramp(level, DIGITS[0], DIGITS[1], RAMP_LEVELS)), DIGITS[0], DIGITS[1]); }
    function ansMs(level) { return Math.round((TIME_BASE + TIME_PER_DIGIT * digitsFor(level)) * kit.ramp(level, TIME_MUL[0], TIME_MUL[1], RAMP_LEVELS) * 1000); }
    /* 0～9999 的大寫寫法（沒有「元整」）：前面的 0 不寫，中間連續的 0 只寫一個「零」，結尾的 0 不寫 */
    function section(n) {
        var d = [Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
        var out = '', zero = false;
        for (var i = 0; i < 4; i++) {
            if (d[i] === 0) { if (out) zero = true; }
            else { if (zero) { out += '零'; zero = false; } out += DIG[d[i]] + UNIT[i]; }
        }
        return out;
    }
    /* 金額 n（1～99,999,999）的大寫：肆仟參佰零捌元整 */
    function upper(n) {
        var hi = Math.floor(n / 10000), lo = n % 10000, s = '';
        if (hi > 0) { s += section(hi) + '萬'; if (lo > 0 && lo < 1000) s += '零'; }
        if (lo > 0) s += section(lo);
        return s + '元整';
    }
    /* 反過來讀：大寫 → 數字（測試用，確認 upper() 寫得對） */
    function fromUpper(str) {
        var s = String(str).replace('元整', '');
        function sec(t) {
            var total = 0, cur = 0;
            for (var i = 0; i < t.length; i++) {
                var ch = t[i], di = DIG.indexOf(ch);
                if (ch === '零') continue;
                if (di > 0) cur = di;
                else if (ch === '仟') { total += cur * 1000; cur = 0; }
                else if (ch === '佰') { total += cur * 100; cur = 0; }
                else if (ch === '拾') { total += cur * 10; cur = 0; }
            }
            return total + cur;
        }
        var p = s.indexOf('萬');
        if (p < 0) return sec(s);
        return sec(s.slice(0, p)) * 10000 + sec(s.slice(p + 1));
    }
    /* 千分位：4308 → '4,308' */
    function withCommas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    /* 隨機金額：digits 位數，第一位不是 0；zeroP 的機率讓「中間（不含最前面與最後面）」至少有一個 0，其餘的題目中間一定沒有 0 */
    function randomAmount(digits, zeroP, rand) {
        rand = rand || Math.random;
        var wantZero = rand() < zeroP;
        for (var tr = 0; tr < 200; tr++) {
            var s = String(kit.randInt(1, 9, rand));
            for (var i = 1; i < digits; i++) s += String(kit.randInt(0, 9, rand));
            var hasZero = s.slice(1, digits - 1).indexOf('0') >= 0;
            if (wantZero && !hasZero) { var p = kit.randInt(1, Math.max(1, digits - 2), rand); s = s.slice(0, p) + '0' + s.slice(p + 1); }
            if (!wantZero && hasZero) continue;
            var n = parseInt(s, 10);
            if (n >= Math.pow(10, digits - 1) && n < Math.pow(10, digits)) return n;
        }
        return Math.pow(10, digits - 1) + 308;
    }
    /* 「差一點點」的另一個金額：回傳整數 m（不等於 n，位數 4～8）。hard＝0（很明顯）～1（很細） */
    function nearAmount(n, hard, rand) {
        rand = rand || Math.random;
        var s = String(n), len = s.length, c = [], i;
        function add(str, w) {
            if (!/^[1-9]\d*$/.test(str)) return;
            var v = parseInt(str, 10);
            if (v !== n && v >= 1000 && v < 100000000) c.push({ v: v, w: w });
        }
        /* a. 多寫或少寫一個零（位數差一位）：4308 → 43080、430 */
        add(s + '0', (1 - hard) * 3 + 0.3);
        if (s[len - 1] === '0') add(s.slice(0, -1), (1 - hard) * 3 + 0.3);
        add(s.slice(0, 1) + '0' + s.slice(1), (1 - hard) * 2 + 0.3);                 /* 第二位插入零：4308 → 40308 */
        var zi = s.indexOf('0', 1);
        if (zi > 0) add(s.slice(0, zi) + s.slice(zi + 1), (1 - hard) * 2 + 0.5);     /* 拿掉中間的零：4308 → 438 */
        /* b. 相鄰兩位對調：4308 → 4038 */
        for (i = 0; i + 1 < len; i++) if (s[i] !== s[i + 1]) add(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2), 1 + 2 * hard);
        /* c. 某一位 ±1：4308 → 4309／4208 */
        for (i = 0; i < len; i++) [-1, 1].forEach(function (dl) {
            var d = parseInt(s[i], 10) + dl;
            if (d >= 0 && d <= 9) add(s.slice(0, i) + d + s.slice(i + 1), (i === len - 1 ? 1 + 2 * hard : 0.6 + hard));
        });
        /* d. 兩個數字長得像：3↔8、1↔7、6↔9（寫錯字） */
        var SIM = { '3': '8', '8': '3', '1': '7', '7': '1', '6': '9', '9': '6' };
        for (i = 0; i < len; i++) if (SIM[s[i]]) add(s.slice(0, i) + SIM[s[i]] + s.slice(i + 1), 0.5 + hard);
        if (!c.length) return n + 10;
        var total = c.reduce(function (a, x) { return a + x.w; }, 0), x = rand() * total;
        for (var j = 0; j < c.length; j++) { x -= c[j].w; if (x <= 0) return c[j].v; }
        return c[c.length - 1].v;
    }
    /* 兩段文字的「不一樣的中間那一段」用 <b> 包起來（只標 b，因為 b 是支票上寫的那一行） */
    function diffMark(a, b) {
        var i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        var j = 0;
        while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
        return b.slice(0, i) + '<b class="chq-diff">' + b.slice(i, b.length - j) + '</b>' + b.slice(b.length - j);
    }
    function nextMatch(hist, rand) {
        rand = rand || Math.random;
        var n = hist.length;
        if (n >= SAME_MAX) {
            var last = hist[n - 1], same = true;
            for (var i = 1; i <= SAME_MAX; i++) if (hist[n - i] !== last) { same = false; break; }
            if (same) return !last;
        }
        return rand() < 0.5;
    }
    /* 出一題：{ amount 小寫金額, small 小寫文字, written 支票上寫的大寫, right 這個金額正確的大寫, match 是否相符, otherAmount（不符時，大寫其實是寫成哪個金額） } */
    function makeQuestion(level, rand, wantMatch) {
        rand = rand || Math.random;
        if (wantMatch == null) wantMatch = rand() < 0.5;
        var hard = kit.ramp(level, 0, 1, RAMP_LEVELS);
        for (var tr = 0; tr < 200; tr++) {
            var n = randomAmount(digitsFor(level), kit.ramp(level, ZERO_P[0], ZERO_P[1], RAMP_LEVELS), rand);
            var right = upper(n), other = null, written = right;
            if (!wantMatch) {
                other = nearAmount(n, hard, rand);
                written = upper(other);
                if (written === right) continue;
            }
            return { amount: n, small: 'NT$ ' + withCommas(n), written: written, right: right, match: written === right, otherAmount: other };
        }
        return { amount: 4308, small: 'NT$ 4,308', written: wantMatch ? upper(4308) : upper(4038), right: upper(4308), match: !!wantMatch, otherAmount: wantMatch ? null : 4038 };
    }
    function rating(n) {
        if (n >= 40) return '銀行行員等級！';
        if (n >= 25) return '眼力很準！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '逐位對照，再來一次！';
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
        var want = nextMatch(hist, api.rand);
        var q = makeQuestion(level, api.rand, want);
        hist.push(want);
        api.info = q;
        console.log('[支票金額] 第 ' + level + ' 題：' + q.small + ' ／ ' + q.written + '（' + (q.match ? '相符' : '不符，大寫其實是 ' + q.otherAmount) + '），限時 ' + ansMs(level) + ' ms');

        var card = h('div', { 'class': 'chq-card' }, [
            h('div', { 'class': 'chq-lab', text: '小寫金額' }),
            h('div', { 'class': 'chq-small', text: q.small }),
            h('div', { 'class': 'chq-lab', text: '大寫金額' }),
            h('div', { 'class': 'chq-big', text: q.written })
        ]);
        var ask = h('div', { 'class': 'qz-note chq-ask', text: '大寫和小寫相符嗎？' });
        var reveal = h('div', { 'class': 'qz-note chq-reveal' });
        stage.appendChild(card); stage.appendChild(ask); stage.appendChild(reveal);
        var grid = kit.btnGrid(stage, [
            { text: '不符', kind: 'primary', onTap: function () { judge(false); } },
            { text: '相符', kind: 'go', onTap: function () { judge(true); } }
        ], { h: 96 });
        api.timer(ansMs(level), function () { judge(null); });
        if (level === 1 && kit.once('chequeamt.hint')) kit.hintOn(stage, q.match ? grid.btns[1] : grid.btns[0], { mode: 'tap', delay: 500, text: '請點擊按鈕' });

        function judge(say) {
            if (api.over) return;
            var ok = say === q.match;
            var bigEl = card.querySelector('.chq-big');
            if (!q.match) { reveal.innerHTML = '正確的大寫：' + q.right + '<br>支票上寫的：' + diffMark(q.right, q.written); bigEl.innerHTML = diffMark(q.right, q.written); }
            else reveal.textContent = '大寫「' + q.right + '」＝ ' + q.small.replace('NT$ ', '') + ' 元，完全相符';
            card.classList.add(ok ? 'chq-card--ok' : 'chq-card--bad');
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1300 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2600, lines: [
                (say == null ? '時間到！' : (q.match ? '其實兩者是相符的' : '其實兩者不相符')) + '：' + q.small,
                '正確的大寫：' + q.right,
                '支票上寫的：' + q.written
            ] });
        }
        api.solve = function () { judge(q.match); };
        api.wrong = function () { judge(!q.match); };
    }

    var G = {
        id: ID,
        name: '支票金額',
        rule: '支票上有小寫金額（阿拉伯數字）和大寫金額（壹貳參肆…），判斷兩者「相符」還是「不符」。不符的地方都很小：少寫一個零、仟佰互換、數字對調。答錯或來不及就結束，看你能連續答對幾題。越後面，金額越大、零越多！',
        mount: mount,
        score: SCORE,
        test: {
            digitsFor: digitsFor, ansMs: ansMs, section: section, upper: upper, fromUpper: fromUpper, withCommas: withCommas, randomAmount: randomAmount, nearAmount: nearAmount, diffMark: diffMark,
            nextMatch: nextMatch, makeQuestion: makeQuestion, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, DIGITS: DIGITS, ZERO_P: ZERO_P, MAX_LEVEL: MAX_LEVEL, SAME_MAX: SAME_MAX
        }
    };
    Reaction.register(G);
})();
