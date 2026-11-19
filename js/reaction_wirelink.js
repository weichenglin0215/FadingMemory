/* ═══════════════════════════════════════════════════════════════════
   reaction_wirelink.js — 秒反應・接電線（企劃 222）
   樣式：css/games/reaction_wirelink.css（這款專屬的 class 一律以「wirelink-」開頭；共用元件在 css/reaction_common.css）
   方格板上散著幾對同色的插頭（紅對紅、藍對藍…）。手指從一個插頭拖到同色的另一個，拖過的格子變成那條電線；
   **電線不能交叉，最後每一格都要被電線佔滿**才過關。畫錯了可以從插頭重拖（或從電線中間重拖，那一格之後的電線會收回去）。
   接通的那一對插頭會亮起小燈泡，全部接好、板子填滿時整塊板子的燈一起亮。
   ───────────────────────────────────────────────────────────────────
   · 這是手機上流行的「Flow」玩法。難度：棋盤寬高（SIZE_W、SIZE_H，可以是長方形）、顏色數（COLORS）、限時（TIME_S）都是 [第 1 關, 到頂] 線性變化（數字見參數區）；
     顏色的出現順序是「紅、藍、綠、黃、紫、水藍、橘、粉紅、棕、灰」：第 6 種起水藍跟藍很接近、第 7 種起橘跟黃很接近、第 9 種起棕跟橘很接近（誘餌：看錯顏色就接錯）。
   · 出題（V1.57.3.2，跟一筆填滿／多色填滿同一套想法）：**站在人類的立場，看畫線時每一格要做什麼判斷**。
     接電線一開局就看得到所有插頭（起點、終點都知道），電線要佈滿整個方格板；難的是路上的 T 字／十字路口——線頭前面有 2 個以上方向，
     錯的方向一眼看不出來（「身後」的空格變成死巷常常沒注意到），要走很多步才卡住。human() 沿著答案走一遍，數路口、要猜的路口、深陷阱、人類試錯量。
     用舊的出題法量過：6×6 以下幾乎每一步都沒得選；7×7 以上多半有 2 種以上的解（看起來要猜，其實怎麼走都對）。
     所以改成離線搜尋的題庫（js/wirelink_bank.js，test/reaction/gen_wirelink_bank.cjs 產生）：**每一題都剛好只有 1 種解**，而且路口多、要猜的多、陷阱深；
     每一關依參數區的 [第 1 關, 到頂] 難度參數（HUMAN_EFFORT、FORK_MIN、GUESS_MIN…，以及下面的干擾要求）挑最符合的一題，再隨機翻轉旋轉、隨機配顏色（fromBank）。
     題庫沒有這種大小的棋盤（例如 SIZE_W 調到 10 以上）時，才用下面的舊方法臨時出題（makeFresh）。
   · 舊的臨時出題法（makeFresh）：**要讓不同顏色的線互相干擾**（V1.57.3.0 玩家意見：以前太容易，幾乎沒有難度）。
     以前是把「走遍整個棋盤的一條路」直接切成幾段，每一段就是一種顏色——同色的兩個插頭就是一小段路的頭和尾，離得很近、彼此不干擾，一眼就看得出怎麼連。
     現在還是用同樣的方式保證有解（電線全部不交叉、剛好填滿整塊板子），但：
       1. 走遍棋盤的路用 backbite 反覆打亂（randomHam），變成很彎曲、看不出規律的路；
       2. 切成 k 段時，用區域搜尋（pickCuts）挑「讓兩個插頭的連線盡量互相穿越」的切法——大部分顏色，兩個插頭之間的最短連線會穿過別種顏色的連線
          （CROSS_MIN：第 1 關 50% → 到頂 88%）、插頭不能靠太近（DIST_MIN）、電線要繞路（DETOUR_MIN）、「最短路線就是答案」的電線不能太多（EASY_MAX），
          所以玩家很難看出每條電線該怎麼走，直接連最短的一定會擋到別人；
       3. 最多試做 TRIES 題，用解題器（countSolutions）數每一題有幾種解，挑達到要求而且解最少的一題（解越少越難，唯一解就直接用）。
          大棋盤很難剛好是唯一解，所以不強求；過關只看規則有沒有達成，不比對出題時的那一組解。
   · 判定：不拿「出題時的那組解」比對，只看「規則有沒有達成」——每一格都有電線、每一種顏色的兩個插頭都接通。
     所以只要接法合規，不管跟出題時的解一不一樣都算過關（玩家不會在「其實也對」的接法上被判錯）。
   · 電線的規則（applyDrag）：從插頭（或同色電線上的任何一格）按下；只能往相鄰的空格拖；拖回上一格＝把電線收回一格；
     碰到別的顏色的電線／插頭、或自己的電線（不是上一格）就擋住，不能穿過；拖到同色的另一個插頭就接通。
   · 時間到：把正確的接法一條一條畫出來，沒接通的電線閃紅，停格 3 秒。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'wirelink'：選單、成績、存檔都靠它；樣式在 css/games/reaction_wirelink.css，裡面的 class 名稱一律以 wirelink- 開頭。 */
    'use strict';

    var ID = 'wirelink';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TIME_S = [45, 120];                     /* 每關限時（秒）：第 1 關 → 到頂（題目比以前難很多，時間也跟著放寬） */
    var MIN_SEG = 3;                            /* 每一條電線（一段路）至少幾格 */
    /* ═══ 調整以下參數之後必須重新產生題庫 ═══
       這一區的參數決定「每一關要從題庫挑什麼樣的題目」；題庫是離線產生的靜態檔，調了之後要重新產生題庫、題庫裡才會有夠多符合的題目（否則遊戲只能挑「違反最少」的那一題）。
       重新產生：node test/reaction/gen_wirelink_bank.cjs run／build（棋盤大小改了，還要改 gen_wirelink_bank.cjs 的 TIERS 表，題庫才有新的大小）*/
    var SIZE_W = [5, 9];                        /* 棋盤寬（格）：第 1 關 → 到頂 */
    var SIZE_H = [5, 11];                       /* 棋盤高（格）：第 1 關 → 到頂（手機是直的，高可以比寬多；V1.57.3.2 起棋盤可以是長方形） */
    var COLORS = [4, 10];                      /* 顏色（電線）種數：第 1 關 → 到頂；最多 10 種（PALETTE 的長度） */
    /* ── 難度參數（V1.57.3.2：站在人類的立場，每一格要做什麼判斷）──
       題目從離線搜尋的題庫挑（js/wirelink_bank.js，每一題都剛好只有 1 種解），每一關依下面的參數挑最符合的一題；題庫沒有完全符合的，就挑違反最少的。
       每個數字都是 [第 1 關, 到頂]，線性變化（HUMAN_EFFORT 是倍數式）。各級題庫實際的範圍：node test/reaction/gen_wirelink_bank.cjs stats */
    var HUMAN_EFFORT = [30, 5000];              /* 人類試錯量：模擬一個人畫線，每一步算 1，加上「在路口選錯方向、要試多少步才發現錯」（越大越難） */
    var FORK_MIN = [3, 24];                     /* 路口至少幾個：線頭前面有 2 個以上方向可以走（T 字、十字，或兩個線頭碰在一起可以「現在就接上」）的次數，包括走過的線把旁邊變成 T 字的情況 */
    var GUESS_MIN = [1, 10];                    /* 「要猜」的路口至少幾個：連細心的人（全盤檢查死巷、檢查每種顏色還連不連得起來）都還有 2 個以上方向 */
    var FORK3_MIN = [0, 3];                     /* 三岔路口至少幾個：一眼看不出錯的方向有 3 個以上 */
    var DEEP_TRAP_MIN = [1, 8];                 /* 深陷阱至少幾個：錯的方向要走 3 步以上才會卡住（知道錯了，但不知道從哪裡改） */
    var TRAP_MAX = [12, 45];                    /* 最深的陷阱最多幾步：錯的方向最遠能走幾步才卡住（太深會變成「快畫完了才發現要全部重來」） */
    /* ── 出題的「互相干擾」要求（V1.57.3.0 玩家意見：太容易，要讓不同顏色的線互相干擾，大部分兩端點之間的最短連線會穿過別對的最短連線）──
       每個數字都是 [第 1 關, 到頂]，線性變化；V1.57.3.2 起也是題庫挑題的條件 */
    var CROSS_MIN = [0.66, 0.99];                /* 至少這麼多比例的顏色，「兩個插頭的連線」會穿過別種顏色的連線（互相干擾）*/
    var DETOUR_MIN = [1.66, 2.5];                /* 電線的「繞路程度」平均至少是多少（電線實際走幾步 ÷ 兩個插頭的最短距離）：越大，越不是直接連就對 */
    var DIST_MIN = [5, 9];                      /* 每一對插頭至少相距幾格（上下左右步數，四捨五入）：不要有近到一眼就看出怎麼連的 */
    var EASY_MAX = [0.33, 0.1];                 /* 「最短路線就是答案」的電線最多佔幾成（到頂＝最多 10%，幾乎每一條都得繞路） */
    /* ═══ 題庫相關參數到這裡為止（以下的參數調整後不用重新產生題庫）═══ */
    /* ── 臨時出題（題庫沒有這種大小的棋盤時才用，例如 SIZE 調到 10 以上）── */
    var TRIES = 14;                             /* 每一關最多試做幾題（挑最難的那一題） */
    var MIN_TRIES = 4;                          /* 至少試做幾題（就算很花時間也要做完這幾題） */
    var TIME_GUARD_MS = 90;                     /* 出題超過這麼多毫秒（手機比電腦慢）、而且已經試過 MIN_TRIES 題，就不再試了 */
    var SOL_LIMIT = 4;                          /* 數「這題有幾種解」最多數到幾個（解越少越難；數到這麼多就當作「很多」） */
    var SOL_NODES = 3500;                       /* 數解的搜尋量上限（超過就當作「很多解」，避免大棋盤算太久） */
    var SOL_GOOD = 1;                           /* 這題的解數 ≤ 這個數字而且達到干擾要求，就直接用，不用再試了（1＝唯一解）*/
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    /* 顏色的名稱與出現順序（CSS 變數 --wlk-0～--wlk-9 在 css/theme.css；水藍(5)像藍(1)、橘(6)像黃(3)、棕(8)像橘(6)） */
    /* 電線顏色的名稱與編號（編號 0～9）；每種顏色在 CSS 對應 --wlk-編號 變數。水藍(5) 故意做得像藍(1)、橘(6) 像黃(3)、棕(8) 像橘(6)，增加辨認難度 */
    var PALETTE = ['紅', '藍', '綠', '黃', '紫', '水藍', '橘', '粉紅', '棕', '灰'];
    /* 棋盤大小：可以是一個數字（正方形 n×n），或 { w 寬, h 高 }（V1.57.3.2 起棋盤可以是長方形）。格子編號＝列 × 寬 ＋ 欄 */
    function dims(n) { return typeof n === 'number' ? { w: n, h: n } : n; }
    /* 格子 i 的上下左右鄰格（超出棋盤的略過；順序：上、右、下、左） */
    function neighbors(n, i) { var D = dims(n), w = D.w, r = Math.floor(i / w), c = i % w, o = []; if (r > 0) o.push(i - w); if (c < w - 1) o.push(i + 1); if (r < D.h - 1) o.push(i + w); if (c > 0) o.push(i - 1); return o; }
    /* 兩格是不是上下左右相鄰 */
    function adjacent(n, a, b) { var w = dims(n).w; return Math.abs(Math.floor(a / w) - Math.floor(b / w)) + Math.abs(a % w - b % w) === 1; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關棋盤的大小 { w 寬, h 高 }（格） */
    function sizeFor(level) { return { w: Math.round(kit.ramp(level, SIZE_W[0], SIZE_W[1], RAMP_LEVELS)), h: Math.round(kit.ramp(level, SIZE_H[0], SIZE_H[1], RAMP_LEVELS)) }; }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 這一關有幾種顏色（幾條電線）：依關卡線性增加，但每種顏色至少要 MIN_SEG 格、所以最多（寬×高）÷MIN_SEG 種，也不能超過調色盤 */
    function colorsFor(level) { var D = sizeFor(level); return Math.max(1, Math.min(PALETTE.length, Math.floor(D.w * D.h / MIN_SEG), Math.round(kit.ramp(level, COLORS[0], COLORS[1], RAMP_LEVELS)))); }  /* Math.floor：無條件捨去成整數 */
    /* 這一關的限時（毫秒） */
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    /* 這一關對「互相干擾」的要求：{ cross 互相穿越的比例, detour 繞路程度, dist 插頭最少相距, easy 最短路線就是答案的電線最多佔幾成 } */
    function wantFor(level) {
        var r = function (a) { return kit.ramp(level, a[0], a[1], RAMP_LEVELS); }, i = function (a) { return Math.round(r(a)); };
        var w = { cross: r(CROSS_MIN), detour: r(DETOUR_MIN), dist: i(DIST_MIN), easy: r(EASY_MAX) };
        /* 題庫挑題用的（V1.57.3.2）：w／h 棋盤寬高、k 顏色數、e 人類試錯量（倍數式變化）、min 至少、max 最多 */
        var D = sizeFor(level); w.w = D.w; w.h = D.h; w.k = colorsFor(level); w.e = Math.exp(r([Math.log(HUMAN_EFFORT[0]), Math.log(HUMAN_EFFORT[1])]));
        w.min = { raw: i(FORK_MIN), guess: i(GUESS_MIN), d3: i(FORK3_MIN), deep: i(DEEP_TRAP_MIN), cf: w.cross, dt: w.detour, md: w.dist };
        w.max = { trap: i(TRAP_MAX), ez: w.easy };
        return w;
    }
    /* 把 total 格分成 k 段，每段至少 min 格，多出來的格子隨機分給各段（做法：先每段發 min 格，剩下的一格一格隨機丟給某一段）；回傳每段的長度 */
    function splitLengths(total, k, min, rand) {
        var lens = [], extra = total - k * min, i;
        for (i = 0; i < k; i++) lens.push(min);
        for (i = 0; i < extra; i++) lens[Math.floor(rand() * k)]++;
        return lens;
    }
    /* 現在的時間（毫秒）：有高精度時鐘就用它 */
    function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

    /* ── 一、隨機的「走遍整個棋盤的一條路」（漢米爾頓路徑）──
       從「一排往右、一排往左」的蛇形開始，反覆做「backbite」：挑路的一端、挑它旁邊的一格（路上的另一格），把兩者之間那一段反過來接——
       路還是走遍每一格剛好一次，但形狀一次次被打亂，最後是很彎曲、看不出規律的路。 */
    function randomHam(n, rand, moves) {
        var D = dims(n), W = D.w, H = D.h, N = W * H, P = [], pos = new Int32Array(N), r, c, i, t;
        for (r = 0; r < H; r++) for (c = 0; c < W; c++) P.push(r * W + (r % 2 ? W - 1 - c : c));
        for (i = 0; i < N; i++) pos[P[i]] = i;
        moves = moves || N * 12;
        for (var m = 0; m < moves; m++) {
            if (rand() < 0.5) {                         /* 路的起點那一端：起點旁邊的一格是路上的第 j 格 → 把前 j 格倒過來，新的起點就是原本的第 j−1 格 */
                var nb = neighbors(D, P[0]), j = pos[nb[Math.floor(rand() * nb.length)]];
                if (j <= 1) continue;
                var head = P.slice(0, j).reverse();
                for (t = 0; t < j; t++) { P[t] = head[t]; pos[head[t]] = t; }
            } else {                                    /* 路的終點那一端：同樣的事反過來做 */
                var nb2 = neighbors(D, P[N - 1]), j2 = pos[nb2[Math.floor(rand() * nb2.length)]];
                if (j2 >= N - 2) continue;
                var tail = P.slice(j2 + 1).reverse();
                for (t = 0; t < tail.length; t++) { P[j2 + 1 + t] = tail[t]; pos[tail[t]] = j2 + 1 + t; }
            }
        }
        return P;
    }
    /* 兩個格子之間的「最短距離」（上下左右走幾步） */
    function manhattan(n, a, b) { var w = dims(n).w; return Math.abs(Math.floor(a / w) - Math.floor(b / w)) + Math.abs(a % w - b % w); }
    /* 兩條連線（格子中心連一條直線：a 到 b、c 到 d）有沒有「真的互相穿越」（只是端點碰到不算） */
    function segCross(n, a, b, c, d) {
        var w = dims(n).w, ax = a % w, ay = Math.floor(a / w), bx = b % w, by = Math.floor(b / w), cx = c % w, cy = Math.floor(c / w), dx = d % w, dy = Math.floor(d / w);
        function side(px, py, qx, qy, rx, ry) { var v = (qx - px) * (ry - py) - (qy - py) * (rx - px); return v > 0 ? 1 : (v < 0 ? -1 : 0); }  /* 點 r 在線 p→q 的哪一邊（左／右／正好在線上） */
        return side(ax, ay, bx, by, cx, cy) * side(ax, ay, bx, by, dx, dy) < 0 && side(cx, cy, dx, dy, ax, ay) * side(cx, cy, dx, dy, bx, by) < 0;
    }
    /* ── 二、把路切成電線，並量「互相干擾」──
       starts[i] ＝ 第 i 段電線從路上的第幾格開始（starts[0] 一定是 0）；一段電線的兩個插頭就是這一段的頭和尾。
       量出來的指標（metrics）：
         pairs 每條電線的兩個插頭、lens 每條電線的格數、
         crossFrac：有幾成的電線，「兩個插頭的連線」會穿過別種顏色的連線（互相干擾）、crossAvg：平均每條穿過幾條別的連線、
         detour：繞路程度（電線實際走幾步 ÷ 兩個插頭的最短距離，平均）、easy：「最短路線就是答案」的電線佔幾成、
         minDist／meanDist：每一對插頭相距的最小／平均距離（上下左右走幾步） */
    function metrics(n, P, starts) {
        var N = P.length, k = starts.length, pairs = [], lens = [], i, j;
        for (i = 0; i < k; i++) { var s = starts[i], e = i + 1 < k ? starts[i + 1] - 1 : N - 1; pairs.push([P[s], P[e]]); lens.push(e - s + 1); }
        var cross = [], total = 0;
        for (i = 0; i < k; i++) cross.push(0);
        for (i = 0; i < k; i++) for (j = i + 1; j < k; j++) if (segCross(n, pairs[i][0], pairs[i][1], pairs[j][0], pairs[j][1])) { cross[i]++; cross[j]++; total++; }
        var withCross = 0, det = 0, easy = 0, minD = 1e9, sumD = 0;
        for (i = 0; i < k; i++) {
            var md = manhattan(n, pairs[i][0], pairs[i][1]);
            if (cross[i] > 0) withCross++;
            det += (lens[i] - 1) / Math.max(1, md); if (lens[i] - 1 === md) easy++;
            if (md < minD) minD = md; sumD += md;
        }
        return { pairs: pairs, lens: lens, cross: cross, crossFrac: withCross / k, crossAvg: 2 * total / k, detour: det / k, easy: easy / k, minDist: minD, meanDist: sumD / k };
    }
    /* 這一組切法有多難（分數越高越難）：互相穿越的比例最重要，其次是穿越的次數、繞路、插頭離得遠；
       離「這一關的要求」還差多少，會扣分（所以搜尋會往達到要求的方向走） */
    function hardness(m, n, want) {
        var s = m.crossFrac * 10 + Math.min(m.crossAvg, 3) * 2 + Math.min(m.detour, 4) * 0.8 + Math.min(m.minDist, 4) * 0.8 + m.meanDist / ((dims(n).w + dims(n).h) / 2) * 3 - m.easy * 4;
        if (want) s -= Math.max(0, want.dist - m.minDist) * 6 + Math.max(0, want.cross - m.crossFrac) * 10 + Math.max(0, want.detour - m.detour) * 4 + Math.max(0, m.easy - want.easy) * 6;
        return s;
    }
    /* 在路 P 上挑 k−1 個切點（每段至少 minSeg 格）：先隨機切，再一次移動一個切點 1～3 格，分數沒變差就接受（區域搜尋；重新開始 6 次，留最好的）。
       回傳每一段的起點位置 starts。 */
    function pickCuts(n, P, k, minSeg, want, rand, iters) {
        var N = P.length, best = null, bestS = -1e9, rs, i, e;
        for (rs = 0; rs < 6; rs++) {
            var lens = [];
            for (i = 0; i < k; i++) lens.push(minSeg);
            for (e = N - k * minSeg; e > 0; e--) lens[Math.floor(rand() * k)]++;
            var starts = [], p = 0;
            for (i = 0; i < k; i++) { starts.push(p); p += lens[i]; }
            var cur = hardness(metrics(n, P, starts), n, want);
            for (var it = 0; it < iters; it++) {
                var c = 1 + Math.floor(rand() * (k - 1)), d = (rand() < 0.5 ? -1 : 1) * (1 + Math.floor(rand() * 3)), nv = starts[c] + d;
                if (nv - starts[c - 1] < minSeg || (c + 1 < k ? starts[c + 1] : N) - nv < minSeg) continue;
                var old = starts[c]; starts[c] = nv;
                var sc = hardness(metrics(n, P, starts), n, want);
                if (sc >= cur) cur = sc; else starts[c] = old;
            }
            if (cur > bestS) { bestS = cur; best = starts.slice(); }
        }
        return best;
    }

    /* ── 三、數「這一題有幾種解」（解越少越難；只用在挑題目，過關還是只看規則）──
       做法：一條一條把電線往前鋪（每次挑「頭能走的格子最少」的那一條），搜尋時不斷檢查：
         · 每個空格至少要有 2 個能接的鄰格（空格或還在鋪的線頭），不然這格一定填不滿；
         · 每一種還沒接通的顏色，線頭要能經由空格走到另一個插頭；
         · 每一塊相連的空地，至少要有一個線頭碰得到，不然沒人能把它填滿。
       回傳 { count（解的個數，最多數到 limit）, aborted（搜尋量超過 budget 就中止，當作「解很多」）, nodes }。 */
    function countSolutions(n, plugs, limit, budget) {
        var D = dims(n), N = D.w * D.h, k = plugs.length, owner = new Int8Array(N), head = new Int32Array(k), tgt = new Int32Array(k), done = new Uint8Array(k), nb = [], i, c;
        for (i = 0; i < N; i++) { owner[i] = -1; nb.push(neighbors(D, i)); }
        for (c = 0; c < k; c++) { owner[plugs[c][0]] = c; owner[plugs[c][1]] = c; head[c] = plugs[c][0]; tgt[c] = plugs[c][1]; }
        var comp = new Int32Array(N), stack = new Int32Array(N), seen = new Int32Array(N), stamp = 0, touched = new Uint8Array(N), count = 0, nodes = 0, aborted = false, left = N - 2 * k;
        /* 這一格（空格）有幾個「能接的」鄰格：空格，或還在鋪的線頭／還沒被接上的目標插頭 */
        function degree(cell) {
            var d = 0, a = nb[cell];
            for (var q = 0; q < a.length; q++) { var x = a[q], o = owner[x]; if (o < 0 || (!done[o] && (x === head[o] || x === tgt[o]))) d++; }
            return d;
        }
        function feasible() {
            var q, x, u, v;
            for (var cell = 0; cell < N; cell++) if (owner[cell] < 0 && degree(cell) < 2) return false;
            var nc = 0;
            /* 把空地分成相連的幾塊（comp[格子] ＝ 第幾塊；用 stamp 避免每次重設整個陣列） */
            stamp += 2;
            var base = stamp;
            for (var s2 = 0; s2 < N; s2++) {
                if (owner[s2] >= 0 || seen[s2] >= base) continue;
                var sp = 0; stack[sp++] = s2; seen[s2] = base; comp[s2] = nc;
                while (sp) { u = stack[--sp]; var au = nb[u]; for (q = 0; q < au.length; q++) { v = au[q]; if (owner[v] < 0 && seen[v] < base) { seen[v] = base; comp[v] = nc; stack[sp++] = v; } } }
                nc++;
            }
            for (var z = 0; z < nc; z++) touched[z] = 0;
            for (var col = 0; col < k; col++) {
                if (done[col]) continue;
                var h = head[col], t = tgt[col], adjT = false, ok = false, ah = nb[h], at = nb[t], hm = [];
                for (q = 0; q < ah.length; q++) { x = ah[q]; if (x === t) adjT = true; else if (owner[x] < 0) { touched[comp[x]] = 1; hm.push(comp[x]); } }
                for (q = 0; q < at.length; q++) { x = at[q]; if (owner[x] < 0) { touched[comp[x]] = 1; if (!ok && hm.indexOf(comp[x]) >= 0) ok = true; } }
                if (!adjT && !ok) return false;
            }
            for (var z2 = 0; z2 < nc; z2++) if (!touched[z2]) return false;
            return true;
        }
        function rec() {
            if (aborted) return;
            if (++nodes > budget) { aborted = true; return; }
            var col, all = true;
            for (col = 0; col < k; col++) if (!done[col]) { all = false; break; }
            if (all) { if (left === 0) count++; return; }
            if (!feasible()) return;
            var bestC = -1, bestMoves = null;
            for (col = 0; col < k; col++) {
                if (done[col]) continue;
                var mv = [], a = nb[head[col]];
                for (var q = 0; q < a.length; q++) { var x = a[q]; if (owner[x] < 0 || x === tgt[col]) mv.push(x); }
                if (bestMoves === null || mv.length < bestMoves.length) { bestMoves = mv; bestC = col; if (mv.length <= 1) break; }
            }
            for (var m = 0; m < bestMoves.length && !aborted && count < limit; m++) {
                var x2 = bestMoves[m], oldHead = head[bestC];
                if (x2 === tgt[bestC]) { done[bestC] = 1; rec(); done[bestC] = 0; }
                else { owner[x2] = bestC; head[bestC] = x2; left--; rec(); left++; owner[x2] = -1; head[bestC] = oldHead; }
            }
        }
        rec();
        return { count: count, aborted: aborted, nodes: nodes };
    }

    /* ── 三之一、解題器（V1.57.3.2）：可以從「已經畫了一部分」的狀態接著搜 ──
       跟 countSolutions 一樣「一條一條往前鋪」，但每種顏色可以從兩個插頭各畫一段：paths[顏色] ＝ [從插頭 a 畫出的格子, 從插頭 b 畫出的格子]（各自從插頭開始），
       搜尋時只從 a 那一段往前鋪，b 那一段的最前端當作目標。done[顏色]＝這條已經接通。
       剪枝 level：1＝每個空格至少要有 2 個能接的鄰格（空格或還在畫的線頭）——少於 2 格就變成死巷，電線進得去出不來；
                   2＝再加「每種還沒接通的顏色，兩個線頭要能經由空格連起來」；
                   3＝再加「每一塊相連的空地，都要有某一種顏色的兩個線頭都碰得到它」（電線一進去就得從另一頭出來，所以兩頭都要碰得到）。
       回傳 { count 解的個數（數到 limit）, nodes 節點數, aborted 超過 budget, depth 最深走了幾步, first 第一個解（每種顏色一條，從 a 到 b）}；
       opts.check＝true 只回傳 { ok }：現在這個狀態看不看得出錯（不搜尋）。 */
    function flowSolve(n, plugs, opts) {
        opts = opts || {};
        var D = dims(n), N = D.w * D.h, k = plugs.length, owner = new Int8Array(N), fa = [], fb = [], done = new Uint8Array(k), nb = [], i, c;
        var limit = opts.limit || 1, budget = opts.budget || 1000000, level = opts.level === undefined ? 3 : opts.level;
        var count = 0, nodes = 0, aborted = false, first = null, dep = 0, maxDep = 0, left = N, sols = [];   /* sols：opts.keep＝想留幾個解（出題器用來找「另一種解」跟答案差在哪裡） */
        for (i = 0; i < N; i++) { owner[i] = -1; nb.push(neighbors(D, i)); }
        for (c = 0; c < k; c++) {
            var pa = opts.paths ? opts.paths[c][0].slice() : [plugs[c][0]], pb = opts.paths ? opts.paths[c][1].slice() : [plugs[c][1]];
            fa.push(pa); fb.push(pb);
            for (i = 0; i < pa.length; i++) { owner[pa[i]] = c; left--; }
            for (i = 0; i < pb.length; i++) { owner[pb[i]] = c; left--; }
            if (opts.done && opts.done[c]) done[c] = 1;
        }
        var comp = new Int32Array(N), stack = new Int32Array(N), seen = new Int32Array(N), stamp = 0, claimed = new Uint8Array(N);
        function hA(col) { return fa[col][fa[col].length - 1]; }
        function hB(col) { return fb[col][fb[col].length - 1]; }
        /* 空格 x 有幾個能接的鄰格：空格，或還沒接通的顏色的線頭 */
        function degree(x) {
            var d = 0, a = nb[x];
            for (var q = 0; q < a.length; q++) { var y = a[q], o = owner[y]; if (o < 0 || (!done[o] && (y === hA(o) || y === hB(o)))) d++; }
            return d;
        }
        function feasible() {
            var cell, q, u, v, col;
            for (cell = 0; cell < N; cell++) if (owner[cell] < 0 && degree(cell) < (level >= 1 ? 2 : 1)) return false;
            var anyOpen = false;
            for (col = 0; col < k; col++) if (!done[col]) anyOpen = true;
            if (!anyOpen) return left === 0;
            if (level < 2) return true;
            stamp++; var nc = 0;
            for (cell = 0; cell < N; cell++) {
                if (owner[cell] >= 0 || seen[cell] === stamp) continue;
                var sp = 0; stack[sp++] = cell; seen[cell] = stamp; comp[cell] = nc;
                while (sp) { u = stack[--sp]; var au = nb[u]; for (q = 0; q < au.length; q++) { v = au[q]; if (owner[v] < 0 && seen[v] !== stamp) { seen[v] = stamp; comp[v] = nc; stack[sp++] = v; } } }
                nc++;
            }
            for (q = 0; q < nc; q++) claimed[q] = 0;
            for (col = 0; col < k; col++) {
                if (done[col]) continue;
                var a1 = nb[hA(col)], b1 = nb[hB(col)], adjAB = false, ca = [], ok = false;
                for (q = 0; q < a1.length; q++) { if (a1[q] === hB(col)) adjAB = true; else if (owner[a1[q]] < 0) ca.push(comp[a1[q]]); }
                for (q = 0; q < b1.length; q++) if (owner[b1[q]] < 0 && ca.indexOf(comp[b1[q]]) >= 0) { ok = true; claimed[comp[b1[q]]] = 1; }
                if (!adjAB && !ok) return false;
            }
            if (level >= 3) for (q = 0; q < nc; q++) if (!claimed[q]) return false;
            return true;
        }
        if (opts.check) return { ok: feasible() };
        function rec() {
            if (aborted) return;
            if (++nodes > budget) { aborted = true; return; }
            if (dep > maxDep) maxDep = dep;
            var col, bestC = -1, bestM = null;
            for (col = 0; col < k; col++) if (!done[col]) break;
            if (col === k) {
                if (left === 0) {
                    count++;
                    if (!first || (opts.keep && sols.length < opts.keep)) { var one = fa.map(function (p, j) { return p.concat(fb[j].slice().reverse()); }); if (!first) first = one; if (opts.keep && sols.length < opts.keep) sols.push(one); }
                }
                return;
            }
            if (!feasible()) return;
            /* 每種顏色的兩頭都可以接著畫：挑「能走的格子最少」的那一頭（V1.57.3.2：大棋盤快很多） */
            var bestS = 0;
            for (col = 0; col < k && !(bestM && bestM.length <= 1); col++) {
                if (done[col]) continue;
                for (var sd = 0; sd < 2; sd++) {
                    var mv = [], a = nb[sd ? hB(col) : hA(col)], other = sd ? hA(col) : hB(col);
                    for (var q = 0; q < a.length; q++) { if (owner[a[q]] < 0) mv.push(a[q]); else if (a[q] === other) mv.push(-1); }   /* −1＝接上另一頭 */
                    if (bestM === null || mv.length < bestM.length) { bestM = mv; bestC = col; bestS = sd; if (mv.length <= 1) break; }
                }
            }
            var arm = bestS ? fb[bestC] : fa[bestC];
            for (var m = 0; m < bestM.length && !aborted && count < limit; m++) {
                var x = bestM[m];
                if (x < 0) { done[bestC] = 1; rec(); done[bestC] = 0; }
                else { owner[x] = bestC; arm.push(x); left--; dep++; rec(); dep--; left++; arm.pop(); owner[x] = -1; }
            }
        }
        rec();
        return { count: count, nodes: nodes, aborted: aborted, depth: maxDep, first: first, sols: sols };
    }

    /* ── 三之二、站在人類的立場走一遍（V1.57.3.2，跟一筆填滿／多色填滿同一套想法，見 js/fillpath_core.js 的 FP.human）──
       接電線跟那兩款不同：一開局就看得到所有的起點與終點（每種顏色的兩個插頭），而且電線要佈滿整個方格板。
       所以這裡沒有「找終點」這一步；難的是：站在線頭上，前面有幾個方向可以走？哪些錯的方向一眼看不出來？
         · 人可以從任何一個插頭開始畫（每種顏色有兩個線頭），而且會先畫「沒得選」的那條（看不出錯的方向最少的線頭）；
         · 一眼看得出錯：剛走過的地方有空格被完全圍死；或新線頭的正前方有空格只剩 1 個能接的鄰格（電線進得去出不來）；
           但「身後」的空格變成死巷，人常常沒注意到（不算一眼看得出）；
         · 細心想得出錯：全盤的空格都要有 2 個以上能接的鄰格，而且每種沒接通的顏色，兩個線頭還連得起來（flowSolve level 2）；
         · 兩個線頭碰在一起時，「現在就接上」也是一個方向（接太早，中間的格子就沒人填了）。
       回傳 { raw 路口數, rawBits, dec 一眼看不出錯的方向 ≥ 2 的次數, d3 ≥ 3 的次數, bits, guess 連細心的人都要猜的次數,
              deep 深陷阱數（錯的方向要走 3 步以上才卡住）, trap 最深陷阱, hx 人類試錯量（每一步 1 ＋ 每個錯方向一半的機會先試到 × 試多少步才發現錯）}；
       opts.detail＝true 時多回傳 steps（每個路口的情況）。 */
    function human(n, plugs, sol, opts) {
        opts = opts || {};
        var D = dims(n), N = D.w * D.h, k = plugs.length, budget = opts.budget || 20000, owner = new Int8Array(N), fa = [], fb = [], done = [], ia = [], ib = [], left = N, c, i;
        for (i = 0; i < N; i++) owner[i] = -1;
        for (c = 0; c < k; c++) { var S = sol[c]; fa.push([S[0]]); fb.push([S[S.length - 1]]); owner[S[0]] = c; owner[S[S.length - 1]] = c; done.push(0); ia.push(0); ib.push(S.length - 1); left -= 2; }
        function head(col, side) { var p = side ? fb[col] : fa[col]; return p[p.length - 1]; }
        function isHead(y) { var o = owner[y]; return o >= 0 && !done[o] && (y === head(o, 0) || y === head(o, 1)); }
        function deg(x) { var a = neighbors(D, x), d = 0; for (var q = 0; q < a.length; q++) if (owner[a[q]] < 0 || isHead(a[q])) d++; return d; }
        function allDone() { for (var q = 0; q < k; q++) if (!done[q]) return false; return true; }
        function state() { return fa.map(function (p, j) { return [p.slice(), fb[j].slice()]; }); }
        function obviousBad(h, v, conn) {
            var ring = neighbors(D, h).concat(neighbors(D, v)), q, x;
            for (q = 0; q < ring.length; q++) { x = ring[q]; if (owner[x] < 0 && deg(x) === 0) return true; }
            if (!conn) { var a = neighbors(D, v); for (q = 0; q < a.length; q++) { x = a[q]; if (owner[x] < 0 && deg(x) <= 1) return true; } }
            return left > 0 && allDone();
        }
        function probe(col, side, op) {
            var h = head(col, side), res, p = side ? fb[col] : fa[col];
            if (op.conn) { done[col] = 1; res = obviousBad(h, head(col, 1 - side), true); var ok1 = flowSolve(n, plugs, { paths: state(), done: done, check: true, level: 2 }).ok; done[col] = 0; return { seen: res, careful: res || !ok1 }; }
            owner[op.v] = col; p.push(op.v); left--;
            res = obviousBad(h, op.v, false); var ok2 = flowSolve(n, plugs, { paths: state(), done: done, check: true, level: 2 }).ok;
            left++; p.pop(); owner[op.v] = -1;
            return { seen: res, careful: res || !ok2 };
        }
        function options(col, side) {
            var h = head(col, side), other = head(col, 1 - side), a = neighbors(D, h), list = [], q;
            for (q = 0; q < a.length; q++) { if (owner[a[q]] < 0) list.push({ v: a[q] }); else if (a[q] === other) list.push({ conn: true }); }
            list.forEach(function (op) { var r = probe(col, side, op); op.seen = r.seen; op.careful = r.careful; });
            return list;
        }
        function correct(col, side) {
            var S = sol[col];
            if (!side) return ia[col] + 1 < ib[col] ? { v: S[ia[col] + 1] } : { conn: true };
            return ib[col] - 1 > ia[col] ? { v: S[ib[col] - 1] } : { conn: true };
        }
        function same(a, b) { return a.conn ? !!b.conn : (!b.conn && a.v === b.v); }
        var raw = 0, rawBits = 0, dec = 0, d3 = 0, bits = 0, guess = 0, deep = 0, trap = 0, hx = N - k, steps = [];
        while (!allDone()) {
            var col = -1, side = 0, best = null, bestN = 99;
            for (c = 0; c < k && bestN > 1; c++) {
                if (done[c]) continue;
                for (var sd = 0; sd < 2 && bestN > 1; sd++) {
                    var o = options(c, sd), nl = o.filter(function (op) { return !op.seen; }).length;
                    if (nl < bestN) { best = o; col = c; side = sd; bestN = nl; }
                }
            }
            if (col < 0) break;
            var corr = correct(col, side), live = best.filter(function (op) { return !op.seen; }), nCare = best.filter(function (op) { return !op.careful; }).length;
            if (best.length >= 2) { raw++; rawBits += Math.log(best.length) / Math.LN2; }
            if (nCare >= 2) guess++;
            var hd = head(col, side), rec = { cell: hd, r: Math.floor(hd / D.w), c: hd % D.w, col: col, raw: best.length, n: live.length, care: nCare, opts: [] };
            if (live.length >= 2) {
                dec++; if (live.length >= 3) d3++; bits += Math.log(live.length) / Math.LN2;
                live.forEach(function (op) {
                    if (same(op, corr)) { rec.opts.push({ v: op.v, conn: !!op.conn, ok: true }); return; }
                    var pth = state(), dn = done.slice();
                    if (op.conn) dn[col] = 1; else pth[col][side].push(op.v);
                    var r = flowSolve(n, plugs, { paths: pth, done: dn, limit: 1, budget: budget, level: 2 });
                    var cost = r.aborted ? budget * 1.5 : r.nodes, depth = r.depth + (op.conn ? 0 : 1);
                    if (r.count > 0) { rec.opts.push({ v: op.v, conn: !!op.conn, alt: true, cost: cost }); return; }   /* 走這個方向也有解（不只一種解） */
                    hx += 0.5 * cost; if (depth >= 3) deep++; if (depth > trap) trap = depth;
                    rec.opts.push({ v: op.v, conn: !!op.conn, cost: cost, depth: depth, careful: op.careful });
                });
            }
            best.forEach(function (op) { if (op.seen) rec.opts.push({ v: op.v, conn: !!op.conn, seen: true }); });
            if (opts.detail && best.length >= 2) steps.push(rec);
            if (corr.conn) done[col] = 1;
            else { (side ? fb[col] : fa[col]).push(corr.v); owner[corr.v] = col; left--; if (side) ib[col]--; else ia[col]++; }
        }
        var out = { raw: raw, rawBits: Math.round(rawBits * 10) / 10, dec: dec, d3: d3, bits: Math.round(bits * 10) / 10, guess: guess, deep: deep, trap: trap, hx: Math.round(hx) };
        if (opts.detail) out.steps = steps;
        return out;
    }

    /* ── 三之三、題庫（js/wirelink_bank.js，用 test/reaction/gen_wirelink_bank.cjs 離線搜尋產生）──
       每一題 { n, h 走遍棋盤的路（起點:每一步 U／R／D／L）, c 切點, k 顏色數, e 人類試錯量, m 結構數字 }，見 wirelink_bank.js 開頭的說明。 */
    function bank() { var g = typeof window !== 'undefined' ? window : {}; return g.FM_WIRELINK_BANK || []; }
    /* 翻轉旋轉（t＝0～7：0 不變、1～3 轉 90／180／270 度、4～7 先左右翻再轉）：格子 x 在新棋盤上的位置。
       長方形棋盤（寬 w、高 h）轉 90 或 270 度（t＝1、3、5、7）之後寬高對調。題目翻轉旋轉之後解法也跟著翻轉旋轉，難度不變 */
    function transformCell(n, x, t) {
        var D = dims(n), w = D.w, h = D.h, r = Math.floor(x / w), c = x % w, rot = t % 4, nr, nc, nw = rot % 2 ? h : w;
        if (t >= 4) c = w - 1 - c;
        if (rot === 0) { nr = r; nc = c; } else if (rot === 1) { nr = c; nc = h - 1 - r; } else if (rot === 2) { nr = h - 1 - r; nc = w - 1 - c; } else { nr = w - 1 - c; nc = r; }
        return nr * nw + nc;
    }
    /* 題庫的一題 → { w 寬, h 高, segs 每種顏色的電線（格子編號陣列，從一個插頭走到另一個）} */
    function decodeBank(e) {
        var W = e.w, d = { U: -W, D: W, R: 1, L: -1 };
        var segs = e.p.map(function (str) {
            var parts = str.split(':'), s = [Number(parts[0])];
            for (var i = 0; i < parts[1].length; i++) s.push(s[s.length - 1] + d[parts[1].charAt(i)]);
            return s;
        });
        return { w: W, h: e.h, segs: segs };
    }
    /* 一題離「這一關想要的樣子」有多遠（越小越好）：違反「至少／最多」的程度 × 8（相對差距），加上棋盤大小、顏色數、試錯量差多少 */
    function violation(e, want) {
        var v = 0, key, t, x;
        for (key in want.min) { t = want.min[key]; x = e.m[key]; if (t > 0 && x < t) v += (t - x) / t; }
        for (key in want.max) { t = want.max[key]; x = e.m[key]; if (t >= 0 && x > t) v += (x - t) / Math.max(t, 0.1); }
        return v;
    }
    function scoreOf(e, want) { return violation(e, want) * 8 + Math.abs(e.k - want.k) * 2.5 + Math.abs(Math.log(1 + e.e) - Math.log(1 + want.e)) / 0.5; }
    var lastIdx = -1;                                   /* 上一關出的是題庫的第幾題（盡量不連續出同一題） */
    /* 從題庫挑最符合這一關的一題：評分最好的前 6 題（而且不比最好的差 0.6 以上）裡隨機挑一題；題庫是空的、或沒有這種大小的棋盤，回傳 null */
    function fromBank(level, rand, want) {
        var cand = [], idx = 0;
        bank().forEach(function (list, tier) { list.forEach(function (e) { var same = e.w === want.w && e.h === want.h, swap = e.w === want.h && e.h === want.w; if (same || swap) cand.push({ e: e, tier: tier, idx: idx, swap: !same, score: scoreOf(e, want), viol: violation(e, want) }); idx++; }); });   /* 棋盤大小一定要對（寬高對調的也可以：轉 90 度就好） */
        if (!cand.length) return null;
        cand.sort(function (a, b) { return a.score - b.score; });
        var best = cand[0].score, pool = cand.filter(function (c, i) { return i < 6 && c.score <= best + 0.6; });
        if (pool.length > 1) { var other = pool.filter(function (c) { return c.idx !== lastIdx; }); if (other.length) pool = other; }
        var pick = pool[Math.floor(rand() * pool.length)], d = decodeBank(pick.e), D0 = { w: d.w, h: d.h }, k = d.segs.length;
        var t = d.w === d.h ? Math.floor(rand() * 8) : (pick.swap ? 1 : 0) + 2 * Math.floor(rand() * 4);   /* 翻轉旋轉：長方形的要選「轉完寬高剛好對」的那幾種 */
        lastIdx = pick.idx;
        var cols = kit.shuffle(Array.apply(null, Array(k)).map(function (_, i) { return i; }), rand), plugs = [], solution = [];
        d.segs.forEach(function (s0, i) {
            var seg = s0.map(function (x) { return transformCell(D0, x, t); });
            if (rand() < 0.5) seg.reverse();
            plugs.push({ c: cols[i], a: seg[0], b: seg[seg.length - 1] });
            solution.push(seg);
        });
        var m = pick.e.m;
        return {
            w: want.w, h: want.h, k: k, plugs: plugs, solution: solution, level: level, want: want, tries: 1,
            info: { fromBank: true, tier: pick.tier, idx: pick.idx, score: pick.score, viol: pick.viol, hx: pick.e.e, raw: m.raw, guess: m.guess, d3: m.d3, deep: m.deep, trap: m.trap, crossFrac: m.cf, detour: m.dt, minDist: m.md, easy: m.ez, solutions: pick.e.c || 1, meets: pick.viol === 0 }
        };
    }

    /* ── 四、臨時出一題（題庫沒有這種大小的棋盤時才用；V1.57.3.1 以前的出題法）──
       做法：先用 randomHam 做一條走遍整個棋盤的路，再用 pickCuts 把它切成 k 段（切法讓「插頭的連線」盡量互相穿越、電線盡量繞路），
       每一段就是一種顏色的電線，兩端放插頭——所以一定有解（答案就是 solution），電線全部不交叉、剛好填滿整塊板子。
       最多試做 TRIES 題，挑「最難」的那一題（達到這一關的干擾要求、而且解最少）；一達到要求而且解數 ≤ SOL_GOOD 就直接用。
       回傳 { n, k, plugs（插頭）, solution（答案）, level, want（這一關的要求）, info（這一題的指標：crossFrac…、solutions 解數）, tries（實際試了幾題） } */
    function makeFresh(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var n = sizeFor(level), k = colorsFor(level), want = wantFor(level), best = null, t0 = nowMs(), tr;
        for (tr = 0; tr < TRIES; tr++) {
            var P = randomHam(n, rand), starts = pickCuts(n, P, k, MIN_SEG, want, rand, 260), m = metrics(n, P, starts);
            var meets = m.crossFrac >= want.cross - 1e-9 && m.detour >= want.detour - 1e-9 && m.minDist >= want.dist && m.easy <= want.easy + 1e-9;
            var sol = countSolutions(n, m.pairs, SOL_LIMIT, SOL_NODES), solCount = sol.aborted ? SOL_LIMIT + 1 : sol.count;
            var sc = hardness(m, n, want) + (meets ? 20 : 0) - Math.log(Math.max(1, solCount)) * 3 - (m.minDist < 2 ? 30 : 0);      /* 解越少越難；達到要求有大加分；有一對插頭緊緊貼在一起（一眼就連得起來）要大扣分 */
            if (!best || sc > best.sc) best = { sc: sc, P: P, starts: starts, m: m, sol: solCount, meets: meets };
            if (meets && solCount <= SOL_GOOD) { tr++; break; }
            if (tr + 1 >= MIN_TRIES && nowMs() - t0 > TIME_GUARD_MS) { tr++; break; }
        }
        var N = n.w * n.h, m2 = best.m, cols = kit.shuffle(Array.apply(null, Array(k)).map(function (_, i) { return i; }), rand), plugs = [], solution = [];  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        best.starts.forEach(function (s, i) {           /* forEach：對陣列的每個元素各做一次 */
            var seg = best.P.slice(s, i + 1 < k ? best.starts[i + 1] : N);
            if (rand() < 0.5) seg.reverse();
            plugs.push({ c: cols[i], a: seg[0], b: seg[seg.length - 1] });
            solution.push(seg);
        });
        return {
            w: n.w, h: n.h, k: k, plugs: plugs, solution: solution, level: level, want: want, tries: tr,
            info: { crossFrac: m2.crossFrac, crossAvg: m2.crossAvg, detour: m2.detour, easy: m2.easy, minDist: m2.minDist, meanDist: m2.meanDist, solutions: best.sol, meets: best.meets }
        };
    }
    /* 出一關（V1.57.3.2）：先從題庫挑最符合這一關難度參數的一題（隨機翻轉旋轉、隨機配顏色）；題庫沒有這種大小的棋盤，才臨時出題（makeFresh）。
       回傳 { n, k, plugs（插頭：c 顏色、a／b 兩個插頭的格子）, solution（答案：每種顏色一條，從 a 到 b）, level, want, tries, info（這一題的數字）} */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        return fromBank(level, rand, wantFor(level)) || makeFresh(level, rand);
    }
    /* 目前的接線狀態：occ[格子] ＝ 那一格的電線顏色（沒有＝−1，插頭那格一開始就是它的顏色）；paths[顏色] ＝ 這條電線已經鋪的格子（從某一個插頭開始）；done[顏色] ＝ 接通了嗎 */
    /* 建立目前的接線狀態：occ[格子]＝那一格的電線顏色（沒有＝−1；插頭那格一開始就是它的顏色）、plugOf＝插頭所在的格子、paths[顏色]＝這條電線已經鋪的格子、done[顏色]＝這條接通了嗎 */
    function newState(q) {
        var occ = new Int8Array(q.w * q.h).fill(-1), plugOf = {}, paths = {}, done = {};
        q.plugs.forEach(function (p) { occ[p.a] = p.c; occ[p.b] = p.c; plugOf[p.a] = p.c; plugOf[p.b] = p.c; paths[p.c] = []; done[p.c] = false; });
        return { w: q.w, h: q.h, occ: occ, plugOf: plugOf, paths: paths, done: done, plugs: q.plugs };
    }
    /* 同一種顏色的兩個插頭裡，「另一個」插頭在哪一格 */
    function otherPlug(st, c, cell) { var p = st.plugs.filter(function (x) { return x.c === c; })[0]; return p.a === cell ? p.b : p.a; }  /* filter：留下符合條件的元素，回傳新陣列 */
    /* 手指在格子 cell 按下：回傳這一筆畫的顏色（−1＝按在空格或不能開始的地方）。
       按在插頭上：那條電線整條收回，從這個插頭重新開始；按在同色電線的中間：那一格之後的電線收回，從這裡接著畫；按在電線的最前端：接著畫 */
    /* 手指在 cell 按下時要做什麼，回傳這一筆畫的顏色（−1＝按在空格或不能開始的地方）：按在插頭上＝這條電線整條收回、從這個插頭重新開始；按在同色電線的中間＝那格之後的收回、從這裡接著畫；按在電線最前端＝接著畫 */
    function startDraw(st, cell) {
        var c = st.occ[cell];
        if (c < 0) return -1;
        if (st.plugOf[cell] != null) { clearPath(st, c); st.paths[c] = [cell]; return c; }
        var p = st.paths[c], idx = p.indexOf(cell);     /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
        if (idx < 0) return -1;
        while (p.length > idx + 1) { var gone = p.pop(); if (st.plugOf[gone] == null) st.occ[gone] = -1; }       /* 插頭那一格的顏色不能清掉 */
        st.done[c] = false;
        return c;
    }
    /* 把顏色 c 的電線整條收回（插頭那一格的顏色要保留） */
    function clearPath(st, c) {
        st.paths[c].forEach(function (k) { if (st.plugOf[k] == null) st.occ[k] = -1; });
        st.paths[c] = []; st.done[c] = false;
    }
    /* 這一筆畫（顏色 c）拖到格子 cell：回傳 'add'（往空格鋪一格）／'connect'（接到同色的另一個插頭）／'back'（拖回上一格＝收回一格）／null（不動：不相鄰、被擋住） */
    /* 這一筆畫（顏色 c）拖到 cell 時的處理，回傳 'add'（往空格鋪一格）／'connect'（接到同色的另一個插頭）／'back'（拖回上一格＝收回一格）／null（不動：不相鄰或被擋住） */
    function applyDrag(st, c, cell) {
        var p = st.paths[c];
        if (!p.length) return null;
        var head = p[p.length - 1];
        if (p.length >= 2 && cell === p[p.length - 2]) {
            if (st.plugOf[head] == null || st.done[c]) { if (st.plugOf[head] == null) st.occ[head] = -1; p.pop(); st.done[c] = false; return 'back'; }
        }
        if (st.done[c]) return null;                                  /* 已經接通了：只能往回收，不能再往前 */
        if (!adjacent(st, head, cell)) return null;
        if (st.occ[cell] === -1) { st.occ[cell] = c; p.push(cell); return 'add'; }
        if (st.plugOf[cell] === c && cell !== p[0] && cell === otherPlug(st, c, p[0])) { p.push(cell); st.done[c] = true; return 'connect'; }
        return null;
    }
    /* 已經有電線的格子數 */
    function filled(st) { var f = 0; for (var i = 0; i < st.occ.length; i++) if (st.occ[i] >= 0) f++; return f; }
    /* 已經接通的電線條數 */
    function linked(st) { var l = 0; Object.keys(st.done).forEach(function (c) { if (st.done[c]) l++; }); return l; }
    /* 過關：每一格都有電線、每一種顏色都接通 */
    /* 過關條件：每一格都有電線、每一種顏色都接通 */
    function isSolved(st) { return filled(st) === st.w * st.h && linked(st) === st.plugs.length; }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '電線大師！';
        if (n >= 15) return '接線高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先接最容易被擋住的那一對，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'wirelink-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makePuzzle(level, api.rand), bw = q.w, bh = q.h, st = newState(q), over = false;
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[接電線] 第 ' + level + ' 關：' + bw + '×' + bh + '、' + q.k + ' 種顏色（' + q.plugs.map(function (p) { return PALETTE[p.c]; }).join('、') + '）；限時 ' + timeMs(level) + ' ms；' + (q.info.fromBank ? '題庫第 ' + q.info.tier + ' 級：路口 ' + q.info.raw + '、要猜 ' + q.info.guess + '、深陷阱 ' + q.info.deep + '、最深 ' + q.info.trap + ' 步、試錯量 ' + q.info.hx + '（想要 ' + Math.round(q.want.e) + '）、違反 ' + q.info.viol.toFixed(2) + '；' : '臨時出題；') + '互相穿越 ' + Math.round(q.info.crossFrac * 100) + '%（要求 ≥ ' + Math.round(q.want.cross * 100) + '%）、繞路 ' + (+q.info.detour).toFixed(2) + '、插頭最近 ' + q.info.minDist + ' 格、解約 ' + (q.info.solutions > SOL_LIMIT ? '≥' + SOL_LIMIT : q.info.solutions) + ' 種');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, topPad = 26;   /* topPad：上方「已接通…」那一行佔的高度（V1.57.3.2 縮小，把空間留給盤面） */
        var cell = Math.floor(Math.min((W - 12) / bw, (H - topPad - 6) / bh, 90)), BW = cell * bw, BH = cell * bh, bx = Math.round((W - BW) / 2), by = topPad + Math.max(0, Math.round((H - topPad - 6 - BH) / 2));  /* 算棋盤尺寸：每格邊長 cell（寬、高都放得下、最大 90px）、整個棋盤寬 BW 高 BH、棋盤左上角的位置 bx／by（置中） */
        var tip = h('div', { 'class': 'qz-note wirelink-tip', text: '' });
        stage.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var board = h('div', { 'class': 'wirelink-board' });  /* board：盤面（所有格子都放在裡面） */
        board.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;width:' + BW + 'px;height:' + BH + 'px;';
        stage.appendChild(board);
        var cells = [];
        for (var i = 0; i < bw * bh; i++) {
            var r = Math.floor(i / bw), c = i % bw, el = h('div', { 'class': 'wirelink-cell' });
            el.style.cssText = 'left:' + c * cell + 'px;top:' + r * cell + 'px;width:' + cell + 'px;height:' + cell + 'px;';
            board.appendChild(el); cells.push(el);
        }
        /* 第 i 格的中心 x 座標（格子編號 ＝ 列 × n ＋ 欄） */
        function cx(i) { return (i % bw + 0.5) * cell; }
        /* 第 i 格的中心 y 座標 */
        function cy(i) { return (Math.floor(i / bw) + 0.5) * cell; }
        var svg = kit.svg('svg', { 'class': 'wirelink-svg', viewBox: '0 0 ' + BW + ' ' + BH, width: BW, height: BH }, board);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        var gSol = kit.svg('g', {}, svg), wires = {}, plugEls = [];  /* gSol：時間到時用來放「正確接法」的群組；wires：每種顏色的電線（SVG path）；plugEls：所有插頭的畫面元素 */
        q.plugs.forEach(function (p) {
            var w = kit.svg('path', { 'class': 'wirelink-wire wirelink-c' + p.c, d: '' }, svg);
            w.setAttribute('stroke-width', (cell * 0.46).toFixed(1)); wires[p.c] = w;  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        });
        q.plugs.forEach(function (p) {
            [p.a, p.b].forEach(function (k) {
                var g = kit.svg('g', { 'class': 'wirelink-plug wirelink-c' + p.c }, svg);
                kit.svg('circle', { 'class': 'wirelink-plug-body', cx: cx(k), cy: cy(k), r: cell * 0.34 }, g);
                kit.svg('circle', { 'class': 'wirelink-plug-in', cx: cx(k), cy: cy(k), r: cell * 0.14 }, g);
                plugEls.push({ g: g, c: p.c });
            });
        });
        /* 把一串格子編號轉成 SVG path 的路徑文字（"M x y L x y …"：M 移到起點、L 畫線到下一點） */
        function pathD(p) { return p.map(function (k, j) { return (j ? 'L' : 'M') + cx(k).toFixed(1) + ' ' + cy(k).toFixed(1); }).join(' '); }  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        /* 重畫：每條電線依目前鋪的格子畫出路徑、接通的插頭亮起來、上方顯示「已接通幾條、填滿幾格」 */
        function paint() {
            q.plugs.forEach(function (p) {
                var path = st.paths[p.c];
                wires[p.c].setAttribute('d', path.length ? pathD(path) + (path.length === 1 ? ' L' + (cx(path[0]) + 0.01) + ' ' + cy(path[0]) : '') : '');
            });
            plugEls.forEach(function (pe) { pe.g.classList.toggle('wirelink-plug--on', !!st.done[pe.c]); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            tip.textContent = '已接通 ' + linked(st) + '／' + q.k + ' 條　填滿 ' + filled(st) + '／' + bw * bh + ' 格';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
        }
        paint();
        api.timer(timeMs(level), function () { finish('time'); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('wirelink.hint')) { /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            var p0 = q.plugs[0];
            kit.hintOn(stage, null, { mode: 'drag', x: bx + cx(p0.a), y: by + cy(p0.a), dx: cx(p0.b) - cx(p0.a), dy: cy(p0.b) - cy(p0.a), delay: 500, text: '從插頭拖到同色插頭且佈滿畫面' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        }

        var pid = null, drawing = -1, lastPt = null;    /* pid：目前這根手指的編號（只認一根）；drawing：正在畫的顏色（−1＝沒在畫）；lastPt：手指上一個位置 */
        /* 把舞台座標換算成格子編號（在棋盤外回傳 −1） */
        function cellAt(x, y) {
            var c = Math.floor((x - bx) / cell), r = Math.floor((y - by) / cell);
            return c < 0 || c >= bw || r < 0 || r >= bh ? -1 : r * bw + c;
        }
        /* 手指移動到 p：把「上一個位置到 p」這一段切成小步（每步最多 1/4 格），一步一步呼叫 applyDrag，這樣手指移太快也不會跳過格子 */
        function feed(p) {
            if (over || api.over) return;
            var from = lastPt || p, dist = kit.dist(from.x, from.y, p.x, p.y), steps = Math.max(1, Math.ceil(dist / (cell / 4)));  /* Math.ceil：無條件進位成整數 */
            for (var s = 1; s <= steps && !over && !api.over; s++) {
                var x = from.x + (p.x - from.x) * s / steps, y = from.y + (p.y - from.y) * s / steps, k = cellAt(x, y);
                if (k < 0) continue;
                var act = applyDrag(st, drawing, k);
                if (act) { Sfx.play(act === 'connect' ? 'ok' : (act === 'add' ? 'tick' : 'flip')); paint(); if (isSolved(st)) finish('ok'); }  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            }
            lastPt = p;
        }
        stage.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (over || api.over || pid != null) return;
            var p = kit.localPt(e, stage), k = cellAt(p.x, p.y);
            if (k < 0) return;
            var c = startDraw(st, k);
            if (c < 0) return;
            e.preventDefault(); pid = e.pointerId; drawing = c; lastPt = p;  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }  /* setPointerCapture：手指移出元素範圍後，仍然持續收到這個元素的移動事件（拖曳才不會中斷） */
            paint();
        });
        stage.addEventListener('pointermove', function (e) { if (pid === e.pointerId) feed(kit.localPt(e, stage)); });
        /* 手指放開：結束這一筆畫 */
        function up(e) { if (pid === e.pointerId) { pid = null; drawing = -1; lastPt = null; } }
        stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

        /* 結束：kind＝'ok'（接好了）／'time'（時間到） */
        /* 結束：kind 是 'ok'（接好了，燈全亮、過關）或 'time'（時間到，沒接通的電線閃紅，並一條一條畫出正確接法，然後失敗） */
        function finish(kind) {
            if (over || api.over) return;
            over = true; pid = null;
            if (kind === 'ok') {
                board.classList.add('wirelink-board--lit');
                tip.textContent = '全部接好了，燈全亮！';
                kit.flash(stage, true, api.my);         /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                api.pass({ delay: 1500 });              /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                return;
            }
            /* 時間到：沒接通的電線閃紅；正確的接法一條一條畫出來（每條晚 0.25 秒） */
            var miss = 0;
            q.plugs.forEach(function (p, i) {
                if (!st.done[p.c]) { wires[p.c].classList.add('wirelink-wire--bad'); miss++; }
                var sl = kit.svg('path', { 'class': 'wirelink-sol wirelink-c' + p.c, d: pathD(q.solution[i]), pathLength: 1 }, gSol);
                sl.setAttribute('stroke-width', (cell * 0.46).toFixed(1));
                sl.style.animationDelay = (i * 0.25) + 's';
            });
            board.classList.add('wirelink-board--reveal');
            gSol.classList.add('wirelink-sol--draw');
            tip.textContent = '時間到！彩色粗線是其中一種接法';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3000, lines: ['時間到，還有 ' + miss + ' 條電線沒接通、' + (bw * bh - filled(st)) + ' 格沒填滿', '板子 ' + bw + '×' + bh + '、' + q.k + ' 種顏色'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 驗證用：api.solve 把出題時的解一條一條接好；api.wrong 直接當作時間到 */
        api.solve = function () {
            q.plugs.forEach(function (p, i) {
                var c = startDraw(st, q.solution[i][0]);
                q.solution[i].slice(1).forEach(function (k) { applyDrag(st, c, k); });
            });
            paint(); if (isSolved(st)) finish('ok');
        };
        api.wrong = function () { finish('time'); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '接電線',
        rule: '方格板上有幾對同顏色的插頭。**手指從一個插頭拖到同色的另一個插頭**，拖過的格子會變成電線。**電線必須占滿每一格且不能交叉**才過關。拖錯了，從插頭重新拖就好。來不及就結束，看你能過幾關。越後面，棋盤越大、顏色越多，還會有很像的顏色（藍和水藍、橘和黃和棕）！**不同顏色的電線會互相干擾**：兩個插頭之間最短的路，常常會被別的顏色擋住，要想清楚每條線該繞哪裡。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            sizeFor: sizeFor, colorsFor: colorsFor, timeMs: timeMs, wantFor: wantFor, splitLengths: splitLengths, randomHam: randomHam, manhattan: manhattan, segCross: segCross, metrics: metrics, hardness: hardness,
            pickCuts: pickCuts, countSolutions: countSolutions, flowSolve: flowSolve, human: human, makePuzzle: makePuzzle, makeFresh: makeFresh, fromBank: fromBank,
            transformCell: transformCell, decodeBank: decodeBank, violation: violation, bank: bank,
            HUMAN_EFFORT: HUMAN_EFFORT, FORK_MIN: FORK_MIN, GUESS_MIN: GUESS_MIN, FORK3_MIN: FORK3_MIN, DEEP_TRAP_MIN: DEEP_TRAP_MIN, TRAP_MAX: TRAP_MAX, newState: newState, startDraw: startDraw, applyDrag: applyDrag,
            filled: filled, linked: linked, isSolved: isSolved, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SIZE_W: SIZE_W, SIZE_H: SIZE_H, dims: dims, neighbors: neighbors, adjacent: adjacent, COLORS: COLORS, TIME_S: TIME_S, MIN_SEG: MIN_SEG, PALETTE: PALETTE, MAX_LEVEL: MAX_LEVEL,
            CROSS_MIN: CROSS_MIN, DETOUR_MIN: DETOUR_MIN, DIST_MIN: DIST_MIN, EASY_MAX: EASY_MAX, TRIES: TRIES, MIN_TRIES: MIN_TRIES, TIME_GUARD_MS: TIME_GUARD_MS, SOL_LIMIT: SOL_LIMIT, SOL_NODES: SOL_NODES, SOL_GOOD: SOL_GOOD
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
