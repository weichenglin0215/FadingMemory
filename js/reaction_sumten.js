/* ═══════════════════════════════════════════════════════════════════
   reaction_sumten.js — 秒反應・拖曳湊十
   介面與操作（盤面、拖曳／點選、「浮窗」「快速拖曳」「確定」、掉落動畫）跟「連號長龍」完全一樣，共用 js/numgrid_ui.js、css/numgrid.css；這個檔案只有「拖曳湊十的規則」。
   方格裡每一格有一個 1～9 的數字。手指從一格拖到上下左右相鄰的格子（數字沒有限制），把拖過的數字加起來，
   **總和是 10 的倍數（10、20、30…）就能收走拿分**，不管拖了幾格；得分就是總和（10 分、20 分、30 分…）。
   · 拖過頭沒關係：放開手指時，如果總和不是 10 的倍數，就從「拖的順序」往前找，**取總和剛好是 10 的倍數的最長前面幾格**計分，後面多出來的格子被放棄（不收走、留在盤面上）。
     例如拖 2、3、5、1、8：2＋3＋5＝10，算這三格（10 分），1 和 8 放棄；拖 4、6、3、7、4：4＋6＋3＋7＝20，算前四格（20 分），最後的 4 放棄。
     前面找不到任何一段總和是 10 的倍數（至少 2 格），這次就不算。挑選的格子裡「會被算進去的」是藍底、「會被放棄的」是橘底加斜線。
   · 收走的格子會消失，上面的方格往下掉、最上面再掉下新的方格補滿（像 Candy Crush）；棋盤大小隨關卡變大（第 1 關 5×7，第 20 關起 8×11）。
   · 闖關制：每一關有「目標分數」，**不限拖曳次數**，在時間內湊到目標分數就過關；時間到就失敗（會把盤面上目前得分最高的一串標出來）。
   ───────────────────────────────────────────────────────────────────
   · 掉下來的新數字（fillNew，跟連號長龍同一個想法）：**收走之後，每一欄剩下的方格往下掉到底，缺幾格就從上面補幾格新的**，
     新方格「最後停在哪一格」在掉下來之前就知道了，所以**先看停下來之後，它四周的格子是什麼數字，再決定它要寫什麼數字**：
       1. 對每個可以寫的數字（1～9），算「寫這個數字，從這一格出發往外拖（相鄰的格子，最多 FILL_DEPTH 格），能湊出總和是 10 的倍數的最高分」（potential）；
       2. 挑「最接近 AIM_SUM」的那幾個（前 PICK_K 名裡隨機挑一個）：AIM_SUM 是推算法「想讓玩家有機會一次拿到幾分」，簡單的關卡設得高，
          新掉下來的方格旁邊很容易湊出十（甚至二十、三十）；難的關卡設得低，只剩零星的兩格湊十；
       3. 只有 ASSIST_P 的機率才用上面的推算法，其餘照一般隨機（越難，隨機的越多）；
       4. BREAK_P 的機率反過來：故意挑「從這一格出發湊不出任何 10 的倍數」的數字（落地之後孤立的死格子，越難越多）；
       5. 最後保證盤面上至少有一串得分 MIN_BEST_SUM 以上的可以拿（ensureMove），不會整個盤面沒路可走。
     開局的盤面也是用同一套方法填出來的（所有格子都當成新掉下來的）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、落下、判斷，單元測試直接測它們）；
       ③ 交給共用介面的規則（spec）。最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。
       'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'sumten'：選單、成績、存檔都靠它；樣式在 css/numgrid.css（兩款共用，class 以 numgrid- 開頭）。 */
    'use strict';

    var ID = 'sumten';                                  /* 這款遊戲的代號：選單、成績、存檔都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var kit = Reaction.kit, NG = Reaction.numGrid;      /* kit：闖關遊戲共用的工具箱；NG：數字方格系列共用的引擎與介面（js/numgrid_ui.js） */

    /* ═══ 可以自己調的參數 ═══
       （盤面大小、浮窗、快速拖曳、數字高度、掉落動畫這些「兩款共用的介面參數」在 js/numgrid_ui.js） */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TIME_S = [120, 600];                     /* 每關限時（秒）：第 1 關 → 到頂（不限拖曳次數，所以「目標分數」與「時間」一起決定難度） */
    var TARGET = [300, 900];                    /* 過關的目標分數：第 1 關 → 到頂（得分＝這一串的總和，10 分、20 分、30 分…；越高越難） */
    var TEN = 10;                               /* 總和要是這個數字的倍數才能收走（玩家指定：10 的倍數） */
    var MIN_CELLS = 2;                          /* 一串至少幾格（1 格最大才 9，湊不出 10，所以最少是 2） */
    var LEN_BONUS = 0;                          /* 長度加分：一串每多一格（超過 2 格的部分）多得幾分（0＝得分就是總和，不管幾格） */
    var SEARCH_LEN = 8;                         /* 找「盤面上最好的一串」（提示、時間到標出來、保證有路可走）時，最多看幾格的串（再長搜尋會太慢） */
    var SEARCH_BUDGET = 60000;                  /* 找最好的一串時，最多搜幾步（超過就用目前找到最好的） */
    /* ── 掉下來的新數字怎麼挑（推算法，說明見檔案開頭）──
       每個數字都是 [第 1 關, 到頂]，線性變化（PICK_K 會四捨五入成整數）。 */
    var ASSIST_P = [0.9, 0.35];                 /* 用推算法挑數字的機率（其餘的新方格是 1～9 隨機）：越高，新方格旁邊越容易湊出十 */
    var AIM_SUM = [30, 10];                     /* 推算法想讓玩家一次拿到幾分：挑「從這一格出發最高能湊出幾分」最接近這個數字的數字（簡單的關卡設高，旁邊容易湊出二十、三十；難的關卡設低，只剩兩格湊十） */
    var PICK_K = [1, 3];                        /* 推算法在最接近 AIM_SUM 的前幾名裡隨機挑一個（1＝每次都挑最好的，越大越不準、越難預測） */
    var BREAK_P = [0, 0.4];                     /* 反過來「搗蛋」的機率：新方格故意挑「旁邊沒有剛好湊成 10 的鄰居」的數字（BREAK_REACH；落地後就沒有兩格湊十可拿；越高越難） */
    var MIN_BEST_SUM = [30, 10];                /* 盤面上至少保證有一串得幾分以上的可以拿（太少會整個盤面沒路可走；最少 10） */
    var FILL_DEPTH = 5;                         /* 算「從新方格出發能湊出幾分」時，最多看幾格的串（含新方格自己） */
    var BREAK_REACH = 1;                        /* 「搗蛋」的時候，躲開幾格以內的湊十（1＝只躲兩格湊十：新方格旁邊沒有剛好湊成 10 的鄰居，但還是可能要三、四格才湊得出十；調大一點，新方格更孤立） */
    var MAX_LEVEL = 90;                         /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（不碰畫面，單元測試直接測）═══ */
    var gridOf = NG.gridOf, adjacent = NG.adjacent, neighbors = NG.neighbors, collapse = NG.collapse, growWalk = NG.growWalk;

    /* 一串（n 格、總和 sum）的得分：總和＋長度加分 */
    function scoreOf(sum, n) { return sum + LEN_BONUS * Math.max(0, n - MIN_CELLS); }

    /* 第 level 關的各項難度（都是 [第 1 關, 到頂] 線性變化） */
    function ramp(level, pair) { return NG.ramp(level, pair, RAMP_LEVELS); }
    function targetFor(level) { return Math.max(TEN, Math.round(ramp(level, TARGET))); }  /* Math.round：四捨五入成整數 */
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }
    function fillParams(level) {
        return { assist: ramp(level, ASSIST_P), aim: ramp(level, AIM_SUM), k: Math.max(1, Math.round(ramp(level, PICK_K))), brk: ramp(level, BREAK_P) };
    }
    function minBestFor(level) { return Math.max(TEN, Math.round(ramp(level, MIN_BEST_SUM))); }

    /* 從第 k 格出發（k 自己的數字還沒定），沿著相鄰的格子往外拖（不重複、最多 FILL_DEPTH − 1 格），每走一格就記一筆 { s 這幾格的總和（不含 k）, n 這幾格的格數 }。
       之後 k 寫上數字 v，v + s 是 10 的倍數的那些筆，就是「從 k 出發能湊出的串」（見 potentialOf） */
    function reachFrom(gr, vals, k) {
        var out = [], mark = {};
        mark[k] = 1;
        (function go(c, s, n) {
            if (n >= FILL_DEPTH - 1) return;
            gr.nb[c].forEach(function (m) {
                if (mark[m] || vals[m] == null) return;
                mark[m] = 1; out.push({ s: s + vals[m], n: n + 1 }); go(m, s + vals[m], n + 1); mark[m] = 0;
            });
        })(k, 0, 0);
        return out;
    }
    /* 第 k 格寫上數字 v，從這一格出發最高能湊出幾分（湊不出回傳 0）；reach＝reachFrom 先算好的 */
    function potentialOf(v, reach) {
        var best = 0;
        reach.forEach(function (e) { var sum = v + e.s; if (sum % TEN === 0) best = Math.max(best, scoreOf(sum, e.n + 1)); });
        return best;
    }
    /* 同上，但只看「新方格之外最多 maxN 格」的串（搗蛋時用：maxN＝1 就是只看兩格湊十） */
    function potentialWithin(v, reach, maxN) {
        return potentialOf(v, reach.filter(function (e) { return e.n <= maxN; }));  /* filter：留下符合條件的元素，回傳新陣列 */
    }
    /* 挑第 k 格（新方格最後停的位置）要寫的數字：依難度參數 P（fillParams）決定「搗蛋」「用推算法」還是「隨機」 */
    function pickValue(gr, vals, k, P, rand) {
        var v, roll = rand();
        if (roll < P.brk) {                              /* 搗蛋：挑「從這一格出發（BREAK_REACH 格以內）湊不出任何 10 的倍數」的數字 */
            var reach0 = reachFrom(gr, vals, k), calm = [];
            for (v = 1; v <= 9; v++) if (potentialWithin(v, reach0, BREAK_REACH) === 0) calm.push(v);
            return calm.length ? kit.pick(calm, rand) : kit.randInt(1, 9, rand);
        }
        if (rand() < P.assist) {                         /* 推算法：算每個數字的潛力，挑最接近想要的分數的前 K 名之一 */
            var reach = reachFrom(gr, vals, k), cands = [];
            for (v = 1; v <= 9; v++) { var pot = potentialOf(v, reach); cands.push({ v: v, pot: pot, d: Math.abs(pot - P.aim) }); }   /* 湊不出（0 分）也是候選：旁邊本來就很容易湊出高分時，寧可不接 */
            cands = kit.shuffle(cands, rand);            /* 先洗牌，同樣接近的就隨機 */
            cands.sort(function (a, b) { return a.d - b.d || b.pot - a.pot; });  /* sort：排序；比較函式回傳負數代表 a 排前面 */
            return kit.pick(cands.slice(0, P.k), rand).v;
        }
        return kit.randInt(1, 9, rand);
    }
    /* 把 fresh（缺的格子＝新方格最後停的位置）都填上數字（直接改 vals；填的順序見 NG.fillNew） */
    function fillNew(gr, vals, fresh, level, rand) {
        rand = rand || Math.random;
        var P = fillParams(level);
        return NG.fillNew(gr, vals, fresh, function (k) { return pickValue(gr, vals, k, P, rand); }, rand);
    }

    /* 這一串（格子編號，依拖的順序）怎麼算：先取「相鄰、不重複、都有數字」的最長前面幾格（L），再從裡面找「總和是 10 的倍數、至少 MIN_CELLS 格」最長的前面幾格（m）。
       回傳 { prefix（L）, m（算進去的格數，0＝湊不出）, sum（這 m 格的總和）} */
    function usable(gr, vals, sel) {
        var L = 0, i, seen = {};
        for (i = 0; i < sel.length; i++) {
            var k = sel[i];
            if (vals[k] == null || seen[k] || (i > 0 && !adjacent(gr, sel[i - 1], k))) break;
            seen[k] = 1; L = i + 1;
        }
        var sum = 0, m = 0, msum = 0;
        for (i = 0; i < L; i++) {
            sum += vals[sel[i]];
            if (i + 1 >= MIN_CELLS && sum % TEN === 0) { m = i + 1; msum = sum; }
        }
        return { prefix: L, m: m, sum: msum };
    }

    /* 找盤面上得分最高的一串（深度優先搜尋所有不重複的相鄰串，最多 SEARCH_LEN 格）：回傳格子編號的陣列（已經是「算進去的」那幾格，沒有就是空陣列）；
       stopAt（可省略）＝找到得分到這麼高就停 */
    function bestMove(gr, vals, stopAt, budget) {
        var best = [], bestScore = 0, left = budget || SEARCH_BUDGET, mark = {};
        function go(path, sum) {
            if (left-- <= 0 || (stopAt && bestScore >= stopAt)) return;
            if (path.length >= MIN_CELLS && sum % TEN === 0) {
                var sc = scoreOf(sum, path.length);
                if (sc > bestScore) { bestScore = sc; best = path.slice(); }
            }
            if (path.length >= SEARCH_LEN) return;
            var last = path[path.length - 1];
            gr.nb[last].forEach(function (k) {
                if (left <= 0 || (stopAt && bestScore >= stopAt)) return;
                if (mark[k] || vals[k] == null) return;
                mark[k] = 1; path.push(k); go(path, sum + vals[k]); path.pop(); mark[k] = 0;
            });
        }
        for (var i = 0; i < gr.n && left > 0 && !(stopAt && bestScore >= stopAt); i++) if (vals[i] != null) { mark = {}; mark[i] = 1; go([i], vals[i]); }
        return best;
    }
    /* 一串（格子編號）的總和與得分 */
    function sumOf(vals, cells) { return cells.reduce(function (a, k) { return a + vals[k]; }, 0); }
    function bestScore(gr, vals, budget) { var p = bestMove(gr, vals, 0, budget); return p.length ? scoreOf(sumOf(vals, p), p.length) : 0; }

    /* 把總和 total 隨機拆成 len 份、每份 1～9（total 要在 len～9×len 之間） */
    function randomParts(total, len, rand) {
        var parts = [], i;
        for (i = 0; i < len; i++) parts.push(1);
        var rest = total - len, guard = 0;
        while (rest > 0 && guard++ < 1000) {
            var j = kit.randInt(0, len - 1, rand);
            if (parts[j] < 9) { parts[j]++; rest--; }
        }
        return parts;
    }
    /* 保證盤面上至少有一串得 minScore 分以上的可以拿：沒有的話，隨機種一條路、數字加起來剛好是 minScore 往上取到 10 的倍數的那一個（直接改 vals）。回傳有沒有改 */
    function ensureMove(gr, vals, minScore, rand) {
        if (minScore < TEN) return false;
        var p0 = bestMove(gr, vals, minScore);
        if (p0.length && scoreOf(sumOf(vals, p0), p0.length) >= minScore) return false;       /* 已經有夠高分的一串 */
        var total = Math.ceil(minScore / TEN) * TEN, lo = Math.max(MIN_CELLS, Math.ceil(total / 9)), hi = Math.min(SEARCH_LEN, total);
        var len = kit.randInt(lo, Math.max(lo, hi), rand), free = vals.map(function (v) { return v != null; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var path = growWalk(gr, free, len, rand);
        if (!path) return false;
        var parts = randomParts(total, len, rand);
        path.forEach(function (k, j) { vals[k] = parts[j]; });
        return true;
    }

    /* 出題：回傳 { vals（開局的盤面）, target（目標分數）, level, gr（棋盤）, w, h }。開局的盤面也是「全部格子都是新掉下來的」，用同一套推算法填 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var gr = NG.gridFor(level), vals = [], all = [], i;
        for (i = 0; i < gr.n; i++) { vals.push(null); all.push(i); }
        fillNew(gr, vals, all, level, rand);
        ensureMove(gr, vals, minBestFor(level), rand);
        return { vals: vals, target: targetFor(level), level: level, gr: gr, w: gr.w, h: gr.h };
    }

    /* ── 玩的狀態 ──
       st：{ gr（棋盤）, vals（每格目前的數字）, sel（目前挑選的格子，依挑選的先後）, score（已得分）, done（已收走幾串）, level } */
    function newState(q) { return { gr: q.gr, vals: q.vals.slice(), sel: [], score: 0, done: 0, level: q.level || 1 }; }

    /* 拖曳的規則：數字沒有限制（相鄰由共用的 NG.dragStep 檢查） */
    function canStep() { return true; }
    function beginDrag(st, k) { return NG.beginDrag(st, k); }
    function dragStep(st, ss, k) { return NG.dragStep(st, ss, k, canStep); }
    function endDrag(st, ss) { return NG.endDrag(st, ss); }

    /* 現在按「確定」會怎樣：{ valid（收得走嗎）, gain（得幾分）, used（算進去的格子）, dropped（被放棄的格子：挑選了但不在算進去的前面幾格裡）, sum, n } */
    function preview(st) {
        var u = usable(st.gr, st.vals, st.sel);
        if (!u.m) return { valid: false, gain: 0, used: st.sel.slice(), dropped: [], sum: 0, n: 0 };
        return { valid: true, gain: scoreOf(u.sum, u.m), used: st.sel.slice(0, u.m), dropped: st.sel.slice(u.m), sum: u.sum, n: u.m };
    }

    /* 收走目前挑選的格子：取「總和是 10 的倍數」的最長前面幾格（usable）——得分、這幾格消失、其餘的方格往下掉、上面補新的方格（collapse＋fillNew），盤面沒有夠好的就補一串（ensureMove）。
       被放棄的格子（後面多出來的）不收走、留在盤面上。
       成功回傳 { ok:true, n（收走幾格）, sum（總和）, gain（得幾分）, cells（收走的格子，拖的順序）, dropped（放棄的格子）, oldVals, moves, fresh }，挑選清空；
       不行回傳 { ok:false, reason:'short'（不到 2 格）或 'sum'（找不到總和是 10 的倍數的一串）, n, cells }，挑選留著（讓玩家改）；沒有挑選就回傳 null */
    function commit(st, rand) {
        var sel = st.sel;
        if (!sel.length) return null;
        if (sel.length < MIN_CELLS) return { ok: false, reason: 'short', n: sel.length, cells: sel.slice() };
        var u = usable(st.gr, st.vals, sel);
        if (!u.m) return { ok: false, reason: 'sum', n: sel.length, cells: sel.slice() };
        rand = rand || Math.random;
        var cells = sel.slice(0, u.m), dropped = sel.slice(u.m), gain = scoreOf(u.sum, u.m), oldVals = cells.map(function (k) { return st.vals[k]; });
        var cz = collapse(st.gr, st.vals, cells);
        fillNew(st.gr, cz.vals, cz.fresh, st.level, rand);
        ensureMove(st.gr, cz.vals, minBestFor(st.level), rand);
        st.vals = cz.vals; st.score += gain; st.done++; st.sel = [];
        return { ok: true, n: u.m, sum: u.sum, gain: gain, cells: cells, dropped: dropped, oldVals: oldVals, moves: cz.moves, fresh: cz.fresh };
    }

    /* 結算評語：n ＝ 通過幾關 */
    function rating(n) {
        if (n >= 20) return '十全十美！';
        if (n >= 10) return '心算高手！';
        if (n >= 5) return '湊得很準！';
        if (n >= 2) return '不錯喔！';
        return '先找兩格剛好湊十的，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把規則（spec）交給共用的介面 NG.mount（說明見 js/numgrid_ui.js 開頭）。 */
    function mount(root, ctx) {
        NG.mount(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, rating: rating,
            makePuzzle: makePuzzle, newState: newState, timeMs: timeMs, canStep: canStep, commit: commit, preview: preview,
            logLine: function (q, level) { return '[拖曳湊十] 第 ' + level + ' 關：棋盤 ' + q.gr.w + '×' + q.gr.h + '、目標 ' + q.target + ' 分；限時 ' + timeMs(level) + ' ms；推算法 ' + JSON.stringify(fillParams(level)); },
            failMsg: function (r) { return r.reason === 'short' ? '至少要拖 ' + MIN_CELLS + ' 格' : '總和要是 ' + TEN + ' 的倍數'; },        /* 標題列右邊放不下長句（會換行、把盤面往下推），要短 */
            best: function (st, stopAt) { return bestMove(st.gr, st.vals, stopAt || 0, stopAt ? SEARCH_BUDGET : 30000); },
            links: function (st) {                       /* 挑選的格子，依挑選的先後，相鄰的兩格連一條線（斷掉的地方就是後面會被放棄的） */
                var out = [], sel = st.sel;
                for (var i = 1; i < sel.length; i++) if (adjacent(st.gr, sel[i - 1], sel[i])) out.push([sel[i - 1], sel[i]]);
                return out;
            },
            hintText: '拖過的數字加起來是 10（例如 3＋7）',
            failLines: function (st, q, shown) {
                var best = shown.length ? scoreOf(sumOf(st.vals, shown), shown.length) : 0;
                return ['時間到，得分 ' + st.score + '／目標 ' + q.target, '收走了 ' + st.done + ' 串；盤面上最高還能拿 ' + best + ' 分（' + shown.length + ' 格）'];
            }
        });
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '拖曳湊十',
        rule: '方格裡每一格有一個 1～9 的數字。**手指從一格拖到上下左右相鄰的格子，拖過的數字加起來，總和是 10 的倍數（10、20、30…）就能收走**，不管拖幾格，得分就是總和。也可以**用點的：點一下挑選，再點一下已經挑選的方格就放棄它**。**拖過頭也沒關係**：放開手指時只算「總和是 10 的倍數」的最長前面幾格，後面多的會被放棄、留在盤面上（例如拖 2、3、5、1、8，算 2＋3＋5＝10，1 和 8 不算）。按下面的「確定」就收走拿分；勾選「快速拖曳」，手指一離開就直接收走；勾選「浮窗」，手指上方會浮出附近的九格，不怕被手指擋住。收走的格子消失後，上面的方格會往下掉，最上面再掉下新的方格補滿。**不限拖曳次數，在時間內湊到目標分數**就過關，時間到就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            gridOf: gridOf, neighbors: neighbors, adjacent: adjacent, scoreOf: scoreOf, ramp: ramp, targetFor: targetFor, timeMs: timeMs, dimsFor: NG.dimsFor, gridFor: NG.gridFor, fillParams: fillParams, minBestFor: minBestFor,
            collapse: collapse, reachFrom: reachFrom, potentialOf: potentialOf, potentialWithin: potentialWithin, pickValue: pickValue, fillNew: fillNew, usable: usable, bestMove: bestMove, bestScore: bestScore, sumOf: sumOf,
            randomParts: randomParts, ensureMove: ensureMove, makePuzzle: makePuzzle, newState: newState, preview: preview, beginDrag: beginDrag, dragStep: dragStep, endDrag: endDrag,
            commit: commit, rating: rating, growWalk: growWalk, loupeAt: NG.loupeAt, getOpts: NG.getOpts,
            RAMP_LEVELS: RAMP_LEVELS, TIME_S: TIME_S, TARGET: TARGET, TEN: TEN, MIN_CELLS: MIN_CELLS, LEN_BONUS: LEN_BONUS, SEARCH_LEN: SEARCH_LEN, FILL_DEPTH: FILL_DEPTH, BREAK_REACH: BREAK_REACH,
            ASSIST_P: ASSIST_P, AIM_SUM: AIM_SUM, PICK_K: PICK_K, BREAK_P: BREAK_P, MIN_BEST_SUM: MIN_BEST_SUM, MAX_LEVEL: MAX_LEVEL,
            DEFAULT_LOUPE: NG.DEFAULT_LOUPE, DEFAULT_FAST: NG.DEFAULT_FAST, DIGIT_H: NG.DIGIT_H
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
