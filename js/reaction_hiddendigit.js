/* ═══════════════════════════════════════════════════════════════════
   reaction_hiddendigit.js — 秒反應・遮住的數字（企劃 126「個位數快算」的改版）
   樣式：css/games/reaction_hiddendigit.css（這款專屬的 class 一律以「hiddendigit-」開頭；共用元件在 css/reaction_common.css）
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
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'hiddendigit'：選單、成績、存檔都靠它；樣式在 css/games/reaction_hiddendigit.css，裡面的 class 名稱一律以 hiddendigit- 開頭。 */
    'use strict';

    var ID = 'hiddendigit';                             /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var TIME_MUL = [2.0, 3.0];                  /* 限時倍率：第 1 題 → 到頂 */
    /* 各題型：from＝第幾題起出現；sec＝基本限時（秒）；a／b＝兩個數字的範圍 */
    var TYPES = {
        add2: { from: 1, sec: 6, op: '+', a: [11, 89], b: [11, 89] },
        sub2: { from: 5, sec: 6, op: '−', a: [40, 99], b: [11, 60] },
        add3: { from: 10, sec: 8, op: '+', a: [101, 899], b: [101, 899] },
        mul1: { from: 6, sec: 9, op: '×', a: [12, 99], b: [3, 9] },
        mul2: { from: 14, sec: 14, op: '×', a: [12, 49], b: [12, 29] },
        mul31: { from: 22, sec: 12, op: '×', a: [101, 199], b: [3, 9] }
    };
    var LAST_W = [3, 1];                        /* 「個位數被遮住」的權重：第 1 題 → 到頂（其他位數權重一律 1） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function typesFor(level) {
        return Object.keys(TYPES).filter(function (k) { return level >= TYPES[k].from; });  /* filter：留下符合條件的元素，回傳新陣列 */
    }
    function ansMs(level, type) {
        return Math.round(TYPES[type].sec * kit.ramp(level, TIME_MUL[0], TIME_MUL[1], RAMP_LEVELS) * 1000);  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    }
    /* 算式的值 */
    function calc(type, a, b) {
        var op = TYPES[type].op;
        return op === '+' ? a + b : (op === '−' ? a - b : a * b);
    }
    /* 挑要遮住第幾位（0＝最左邊）：個位數（最後一位）權重隨題號從 LAST_W[0] 降到 LAST_W[1]，其他位數權重 1 */
    function pickHidden(len, level, rand) {
        var wLast = kit.ramp(level, LAST_W[0], LAST_W[1], RAMP_LEVELS);  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
        var ws = [], total = 0, i;
        for (i = 0; i < len; i++) { var w = i === len - 1 ? wLast : 1; ws.push(w); total += w; }
        var x = (rand || Math.random)() * total;
        for (i = 0; i < len; i++) { x -= ws[i]; if (x <= 0) return i; }
        return len - 1;
    }
    /* 出一題：{ type, a, b, op, result, digits（答案的每一位）, hidden（第幾位被遮住）, answer（被遮住的數字）, text 算式文字, full 完整算式 } */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var type = kit.pick(typesFor(level), rand);     /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        /* 新解鎖的題型多出現一點：最新解鎖的那一種權重加倍 */
        var types = typesFor(level);
        var newest = types.slice().sort(function (x, y) { return TYPES[y].from - TYPES[x].from; })[0];  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        if (rand() < 0.3) type = newest;
        var t = TYPES[type];
        for (var tr = 0; tr < 300; tr++) {
            var a = kit.randInt(t.a[0], t.a[1], rand), b = kit.randInt(t.b[0], t.b[1], rand);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            if (type === 'sub2' && b >= a - 5) continue;
            var result = calc(type, a, b);
            if (result < 10) continue;
            var digits = String(result).split('').map(Number);
            var hidden = pickHidden(digits.length, level, rand);
            return { type: type, a: a, b: b, op: t.op, result: result, digits: digits, hidden: hidden, answer: digits[hidden], text: a + ' ' + t.op + ' ' + b, full: a + ' ' + t.op + ' ' + b + ' ＝ ' + result };
        }
        return { type: 'add2', a: 37, b: 45, op: '+', result: 82, digits: [8, 2], hidden: 1, answer: 2, text: '37 + 45', full: '37 + 45 ＝ 82' };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 40) return '心算怪物！';
        if (n >= 25) return '高手！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '先熟悉一下，再來一次！';
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

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeQuestion(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[遮住的數字] 第 ' + level + ' 題：' + q.full + '，遮住第 ' + (q.hidden + 1) + ' 位（答案 ' + q.answer + '），限時 ' + ansMs(level, q.type) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var eq = h('div', { 'class': 'qz-big hiddendigit-eq', text: q.text });
        var ansRow = h('div', { 'class': 'hiddendigit-ans' });
        var boxes = q.digits.map(function (d, i) {      /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var b = h('div', { 'class': 'hiddendigit-box' + (i === q.hidden ? ' hiddendigit-box--hide' : ''), text: i === q.hidden ? '？' : String(d) });
            ansRow.appendChild(b);                      /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
            return b;
        });
        ansRow.insertBefore(h('div', { 'class': 'hiddendigit-eqsign', text: '＝' }), ansRow.firstChild);
        var ask = h('div', { 'class': 'qz-note hiddendigit-ask', text: '被遮住的是哪一個數字？' });
        stage.appendChild(eq); stage.appendChild(ansRow); stage.appendChild(ask);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var items = [];
        for (var d = 0; d <= 9; d++) (function (d) { items.push({ text: String(d), kind: 'sky', cls: 'hiddendigit-btn', onTap: function () { judge(d); } }); })(d);
        var grid = kit.btnGrid(stage, items, { cols: 5, h: 84, gap: 10 });  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
        api.timer(ansMs(level, q.type), function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('hiddendigit.hint')) kit.hintOn(stage, grid.btns[q.answer], { mode: 'tap', delay: 500, text: '請點擊數字' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(v) {
            if (api.over) return;
            var ok = v === q.answer;
            boxes[q.hidden].textContent = String(q.answer);  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            boxes[q.hidden].classList.remove('hiddendigit-box--hide');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            boxes[q.hidden].classList.add(ok ? 'hiddendigit-box--ok' : 'hiddendigit-box--bad');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 900 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({                                  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                delay: 2200, lines: [
                    (v == null ? '時間到！' : '你選了 ' + v) + '，被遮住的是 ' + q.answer,
                    q.full
                ]
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.answer); };
        api.wrong = function () { judge((q.answer + 1) % 10); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '遮住的數字',
        rule: '上面是一道計算式，中間顯示答案，但**故意遮住其中一個數字**。算一算，**點出下面 0～9 裡被遮住的是哪一個數字**。答錯或來不及就結束，看你能連續答對幾題。越後面，算式越難、限時越短！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            typesFor: typesFor, ansMs: ansMs, calc: calc, pickHidden: pickHidden, makeQuestion: makeQuestion, rating: rating,
            TYPES: TYPES, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, TIME_MUL: TIME_MUL, LAST_W: LAST_W
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
