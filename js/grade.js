/* ═══════════════════════════════════════════════════════════════════
   grade.js — 「學歷階段」：把一款遊戲的成績，換成 小學／中學／高中／大學／碩士／博士 六個階段之一
   ───────────────────────────────────────────────────────────────────
   用在三個地方（主選單頁與遊戲頁都載入這個檔案）：
     ① 每款遊戲的結算彈窗：原本的評價（例如「找得很準！」）後面多一行階段（js/reaction_kit.js 的 kit.result）；
     ② 主選單「選一個想玩的遊戲」每一格的右上角：世界名次超過 30 名（或沒登入、查不到名次）、但玩過的遊戲，顯示階段小藥丸（js/menu.js）；
     ③「👑我的強項」彈窗：每個分類（記憶、視覺、反應…）裡每一款遊戲的分數加起來除以分類的款數，畫成雷達圖（js/strengths.js，見下面 byCategory）。
   ───────────────────────────────────────────────────────────────────
   階段怎麼算（stage(spec, 成績)，回傳 0～5，沒有成績回傳 −1）。spec 是遊戲的成績規格（各遊戲檔案 Reaction.register 的 score；
   主選單頁沒有載入遊戲檔案，改讀 js/score_specs.js 的 FM_SCORE_SPECS，兩邊的欄位一樣：better、decimals、format、min、max，另外可以有 st）：
     1. spec.st（可選）：這款遊戲自己訂的六個門檻（小學、中學、…、博士各一個；越大越好的遊戲由小到大、越小越好的由大到小），成績達到第幾個門檻就是第幾階段。
        遊戲的成績單位很特別、下面的自動算法不準的時候，才需要在遊戲檔案的 SCORE 裡加這一項。
     2. 闖關／答題遊戲（成績是「關」「題」，約八成的遊戲）：成績（通過幾關）達到 LEVEL_AT 的哪一個門檻（遊戲最多不到 30 關的，門檻照比例縮小）。
     3. 其他遊戲（秒、公分、%、個、分…）：看成績在這款遊戲「合理範圍」（SCORE 的 min～max）裡的位置，越大越好的取對數比例、
        越小越好的取「誤差佔多少」，達到 FRAC_AT 的哪一個門檻。（合理範圍本來是用來擋異常成績的，不是難度，所以這只是粗估；
        哪一款覺得不準，就在它的 SCORE 加 st。）
   沒玩過（沒有成績）的遊戲不算任何階段。
   ───────────────────────────────────────────────────────────────────
   分類的階段（byCategory；V1.57.5 玩家回饋：以前只取每類最好的一款，不夠客觀）：
     分母＝這一類總共有幾款遊戲；分子＝這一類每一款遊戲「最佳成績」換成的分數加起來（小學 1 分、中學 2 分 … 博士 6 分，沒玩過 0 分）；
     分子 ÷ 分母，四捨五入就是這一類的分數：1 分（或不到 1 分）都算小學，2 分中學 … 6 分博士；一款都沒玩過（0 分）是「都沒玩過」。
     分類有哪些、每款遊戲屬於哪一類，都是呼叫的人傳進來的（主選單的 GAME_TABS／GAME_CELLS），所以刪遊戲、換分類之後，雷達圖自動跟著變，不用改這裡。
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
    'use strict';
    var Grade = global.Grade = global.Grade || {};

    /* ═══ 可以自己調的參數 ═══ */
    var NAMES = ['小學', '中學', '高中', '大學', '碩士', '博士'];       /* 六個階段的名稱（由低到高） */
    var LEVEL_AT = [1, 5, 10, 15, 20, 30];      /* 闖關／答題遊戲：通過幾關（答對幾題）到哪個階段（第 1 關＝小學、第 5 關＝中學、第 10 關＝高中、第 15 關＝大學、第 20 關＝碩士、第 30 關＝博士；難度在第 30 關到頂） */
    var FRAC_AT = [0, 0.15, 0.3, 0.45, 0.6, 0.75];   /* 其他遊戲：成績在「合理範圍」裡的位置（0～1）到哪個階段 */
    var KEY_BEST = 'fm.reaction.best.';         /* 個人最佳存在手機哪裡（localStorage 的 key 開頭，後面接遊戲代號；跟 js/reaction_core.js 一致） */

    /* 達到門檻的個數 → 階段（沒達到任何門檻也算最低階，因為玩過了） */
    function fromThresholds(at, v, better) {
        var n = 0;
        for (var i = 0; i < at.length; i++) if (better === 'min' ? v <= at[i] : v >= at[i]) n++;
        return Math.max(0, n - 1);
    }
    /* 闖關遊戲的門檻：照 LEVEL_AT；但這款遊戲最多只有幾關（SCORE 的 max）比博士門檻少時（例如分類點擊最多 22 關），門檻照比例縮小，玩到頂也能拿博士 */
    function levelThresholds(spec) {
        var top = LEVEL_AT[LEVEL_AT.length - 1], mx = spec.max;
        if (!(mx > 1) || mx >= top) return LEVEL_AT;
        return LEVEL_AT.map(function (v) { return v <= 1 ? 1 : Math.max(1, Math.round(v * mx / top)); });   /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
    }
    /* 這款遊戲算不算「闖關／答題」：越大越好、整數、成績單位是「關」或「題」 */
    function isLevelLike(spec) {
        return spec.better !== 'min' && !(spec.decimals > 0) && /關|題/.test(spec.format || '');
    }
    /* 其他遊戲：成績在合理範圍裡的位置（0～1，越大越強）；沒有合理範圍回傳 null */
    function fraction(spec, v) {
        var lo = spec.min, hi = spec.max;
        if (typeof lo !== 'number' || typeof hi !== 'number' || !isFinite(lo) || !isFinite(hi) || !(hi > lo)) return null;
        var x;
        if (spec.better === 'min') {                          /* 越小越好：誤差越小越強（取對數，前面一點點的進步比後面一大段更值錢） */
            x = 1 - Math.log(1 + Math.max(0, v - lo)) / Math.log(1 + hi - lo);
        } else if (lo > 0) {                                  /* 越大越好、最小值大於 0：取對數比例 */
            x = Math.log(Math.max(v, lo) / lo) / Math.log(hi / lo);
        } else {
            x = (v - lo) / (hi - lo);
        }
        return Math.max(0, Math.min(1, x));
    }

    /* 成績 v → 階段 0～5（−1＝沒有成績）。spec 沒給（不認識的遊戲）也是 −1 */
    function stage(spec, v) {
        if (!spec || typeof v !== 'number' || !isFinite(v)) return -1;
        if (Array.isArray(spec.st) && spec.st.length === NAMES.length) return fromThresholds(spec.st, v, spec.better);
        if (isLevelLike(spec)) return fromThresholds(levelThresholds(spec), v, 'max');
        var x = fraction(spec, v);
        return x == null ? 0 : fromThresholds(FRAC_AT, x, 'max');
    }
    function specOf(id) { return global.FM_SCORE_SPECS ? global.FM_SCORE_SPECS[id] : null; }
    function stageById(id, v) { return stage(specOf(id), v); }
    function nameOf(s) { return s >= 0 && s < NAMES.length ? NAMES[s] : ''; }

    /* 這支手機上這款遊戲「確認過單位」的個人最佳（沒玩過、或還沒確認單位就是 null；見 js/identity.js 的 .sync 記號） */
    function bestOf(id) {
        var st = global.UI && global.UI.store;
        if (!st) return null;
        var v = st.get(KEY_BEST + id, null);
        return typeof v === 'number' && isFinite(v) && st.get(KEY_BEST + id + '.sync', false) ? v : null;
    }

    /* 一類的總分（sum）與款數（count）→ 這一類的分數 0～6：0＝一款都沒玩過；其餘是 總分÷款數 四捨五入、最少 1 分（小學） */
    function categoryPoints(sum, count) {
        if (!(sum > 0) || !(count > 0)) return 0;
        return Math.max(1, Math.min(NAMES.length, Math.round(sum / count)));      /* Math.round：四捨五入成整數 */
    }
    /* 每個分類的分數（純函式，t_grade.js 測試）。
       tabs：分類清單 [{ id, name }]（all、recent 這兩個不是分類，自動略過）；cells：遊戲清單 [{ id, cat }]；
       bestOf(id)：這款遊戲的個人最佳（沒玩過回傳 null）；specOf(id)：這款遊戲的成績規格。
       回傳 [{ id, name, count（分類裡有幾款遊戲＝分母）, played（玩過幾款）, sum（總分＝分子）, avg（sum ÷ count，沒四捨五入）, value（0～6：四捨五入後的分數，0＝都沒玩過）, stage（value − 1；−1＝都沒玩過）}]，
       沒有任何遊戲的分類不列出（刪光了就從雷達圖拿掉）。 */
    function byCategory(tabs, cells, bestFn, specFn) {
        var out = [];
        (tabs || []).forEach(function (t) {
            if (!t || t.id === 'all' || t.id === 'recent') return;
            var games = (cells || []).filter(function (c) { return c.cat === t.id; });   /* filter：留下符合條件的元素，回傳新陣列 */
            if (!games.length) return;
            var sum = 0, played = 0;
            games.forEach(function (c) {
                var s = stage(specFn(c.id), bestFn(c.id));
                if (s < 0) return;                          /* 沒玩過：0 分 */
                played++;
                sum += s + 1;                               /* 小學（stage 0）1 分 … 博士（stage 5）6 分 */
            });
            var value = categoryPoints(sum, games.length);
            out.push({ id: t.id, name: t.name, count: games.length, played: played, sum: sum, avg: sum / games.length, value: value, stage: value - 1 });
        });
        return out;
    }

    Grade.NAMES = NAMES;
    Grade.LEVEL_AT = LEVEL_AT;
    Grade.FRAC_AT = FRAC_AT;
    Grade.stage = stage;
    Grade.specOf = specOf;
    Grade.stageById = stageById;
    Grade.nameOf = nameOf;
    Grade.bestOf = bestOf;
    Grade.byCategory = byCategory;
    Grade.categoryPoints = categoryPoints;
    Grade.isLevelLike = isLevelLike;
    Grade.fraction = fraction;
})(window);
