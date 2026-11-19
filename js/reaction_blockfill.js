/* ═══════════════════════════════════════════════════════════════════
   reaction_blockfill.js — 秒反應・一筆填滿（V1.57.3.0，玩家提供的參考遊戲 block fill；V1.57.3.1 改成依「難度參數」挑題）
   樣式：css/fillpath.css（兩款填滿遊戲共用，class 一律以「fillpath-」開頭）；畫面與操作：js/fillpath_ui.js；題目與規則：js/fillpath_core.js
   棋盤上有一些方格（有的位置是空洞），其中一格是起點，**終點不告訴你**。手指從起點拖出一條路，上下左右一格一格走，
   **要把每一個方格都走過一遍**才過關（路不用蓋滿整個矩形，空洞走不到）。最後停在哪一格，要自己判斷。
   ───────────────────────────────────────────────────────────────────
   · 這是「哈密頓路徑」問題：找一條從起點出發、經過每個格子剛好一次的路。看起來簡單，其實很難——
     走錯一步，要走到很後面才發現某個格子被孤立了；好的題目只有 1～3 種走法，連「往出路最少的方向走」這種聰明的辦法也會被騙。
   · 出題（離線搜尋，js/fillpath_bank.js）：用電腦搜尋「人類最難解」的區域，每一題都「站在人類的立場」走過一遍（路上有幾個 T 字／十字路口要選、錯的方向要走多遠才發現…，見 js/fillpath_core.js 的 FP.human）。
     每一關依下面「難度參數」（[第一關, 封頂]）算出一組「想要的樣子」，用 FP.select 從整個題庫挑最符合的一題，再隨機翻轉旋轉（8 種），而且盡量不連續出同一題。
     題庫怎麼產生、「難」怎麼量，見 test/reaction/gen_fillpath_bank.cjs 的說明。
   · 判定：不拿「出題時的那組解」比對，只看規則有沒有達成——每一格都被蓋到；所以不管怎麼走，只要走遍每一格就算過關。
   · 時間到：用解題器找出一種走法，從起點一路畫出來，終點標上星星，然後失敗。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、評語，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，真正的畫面與拖曳在 js/fillpath_ui.js）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'blockfill'：選單、成績、存檔都靠它。 */
    'use strict';

    var ID = 'blockfill';                               /* 這款遊戲的代號：選單、成績、存檔都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit, FP = Reaction.fillPath;  /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱；FP：填滿系列共用的引擎 */

    /* ═══ 可以自己調的參數 ═══
       格式都是 [第一關, 封頂]：第 1 關用第一個數字，到第 RAMP_LEVELS 關用第二個數字（之後維持），中間線性變化（難度曲線）。
       「至少」＝題目的數字要大於等於它，「最多」＝要小於等於它；數字的意思跟量法見 js/fillpath_core.js 的 FP.analyze。
       一筆填滿只有一條路，路的長度＝格子數（所以「最短／最長路徑」就是 TILES）。
       題目從離線搜尋的題庫挑（js/fillpath_bank.js）。題庫是有限的：條件太嚴、題庫裡沒有題目全部符合時，會挑「違反最少」的那一題；
       各級題庫實際有多大的範圍，執行 node test/reaction/gen_fillpath_bank.cjs stats 看（或見 note/填滿路徑難度研究.md）。 */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TIME_S = [20, 90];                     /* 每關限時（秒）：第 1 關 → 到頂（最難的題目要想很久，所以給得很長） */
    /* ═══ 調整以下參數之後必須重新產生題庫 ═══
       這一區的參數決定「每一關要從題庫挑什麼樣的題目」；題庫是離線產生的靜態檔，調了之後要重新產生題庫、題庫裡才會有夠多符合的題目（否則遊戲只能挑「違反最少」的那一題）。
       重新產生：node test/reaction/gen_fillpath_bank.cjs run／build（見 note/填滿路徑難度研究.md） */
    /* —— 題目的大小與整體難度 —— */
    var TILES = [16, 72];                       /* 格子數＝路的長度（越多越難） */
    var HUMAN_EFFORT = [32, 6000];              /* 人類試錯量：模擬一個人沿著路畫，每一步算 1，加上「在路口選錯方向、要試多少步才發現錯」（越大越難；玩家給的參考題 48～545）；這個數字是「倍數式」變化的（一路乘上去），不是線性 */
    var SOL_MAX = [3, 1];                       /* 走法的數量最多幾種（1＝只有一種走法） */
    /* —— 終點（人類第一步會先找終點：只有一邊跟別的格子相接的格子一定是終點）—— */
    var HIDDEN_END_MIN = [0, 0];                /* 終點要不要「藏起來」（1＝題目上沒有只有一邊相接的格子，終點要自己推）；調成 1 會偏好這種題目，但這種題目很少（終點不標示，只要連成一線就過關，終點常常出現在意想不到的地方，反而變簡單） */
    /* —— 路口（站在路上的每一格看：前面有幾個方向可以選）—— */
    var FORK_MIN = [2, 18];                     /* 路口至少幾個：畫的時候，前面有 2 個以上方向（T 字、十字）的格子數，包括「走過的路把旁邊變成 T 字」的情況（參考題 Level 104：15 個） */
    var GUESS_MIN = [1, 8];                     /* 「要猜」的路口至少幾個：連細心的人（會數全盤的死巷）都還有 2 個以上方向的路口（參考題 Level 104：5 個） */
    var FORK3_MIN = [1, 6];                     /* 三岔路口至少幾個：一眼看不出錯的方向有 3 個以上的路口（參考題 Level 2 的起點左邊那格就是） */
    var DEEP_TRAP_MIN = [1, 8];                 /* 深陷阱至少幾個：錯的方向要走 3 步以上才會卡住（知道錯了，但不知道從哪裡改） */
    var TRAP_MAX = [12, 48];                    /* 最深的陷阱最多幾步：錯的方向最遠能走幾步才卡住（太深會變成「畫了大半張才發現要全部重來」） */
    /* —— 題目一開始的形狀 —— */
    var T_CELL_MIN = [2, 14];                   /* T 字格至少幾個：三邊跟別的格子相接的格子 */
    var CROSSROAD_MIN = [1, 4];                 /* 十字格至少幾個：上下左右都相接、而且斜方向也有格子的格子（斜方向都沒有的十字格只能直直穿過，反而沒得選） */
    /* ═══ 題庫相關參數到這裡為止（以下的參數調整後不用重新產生題庫）═══ */
    var COLOR_POOL = [0, 1, 2, 3, 4, 6, 7];     /* 路的顏色（編號對應接電線的 --wlk-編號：紅、藍、綠、黃、紫、橘、粉紅；水藍、棕、灰太像別的顏色，不用） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    var lastIdx = -1;                           /* 上一關出的是題庫的第幾題（盡量不連續出同一題） */
    /* 把 [第一關, 封頂] 換成這一關的數字（線性） */
    function ramp(level, a) { return kit.ramp(level, a[0], a[1], RAMP_LEVELS); }
    /* 這一關的限時（毫秒） */
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }
    /* 這一關「想要的題目樣子」（FP.select 會從題庫挑最符合的）。min＝至少、max＝最多 */
    function wantFor(level) {
        var r = function (a) { return ramp(level, a); }, n = function (a) { return Math.round(ramp(level, a)); };
        return {
            tiles: n(TILES), k: 1, e: Math.exp(ramp(level, [Math.log(HUMAN_EFFORT[0]), Math.log(HUMAN_EFFORT[1])])), sol: n(SOL_MAX),
            min: { hid: n(HIDDEN_END_MIN), raw: n(FORK_MIN), guess: n(GUESS_MIN), d3: n(FORK3_MIN), deep: n(DEEP_TRAP_MIN), t3: n(T_CELL_MIN), x4d: n(CROSSROAD_MIN) },
            max: { trap: n(TRAP_MAX) }
        };
    }
    /* 出一關：依這一關的難度參數從題庫挑一題（隨機翻轉旋轉）、挑一種顏色。回傳 { pk 題目, want 想要的樣子, color 顏色編號, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var want = wantFor(level), pk = FP.select('block', want, rand, lastIdx);
        if (pk) lastIdx = pk.idx;
        return { pk: pk, want: want, color: COLOR_POOL[Math.floor(rand() * COLOR_POOL.length)], level: level };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 20) return '路徑大師！';
        if (n >= 12) return '一筆畫高手！';
        if (n >= 6) return '很會找路！';
        if (n >= 3) return '再接再厲！';
        return '先找出最容易被孤立的角落格子，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'fillpath-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var level = api.level, q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[一筆填滿] 第 ' + level + ' 關：想要 ' + q.want.tiles + ' 格、難度 ' + Math.round(q.want.e) + '；挑到 ' + q.pk.p.w + '×' + q.pk.p.h + '、' + q.pk.p.tiles + ' 格、路口 ' + q.pk.m.raw + '、要猜 ' + q.pk.m.guess + '、深陷阱 ' + q.pk.m.deep + '、最深 ' + q.pk.m.trap + '、試錯量 ' + q.pk.e + '、解 ' + q.pk.c + ' 種、違反 ' + q.pk.viol.toFixed(2) + '；限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */
        FP.build(api, q.pk, { colors: [q.color], timeMs: timeMs(level), name: ID, tipEnd: '終點要自己找', hint: level === 1 });
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '一筆填滿',
        rule: '棋盤上有一些方格（有的位置是空洞），其中一格是起點，**終點不告訴你**。手指從起點拖出一條路，上下左右一格一格走，不能重疊，也不能走空洞。**路要把每一個方格都走過一遍**才過關，最後停在哪一格，要自己判斷。拖錯了，拖回上一格就能收回，按在起點可以整條重來。來不及就結束，看你能過幾關。越後面，棋盤越大、空洞越少、走法越少，非常難！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            wantFor: wantFor, timeMs: timeMs, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, TIME_S: TIME_S, COLOR_POOL: COLOR_POOL, MAX_LEVEL: MAX_LEVEL,
            PARAMS: { TILES: TILES, HUMAN_EFFORT: HUMAN_EFFORT, SOL_MAX: SOL_MAX, HIDDEN_END_MIN: HIDDEN_END_MIN, FORK_MIN: FORK_MIN, GUESS_MIN: GUESS_MIN, FORK3_MIN: FORK3_MIN, DEEP_TRAP_MIN: DEEP_TRAP_MIN, TRAP_MAX: TRAP_MAX, T_CELL_MIN: T_CELL_MIN, CROSSROAD_MIN: CROSSROAD_MIN }
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
