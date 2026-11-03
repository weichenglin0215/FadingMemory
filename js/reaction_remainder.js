/* ═══════════════════════════════════════════════════════════════════
   reaction_remainder.js — 秒反應・求餘數（企劃 123「整除秒判」的改版）
   樣式：css/games/reaction_remainder.css（這款專屬的 class 一律以「remainder-」開頭；共用元件在 css/reaction_common.css）
   畫面出現一個除法，例如  4521 ÷ 7，問「餘數是多少？」，下方有五顆數字按鈕，點出正確的餘數。
   五個選項裡，錯的四個都是「合理的餘數」（0 到除數−1 之間），而且大多緊貼著正確答案（差 1、差 2、互補…），
   所以不能用「看起來不可能」來刪去。
   關卡制：答錯或來不及就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 出題（規範 Q1：先決定結果、再反推畫面）：先挑除數 d、商 q、餘數 r，再算被除數 N ＝ q × d ＋ r，
     所以正確答案一定是 r，不會算錯。
   · 除數隨題號解鎖：{5, 10}（只看個位）→ 加 {6, 9} → {6,7,8,9,11} → 加 {12,13} → 加 {14～19}。
     除數是 5 時五顆按鈕剛好是 0～4，其他除數的選項是「正確答案 ＋ 4 個其他合理餘數」。
   · 被除數的位數隨題號線性變多（3 位 → 4 位）；作答限時 12 秒 → 7 秒。
   · 答錯／逾時：揭曉 N ＝ d × 商 ＋ 餘數（例如 4521 ＝ 7 × 645 ＋ 6）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'remainder'：選單、成績、存檔都靠它；樣式在 css/games/reaction_remainder.css，裡面的 class 名稱一律以 remainder- 開頭。 */
    'use strict';

    var ID = 'remainder';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var ANS_S = [15, 20];                        /* 作答限時（秒）：第 1 題 → 到頂 */
    var N_MAX = [300, 9999];                    /* 被除數最大是多少：第 1 題 → 到頂（最小一律 N_MIN） */
    var N_MIN = 100;                                /* 被除數最小是多少（至少三位數） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var OPTIONS = 5;                            /* 幾顆答案按鈕 */
    /* 除數清單：從第 from 題起加入 divs 這些除數 */
    var DIV_STEPS = [
        { from: 1, divs: [5, 10] },
        { from: 3, divs: [2, 4] },
        { from: 5, divs: [3, 6, 9] },
        { from: 8, divs: [7, 8, 11] },
        { from: 11, divs: [12, 13] },
        { from: 16, divs: [14, 15] },
        { from: 21, divs: [16, 17, 18, 19] }
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function nMaxFor(level) { return Math.round(kit.ramp(level, N_MAX[0], N_MAX[1], RAMP_LEVELS)); }  /* Math.round：四捨五入成整數 */
    function divsFor(level) {
        var out = [];
        DIV_STEPS.forEach(function (s) { if (level >= s.from) out = out.concat(s.divs); });  /* forEach：對陣列的每個元素各做一次 */
        return out;
    }
    /* 選項：正確餘數 r ＋ OPTIONS−1 個其他合理餘數（0～d−1），越接近正確答案（差 1、差 2、互補 d−r）越容易被選上；
       由小到大排好。除數剛好等於 OPTIONS（5）時，就是 0～4 全部。 */
    function makeOptions(d, r, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var all = [], i;
        for (i = 0; i < d; i++) if (i !== r) all.push(i);
        var need = OPTIONS - 1;
        if (all.length <= need) return [r].concat(all).sort(function (a, b) { return a - b; });  /* sort：排序；比較函式回傳負數代表 a 排前面、回傳正數代表 b 排前面 */
        var picked = [];
        while (picked.length < need) {
            /* 權重：離 r 越近越大；互補數（d − r，與 r 互補的那個餘數）額外加權 */
            var weights = all.map(function (v) {        /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
                var w = 1 / Math.pow(1 + Math.abs(v - r), 2);  /* Math.abs：取絕對值（去掉負號） */
                if (v === d - r) w += 0.5;
                return w;
            });
            var total = weights.reduce(function (a, b) { return a + b; }, 0), x = rand() * total, idx = 0;  /* reduce：把陣列的元素一個一個累積成一個值（例如加總） */
            for (i = 0; i < all.length; i++) { x -= weights[i]; if (x <= 0) { idx = i; break; } idx = i; }
            picked.push(all[idx]);
            all.splice(idx, 1);
        }
        return picked.concat([r]).sort(function (a, b) { return a - b; });
    }
    /* 出一題：{ d 除數, q 商, r 餘數, n 被除數, options 五個選項（由小到大）, explain 揭曉文字 } */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        var nMax = nMaxFor(level);
        for (var tr = 0; tr < 500; tr++) {
            var d = kit.pick(divsFor(level), rand), r = kit.randInt(0, d - 1, rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            var qLo = Math.max(1, Math.ceil((N_MIN - r) / d)), qHi = Math.floor((nMax - r) / d);  /* Math.floor：無條件捨去成整數 */
            if (qHi < qLo) continue;
            var q = kit.randInt(qLo, qHi, rand), n = q * d + r;  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            if (n < N_MIN || n > nMax) continue;
            return { d: d, q: q, r: r, n: n, options: makeOptions(d, r, rand), explain: n + ' ＝ ' + d + ' × ' + q + ' ＋ ' + r };
        }
        return { d: 7, q: 35, r: 2, n: 247, options: makeOptions(7, 2, rand), explain: '247 ＝ 7 × 35 ＋ 2' };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 40) return '餘數大師！';
        if (n >= 25) return '心算高手！';
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
        console.log('[求餘數] 第 ' + level + ' 題：' + q.n + ' ÷ ' + q.d + '，餘數 ' + q.r + '（商 ' + q.q + '），選項 ' + q.options.join(',') + '，限時 ' + ansMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var eq = h('div', { 'class': 'qz-big remainder-eq', text: q.n + ' ÷ ' + q.d });
        var ask = h('div', { 'class': 'qz-note remainder-ask', text: '餘數是多少？' });
        var reveal = h('div', { 'class': 'qz-note remainder-reveal' });
        stage.appendChild(eq); stage.appendChild(ask); stage.appendChild(reveal);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var grid = kit.btnGrid(stage, q.options.map(function (v) {  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
            return { text: String(v), kind: 'sky', cls: 'remainder-btn', onTap: function () { judge(v); } };
        }), { h: 120, gap: 8 });
        var bRight = grid.btns[q.options.indexOf(q.r)]; /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
        api.timer(ansMs(level), function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('remainder.hint')) kit.hintOn(stage, bRight, { mode: 'tap', delay: 500, text: '請點擊數字' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(v) {
            if (api.over) return;
            var ok = v === q.r;
            eq.classList.add(ok ? 'qz-ok' : 'qz-bad');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            reveal.textContent = q.explain + '，餘數是 ' + q.r;  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1000 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);
            api.fail({                                  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                delay: 2300, lines: [
                    (v == null ? '時間到！' : '你選了 ' + v) + '，正確餘數是 ' + q.r,
                    q.explain
                ]
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.r); };
        api.wrong = function () { judge(q.options[0] === q.r ? q.options[1] : q.options[0]); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '求餘數',
        rule: '畫面上有一個除法，例如 4521 ÷ 7，**請點出「餘數」是多少**。下面有五顆數字按鈕，**錯的選項都只差一點點**。答錯或來不及就結束，看你能連續答對幾題。越後面，被除數越大、除數越難、限時越短！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            ansMs: ansMs, nMaxFor: nMaxFor, divsFor: divsFor, makeOptions: makeOptions, makeQuestion: makeQuestion, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ANS_S: ANS_S, N_MAX: N_MAX, N_MIN: N_MIN, OPTIONS: OPTIONS, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
