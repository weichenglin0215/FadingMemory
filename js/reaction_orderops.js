/* ═══════════════════════════════════════════════════════════════════
   reaction_orderops.js — 秒反應・先乘除（企劃 122）
   樣式：css/games/reaction_orderops.css（這款專屬的 class 一律以「orderops-」開頭；共用元件在 css/reaction_common.css）
   出一道四則運算（例如 8 − 3 × 2），下面兩顆按鈕是兩個答案（10 和 2），點出正確的那一個。
   錯的那個答案，是「不管先乘除，由左到右一路算下去」（或「忽略括號」）的結果，專門釣粗心的人。
   V1.38.0：第 OPTIONS4_FROM 題起改成四個答案——原本的兩個答案，各自再加一個「只差個位數」的答案（42 → 45、130 → 137），
   因為正確答案跟錯誤答案常常差很多，粗略估一下就能分出來；現在兩邊都有一組很接近的，一定要把個位數也算對。
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
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'orderops'：選單、成績、存檔都靠它；樣式在 css/games/reaction_orderops.css，裡面的 class 名稱一律以 orderops- 開頭。 */
    'use strict';

    var ID = 'orderops';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var NUMS = [3, 6];                          /* 算式裡的數字個數：第 1 題 → 到頂 */
    var NUM_MAX = [9, 12];                      /* 數字最大是多少：第 1 題 → 到頂（最小一律 1） */
    var DIV_FROM = 4;                           /* 第幾題起出現除法 */
    var PAREN1_FROM = 8, PAREN2_FROM = 20;      /* 第幾題起有 1 組／2 組括號 */
    var TIME_BASE = 15.0, TIME_PER_NUM = 1.2;    /* 限時（秒）＝ (TIME_BASE ＋ TIME_PER_NUM × (數字個數 − 2)) × 倍率 */
    var TIME_MUL = [1.0, 3.0];                 /* 倍率：第 1 題 → 到頂（越後面越趕） */
    var MAX_ANS = 999;                          /* 正確答案最大多少 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var SAME_MAX = 4;                           /* 正確答案放在同一個位置最多連續幾次 */
    var OPTIONS4_FROM = 15;                     /* 第幾題起改成四個答案（之前是兩個） */

    var OP_TEXT = { '+': '+', '-': '−', '*': '×', '/': '÷', '(': '(', ')': ')' };  /* 畫面上顯示的符號（減、乘、除用數學符號 − × ÷，括號用全形） */
    var CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];  /* 步驟前面的編號（①～⑩） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function numsFor(level) { return kit.clamp(Math.round(kit.ramp(level, NUMS[0], NUMS[1], RAMP_LEVELS)), NUMS[0], NUMS[1]); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function numMaxFor(level) { return Math.round(kit.ramp(level, NUM_MAX[0], NUM_MAX[1], RAMP_LEVELS)); }  /* Math.round：四捨五入成整數 */
    function parensFor(level, nums) {
        var p = level >= PAREN2_FROM ? 2 : (level >= PAREN1_FROM ? 1 : 0);
        if (p === 2 && nums < 5) p = 1;
        if (p === 1 && nums < 4) p = 0;
        return p;
    }
    /* 這一題有幾個答案：前面 2 個，從 OPTIONS4_FROM 題起 4 個 */
    function optionCount(level) { return level >= OPTIONS4_FROM ? 4 : 2; }
    /* 「只差個位數」的答案：跟 v 同一個十位（以上都一樣）、個位數不同，不是 0 以下、也不跟 exclude 裡的撞到。
       prefer 是想要的個位數（例如放進另一邊答案的個位數，讓「只算個位數」也分不出來）；那個個位數不能用就隨機挑一個。
       回傳 null＝挑不出來（不會發生：最多只有 3 個要避開的數） */
    function nearAnswer(v, exclude, prefer, rand) {
        var base = Math.floor(v / 10) * 10, pool = [], d, c;  /* Math.floor：無條件捨去成整數 */
        for (d = 0; d < 10; d++) {
            c = base + d;
            if (c !== v && c >= 1 && exclude.indexOf(c) < 0) pool.push(c);  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
        }
        if (!pool.length) return null;
        if (prefer != null && prefer !== v % 10) {
            c = base + prefer;
            if (pool.indexOf(c) >= 0) return c;         /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
        }
        return kit.pick(pool, rand);                    /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
    }
    function ansMs(level) {
        var n = numsFor(level);
        return Math.round((TIME_BASE + TIME_PER_NUM * (n - 2)) * kit.ramp(level, TIME_MUL[0], TIME_MUL[1], RAMP_LEVELS) * 1000);  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    }
    /* 算式還原器：tokens 是 [數字, '+'|'-'|'*'|'/', 數字, …, '(' , ')' …] 的陣列。
       mode：'std'＝照數學規則（括號先算、再乘除、最後加減）；'ltr'＝不管先乘除、由左到右一路算（括號還是先算）；
             'noparen'＝照數學規則，但假裝括號不存在。
       回傳 { value 結果, steps 每一步的文字, bad 有除以 0, frac 有除不盡的除法, neg 有算出負數 } */
    function reduceExpr(tokens, mode) {
        var steps = [], bad = false, frac = false, neg = false;
        var arr = tokens.slice();                       /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        if (mode === 'noparen') arr = arr.filter(function (t) { return t !== '(' && t !== ')'; });  /* filter：留下符合條件的元素，回傳新陣列 */
        /* a[i] 是運算符號，a[i-1]、a[i+1] 是左右數字：算完換成一個結果 */
        function apply(a, i) {
            var x = a[i - 1], op = a[i], y = a[i + 1], r;
            if (op === '+') r = x + y;
            else if (op === '-') r = x - y;
            else if (op === '*') r = x * y;
            else { if (y === 0) { bad = true; r = 0; } else { r = x / y; if (r !== Math.floor(r)) frac = true; } }  /* Math.floor：無條件捨去成整數 */
            if (r < 0) neg = true;
            steps.push(x + ' ' + OP_TEXT[op] + ' ' + y + ' ＝ ' + (r === Math.floor(r) ? r : Math.round(r * 10000) / 10000));  /* Math.round：四捨五入成整數 */
            a.splice(i - 1, 3, r);
        }
        function flat(a) {
            a = a.slice();                              /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
            if (mode === 'ltr') { while (a.length > 1) apply(a, 1); return a[0]; }
            for (; ;) {
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
        var parts = tokens.map(function (t) { return typeof t === 'number' ? String(t) : OP_TEXT[t]; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var out = '';
        parts.forEach(function (s, i) {                 /* forEach：對陣列的每個元素各做一次 */
            if (i > 0 && s !== ')' && parts[i - 1] !== '(') out += ' ';     /* 左括號後面、右括號前面不留空白 */
            out += s;
        });
        return out;
    }
    /* 步驟文字 → 「① 3 × 2 ＝ 6　② 8 − 6 ＝ 2」 */
    function stepsText(steps) { return steps.map(function (s, i) { return CIRCLED[i] + ' ' + s; }).join('　'); }  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
    /* 隨機排一個算式；回傳 tokens 與括號的位置記錄 */
    function randomTokens(level, rand) {
        var n = numsFor(level), mx = numMaxFor(level);
        var nums = [], i;
        for (i = 0; i < n; i++) nums.push(kit.randInt(1, mx, rand));  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        var pool = ['+', '-', '*'];
        if (level >= DIV_FROM) pool.push('/');
        var ops = [];
        for (i = 0; i < n - 1; i++) ops.push(kit.pick(pool, rand));  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        /* 至少要有一個乘除、一個加減，不然「先乘除」就沒有意義 */
        var mdCount = ops.filter(function (o) { return o === '*' || o === '/'; }).length;  /* filter：留下符合條件的元素，回傳新陣列 */
        if (mdCount === 0) ops[kit.randInt(0, n - 2, rand)] = level >= DIV_FROM && rand() < 0.4 ? '/' : '*';  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        else if (mdCount === ops.length) ops[kit.randInt(0, n - 2, rand)] = rand() < 0.5 ? '+' : '-';
        /* 括號：隨機挑不重疊的 2～3 個數字包起來（至少 2 個數字、至少 1 個運算符號） */
        var parens = parensFor(level, n), spans = [], t;
        for (t = 0; t < 30 && spans.length < parens; t++) {
            var len = kit.randInt(2, Math.min(3, n - 1), rand), st = kit.randInt(0, n - len, rand);
            if (len >= n) continue;
            if (spans.every(function (s) { return st + len - 1 < s[0] || st > s[1]; })) spans.push([st, st + len - 1]);  /* every：陣列裡「每一個」元素都符合條件才回傳 true */
        }
        var tokens = [];
        for (i = 0; i < n; i++) {
            spans.forEach(function (s) { if (s[0] === i) tokens.push('('); });  /* forEach：對陣列的每個元素各做一次 */
            tokens.push(nums[i]);
            spans.forEach(function (s) { if (s[1] === i) tokens.push(')'); });
            if (i < n - 1) tokens.push(ops[i]);
        }
        return { tokens: tokens, spans: spans.length };
    }
    /* 出一題：{ tokens, text, truth 正確答案, decoy 錯誤答案, decoyKind 'ltr'|'noparen', steps 還原步驟, wrongSteps 錯誤算法的步驟,
                options 全部的答案（optionCount 個、互不相同；四個答案時是 正確、正確的近似、錯誤、錯誤的近似）}
       近似答案的個位數故意放成「另一邊」的個位數（正確的近似用錯誤答案的個位數、錯誤的近似用正確答案的個位數），
       這樣只看個位數、或只估大小，都不能單獨判斷答案。 */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
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
            var out = { tokens: tokens, text: toText(tokens), truth: std.value, decoy: d.value, decoyKind: d.kind, steps: std.steps, wrongSteps: d.steps };
            out.options = optionsFor(level, out.truth, out.decoy, rand);
            return out;
        }
        var fb = [8, '-', 3, '*', 2];
        return {
            tokens: fb, text: toText(fb), truth: 2, decoy: 10, decoyKind: 'ltr', steps: ['3 × 2 ＝ 6', '8 − 6 ＝ 2'], wrongSteps: ['8 − 3 ＝ 5', '5 × 2 ＝ 10'],
            options: optionsFor(level, 2, 10, rand)
        };
    }
    /* 這一題的全部答案：兩個時是 [正確, 錯誤]；四個時再各加一個只差個位數的 */
    function optionsFor(level, truth, decoy, rand) {
        var opts = [truth, decoy];
        if (optionCount(level) < 4) return opts;
        var tn = nearAnswer(truth, [truth, decoy], decoy % 10, rand);
        var dn = nearAnswer(decoy, [truth, decoy, tn], truth % 10, rand);
        if (tn == null || dn == null) return opts;
        return [truth, tn, decoy, dn];
    }
    /* 正確答案放在第幾個位置（0～count−1）：隨機，但同一個位置最多連續 SAME_MAX 次（hist 記著前面每題放在哪） */
    function nextSlot(hist, count, rand) {
        rand = rand || Math.random;
        var n = hist.length, r = Math.floor(rand() * count);
        if (r >= count) r = count - 1;
        if (n >= SAME_MAX) {
            var last = hist[n - 1], same = true;
            for (var i = 1; i <= SAME_MAX; i++) if (hist[n - i] !== last) { same = false; break; }
            if (same && r === last) r = (r + 1 + Math.floor(rand() * (count - 1))) % count;
        }
        return r;
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 40) return '運算順序大師！';
        if (n >= 25) return '眼明手快！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '先乘除、後加減，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
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

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api, hist) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeQuestion(level, api.rand);
        var count = q.options.length, slot = nextSlot(hist, count, api.rand);
        hist.push(slot);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[先乘除] 第 ' + level + ' 題：' + q.text + ' ＝ ？ 正確 ' + q.truth + '，錯誤 ' + q.decoy + '（' + (q.decoyKind === 'ltr' ? '由左到右' : '忽略括號') + '），答案 ' + q.options.join('／') + '，限時 ' + ansMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var eq = h('div', { 'class': 'qz-big orderops-eq', text: q.text });
        /* 算式越長，字越小（約略估算：每個字寬 0.62 倍字級），保證一行放得下 */
        var fs = Math.max(50, Math.min(100, Math.floor(500 / (q.text.length * 0.60))));
        eq.style.fontSize = fs + 'px';
        var ask = h('div', { 'class': 'qz-note orderops-ask', text: '正確答案是哪一個？' });
        var reveal = h('div', { 'class': 'qz-note orderops-reveal' });
        stage.appendChild(eq); stage.appendChild(ask); stage.appendChild(reveal);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        /* 正確答案放在 slot，其餘答案隨機填進剩下的位置 */
        var others = kit.shuffle(q.options.filter(function (v) { return v !== q.truth; }), api.rand), vals = [];  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        for (var si = 0; si < count; si++) vals.push(si === slot ? q.truth : others.shift());
        var grid = kit.btnGrid(stage, vals.map(function (v) {  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
            return { text: String(v), kind: 'sky', cls: 'orderops-btn', onTap: function () { judge(v); } };
        }), count === 4 ? { cols: 2, h: 100 } : { h: 120 });
        var bTruth = grid.btns[slot];
        api.timer(ansMs(level), function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('orderops.hint')) kit.hintOn(stage, bTruth, { mode: 'tap', delay: 500, text: '請點擊按鈕' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(v) {
            if (api.over) return;
            var ok = v === q.truth;
            eq.classList.add(ok ? 'qz-ok' : 'qz-bad');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            reveal.textContent = stepsText(q.steps);    /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1000 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({                                  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                delay: 2400, lines: [
                    (v == null ? '時間到！' : '你選了 ' + v) + '，正確答案是 ' + q.truth,
                    '運算順序：' + stepsText(q.steps),
                    (q.decoyKind === 'ltr' ? '由左到右算會得到 ' : '忽略括號會得到 ') + q.decoy + '（錯）'
                ]
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.truth); };
        api.wrong = function () { judge(q.decoy); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '先乘除',
        rule: '畫面上有一道四則運算，下面的答案只有一個是對的。要記得：**括號先算，再算乘除，最後才算加減**。有一個錯的答案，是**「由左到右一路算下去」的陷阱**。答錯或來不及就結束，看你能連續答對幾題。越後面，算式越長、還會有除法和括號，答案也會變成四個，有的只差個位數，要算準！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            numsFor: numsFor, numMaxFor: numMaxFor, parensFor: parensFor, ansMs: ansMs, reduceExpr: reduceExpr, toText: toText, stepsText: stepsText,
            randomTokens: randomTokens, makeQuestion: makeQuestion, nextSlot: nextSlot, nearAnswer: nearAnswer, optionCount: optionCount, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, NUMS: NUMS, NUM_MAX: NUM_MAX, DIV_FROM: DIV_FROM, PAREN1_FROM: PAREN1_FROM, PAREN2_FROM: PAREN2_FROM, MAX_ANS: MAX_ANS, MAX_LEVEL: MAX_LEVEL, SAME_MAX: SAME_MAX, OPTIONS4_FROM: OPTIONS4_FROM
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
