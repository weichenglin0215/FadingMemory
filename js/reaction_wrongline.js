/* ═══════════════════════════════════════════════════════════════════
   reaction_wrongline.js — 秒反應・哪一行算錯（企劃 130）
   樣式：css/games/reaction_wrongline.css（這款專屬的 class 一律以「wrongline-」開頭；共用元件在 css/reaction_common.css）
   一份「計算過程」有好幾行（例如  25 × 3 ＝ 75／18 × 2 ＝ 36／75 ＋ 36 ＝ 111），其中「有一行算錯」，
   點出算錯的那一行。不是只看最後答案，而是檢查每一行的過程。
   關卡制：點錯行或來不及就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 兩種計算過程：
       run  連續計算（48 ＋ 27 ＝ 75、75 − 18 ＝ 57、57 × 3 ＝ 171…），每一行的第一個數字是上一行的結果；
       shop 買東西結帳（單價 × 數量、兩項相加、付錢找零），上方有一行說明。
   · 出題（規範 Q1：先決定結果、再反推畫面）：先算出每一行「正確的結果」，再挑一行把結果寫錯；
     「寫錯的結果」會被後面的行照單全收（接著算下去），所以後面的行「自己」都是對的，
     全部行裡只有一行寫錯，答案唯一（測試會逐題檢查）。
   · 難度線性（RAMP_LEVELS 題走到頂）：行數 3 → 6 行；寫錯的幅度從「差 10、差 100」（很明顯）
     變成「差 1、十位個位對調」（很細）；限時＝(基本秒數＋每行秒數×行數)×倍率。
   · 答錯／逾時：算錯的那一行用紅字寫出正確結果。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'wrongline'：選單、成績、存檔都靠它；樣式在 css/games/reaction_wrongline.css，裡面的 class 名稱一律以 wrongline- 開頭。 */
    'use strict';

    var ID = 'wrongline';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var LINES = [3, 6];                         /* 計算過程有幾行：第 1 題 → 到頂 */
    var TIME_BASE = 3.0, TIME_PER_LINE = 1.4;   /* 限時（秒）＝ (TIME_BASE ＋ TIME_PER_LINE × 行數) × 倍率 */
    var TIME_MUL = [1.3, 0.85];                 /* 倍率：第 1 題 → 到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var SHOP_P = 0.5;                           /* 出「買東西」題型的機率（其他是連續計算） */
    var ITEMS = [['飲料', '瓶'], ['麵包', '個'], ['便當', '個'], ['水果', '盒'], ['牛奶', '瓶'], ['雞蛋', '盒']];  /* 題目裡的物品與量詞：[名稱, 單位] */
    var MUL = '×', ADD = '＋', SUB = '−';            /* MUL：乘號；ADD：加號；SUB：減號（畫面上顯示用） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function linesFor(level) { return kit.clamp(Math.round(kit.ramp(level, LINES[0], LINES[1], RAMP_LEVELS)), LINES[0], LINES[1]); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function ansMs(level) { return Math.round((TIME_BASE + TIME_PER_LINE * linesFor(level)) * kit.ramp(level, TIME_MUL[0], TIME_MUL[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    function apply(op, x, y) { return op === ADD ? x + y : (op === SUB ? x - y : x * y); }
    /* 把結果寫錯：回傳一個「看起來合理的錯誤結果」（正整數、位數不變、不等於正確結果）。hard＝0（很明顯）～1（很細） */
    function wrongOf(truth, hard, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var c = [];
        function add(v, w) { if (v > 0 && v !== truth && String(v).length === String(truth).length) c.push({ v: v, w: w }); }
        add(truth + 10, (1 - hard) * 3 + 1); add(truth - 10, (1 - hard) * 3 + 1);
        if (truth >= 200) { add(truth + 100, (1 - hard) * 2 + 0.3); add(truth - 100, (1 - hard) * 2 + 0.3); }
        add(truth + 1, 0.5 + 2 * hard); add(truth - 1, 0.5 + 2 * hard);
        if (truth >= 10) {                                         /* 十位個位對調（只換最後兩位） */
            var t = truth % 100, ti = Math.floor(t / 10), u = t % 10;  /* Math.floor：無條件捨去成整數 */
            if (ti !== u) add(truth - t + u * 10 + ti, 1 + 2 * hard);
        }
        var total = c.reduce(function (a, x) { return a + x.w; }, 0), x = rand() * total;  /* reduce：把陣列的元素一個一個累積成一個值（例如加總） */
        for (var i = 0; i < c.length; i++) { x -= c[i].w; if (x <= 0) return c[i].v; }
        return c.length ? c[c.length - 1].v : truth + 10;
    }
    /* 依「步驟表」算出每一行：steps 的每一項是 { op, x, y }，x／y 若是 { ref: i } 就是第 i 行（從 0 起算）的「寫出來的結果」。
       wrongIdx 那一行把結果寫錯（用 wrongVal），其餘行都照寫出來的數字正確計算。回傳每一行 { x, op, y, shown, truth, ok } */
    function evalSteps(steps, wrongIdx, wrongVal) {
        var shown = [], out = [];
        steps.forEach(function (st, i) {                /* forEach：對陣列的每個元素各做一次 */
            var x = typeof st.x === 'object' ? shown[st.x.ref] : st.x, y = typeof st.y === 'object' ? shown[st.y.ref] : st.y;
            var truth = apply(st.op, x, y);
            var s = i === wrongIdx ? wrongVal : truth;
            shown.push(s);
            out.push({ x: x, op: st.op, y: y, shown: s, truth: truth, ok: s === truth, text: x + ' ' + st.op + ' ' + y + ' ＝ ' + s, right: x + ' ' + st.op + ' ' + y + ' ＝ ' + truth });
        });
        return out;
    }
    /* 「連續計算」的步驟表：n 行，起始數字、每一步的運算符號與第二個數字都要讓結果保持在 1～999 的正整數 */
    function runSteps(n, rand) {
        for (var tr = 0; tr < 200; tr++) {
            var cur = kit.randInt(20, 99, rand), steps = [], good = true;  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            for (var i = 0; i < n && good; i++) {
                var op = kit.pick([ADD, ADD, SUB, SUB, MUL], rand), y, r;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
                if (op === ADD) { y = kit.randInt(11, 99, rand); r = cur + y; }  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
                else if (op === SUB) { if (cur < 14) { good = false; break; } y = kit.randInt(11, Math.max(11, cur - 3), rand); r = cur - y; }
                else { y = kit.randInt(2, 9, rand); r = cur * y; }
                if (r < 10 || r > 999) { good = false; break; }
                steps.push({ op: op, x: i === 0 ? cur : { ref: i - 1 }, y: y });
                cur = r;
            }
            if (good && steps.length === n) return steps;
        }
        return [{ op: ADD, x: 48, y: 27 }, { op: SUB, x: { ref: 0 }, y: 18 }, { op: MUL, x: { ref: 1 }, y: 3 }].slice(0, n);
    }
    /* 「買東西」的步驟表與說明文字：n＝3 行（兩項相乘＋相加）、4 行（再付錢找零）、5 行（三項）、6 行（三項＋找零） */
    function shopSteps(n, rand) {
        var items = kit.sample(ITEMS, 3, rand), k = (n >= 5) ? 3 : 2, steps = [], head = [];  /* kit.sample(陣列, n, rand)：從陣列隨機取 n 個不重複的元素 */
        var priceMax = 60;
        var counts = [], prices = [];
        for (var i = 0; i < k; i++) { counts.push(kit.randInt(2, 6, rand)); prices.push(kit.randInt(12, priceMax, rand)); }
        steps.push({ op: MUL, x: prices[0], y: counts[0] });
        steps.push({ op: MUL, x: prices[1], y: counts[1] });
        steps.push({ op: ADD, x: { ref: 0 }, y: { ref: 1 } });
        var last = 2;
        if (k === 3) { steps.push({ op: MUL, x: prices[2], y: counts[2] }); steps.push({ op: ADD, x: { ref: last }, y: { ref: 3 } }); last = 4; }
        var total = steps.length ? null : 0;
        for (i = 0; i < k; i++) head.push(items[i][0] + ' ' + prices[i] + ' 元 × ' + counts[i] + ' ' + items[i][1]);
        if (n === 4 || n === 6) {
            var sum = prices.reduce(function (a, p, j) { return a + p * counts[j]; }, 0);  /* reduce：把陣列的元素一個一個累積成一個值（例如加總） */
            var pay = Math.ceil((sum + 1) / 100) * 100; /* Math.ceil：無條件進位成整數 */
            steps.push({ op: SUB, x: pay, y: { ref: last } });
            head.push('付 ' + pay + ' 元');
        }
        return { steps: steps, head: head.join('　') };
    }
    /* 出一題：{ type, head 說明文字（run 沒有）, lines 每一行, wrong 算錯的是第幾行（從 0 起算） } */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        var n = linesFor(level), hard = kit.ramp(level, 0, 1, RAMP_LEVELS);  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
        for (var tr = 0; tr < 200; tr++) {
            var type = rand() < SHOP_P ? 'shop' : 'run', steps, head = '';
            if (type === 'shop') { var sp = shopSteps(n, rand); steps = sp.steps; head = sp.head; }
            else steps = runSteps(n, rand);
            if (steps.length !== n) continue;
            var base = evalSteps(steps, -1, 0);
            if (base.some(function (l) { return l.truth <= 0 || l.truth > 9999 || !Number.isInteger(l.truth); })) continue;  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
            var wrong = kit.randInt(0, n - 1, rand);
            var wv = wrongOf(base[wrong].truth, hard, rand);
            if (wv === base[wrong].truth) continue;
            var lines = evalSteps(steps, wrong, wv);
            if (lines.some(function (l, i) { return l.shown <= 0 || l.shown > 9999 || (i !== wrong && !l.ok); })) continue;  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
            return { type: type, head: head, lines: lines, wrong: wrong };
        }
        var fb = evalSteps([{ op: MUL, x: 25, y: 3 }, { op: MUL, x: 18, y: 2 }, { op: ADD, x: { ref: 0 }, y: { ref: 1 } }], 1, 38);
        return { type: 'shop', head: '飲料 25 元 × 3 瓶　麵包 18 元 × 2 個', lines: fb, wrong: 1 };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 40) return '火眼金睛！';
        if (n >= 25) return '檢查很仔細！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '一行一行檢查，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
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

    var CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'];
    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeQuestion(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[哪一行算錯] 第 ' + level + ' 題（' + q.type + '）：' + q.lines.map(function (l, i) { return CIRCLED[i] + ' ' + l.text + (l.ok ? '' : '（錯，應為 ' + l.truth + '）'); }).join('；') + '，限時 ' + ansMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        /* 上面一欄由上往下排：說明文字（買東西才有，可能兩行）→「哪一行算錯了？」→ 每一行的按鈕；排在同一個直欄裡，不會互相蓋住 */
        var col = h('div', { 'class': 'wrongline-col' });
        var ask = h('div', { 'class': 'qz-note wrongline-ask', text: q.head ? q.head : '連續計算，哪一行算錯了？' });
        col.appendChild(ask);                           /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        if (q.head) col.appendChild(h('div', { 'class': 'wrongline-sub', text: '哪一行算錯了？' }));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var list = h('div', { 'class': 'wrongline-list' });
        var rowH = q.lines.length >= 5 ? 74 : 84;
        var rows = q.lines.map(function (l, i) {        /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var r = h('button', { 'class': 'wrongline-row', html: '<span class="wrongline-no">' + CIRCLED[i] + '</span><span class="wrongline-txt">' + l.text + '</span>' });
            r.style.height = rowH + 'px';
            kit.onTap(r, function () { judge(i); });    /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            list.appendChild(r);
            return r;
        });
        col.appendChild(list);
        stage.appendChild(col);
        api.timer(ansMs(level), function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('wrongline.hint')) kit.hintOn(stage, rows[q.wrong], { mode: 'tap', delay: 500, text: '請點擊算錯的那一行' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(i) {
            if (api.over) return;
            var ok = i === q.wrong;
            var wl = rows[q.wrong];
            wl.classList.add('wrongline-row--wrong');   /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            wl.querySelector('.wrongline-txt').innerHTML = q.lines[q.wrong].text + '<br><span class="wrongline-fix">應該是 ' + q.lines[q.wrong].right + '</span>';  /* querySelector：用 CSS 選擇器在網頁裡找元素 */
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1200 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            if (i != null) rows[i].classList.add('wrongline-row--miss');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: 2500, lines: [            /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                (i == null ? '時間到！' : '那一行是對的') + '，算錯的是第 ' + (q.wrong + 1) + ' 行',
                q.lines[q.wrong].text + ' → 應該是 ' + q.lines[q.wrong].right
            ] });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.wrong); };
        api.wrong = function () { judge((q.wrong + 1) % q.lines.length); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '哪一行算錯',
        rule: '一份計算過程有好幾行，其中「有一行算錯」，**點出算錯的那一行**。算錯的結果，後面幾行會接著用下去，所以**要一行一行檢查**。點錯或來不及就結束，看你能連續答對幾題。越後面，行數越多、錯得越細！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            linesFor: linesFor, ansMs: ansMs, apply: apply, wrongOf: wrongOf, evalSteps: evalSteps, runSteps: runSteps, shopSteps: shopSteps, makeQuestion: makeQuestion, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, LINES: LINES, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
