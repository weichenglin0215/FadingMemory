/* ═══════════════════════════════════════════════════════════════════
   reaction_fillop.js — 秒反應・挑加減乘除（企劃 131「補一對括號」的改版）
   一道橫式的算式，其中一個（或好幾個）加減乘除符號不見了，換成直排的四顆按鈕（＋ − × ÷），
   請選出正確的符號，讓等號成立。例如  8 [？] 2 ＋ 2 × 3 ＝ 18  →  選「÷」。
   關卡制：選錯或來不及就結束，成績＝連續過幾關。
   ───────────────────────────────────────────────────────────────────
   · 出題（規範 Q1、Q2：先決定結果、再驗證唯一解）：先隨機排出數字與「真正的符號」，照數學規則（先乘除、後加減）
     算出等號右邊的數字；再挑幾個符號藏起來，然後把「所有可能的填法」（4 的 b 次方種，最多 256 種）一個一個代進去算，
     只有「剛好一種填法」讓等式成立才出這一題，所以答案唯一，不靠運氣。（算式用「分數」精確計算，不會有小數誤差。）
   · 空格只有 1 個時：點哪顆符號就直接判定。有 2 個以上時：每個空格各選一顆，全部選好之後，畫面會立刻告訴你
     「目前算出來是多少」，確認之後按「確定」才判定（可以改選）。
   · 難度線性（RAMP_LEVELS 關走到頂）：數字 3 → 5 個、空格 1 → 4 個（最多是符號數）；限時＝(基本秒數＋每個空格秒數×空格數)×倍率。
   · 答錯／逾時：把正確的算式完整寫出來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'fillop';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var NUMS = [3, 5];                          /* 算式裡有幾個數字：第 1 關 → 到頂 */
    var BLANKS = [1, 4];                        /* 有幾個符號被藏起來：第 1 關 → 到頂（不會超過「符號數」） */
    var BIG_NUM_LEVELS = 10;                    /* 前幾關（而且空格少時）數字可以到 12，之後一律 1～9（版面放得下） */
    var TIME_BASE = 5, TIME_PER_BLANK = 3;      /* 限時（秒）＝ (TIME_BASE ＋ TIME_PER_BLANK × 空格數) × 倍率 */
    var TIME_MUL = [1.2, 0.8];                  /* 倍率：第 1 關 → 到頂 */
    var TARGET_MAX = 200;                       /* 等號右邊最大是多少 */
    var MAX_LEVEL = 60;
    var OPS = ['+', '-', '*', '/'];
    var OP_TEXT = { '+': '+', '-': '−', '*': '×', '/': '÷' };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function numsFor(level) { return kit.clamp(Math.round(kit.ramp(level, NUMS[0], NUMS[1], RAMP_LEVELS)), NUMS[0], NUMS[1]); }
    function blanksFor(level) { return kit.clamp(Math.round(kit.ramp(level, BLANKS[0], BLANKS[1], RAMP_LEVELS)), BLANKS[0], numsFor(level) - 1); }
    function ansMs(level) { return Math.round((TIME_BASE + TIME_PER_BLANK * blanksFor(level)) * kit.ramp(level, TIME_MUL[0], TIME_MUL[1], RAMP_LEVELS) * 1000); }
    function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
    /* 分數 {n,d}（d>0）：加減乘除，除以 0 回傳 null */
    function rat(n, d) { if (d < 0) { n = -n; d = -d; } var g = gcd(n, d) || 1; return { n: n / g, d: d / g }; }
    function rop(op, a, b) {
        if (a == null || b == null) return null;
        if (op === '+') return rat(a.n * b.d + b.n * a.d, a.d * b.d);
        if (op === '-') return rat(a.n * b.d - b.n * a.d, a.d * b.d);
        if (op === '*') return rat(a.n * b.n, a.d * b.d);
        if (b.n === 0) return null;
        return rat(a.n * b.d, a.d * b.n);
    }
    /* 算式 nums（整數陣列）＋ ops（符號陣列，長度比 nums 少 1）→ 結果（分數），照數學規則：先乘除、後加減；除以 0 回傳 null。
       exact 為 true 時，只要有一個除法「除不盡」也回傳 null（出題時要求真正的算式每一步都是整數） */
    function evalOps(nums, ops, exact) {
        var vals = nums.map(function (x) { return rat(x, 1); }), os = ops.slice(), i;
        for (i = 0; i < os.length;) {
            if (os[i] === '*' || os[i] === '/') {
                var r = rop(os[i], vals[i], vals[i + 1]);
                if (r == null || (exact && r.d !== 1)) return null;
                vals.splice(i, 2, r); os.splice(i, 1);
            } else i++;
        }
        var acc = vals[0];
        for (i = 0; i < os.length; i++) acc = rop(os[i], acc, vals[i + 1]);
        return acc;
    }
    function ratEqInt(r, v) { return r != null && r.d === 1 && r.n === v; }
    /* 數一數：把 blanks（要藏起來的符號位置）的所有填法都代進去，有幾種讓結果等於 target？（出題要求剛好 1 種） */
    function countSolutions(nums, ops, blanks, target) {
        var total = 0, combo = [];
        function rec(k) {
            if (k === blanks.length) {
                var os = ops.slice();
                blanks.forEach(function (bi, j) { os[bi] = combo[j]; });
                if (ratEqInt(evalOps(nums, os), target)) total++;
                return;
            }
            for (var i = 0; i < OPS.length; i++) { combo[k] = OPS[i]; rec(k + 1); }
        }
        rec(0);
        return total;
    }
    /* 出一題：{ nums, ops（真正的符號）, blanks（被藏起來的符號位置，由小到大）, target, text（完整算式） } */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        var n = numsFor(level), b = blanksFor(level);
        var numMax = (level <= BIG_NUM_LEVELS && b <= 2 && n <= 4) ? 12 : 9;
        for (var tr = 0; tr < 800; tr++) {
            var nums = [], ops = [], i;
            for (i = 0; i < n; i++) nums.push(kit.randInt(1, numMax, rand));
            for (i = 0; i < n - 1; i++) ops.push(kit.pick(OPS, rand));
            var t = evalOps(nums, ops, true);
            if (t == null || t.d !== 1 || t.n < 1 || t.n > TARGET_MAX) continue;
            var idx = []; for (i = 0; i < n - 1; i++) idx.push(i);
            var blanks = kit.sample(idx, b, rand).sort(function (x, y) { return x - y; });
            if (countSolutions(nums, ops, blanks, t.n) !== 1) continue;
            return { nums: nums, ops: ops, blanks: blanks, target: t.n, text: toText(nums, ops, t.n) };
        }
        var fb = { nums: [8, 2, 2, 3], ops: ['/', '+', '*'], blanks: [0], target: 10 };
        fb.target = evalOps(fb.nums, fb.ops).n; fb.text = toText(fb.nums, fb.ops, fb.target);
        return fb;
    }
    function toText(nums, ops, target) {
        var s = '';
        nums.forEach(function (x, i) { s += (i ? ' ' + OP_TEXT[ops[i - 1]] + ' ' : '') + x; });
        return s + ' ＝ ' + target;
    }
    /* 玩家的填法 → 算出來是多少？（分數轉成字串；除不盡就寫 ≈ 小數 4 位；除以 0 寫「不能算」） */
    function valueText(r) {
        if (r == null) return '不能算';
        if (r.d === 1) return String(r.n);
        return '≈ ' + (r.n / r.d).toFixed(4);
    }
    function rating(n) {
        if (n >= 40) return '符號魔術師！';
        if (n >= 25) return '算式高手！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '先熟悉一下，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeQuestion(level, api.rand);
        api.info = q;
        console.log('[挑加減乘除] 第 ' + level + ' 關：' + q.text + '，藏起來的符號位置 ' + q.blanks.join(',') + '，限時 ' + ansMs(level) + ' ms');

        var row = h('div', { 'class': 'fop-row' });
        var chosen = q.blanks.map(function () { return null; });        /* 每個空格目前選了哪個符號（null＝還沒選） */
        var cols = [];                                                  /* 每個空格的四顆按鈕 */
        q.nums.forEach(function (x, i) {
            if (i > 0) {
                var bi = q.blanks.indexOf(i - 1);
                if (bi < 0) row.appendChild(h('div', { 'class': 'fop-fixed', text: OP_TEXT[q.ops[i - 1]] }));
                else {
                    var col = h('div', { 'class': 'fop-col' });
                    var bs = OPS.map(function (op) {
                        var b = h('button', { 'class': 'fop-op', text: OP_TEXT[op] });
                        kit.onTap(b, function () { choose(bi, op); });
                        col.appendChild(b);
                        return b;
                    });
                    cols.push(bs);
                    row.appendChild(col);
                }
            }
            row.appendChild(h('div', { 'class': 'fop-num', text: String(x) }));
        });
        var eqLine = h('div', { 'class': 'qz-big fop-target', text: '＝ ' + q.target });
        var live = h('div', { 'class': 'qz-note fop-live', text: q.blanks.length > 1 ? '每個空格選一個符號' : '選出正確的符號' });
        stage.appendChild(row); stage.appendChild(eqLine); stage.appendChild(live);
        var okBtn = null;
        if (q.blanks.length > 1) {
            var grid = kit.btnGrid(stage, [{ text: '確定', kind: 'go', cls: 'fop-ok fop-ok--off', onTap: function () { if (allChosen()) judge(); } }], { h: 84 });
            okBtn = grid.btns[0];
        }
        api.timer(ansMs(level), function () { judge(); });
        if (level === 1 && kit.once('fillop.hint')) {
            var hint = kit.hintOn(stage, cols[0][OPS.indexOf(q.ops[q.blanks[0]])], { mode: 'tap', delay: 500, text: '請點擊正確的符號' });
            if (hint.label) { hint.label.style.top = '4px'; }                  /* 提示文字放在最上面，才不會蓋住算式裡的數字 */
        }

        function allChosen() { return chosen.every(function (c) { return c != null; }); }
        function currentOps() {
            var os = q.ops.slice();
            q.blanks.forEach(function (bi, j) { if (chosen[j] != null) os[bi] = chosen[j]; });
            return os;
        }
        function choose(j, op) {
            if (api.over) return;
            Sfx.play('click');
            chosen[j] = op;
            cols[j].forEach(function (b, k) { b.classList.toggle('fop-op--on', OPS[k] === op); });
            if (q.blanks.length === 1) { judge(); return; }
            if (allChosen()) {
                live.textContent = '現在算出來是 ' + valueText(evalOps(q.nums, currentOps())) + '（目標 ' + q.target + '）';
                okBtn.classList.remove('fop-ok--off');
            } else live.textContent = '每個空格選一個符號';
        }
        function judge() {
            if (api.over) return;
            var ok = allChosen() && ratEqInt(evalOps(q.nums, currentOps()), q.target);
            /* 揭曉：把正確的符號填回空格 */
            q.blanks.forEach(function (bi, j) {
                cols[j].forEach(function (b, k) {
                    b.classList.remove('fop-op--on');
                    if (OPS[k] === q.ops[bi]) b.classList.add('fop-op--right');
                    else if (chosen[j] === OPS[k]) b.classList.add('fop-op--wrong');
                });
            });
            live.textContent = '正確的算式：' + q.text;
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1100 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2400, lines: [
                allChosen() ? '你的填法算出 ' + valueText(evalOps(q.nums, currentOps())) + '，目標是 ' + q.target : (chosen.some(function (c) { return c != null; }) ? '時間到，還有空格沒選！' : '時間到！'),
                '正確的算式：' + q.text
            ] });
        }
        api.solve = function () { q.blanks.forEach(function (bi, j) { chosen[j] = q.ops[bi]; }); judge(); };
        api.wrong = function () {
            var j = 0, bad = OPS.filter(function (o) { return o !== q.ops[q.blanks[0]]; })[0];
            q.blanks.forEach(function (bi, k) { chosen[k] = q.ops[bi]; });
            chosen[j] = bad;
            judge();
        };
    }

    var G = {
        id: ID,
        name: '挑加減乘除',
        rule: '算式裡有加減乘除符號不見了，換成直排的四顆按鈕（＋ − × ÷）。**請選出正確的符號，讓等號成立**。**只有一種填法是對的**。空格有好幾個時，每個空格各選一個，確認算出來的數字再按「確定」。選錯或來不及就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        test: {
            numsFor: numsFor, blanksFor: blanksFor, ansMs: ansMs, rat: rat, rop: rop, evalOps: evalOps, ratEqInt: ratEqInt, countSolutions: countSolutions,
            makeQuestion: makeQuestion, toText: toText, valueText: valueText, rating: rating, OPS: OPS,
            RAMP_LEVELS: RAMP_LEVELS, NUMS: NUMS, BLANKS: BLANKS, TARGET_MAX: TARGET_MAX, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
