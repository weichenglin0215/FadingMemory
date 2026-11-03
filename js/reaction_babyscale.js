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
   · 出題：亂數重量 → 從「兩個一起」「三個一起」（前面的關卡還有「一個人單獨量」）的紀錄裡隨機加，直到問的那一個「算得出來」
     （線性代數：它在紀錄的組合裡）→ 再把多餘的紀錄拿掉（每一條都用得到）；第 12 關起多一條用不到的紀錄混在裡面。
   · 使用者的意見（V1.43.0）：①第 1～7 關太簡單、第 8 關突然變得很難；②「行李箱＋寵物＝48、全部＝99，哥哥幾公斤？」太莫名其妙——
     題目只用「全部」包含哥哥，玩家根本不知道有幾個角色；這種題目也太簡單，只適合前兩三題。照做：
       A. **難度分數 D 一關一關線性往上**（取代以前「第 8 關以前有全部一起、第 9 關起沒有」的斷崖）：
          D＝用到的紀錄的分數加總（單獨 0.5、兩個一起 1、三個一起 1.4、全部一起 0.6）＋要除以 2 以上 1.2＋人和東西每多一個 0.3；
          第 1 關 D＝1.6 → 第 30 關 D＝8，出題時抽到的 D 要落在「該關目標 ± DIFF_WINDOW」之內，抽不到才用最接近的。
          所以 3 個人時只有「全部一起＋一條」「單獨＋一條」，4 個人起兩條紀錄相減、3 條加加減減，5～6 個人才要除以 2、用 4～5 條紀錄。
          「一個人單獨量」的紀錄是前面關卡（SINGLE_TO 以前，機會越來越小）的踏腳石，問的那一個不會有單獨的紀錄。
       B. **「全部一起」只出現在第 1～3 關**（TOTAL_TO）；而且只要有「全部一起」，問的那一個一定也出現在另一條紀錄裡
          （沒有就補一條「哥哥＋寵物＝XX 公斤」當提示）。
       C. **畫面最上面列出這一關出場的人和東西**（有幾個、是誰），玩家一眼就知道「全部」是誰。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'babyscale'：選單、成績、存檔都靠它；樣式在 css/games/reaction_babyscale.css，裡面的 class 名稱一律以 babyscale- 開頭。 */
    'use strict';

    var ID = 'babyscale';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                           /* 難度升到頂的關卡：第 1 關線性變難，到第 30 關最難，之後維持不變 */
    var ITEMS = [3, 6];                         /* 幾個人和東西：第 1 關 → 到頂 */
    var TOTAL_TO = 3;                           /* 第幾關以前有「全部一起」的紀錄（只適合前兩三題） */
    var TRIPLE_FROM = 6;                        /* 第幾關起有「三個一起」的紀錄（要 4 個人以上） */
    var DISTRACT_FROM = 12;                     /* 第幾關起多一條用不到的紀錄 */
    var SINGLE_TO = 24;                         /* 第幾關以前有「一個人單獨量」的紀錄（踏腳石）；機會從 SINGLE_P[0] 降到 SINGLE_P[1] */
    var SINGLE_P = [0.9, 0.15];                     /* 出現「一個人單獨量」紀錄的機率：第 1 關 90% → 到第 SINGLE_TO 關 15%（前面關卡多給踏腳石） */
    var DIFF = [1.6, 8.0];                      /* 難度分數 D 的目標：第 1 關 → 第 RAMP_LEVELS 關（線性） */
    var DIFF_WINDOW = 0.8;                      /* 抽到的題目 D 要在「目標 ± 這個數字」之內 */
    var REC_W = { 1: 0.5, 2: 1, 3: 1.4 };       /* 一條紀錄的分數（幾個一起）；「全部一起」固定 0.6 */
    var ALL_W = 0.6, DIV_W = 1.2, ITEM_W = 0.3; /* 全部一起、要除以 2 以上、人和東西每多一個（超過 3 個） */
    var TRIES = 800;                                /* 出題時最多重抽幾次（抽到難度剛好落在目標範圍的題目就停） */
    var MAX_EQS = 6;                            /* 紀錄最多幾條（含用不到的那條；舞台高度只放得下 6 條） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var PASS_DELAY_MS = 1500;                       /* 答對（過關）後停多久才換下一關（毫秒，1500 毫秒＝1.5 秒） */
    var FAIL_HOLD_MS = 7000;                        /* 答錯（失敗）後停多久才跳出結算畫面（毫秒，7000 毫秒＝7 秒），讓玩家先看清楚答案 */
    var TIME_BASE = 25, TIME_EQ = 8, TIME_SCALE = [1, 1.5];     /* 每一關限時（秒）＝（基本 ＋ 每一條紀錄幾秒）× 係數（第 1 關 → 第 RAMP_LEVELS 關，線性）；時間到了＝失敗（V1.43.1） */
    var THINGS = [                              /* 名稱、圖示、重量範圍（公斤） */
        { name: '阿公', icon: '👴', w: [58, 80] }, { name: '阿嬤', icon: '👵', w: [42, 60] },
        { name: '爸爸', icon: '👨', w: [62, 85] }, { name: '媽媽', icon: '👩', w: [46, 64] },
        { name: '哥哥', icon: '👦', w: [20, 38] }, { name: '寶寶', icon: '👶', w: [5, 12] },
        { name: '小貓', icon: '🐱', w: [3, 6] }, { name: '小狗', icon: '🐶', w: [6, 18] },
        { name: '行李箱', icon: '🧳', w: [9, 24] }, { name: '西瓜', icon: '🍉', w: [4, 9] }
    ];
    var CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];  /* 紀錄前面的編號（①～⑩） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function timeFor(level, nEqs) { return (TIME_BASE + TIME_EQ * nEqs) * kit.ramp(level, TIME_SCALE[0], TIME_SCALE[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 線性代數的小工具（浮點數＋容許誤差；係數都是 0／1，數字很小，不會有誤差問題） */
    function rank(rows) {
        var m = rows.map(function (r) { return r.slice(); }), rk = 0, cols = m.length ? m[0].length : 0;  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        for (var c = 0; c < cols && rk < m.length; c++) {
            var p = -1;
            for (var i = rk; i < m.length; i++) if (Math.abs(m[i][c]) > 1e-9) { p = i; break; }  /* Math.abs：取絕對值（去掉負號） */
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
        piv.forEach(function (c, r) { x[c] = A[r][m]; });  /* forEach：對陣列的每個元素各做一次 */
        for (var div = 1; div <= 12; div++) {
            if (x.every(function (v) { return Math.abs(v * div - Math.round(v * div)) < 1e-6; })) return { coef: x.map(function (v) { return Math.round(v * div); }), div: div };  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        }
        return null;
    }
    function sumOf(set, ws) { return set.reduce(function (a, i) { return a + ws[i]; }, 0); }  /* reduce：把陣列的元素一個一個累積成一個值（例如加總） */
    function rowOf(set, n) { var r = []; for (var i = 0; i < n; i++) r.push(set.indexOf(i) >= 0 ? 1 : 0); return r; }  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
    /* 所有「兩個一起」（和三個一起）的組合 */
    function subsets(n, withTriples) {
        var out = [], a, b, c;
        for (a = 0; a < n; a++) for (b = a + 1; b < n; b++) out.push([a, b]);
        if (withTriples) for (a = 0; a < n; a++) for (b = a + 1; b < n; b++) for (c = b + 1; c < n; c++) out.push([a, b, c]);
        return out;
    }
    /* 難度分數 D：用到的紀錄（sets，每條是人和東西的索引陣列）的分數加總＋要除以 2 以上＋人和東西多於 3 個的部分 */
    function difficultyOf(n, sets, div) {
        var d = 0;
        sets.forEach(function (st) { d += st.length === n ? ALL_W : (REC_W[st.length] || REC_W[3]); });
        return d + (div > 1 ? DIV_W : 0) + ITEM_W * (n - 3);
    }
    /* 出一題：{ things, ws, target, eqs:[{ set, sum, used, hint? }], coef, div, D（難度分數）}
       eqs 裡 used＝false 的是用不到的紀錄（干擾，或有「全部一起」時補上的、含問的那一個的提示紀錄 hint） */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var n = Math.round(kit.ramp(level, ITEMS[0], ITEMS[1], RAMP_LEVELS)), best = null, bestGap = 1e9;  /* Math.round：四捨五入成整數 */
        var goal = kit.ramp(level, DIFF[0], DIFF[1], RAMP_LEVELS), withAll = level <= TOTAL_TO;
        var pSingle = withAll || level > SINGLE_TO ? 0 : kit.ramp(level, SINGLE_P[0], SINGLE_P[1], SINGLE_TO);
        function rows(sets) { return sets.map(function (st) { return rowOf(st, n); }); }
        for (var tr = 0; tr < TRIES; tr++) {            /* 用亂數一直重抽，最多 TRIES 次，抽到符合條件的題目就收下 */
            var things = kit.shuffle(THINGS, rand).slice(0, n);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
            var ws = things.map(function (t) { return kit.randInt(t.w[0], t.w[1], rand); });  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            var target = kit.randInt(0, n - 1, rand);
            var pool = subsets(n, level >= TRIPLE_FROM && n >= 4), i;
            for (i = 0; i < n; i++) if (i !== target && rand() < pSingle) pool.push([i]);       /* 一個人單獨量（問的那一個除外） */
            var cand = kit.shuffle(pool, rand);
            var all = []; for (i = 0; i < n; i++) all.push(i);
            var sets = withAll ? [all] : [];
            for (var q = 0; q < cand.length && !determined(rows(sets), n, target); q++) sets.push(cand[q]);
            if (!determined(rows(sets), n, target)) continue;
            /* 拿掉多餘的紀錄（有「全部一起」時它留著，它是前面關卡的特色） */
            kit.shuffle(sets.slice(), rand).forEach(function (st) {
                if (withAll && st === all) return;
                var rest = sets.filter(function (x) { return x !== st; });  /* filter：留下符合條件的元素，回傳新陣列 */
                if (determined(rows(rest), n, target)) sets = rest;
            });
            if (withAll && determined(rows(sets.filter(function (x) { return x !== all; })), n, target)) continue;   /* 「全部一起」那條也要用得到 */
            var cb = combo(rows(sets), n, target);
            if (!cb) continue;
            var D = difficultyOf(n, sets, cb.div), gap = Math.abs(D - goal);
            if (gap >= bestGap && gap > DIFF_WINDOW) continue;
            var eqs = sets.map(function (st) { return { set: st, sum: sumOf(st, ws), used: true }; });
            if (withAll && !sets.some(function (st) { return st !== all && st.indexOf(target) >= 0; })) {      /* 只靠「全部」包含問的那一個：補一條含它的提示紀錄 */
                var hint = cand.filter(function (st) { return st.length === 2 && st.indexOf(target) >= 0 && !sets.some(function (x) { return x.join() === st.join(); }); })[0];  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
                if (!hint) continue;
                eqs.push({ set: hint, sum: sumOf(hint, ws), used: false, hint: true });
            }
            if (level >= DISTRACT_FROM) {
                var extra = cand.filter(function (st) { return st.length >= 2 && !eqs.some(function (x) { return x.set.join() === st.join(); }); })[0];
                if (extra) eqs.push({ set: extra, sum: sumOf(extra, ws), used: false });
            }
            if (eqs.length > MAX_EQS) continue;
            var order = kit.shuffle(eqs.map(function (_, k) { return k; }), rand);
            var coef = [];
            order.forEach(function (k) { coef.push(k < cb.coef.length && eqs[k].used ? cb.coef[sets.indexOf(eqs[k].set)] : 0); });
            var out = { things: things, ws: ws, target: target, eqs: order.map(function (k) { return eqs[k]; }), coef: coef, div: cb.div, D: D, goal: goal };
            if (gap <= DIFF_WINDOW) return out;
            best = out; bestGap = gap;
        }
        return best;        /* 保底：試了 TRIES 次都沒有落在目標難度的範圍內，就用最接近的那一題 */
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
    /* 結算畫面的評語：依成績回傳一句話 */
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

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var pz = makePuzzle(level, api.rand), n = pz.ws.length, tg = pz.things[pz.target];
        api.info = pz;                                  /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[抱著量體重] 第 ' + level + ' 關：' + n + ' 個、' + pz.eqs.length + ' 條紀錄，問' + tg.name);  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */
        var typed = '', over = false;

        var wrap = h('div', { 'class': 'babyscale-wrap' });  /* wrap：整個遊戲畫面的外框容器；下面建好的各個區塊（盤面、按鈕…）都放進它，最後再整個放進舞台 */
        var list = h('div', { 'class': 'babyscale-list' });
        /* 出場的人和東西（V1.43.0：玩家要知道有幾個角色、「全部」是誰） */
        var cast = h('div', { 'class': 'babyscale-cast' }, [h('span', { 'class': 'babyscale-cast__t', text: '出場 ' + n + ' 個：' })]);
        pz.things.forEach(function (t) { cast.appendChild(h('span', { 'class': 'babyscale-cast__i', text: t.icon + t.name })); });  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        list.appendChild(cast);
        list.appendChild(h('div', { 'class': 'babyscale-title', text: '一起站上體重計量的紀錄' }));
        pz.eqs.forEach(function (eq, k) {
            var names = eq.set.length === n ? '全部一起（' + n + ' 個）' : eq.set.length === 1 ? pz.things[eq.set[0]].name + ' 單獨' : eq.set.map(function (i) { return pz.things[i].name; }).join('＋');
            list.appendChild(h('div', { 'class': 'babyscale-eq' }, [h('span', { 'class': 'babyscale-eq__no', text: CIRCLED[k] }), h('span', { 'class': 'babyscale-eq__names', text: names }), h('span', { 'class': 'babyscale-eq__sum', text: '＝ ' + eq.sum + ' 公斤' })]));
        });
        var ask = h('div', { 'class': 'babyscale-ask' }, [h('span', { text: tg.icon + tg.name + ' 幾公斤？' })]);
        var box = h('div', { 'class': 'babyscale-answer' });
        ask.appendChild(box);
        var tip = h('div', { 'class': 'babyscale-tip', text: '用數字鍵填答案' });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */
        var btnOk = h('button', { 'class': 'btn btn--primary babyscale-ok', type: 'button', text: '確定' });
        kit.onTap(btnOk, submit);                       /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        wrap.appendChild(list); wrap.appendChild(ask); wrap.appendChild(tip);
        stage.appendChild(wrap);                        /* 把整個遊戲區放進舞台（放進去，畫面上才看得到） */
        /* 數字鍵的高度：舞台高度扣掉上面的紀錄、問題、提示、確定鈕之後剩下的（紀錄多、出場的人多時按鍵會矮一點） */
        var H = stage.clientHeight || 667, used = list.offsetHeight + ask.offsetHeight + 28 + 56 + 8 * 6 + 6;
        var keyH = Math.max(34, Math.min(46, Math.floor((H - used - 3 * 6) / 4)));  /* Math.floor：無條件捨去成整數 */
        var pad = Reaction.numpad(wrap, { keyH: keyH, onKey: onKey });  /* 共用數字鍵盤（7 8 9／4 5 6／1 2 3／清除 0 ⌫），按鍵會呼叫 onKey */
        wrap.appendChild(btnOk);

        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint() { box.textContent = typed; btnOk.disabled = !typed || over; }  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
        function onKey(k) {
            if (over) return;
            if (k === 'clr') typed = '';
            else if (k === 'del') typed = typed.slice(0, -1);
            else if (typed.length < 3) typed = typed === '0' ? k : typed + k;
            paint();
        }
        function submit() {
            if (over || !typed) return;
            over = true; api.stopTimer(); pad.setEnabled(false); paint();
            var work = workText(pz);
            tip.textContent = work;
            if (parseInt(typed, 10) === pz.ws[pz.target]) {
                box.classList.add('babyscale-answer--ok');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return;  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            }
            box.classList.add('babyscale-answer--bad');
            box.textContent = typed + '→' + pz.ws[pz.target];
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: ['你填 ' + typed + ' 公斤', work] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 時間到：顯示正確答案與算法，結算 */
        function timeUp() {
            if (over) return;
            over = true; pad.setEnabled(false); paint();
            var work = workText(pz);
            tip.textContent = work;
            box.classList.add('babyscale-answer--bad');
            box.textContent = (typed || '？') + '→' + pz.ws[pz.target];
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: ['時間到了', work] });
        }
        api.timeout = timeUp;
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { typed = String(pz.ws[pz.target]); paint(); submit(); };
        api.wrong = function () { typed = String(pz.ws[pz.target] + 1); paint(); submit(); };
        api.state = function () { return { typed: typed, over: over }; };
        api.timer(Math.round(timeFor(level, pz.eqs.length) * 1000), timeUp);  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        paint();
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '抱著量體重',
        rule: '畫面最上面寫著**這一關出場的人和東西**。他們**兩個或三個一起站上體重計**（抱著、提著），紀錄寫成一條一條，例如「阿公＋寶寶＝82 公斤」；前面幾關有的紀錄是「一個人單獨量」，最前面幾關還有「全部一起」量的重量。**題目問其中一個幾公斤**，用數字鍵填答案、按「確定」。**答錯一次就結束**，會列出算法。小撇步：兩條紀錄相減，一樣的那一個就消掉了。每一關有時間限制（上面的時間條，紀錄越多給的時間越長），時間到了也算失敗。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            rank: rank, determined: determined, combo: combo, subsets: subsets, makePuzzle: makePuzzle, difficultyOf: difficultyOf, timeFor: timeFor, TIME_BASE: TIME_BASE, TIME_EQ: TIME_EQ, TIME_SCALE: TIME_SCALE, workText: workText, checkCombo: checkCombo, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ITEMS: ITEMS, MAX_EQS: MAX_EQS, TOTAL_TO: TOTAL_TO, TRIPLE_FROM: TRIPLE_FROM, DISTRACT_FROM: DISTRACT_FROM, SINGLE_TO: SINGLE_TO, DIFF: DIFF, DIFF_WINDOW: DIFF_WINDOW, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
