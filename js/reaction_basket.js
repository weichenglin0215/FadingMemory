/* ═══════════════════════════════════════════════════════════════════
   reaction_basket.js — 秒反應・菜籃總價
   樣式：css/games/reaction_basket.css（這款專屬的 class 一律以「basket-」開頭；共用元件在 css/reaction_common.css）
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
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'basket'：選單、成績、存檔都靠它；樣式在 css/games/reaction_basket.css，裡面的 class 名稱一律以 basket- 開頭。 */
    'use strict';

    var ID = 'basket';                                  /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var K = [2, 5];                             /* 總價由幾樣組成：第 1 關 → 到頂 */
    var TRAP_MIN = [0, 4];                      /* 「差 1～3 元」的子集合至少幾個 */
    var TIME_S = [40, 20];                      /* 每關限時（秒） */
    var DIGIT_P = 0.6;                          /* 答案以外的按鈕，個位數跟「某個正確答案」一樣的機率（0＝不特別做，1＝全部都做；答案以外有 2 個以上時，每關至少 1 個有做、至少 1 個沒做） */
    var LIVES = 2, TRIES = 3000;                    /* 命數（答錯一次扣一條，用完就結束）；TRIES：出題時最多重抽幾次 */
    /* 蔬果：[emoji 的 Unicode 碼位, 名稱]（標價是遊戲設定，不跟真實市價；用碼位寫，避免檔案編碼讓 emoji 變形） */
    var ITEMS = [
        [0x1F347, '葡萄'], [0x1F348, '哈密瓜'], [0x1F349, '西瓜'], [0x1F34A, '橘子'], [0x1F34B, '檸檬'], [0x1F34C, '香蕉'], [0x1F34D, '鳳梨'],
        [0x1F96D, '芒果'], [0x1F34E, '蘋果'], [0x1F34F, '青蘋果'], [0x1F350, '梨子'], [0x1F351, '桃子'], [0x1F352, '櫻桃'], [0x1F353, '草莓'],
        [0x1F345, '番茄'], [0x1F346, '茄子'], [0x1F33D, '玉米'], [0x1F336, '辣椒'], [0x1F344, '香菇'], [0x1F951, '酪梨'], [0x1F952, '小黃瓜'],
        [0x1F96C, '青菜'], [0x1F966, '花椰菜'], [0x1F954, '馬鈴薯'], [0x1F9C4, '大蒜'], [0x1F9C5, '洋蔥'], [0x1F955, '紅蘿蔔'], [0x1F330, '栗子']
    ];
    var ICO_FONT = 46;                                  /* 蔬果圖案的大小（跟字級 46px 的文字 emoji 一樣大） */
    function emojiOf(item) { return String.fromCodePoint(item[0]); }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function kAt(level) { return Math.round(kit.ramp(level, K[0], K[1], RAMP_LEVELS)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function trapMinAt(level) { return Math.round(kit.ramp(level, TRAP_MIN[0], TRAP_MIN[1], RAMP_LEVELS)); }  /* Math.round：四捨五入成整數 */
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
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var r = priceRange(level), k = kAt(level), need = trapMinAt(level), pick = kit.shuffle(ITEMS, rand).slice(0, 6), nd = 6 - k;  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        var pool = []; for (var p = r[0]; p <= r[1]; p++) pool.push(p);
        for (var t = 0; t < TRIES; t++) {
            /* 先決定答案（k 個價格），總價 ＝ 它們的和；再決定其他按鈕：一定比總價小，個位數有機會跟答案的一樣 */
            var ans = kit.shuffle(pool, rand).slice(0, k), total = 0, taken = {}, digs = [];
            ans.forEach(function (v) { total += v; taken[v] = true; digs.push(v % 10); });  /* forEach：對陣列的每個元素各做一次 */
            var cands = pool.filter(function (v) { return v < total && !taken[v]; });  /* filter：留下符合條件的元素，回傳新陣列 */
            if (cands.length < nd) continue;
            var flags = [], i;
            for (i = 0; i < nd; i++) flags.push(rand() < DIGIT_P);
            if (nd >= 2) {                                                                  /* 不能全部都做、也不能全部都沒做（六個按鈕會明顯分成兩組，或完全沒有迷惑效果） */
                var nf = flags.filter(function (x) { return x; }).length;
                if (nf === nd) flags[Math.floor(rand() * nd)] = false;  /* Math.floor：無條件捨去成整數 */
                else if (nf === 0) flags[Math.floor(rand() * nd)] = true;
            }
            var decoys = [];
            for (i = 0; i < nd; i++) {
                var c = cands.filter(function (v) { return !taken[v] && (!flags[i] || digs.indexOf(v % 10) >= 0); });  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
                if (!c.length) c = cands.filter(function (v) { return !taken[v]; });
                if (!c.length) break;
                var v = kit.pick(c, rand); decoys.push(v); taken[v] = true;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            }
            if (decoys.length < nd) continue;
            var items = kit.shuffle(ans.map(function (v) { return { p: v, a: true }; }).concat(decoys.map(function (v) { return { p: v, a: false }; })), rand);  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var prices = items.map(function (x) { return x.p; }), mask = 0;
            items.forEach(function (x, j) { if (x.a) mask |= 1 << j; });
            var sorted = prices.slice().sort(function (x, y) { return x - y; }), plausible = true;  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
            for (i = 0; i < 6; i++) { var other = prices[i] === sorted[0] ? sorted[1] : sorted[0]; if (prices[i] + other > total) plausible = false; }
            if (!plausible) continue;                                                      /* 每個按鈕都要有機會出現在答案裡，不能一看就知道是廢的 */
            var subs = subsets(prices), eq = subs.filter(function (s) { return s.sum === total; });
            if (eq.length !== 1) continue;
            var near = subs.filter(function (s) { var d = Math.abs(s.sum - total); return d >= 1 && d <= 3; }).length;  /* Math.abs：取絕對值（去掉負號） */
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
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 15) return '菜市場大師！';
        if (n >= 10) return '高手！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '多練習心算，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        Reaction.emojiPng.whenReady(root, function () { kit.run(root, ctx, {   /* 蔬果圖案改貼 PNG（每種裝置看到的都一樣）：圖集載好才開始 */
            id: ID, G: G, maxLevel: MAX_LEVEL, lives: LIVES, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        }); });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand), mask = 0;
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[菜籃總價] 第 ' + level + ' 關：總價 ' + q.total + '；價格 ' + q.prices.join(',') + '；答案 ' + maskText(q, q.mask) + '（' + q.k + ' 樣）；差 1～3 元的組合 ' + q.near + ' 個；個位數跟答案一樣的其他按鈕 ' + q.sameDigit + ' 個；限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var big = h('div', { 'class': 'basket-total', text: '總價 ' + q.total + ' 元' });
        var tip = h('div', { 'class': 'basket-tip', text: '挑幾樣，讓價格加起來剛好是總價' });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */
        var tiles = q.prices.map(function (p, i) {
            var el = h('div', { 'class': 'basket-tile' }, [
                h('div', { 'class': 'basket-ico' }, [Reaction.emojiPng.el(q.emojis[i], ICO_FONT)]), h('div', { 'class': 'basket-name', text: q.names[i] }), h('div', { 'class': 'basket-price', text: p + ' 元' })
            ]);
            kit.onTap(el, function () { toggle(i); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            return el;
        });
        var grid = h('div', { 'class': 'basket-grid' }, tiles);
        var info = h('div', { 'class': 'basket-info' });
        var bClear = h('button', { 'class': 'btn btn--line', text: '全部放回' });
        var bPay = h('button', { 'class': 'btn btn--go', text: '結帳' });
        [big, tip, grid, info, h('div', { 'class': 'rx-btnrow' }, [bClear, bPay])].forEach(function (e) { stage.appendChild(e); });  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var hint = null;
        /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「正確組合裡的一樣菜」上（第一關的正確答案之一） */
        if (level === 1 && kit.once('basket.hint')) {   /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            var firstIdx = 0; while (firstIdx < tiles.length - 1 && !(q.mask & (1 << firstIdx))) firstIdx++;
            hint = kit.hintOn(stage, tiles[firstIdx], { mode: 'tap', text: '請點擊要買的菜' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        }
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint() { tiles.forEach(function (el, i) { el.classList.toggle('basket-tile--on', !!(mask & (1 << i))); }); }  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        function toggle(i) { if (api.over) return; hideHint(); mask ^= 1 << i; Sfx.play('click'); paint(); }  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
        kit.onTap(bClear, function () { if (api.over) return; mask = 0; Sfx.play('click'); paint(); });
        function ans() { tiles.forEach(function (el, i) { if (q.mask & (1 << i)) el.classList.add('basket-tile--ans'); }); }
        function pay() {
            if (api.over) return;
            hideHint();
            var sum = maskSum(q.prices, mask);
            if (mask && sum === q.total) {
                info.textContent = '剛剛好！' + maskText(q, mask); info.classList.add('basket-info--ok');  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                api.pass({ delay: 900 });               /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                return;
            }
            var lines = ['你選的合計是 ' + sum + ' 元，不是 ' + q.total + ' 元', '正確的組合：' + maskText(q, q.mask), '一共有 ' + q.near + ' 種合計只差 1～3 元的組合，很容易選錯'];
            var left = api.lose({ lines: lines });
            if (left > 0) {
                info.textContent = '合計 ' + sum + ' 元，不對喔（還有 ' + left + ' 條命）'; info.classList.add('basket-info--bad');
                grid.classList.add('basket-grid--shake'); api.after(450, function () { grid.classList.remove('basket-grid--shake'); });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                mask = 0; paint();
            } else { info.textContent = '正確答案：' + maskText(q, q.mask); info.classList.add('basket-info--bad'); ans(); }
        }
        kit.onTap(bPay, pay);
        api.timer(timeMs(level), function () {          /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
            info.textContent = '時間到！正確答案：' + maskText(q, q.mask); info.classList.add('basket-info--bad'); ans();
            api.fail({ delay: 2000, lines: ['時間到！', '正確的組合：' + maskText(q, q.mask)] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        });
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { mask = q.mask; paint(); pay(); };
        api.wrong = function () { mask = q.mask === 1 ? 2 : 1; paint(); pay(); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '菜籃總價',
        rule: '上方是這次要買的總價。從下方六樣蔬菜水果挑幾樣，**讓標價加起來剛好等於總價**，按「結帳」。畫面不會幫你加總，**要自己算**。有兩條命，結帳錯一次扣一條。每關有時間限制，越後面要選的樣數越多、差一點點的組合越多。',
        mount: mount,
        score: SCORE,
        test: { kAt: kAt, trapMinAt: trapMinAt, timeMs: timeMs, priceRange: priceRange, subsets: subsets, bitCount: bitCount, makeLevel: makeLevel, maskSum: maskSum, maskText: maskText, rating: rating, ITEMS: ITEMS, emojiOf: emojiOf, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, DIGIT_P: DIGIT_P, K: K, TRAP_MIN: TRAP_MIN, LIVES: LIVES }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
