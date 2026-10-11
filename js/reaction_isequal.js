/* ═══════════════════════════════════════════════════════════════════
   reaction_isequal.js — 秒反應・等不等於（企劃 121）
   畫面出現一道「兩邊寫法不同」的等式，例如  3/8 ＝ 0.375  或  7/20 ＝ 34%，
   判斷兩邊「相等」還是「不相等」。不相等的那一題永遠差一點點（0.375 寫成 0.357、37.5% 寫成 35.7%…）。
   關卡制：答錯或來不及就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 數值一律用「整數／整數」的分數（rational）精確比較，不用小數（避免 0.1＋0.2 這類誤差），
     所以「相等不相等」的標準答案絕對不會錯（測試會拿 8000 題逐題驗證）。
   · 難度全部線性（RAMP_LEVELS 題走到頂）：作答限時 ANS_S 7 秒 → 3.5 秒；
     不相等的「差一點點」從很明顯（小數點移位）一路變成很細（相鄰兩位數字對調、末位差 1）。
   · 分母隨題號解鎖：{2,4,5,10} → 加 {8,20} → 加 {16,25,40,50} → 加 {80,125}，全部都能寫成有限小數。
   · 寫法隨題號解鎖：分數↔小數 → 加 分數↔百分比 → 再加 小數↔百分比，左右兩邊的位置也會互換。
   · 答錯／逾時：兩邊換成同一種寫法（小數＋百分比）並排給你看。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'isequal';
    /* 世界排行榜成績規格：連續答對幾題（越多越好）；min 1＝至少答對 1 題才算成績 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var ANS_S = [7.0, 3.5];                     /* 作答限時（秒）：第 1 題 → 到頂 */
    var MAX_LEVEL = 60;                         /* 最多幾題（答滿就全破） */
    var SAME_MAX = 4;                           /* 「相等」（或「不相等」）最多連續幾次 */
    /* 分母清單：從第 from 題起加入 dens 這些分母（全部都能除得盡，寫成有限小數） */
    var DEN_STEPS = [
        { from: 1, dens: [2, 4, 5, 10] },
        { from: 6, dens: [8, 20] },
        { from: 13, dens: [16, 25, 40, 50] },
        { from: 21, dens: [80, 125] }
    ];
    /* 寫法組合：從第 from 題起加入這些「左邊寫法—右邊寫法」（frac 分數、dec 小數、pct 百分比） */
    var FORM_STEPS = [
        { from: 1, pairs: [['frac', 'dec']] },
        { from: 5, pairs: [['frac', 'pct'], ['dec', 'frac']] },
        { from: 11, pairs: [['dec', 'pct'], ['pct', 'frac'], ['pct', 'dec']] }
    ];
    /* 長得像的數字：不相等的題目有時會把一位數字換成它的「長相近」的數字 */
    var SIMILAR = { '0': '8', '1': '7', '2': '7', '3': '8', '4': '9', '5': '6', '6': '5', '7': '1', '8': '3', '9': '4' };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
    /* 兩個分數 {n,d} 是否相等（交叉相乘，整數運算，沒有誤差） */
    function ratEq(a, b) { return a.n * b.d === b.n * a.d; }
    /* 這一題有哪些分母可用／有哪些寫法組合可用 */
    function densFor(level) {
        var out = [];
        DEN_STEPS.forEach(function (s) { if (level >= s.from) out = out.concat(s.dens); });
        return out;
    }
    function pairsFor(level) {
        var out = [];
        FORM_STEPS.forEach(function (s) { if (level >= s.from) out = out.concat(s.pairs); });
        return out;
    }
    /* 小數字串 '0.375' → 分數 {n:375, d:1000}（沒有小數點就是整數） */
    function parseDec(s) {
        var parts = String(s).split('.');
        var frac = parts[1] || '';
        return { n: parseInt(parts[0] + frac, 10), d: Math.pow(10, frac.length) };
    }
    /* 整理小數字串：整數部分去掉多餘的 0（至少留一位）、小數部分去掉尾端的 0（全是 0 就不寫小數點） */
    function normDec(s) {
        var parts = String(s).split('.');
        var ip = parts[0].replace(/^0+(?=\d)/, '') || '0';
        var fp = (parts[1] || '').replace(/0+$/, '');
        return fp ? ip + '.' + fp : ip;
    }
    /* 把分數 {n,d}（d 一定能寫成有限小數）寫成小數字串，例如 {3,8} → '0.375'；小數位數超過 6 位就四捨五入到 4 位 */
    function ratToDec(r) {
        for (var k = 0; k <= 6; k++) {
            var scaled = r.n * Math.pow(10, k);
            if (scaled % r.d === 0) return normDec(placePoint(scaled / r.d, k));
        }
        return (r.n / r.d).toFixed(4);
    }
    /* 整數 m 在右邊數第 k 位前面放小數點：placePoint(375, 3) → '0.375' */
    function placePoint(m, k) {
        var s = String(m);
        if (k === 0) return s;
        while (s.length <= k) s = '0' + s;
        return s.slice(0, s.length - k) + '.' + s.slice(s.length - k);
    }
    /* 分數 → 百分比字串（例如 {3,8} → '37.5%'） */
    function ratToPct(r) { return ratToDec({ n: r.n * 100, d: r.d }) + '%'; }
    /* 分數 → 約分後的分數字串（例如 {6,16} → '3/8'） */
    function ratToFrac(r) { var g = gcd(r.n, r.d); return (r.n / g) + '/' + (r.d / g); }
    /* 一個「寫法」的字串 → 分數（frac '3/8'、dec '0.375'、pct '37.5%'） */
    function parseForm(form, text) {
        if (form === 'frac') { var p = String(text).split('/'); return { n: parseInt(p[0], 10), d: parseInt(p[1], 10) }; }
        if (form === 'pct') { var r = parseDec(String(text).replace('%', '')); return { n: r.n, d: r.d * 100 }; }
        return parseDec(text);
    }
    /* 把一個分數寫成某種寫法 */
    function writeForm(form, r) {
        if (form === 'frac') return ratToFrac(r);
        if (form === 'pct') return ratToPct(r);
        return ratToDec(r);
    }

    /* ── 製造「差一點點」的錯誤寫法 ──
       數字字串（小數／百分比的數字部分，例如 '0.375'、'37.5'）上的五種小修改。hard＝0（很明顯）～1（很細） */
    function digitPositions(s) { var out = []; for (var i = 0; i < s.length; i++) if (s[i] !== '.') out.push(i); return out; }
    function tweakDigits(s, hard, rand) {
        var cands = [];                       /* { str, w } 每一種改法＋權重（難度越高，越細的改法權重越大） */
        var dig = digitPositions(s);
        var dot = s.indexOf('.');
        /* a. 小數點移位：0.375 → 0.0375 或 3.75（很明顯，只在前期出現） */
        var plain = s.replace('.', '');
        [-1, 1].forEach(function (mv) {
            var ip = (dot < 0 ? plain.length : dot) + mv;           /* 移位後，整數部分有幾位 */
            if (ip < 0 || ip > plain.length) return;
            var t = ip === 0 ? '0.' + plain : plain.slice(0, ip) + (ip < plain.length ? '.' + plain.slice(ip) : '');
            cands.push({ str: t, w: (1 - hard) * 3 });
        });
        /* b. 最後一位 ±1 */
        [-1, 1].forEach(function (dl) {
            var v = parseInt(plain, 10) + dl;
            if (v < 0 || String(v).length > plain.length) return;
            var ps = String(v); while (ps.length < plain.length) ps = '0' + ps;
            cands.push({ str: dot < 0 ? ps : ps.slice(0, dot) + '.' + ps.slice(dot), w: 1 + hard });
        });
        /* c. 第一個小數位（或最前面一位）±1 */
        if (dig.length >= 2) {
            var fi = dig[0] === 0 && dot === 1 ? dig[1] : dig[0];       /* 0.375 的 3；37.5 的 3 */
            [-1, 1].forEach(function (dl) {
                var d = parseInt(s[fi], 10) + dl;
                if (d < 0 || d > 9) return;
                cands.push({ str: s.slice(0, fi) + d + s.slice(fi + 1), w: (1 - hard) * 2 + 0.6 });
            });
        }
        /* d. 相鄰兩位數字對調（同一邊的兩位，不跨小數點）：0.375 → 0.357 */
        for (var i = 0; i + 1 < s.length; i++) {
            if (s[i] === '.' || s[i + 1] === '.' || s[i] === s[i + 1]) continue;
            cands.push({ str: s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2), w: 1 + 2 * hard });
        }
        /* e. 把某一位換成「長得像」的數字：0.375 → 0.875 */
        dig.forEach(function (p) {
            if (p === 0 && dot === 1 && s[0] === '0') return;       /* 0.375 最前面的 0 不換（會變成 8.375，太離譜） */
            var r = SIMILAR[s[p]];
            if (r != null) cands.push({ str: s.slice(0, p) + r + s.slice(p + 1), w: 0.5 + hard });
        });
        var total = cands.reduce(function (a, c) { return a + c.w; }, 0);
        if (!cands.length || total <= 0) return null;
        var x = rand() * total;
        for (var j = 0; j < cands.length; j++) { x -= cands[j].w; if (x <= 0) return cands[j].str; }
        return cands[cands.length - 1].str;
    }
    /* 分數的錯誤寫法：分子或分母差 1、分子分母對調位置的數字… */
    function tweakFrac(r, hard, rand) {
        var cands = [];
        var g = gcd(r.n, r.d), n = r.n / g, d = r.d / g;
        [-1, 1].forEach(function (dl) {
            if (n + dl >= 1) cands.push({ n: n + dl, d: d, w: 2 });
            if (d + dl >= 2) cands.push({ n: n, d: d + dl, w: 1 + hard });
        });
        cands.push({ n: n * 2 + 1, d: d * 2, w: 0.6 + hard });               /* 分子分母各乘 2 再把分子加 1：看起來像約分過 */
        cands = cands.filter(function (c) { return c.n * d !== n * c.d; });
        if (!cands.length) return null;
        var total = cands.reduce(function (a, c) { return a + c.w; }, 0), x = rand() * total;
        for (var j = 0; j < cands.length; j++) { x -= cands[j].w; if (x <= 0) return cands[j]; }
        return cands[cands.length - 1];
    }
    /* 這一題要不要「相等」：一半一半，連續太多次就換邊 */
    function nextEqual(hist, rand) {
        rand = rand || Math.random;
        var n = hist.length;
        if (n >= SAME_MAX) {
            var last = hist[n - 1], same = true;
            for (var i = 1; i <= SAME_MAX; i++) if (hist[n - i] !== last) { same = false; break; }
            if (same) return !last;
        }
        return rand() < 0.5;
    }
    /* 出一題：回傳 { left:{form,text}, right:{form,text}, isEqual, value（真值分數）, wrongValue（不相等時另一邊其實是多少）} */
    function makeQuestion(level, rand, wantEqual) {
        rand = rand || Math.random;
        if (wantEqual == null) wantEqual = rand() < 0.5;
        var hard = kit.ramp(level, 0, 1, RAMP_LEVELS);
        for (var tr = 0; tr < 400; tr++) {
            var d = kit.pick(densFor(level), rand), n = kit.randInt(1, d - 1, rand);
            if (gcd(n, d) !== 1) continue;                      /* 一律用約分過的分數，例如不出 6/8（出 3/4） */
            var val = { n: n, d: d };
            var pair = kit.pick(pairsFor(level), rand);
            var lf = pair[0], rf = pair[1];
            var leftText = writeForm(lf, val), rightText = writeForm(rf, val);
            var wrongVal = null;
            if (!wantEqual) {
                /* 把右邊（或左邊）改成差一點點的寫法；哪一邊改，隨機 */
                var side = rand() < 0.5 ? 'right' : 'left';
                var form = side === 'right' ? rf : lf;
                var base = side === 'right' ? rightText : leftText;
                var bad = null;
                if (form === 'frac') {
                    var t = tweakFrac(val, hard, rand);
                    if (t) bad = { text: t.n + '/' + t.d, rat: { n: t.n, d: t.d } };
                } else {
                    var numStr = form === 'pct' ? base.replace('%', '') : base;
                    var ns = tweakDigits(numStr, hard, rand);
                    if (ns != null) {
                        ns = normDec(ns);
                        bad = { text: ns + (form === 'pct' ? '%' : ''), rat: parseForm(form, ns + (form === 'pct' ? '%' : '')) };
                    }
                }
                if (!bad || ratEq(bad.rat, val)) continue;
                if (bad.text === base) continue;
                if (side === 'right') rightText = bad.text; else leftText = bad.text;
                wrongVal = bad.rat;
            }
            /* 再用最後的文字重算一次真假，標準答案以「畫面上的字」為準（永遠不會跟畫面不一致） */
            var A = parseForm(lf, leftText), B = parseForm(rf, rightText);
            var isEq = ratEq(A, B);
            if (isEq !== wantEqual) continue;
            if (A.d > 100000 || B.d > 100000) continue;
            return { left: { form: lf, text: leftText }, right: { form: rf, text: rightText }, isEqual: isEq, value: val, wrongValue: wrongVal, A: A, B: B };
        }
        /* 保底：固定的合法題目 */
        return wantEqual
            ? { left: { form: 'frac', text: '3/8' }, right: { form: 'dec', text: '0.375' }, isEqual: true, value: { n: 3, d: 8 }, wrongValue: null, A: { n: 3, d: 8 }, B: { n: 375, d: 1000 } }
            : { left: { form: 'frac', text: '3/8' }, right: { form: 'dec', text: '0.357' }, isEqual: false, value: { n: 3, d: 8 }, wrongValue: { n: 357, d: 1000 }, A: { n: 3, d: 8 }, B: { n: 357, d: 1000 } };
    }
    /* 把任何分數寫成「小數＋百分比」兩種寫法，揭曉用（不能除盡的就四捨五入到 4 位，前面加 ≈） */
    function bothForms(r) {
        var g = gcd(r.n, r.d), n = r.n / g, d = r.d / g, dd = d;
        while (dd % 2 === 0) dd /= 2;
        while (dd % 5 === 0) dd /= 5;
        if (dd === 1) return writeForm('dec', { n: n, d: d }) + ' ＝ ' + writeForm('pct', { n: n, d: d });
        return '≈ ' + (n / d).toFixed(4) + ' ＝ ≈ ' + (100 * n / d).toFixed(4) + '%';
    }
    function rating(n) {
        if (n >= 40) return '等號判官！';
        if (n >= 25) return '眼力數感都很棒！';
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
        var want = nextEqual(hist, api.rand);
        var q = makeQuestion(level, api.rand, want);
        hist.push(want);
        api.info = q;
        console.log('[等不等於] 第 ' + level + ' 題：' + q.left.text + ' ＝ ' + q.right.text + '（' + (q.isEqual ? '相等' : '不相等') + '），限時 ' + ansMs(level) + ' ms');

        var eq = h('div', { 'class': 'qz-big ieq-eq' });
        eq.appendChild(h('span', { text: q.left.text }));
        eq.appendChild(h('span', { 'class': 'ieq-sign', text: '＝' }));
        eq.appendChild(h('span', { text: q.right.text }));
        var ask = h('div', { 'class': 'qz-note ieq-ask', text: '左右兩邊相等嗎？' });
        var reveal = h('div', { 'class': 'qz-note ieq-reveal' });
        stage.appendChild(eq); stage.appendChild(ask); stage.appendChild(reveal);
        var grid = kit.btnGrid(stage, [
            { text: '不相等', kind: 'primary', onTap: function () { judge(false); } },
            { text: '相等', kind: 'go', onTap: function () { judge(true); } }
        ], { h: 84 });
        var bNo = grid.btns[0], bYes = grid.btns[1];
        api.timer(ansMs(level), function () { judge(null); });
        if (level === 1 && kit.once('isequal.hint')) kit.hintOn(stage, q.isEqual ? bYes : bNo, { mode: 'tap', delay: 500, text: '請點擊按鈕' });

        function judge(sayEqual) {
            if (api.over) return;
            var ok = sayEqual === q.isEqual;
            eq.classList.add(ok ? 'qz-ok' : 'qz-bad');
            var lv = bothForms(q.A), rv = bothForms(q.B);
            reveal.innerHTML = '左邊 ' + q.left.text + ' ＝ ' + lv + '<br>右邊 ' + q.right.text + ' ＝ ' + rv;
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 900 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2200, lines: [
                (sayEqual == null ? '時間到！' : (q.isEqual ? '其實兩邊是相等的' : '其實兩邊不相等')) + '：' + q.left.text + ' ＝ ' + q.right.text,
                '左邊 ' + q.left.text + ' ＝ ' + lv, '右邊 ' + q.right.text + ' ＝ ' + rv
            ] });
        }
        api.solve = function () { judge(q.isEqual); };
        api.wrong = function () { judge(!q.isEqual); };
    }

    var G = {
        id: ID,
        name: '等不等於',
        rule: '畫面上有一道等式，左右兩邊的寫法不一樣（分數、小數、百分比）。**判斷兩邊是「相等」還是「不相等」**；**不相等的題目都只差一點點**。答錯或來不及就結束，看你能連續答對幾題。越後面，限時越短！',
        mount: mount,
        score: SCORE,
        test: {
            ansMs: ansMs, gcd: gcd, ratEq: ratEq, densFor: densFor, pairsFor: pairsFor, parseDec: parseDec, normDec: normDec, ratToDec: ratToDec, ratToPct: ratToPct, ratToFrac: ratToFrac,
            parseForm: parseForm, writeForm: writeForm, tweakDigits: tweakDigits, tweakFrac: tweakFrac, nextEqual: nextEqual, makeQuestion: makeQuestion, bothForms: bothForms, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ANS_S: ANS_S, MAX_LEVEL: MAX_LEVEL, SAME_MAX: SAME_MAX
        }
    };
    Reaction.register(G);
})();
