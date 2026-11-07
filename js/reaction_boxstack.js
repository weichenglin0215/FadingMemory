/* ═══════════════════════════════════════════════════════════════════
   reaction_boxstack.js — 秒反應・疊箱子（原創篇 538「疊箱子」，照使用者的修改）
   樣式：css/games/reaction_boxstack.css（class 一律以「boxstack-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：倉庫的架子每格放一箱，規矩：**越下面越重、越右邊越重**（每一箱都比它上面那箱重、比它左邊那箱重；
     後面的關卡「一樣重」也可以）。**有幾箱已經貼好重量、放在固定的位置**（深色的箱子，不能動），其他重量在下面的清單上。
     點清單上的重量、再點空格放進去；點自己放的箱子可以拿回來。放得違反規矩，違反的那兩箱會變紅。
   · 使用者的第一次意見（V1.42）：如果沒有先固定幾箱，照重量從左上排到右下一定會過關、沒有難度。所以：
       ① 每題都先固定幾箱（剛好讓答案只剩一種的最少箱數，前面的關卡多給一兩箱暖身）；
       ② 出題器把「剩下的重量照大小一排一排填、一直行一直行填、或照斜線填就剛好對」的題目全部丟掉。
   · 使用者的第二次意見（V1.43.0）：難度還是太低，幾乎都是直覺照大小排；格子再多也沒用（最左上一定是最輕、最右下一定是最重，
     2 只能放在兩個位置……每個數字能放的位置都被限制得很死）。預先固定的箱子不是越多越好，重點是**位置能不能逼玩家重新想順序**；
     另外給了三個方向：①重量不是 1～N，而是從一大段範圍裡取 N 個（例如 3～58 取 16 個）；②重量可以重複、有的重量沒出現；③兩個混在一起。照做：
       A. **要玩家重新想的是「空格」**：先算出三種直覺填法（一排一排／一直行一直行／斜線）每一格的名次，答案裡名次跟三種直覺都差得
          最遠的格子叫「出乎直覺」。實測（note 裡沒有、test 用 bx 實驗）：最少箱數的題目有 93～97% 的 3×3、7 成的 4×5 剩下的重量
          照大小一排一排填就對，而「先固定出乎直覺的箱子」反而更糟（剩下的空格就變得很規矩）。所以反過來：固定的箱子優先挑最合直覺的位置，
          最出乎直覺的格子留給玩家填；刪掉多餘的箱子時先試著拿掉最出乎直覺的。
       B. **出題器要求「剩下的空格裡，答案跟每一種直覺填法都不一樣的比例」**（naiveDiff），這個比例隨關卡升高（DIFF_FRAC：原本 20% → 50%，使用者手調成目前的 50% → 80%，
          實測 3×3 最多只做得到 40% 左右、4×5 到 65%），空格數由參數 EMPTY 控制（V1.43.1：第 1 關 → 第 30 關，目前是 4 → 12 個；架子撐不住那麼多空格時取撐得住的最大值，3×3 最多 4 個），
          最左上、最右下一定是最輕、最重，V1.43.1 起一律**預先放好（固定）**，不用玩家自己放，其餘固定的箱子再另外算「最少幾箱才唯一」。
       C. 階段（STAGES）：第 1～8 關 3×3、重量 1～N（seq）→ 第 9～16 關 3×4、**重量從一大段範圍取、中間有很多空隙（gap）**，
          固定的箱子是 3、17、41 這種數字，要先換算成「第幾輕」才知道它該在哪 → 第 17～24 關 4×4、**重量可以重複、有的重量沒出現
          （dup，一樣重可以放一起）** → 第 25 關起 4×5、**兩個混在一起（mix）**。
   · 頓悟：一箱的左上方那一整塊都比它輕、右下方那一整塊都比它重，所以「左上方有幾箱」就是它的名次下限，
     再用固定的箱子夾：夾在 3 公斤和 8 公斤中間、又要比左上方 2 箱重……一格一格縮小範圍。
   · 數解（唯一性）：不管重量重不重複，「重量由輕到重、每種重量佔的格子」＝從左上往右下一層一層長大的階梯形。所以用動態規劃：
     狀態＝目前階梯形（每一排填到第幾格，最多 126 種），一種重量一種重量地往外長，數有幾種長法（見 countFillV）。
   · 限時（V1.43.1，原本是不限時的自由解題）：每一關限時 ＝ TIME_BASE ＋ 空格數 × 每格幾秒（7 → 5 秒，線性），上面的時間條倒數；時間到了＝失敗（把正確答案放上去）。
     全部放好而且都符合規矩就過關（答案唯一），成績＝解開幾題。
   · 提示（每題 HINTS 次）：有放錯的箱子就標出它；都沒放錯就替你放好一箱（標成黃色）。**只有前 kit.HINT_LEVELS（4）關才有「提示」按鈕**，第 5 關起連按鈕都沒有（V1.47）。
   · 進場關卡（V1.47）：本來這款遊戲把 kit.run 的 resume 選項設成 false（是不限時的自由解題時期留下的），所以玩到高關卡後再玩，永遠從第 1 關開始；
     V1.43.1 改成限時、答錯就失敗之後早該拿掉。現在跟其他闖關遊戲一樣：下次從「最佳關卡 − 4」進場，失敗後可以從前 5 關繼續。
   · 版面（V1.47，玩家意見）：① 下面的重量清單（答案區）**最多只放兩橫行**，依要放的箱數縮放每顆的大小（chipLayout）；
     ② 箱子上的數字依字數縮小字級（fitFs），三位數也不會超出方格的寬度；③ 架子大小同時考慮畫面高度，清單與按鈕不會被擠出畫面。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'boxstack'：選單、成績、存檔都靠它；樣式在 css/games/reaction_boxstack.css，裡面的 class 名稱一律以 boxstack- 開頭。 */
    'use strict';

    var ID = 'boxstack';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [                              /* to＝這個階段的最後一關；r×c＝架子幾層幾格；mode＝重量的種類（seq／gap／dup／mix） */
        { to: 2, r: 3, c: 3, mode: 'seq' },
        { to: 4, r: 3, c: 4, mode: 'seq' },
        { to: 6, r: 3, c: 4, mode: 'gap' },
        { to: 9, r: 4, c: 4, mode: 'dup' },
        { to: 12, r: 4, c: 5, mode: 'mix' },
        { to: 15, r: 5, c: 5, mode: 'mix' },
        { to: 9999, r: 5, c: 6, mode: 'mix' }
    ];
    var EMPTY = [7, 20];   /*4 12*/                      /* 空格數（玩家要自己放的箱子數，不含已經固定的）：第 1 關 → 第 RAMP_LEVELS 關（線性）。要的比這種架子「答案還唯一」撐得住的空格數更多時，就用撐得住的最大空格數（V1.43.1） */
    var MODES = {                               /* span＝重量的範圍有多寬（格子數的幾倍）；distinct＝不同的重量佔格子數的幾成（沒寫＝每格都不同） */
        seq: {},
        gap: { span: 3.5 },
        dup: { span: 1, distinct: 0.6 },
        mix: { span: 3.5, distinct: 0.65 }
    };
    var VAL_LO = [1, 9];                        /* 最輕的重量從這個範圍亂數挑（gap／dup／mix） */
    var DUP_MAX = 2;                            /* 同一種重量最多重複幾箱 */
    var RAMP_LEVELS = 30;                           /* 難度升到頂的關卡：第 1 關線性變難，到第 30 關最難，之後維持不變 */
    var DIFF_FRAC = [0.6, 0.9];                 /* 剩下的空格裡，答案跟「每一種直覺填法」都不一樣的比例至少多少：第 1 關 → 到頂（太高會找不到題目，見檔頭說明） */
    var HINTS = 3;                                  /* 每一題可以用幾次提示（目前 3 次） */
    var TRIES = 500;                                /* 出題時最多重抽幾次（都達不到空格數與難度比例，就用最接近的那一題） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var PASS_DELAY_MS = 1400;                       /* 答對（過關）後停多久才換下一關（毫秒，1400 毫秒＝1.4 秒） */
    var FAIL_HOLD_MS = 6000;                        /* 答錯（失敗）後停多久才跳出結算畫面（毫秒，6000 毫秒＝6 秒），讓玩家先看清楚答案 */
    var TIME_BASE = 15, TIME_CELL = [4, 6];  /* 每一關限時（秒）＝基本 ＋ 每一個空格幾秒（第 1 關 → 第 30 關，線性縮短）；時間到了＝失敗，並亮出答案（V1.43.1） */
    var TRAY_ROWS = 2;                          /* V1.47：下面的重量清單最多放幾橫行（箱子多就縮小每顆，不增加行數） */
    var CHIP_MAX = 66, CHIP_MIN = 14;           /* 清單上每顆重量的邊長範圍（px）：箱子少時 66，箱子多時縮小（空格 20 個時約 39）；小到 14 就是極限了（再小也看不清楚），這時要多放幾個空格得改 TRAY_ROWS */
    var CELL_FS = 40, CHIP_FS = 34;             /* 架上的箱子、清單上的重量「最大字級」（px，對應主題的 --fs-xl、--fs-lg）；數字字數多、方格放不下時才會比這小（fitFs） */
    var CELL_MAX = 96;                          /* 架上每格最大邊長（px） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function emptyFor(level) { return Math.max(1, Math.round(kit.ramp(level, EMPTY[0], EMPTY[1], RAMP_LEVELS))); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function timeFor(level, empties) { return TIME_BASE + empties * kit.ramp(level, TIME_CELL[0], TIME_CELL[1], 30); }
    /* 這一關屬於哪個難度階段：依關卡編號找出對應的設定（參數區的階段表） */
    function stageOf(level) {
        level = Math.max(1, level);
        var from = 1;
        for (var i = 0; i < STAGES.length; i++) {
            if (level <= STAGES[i].to || i === STAGES.length - 1) return { st: STAGES[i], idx: level - from + 1, len: Math.min(STAGES[i].to, from + 9) - from + 1 };
            from = STAGES[i].to + 1;
        }
    }
    /* V1.47 清單版面：count 顆重量、清單可用寬度 trayW → { perRow 每行幾顆, gap 間隔, size 每顆邊長, width 清單實際寬度, rows 幾行 }。
       做法：一行放得下（以最大邊長 CHIP_MAX 算）就一行；放不下就分成 TRAY_ROWS（2）行，每行 ⌈count ÷ 2⌉ 顆，再算每顆多大（不小於 CHIP_MIN）。
       清單的寬度剛好是「每行幾顆」那麼寬，flex 換行就一定換在同一個位置，絕對不會超過 TRAY_ROWS 行。 */
    function chipLayout(count, trayW) {
        count = Math.max(1, count);
        var gap = 10, fit = Math.max(1, Math.floor((trayW + gap) / (CHIP_MAX + gap)));          /* fit：邊長 CHIP_MAX 時，一行放得下幾顆 */
        var perRow = count <= fit ? count : Math.ceil(count / TRAY_ROWS);                       /* Math.ceil：無條件進位成整數 */
        if (perRow > fit) gap = 6;                                                              /* 一行要放很多顆時，間隔縮小一點 */
        var size = Math.max(CHIP_MIN, Math.min(CHIP_MAX, Math.floor((trayW - (perRow - 1) * gap) / perRow)));  /* Math.floor：無條件捨去成整數 */
        return { perRow: perRow, gap: gap, size: size, width: perRow * size + (perRow - 1) * gap, rows: Math.ceil(count / perRow) };
    }
    /* V1.47 字級：len 個字的數字放進邊長 box（px）的方塊，最大字級 max（px）——算出放得下的字級。
       黑體數字每個字約 0.62 倍字級寬，所以字級 ≤ （方塊邊長 − 邊框與留白 10）÷（字數 × 0.64）；不夠大就用算出來的，最小 10。 */
    function fitFs(len, box, max) { return Math.max(10, Math.min(max, Math.floor((box - 10) / (Math.max(1, len) * 0.64)))); }
    /* V1.47 架上每格的邊長：不超過 CELL_MAX、不超過寬度（架子佔畫面寬 86%）、也不超過高度（上面的說明文字、架子、提示文字、清單、按鈕全部要放得進畫面高度 H）。
       trayH：清單的高度；r、c：架子幾層幾格。高度的扣除項：上方留白 6 ＋ 橫向箭頭 26 ＋ 間隔 4 ＋ 架子內縮與外框 20 ＋ 格間隔 6 × (r−1) ＋ 三處間隔 12 × 3 ＋ 提示文字 30 ＋ 清單 ＋ 按鈕 60 */
    function cellFor(W, H, r, c, trayH) {
        var byW = Math.floor((W * 0.86 - c * 6) / c), byH = Math.floor((H - (6 + 26 + 4 + 20 + 6 * (r - 1) + 36 + 30 + trayH + 60)) / r);
        return Math.max(30, Math.min(CELL_MAX, byW, byH));
    }
    function isWeak(mode) { return mode === 'dup' || mode === 'mix'; }      /* 重量會重複（一樣重可以放一起） */
    function seqVals(N) { var a = []; for (var i = 1; i <= N; i++) a.push(i); return a; }
    /* 這個關卡的重量（由輕到重，長度 N）：seq＝1～N；gap＝從 [lo, lo＋span] 取 N 個不重複；dup／mix＝取 K 種、其中有的重複 */
    function makeValues(mode, N, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var m = MODES[mode] || MODES.seq;
        if (mode === 'seq' || !m.span) return seqVals(N);
        var lo = kit.randInt(VAL_LO[0], VAL_LO[1], rand), size = Math.max(N, Math.round(N * m.span));  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        var pool = []; for (var i = 0; i < size; i++) pool.push(lo + i);
        var K = m.distinct ? Math.max(2, Math.min(N - 1, Math.round(N * m.distinct))) : N;  /* Math.round：四捨五入成整數 */
        var picks = kit.shuffle(pool, rand).slice(0, K).sort(function (a, b) { return a - b; });  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        var mult = picks.map(function () { return 1; }), extra = N - K;  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        while (extra > 0) { var q = kit.randInt(0, K - 1, rand); if (mult[q] < DUP_MAX) { mult[q]++; extra--; } }
        var out = [];
        picks.forEach(function (v, q) { for (var t = 0; t < mult[q]; t++) out.push(v); });  /* forEach：對陣列的每個元素各做一次 */
        return out;
    }
    /* [{ v: 重量, m: 有幾箱 }, …]（由輕到重） */
    function groupsOf(vals) {
        var gs = [];
        vals.forEach(function (v) { if (gs.length && gs[gs.length - 1].v === v) gs[gs.length - 1].m++; else gs.push({ v: v, m: 1 }); });
        return gs;
    }
    /* 隨機產生一種合法擺法（名次 1～N）：每次在「可以放的角落」（上面和左邊都放好了的空格）隨機挑一格放下一個名次 */
    function randomStack(r, c, rand) {
        var g = [], N = r * c, i, j, v;
        for (i = 0; i < N; i++) g.push(0);
        for (v = 1; v <= N; v++) {
            var cand = [];
            for (i = 0; i < r; i++) for (j = 0; j < c; j++) { var k = i * c + j; if (!g[k] && (i === 0 || g[k - c]) && (j === 0 || g[k - 1])) cand.push(k); }
            g[kit.pick(cand, rand)] = v;                /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        }
        return g;
    }
    /* 照固定的箱子（given[k]＝重量，0＝空格）數有幾種填法（最多數到 limit），重量是 vals（由輕到重的多重集合）。
       做法（動態規劃）：重量由輕到重，一種重量一種重量地加進去；「重量 ≤ 目前這種」的格子一定是從左上角長出來的階梯形
       （每一排的長度不增）。狀態＝階梯形（每一排填到第幾格），這一種重量要佔 m 格，就是從舊階梯形長成新階梯形、多出 m 格；
       多出來的格子裡，固定的箱子必須剛好是這個重量，而這個重量的固定箱子也必須都在這 m 格裡 */
    function countFillV(r, c, given, vals, limit) {
        var gs = groupsOf(vals), memo = {}, i, k;
        var need = {}, avail = {};
        for (k = 0; k < r * c; k++) if (given[k]) need[given[k]] = (need[given[k]] || 0) + 1;
        gs.forEach(function (g) { avail[g.v] = g.m; });
        for (var v in need) if (!avail[v] || need[v] > avail[v]) return 0;           /* 固定的重量不在清單裡，或比清單裡的箱數多 */
        function fits(shape, ns, val) {
            var found = 0;
            for (var a = 0; a < r; a++) for (var b = shape[a]; b < ns[a]; b++) {
                var q = given[a * c + b];
                if (q) { if (q !== val) return false; found++; }
            }
            return found === (need[val] || 0);
        }
        function rec(t, shape) {
            if (t === gs.length) return 1;
            var key = t + ':' + shape.join('');
            if (key in memo) return memo[key];
            var g = gs[t], total = 0;
            (function row(a, prev, left, ns) {
                if (total >= limit) return;
                if (a === r) { if (left === 0 && fits(shape, ns, g.v)) total += rec(t + 1, ns.slice()); return; }  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
                for (var l = shape[a]; l <= prev; l++) {
                    var d = l - shape[a];
                    if (d > left) break;
                    ns[a] = l; row(a + 1, l, left - d, ns);
                }
            })(0, c, g.m, []);
            return (memo[key] = Math.min(total, limit));
        }
        var start = []; for (i = 0; i < r; i++) start.push(0);
        return rec(0, start);
    }
    /* 重量是 1～N 時的數法（見上面） */
    function countFill(r, c, given, limit) { return countFillV(r, c, given, seqVals(r * c), limit); }
    /* 偷懶的填法：剩下的重量由輕到重，照某個順序填進空格（vals＝全部的重量，沒給就是 1～N）。order：'row' 一排一排、'col' 一直行一直行、'diag' 照斜線 */
    function naiveFill(r, c, given, order, vals) {
        var N = r * c, rest = (vals || seqVals(N)).slice(), cells = [], k, i, j, s;
        for (k = 0; k < N; k++) if (given[k]) { var p = rest.indexOf(given[k]); if (p >= 0) rest.splice(p, 1); }  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
        if (order === 'row') for (k = 0; k < N; k++) cells.push(k);
        else if (order === 'col') for (j = 0; j < c; j++) for (i = 0; i < r; i++) cells.push(i * c + j);
        else for (s = 0; s <= r + c - 2; s++) for (i = 0; i < r; i++) { j = s - i; if (j >= 0 && j < c) cells.push(i * c + j); }
        var g = given.slice(), q = 0;
        cells.forEach(function (k2) { if (!g[k2]) g[k2] = rest[q++]; });
        return g;
    }
    var ORDERS = ['row', 'col', 'diag'];
    function sameArr(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
    /* 偷懶的填法有沒有剛好對 */
    function naiveWorks(r, c, given, sol, vals) {
        return ORDERS.some(function (o) { return sameArr(naiveFill(r, c, given, o, vals), sol); });  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
    }
    /* 三種偷懶的填法裡，答案跟「每一種」都不一樣的空格比例的最小值（越大＝越不能靠直覺；固定的箱子不算） */
    function naiveDiff(r, c, given, sol, vals) {
        var free = 0, k;
        for (k = 0; k < r * c; k++) if (!given[k]) free++;
        if (!free) return 0;
        var worst = 1;
        ORDERS.forEach(function (o) {
            var g = naiveFill(r, c, given, o, vals), d = 0;
            for (k = 0; k < r * c; k++) if (!given[k] && g[k] !== sol[k]) d++;
            worst = Math.min(worst, d / free);
        });
        return worst;
    }
    /* 違反規矩的相鄰兩格：[[上或左, 下或右], …]（只看兩格都有箱子的；一樣重不算違規） */
    function violations(r, c, g) {
        var out = [], i, j;
        for (i = 0; i < r; i++) for (j = 0; j < c; j++) {
            var k = i * c + j;
            if (!g[k]) continue;
            if (i + 1 < r && g[k + c] && g[k + c] < g[k]) out.push([k, k + c]);
            if (j + 1 < c && g[k + 1] && g[k + 1] < g[k]) out.push([k, k + 1]);
        }
        return out;
    }
    /* 每一格「跟直覺差多遠」：三種直覺填法（空架子）的名次，跟答案的名次差的最小值；越大＝越出乎直覺 */
    function surprise(r, c, rk) {
        var N = r * c, none = [], k;
        for (k = 0; k < N; k++) none.push(0);
        var fills = ORDERS.map(function (o) { return naiveFill(r, c, none, o); });
        return rk.map(function (x, q) { return Math.min.apply(null, fills.map(function (f) { return Math.abs(f[q] - x); })); });  /* Math.abs：取絕對值（去掉負號） */
    }
    /* 出一題：{ r, c, mode, vals（由輕到重）, sol[], given[]（0＝空格）, diff } —— 答案唯一、固定的箱子偏向合直覺的位置、空格裡三種直覺填法都對不上的比例夠高 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var s = stageOf(level), st = s.st, r = st.r, c = st.c, N = r * c, best = null, bestScore = -1e9;
        var want = emptyFor(level);
        var frac = kit.ramp(level, DIFF_FRAC[0], DIFF_FRAC[1], RAMP_LEVELS);
        for (var tr = 0; tr < TRIES; tr++) {            /* 用亂數一直重抽，最多 TRIES 次，抽到符合條件的題目就收下 */
            var rk = randomStack(r, c, rand), vals = makeValues(st.mode, N, rand), sol = rk.map(function (x) { return vals[x - 1]; });
            var sp = surprise(r, c, rk), key = sp.map(function (x, q) { return q === 0 || q === N - 1 ? -99 : -x + rand() * 1.5; }), cells = seqVals(N).map(function (x) { return x - 1; });
            var order = cells.slice().sort(function (a, b) { return key[b] - key[a]; });   /* 最合直覺的格子優先固定、最出乎直覺的留給玩家（加一點亂數，每次不完全一樣） */
            var given = [], k;
            for (k = 0; k < N; k++) given.push(0);
            given[0] = sol[0]; given[N - 1] = sol[N - 1];                                  /* 最左上（一定最輕）、最右下（一定最重）預先放好，不用玩家自己放（V1.43.1） */
            for (var a = 0; a < N && countFillV(r, c, given, vals, 2) !== 1; a++) given[order[a]] = sol[order[a]];        /* 一箱一箱固定，直到唯一 */
            order.slice().reverse().forEach(function (q) {                                                                 /* 再拿掉多餘的：先試著拿掉最出乎直覺的 */
                if (!given[q] || q === 0 || q === N - 1) return;
                var v = given[q]; given[q] = 0;
                if (countFillV(r, c, given, vals, 2) !== 1) given[q] = v;
            });
            var free = order.filter(function (q) { return !given[q]; });                    /* 現在的空格數＝這題「答案唯一」撐得住的最大空格數 */
            var shortBy = Math.max(0, want - free.length);                                  /* 要的空格比撐得住的多幾個（0＝夠） */
            for (var e = 0; e < free.length - want; e++) given[free[e]] = sol[free[e]];     /* 空格比要的多：多固定幾箱（挑最合直覺的）*/
            var diff = naiveDiff(r, c, given, sol, vals), cand = { r: r, c: c, mode: st.mode, vals: vals, sol: sol, given: given, diff: diff, empties: given.filter(function (v) { return !v; }).length };  /* filter：留下符合條件的元素，回傳新陣列 */
            if (!naiveWorks(r, c, given, sol, vals) && !shortBy && diff >= frac) return cand;
            if (!naiveWorks(r, c, given, sol, vals) && diff - shortBy * 10 > bestScore) { best = cand; bestScore = diff - shortBy * 10; }
            if (!best) best = cand;
        }
        return best;        /* 保底：試了 TRIES 次都達不到空格數與比例，就用空格數最接近、比例最好的那一題 */
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '倉庫主任！';
        if (n >= 12) return '夾擠推理很穩！';
        if (n >= 5) return '越來越有感覺了！';
        return '看一箱的左上方有幾箱：它至少要比那麼多箱都重！';
    }

    /* ═══ 畫面 ═══ */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            head: function (level) { return '第 ' + level + ' 關'; },
            info: function (S) { return '已解 ' + S.cleared + ' 關'; },
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['解開 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var pz = makePuzzle(level, api.rand), r = pz.r, c = pz.c, N = r * c, weak = isWeak(pz.mode), groups = groupsOf(pz.vals);
        api.info = pz;                                  /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[疊箱子] 第 ' + level + ' 關：' + r + '×' + c + '（' + pz.mode + '），固定 ' + pz.given.filter(Boolean).length + ' 箱；重量 ' + pz.vals.join(','));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */
        var W = stage.clientWidth || 472, H = stage.clientHeight || 667;
        var chips = chipLayout(pz.given.filter(function (v) { return !v; }).length, Math.floor(W * 0.96)), trayH = chips.rows * chips.size + (chips.rows - 1) * chips.gap;   /* 清單的版面：一開始有幾顆重量（＝空格數）就決定每顆多大，之後放出去就越來越少，但大小不變 */
        var cell = cellFor(W, H, r, c, trayH);          /* 架上每格邊長（同時考慮寬度與高度） */
        var g = pz.given.slice(), hinted = {}, pick = 0, hintsLeft = HINTS, solved = false, flagged = -1, dead = false;

        var wrap = h('div', { 'class': 'boxstack-wrap' });  /* wrap：整個遊戲畫面的外框容器；下面建好的各個區塊（盤面、按鈕…）都放進它，最後再整個放進舞台 */
        var shelfBox = h('div', { 'class': 'boxstack-shelfbox' });
        var shelf = h('div', { 'class': 'boxstack-shelf' });
        shelf.style.setProperty('--boxstack-c', c);     /* style.setProperty('--名稱', 值)：用 JS 設定 CSS 變數，CSS 裡用 var(--名稱) 取用（把算好的尺寸交給樣式） */
        shelf.style.setProperty('--boxstack-cell', cell + 'px');
        var cells = [];
        for (var k = 0; k < N; k++) {
            var cl = h('div', { 'class': 'boxstack-cell' });
            (function (kk) { kit.onTap(cl, function () { tapCell(kk); }); })(k);  /* 用立即執行函式存住這一次迴圈的變數（不這樣寫，每個元素點下去都會拿到迴圈結束時的值） */
            shelf.appendChild(cl); cells.push(cl);      /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        }
        shelfBox.appendChild(h('div', { 'class': 'boxstack-arrow boxstack-arrow--right', text: weak ? '越右邊越重（可一樣重）→' : '越右邊越重 →' }));
        var row = h('div', { 'class': 'boxstack-shelfrow' }, [shelf, h('div', { 'class': 'boxstack-arrow boxstack-arrow--down', text: weak ? '越下面越重 ↓' : '越下面越重 ↓' })]);
        shelfBox.appendChild(row);
        var tray = h('div', { 'class': 'boxstack-tray' });
        tray.style.setProperty('--boxstack-chip', chips.size + 'px');             /* 清單每顆邊長、間隔、整個清單的寬與高：交給 css 用 var() 取用 */
        tray.style.setProperty('--boxstack-gap', chips.gap + 'px');
        tray.style.setProperty('--boxstack-tray-w', chips.width + 'px');
        tray.style.setProperty('--boxstack-tray-h', trayH + 'px');
        var tipDefault = weak ? '先選下面，再放上去。同重箱子可並排' : '點下面的重量，再點空格放進去';
        var tip = h('div', { 'class': 'boxstack-tip', text: tipDefault });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */
        var tools = h('div', { 'class': 'boxstack-tools' });
        var btnHint = h('button', { 'class': 'btn btn--line boxstack-tool', type: 'button', text: '提示 ' + hintsLeft });  /* 「提示」按鈕（文字會顯示還剩幾次提示） */
        var btnReset = h('button', { 'class': 'btn btn--line boxstack-tool', type: 'button', text: '重來' });  /* 「重來」按鈕 */
        kit.onTap(btnHint, useHint);                    /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        kit.onTap(btnReset, reset);
        if (HINTS > 0 && kit.hintsAllowed(level)) tools.appendChild(btnHint);   /* 提示次數 HINTS 設成 0，或已經過了前 kit.HINT_LEVELS（4）關，就連提示按鈕都不放（V1.47） */
        tools.appendChild(btnReset);
        wrap.appendChild(shelfBox); wrap.appendChild(tip); wrap.appendChild(tray); wrap.appendChild(tools);
        stage.appendChild(wrap);                        /* 把整個遊戲區放進舞台（放進去，畫面上才看得到） */

        function placedCount() { var s = {}; g.forEach(function (v) { if (v) s[v] = (s[v] || 0) + 1; }); return s; }
        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint() {
            var bad = {}, vs = violations(r, c, g);
            vs.forEach(function (p) { bad[p[0]] = true; bad[p[1]] = true; });
            for (var k = 0; k < N; k++) {
                var cls = 'boxstack-cell';
                if (pz.given[k]) cls += ' boxstack-cell--given';
                else if (hinted[k]) cls += ' boxstack-cell--hinted';
                else if (g[k]) cls += ' boxstack-cell--placed';
                else cls += ' boxstack-cell--empty';
                if (bad[k]) cls += ' boxstack-cell--bad';
                if (k === flagged) cls += ' boxstack-cell--flag';
                if (solved) cls += ' boxstack-cell--ok';
                cells[k].className = cls;
                cells[k].textContent = g[k] ? String(g[k]) : '';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                var cfs = fitFs(String(g[k] || '').length, cell - 6, CELL_FS);     /* 數字字數多就縮小字級，不超出方格（V1.47）；放得下就不設定，沿用主題的 --fs-xl */
                if (g[k] && cfs < CELL_FS) cells[k].style.setProperty('--boxstack-fs', cfs + 'px'); else cells[k].style.removeProperty('--boxstack-fs');
            }
            tray.innerHTML = '';                        /* innerHTML = ''：把元素裡面的東西全部清掉 */
            var used = placedCount();
            groups.forEach(function (gr) {
                var left = gr.m - (used[gr.v] || 0), first = true;
                for (var t = 0; t < left; t++) {
                    var b = h('div', { 'class': 'boxstack-chip' + (gr.v === pick && first ? ' boxstack-chip--sel' : ''), text: String(gr.v) });
                    first = false;
                    var pfs = fitFs(String(gr.v).length, chips.size - 6, CHIP_FS);     /* 清單上的數字同樣依字數縮小（V1.47） */
                    if (pfs < CHIP_FS) b.style.setProperty('--boxstack-fs', pfs + 'px');
                    (function (vv) { kit.onTap(b, function () { if (!solved && !dead) { pick = pick === vv ? 0 : vv; paint(); } }); })(gr.v);
                    tray.appendChild(b);
                }
            });
            if (vs.length && !solved) tip.textContent = weak ? '紅色的兩箱違反規矩：上面的不能比下面重、左邊的不能比右邊重' : '紅色的兩箱違反規矩：上面的要比下面輕、左邊的要比右邊輕';
        }
        function tapCell(k) {
            if (solved || dead || pz.given[k] || hinted[k]) return;
            flagged = -1;
            if (pick) {                                  /* 放進去（原本有箱子就換回清單） */
                g[k] = pick; pick = 0;
            } else if (g[k]) {                            /* 沒選重量：把這箱拿回清單 */
                g[k] = 0;
            } else { tip.textContent = '先點下面的一個重量'; return; }
            tip.textContent = tipDefault;
            paint();
            if (g.every(Boolean) && !violations(r, c, g).length) win();
        }
        /* 提示：標出一個線索，並扣掉一次提示次數（次數上限在參數區的 HINTS） */
        function useHint() {
            if (solved || dead || hintsLeft <= 0) return;
            var wrong = -1, empty = -1, k;
            for (k = 0; k < N; k++) {
                if (pz.given[k] || hinted[k]) continue;
                if (g[k] && g[k] !== pz.sol[k] && wrong < 0) wrong = k;
                if (g[k] !== pz.sol[k] && empty < 0) empty = k;
            }
            if (wrong < 0 && empty < 0) return;
            hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
            if (wrong >= 0) { flagged = wrong; tip.textContent = '閃動的這一箱放錯了'; paint(); return; }
            /* 都沒放錯：替玩家放好一箱。這個重量的箱子都已經放出去了（清單裡沒有了）→ 先從放錯的格子拿一箱回來 */
            var v = pz.sol[empty], mult = 0, have = 0;
            groups.forEach(function (gr) { if (gr.v === v) mult = gr.m; });
            g.forEach(function (x) { if (x === v) have++; });
            if (have >= mult) for (k = 0; k < N; k++) if (g[k] === v && !pz.given[k] && pz.sol[k] !== v) { g[k] = 0; break; }
            g[empty] = v; hinted[empty] = true; pick = 0;
            tip.textContent = '黃色的這一箱是 ' + v + ' 公斤';
            paint();
            if (g.every(Boolean) && !violations(r, c, g).length) win();
        }
        /* 重來：把這一題恢復成剛開始的樣子 */
        function reset() { if (solved || dead) return; g = pz.given.slice(); Object.keys(hinted).forEach(function (k) { g[k] = pz.sol[k]; }); pick = 0; flagged = -1; paint(); }
        /* 時間到：把正確答案放上去（黃色），結算 */
        function timeUp() {
            if (solved || dead) return;
            dead = true; pick = 0; flagged = -1;
            for (var k = 0; k < N; k++) if (!pz.given[k] && g[k] !== pz.sol[k]) { g[k] = pz.sol[k]; hinted[k] = true; }
            paint();
            tip.textContent = '時間到了！黃色的是正確答案';
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: FAIL_HOLD_MS, lines: ['時間到了'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 過關：鎖住畫面、顯示成功效果，並呼叫 api.pass 進下一關（或結算） */
        function win() {
            api.stopTimer();
            solved = true; pick = 0; paint();
            tip.textContent = weak ? '每一箱都不比上面、左邊的輕！' : '每一箱都比上面、左邊的重！';
            kit.flash(stage, true, api.my);
            api.pass({ delay: PASS_DELAY_MS });         /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { g = pz.sol.slice(); paint(); win(); };
        api.wrong = function () {           /* 驗證用：放一箱違反規矩的 */
            for (var k = 0; k < N; k++) if (!pz.given[k]) { g[k] = pz.vals[N - 1] + 1; break; }
            paint();
        };
        api.state = function () { return { g: g.slice(), pick: pick, solved: solved, hintsLeft: hintsLeft, dead: dead }; };
        api.timeout = timeUp;
        api.timer(Math.round(timeFor(level, pz.given.filter(function (v) { return !v; }).length) * 1000), timeUp);  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        paint();
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '疊箱子',
        rule: '倉庫的架子每格放一箱，規矩是**越下面越重、越右邊越重**：每一箱都要比它上面那箱重、也比它左邊那箱重（後面的關卡**一樣重也可以**）。**深色的箱子已經貼好重量、固定在那裡**（左上角一定最輕、右下角一定最重，已經先放好了），其他的重量在下面的清單上。**重量不一定是 1、2、3…，有的關卡中間會跳號、甚至有一樣重的箱子**，先想想每一箱的「第幾輕」。點清單上的重量、再點空格放進去；點自己放的箱子可以拿回來。答案只有一種，照大小隨便排是排不對的。只有前 4 關有「提示」按鈕。每一關有時間限制（上面的時間條，空格越多給的時間越長），時間到了也算失敗；全部放對就過關，成績是解開幾題。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            chipLayout: chipLayout, fitFs: fitFs, cellFor: cellFor, TRAY_ROWS: TRAY_ROWS, CHIP_MAX: CHIP_MAX, CHIP_MIN: CHIP_MIN, CELL_FS: CELL_FS, CHIP_FS: CHIP_FS, CELL_MAX: CELL_MAX,
            stageOf: stageOf, emptyFor: emptyFor, EMPTY: EMPTY, timeFor: timeFor, TIME_BASE: TIME_BASE, TIME_CELL: TIME_CELL, isWeak: isWeak, makeValues: makeValues, groupsOf: groupsOf, randomStack: randomStack, countFill: countFill, countFillV: countFillV,
            naiveFill: naiveFill, naiveWorks: naiveWorks, naiveDiff: naiveDiff, surprise: surprise, violations: violations,
            makePuzzle: makePuzzle, rating: rating, STAGES: STAGES, MODES: MODES, DIFF_FRAC: DIFF_FRAC, HINTS: HINTS, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
