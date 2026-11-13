/* ═══════════════════════════════════════════════════════════════════
   reaction_flipcent.js — 秒反應・翻牌湊百（翻牌湊十的進階版，V1.57.0 新增）
   樣式：css/games/reaction_flipcent.css（class 一律以「flipcent-」開頭）；出題與畫面的共用程式在 js/flipsum_core.js（Reaction.flipSum）
   ───────────────────────────────────────────────────────────────────
   · 玩法：數字牌（1～99）蓋著排成方陣。每次翻兩張：**加起來是 100 就消掉；不是就蓋回去。**全部消完就過關。
     翻牌的次數有上限（畫面上有「還能翻 N 次」）。每翻錯一次，兩張牌的數字會露出 SHOW_MS（預設 1.5 秒）再蓋回——給你看的時間，不是作答的時限。
   · 玩家的投機取巧：**只算「尾數」**。兩張加起來是 100，尾數一定是 1＋9、2＋8、3＋7、4＋6、5＋5、0＋0，只看尾數就能猜出誰跟誰一組。
     所以牌多的時候故意讓好幾組牌的尾數相同：例如 43＋57、63＋37、23＋77 全部是「3 跟 7」，只看尾數會湊到 63＋57＝120。
     GROUP 是「每一種尾數組放幾組牌」：第 1 關 1（每一組牌的尾數都不一樣，只看尾數就猜得到），越後面越多組共用同一種尾數（到頂 8）。
   · 時間限制（V1.57.0 玩家意見）：每一關有寬鬆的時間限制，第 1 關 1 分鐘，之後隨關卡增加（TIME_S：60 → 300 秒，到第 RAMP_LEVELS 關為止）；時間到還沒消完就失敗。
   · 其餘同翻牌湊十（V1.47）：發牌後盡量不要讓「加起來是 100 的兩張牌」左右或上下相鄰（每一組有 KEEP_ADJ_P 的機會保留相鄰）；
     關卡 6 張 → 12 → … → 48 張；翻牌上限 ＝ 「完美記憶策略」要翻的次數 ＋ 寬限（SLACK）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 把畫面建出來並處理點擊，實際的程式在共用的 js/flipsum_core.js）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'flipcent'：選單、成績、存檔都靠它；樣式在 css/games/reaction_flipcent.css，裡面的 class 名稱一律以 flipcent- 開頭。 */
    'use strict';

    var ID = 'flipcent';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var kit = Reaction.kit, FS = Reaction.flipSum;      /* kit：闖關遊戲共用的工具箱；FS：翻牌湊 100 系列的共用引擎（js/flipsum_core.js） */

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [{ cards: 6, to: 1 },
    { cards: 8, to: 2 }, { cards: 10, to: 3 },
    { cards: 12, to: 4 }, { cards: 14, to: 5 },
    { cards: 16, to: 6 }, { cards: 18, to: 7 },
    { cards: 20, to: 8 }, { cards: 22, to: 9 },
    { cards: 24, to: 10 }, { cards: 26, to: 11 },
    { cards: 28, to: 12 }, { cards: 30, to: 13 },
    { cards: 32, to: 14 }, { cards: 34, to: 15 },
    { cards: 36, to: 16 }, { cards: 38, to: 17 },
    { cards: 40, to: 18 }, { cards: 42, to: 19 },
    { cards: 44, to: 20 }, { cards: 46, to: 21 },
    { cards: 48, to: 9999 }];     /* 牌的張數與這個階段的最後一關 */
    var COLS = 6;                               /* 每一列幾張 */
    var CARD_H = 0.95;                          /* 牌（答案格子）的高度是牌寬的幾倍（預設 0.95，比寬度略矮）。調大牌會變高、調小牌會變扁；牌多、列數多的關卡如果放不下，會自動縮到「所有列都放得進畫面」為止 */
    var SLACK = [4, 16];                        /* 寬限：比完美記憶策略多出幾次：第 1 關 → 第 RAMP_LEVELS 關 */
    var RAMP_LEVELS = 30;                           /* 難度升到頂的關卡：第 1 關線性變難，到第 30 關最難，之後維持不變 */
    var TIME_S = [60, 300];                     /* 每一關的時間限制（秒）：第 1 關 → 第 RAMP_LEVELS 關（之後維持不變）。第 1 關給 1 分鐘，牌越多給越久，給得很寬鬆；時間到還沒消完就失敗（V1.57.0 玩家意見） */
    var GROUP = [1, 8];                         /* 每一種「尾數組」（例如尾數 3 與 7）放幾組牌：第 1 關 → 第 RAMP_LEVELS 關。1＝每組牌的尾數都不一樣（只看尾數就猜得到）；越大越多組共用同一種尾數，只看尾數會湊錯 */
    var KEEP_ADJ_P = 0.3;                       /* 每發現一組「加起來是 100、又左右或上下相鄰」的牌，保留它們相鄰的機會（0＝完全避開、1＝不處理） */
    var SHOW_MS = 1500;                         /* 翻錯時，兩張牌露出多久才蓋回（毫秒；不是作答時限） */
    var MATCH_MS = 650;                         /* 翻對時，兩張牌停多久才消掉 */
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
    /* 這一關每一種尾數組放幾組牌（整數，1 以上） */
    function groupFor(level) { return Math.max(1, Math.round(kit.ramp(level, GROUP[0], GROUP[1], RAMP_LEVELS))); }
    /* 發牌：n 張＝n/2 組「加起來是 100」的牌，尾數組的分配見 FS.makePairDeck；洗牌之後把「湊成 100 又相鄰」的牌拆開一些（FS.spread） */
    function deal(n, level, rand, cols) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var d = FS.makePairDeck(n / 2, groupFor(level), rand);
        return FS.spread(kit.shuffle(d.deck, rand), cols || COLS, rand, KEEP_ADJ_P);   /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
    }
    /* 完美記憶策略要翻幾次（一次＝翻兩張） */
    function perfectFlips(deck) { return FS.perfectTries(deck, 2); }
    /* 這一關的翻牌次數上限＝完美記憶策略的次數 ＋ 寬限 */
    function limitFor(level, deck) { return perfectFlips(deck) + slackFor(level); }
    /* 出題函式：依關卡難度與亂數產生這一題的資料（純函式，不碰畫面，單元測試直接測它） */
    function makePuzzle(level, rand) {
        var n = cardsFor(level), deck = deal(n, level, rand), perfect = perfectFlips(deck);
        return { n: n, deck: deck, perfect: perfect, limit: perfect + slackFor(level), level: level, group: groupFor(level) };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '記憶力與心算都驚人！';
        if (n >= 12) return '記得很牢！';
        if (n >= 5) return '越來越有感覺了！';
        return '100 的搭檔：十位數加起來 9、尾數加起來 10，兩個都要算！';
    }

    /* ═══ 畫面 ═══ */
    function mount(root, ctx) {
        FS.mount(root, ctx, {
            id: ID, G: G, name: '翻牌湊百', prefix: 'flipcent', k: 2, cols: COLS, maxLevel: MAX_LEVEL,
            makePuzzle: makePuzzle, rating: rating,
            showMs: SHOW_MS, matchMs: MATCH_MS, passDelayMs: PASS_DELAY_MS, failHoldMs: FAIL_HOLD_MS,
            cardH: CARD_H, tipIdle: '翻兩張：加起來是 100 就消掉', timeMs: timeFor
        });
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '翻牌湊百',
        rule: '數字牌蓋著排成方陣（數字是 1～99）。**每次翻兩張：加起來是 100 就消掉；不是就蓋回去**。全部消完就過關。**翻牌的次數有上限**，畫面上會寫「還能翻幾次」。翻錯的時候，兩張牌的數字會停 1.5 秒再蓋回——那是給你看的時間。**每一關有時間限制**（第 1 關 1 分鐘，後面的關卡越給越久），畫面上方的時間條跑完還沒消完就失敗，所以要記住它們在哪裡。提示：只看尾數會被騙——43 的搭檔是 57，但 63 加 57 是 120。越後面，牌越多，尾數相同的牌也越多！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            STAGES: STAGES, COLS: COLS, CARD_H: CARD_H, SLACK: SLACK, TIME_S: TIME_S, timeFor: timeFor, GROUP: GROUP, RAMP_LEVELS: RAMP_LEVELS, SHOW_MS: SHOW_MS, MATCH_MS: MATCH_MS, KEEP_ADJ_P: KEEP_ADJ_P, cardsFor: cardsFor, slackFor: slackFor, groupFor: groupFor, deal: deal,
            perfectFlips: perfectFlips, limitFor: limitFor, makePuzzle: makePuzzle, rating: rating, MAX_LEVEL: MAX_LEVEL, FS: FS
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
