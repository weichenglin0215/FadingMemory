/* ═══════════════════════════════════════════════════════════════════
   reaction_babyscale.js — 秒反應・抱著量體重（原創篇 544「抱著量體重」，照使用者的修改：直接條列兩個、三個一起量的重量）
   樣式：css/games/reaction_babyscale.css（class 一律以「babyscale-」開頭）；數字鍵盤：js/numpad_lib.js
   ───────────────────────────────────────────────────────────────────
   · 玩法：家裡的人和東西（阿公、媽媽、寶寶、貓、行李箱……）兩個或三個一起站上體重計（抱著、提著），
     紀錄寫成一條一條：「阿公＋寶寶＝82 公斤」。前面的關卡還有「全部一起＝○○ 公斤」。
     題目問其中一個「幾公斤？」——用數字鍵填答案，按「確定」。**答錯一次這一局就結束**，會列出算法。
   · 頓悟：兩條紀錄相減，共同的那一個就消掉了（阿公＋寶寶 − 阿公＋貓 ＝ 寶寶 − 貓）；
     三個兩兩一起量（A＋B、B＋C、A＋C），三條加起來是「兩倍的總重」，再減掉一條就得到另一個的兩倍；
     有「全部一起」時，總重減掉其他幾個就好。
   · 出題：亂數重量 → 從「兩個一起」「三個一起」的紀錄裡隨機加，直到問的那一個「算得出來」（線性代數：它在紀錄的組合裡）→
     再把多餘的紀錄拿掉（每一條都用得到）；第 12 關起多一條用不到的紀錄混在裡面，第 15 關起至少要用到 3 條紀錄。
     人和東西 3 → 6 個（線性）；第 1～8 關有「全部一起」，第 6 關起有三個一起量的紀錄。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'babyscale';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;
    var ITEMS = [3, 6];                         /* 幾個人和東西：第 1 關 → 到頂 */
    var TOTAL_TO = 8;                           /* 第幾關以前有「全部一起」的紀錄 */
    var TRIPLE_FROM = 6;                        /* 第幾關起有「三個一起」的紀錄 */
    var DISTRACT_FROM = 12;                     /* 第幾關起多一條用不到的紀錄 */
    var MIN_USED_FROM = 15;                     /* 第幾關起至少要用到 3 條紀錄 */
    var MAX_EQS = 6;                            /* 紀錄最多幾條（含用不到的那條；舞台高度只放得下 6 條） */
    var MAX_LEVEL = 90;
    var PASS_DELAY_MS = 1500;
    var FAIL_HOLD_MS = 7000;
    var THINGS = [                              /* 名稱、圖示、重量範圍（公斤） */
        { name: '阿公', icon: '👴', w: [58, 80] }, { name: '阿嬤', icon: '👵', w: [42, 60] },
        { name: '爸爸', icon: '👨', w: [62, 85] }, { name: '媽媽', icon: '👩', w: [46, 64] },
        { name: '哥哥', icon: '👦', w: [20, 38] }, { name: '寶寶', icon: '👶', w: [5, 12] },
        { name: '小貓', icon: '🐱', w: [3, 6] }, { name: '小狗', icon: '🐶', w: [6, 18] },
        { name: '行李箱', icon: '🧳', w: [9, 24] }, { name: '西瓜', icon: '🍉', w: [4, 9] }
    ];
    var CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 線性代數的小工具（浮點數＋容許誤差；係數都是 0／1，數字很小，不會有誤差問題） */
    function rank(rows) {
        var m = rows.map(function (r) { return r.slice(); }), rk = 0, cols = m.length ? m[0].length : 0;
        for (var c = 0; c < cols && rk < m.length; c++) {
            var p = -1;
            for (var i = rk; i < m.length; i++) if (Math.abs(m[i][c]) > 1e-9) { p = i; break; }
            if (p < 0) continue;
            var t = m[p]; m[p] = m[rk]; m[rk] = t;
            for (i = 0; i < m.length; i++) if (i !== rk && Math.abs(m[i][c]) > 1e-9) {
                var f = m[i][c] / m[rk][c];
                for (var j = c; j < cols; j++) m[i][j] -= f * m[rk][j];
            }
            rk++;
        }
        return rk;
    }
    function unit(n, t) { var e = []; for (var i = 0; i < n; i++) e.push(i === t ? 1 : 0); return e; }
    /* 第 t 個算不算得出來：e_t 在紀錄（rows）張成的空間裡 */
    function determined(rows, n, t) { return rows.length > 0 && rank(rows) === rank(rows.concat([unit(n, t)])); }
    /* 找係數 c：Σ c_j × rows[j] ＝ e_t（rows 要線性獨立）。回傳 { coef:[整數…], div }：第 t 個 ＝ Σ coef_j × 紀錄 j ÷ div */
    function combo(rows, n, t) {
        var m = rows.length, A = [], i, j;
        for (i = 0; i < n; i++) { var r = []; for (j = 0; j < m; j++) r.push(rows[j][i]); r.push(i === t ? 1 : 0); A.push(r); }   /* A^T c ＝ e_t 的增廣矩陣 */
        var piv = [], rk = 0;
        for (var c = 0; c < m && rk < n; c++) {
            var p = -1;
            for (i = rk; i < n; i++) if (Math.abs(A[i][c]) > 1e-9) { p = i; break; }
            if (p < 0) continue;
            var tmp = A[p]; A[p] = A[rk]; A[rk] = tmp;
            var d = A[rk][c];
            for (j = 0; j <= m; j++) A[rk][j] /= d;
            for (i = 0; i < n; i++) if (i !== rk && Math.abs(A[i][c]) > 1e-9) { var f = A[i][c]; for (j = 0; j <= m; j++) A[i][j] -= f * A[rk][j]; }
            piv.push(c); rk++;
        }
        var x = []; for (j = 0; j < m; j++) x.push(0);
        piv.forEach(function (c, r) { x[c] = A[r][m]; });
        for (var div = 1; div <= 12; div++) {
            if (x.every(function (v) { return Math.abs(v * div - Math.round(v * div)) < 1e-6; })) return { coef: x.map(function (v) { return Math.round(v * div); }), div: div };
        }
        return null;
    }
    function sumOf(set, ws) { return set.reduce(function (a, i) { return a + ws[i]; }, 0); }
    function rowOf(set, n) { var r = []; for (var i = 0; i < n; i++) r.push(set.indexOf(i) >= 0 ? 1 : 0); return r; }
    /* 所有「兩個一起」（和三個一起）的組合 */
    function subsets(n, withTriples) {
        var out = [], a, b, c;
        for (a = 0; a < n; a++) for (b = a + 1; b < n; b++) out.push([a, b]);
        if (withTriples) for (a = 0; a < n; a++) for (b = a + 1; b < n; b++) for (c = b + 1; c < n; c++) out.push([a, b, c]);
        return out;
    }
    /* 出一題：{ things, ws, target, eqs:[{ set, sum }], used:[用到的紀錄索引], coef, div } */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var n = Math.round(kit.ramp(level, ITEMS[0], ITEMS[1], RAMP_LEVELS)), last = null;
        var minUsed = level >= MIN_USED_FROM ? 3 : 2;
        for (var tr = 0; tr < 400; tr++) {
            var things = kit.shuffle(THINGS, rand).slice(0, n);
            var ws = things.map(function (t) { return kit.randInt(t.w[0], t.w[1], rand); });
            var target = kit.randInt(0, n - 1, rand);
            var cand = kit.shuffle(subsets(n, level >= TRIPLE_FROM && n >= 3), rand);
            var all = []; for (var i = 0; i < n; i++) all.push(i);
            var sets = level <= TOTAL_TO ? [all] : [];
            for (var q = 0; q < cand.length && !determined(sets.map(function (s) { return rowOf(s, n); }), n, target); q++) sets.push(cand[q]);
            if (!determined(sets.map(function (s) { return rowOf(s, n); }), n, target)) continue;
            /* 拿掉多餘的紀錄（「全部一起」那條留著不拿，它是前面關卡的特色） */
            kit.shuffle(sets.slice(), rand).forEach(function (s) {
                if (s.length === n && level <= TOTAL_TO) return;
                var rest = sets.filter(function (x) { return x !== s; });
                if (determined(rest.map(function (x) { return rowOf(x, n); }), n, target)) sets = rest;
            });
            if (sets.length < minUsed) continue;
            if (level <= TOTAL_TO && determined(sets.filter(function (x) { return x.length !== n; }).map(function (x) { return rowOf(x, n); }), n, target)) continue;   /* 「全部一起」那條也要用得到 */
            var cb = combo(sets.map(function (s) { return rowOf(s, n); }), n, target);
            if (!cb) continue;
            var eqs = sets.map(function (s) { return { set: s, sum: sumOf(s, ws), used: true }; });
            if (level >= DISTRACT_FROM) {
                var extra = cand.filter(function (s) { return !sets.some(function (x) { return x.join() === s.join(); }); })[0];
                if (extra) eqs.push({ set: extra, sum: sumOf(extra, ws), used: false });
            }
            if (eqs.length > MAX_EQS) continue;
            var order = kit.shuffle(eqs.map(function (_, k) { return k; }), rand);
            var coef = [];
            order.forEach(function (k) { coef.push(k < cb.coef.length ? cb.coef[k] : 0); });
            last = { things: things, ws: ws, target: target, eqs: order.map(function (k) { return eqs[k]; }), coef: coef, div: cb.div };
            return last;
        }
        return last;
    }
    /* 算法的文字：「阿公 ＝（① ＋ ③ − ②）÷ 2 ＝ 70 公斤」 */
    function workText(pz) {
        var parts = [];
        pz.coef.forEach(function (c, k) {
            if (!c) return;
            var a = Math.abs(c), s = (a === 1 ? '' : a + '×') + CIRCLED[k];
            parts.push({ neg: c < 0, s: s });
        });
        parts.sort(function (a, b) { return (a.neg ? 1 : 0) - (b.neg ? 1 : 0); });          /* 加的放前面、減的放後面 */
        var body = parts.map(function (p, i) { return (i === 0 ? (p.neg ? '−' : '') : (p.neg ? ' − ' : ' ＋ ')) + p.s; }).join('');
        var name = pz.things[pz.target].name;
        return name + ' ＝ ' + (pz.div > 1 ? '（' + body + '）÷ ' + pz.div : body) + ' ＝ ' + pz.ws[pz.target] + ' 公斤';
    }
    /* 驗算：照係數算出來的確是答案 */
    function checkCombo(pz) {
        var s = 0;
        pz.coef.forEach(function (c, k) { s += c * pz.eqs[k].sum; });
        return s === pz.ws[pz.target] * pz.div;
    }
    function rating(n) {
        if (n >= 25) return '家庭體重計專家！';
        if (n >= 12) return '加加減減很靈活！';
        if (n >= 5) return '越來越有感覺了！';
        return '兩條紀錄相減，一樣的那個人就消掉了！';
    }

    /* ═══ 畫面 ═══ */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var pz = makePuzzle(level, api.rand), n = pz.ws.length, tg = pz.things[pz.target];
        api.info = pz;
        console.log('[抱著量體重] 第 ' + level + ' 關：' + n + ' 個、' + pz.eqs.length + ' 條紀錄，問' + tg.name);
        var typed = '', over = false;

        var wrap = h('div', { 'class': 'babyscale-wrap' });
        var list = h('div', { 'class': 'babyscale-list' });
        list.appendChild(h('div', { 'class': 'babyscale-title', text: '一起站上體重計量的紀錄' }));
        pz.eqs.forEach(function (eq, k) {
            var names = eq.set.length === n ? '全部一起' : eq.set.map(function (i) { return pz.things[i].name; }).join('＋');
            list.appendChild(h('div', { 'class': 'babyscale-eq' }, [h('span', { 'class': 'babyscale-eq__no', text: CIRCLED[k] }), h('span', { 'class': 'babyscale-eq__names', text: names }), h('span', { 'class': 'babyscale-eq__sum', text: '＝ ' + eq.sum + ' 公斤' })]));
        });
        var ask = h('div', { 'class': 'babyscale-ask' }, [h('span', { text: tg.icon + tg.name + ' 幾公斤？' })]);
        var box = h('div', { 'class': 'babyscale-answer' });
        ask.appendChild(box);
        var tip = h('div', { 'class': 'babyscale-tip', text: '用數字鍵填答案' });
        var btnOk = h('button', { 'class': 'btn btn--primary babyscale-ok', type: 'button', text: '確定' });
        kit.onTap(btnOk, submit);
        wrap.appendChild(list); wrap.appendChild(ask); wrap.appendChild(tip);
        stage.appendChild(wrap);
        var pad = Reaction.numpad(wrap, { keyH: 46, onKey: onKey });
        wrap.appendChild(btnOk);

        function paint() { box.textContent = typed; btnOk.disabled = !typed || over; }
        function onKey(k) {
            if (over) return;
            if (k === 'clr') typed = '';
            else if (k === 'del') typed = typed.slice(0, -1);
            else if (typed.length < 3) typed = typed === '0' ? k : typed + k;
            paint();
        }
        function submit() {
            if (over || !typed) return;
            over = true; pad.setEnabled(false); paint();
            var work = workText(pz);
            tip.textContent = work;
            if (parseInt(typed, 10) === pz.ws[pz.target]) {
                box.classList.add('babyscale-answer--ok');
                kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return;
            }
            box.classList.add('babyscale-answer--bad');
            box.textContent = typed + '→' + pz.ws[pz.target];
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: ['你填 ' + typed + ' 公斤', work] });
        }
        api.solve = function () { typed = String(pz.ws[pz.target]); paint(); submit(); };
        api.wrong = function () { typed = String(pz.ws[pz.target] + 1); paint(); submit(); };
        api.state = function () { return { typed: typed, over: over }; };
        paint();
    }

    var G = {
        id: ID,
        name: '抱著量體重',
        rule: '家裡的人和東西**兩個或三個一起站上體重計**（抱著、提著），紀錄寫成一條一條，例如「阿公＋寶寶＝82 公斤」；前面幾關還有「全部一起」量的重量。**題目問其中一個幾公斤**，用數字鍵填答案、按「確定」。**答錯一次就結束**，會列出算法。小撇步：兩條紀錄相減，一樣的那一個就消掉了。沒有時間限制，慢慢算。',
        mount: mount,
        score: SCORE,
        test: {
            rank: rank, determined: determined, combo: combo, subsets: subsets, makePuzzle: makePuzzle, workText: workText, checkCombo: checkCombo, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ITEMS: ITEMS, MAX_EQS: MAX_EQS, TOTAL_TO: TOTAL_TO, TRIPLE_FROM: TRIPLE_FROM, DISTRACT_FROM: DISTRACT_FROM, MIN_USED_FROM: MIN_USED_FROM, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
