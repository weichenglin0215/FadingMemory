/* ═══════════════════════════════════════════════════════════════════
   reaction_multifill.js — 秒反應・多色填滿（V1.57.3.0，玩家提供的參考遊戲 multi-color fill；V1.57.3.1 改成依「難度參數」挑題）
   樣式：css/fillpath.css（兩款填滿遊戲共用，class 一律以「fillpath-」開頭）；畫面與操作：js/fillpath_ui.js；題目與規則：js/fillpath_core.js
   跟「一筆填滿」不同的是**有好幾種顏色的起點**（2～4 個），每種顏色一個；終點都不告訴你。手指從每個起點各拖出一條路，
   不同顏色不能重疊；**每條路各自在哪裡結束要自己判斷，全部的方格都要被蓋滿**才過關。
   ───────────────────────────────────────────────────────────────────
   · 路要互相交錯（V1.57.5）：題庫裡沒有「一條直線就能把某條路跟其他路切開」的題目（以前約四分之三的題目都能切開），見參數 MIX_MIN。
   · 難在「怎麼分」：這些方格要分成好幾條路，每條路從自己的起點出發，怎麼切、各走多長、在哪裡結束，沒有任何提示；
     某一條路多走一格，別條路就少一格，錯了要到很後面才會發現有格子沒人蓋得到。好的題目只有 1～3 種分法。
   · 出題（離線搜尋，js/fillpath_bank.js）：題庫每一題都「站在人類的立場」走過一遍（路上有幾個 T 字／十字路口要選、錯的方向要走多遠才發現、終點藏了幾個…，見 js/fillpath_core.js 的 FP.human），
     而且題庫裡沒有「有一條路只有 1～2 格」這種亂湊的題目。每一關依下面「難度參數」（[第一關, 封頂]）算出一組「想要的樣子」，
     用 FP.select 從整個題庫挑最符合的一題，再隨機翻轉旋轉（8 種）、隨機配顏色。
   · 判定：只看規則有沒有達成——每一格都被蓋到、每條路都從自己的起點出發；不管跟出題時的解一不一樣都算過關。
   · 時間到：用解題器找出一種分法，一條一條畫出來，終點標上星星，然後失敗。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、評語，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，真正的畫面與拖曳在 js/fillpath_ui.js）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'multifill'：選單、成績、存檔都靠它。 */
    'use strict';

    var ID = 'multifill';                               /* 這款遊戲的代號：選單、成績、存檔都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit, FP = Reaction.fillPath;  /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱；FP：填滿系列共用的引擎 */

    /* ═══ 可以自己調的參數 ═══
       格式都是 [第一關, 封頂]：第 1 關用第一個數字，到第 RAMP_LEVELS 關用第二個數字（之後維持），中間線性變化（難度曲線）。
       「至少」＝題目的數字要大於等於它，「最多」＝要小於等於它；數字的意思跟量法見 js/fillpath_core.js 的 FP.analyze。
       題目從離線搜尋的題庫挑（js/fillpath_bank.js）。題庫是有限的：條件太嚴、題庫裡沒有題目全部符合時，會挑「違反最少」的那一題；
       各級題庫實際有多大的範圍，執行 node test/reaction/gen_fillpath_bank.cjs stats 看（或見 note/填滿路徑難度研究.md）。 */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TIME_S = [30, 180];                     /* 每關限時（秒）：第 1 關 → 到頂（最難的題目要想很久，所以給得很長） */
    /* ═══ 調整以下參數之後必須重新產生題庫 ═══
       這一區的參數決定「每一關要從題庫挑什麼樣的題目」；題庫是離線產生的靜態檔，調了之後要重新產生題庫、題庫裡才會有夠多符合的題目（否則遊戲只能挑「違反最少」的那一題）。
       重新產生：node test/reaction/gen_fillpath_bank.cjs run／build（見 note/填滿路徑難度研究.md） */
    /* —— 題目的大小與整體難度 —— */
    var TILES = [16, 72];                       /* 格子數（越多越難） */
    var COLORS = [2, 4];                        /* 路（起點）的數量，2～4 */
    var HUMAN_EFFORT = [32, 6000];              /* 人類試錯量：模擬一個人沿著路畫，每一步算 1，加上「在路口選錯方向、要試多少步才發現錯」（越大越難；玩家給的參考題 24～545）；這個數字是「倍數式」變化的（一路乘上去），不是線性 */
    var SOL_MAX = [3, 1];                       /* 解法的數量最多幾種（1＝只有一種分法） */
    /* —— 終點（人類第一步會先找終點：只有一邊跟別的格子相接的格子一定是終點）—— */
    var HIDDEN_END_MIN = [0, 1];                /* 「藏起來」的終點至少幾個（路數 − 一開始就只有一邊相接的格子數；藏起來的終點要自己推，參考題 EXTRA 3 藏了 1 個） */
    var HIDDEN_END_MAX = [0, 2];                /* 藏起來的終點最多幾個（第 1 關 0＝每個終點都看得出來，好上手） */
    /* —— 路口（站在路上的每一格看：前面有幾個方向可以選）—— */
    var FORK_MIN = [3, 32];                     /* 路口至少幾個：畫的時候，前面有 2 個以上方向（T 字、十字，或可以在這裡結束）的格子數，包括「走過的路把旁邊變成 T 字」的情況 */
    var GUESS_MIN = [1, 8];                     /* 「要猜」的路口至少幾個：連細心的人（會數全盤的死巷）都還有 2 個以上方向的路口 */
    var FORK3_MIN = [1, 4];                     /* 三岔路口至少幾個：一眼看不出錯的方向有 3 個以上的路口 */
    var DEEP_TRAP_MIN = [1, 8];                 /* 深陷阱至少幾個：錯的方向要走 3 步以上才會卡住（知道錯了，但不知道從哪裡改） */
    var TRAP_MAX = [12, 48];                    /* 最深的陷阱最多幾步：錯的方向最遠能走幾步才卡住（太深會變成「畫了大半張才發現要全部重來」） */
    /* —— 題目一開始的形狀 —— */
    var T_CELL_MIN = [2, 12];                   /* T 字格至少幾個：三邊跟別的格子相接的格子 */
    var CROSSROAD_MIN = [1, 4];                 /* 十字格至少幾個：上下左右都相接、而且斜方向也有格子的格子（斜方向都沒有的十字格只能直直穿過，反而沒得選） */
    /* —— 每條路的長短（單位：格，含起點）—— */
    var PATH_MIN = [4, 12];                      /* 最短的一條路至少幾格（題庫裡本來就沒有短於 3 格的路；參考遊戲的題目最短的路都有 4 格以上） */
    var PATH_MAX = [16, 24];                    /* 最長的一條路最多幾格 */
    /* —— 路跟路的交錯（V1.57.5 玩家回饋：兩條路用一條直線就能切開，各走各的就過關）—— */
    var MIX_MIN = [2, 2];                       /* 交錯程度至少幾格：拿一條直線去分開「某一條路」跟「其他的格子」，怎麼擺最少都還有幾格分到錯邊（取各條路裡最小的；0＝一刀就切開。越大纏得越深。題庫：兩色最多 5、三色最多 13、四色大多 1～2） */
    /* ═══ 題庫相關參數到這裡為止（以下的參數調整後不用重新產生題庫）═══ */
    var COLOR_POOL = [0, 1, 2, 3, 4, 6, 7];     /* 路的顏色（編號對應接電線的 --wlk-編號：紅、藍、綠、黃、紫、橘、粉紅；水藍、棕、灰太像別的顏色，不用）；每關從裡面挑不重複的幾種 */
    var SOL_PENALTY = 0.1;                      /* 挑題時，解比 SOL_MAX 每多一種扣多少分。最大的幾種棋盤（67 格以上）幾乎都有 2～3 種解（要交錯又唯一解很難搜到），扣太重（原本 0.5）會改挑小很多的棋盤 */
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
            tiles: n(TILES), k: n(COLORS), e: Math.exp(ramp(level, [Math.log(HUMAN_EFFORT[0]), Math.log(HUMAN_EFFORT[1])])), sol: n(SOL_MAX), solW: SOL_PENALTY,
            min: { hid: n(HIDDEN_END_MIN), raw: n(FORK_MIN), guess: n(GUESS_MIN), d3: n(FORK3_MIN), deep: n(DEEP_TRAP_MIN), t3: n(T_CELL_MIN), x4d: n(CROSSROAD_MIN), lo: n(PATH_MIN), mix: n(MIX_MIN) },
            max: { hid: n(HIDDEN_END_MAX), trap: n(TRAP_MAX), hi: n(PATH_MAX) }
        };
    }
    /* 出一關：依這一關的難度參數從題庫挑一題（隨機翻轉旋轉）、替每條路挑一種不重複的顏色。回傳 { pk 題目, want 想要的樣子, colors 每條路的顏色編號, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var want = wantFor(level), pk = FP.select('multi', want, rand, lastIdx);
        if (pk) lastIdx = pk.idx;
        var colors = kit.shuffle(COLOR_POOL.slice(), rand).slice(0, pk ? pk.p.k : 2);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列；slice(0, n)：取前 n 個 */
        return { pk: pk, want: want, colors: colors, level: level };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 20) return '分路大師！';
        if (n >= 12) return '填色高手！';
        if (n >= 6) return '很會規劃！';
        if (n >= 3) return '再接再厲！';
        return '先想想哪一格只有一條路能到，再來一次！';
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
        console.log('[多色填滿] 第 ' + level + ' 關：想要 ' + q.want.tiles + ' 格、' + q.want.k + ' 條路、難度 ' + Math.round(q.want.e) + '；挑到 ' + q.pk.p.w + '×' + q.pk.p.h + '、' + q.pk.p.tiles + ' 格、' + q.pk.p.k + ' 條路（最短 ' + q.pk.m.lo + '、最長 ' + q.pk.m.hi + '）、路口 ' + q.pk.m.raw + '、要猜 ' + q.pk.m.guess + '、深陷阱 ' + q.pk.m.deep + '、藏終點 ' + q.pk.m.hid + '、試錯量 ' + q.pk.e + '、解 ' + q.pk.c + ' 種、違反 ' + q.pk.viol.toFixed(2) + '；限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */
        FP.build(api, q.pk, { colors: q.colors, timeMs: timeMs(level), name: ID, tipEnd: '每條路的終點要自己找', hint: level === 1 });
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '多色填滿',
        rule: '棋盤上有 2～4 種顏色的起點，每種顏色一個，**終點都不告訴你**。手指從每個起點各拖出一條路，上下左右一格一格走，不同顏色不能重疊，也不能走空洞。**每條路各自在哪裡結束，要自己判斷，全部的方格都要被蓋滿**才過關。拖錯了，拖回上一格就能收回，按在起點可以整條重來。來不及就結束，看你能過幾關。越後面，棋盤越大、顏色越多、分法越少，非常難！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            wantFor: wantFor, timeMs: timeMs, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, TIME_S: TIME_S, COLOR_POOL: COLOR_POOL, MAX_LEVEL: MAX_LEVEL,
            PARAMS: { TILES: TILES, COLORS: COLORS, HUMAN_EFFORT: HUMAN_EFFORT, SOL_MAX: SOL_MAX, HIDDEN_END_MIN: HIDDEN_END_MIN, HIDDEN_END_MAX: HIDDEN_END_MAX, FORK_MIN: FORK_MIN, GUESS_MIN: GUESS_MIN, FORK3_MIN: FORK3_MIN, DEEP_TRAP_MIN: DEEP_TRAP_MIN, TRAP_MAX: TRAP_MAX, T_CELL_MIN: T_CELL_MIN, CROSSROAD_MIN: CROSSROAD_MIN, PATH_MIN: PATH_MIN, PATH_MAX: PATH_MAX, MIX_MIN: MIX_MIN }
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
