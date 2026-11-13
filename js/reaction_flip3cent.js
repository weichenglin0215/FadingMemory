/* ═══════════════════════════════════════════════════════════════════
   reaction_flip3cent.js — 秒反應・翻三湊百（翻牌湊百的「三張」版，V1.57.0 新增）
   樣式：css/games/reaction_flip3cent.css（class 一律以「flip3cent-」開頭）；出題與畫面的共用程式在 js/flipsum_core.js（Reaction.flipSum）
   ───────────────────────────────────────────────────────────────────
   · 玩法：數字牌（1～99）蓋著排成方陣。每次翻三張：**三張加起來是 100 就消掉；不是就蓋回去。**全部消完就過關。
     翻牌的次數有上限（畫面上有「還能翻 N 次」，一次＝翻三張）。每翻錯一次，三張牌的數字會露出 SHOW_MS 再蓋回——給你看的時間，不是作答的時限。
   · **非常困難**：玩家沒辦法只靠尾數投機取巧——三個尾數加起來要是 10 的倍數，可是這樣的組合太多了（隨便三張就有約 1/10 的機會尾數合格），
     只有把十位數也加進去才分得出來。而且一次要記住三張牌，所以**露出的時間是翻牌湊百的三倍**（SHOW_MS 1500 → 4500 毫秒）。
   · 出題保證（FS.makeTripleDeck）：整副牌裡「三張加起來是 100」的只有預定的那幾組——不然玩家翻到碰巧湊成 100 的別組，把牌消掉之後，剩下的牌可能再也湊不出 100（卡死）。
     這個保證在 24 張以上很難做到（隨機的牌有一大堆碰巧湊成 100 的三張），所以最多只出到 18 張（6 組）。
   · 時間限制（V1.57.0 玩家意見）：每一關有寬鬆的時間限制，第 1 關 1 分鐘，之後隨關卡增加（TIME_S：60 → 300 秒，到第 RAMP_LEVELS 關為止；露出的時間長，所以給得多）；時間到還沒消完就失敗。
   · 關卡：6 張 → 9 → 12 → 15 → 18 張（每列 COLS 張）；翻牌上限 ＝ 「完美記憶策略」要翻的次數 ＋ 寬限（SLACK）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 把畫面建出來並處理點擊，實際的程式在共用的 js/flipsum_core.js）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'flip3cent'：選單、成績、存檔都靠它；樣式在 css/games/reaction_flip3cent.css，裡面的 class 名稱一律以 flip3cent- 開頭。 */
    'use strict';

    var ID = 'flip3cent';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var kit = Reaction.kit, FS = Reaction.flipSum;      /* kit：闖關遊戲共用的工具箱；FS：翻牌湊 100 系列的共用引擎（js/flipsum_core.js） */

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [{ cards: 6, to: 3 }, { cards: 9, to: 6 },
    { cards: 12, to: 9 }, { cards: 15, to: 12 }, { cards: 18, to: 15 },
    { cards: 21, to: 9999 }];                   /* 牌的張數（要是 3 的倍數）與這個階段的最後一關；最多 18 張（見檔頭說明） */
    var COLS = 3;                               /* 每一列幾張 */
    var CARD_H = 0.6;                          /* 牌（答案格子）的高度是牌寬的幾倍（預設 0.95，比寬度略矮）。調大牌會變高、調小牌會變扁；牌多、列數多的關卡如果放不下，會自動縮到「所有列都放得進畫面」為止 */
    var SLACK = [6, 18];                        /* 寬限：比完美記憶策略多出幾次（一次＝翻三張）：第 1 關 → 第 RAMP_LEVELS 關 */
    var RAMP_LEVELS = 30;                           /* 難度升到頂的關卡：第 1 關線性變難，到第 30 關最難，之後維持不變 */
    var TIME_S = [60, 300];                     /* 每一關的時間限制（秒）：第 1 關 → 第 RAMP_LEVELS 關（之後維持不變）。第 1 關給 1 分鐘，牌越多給越久，給得很寬鬆；時間到還沒消完就失敗（V1.57.0 玩家意見） */
    var PAIR_SHOW_MS = 1500;                    /* 翻牌湊百（翻兩張）翻錯時露出的毫秒數；這款是它的 SHOW_K 倍 */
    var SHOW_K = 3;                             /* 露出時間是翻兩張版的幾倍（翻三張要記的多，所以延長三倍） */
    var SHOW_MS = PAIR_SHOW_MS * SHOW_K;        /* 翻錯時，三張牌露出多久才蓋回（毫秒；不是作答時限）＝ 4500 */
    var MATCH_MS = 650;                         /* 翻對時，三張牌停多久才消掉 */
    var PASS_DELAY_MS = 1300;                       /* 答對（過關）後停多久才換下一關（毫秒，1300 毫秒＝1.3 秒） */
    var FAIL_HOLD_MS = 6000;                        /* 答錯（失敗）後停多久才跳出結算畫面（毫秒，6000 毫秒＝6 秒），讓玩家先看清楚答案 */
    var MAX_LEVEL = 200;                            /* 最後一關：過了第 200 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關有幾張牌：由上往下找第一個「關卡 ≤ to」的階段（STAGES），最後一個階段一路到底 */
    function cardsFor(level) {
        level = Math.max(1, level);
        for (var i = 0; i < STAGES.length; i++) if (level <= STAGES[i].to || i === STAGES.length - 1) return STAGES[i].cards;
    }
    /* 這一關的「寬限」：比「完美記憶」的翻牌次數多給幾次（從 SLACK 第一個數字線性變到第二個） */
    function slackFor(level) { return Math.round(kit.ramp(level, SLACK[0], SLACK[1], RAMP_LEVELS)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 這一關的時間限制（毫秒）：從 TIME_S 第一個數字線性變到第二個 */
    function timeFor(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS)) * 1000; }
    /* 發牌：n 張＝n/3 組「三張加起來是 100」的牌（整副牌找不到別組三張湊成 100，見 FS.makeTripleDeck），洗牌 */
    function deal(n, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        return kit.shuffle(FS.makeTripleDeck(n / 3, rand).deck, rand);   /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
    }
    /* 完美記憶策略要翻幾次（一次＝翻三張） */
    function perfectFlips(deck) { return FS.perfectTries(deck, 3); }
    /* 這一關的翻牌次數上限＝完美記憶策略的次數 ＋ 寬限 */
    function limitFor(level, deck) { return perfectFlips(deck) + slackFor(level); }
    /* 出題函式：依關卡難度與亂數產生這一題的資料（純函式，不碰畫面，單元測試直接測它） */
    function makePuzzle(level, rand) {
        var n = cardsFor(level), deck = deal(n, rand), perfect = perfectFlips(deck);
        return { n: n, deck: deck, perfect: perfect, limit: perfect + slackFor(level), level: level };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 15) return '心算與記憶力都是怪物級！';
        if (n >= 8) return '三張一組也難不倒你！';
        if (n >= 4) return '越來越有感覺了！';
        return '先把尾數加起來湊成 10 的倍數，再算十位數，加起來要剛好 100！';
    }

    /* ═══ 畫面 ═══ */
    function mount(root, ctx) {
        FS.mount(root, ctx, {
            id: ID, G: G, name: '翻三湊百', prefix: 'flip3cent', k: 3, cols: COLS, maxLevel: MAX_LEVEL,
            makePuzzle: makePuzzle, rating: rating,
            showMs: SHOW_MS, matchMs: MATCH_MS, passDelayMs: PASS_DELAY_MS, failHoldMs: FAIL_HOLD_MS,
            cardH: CARD_H, tipIdle: '翻三張：加起來是 100 就消掉', timeMs: timeFor
        });
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '翻三湊百',
        rule: '數字牌（1～99）蓋著排成方陣。**每次翻三張：三張加起來是 100 就消掉；不是就蓋回去**。全部消完就過關。**翻牌的次數有上限**，一次是翻三張，畫面上會寫「還能翻幾次」。翻錯的時候，三張牌的數字會停 4.5 秒再蓋回——那是給你看的時間（是翻兩張的遊戲的三倍）。**每一關有時間限制**（第 1 關 1 分鐘，後面的關卡越給越久），畫面上方的時間條跑完還沒消完就失敗，所以要記住它們在哪裡。這是非常困難的遊戲：光看尾數猜不準，十位數也要一起加。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            STAGES: STAGES, COLS: COLS, CARD_H: CARD_H, SLACK: SLACK, RAMP_LEVELS: RAMP_LEVELS, TIME_S: TIME_S, timeFor: timeFor, PAIR_SHOW_MS: PAIR_SHOW_MS, SHOW_K: SHOW_K, SHOW_MS: SHOW_MS, MATCH_MS: MATCH_MS, cardsFor: cardsFor, slackFor: slackFor, deal: deal,
            perfectFlips: perfectFlips, limitFor: limitFor, makePuzzle: makePuzzle, rating: rating, MAX_LEVEL: MAX_LEVEL, FS: FS
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
