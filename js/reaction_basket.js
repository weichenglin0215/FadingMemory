/* ═══════════════════════════════════════════════════════════════════
   reaction_basket.js — 秒反應・菜籃總價
   上方是「總價」題目，下方 2×3 六格蔬菜水果各有標價；挑幾樣讓價格加起來剛好等於總價，按「結帳」。
   介面不顯示已選合計（要自己心算）。關卡制，2 條命（結帳錯一次扣一條），成績＝通過關數。
   V1.28（玩家意見）：蔬果圖案改用 emoji（ITEMS 28 種）、名稱用咖啡色（不重要）；價格數字改成黑色並放大成 150%（要看的重點）。
   ───────────────────────────────────────────────────────────────────
   · 六個價格互不相同的整數；總價 ＝ 挑 k 樣的和，k 由 K[0] 線性增加到 K[1]。
   · 答案唯一：窮舉 2⁶−1 個非空子集合，合計等於總價的必須剛好 1 個；不夠就重抽（TRIES 次，保底用固定題）。
   · 陷阱：合計與總價只差 1～3 元的子集合至少 TRAP_MIN 個（0→4 線性），所以「差不多」的組合很多。
   · 價格範圍：第 1～5 關 10～60 元、之後 5～99 元；限時 TIME_S 40→20 秒（線性）。
   · V1.32（玩家意見：只要把按鈕價格的個位數加起來，就能猜出哪幾個是答案）：
       1. 答案以外的按鈕，個位數有 DIGIT_P 的機率跟「某個正確答案」的個位數一樣（例如答案是 32、14、55，其他按鈕就可能是 52、64、25），
          這樣光看個位數湊不出答案。但不是每個、也不是每關都這樣（答案以外有 2 個以上時，至少 1 個有、至少 1 個沒有），不然六個按鈕會明顯分成兩組。
       2. 答案以外的按鈕，標價一定比總價小（例如總價 94、按鈕卻是 96，一眼就知道不是），而且任何一個按鈕加上最便宜的另一個按鈕都不超過總價
          （否則那個按鈕不可能出現在答案裡，也很容易被刪掉）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'basket';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 30 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 15;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 20;
    var K = [2, 5];                             /* 總價由幾樣組成：第 1 關 → 到頂 */
    var TRAP_MIN = [0, 4];                      /* 「差 1～3 元」的子集合至少幾個 */
    var TIME_S = [40, 20];                      /* 每關限時（秒） */
    var DIGIT_P = 0.6;                          /* 答案以外的按鈕，個位數跟「某個正確答案」一樣的機率（0＝不特別做，1＝全部都做；答案以外有 2 個以上時，每關至少 1 個有做、至少 1 個沒做） */
    var LIVES = 2, TRIES = 3000;
    /* 蔬果：[emoji 的 Unicode 碼位, 名稱]（標價是遊戲設定，不跟真實市價；用碼位寫，避免檔案編碼讓 emoji 變形） */
    var ITEMS = [
        [0x1F347, '葡萄'], [0x1F348, '哈密瓜'], [0x1F349, '西瓜'], [0x1F34A, '橘子'], [0x1F34B, '檸檬'], [0x1F34C, '香蕉'], [0x1F34D, '鳳梨'],
        [0x1F96D, '芒果'], [0x1F34E, '蘋果'], [0x1F34F, '青蘋果'], [0x1F350, '梨子'], [0x1F351, '桃子'], [0x1F352, '櫻桃'], [0x1F353, '草莓'],
        [0x1F345, '番茄'], [0x1F346, '茄子'], [0x1F33D, '玉米'], [0x1F336, '辣椒'], [0x1F344, '香菇'], [0x1F951, '酪梨'], [0x1F952, '小黃瓜'],
        [0x1F96C, '青菜'], [0x1F966, '花椰菜'], [0x1F954, '馬鈴薯'], [0x1F9C4, '大蒜'], [0x1F9C5, '洋蔥'], [0x1F955, '紅蘿蔔'], [0x1F330, '栗子']
    ];
    function emojiOf(item) { return String.fromCodePoint(item[0]); }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function kAt(level) { return Math.round(kit.ramp(level, K[0], K[1], RAMP_LEVELS)); }
    function trapMinAt(level) { return Math.round(kit.ramp(level, TRAP_MIN[0], TRAP_MIN[1], RAMP_LEVELS)); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function priceRange(level) { return level <= 5 ? [10, 60] : [5, 99]; }
    /* 所有非空子集合的合計：回傳 [{mask, sum}] */
    function subsets(prices) {
        var out = [];
        for (var m = 1; m < (1 << prices.length); m++) {
            var s = 0; for (var i = 0; i < prices.length; i++) if (m & (1 << i)) s += prices[i];
            out.push({ mask: m, sum: s });
        }
        return out;
    }
    function bitCount(m) { var n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
    /* 出題：回傳 { names, emojis, prices, total, mask（答案的子集合）, k, near（差 1～3 元的子集合數）, sameDigit（答案以外的按鈕裡，個位數跟某個正確答案一樣的有幾個）} */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var r = priceRange(level), k = kAt(level), need = trapMinAt(level), pick = kit.shuffle(ITEMS, rand).slice(0, 6), nd = 6 - k;
        var pool = []; for (var p = r[0]; p <= r[1]; p++) pool.push(p);
        for (var t = 0; t < TRIES; t++) {
            /* 先決定答案（k 個價格），總價 ＝ 它們的和；再決定其他按鈕：一定比總價小，個位數有機會跟答案的一樣 */
            var ans = kit.shuffle(pool, rand).slice(0, k), total = 0, taken = {}, digs = [];
            ans.forEach(function (v) { total += v; taken[v] = true; digs.push(v % 10); });
            var cands = pool.filter(function (v) { return v < total && !taken[v]; });
            if (cands.length < nd) continue;
            var flags = [], i;
            for (i = 0; i < nd; i++) flags.push(rand() < DIGIT_P);
            if (nd >= 2) {                                                                  /* 不能全部都做、也不能全部都沒做（六個按鈕會明顯分成兩組，或完全沒有迷惑效果） */
                var nf = flags.filter(function (x) { return x; }).length;
                if (nf === nd) flags[Math.floor(rand() * nd)] = false;
                else if (nf === 0) flags[Math.floor(rand() * nd)] = true;
            }
            var decoys = [];
            for (i = 0; i < nd; i++) {
                var c = cands.filter(function (v) { return !taken[v] && (!flags[i] || digs.indexOf(v % 10) >= 0); });
                if (!c.length) c = cands.filter(function (v) { return !taken[v]; });
                if (!c.length) break;
                var v = kit.pick(c, rand); decoys.push(v); taken[v] = true;
            }
            if (decoys.length < nd) continue;
            var items = kit.shuffle(ans.map(function (v) { return { p: v, a: true }; }).concat(decoys.map(function (v) { return { p: v, a: false }; })), rand);
            var prices = items.map(function (x) { return x.p; }), mask = 0;
            items.forEach(function (x, j) { if (x.a) mask |= 1 << j; });
            var sorted = prices.slice().sort(function (x, y) { return x - y; }), plausible = true;
            for (i = 0; i < 6; i++) { var other = prices[i] === sorted[0] ? sorted[1] : sorted[0]; if (prices[i] + other > total) plausible = false; }
            if (!plausible) continue;                                                      /* 每個按鈕都要有機會出現在答案裡，不能一看就知道是廢的 */
            var subs = subsets(prices), eq = subs.filter(function (s) { return s.sum === total; });
            if (eq.length !== 1) continue;
            var near = subs.filter(function (s) { var d = Math.abs(s.sum - total); return d >= 1 && d <= 3; }).length;
            if (near < need) continue;
            return { names: pick.map(function (x) { return x[1]; }), emojis: pick.map(emojiOf), prices: prices, total: total, mask: mask, k: k, near: near, sameDigit: decoys.filter(function (v) { return digs.indexOf(v % 10) >= 0; }).length };
        }
        var fp = [38, 52, 67, 45, 29, 83], fm = 1 | 2 | 8;     /* 保底：38＋52＋45 ＝ 135，唯一 */
        return { names: pick.map(function (x) { return x[1]; }), emojis: pick.map(emojiOf), prices: fp, total: 135, mask: fm, k: 3, near: 0, sameDigit: 0 };
    }
    function maskSum(prices, mask) { var s = 0; for (var i = 0; i < prices.length; i++) if (mask & (1 << i)) s += prices[i]; return s; }
    function maskText(q, mask) {
        var parts = [], sum = 0;
        for (var i = 0; i < q.prices.length; i++) if (mask & (1 << i)) { parts.push(q.prices[i]); sum += q.prices[i]; }
        return parts.join(' ＋ ') + ' ＝ ' + sum;
    }
    function rating(n) {
        if (n >= 15) return '菜市場大師！';
        if (n >= 10) return '高手！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '多練習心算，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, lives: LIVES, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), mask = 0;
        api.info = q;
        console.log('[菜籃總價] 第 ' + level + ' 關：總價 ' + q.total + '；價格 ' + q.prices.join(',') + '；答案 ' + maskText(q, q.mask) + '（' + q.k + ' 樣）；差 1～3 元的組合 ' + q.near + ' 個；個位數跟答案一樣的其他按鈕 ' + q.sameDigit + ' 個；限時 ' + timeMs(level) + ' ms');

        var big = h('div', { 'class': 'bsk-total', text: '總價 ' + q.total + ' 元' });
        var tip = h('div', { 'class': 'bsk-tip', text: '挑幾樣，讓價格加起來剛好是總價' });
        var tiles = q.prices.map(function (p, i) {
            var el = h('div', { 'class': 'bsk-tile' }, [
                h('div', { 'class': 'bsk-ico', text: q.emojis[i] }), h('div', { 'class': 'bsk-name', text: q.names[i] }), h('div', { 'class': 'bsk-price', text: p + ' 元' })
            ]);
            kit.onTap(el, function () { toggle(i); });
            return el;
        });
        var grid = h('div', { 'class': 'bsk-grid' }, tiles);
        var info = h('div', { 'class': 'bsk-info' });
        var bClear = h('button', { 'class': 'btn btn--line', text: '全部放回' });
        var bPay = h('button', { 'class': 'btn btn--go', text: '結帳' });
        [big, tip, grid, info, h('div', { 'class': 'rx-btnrow' }, [bClear, bPay])].forEach(function (e) { stage.appendChild(e); });
        var hint = null;
        /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「正確組合裡的一樣菜」上（第一關的正確答案之一） */
        if (level === 1 && kit.once('basket.hint')) {
            var firstIdx = 0; while (firstIdx < tiles.length - 1 && !(q.mask & (1 << firstIdx))) firstIdx++;
            hint = kit.hintOn(stage, tiles[firstIdx], { mode: 'tap', text: '請點擊要買的菜' });
        }
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        function paint() { tiles.forEach(function (el, i) { el.classList.toggle('bsk-tile--on', !!(mask & (1 << i))); }); }
        function toggle(i) { if (api.over) return; hideHint(); mask ^= 1 << i; Sfx.play('click'); paint(); }
        kit.onTap(bClear, function () { if (api.over) return; mask = 0; Sfx.play('click'); paint(); });
        function ans() { tiles.forEach(function (el, i) { if (q.mask & (1 << i)) el.classList.add('bsk-tile--ans'); }); }
        function pay() {
            if (api.over) return;
            hideHint();
            var sum = maskSum(q.prices, mask);
            if (mask && sum === q.total) {
                info.textContent = '剛剛好！' + maskText(q, mask); info.classList.add('bsk-info--ok');
                api.pass({ delay: 900 });
                return;
            }
            var lines = ['你選的合計是 ' + sum + ' 元，不是 ' + q.total + ' 元', '正確的組合：' + maskText(q, q.mask), '一共有 ' + q.near + ' 種合計只差 1～3 元的組合，很容易選錯'];
            var left = api.lose({ lines: lines });
            if (left > 0) {
                info.textContent = '合計 ' + sum + ' 元，不對喔（還有 ' + left + ' 條命）'; info.classList.add('bsk-info--bad');
                grid.classList.add('bsk-grid--shake'); api.after(450, function () { grid.classList.remove('bsk-grid--shake'); });
                mask = 0; paint();
            } else { info.textContent = '正確答案：' + maskText(q, q.mask); info.classList.add('bsk-info--bad'); ans(); }
        }
        kit.onTap(bPay, pay);
        api.timer(timeMs(level), function () {
            info.textContent = '時間到！正確答案：' + maskText(q, q.mask); info.classList.add('bsk-info--bad'); ans();
            api.fail({ delay: 2000, lines: ['時間到！', '正確的組合：' + maskText(q, q.mask)] });
        });
        api.solve = function () { mask = q.mask; paint(); pay(); };
        api.wrong = function () { mask = q.mask === 1 ? 2 : 1; paint(); pay(); };
    }

    var G = {
        id: ID,
        name: '菜籃總價',
        rule: '上方是這次要買的總價。從下方六樣蔬菜水果挑幾樣，**讓標價加起來剛好等於總價**，按「結帳」。畫面不會幫你加總，**要自己算**。有兩條命，結帳錯一次扣一條。每關有時間限制，越後面要選的樣數越多、差一點點的組合越多。',
        mount: mount,
        score: SCORE,
        test: { kAt: kAt, trapMinAt: trapMinAt, timeMs: timeMs, priceRange: priceRange, subsets: subsets, bitCount: bitCount, makeLevel: makeLevel, maskSum: maskSum, maskText: maskText, rating: rating, ITEMS: ITEMS, emojiOf: emojiOf, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, DIGIT_P: DIGIT_P, K: K, TRAP_MIN: TRAP_MIN, LIVES: LIVES }
    };
    Reaction.register(G);
})();
