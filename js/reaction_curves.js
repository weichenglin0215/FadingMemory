/* ═══════════════════════════════════════════════════════════════════
   reaction_curves.js — 秒反應・誰先到？
   樣式：css/games/reaction_curves.css（這款專屬的 class 一律以「curves-」開頭；共用元件在 css/reaction_common.css）
   黑色畫面，左右各一條從上到下的「尋寶路線」繩子，判斷哪一條比較短。按下按鈕後，兩顆球用
   一樣的速度沿著繩子滑下來，看誰先到。
   ───────────────────────────────────────────────────────────────────
   · 繩子像在紙上畫出來的尋寶路線圖：起點在自己那一半畫面的上方中間、終點在下方中間（兩條一樣），中間經過
     k 個「轉折點」。轉折點的左右位置差異很大（相鄰兩點至少隔 MIN_SWING 倍的半幅寬，而且大小不一、
     不會對齊），上下位置也故意打亂（YJIT 倍的間距），所以路線會往回、往上走。每條繩子只在自己那一半，
     不會跨到另一半。
   · 轉折點之間用 Catmull-Rom 曲線連起來（每 3px 取一點，記錄累積弧長）。
   · 路徑不能重疊（validRope）：整條都在自己的半邊裡，而且「弧長相隔超過 SEP_PX 的兩點」距離都要 ≥ CLEAR_PX，
     所以不會自己交叉、也不會貼得太近（用格子雜湊檢查，O(n)）。
   · 長度差（長的比短的多幾 %）：第 1 關 30%，每關少 3%，最低 3%（diffFor）。做法：先隨機做出短的那條，
     再做出長的那條的形狀，只把它的「左右伸展倍率 α」用二分搜尋調到
     L_長 = L_短 × (1 + 差)——所以每一關的差距是精確的，不是大概。
   · 越後面轉折點越多（k 由 K_START 線性增加到 K_END）、上下打亂越兇；還會刻意讓「比較短的那條轉折比較多」
     （視覺陷阱，機率隨關卡線性上升）。
   · 第 DASH_FROM 關起畫成虛線：白色底線上疊紅色虛線，左右兩條的「紅段／白段」長度明顯不同，
     沒辦法靠數虛線段數來比長度。
   · V1.43.0 玩家意見：
       ① **曲線儘量靠近左右兩側的邊緣、而且可以往上繞**（以前只是在中間左右扭動，很單調）：轉折點離中線至少 U_MIN（0.5）倍半幅寬
         （以前 0.4）、短的那條的左右伸展倍率 ALPHA_SHORT（0.9～1.0，以前 0.8～0.98）、轉折點可以伸到半幅寬的 CTRL_FRAC（0.96，以前 0.86）、
         相鄰兩點的左右距離至少 MIN_SWING（0.9 倍半幅寬）、上下打亂幅度 YJIT（1.0 → 1.5，以前 0.8 → 1.3；超過 1 就會往回走、往上繞）。
         實測左右伸展約 143px（以前約 115px，半邊最多 190px）。
       ② **左右兩條虛線的紅白間距要接近**（以前一條 6／6、另一條 34／20，差太多，沒有誤導的作用）：兩條的虛線週期（紅段＋白段）
         只差在「週期 × 長度」讓兩條的虛線**段數幾乎一樣**——長的那條週期乘上 長度比 × (1＋隨機 −4%～＋6%)，所以靠數紅白段數猜不出誰比較短
         （段數差距比長度差距小，有時段數還是短的那條比較多），見 dashFor。
   · 球的位置＝沿繩子走過的弧長（兩顆球速度相同），所以短的先到。速度預設 BALL_SPEED px/s，繩子太長時
     加快到「短的那條在 TRAVEL_MAX_S 秒內到」。判定在按按鈕的瞬間就決定了（比較兩條繩子的長度）。
   · 揭曉：短的那顆球一抵達終點，**長的那條繩子上的球立刻停在原地**（弧長相同，所以停的位置就是「還差多少」），
     並把長繩子「還沒走完的那一段」用橘色標出來、那條的終點圈閃動。如果這一段很短（長度差小），鏡頭（SVG 的 viewBox）會
     慢慢放大到只框住「停住的球＋剩下的路＋終點」（zoomCamera），讓玩家看清楚球離終點還有多遠；差距夠大就不放大。
   · 答錯就結束，成績＝過幾關；失敗後可以從「失敗關卡 − 5」繼續。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'curves';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 curves 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 200 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 長度差（%）：第 1 關 30%，每關少 3%，最低 3% */
    var DIFF_START = 30, DIFF_STEP = 3, DIFF_MIN = 3;     /* 長度差（%）：30、27、24 … 3，之後維持 3 */
    /* 轉折點數量隨關卡增加 */
    var K_START = 3, K_END = 7, K_RAMP = 12;              /* 轉折點的數量 */
    /* 轉折點上下打亂的幅度（>1 時路線會往回走） */
    var YJIT_START = 1.0, YJIT_END = 1.5;               /* 轉折點上下打亂的幅度（倍的間距，> 1 就會往回走）*/
    var MIN_SWING = 0.9;                                  /* 相鄰兩個轉折點的左右距離，至少是半幅寬的幾倍 */
    var TRAP_END = 0.7;                                   /* 「短的那條轉折比較多」的機率（線性上升到這個） */
    /* 第 4 關起畫成虛線（無法靠數段數比長度） */
    var DASH_FROM = 4;                                    /* 第幾關起是虛線 */
    /* 球的速度下限；繩子太長時會加快，讓短的那條在 5 秒內到 */
    var BALL_SPEED = 230;                                 /* 球的速度（px/秒）下限 */
    var TRAVEL_MAX_S = 5;                                 /* 短的那條最多滑幾秒（繩子太長就加快）*/
    var VW = 468;                                         /* SVG 寬 */
    var PAD_TOP = 36, PAD_BOT = 36;                 /* PAD_TOP：曲線區上緣的留白（px）；PAD_BOT：下緣的留白（px） */
    var SIDE_PAD = 22;                                    /* 繩子離自己那半邊的左右邊緣至少這麼遠 */
    var STEP_PX = 3;                                      /* 取樣間隔 */
    /* 路徑不重疊：弧長相隔超過 SEP_PX 的兩點，距離要 ≥ CLEAR_PX */
    var CLEAR_PX = 24, SEP_PX = 70;                       /* 路徑不重疊：弧長相隔 > SEP_PX 的兩點距離 ≥ CLEAR_PX */
    var ALPHA_MIN = 0.2;                            /* 長的那條曲線的左右伸展倍率（alpha）最小值（短的那條用 ALPHA_SHORT） */
    var U_MIN = 0.5;                                      /* 轉折點的左右位置至少離中線半幅寬的幾成（V1.43.0：0.4 → 0.5，靠近兩側邊緣） */
    var ALPHA_SHORT = [0.9, 1.0];                         /* 短的那條的左右伸展倍率範圍（V1.43.0：0.8～0.98 → 0.9～1.0，幾乎貼到邊） */
    var DASH_PERIODS = [14, 18, 24];                      /* 虛線的基本週期（紅段＋白段，px）：短的那條用它 */
    var DASH_JITTER = [-0.04, 0.06];                      /* 長的那條週期 ＝ 基本週期 × 長度比 × (1 ＋ 這個範圍的亂數)：段數只差幾 % */
    var DASH_RED = 0.55;                                  /* 紅段佔一個週期的比例 */
    /* 揭曉時的鏡頭放大：長繩子「球停住之後還沒走完的那一段」的長度（弧長）不超過 ZOOM_REST_MAX px（差距很小）才放大；
       放大的框是那一段路的外框（加 ZOOM_PAD 的邊），倍率至少 ZOOM_MIN（不到就不動）、最多 ZOOM_MAX 倍，花 ZOOM_MS 毫秒 */
    var ZOOM_REST_MAX = 140, ZOOM_MIN = 1.35, ZOOM_MAX = 4.5, ZOOM_PAD = 44, ZOOM_MS = 900;
    var CTRL_FRAC = 0.96;                                 /* 轉折點最多伸到半幅寬的這個比例（曲線過彎時會稍微衝出去，要留空間）*/

    /* 這一關的長度差 */
    function diffFor(level) { return Math.max(DIFF_MIN, DIFF_START - (level - 1) * DIFF_STEP); }
    /* 這一關的轉折點基本數量 */
    function kBase(level) { return Math.round(kit.ramp(level, K_START, K_END, K_RAMP)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 這一關的上下打亂幅度 */
    function yjitFor(level) { return kit.ramp(level, YJIT_START, YJIT_END, K_RAMP); }
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 點到線段的距離（先把點投影到線段上，再算兩點距離） */
    /* 點 p 到線段 q-r 的距離 */
    function ptSeg(p, q, r) {
        var dx = r.x - q.x, dy = r.y - q.y, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((p.x - q.x) * dx + (p.y - q.y) * dy) / l2)) : 0;
        var ex = q.x + t * dx - p.x, ey = q.y + t * dy - p.y; return Math.sqrt(ex * ex + ey * ey);  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
    }
    /* 兩條線段之間的最短距離；若相交就是 0（ccw 判斷三點的轉向，轉向相異即表示相交） */
    /* 兩條線段（a-b、c-d）之間的最短距離 */
    function segDist(a, b, c, d) {
        var pd = ptSeg;
        function ccw(p, q, r) { return (r.y - p.y) * (q.x - p.x) > (q.y - p.y) * (r.x - p.x); }
        if (ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)) return 0;      /* 相交 */
        return Math.min(pd(a, c, d), pd(b, c, d), pd(c, a, b), pd(d, a, b));
    }
    /* 轉折點連成的折線（含起點終點）有沒有自己交叉或靠太近 */
    /* 轉折點連成的折線（含起點終點）有沒有自己交叉／靠太近。dims＝{halfW, h}（畫面像素）；alpha＝左右伸展倍率 */
    function polyOk(shape, alpha, dims) {
        var P = [{ x: 0, y: 0 }];
        shape.forEach(function (p) { P.push({ x: p.u * alpha * dims.halfW * CTRL_FRAC, y: p.v * dims.h }); });  /* forEach：對陣列的每個元素各做一次 */
        P.push({ x: 0, y: dims.h });
        var need = CLEAR_PX * 1.25;
        for (var i = 0; i + 1 < P.length; i++) for (var j = i + 2; j + 1 < P.length; j++) {
            if (segDist(P[i], P[i + 1], P[j], P[j + 1]) < need) return false;
        }
        /* 連續三個轉折點不能折成太尖的髮夾彎（兩條邊會貼在一起）*/
        for (var t = 0; t + 2 < P.length; t++) {
            if (ptSeg(P[t], P[t + 1], P[t + 2]) < CLEAR_PX || ptSeg(P[t + 2], P[t], P[t + 1]) < CLEAR_PX) return false;
        }
        return true;
    }
    /* 產生一條繩子的形狀：k 個轉折點（u 左右位置 −1～1、v 上下位置 0～1），一個一個加上去，每次檢查折線是否交叉；做不出來回傳 null */
    /* 一條繩子的形狀：k 個轉折點，u＝左右位置（−1～1，相對半幅寬）、v＝上下位置（0～1）。
       轉折點是一個一個加上去的，連成的折線不能交叉、不能靠太近；做不出來回傳 null。 */
    function makeShape(k, yjit, rand, dims) {
        rand = rand || Math.random;
        dims = dims || { halfW: 95, h: 460 };
        var box = { x0: -dims.halfW, x1: dims.halfW, y0: 0, y1: dims.h };
        for (var attempt = 0; attempt < 60; attempt++) {
            var pts = [], spacing = 1 / (k + 1), prevU = 0, side = rand() < 0.5 ? -1 : 1, fail = false;
            for (var i = 1; i <= k && !fail; i++) {
                var placed = false;
                for (var tries = 0; tries < 40 && !placed; tries++) {
                    var v = kit.clamp(i * spacing + (rand() * 2 - 1) * yjit * spacing, 0.03, 0.97);  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
                    if (rand() < 0.85) side = -side;                           /* 大多左右交替，偶爾連續同一邊 */
                    var u = side * kit.randFloat(U_MIN, 1, rand);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
                    if (i > 1 && Math.abs(u - prevU) < MIN_SWING) continue;  /* Math.abs：取絕對值（去掉負號） */
                    pts.push({ u: u, v: v });
                    if (polyOk(pts, 0.75, dims)) { placed = true; prevU = u; } else pts.pop();
                }
                if (!placed) fail = true;
            }
            /* 折線過關之後，再檢查真正畫出來的曲線（曲線會把轉角削圓、稍微衝出去）*/
            if (!fail && polyOk(pts, 0.75, dims) && validRope(buildPath(pts, 0.85, 0, dims.halfW, 0, dims.h), box)) return pts;
        }
        return null;
    }
    /* 把轉折點用 Catmull-Rom 曲線連成平滑曲線，每 3px 取一點，並記錄累積弧長 s */
    /* 取樣：shape（上面的轉折點）＋ α（左右伸展倍率）→ 折線點 [{x,y,s}]，s＝累積弧長 */
    function buildPath(shape, alpha, cx, halfW, y0, y1) {
        var ctrl = [{ x: cx, y: y0 }];
        shape.forEach(function (p) { ctrl.push({ x: cx + p.u * alpha * halfW * CTRL_FRAC, y: y0 + p.v * (y1 - y0) }); });
        ctrl.push({ x: cx, y: y1 });
        var pts = [], s = 0, n = ctrl.length;
        function at(i) { return ctrl[Math.max(0, Math.min(n - 1, i))]; }
        for (var i = 0; i < n - 1; i++) {
            var p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
            /* 曲線取樣點數只看「伸展倍率 1」時的弦長，不隨 α 改變——這樣曲線總長度對 α 是連續的，二分搜尋才能精確命中 */
            /* 每一段取幾個點只看「伸展倍率 1」時的弦長，不隨 α 改變，這樣曲線長度對 α 是連續的，二分搜尋才能精確命中 */
            var q1 = shape[i - 1] || { u: 0, v: i === 0 ? 0 : 1 }, q2 = shape[i] || { u: 0, v: 1 };
            var dx1 = (q2.u - q1.u) * halfW * CTRL_FRAC, dy1 = (q2.v - q1.v) * (y1 - y0);
            var m = Math.max(2, Math.ceil(Math.sqrt(dx1 * dx1 + dy1 * dy1) / STEP_PX));  /* Math.ceil：無條件進位成整數 */
            for (var j = (i === 0 ? 0 : 1); j <= m; j++) {
                var t = j / m, t2 = t * t, t3 = t2 * t;
                /* Catmull-Rom 曲線公式：用四個相鄰控制點算出段內位置 */
                var x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
                var y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
                if (pts.length) { var q = pts[pts.length - 1]; s += Math.sqrt((x - q.x) * (x - q.x) + (y - q.y) * (y - q.y)); }
                pts.push({ x: x, y: y, s: s });
            }
        }
        return pts;
    }
    function pathLen(pts) { return pts[pts.length - 1].s; }
    /* 二分搜尋左右伸展倍率 α，讓路線長度剛好等於目標長度；超出範圍回傳 null */
    /* 二分搜尋 α，讓長度等於 target；超出範圍回傳 null */
    function solveAlpha(shape, cx, halfW, y0, y1, target) {
        var lo = ALPHA_MIN, hi = 1;
        if (pathLen(buildPath(shape, hi, cx, halfW, y0, y1)) < target || pathLen(buildPath(shape, lo, cx, halfW, y0, y1)) > target) return null;
        for (var i = 0; i < 42; i++) {
            var mid = (lo + hi) / 2;
            if (pathLen(buildPath(shape, mid, cx, halfW, y0, y1)) < target) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    }
    /* 檢查路徑有沒有重疊、有沒有跑出自己那半邊：用「格子雜湊」把點分到格子裡，只比較相鄰格子的點，比逐一比較快很多 */
    /* 路徑不重疊、不出自己的半邊：回傳 true／false（用格子雜湊，O(n)）*/
    function validRope(pts, box) {
        var cell = CLEAR_PX, grid = {}, i;
        for (i = 0; i < pts.length; i++) {
            var p = pts[i];
            if (p.x < box.x0 || p.x > box.x1 || p.y < box.y0 - 1e-6 || p.y > box.y1 + 1e-6) return false;
            var gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell), key = gx + ',' + gy;  /* Math.floor：無條件捨去成整數 */
            (grid[key] = grid[key] || []).push(i);
        }
        for (i = 0; i < pts.length; i++) {
            var q = pts[i], cx = Math.floor(q.x / cell), cy = Math.floor(q.y / cell);
            for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
                var arr = grid[(cx + dx) + ',' + (cy + dy)];
                if (!arr) continue;
                for (var a = 0; a < arr.length; a++) {
                    var j = arr[a]; if (j <= i) continue;
                    if (pts[j].s - q.s <= SEP_PX) continue;
                    var ddx = pts[j].x - q.x, ddy = pts[j].y - q.y;
                    if (ddx * ddx + ddy * ddy < CLEAR_PX * CLEAR_PX) return false;
                }
            }
        }
        return true;
    }
    /* 產生一關：先做短的那條，再做長的那條的形狀，用 α 調整成剛好長 (1+差) 倍，所以每關的長度差是精確的 */
    /* 產生一關：回傳 { shortSide, d, y0, y1, L:{pts,len,k,alpha,cx}, R:{…}, ratio, speed }；H 是畫面高度、W 是畫面寬度 */
    function makeLevel(level, H, rand, W) {
        rand = rand || Math.random;
        var VWd = W || VW, halfW = VWd / 4 - SIDE_PAD;
        var d = diffFor(level) / 100, y0 = PAD_TOP, y1 = H - PAD_BOT;
        var kb = kBase(level), yj = yjitFor(level), trap = kit.ramp(level, 0, TRAP_END, K_RAMP);
        var shortSide = rand() < 0.5 ? 'L' : 'R';
        var cxS = shortSide === 'L' ? VWd * 0.25 : VWd * 0.75, cxL = shortSide === 'L' ? VWd * 0.75 : VWd * 0.25;
        var dims = { halfW: halfW, h: y1 - y0 };
        var boxOf = function (cx) { return { x0: cx - halfW - 1e-6, x1: cx + halfW + 1e-6, y0: y0, y1: y1 }; };
        /* 最多嘗試 1500 次 */
        for (var tries = 0; tries < 1500; tries++) {
            /* isTrap：視覺陷阱——故意讓「較短的那條」轉折比較多 */
            var isTrap = rand() < trap;
            var kS = Math.max(2, kb + (isTrap ? kit.randInt(1, 2, rand) : kit.randInt(-1, 1, rand)));  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            var kL = Math.max(2, kb + (isTrap ? -kit.randInt(1, 2, rand) : kit.randInt(-1, 1, rand)));
            var shS = makeShape(kS, yj, rand, dims), shL = makeShape(kL, yj, rand, dims);
            if (!shS || !shL) continue;
            var aS = kit.randFloat(ALPHA_SHORT[0], ALPHA_SHORT[1], rand);
            var ptsS = buildPath(shS, aS, cxS, halfW, y0, y1);
            if (!validRope(ptsS, boxOf(cxS))) continue;
            var lenS = pathLen(ptsS);
            var aL = solveAlpha(shL, cxL, halfW, y0, y1, lenS * (1 + d));
            if (aL == null) continue;
            var ptsL = buildPath(shL, aL, cxL, halfW, y0, y1);
            if (!validRope(ptsL, boxOf(cxL))) continue;
            var lenL = pathLen(ptsL);
            var S = { pts: ptsS, len: lenS, k: kS, alpha: aS, cx: cxS }, Lg = { pts: ptsL, len: lenL, k: kL, alpha: aL, cx: cxL };
            return { shortSide: shortSide, d: d, y0: y0, y1: y1, L: shortSide === 'L' ? S : Lg, R: shortSide === 'L' ? Lg : S, ratio: lenL / lenS, speed: speedFor(lenS), tries: tries };
        }
        return null;
    }
    /* 球的速度（px／秒） */
    function speedFor(shortLen) { return Math.max(BALL_SPEED, shortLen / TRAVEL_MAX_S); }
    /* 虛線的紅段／白段長度（V1.43.0 玩家意見）：左右兩條的週期（紅＋白）要接近，讓玩家沒辦法靠紅白間距或段數猜哪條短。
       做法：短的那條用基本週期 P（從 DASH_PERIODS 挑）；長的那條週期＝P × 長度比 × (1 ＋ δ)，δ 在 DASH_JITTER 範圍亂數，
       所以兩條的「段數」（長度 ÷ 週期）幾乎一樣，只差 δ（有時長的那條段數反而比較少）。紅段佔週期的 DASH_RED 比例。
       lenL、lenR＝左右兩條的長度；沒給長度就當作一樣長（只有紅白間距稍微不同）。回傳 { L:[紅,白], R:[紅,白] } */
    function dashFor(rand, lenL, lenR) {
        rand = rand || Math.random;
        var P = kit.pick(DASH_PERIODS, rand), lL = lenL || 1, lR = lenR || 1;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        var shortIsL = lL <= lR, ratio = Math.max(lL, lR) / Math.min(lL, lR);
        var pS = P, pLong = P * ratio * (1 + kit.randFloat(DASH_JITTER[0], DASH_JITTER[1], rand));
        function seg(p) { var red = Math.max(2, Math.round(p * DASH_RED * 10) / 10); return [red, Math.max(2, Math.round((p - red) * 10) / 10)]; }  /* Math.round：四捨五入成整數 */
        return shortIsL ? { L: seg(pS), R: seg(pLong) } : { L: seg(pLong), R: seg(pS) };
    }
    /* 要不要放大鏡頭：剩下那一段路的長度（弧長）夠短（差距很小）才放大；差距大就一眼看得出來，不用放大 */
    function needZoom(restLen) { return restLen <= ZOOM_REST_MAX; }
    /* 鏡頭放大：pts 是「長繩子還沒走完的那一段」的點（含停住的球與終點），W×H 是場地大小。
       回傳 { zoom, box:{vx,vy,vw,vh} }（box 跟場地同寬高比、框住這段路外加 ZOOM_PAD 的邊、不超出場地）；放大倍率不到 ZOOM_MIN 就回傳 null（不用放大）。
       做法：算出這段路的外框 → 加邊 → 倍率＝min(W÷外框寬, H÷外框高)（最多 ZOOM_MAX）→ 以外框中心為中心取 W÷倍率 × H÷倍率 的框，再夾進 [0,W]×[0,H]。 */
    function zoomCamera(pts, W, H) {
        var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        pts.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
        var bw = x1 - x0 + 2 * ZOOM_PAD, bh = y1 - y0 + 2 * ZOOM_PAD;
        var z = Math.min(ZOOM_MAX, W / bw, H / bh);
        if (z < ZOOM_MIN) return null;
        var vw = W / z, vh = H / z, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        var vx = kit.clamp(cx - vw / 2, 0, W - vw), vy = kit.clamp(cy - vh / 2, 0, H - vh);
        return { zoom: z, box: { vx: vx, vy: vy, vw: vw, vh: vh } };
    }
    /* 長繩子「還沒走完的那一段」：從弧長 s0（球停住的位置）到終點的所有點（第一個點是球停的位置） */
    function restPoints(pts, s0) {
        var out = [pointAt(pts, s0)];
        for (var i = 0; i < pts.length; i++) if (pts[i].s > s0) out.push(pts[i]);
        return out;
    }
    /* 弧長 s 對應的位置（二分搜尋，再線性內插） */
    /* 弧長 s 對應的位置（二分搜尋） */
    function pointAt(pts, s) {
        if (s <= 0) return pts[0];
        var last = pts[pts.length - 1];
        if (s >= last.s) return last;
        var lo = 0, hi = pts.length - 1;
        while (hi - lo > 1) { var m = (lo + hi) >> 1; if (pts[m].s <= s) lo = m; else hi = m; }
        var a = pts[lo], b = pts[hi], t = (s - a.s) / Math.max(1e-9, b.s - a.s);
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: s };
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* Rd 是這一局的計時器管家 */
        var Rd = null;

        /* start：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局（失敗後可從前 5 關繼續） */
        function round(start) {
            if (Rd) Rd.dispose();
            Rd = kit.round();
            var my = Rd;
            root.innerHTML = '';                        /* innerHTML = ''：把元素裡面的東西全部清掉 */
            /* 替整個畫面加上黑底 class（樣式在 css/games/reaction_curves.css 的 .curves-bg） */
            root.classList.add('curves-bg');            /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            my.onDispose(function () { root.classList.remove('curves-bg'); });
            var level = start || 1, cleared = level - 1, newRec = false, state = 'idle';

            /* 建立畫面元素：標題、場地、橫幅、左右兩顆選擇按鈕 */
            var head = h('div', { 'class': 'curves-head' });
            var field = h('div', { 'class': 'curves-field' });
            var banner = h('div', { 'class': 'curves-banner' });
            var btns = h('div', { 'class': 'curves-btns' });
            var bL = h('button', { 'class': 'curves-btn', text: '左邊比較短' });
            var bR = h('button', { 'class': 'curves-btn', text: '右邊比較短' });
            btns.appendChild(bL); btns.appendChild(bR); /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
            field.appendChild(banner);
            root.appendChild(head);
            root.appendChild(field);
            root.appendChild(btns);

            var Lv = null, svg = null, balls = null, ptsL = null, ptsR = null, fw = 0, fh = 0, ends = null;

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))])); }  /* Reaction.getBest／setBest：讀／寫這款遊戲的個人最佳紀錄（存在手機的 localStorage） */

            /* 出下一關：產生左右兩條繩子並畫出來（有虛線就畫白底線疊紅色虛線） */
            function nextLevel() {
                if (my.dead) return;
                var H = field.clientHeight, W = field.clientWidth;
                fw = W; fh = H;
                Lv = null;
                for (var att = 0; att < 40 && !Lv; att++) Lv = makeLevel(level, H, null, W);
                if (!Lv) throw new Error('curves: cannot build a level');
                state = 'pick';
                banner.textContent = ''; banner.className = 'curves-banner';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                field.classList.remove('curves-field--zoom');
                head.textContent = '第 ' + level + ' 關　哪一條比較短？';
                meta();
                field.querySelectorAll('svg').forEach(function (s) { s.remove(); });  /* querySelector：用 CSS 選擇器在網頁裡找元素 */
                svg = kit.svg('svg', { 'class': 'curves-svg', viewBox: '0 0 ' + W + ' ' + H }, field);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
                ptsL = Lv.L.pts; ptsR = Lv.R.pts;
                var dash = level >= DASH_FROM ? dashFor(null, Lv.L.len, Lv.R.len) : null;
                [[ptsL, 'L'], [ptsR, 'R']].forEach(function (pr) {
                    var d = pr[0].map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
                    if (dash) {
                        kit.svg('path', { 'class': 'curves-line curves-line--white', d: d }, svg);
                        kit.svg('path', { 'class': 'curves-line curves-line--red', d: d, 'stroke-dasharray': dash[pr[1]][0] + ' ' + dash[pr[1]][1] }, svg);
                    } else {
                        kit.svg('path', { 'class': 'curves-line curves-line--solid', d: d }, svg);
                    }
                });
                ends = [];
                [ptsL, ptsR].forEach(function (pts) {
                    kit.svg('circle', { 'class': 'curves-start', cx: pts[0].x, cy: pts[0].y, r: 7 }, svg);
                    ends.push(kit.svg('circle', { 'class': 'curves-end', cx: pts[pts.length - 1].x, cy: pts[pts.length - 1].y, r: 7 }, svg));
                });
                balls = [kit.svg('circle', { 'class': 'curves-ball', r: 13, cx: ptsL[0].x, cy: ptsL[0].y }, svg), kit.svg('circle', { 'class': 'curves-ball', r: 13, cx: ptsR[0].x, cy: ptsR[0].y }, svg)];
                bL.disabled = bR.disabled = false;
                bL.className = bR.className = 'curves-btn';
                /* 主控台印出這關的實際長度、轉折點數、答案，方便驗證 */
                try {
                    console.info('[誰先到？] 第 ' + level + ' 關 長度差 ' + (Lv.d * 100).toFixed(0) + '%：左 ' + Lv.L.len.toFixed(1) + ' px（' + Lv.L.k + ' 個轉折點、伸展 ' + Lv.L.alpha.toFixed(2) + '）／右 ' + Lv.R.len.toFixed(1) + ' px（' + Lv.R.k + ' 個轉折點、伸展 ' + Lv.R.alpha.toFixed(2) + '）→ ' +
                        (Lv.shortSide === 'L' ? '左' : '右') + '邊比較短，長/短 = ' + Lv.ratio.toFixed(4) + (dash ? '；虛線 左 ' + dash.L.join('/') + '、右 ' + dash.R.join('/') : '；實線'));
                } catch (e) { }
            }

            /* 玩家選了哪一邊比較短：兩顆球用同樣的速度沿著繩子滑下去，先到的那顆一到就公布結果 */
            function choose(side) {
                if (state !== 'pick') return;
                state = 'run';
                bL.disabled = bR.disabled = true;
                var ok = side === Lv.shortSide;
                (side === 'L' ? bL : bR).classList.add(ok ? 'curves-btn--ok' : 'curves-btn--bad');
                Sfx.play('whoosh');                     /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                head.textContent = '兩顆球一樣的速度，看誰先到…';
                var t0 = performance.now(), arrived = false;  /* performance.now()：高精度的時間（毫秒），計時用 */
                var lenS = Math.min(Lv.L.len, Lv.R.len);        /* 短的那條的長度：短的那顆球一到終點，長的那顆就停在這個弧長 */
                /* 依經過時間算出兩顆球的弧長位置（最多走到 lenS：短的到了終點，長的就停在原地）；還沒到就回傳 true */
                function place(now) {
                    var s = Math.min((now - t0) / 1000 * Lv.speed, lenS);
                    var pl = pointAt(ptsL, s), pr = pointAt(ptsR, s);
                    balls[0].setAttribute('cx', pl.x.toFixed(1)); balls[0].setAttribute('cy', pl.y.toFixed(1));  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
                    balls[1].setAttribute('cx', pr.x.toFixed(1)); balls[1].setAttribute('cy', pr.y.toFixed(1));
                    if (s >= lenS) {
                        if (!arrived) {
                            arrived = true;     /* 短的那顆球到的瞬間就公布結果；長的那顆停在原地，不再往前 */
                            Sfx.play('tick');
                            verdict(ok, Lv.shortSide);
                        }
                        return false;
                    }
                    return true;
                }
                var lp = my.loop(function (now) { return place(now); });  /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
                /* 保底：rAF 被暫停時，時間到了直接定位並公布 */
                my.after(lenS / Lv.speed * 1000 + 300, function () { if (!arrived) { lp.stop(); place(t0 + lenS / Lv.speed * 1000 + 1000); } });
            }

            /* 揭曉的鏡頭：長繩子還沒走完的那一段用橘色標出來、終點圈閃動；那一段很短（長度差小）就把鏡頭放大到只框住它（zoomCamera），
               回傳是不是有放大（呼叫端據此決定停留多久）。放大的時候球、起終點圈的半徑反過來縮小（除以倍率），畫面上看起來大小不變，
               球與終點之間的距離才看得清楚、不會被放大的球蓋住。 */
            function showGap() {
                var longSide = Lv.shortSide === 'L' ? 'R' : 'L', pts = longSide === 'L' ? ptsL : ptsR;
                var lenS = Lv.shortSide === 'L' ? Lv.L.len : Lv.R.len;
                var rest = restPoints(pts, lenS);
                var d = rest.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
                var path = kit.svg('path', { 'class': 'curves-line curves-rest', d: d }, svg);
                svg.insertBefore(path, balls[0]);                         /* 畫在球的下面 */
                ends[longSide === 'L' ? 0 : 1].classList.add('curves-end--gap');
                /* 剩下的路還很長（差距大）就不放大；很短才放大 */
                var cam = needZoom(rest[rest.length - 1].s - rest[0].s) ? zoomCamera(rest, fw, fh) : null;
                if (!cam) return false;
                var from = { vx: 0, vy: 0, vw: fw, vh: fh };
                var markers = svg.querySelectorAll('.curves-start, .curves-end');
                kit.tweenViewBox(my, svg, from, cam.box, ZOOM_MS, kit.easeInOutCubic, function (b) {
                    var z = fw / b.vw;
                    balls[0].setAttribute('r', (13 / z).toFixed(2)); balls[1].setAttribute('r', (13 / z).toFixed(2));
                    for (var i = 0; i < markers.length; i++) markers[i].setAttribute('r', (7 / z).toFixed(2));
                });
                field.classList.add('curves-field--zoom');
                return true;
            }

            /* 公布結果：答對進下一關，答錯結算 */
            function verdict(ok, first) {
                var msg = '長度：左 ' + Lv.L.len.toFixed(0) + '、右 ' + Lv.R.len.toFixed(0) + '（差 ' + ((Lv.ratio - 1) * 100).toFixed(4) + '%）';
                var zoomed = showGap();                      /* 標出長繩子剩下的路；差距小就把鏡頭放大 */
                var extra = zoomed ? ZOOM_MS : 0;           /* 有放大的話，停留時間加上放大的時間 */
                if (ok) {
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    banner.textContent = (first === 'L' ? '左' : '右') + '邊先到！答對了';
                    banner.className = 'curves-banner curves-banner--ok';
                    head.textContent = msg;
                    meta();
                    Sfx.play('win');
                    level++;
                    my.after(1900 + extra, nextLevel);
                } else {
                    banner.textContent = (first === 'L' ? '左' : '右') + '邊先到…答錯了';
                    banner.className = 'curves-banner curves-banner--bad';
                    head.textContent = msg;
                    Sfx.play('bad');
                    state = 'over';
                    var failLevel = level, back = kit.resumeFrom(failLevel);
                    my.after(2300 + extra, function () {
                        kit.result(root, {              /* kit.result：顯示結算卡片（成績、評語、再玩一次…），並自動記最佳紀錄、送世界排行榜 */
                            score: cleared,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                            num: cleared + ' 關', label: '看走眼了',
                            lines: ['第 ' + level + ' 關長度差 ' + ((Lv.ratio - 1) * 100).toFixed(4) + '%', (Lv.shortSide === 'L' ? '左' : '右') + '邊才是比較短的'],
                            isNew: newRec, sfx: cleared >= 6 ? 'win' : 'fail',
                            onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                }
            }

            /* 兩顆按鈕：pointerdown 一碰就觸發 */
            bL.addEventListener('pointerdown', function (e) { e.preventDefault(); choose('L'); });  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            bR.addEventListener('pointerdown', function (e) { e.preventDefault(); choose('R'); });  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { level: level, state: state, cleared: cleared }; },
                level: function () { return Lv; },
                choose: choose,
                jump: function (n) { level = n; state = 'idle'; nextLevel(); },
                chooseRight: function () { choose(Lv.shortSide); },
                chooseWrong: function () { choose(Lv.shortSide === 'L' ? 'R' : 'L'); }
            };
            /* 開場等 400 毫秒再開始第一關 */
            my.after(400, nextLevel);
        }

        /* V1.34.0：從「個人最佳關卡 − 5」開始（沒玩過就是第 1 關），見 kit.enter（reaction_kit.js） */

        kit.enter(ID, round);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '誰先到？',
        rule: '黑色畫面上有左右兩條彎彎曲曲的尋寶路線，**判斷哪一條比較短，按下方的按鈕**。按下去之後，兩顆球會用一樣的速度沿著路線滑下來，**短的那顆一到終點，長的那顆就停住**，看它離終點還差多遠（差距很小的時候，鏡頭還會放大給你看）。第 1 關長度差 30%，每關縮小 3%，後面還會變成虛線，轉彎越來越多！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { segDist: segDist, polyOk: polyOk, diffFor: diffFor, kBase: kBase, yjitFor: yjitFor, makeShape: makeShape, buildPath: buildPath, solveAlpha: solveAlpha, validRope: validRope, makeLevel: makeLevel, speedFor: speedFor, dashFor: dashFor, pointAt: pointAt, pathLen: pathLen, zoomCamera: zoomCamera, restPoints: restPoints, needZoom: needZoom, ZOOM_REST_MAX: ZOOM_REST_MAX, ZOOM_MIN: ZOOM_MIN, ZOOM_MAX: ZOOM_MAX, ZOOM_PAD: ZOOM_PAD, MIN_SWING: MIN_SWING, CLEAR_PX: CLEAR_PX, SEP_PX: SEP_PX, SIDE_PAD: SIDE_PAD, PAD_TOP: PAD_TOP, PAD_BOT: PAD_BOT, VW: VW }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
