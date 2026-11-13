/* ═══════════════════════════════════════════════════════════════════
   reaction_inout.js — 秒反應・圈內圈外（企劃 271；V1.57.0 改成「指紋螺旋」）
   樣式：css/games/reaction_inout.css（這款專屬的 class 一律以「inout-」開頭；共用元件在 css/reaction_common.css）
   一條首尾相連、不自己交叉的紅色繩圈，繞成指紋似的螺旋紋，**螞蟻在畫面正中央、在繩圈的裡面還是外面？** 點「裡面」或「外面」。
   ───────────────────────────────────────────────────────────────────
   · V1.57.0（玩家意見）：原本用「迷宮」做繩圈，有個漏洞——**從外圍找得到一條直線切進去**，很快就能判斷內外。現在改成指紋：
       ① 繩圈是一條「很粗的螺旋帶」的邊界（makeSpine 造中心線、ropePolygon 往兩邊加寬，最後用兩條平行的邊＋兩個圓頭接成一圈）：
          帶子裡面是「繩圈裡面」，帶子之間的縫是「繩圈外面」。帶子寬、縫寬幾乎一樣，而且各自隨機忽粗忽細，所以光看一小塊分不出哪個是帶子、哪個是縫；
       ② **貼著前一段繩子往外長**（V1.57.0 玩家意見：以前繩子之間有時候空隙很寬，尤其是繩子的起點附近空了一大塊）：帶子從起點（一小段直線）開始，
          每一步都沿著「已經畫好的繩子」的外緣前進、保持固定的縫寬（makeSpine 的做法：量離最近的舊繩子多遠，太近就推開、太遠就靠過去），
          所以一圈貼著一圈，縫寬只有「縫的平均寬度（1 − STRIP_W）上下隨機變化」，不會有大片空白；共繞 RINGS 圈（離起點最遠的地方，離起點有 RINGS 個圈距）。
       ③ **螞蟻放在「圓心」和「最外圍」的正中間**（V1.57.0 玩家意見：不要讓玩家從最外面、或從最中央一圈一圈數過去就找到）：從螞蟻往圓心（起點那一小段直線）要穿過 b 條線、
          往最近的外面要穿過 a 條線，b ÷ (a ＋ b) 要落在 ANT_DEPTH（預設 0.4～0.6）——從外面數進來、從中央數出去，都要數差不多多的線。
          （用「要數的線數」算，不是用幾何距離：指紋不是正圓，有迴轉的時候一邊鼓、一邊扁，量距離的話螞蟻會偏向一邊。）位置繞著圓心隨機（在帶子上、在縫裡各一半），
          然後整個圖形平移，讓螞蟻剛好在畫面正中央。玩家要**從螞蟻開始，一條一條數到外面**，數穿過幾條線：奇數＝裡面、偶數＝外面；
       ④ **不是一路往同一個方向繞**：每繞完一圈就有 REVERSE_P 的機會「急速迴轉」——帶子在轉彎處掉頭（半圓形的髮夾彎），沿著剛剛那一圈的外緣往相反的方向繞，
          順時針的螺旋忽然變成逆時針，用來迷惑玩家；
       ⑤ 整條繩圈再經過一個平滑的扭曲（warpPoint，V1.36.0 就有；WARP_A 是扭曲的幅度，單位是「圈距」），指紋的紋路微微蜿蜒，不是正圓。
   · 出題時驗證（makeLevel）：繩圈是一條不自己交叉的封閉曲線、帶子與縫都沒有窄到看不清（MIN_GAP）、螞蟻的內外用射線法確定（也用好幾個方向的射線數穿過幾條線來交叉驗證），
     而且**沒有捷徑**：從螞蟻往任何一個方向畫直線，穿過的線至少有 RAY_MIN 條（rayStats；第 1 關 → 到頂；螞蟻在正中間，離外面本來就有一半的圈數，這個只是保險）——驗證不過就重新造，最後才取最好的一個。
   · 難度（線性，RAMP_LEVELS 關走到頂）：圈數 RINGS（要數的線越多）、迴轉機率 REVERSE_P、最少要穿過幾條線 RAY_MIN、
     紋路與縫的粗細不均勻程度 VARIANCE、扭曲幅度 WARP_A、限時 TIME_S。螞蟻縮得很小（ANT_SIZE ＝ 圈距的 0.45 倍）。錯一次就結束，防亂按。
   · 揭曉：繩圈裡面（帶子）整條塗上淡綠色，螞蟻在不在綠色裡一目了然。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'inout'：選單、成績、存檔都靠它；樣式在 css/games/reaction_inout.css，裡面的 class 名稱一律以 inout- 開頭。 */
    'use strict';

    var ID = 'inout';                                   /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* 下面所有長度的單位都是「圈距」＝相鄰兩圈（一條帶子加一條縫）的平均距離；畫面上再換算成 px */
    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var RINGS = [6, 16];                        /* 指紋從中央往外有幾圈：第 1 關 → 到頂（螞蟻要穿過的線大約是這個數字的 2 倍，越多越難數） */
    var REVERSE_P = [0.33, 0.66];                 /* 每繞完一圈，紋路「急速迴轉」（在轉彎處掉頭、沿著剛剛那一圈的外緣往反方向繞）的機率：第 1 關 → 到頂 */
    var TIME_S = [8, 12];                        /* 每題限時（秒）：第 1 關 → 到頂 */
    var VARIANCE = [0.5, 0.75];                /* 紋路寬度與縫寬度的不均勻程度：每一圈的寬度在 1 ± (這個值 × 0.6，最多 0.45) 之間隨機：第 1 關 → 到頂 */
    var WARP_A = [0.2, 0.5];                    /* 整條繩圈的扭曲幅度（圈距）：第 1 關 → 到頂（太大會讓相鄰的線碰在一起，出題時有驗證） */
    var ANT_SIZE = 0.45;                        /* 螞蟻的大小（圈距的幾倍） */
    var STRIP_W = 0.5;                          /* 一條紋路（繩圈裡面）的平均寬度（圈距的幾倍）；縫（繩圈外面）是 1 − STRIP_W */
    var VIEW_FRAC = 0.6;                        /* 畫面（方形）只放得下「螞蟻到圖形最遠處」的這個比例（0.6＝60%）；螞蟻在圓心與最外圍的正中間，離最近的外面只有一半的圈數、離對面的外面卻有一倍半，全部塞進畫面會縮得很小，所以把遠的那一邊裁掉一點（1＝不裁，全部放進畫面） */
    var VIEW_MARGIN = 3;                        /* 但是螞蟻離「最近的外面」，至少要看到外面再多這麼多圈距（圈距）——最近的外面一定在畫面裡，玩家才有辦法從螞蟻數到外面 */
    var SEED_LEN = [0.8, 3];                    /* 繩子起點那一小段直線的長度（圈距，[最短, 最長]，每題隨機）：越長，指紋越像拉長的跑道，越短越像圓形的漩渦 */
    var ANT_DEPTH = [0.4, 0.6];                 /* 螞蟻在「圓心 → 最外面」之間的位置（用要數的線數算）：往圓心要穿過 b 條線、往最近的外面要穿過 a 條線，b ÷ (a ＋ b) 落在這個範圍（[最小, 最大]，每題隨機）；0 ＝ 貼著圓心、1 ＝ 貼著最外面、0.5 ＝ 正中間（從外面數進來、從中央數出去都一樣多）；範圍越窄，越固定在正中間 */
    var RAY_MIN = [3, 8];                       /* 沒有捷徑：從螞蟻往任何方向畫直線，穿過的線至少有幾條：第 1 關 → 到頂（螞蟻在圓心與最外圍的中間，離外面大約一半的圈數，所以這個通常自動滿足，是保險） */
    var FOLLOW_GAIN = 1;                      /* 貼著前一段繩子長的力道：離理想的縫寬差多少，就往外推（或往內靠）多少倍（太大會抖，太小貼不緊） */
    var MAX_TURN = 0.9;                         /* 繩子前進時，每一步最多轉幾弧度（太小，繞過尖角、凹進去的地方時轉不過來，會撞到旁邊的繩子；太大轉彎不圓滑——之後還會磨平） */
    var SKIP_ARC = 2;                           /* 量「離前面的繩子多遠」時，忽略自己最近的這一段（弧長，圈距），不然會一直量到自己的尾巴 */
    var MIN_GAP = 0.12;                         /* 兩條不相鄰的線之間至少要隔多遠（圈距），不然畫面上會黏在一起 */
    var STEP = 0.3;                             /* 折線取點的間距（圈距） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function ringsFor(level) { return Math.max(2, Math.round(ramp(level, RINGS))); }  /* Math.round：四捨五入成整數 */
    function reverseFor(level) { return Math.round(ramp(level, REVERSE_P) * 10000) / 10000; }
    function rayMinFor(level) { return Math.round(ramp(level, RAY_MIN)); }
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }
    function varianceFor(level) { return Math.round(ramp(level, VARIANCE) * 10000) / 10000; }
    function warpAFor(level) { return Math.round(ramp(level, WARP_A) * 10000) / 10000; }
    function smooth(u) { u = u < 0 ? 0 : (u > 1 ? 1 : u); return u * u * (3 - 2 * u); }   /* 平滑的 0→1（兩端的斜率是 0，接起來沒有折角） */

    /* 平滑的亂數曲線（回傳函式：弧長 s → −1～1）：三個不同波長的正弦波疊起來。繩子的粗細與縫的寬度沿著繩子慢慢變化，一條帶子「忽粗忽細」 */
    function smoothNoise(rand) {
        var f = [], p = [], i;
        for (i = 0; i < 3; i++) { f.push(2 * Math.PI / kit.randFloat(2.5, 7, rand)); p.push(kit.randFloat(0, 2 * Math.PI, rand)); }  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        return function (s) { return 0.55 * Math.sin(f[0] * s + p[0]) + 0.3 * Math.sin(f[1] * s + p[1]) + 0.15 * Math.sin(f[2] * s + p[2]); };
    }
    /* 把折線磨平：每個點（頭尾除外）換成「前、自己、後」三點的平均，重複 times 次（直接改 pts） */
    function smoothPath(pts, times) {
        for (var t = 0; t < times; t++) {
            var c = pts.map(function (p) { return [p[0], p[1]]; });
            for (var i = 1; i < pts.length - 1; i++) { pts[i][0] = (c[i - 1][0] + c[i][0] + c[i + 1][0]) / 3; pts[i][1] = (c[i - 1][1] + c[i][1] + c[i + 1][1]) / 3; }
        }
    }
    /* 指紋帶子的「中心線」（V1.57.0：貼著前一段繩子往外長）。回傳 { pts（中心線上的點）, hw（每個點往兩邊各加寬多少）, S（每個點的累計弧長）, len（總長）, seed（起點那一小段直線的點，指紋的「圓心」）, revs（迴轉幾次）, seedLen（起點直線的長度）, K }；長不出來回傳 null。
       · 起點：一小段直線（SEED_LEN），然後掉頭（半圓形髮夾彎）開始繞第一圈。
       · 每一步：找出「離現在這個點最近的舊繩子」（忽略最近 SKIP_ARC 的弧長），理想距離 ＝ 兩邊各一半的帶寬 ＋ 縫寬（都隨弧長慢慢變化）；
         沿著舊繩子的外緣走（方向＝離開舊繩子的方向轉 90 度），距離太近就往外推、太遠就往內靠（FOLLOW_GAIN），每一步最多轉 MAX_TURN 弧度。
         所以一圈緊貼著一圈，縫寬就是理想的縫寬，不會有大片空白。
       · 每繞完一圈（走過的弧長 ≥ 目前這一圈的周長），有 revP 的機會迴轉：往外畫半圓形的髮夾彎掉頭，沿著剛剛那一圈的外緣往反方向繞（blob 的符號換邊）。
       · 結束：離起點直線 ≥ K − 0.3 圈距（＝繞了 K 圈）。 */
    function makeSpine(K, revP, jitter, rand) {
        var nzW = smoothNoise(rand), nzG = smoothNoise(rand);
        function wAt(s) { return STRIP_W * (1 + jitter * nzW(s)); }                 /* 弧長 s 處的帶寬 */
        function gAt(s) { return (1 - STRIP_W) * (1 + jitter * nzG(s)); }           /* 弧長 s 處的理想縫寬 */
        var pts = [], hw = [], S = [], grid = new Map(), CELL = 1.6, lim = -1, revs = 0, seedLen = kit.randFloat(SEED_LEN[0], SEED_LEN[1], rand), hd = 0;
        function add(x, y) {
            var n = pts.length, s = n ? S[n - 1] + Math.hypot(x - pts[n - 1][0], y - pts[n - 1][1]) : 0;
            if (n && s - S[n - 1] < 1e-6) return;
            var key = Math.floor(x / CELL) * 100003 + Math.floor(y / CELL), l = grid.get(key);
            if (!l) grid.set(key, l = []);
            l.push(pts.length); pts.push([x, y]); hw.push(wAt(s) / 2); S.push(s);
        }
        /* 離 (x, y) 最近的「舊繩子」上的點（編號 ≤ lim：弧長離頭至少 SKIP_ARC）；回傳 { i, d }，沒有回傳 null */
        function nearest(x, y, last) {
            while (lim + 1 < last && S[last] - S[lim + 1] >= SKIP_ARC) lim++;
            if (lim < 0) return null;
            var rad, gx, gy, t, i, d, cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), best, bd;
            for (rad = 1; rad <= 3; rad++) {
                best = -1; bd = 1e9;
                for (gx = cx - rad; gx <= cx + rad; gx++) for (gy = cy - rad; gy <= cy + rad; gy++) {
                    var l = grid.get(gx * 100003 + gy);
                    if (!l) continue;
                    for (t = 0; t < l.length; t++) { i = l[t]; if (i > lim) break; d = Math.hypot(pts[i][0] - x, pts[i][1] - y); if (d < bd) { bd = d; best = i; } }
                }
                if (best >= 0 && bd <= rad * CELL) return { i: best, d: bd };
            }
            best = -1; bd = 1e9;                                                      /* 附近都沒有：全部找一遍（很少發生） */
            for (i = 0; i <= lim; i++) { d = Math.hypot(pts[i][0] - x, pts[i][1] - y); if (d < bd) { bd = d; best = i; } }
            return best >= 0 ? { i: best, d: bd } : null;
        }
        /* 半圓形的髮夾彎：從最後一個點往 toLeft（左／右）掉頭，直徑＝帶寬＋縫寬，掉頭之後朝相反方向 */
        function hairpin(toLeft) {
            var n = pts.length - 1, px = pts[n][0], py = pts[n][1], sg = toLeft ? 1 : -1, nx = -Math.sin(hd) * sg, ny = Math.cos(hd) * sg, tx = Math.cos(hd), ty = Math.sin(hd);
            var Dh = wAt(S[n]) + gAt(S[n]), m = Math.max(6, Math.ceil(Math.PI * Dh / 2 / STEP)), j, f;
            for (j = 1; j <= m; j++) { f = Math.PI * j / m; add(px + nx * (Dh / 2) * (1 - Math.cos(f)) + tx * (Dh / 2) * Math.sin(f), py + ny * (Dh / 2) * (1 - Math.cos(f)) + ty * (Dh / 2) * Math.sin(f)); }
            hd += Math.PI;
        }
        for (var x0 = 0; x0 <= seedLen + 1e-9; x0 += STEP) add(x0, 0);               /* 起點：一小段直線（往東） */
        var seedN = pts.length;
        function dSeed(x, y) { var d = 1e9; for (var i = 0; i < seedN; i++) d = Math.min(d, Math.hypot(pts[i][0] - x, pts[i][1] - y)); return d; }   /* 離起點直線多遠 */
        var blob = rand() < 0.5 ? 1 : -1;                                             /* 舊繩子在前進方向的哪一邊：1＝左、−1＝右 */
        hairpin(blob === 1);                                                          /* 掉頭，開始繞第一圈 */
        var lapAcc = 0, guard = 0, stopR = K - 0.3;
        while (guard++ < 40000) {
            var n = pts.length - 1, x = pts[n][0], y = pts[n][1], dsd = dSeed(x, y);
            if (dsd >= stopR) break;
            if (lapAcc >= 2 * seedLen + 2 * Math.PI * Math.max(1, dsd)) {             /* 繞完一圈了：有機會迴轉 */
                lapAcc = 0;
                if (rand() < revP) { hairpin(blob === -1); blob = -blob; revs++; continue; }
            }
            var nb = nearest(x, y, n);
            if (!nb) return null;
            var q = pts[nb.i], dn = Math.max(1e-6, nb.d), ux = (x - q[0]) / dn, uy = (y - q[1]) / dn;          /* (ux, uy)：離開舊繩子的方向 */
            var D = hw[n] + gAt(S[n]) + hw[nb.i];                                      /* 理想距離（中心線到中心線） */
            var tx = blob === 1 ? -uy : uy, ty = blob === 1 ? ux : -ux;                /* 沿著舊繩子的外緣走：離開的方向轉 90 度 */
            var want = Math.atan2(ty + FOLLOW_GAIN * (D - dn) * uy, tx + FOLLOW_GAIN * (D - dn) * ux), dh = want - hd;
            dh = Math.atan2(Math.sin(dh), Math.cos(dh));
            hd += Math.max(-MAX_TURN, Math.min(MAX_TURN, dh));
            add(x + STEP * Math.cos(hd), y + STEP * Math.sin(hd)); lapAcc += STEP;
        }
        if (guard >= 40000) return null;
        smoothPath(pts, 3);                                                        /* 把中心線再磨平一點（3 次三點平均；頭尾不動），小抖動變少 */
        return { pts: pts, hw: hw, S: S, len: S[S.length - 1], seed: pts.slice(0, seedN).map(function (p) { return [p[0], p[1]]; }), revs: revs, seedLen: seedLen, K: K };
    }
    /* 最簡單的螺旋（備用，保證不會出錯）：半徑從 0.6 一圈長 1 圈距，K 圈；帶寬 STRIP_W 固定、不迴轉 */
    function plainSpiral(K) {
        var pts = [], hw = [], S = [], th = 0, r = 0.6, s = 0;
        while (r < K + 0.6) {
            pts.push([r * Math.cos(th), r * Math.sin(th)]); hw.push(STRIP_W / 2);
            if (pts.length > 1) s += Math.hypot(pts[pts.length - 1][0] - pts[pts.length - 2][0], pts[pts.length - 1][1] - pts[pts.length - 2][1]);
            S.push(s); th += STEP / r; r = 0.6 + th / (2 * Math.PI);
        }
        return { pts: pts, hw: hw, S: S, len: S[S.length - 1], seed: [[0, 0]], revs: 0, seedLen: 0, K: K };
    }
    /* 把中心線加寬成一條「帶子」的邊界：左邊一路往前、末端接半圓頭、右邊一路倒回來、開頭接半圓頭——一圈封閉的折線（頂點 [x, y]），就是繩圈。hw[i]＝第 i 點往兩邊各加寬多少 */
    function ropePolygon(spine, hw) {
        var n = spine.length, Lf = [], Rt = [], T = [], i;
        for (i = 0; i < n; i++) { var a = spine[Math.max(0, i - 1)], b = spine[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; T.push([dx / l, dy / l]); }
        for (i = 0; i < n; i++) { var t = T[i], nx = -t[1], ny = t[0]; Lf.push([spine[i][0] + nx * hw[i], spine[i][1] + ny * hw[i]]); Rt.push([spine[i][0] - nx * hw[i], spine[i][1] - ny * hw[i]]); }
        function cap(c, t, s, half) { var nx = -t[1], ny = t[0], out = []; for (var j = 1; j < 8; j++) { var f = Math.PI * j / 8; out.push([c[0] + half * s * (nx * Math.cos(f) + t[0] * Math.sin(f)), c[1] + half * s * (ny * Math.cos(f) + t[1] * Math.sin(f))]); } return out; }
        var poly = Lf.slice();
        cap(spine[n - 1], T[n - 1], 1, hw[n - 1]).forEach(function (p) { poly.push(p); });      /* forEach：對陣列的每個元素各做一次 */
        for (i = n - 1; i >= 0; i--) poly.push(Rt[i]);
        cap(spine[0], T[0], -1, hw[0]).forEach(function (p) { poly.push(p); });
        return poly;
    }
    /* 扭曲的參數：幅度 a（圈距）、四個隨機頻率與相位。頻率對應 4～8 圈距的波長，a ≤ 0.34 時扭曲的梯度小於 1（一對一、不會讓線穿過自己） */
    function warpParams(a, rand) {
        function k() { return 2 * Math.PI / kit.randFloat(4, 8, rand); }
        function p() { return kit.randFloat(0, 2 * Math.PI, rand); }
        return { a: a, k1: k(), k2: k(), k3: k(), k4: k(), p1: p(), p2: p(), p3: p(), p4: p() };
    }
    /* 扭曲一個點（單位：圈距）：x、y 各被兩個不同方向、不同頻率的正弦波推開一點點 */
    function warpPoint(x, y, w) {
        return [x + w.a * (Math.sin(w.k1 * y + w.p1) + 0.5 * Math.sin(w.k2 * (x + y) * 0.7 + w.p2)), y + w.a * (Math.sin(w.k3 * x + w.p3) + 0.5 * Math.sin(w.k4 * (x - y) * 0.7 + w.p4))];
    }
    /* 兩線段 (a,b) (c,d) 是不是相交（不含端點相接） */
    function segCross(a, b, c, d) {
        function o(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
        var o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
        return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
    }
    /* 把封閉折線的每一段，放進「格子」裡（一段跨過哪些格子，就放進哪些）；只有放在同一格的線段才需要互相比較，速度快很多（有 5000 多個點）。回傳 Map：格子編號 → 線段編號的陣列 */
    function segGrid(pts, cell) {
        var n = pts.length, map = new Map(), i, x, y;
        for (i = 0; i < n; i++) {
            var a = pts[i], b = pts[(i + 1) % n], x0 = Math.floor(Math.min(a[0], b[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0]) / cell), y0 = Math.floor(Math.min(a[1], b[1]) / cell), y1 = Math.floor(Math.max(a[1], b[1]) / cell);  /* Math.floor：無條件捨去成整數 */
            for (x = x0; x <= x1; x++) for (y = y0; y <= y1; y++) { var key = x * 100003 + y, l = map.get(key); if (!l) map.set(key, l = []); l.push(i); }
        }
        return map;
    }
    /* 這個封閉折線（點的陣列）有沒有自己穿過自己（相鄰的線段不比） */
    function selfCrosses(pts) {
        var n = pts.length, tot = 0, i;
        for (i = 0; i < n; i++) tot += Math.hypot(pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]);
        var map = segGrid(pts, Math.max(1e-6, 2 * tot / n)), hit = false;
        map.forEach(function (l) {
            if (hit) return;
            for (var x = 0; x < l.length && !hit; x++) for (var y = x + 1; y < l.length; y++) {
                var p = l[x], q = l[y];
                if (q === p + 1 || p === q + 1 || (p === 0 && q === n - 1) || (q === 0 && p === n - 1)) continue;
                if (segCross(pts[p], pts[(p + 1) % n], pts[q], pts[(q + 1) % n])) { hit = true; break; }
            }
        });
        return hit;
    }
    /* 點 p 到線段 (a, b) 的距離 */
    function ptSeg(p, a, b) {
        var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, s = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
        return Math.hypot(p[0] - a[0] - s * dx, p[1] - a[1] - s * dy);
    }
    /* 封閉折線上「不相鄰」（沿著線至少隔 skip 個點）的兩處，最近有多近？（點到線段的距離，用格子找鄰居）。太近＝畫面上兩條線黏在一起 */
    function minGap(pts, skip) {
        skip = skip == null ? 14 : skip;
        var n = pts.length, cell = 0.5, map = segGrid(pts, cell), best = 1e9, i, x, y;
        for (i = 0; i < n; i++) {
            var p = pts[i], cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell);
            for (x = cx - 1; x <= cx + 1; x++) for (y = cy - 1; y <= cy + 1; y++) {
                var l = map.get(x * 100003 + y);
                if (!l) continue;
                for (var t = 0; t < l.length; t++) { var j = l[t], dd = Math.min((i - j + n) % n, (j - i + n) % n); if (dd <= skip + 1) continue; var d = ptSeg(p, pts[j], pts[(j + 1) % n]); if (d < best) best = d; }
            }
        }
        return best;
    }
    /* 封閉折線 → SVG path（座標單位 × s，再平移 (ox, oy) px） */
    function polyPath(pts, s, ox, oy) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + (ox + p[0] * s).toFixed(2) + ',' + (oy + p[1] * s).toFixed(2); }).join(' ') + ' Z'; }  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
    /* 點 (x, y) 在不在多邊形 poly（頂點 [x,y] 的陣列）裡面：射線法 */
    function pointInPoly(x, y, poly) {
        var inside = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
    }
    /* 從 (ox, oy) 往角度 ang（弧度）畫一條射線，穿過繩圈幾次（＝玩家要數的線） */
    function rayCross(poly, ox, oy, ang) {
        var dx = Math.cos(ang), dy = Math.sin(ang), c = 0, n = poly.length;
        for (var i = 0; i < n; i++) {
            var a = poly[i], b = poly[(i + 1) % n], sa = (a[0] - ox) * dy - (a[1] - oy) * dx, sb = (b[0] - ox) * dy - (b[1] - oy) * dx;
            if ((sa > 0) === (sb > 0)) continue;
            var den = dx * (b[1] - a[1]) - dy * (b[0] - a[0]), t = ((a[0] - ox) * (b[1] - a[1]) - (a[1] - oy) * (b[0] - a[0])) / (den || 1e-12);
            if (t > 0) c++;
        }
        return c;
    }
    /* 各個方向的射線穿過繩圈的次數：{ min, max, mean, odd（有幾條射線是奇數次）, n }（角度從 0.01 弧度開始，避開剛好壓在頂點上的方向） */
    function rayStats(poly, ox, oy, n) {
        n = n || 120;
        var mn = 1e9, mx = 0, sum = 0, odd = 0;
        for (var i = 0; i < n; i++) { var c = rayCross(poly, ox, oy, 0.01 + i / n * 2 * Math.PI); mn = Math.min(mn, c); mx = Math.max(mx, c); sum += c; if (c % 2) odd++; }
        return { min: mn, max: mx, mean: sum / n, odd: odd, n: n };
    }
    /* 點 (x, y) 離「圓心」（指紋最中央，起點那一小段直線 seed）多遠 */
    function dSeedOf(seed, x, y) {
        var dd = Math.hypot(x - seed[0][0], y - seed[0][1]);
        for (var k = 0; k + 1 < seed.length; k++) dd = Math.min(dd, ptSeg([x, y], seed[k], seed[k + 1]));
        return dd;
    }
    /* 從 (ox, oy) 走直線到 (ex, ey)，穿過繩圈幾次（＝從螞蟻數到圓心要數的線） */
    function segCount(poly, ox, oy, ex, ey) {
        var c = 0, n = poly.length, o = [ox, oy], e = [ex, ey];
        for (var i = 0; i < n; i++) if (segCross(o, e, poly[i], poly[(i + 1) % n])) c++;
        return c;
    }
    /* 試著用一條中心線出題（makeLevel 用）：把螞蟻放在「圓心與最外圍的正中間」（往圓心要數 b 條線、往最近的外面要數 a 條線，b ÷ (a ＋ b) 落在 ANT_DEPTH），扭曲、平移、驗證；通過回傳題目，不通過回傳 null。
       strict：要求沒有捷徑（往各方向的射線至少穿過 needRay 條線）而且位置在正中間；tr：這是第幾次造繩子（記在題目的 tries 裡）。 */
    function tryLevel(sp, poly, tr, strict, level, v, a, needRay, rand) {
        var seed = sp.seed, cen = seed[Math.floor(seed.length / 2)], i, need = 0.4 * ANT_SIZE, rOut = 0;
        for (i = 0; i < poly.length; i++) rOut = Math.max(rOut, dSeedOf(seed, poly[i][0], poly[i][1]));     /* 最外圍：繩圈離圓心最遠的地方 */
        var lo = 0.2 * rOut, hi = 0.8 * rOut, ring = [];                                                    /* 先在「離圓心 20%～80%」的環狀範圍裡撒點（粗篩），再用線數精挑 */
        for (i = 0; i < sp.pts.length; i++) { var dr = dSeedOf(seed, sp.pts[i][0], sp.pts[i][1]); if (dr >= lo && dr <= hi) ring.push(i); }
        if (!ring.length) return null;
        /* 在環狀範圍裡隨機撒點：隨便挑一個在範圍內的中心線上的點，再往左右（垂直於繩子）偏一段，偏到帶子上、或縫裡；離線太近的不要。
           格子（segGrid）：只跟附近的線段比距離，比整條繩圈全部比一遍快很多 */
        var cell = 1, sg = segGrid(poly, cell), cands = [[], []], n = 0;
        function nearD(px, py) {                                                      /* 點 (px, py) 離繩圈最近的線多遠（只看附近 3×3 格） */
            var cx = Math.floor(px / cell), cy = Math.floor(py / cell), best = 1e9;
            for (var gx = cx - 1; gx <= cx + 1; gx++) for (var gy = cy - 1; gy <= cy + 1; gy++) {
                var l = sg.get(gx * 100003 + gy);
                if (!l) continue;
                for (var t = 0; t < l.length; t++) best = Math.min(best, ptSeg([px, py], poly[l[t]], poly[(l[t] + 1) % poly.length]));
            }
            return best;
        }
        while (n++ < 600 && (cands[0].length < 16 || cands[1].length < 16)) {
            var k = ring[Math.floor(rand() * ring.length)], c0 = sp.pts[k], a0 = sp.pts[Math.max(0, k - 1)], b0 = sp.pts[Math.min(sp.pts.length - 1, k + 1)];
            var tl = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1, off = (rand() * 2 - 1) * 0.6;
            var px = c0[0] - (b0[1] - a0[1]) / tl * off, py = c0[1] + (b0[0] - a0[0]) / tl * off, rr = dSeedOf(seed, px, py);
            if (rr < lo || rr > hi) continue;
            var dm = nearD(px, py);
            if (dm < need * 0.75) continue;
            cands[pointInPoly(px, py, poly) ? 1 : 0].push({ p: [px, py], d: dm });
        }
        /* 精挑：先試裡面或外面（各 50%，選不到再換另一邊）；每個候選位置算「往最近的外面要數幾條線 a（60 個方向裡最少的）」「往圓心要數幾條線 b」，
           要 a 夠多（沒有捷徑）、b ÷ (a ＋ b) 在 ANT_DEPTH 範圍內（正中間；容許誤差 0.04）才收下。同一條繩子最多試 10 個位置（比重新造一條便宜很多） */
        var ant = null, inside = false, first = rand() < 0.5 ? 1 : 0, side, pk;
        for (side = 0; side < 2 && !ant; side++) {
            var wi = side ? 1 - first : first, pool = kit.shuffle(cands[wi].filter(function (c) { return c.d >= need; }), rand).slice(0, strict ? 10 : 1);  /* kit.shuffle(陣列, rand)：隨機洗牌 */
            for (pk = 0; pk < pool.length && !ant; pk++) {
                var pc = pool[pk];
                if (strict) {
                    var ra = rayStats(poly, pc.p[0], pc.p[1], 60).min, rb = segCount(poly, pc.p[0], pc.p[1], cen[0], cen[1]), fr = rb / Math.max(1, ra + rb);
                    if (ra < needRay * 0.8 || fr < ANT_DEPTH[0] - 0.04 || fr > ANT_DEPTH[1] + 0.04) continue;
                }
                ant = pc; inside = wi === 1;
            }
        }
        if (!ant) return null;
        /* 扭曲：驗證「不自己交叉」「兩條線沒有黏在一起」「螞蟻的內外沒變」，不過就換一組參數（越後面的嘗試幅度越小，最後不扭曲） */
        for (var wi = 0; wi < 5; wi++) {                                             /* 同一條繩子最多換 5 組扭曲（比重新造一條便宜）：前 3 次用完整的幅度、第 4 次減半、最後一次不扭曲 */
            var amp = wi < 3 ? a : (wi < 4 ? a / 2 : 0), w = amp > 0 ? warpParams(amp, rand) : null;
            var wp = w ? poly.map(function (p) { return warpPoint(p[0], p[1], w); }) : poly, ap = w ? warpPoint(ant.p[0], ant.p[1], w) : ant.p;
            if (w && (selfCrosses(wp) || minGap(wp) < MIN_GAP * 0.6)) continue;
            if (pointInPoly(ap[0], ap[1], wp) !== inside) continue;
            /* 平移，讓螞蟻在原點（＝畫面正中央）；離繩子最近的那一段的方向，就是螞蟻的朝向（順著紋路，不會橫著壓到線） */
            var tp = wp.map(function (p) { return [p[0] - ap[0], p[1] - ap[1]]; }), bd = 1e9, bi = 0, ext = 0;
            for (i = 0; i < tp.length; i++) { var d2 = ptSeg([0, 0], tp[i], tp[(i + 1) % tp.length]); if (d2 < bd) { bd = d2; bi = i; } ext = Math.max(ext, Math.abs(tp[i][0]), Math.abs(tp[i][1])); }
            if (bd < 0.25 * ANT_SIZE) continue;
            var nb = tp[(bi + 1) % tp.length], deg = Math.atan2(nb[1] - tp[bi][1], nb[0] - tp[bi][0]) * 180 / Math.PI + (rand() < 0.5 ? 0 : 180);
            var rs = rayStats(tp, 0, 0, 120);
            if (rs.odd !== (inside ? rs.n : 0)) continue;                           /* 每一個方向數穿過幾條線：裡面都是奇數、外面都是偶數（不一致代表有方向剛好壓在頂點上，換一組） */
            var wc = w ? warpPoint(cen[0], cen[1], w) : cen, cp = [wc[0] - ap[0], wc[1] - ap[1]];     /* 圓心（起點直線的中間），扭曲、平移之後在哪裡 */
            var toC = segCount(tp, 0, 0, cp[0], cp[1]), dep = toC / Math.max(1, rs.min + toC);        /* 最後的圖形上，螞蟻在「圓心 → 最外面」的哪裡（扭曲之後線數可能差一兩條，所以容許誤差 0.1） */
            if (strict && (dep < ANT_DEPTH[0] - 0.1 || dep > ANT_DEPTH[1] + 0.1)) continue;
            var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
            tp.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
            var dnear = Math.min(-x0, x1, -y0, y1), viewR = Math.min(ext + 0.3, Math.max(dnear + VIEW_MARGIN, VIEW_FRAC * (ext + 0.3)));      /* 畫面的半邊長（圈距）：不比整個圖形大；也不比「最近的外面再多 VIEW_MARGIN」小 */
            return { K: sp.K, level: level, rope: tp, antXY: [0, 0], center: cp, toCenter: toC, depth: dep, ant: { inside: inside, deg: deg }, extent: ext + 0.3, viewR: viewR, dnear: dnear, revs: sp.revs, minRay: rs.min, meanRay: rs.mean, maxRay: rs.max, len: sp.len, seedLen: sp.seedLen, variance: v, warpA: amp, needRay: needRay, tries: tr + 1 };
        }
        return null;
    }
    /* 出一關：{ K（圈數）, rope（繩圈的封閉折線，螞蟻在原點 (0, 0)）, antXY（[0, 0]）, center（圓心＝起點直線的中間在哪裡）, toCenter（從螞蟻走直線到圓心，穿過幾條線）, depth（螞蟻在圓心 → 最外面的位置 ＝ toCenter ÷ (toCenter ＋ 往最近的外面最少穿過的線數 minRay)，約 0.5）, ant: { inside, deg（螞蟻朝哪個方向，順著附近的紋路）}, extent（折線離原點最遠多少）, viewR（畫面的半邊長，圈距；可能比 extent 小——遠的那一邊裁掉一點）, dnear（螞蟻離圖形最近一邊多遠）, revs（迴轉幾次）, minRay／meanRay／maxRay, len（繩子中心線的總長）, seedLen, variance, warpA, needRay（這一關要求的最少穿過幾條線）, tries, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var K = ringsFor(level), v = varianceFor(level), jitter = Math.min(0.45, v * 0.6), a = warpAFor(level), needRay = rayMinFor(level), best = null, tr;
        for (tr = 0; tr < 30; tr++) {
            var strict = tr < 20, sp = makeSpine(K, reverseFor(level), jitter, rand);
            if (!sp) continue;
            var poly = ropePolygon(sp.pts, sp.hw);
            if (selfCrosses(poly) || minGap(poly) < MIN_GAP) continue;
            var cand = tryLevel(sp, poly, tr, strict, level, v, a, needRay, rand);
            if (!cand) continue;
            if (!best || cand.minRay > best.minRay) best = cand;                      /* 沒有捷徑（射線穿過的線最少的那個方向越多越好）才收下；不夠好就再造一個，最後取最好的 */
            if (strict && cand.minRay >= needRay) break;
        }
        for (tr = 30; !best && tr < 60; tr++) {                                      /* 30 次都失敗（幾乎不可能）：用最簡單、不扭曲、不迴轉的螺旋 */
            var sp0 = plainSpiral(K), poly0 = ropePolygon(sp0.pts, sp0.hw);
            best = tryLevel(sp0, poly0, 26, false, level, v, a, needRay, rand);
            if (best) best.tries = tr + 1;
        }
        return best;
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '指紋專家！';
        if (n >= 15) return '眼力很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '從螞蟻往外畫一條線，一條一條數穿過繩子幾次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'inout-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 螞蟻（SVG）：三節身體、六隻腳、兩根觸角；中心在 (x, y)、大小 s、朝向 deg 度 */
    function drawAnt(parent, x, y, s, deg) {
        var g = kit.svg('g', { 'class': 'inout-ant', transform: 'translate(' + x + ',' + y + ') rotate(' + deg + ')' }, parent);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        [-1, 0, 1].forEach(function (k) {
            kit.svg('line', { 'class': 'inout-ant__leg', x1: k * s * 0.12, y1: 0, x2: k * s * 0.3, y2: -s * 0.4 }, g);
            kit.svg('line', { 'class': 'inout-ant__leg', x1: k * s * 0.12, y1: 0, x2: k * s * 0.3, y2: s * 0.4 }, g);
        });
        kit.svg('line', { 'class': 'inout-ant__leg', x1: s * 0.42, y1: 0, x2: s * 0.62, y2: -s * 0.2 }, g);
        kit.svg('line', { 'class': 'inout-ant__leg', x1: s * 0.42, y1: 0, x2: s * 0.62, y2: s * 0.2 }, g);
        kit.svg('ellipse', { 'class': 'inout-ant__body', cx: -s * 0.3, cy: 0, rx: s * 0.22, ry: s * 0.17 }, g);
        kit.svg('ellipse', { 'class': 'inout-ant__body', cx: 0, cy: 0, rx: s * 0.14, ry: s * 0.11 }, g);
        kit.svg('circle', { 'class': 'inout-ant__body', cx: s * 0.28, cy: 0, r: s * 0.13 }, g);
        return g;
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[圈內圈外] 第 ' + level + ' 關：指紋 ' + q.K + ' 圈、迴轉 ' + q.revs + ' 次、繩長 ' + q.len.toFixed(1) + '；螞蟻在畫面正中央（在圓心到最外面的 ' + (q.depth * 100).toFixed(0) + '% 處，往圓心數 ' + q.toCenter + ' 條線、往外數最少 ' + q.minRay + ' 條）、在繩圈' + (q.ant.inside ? '裡面' : '外面') + '；往各方向穿過 ' + q.minRay + '～' + q.maxRay + ' 條線（平均 ' + q.meanRay.toFixed(1) + '）；限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, BS = Math.floor(Math.min(W - 16, H - 220)), bx = Math.round((W - BS) / 2), by = 62;
        var u = (BS / 2 - 3) / q.viewR;                 /* 每個「圈距」是幾 px：畫面的半邊長剛好是 q.viewR 個圈距（螞蟻在正中央；離螞蟻很遠的那一邊可能被裁掉一點，svg 外面的部分不會顯示） */
        var field = h('div', { 'class': 'inout-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        field.appendChild(h('div', { 'class': 'qz-note inout-tip', text: '螞蟻在繩圈的裡面還是外面？' }));
        var svg = kit.svg('svg', { 'class': 'inout-svg', viewBox: '0 0 ' + BS + ' ' + BS, width: BS, height: BS }, field);
        svg.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;';
        var d = polyPath(q.rope, u, BS / 2, BS / 2);                                 /* 指紋繩圈 */
        var fill = kit.svg('path', { 'class': 'inout-fill', d: d }, svg);              /* 揭曉時才顯示的「裡面」淡綠色 */
        var rope = kit.svg('path', { 'class': 'inout-rope', d: d }, svg);
        rope.style.strokeWidth = String(Math.max(1.3, Math.min(5, u * 0.16)));       /* 線的粗細跟著紋路的疏密走（紋路越密、線越細） */
        drawAnt(svg, BS / 2, BS / 2, u * ANT_SIZE, q.ant.deg);
        var info = h('div', { 'class': 'qz-note inout-info', text: '' });
        info.style.top = (by + BS + 6) + 'px';
        field.appendChild(info);
        var done = false;
        var grid = kit.btnGrid(field, [                 /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
            { text: '裡面', kind: 'line', cls: 'inout-btn', onTap: function () { judge(true); } },
            { text: '外面', kind: 'line', cls: 'inout-btn', onTap: function () { judge(false); } }
        ], { cols: 2, h: 100, gap: 12 });
        api.timer(timeMs(level), function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('inout.hint')) kit.hintOn(stage, grid.btns[q.ant.inside ? 0 : 1], { mode: 'tap', delay: 700, text: '請點「裡面」或「外面」' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(inside) {
            if (done || api.over) return;
            done = true;
            var ok = inside === q.ant.inside;
            fill.classList.add('inout-fill--show');     /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            grid.btns[q.ant.inside ? 0 : 1].classList.add('inout-btn--ok');
            if (inside !== null && !ok) grid.btns[inside ? 0 : 1].classList.add('inout-btn--bad');
            info.textContent = '螞蟻在繩圈' + (q.ant.inside ? '裡面' : '外面') + (ok ? '，答對了！' : (inside === null ? '（時間到）' : '，答錯了'));  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            kit.flash(stage, ok, api.my);               /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            if (ok) { api.pass({ delay: 1500 }); return; }  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
            api.fail({ delay: 3000, lines: [inside === null ? '時間到！' : '答錯了', '螞蟻在繩圈' + (q.ant.inside ? '裡面' : '外面') + '（綠色的是繩圈裡面）'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.ant.inside); };
        api.wrong = function () { judge(!q.ant.inside); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '圈內圈外',
        rule: '一條首尾相連、不會自己交叉的紅色繩圈，繞成**指紋似的螺旋紋**，畫面正中央有一隻螞蟻。**螞蟻在繩圈的裡面還是外面？** 點「裡面」或「外面」。紋路一圈貼著一圈往外繞，而且**會突然掉頭、往反方向繞**，螞蟻在圓心與最外圍的正中間，找不到捷徑，要**從螞蟻開始，一條一條數穿過幾條線**——奇數條在裡面、偶數條在外面。答錯或來不及就結束，看你能過幾關。越後面，紋路越密、圈數越多、時間越短！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            ringsFor: ringsFor, reverseFor: reverseFor, rayMinFor: rayMinFor, timeMs: timeMs, varianceFor: varianceFor, warpAFor: warpAFor, smooth: smooth, makeSpine: makeSpine, plainSpiral: plainSpiral, smoothNoise: smoothNoise, ropePolygon: ropePolygon, warpParams: warpParams, warpPoint: warpPoint, segCross: segCross, selfCrosses: selfCrosses, ptSeg: ptSeg, minGap: minGap, polyPath: polyPath, pointInPoly: pointInPoly, rayCross: rayCross, rayStats: rayStats, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, RINGS: RINGS, REVERSE_P: REVERSE_P, VIEW_FRAC: VIEW_FRAC, VIEW_MARGIN: VIEW_MARGIN, TIME_S: TIME_S, VARIANCE: VARIANCE, WARP_A: WARP_A, ANT_SIZE: ANT_SIZE, STRIP_W: STRIP_W, SEED_LEN: SEED_LEN, ANT_DEPTH: ANT_DEPTH, dSeedOf: dSeedOf, segCount: segCount, RAY_MIN: RAY_MIN, FOLLOW_GAIN: FOLLOW_GAIN, MAX_TURN: MAX_TURN, SKIP_ARC: SKIP_ARC, MIN_GAP: MIN_GAP, STEP: STEP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
