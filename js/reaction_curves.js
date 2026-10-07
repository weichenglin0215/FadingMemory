/* ═══════════════════════════════════════════════════════════════════
   reaction_curves.js — 秒反應・誰先到？
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
   · 球的位置＝沿繩子走過的弧長（兩顆球速度相同），所以短的先到。速度預設 BALL_SPEED px/s，繩子太長時
     加快到「短的那條在 TRAVEL_MAX_S 秒內到」。判定在按按鈕的瞬間就決定了（比較兩條繩子的長度）。
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
    var YJIT_START = 0.8, YJIT_END = 1.3;               /* 轉折點上下打亂的幅度（倍的間距，> 1 就會往回走）*/
    var MIN_SWING = 0.8;                                  /* 相鄰兩個轉折點的左右距離，至少是半幅寬的幾倍 */
    var TRAP_END = 0.7;                                   /* 「短的那條轉折比較多」的機率（線性上升到這個） */
    /* 第 4 關起畫成虛線（無法靠數段數比長度） */
    var DASH_FROM = 4;                                    /* 第幾關起是虛線 */
    /* 球的速度下限；繩子太長時會加快，讓短的那條在 5 秒內到 */
    var BALL_SPEED = 230;                                 /* 球的速度（px/秒）下限 */
    var TRAVEL_MAX_S = 5;                                 /* 短的那條最多滑幾秒（繩子太長就加快）*/
    var VW = 468;                                         /* SVG 寬 */
    var PAD_TOP = 36, PAD_BOT = 36;
    var SIDE_PAD = 22;                                    /* 繩子離自己那半邊的左右邊緣至少這麼遠 */
    var STEP_PX = 3;                                      /* 取樣間隔 */
    /* 路徑不重疊：弧長相隔超過 SEP_PX 的兩點，距離要 ≥ CLEAR_PX */
    var CLEAR_PX = 24, SEP_PX = 70;                       /* 路徑不重疊：弧長相隔 > SEP_PX 的兩點距離 ≥ CLEAR_PX */
    var ALPHA_MIN = 0.2;
    var CTRL_FRAC = 0.86;                                 /* 轉折點最多伸到半幅寬的這個比例（曲線過彎時會稍微衝出去，要留空間）*/

    /* 這一關的長度差 */
    function diffFor(level) { return Math.max(DIFF_MIN, DIFF_START - (level - 1) * DIFF_STEP); }
    /* 這一關的轉折點基本數量 */
    function kBase(level) { return Math.round(kit.ramp(level, K_START, K_END, K_RAMP)); }
    /* 這一關的上下打亂幅度 */
    function yjitFor(level) { return kit.ramp(level, YJIT_START, YJIT_END, K_RAMP); }
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 點到線段的距離（先把點投影到線段上，再算兩點距離） */
    /* 點 p 到線段 q-r 的距離 */
    function ptSeg(p, q, r) {
        var dx = r.x - q.x, dy = r.y - q.y, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((p.x - q.x) * dx + (p.y - q.y) * dy) / l2)) : 0;
        var ex = q.x + t * dx - p.x, ey = q.y + t * dy - p.y; return Math.sqrt(ex * ex + ey * ey);
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
        shape.forEach(function (p) { P.push({ x: p.u * alpha * dims.halfW * CTRL_FRAC, y: p.v * dims.h }); });
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
                    var v = kit.clamp(i * spacing + (rand() * 2 - 1) * yjit * spacing, 0.03, 0.97);
                    if (rand() < 0.85) side = -side;                           /* 大多左右交替，偶爾連續同一邊 */
                    var u = side * kit.randFloat(0.4, 1, rand);
                    if (i > 1 && Math.abs(u - prevU) < MIN_SWING) continue;
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
            var m = Math.max(2, Math.ceil(Math.sqrt(dx1 * dx1 + dy1 * dy1) / STEP_PX));
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
            var gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell), key = gx + ',' + gy;
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
            var kS = Math.max(2, kb + (isTrap ? kit.randInt(1, 2, rand) : kit.randInt(-1, 1, rand)));
            var kL = Math.max(2, kb + (isTrap ? -kit.randInt(1, 2, rand) : kit.randInt(-1, 1, rand)));
            var shS = makeShape(kS, yj, rand, dims), shL = makeShape(kL, yj, rand, dims);
            if (!shS || !shL) continue;
            var aS = kit.randFloat(0.8, 0.98, rand);
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
    /* 虛線的紅段／白段長度：左右兩條差很多，無法靠數虛線段數來比長度 */
    /* 虛線的紅段／白段長度：左右兩條差很多 */
    function dashFor(rand) {
        rand = rand || Math.random;
        var a = kit.pick([[6, 6], [8, 5], [10, 8]], rand), b = kit.pick([[34, 20], [38, 26], [30, 34]], rand);
        return rand() < 0.5 ? { L: a, R: b } : { L: b, R: a };
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
            root.innerHTML = '';
            /* 替整個畫面加上黑底 class（樣式在 css/reaction.css 的 .cv-bg） */
            root.classList.add('cv-bg');
            my.onDispose(function () { root.classList.remove('cv-bg'); });
            var level = start || 1, cleared = level - 1, newRec = false, state = 'idle';

            /* 建立畫面元素：標題、場地、橫幅、左右兩顆選擇按鈕 */
            var head = h('div', { 'class': 'cv-head' });
            var field = h('div', { 'class': 'cv-field' });
            var banner = h('div', { 'class': 'cv-banner' });
            var btns = h('div', { 'class': 'cv-btns' });
            var bL = h('button', { 'class': 'cv-btn', text: '左邊比較短' });
            var bR = h('button', { 'class': 'cv-btn', text: '右邊比較短' });
            btns.appendChild(bL); btns.appendChild(bR);
            field.appendChild(banner);
            root.appendChild(head);
            root.appendChild(field);
            root.appendChild(btns);

            var Lv = null, svg = null, balls = null, ptsL = null, ptsR = null;

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))])); }

            /* 出下一關：產生左右兩條繩子並畫出來（有虛線就畫白底線疊紅色虛線） */
            function nextLevel() {
                if (my.dead) return;
                var H = field.clientHeight, W = field.clientWidth;
                Lv = null;
                for (var att = 0; att < 40 && !Lv; att++) Lv = makeLevel(level, H, null, W);
                if (!Lv) throw new Error('curves: cannot build a level');
                state = 'pick';
                banner.textContent = ''; banner.className = 'cv-banner';
                head.textContent = '第 ' + level + ' 關　哪一條比較短？';
                meta();
                field.querySelectorAll('svg').forEach(function (s) { s.remove(); });
                svg = kit.svg('svg', { 'class': 'cv-svg', viewBox: '0 0 ' + W + ' ' + H }, field);
                ptsL = Lv.L.pts; ptsR = Lv.R.pts;
                var dash = level >= DASH_FROM ? dashFor() : null;
                [[ptsL, 'L'], [ptsR, 'R']].forEach(function (pr) {
                    var d = pr[0].map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
                    if (dash) {
                        kit.svg('path', { 'class': 'cv-line cv-line--white', d: d }, svg);
                        kit.svg('path', { 'class': 'cv-line cv-line--red', d: d, 'stroke-dasharray': dash[pr[1]][0] + ' ' + dash[pr[1]][1] }, svg);
                    } else {
                        kit.svg('path', { 'class': 'cv-line cv-line--solid', d: d }, svg);
                    }
                });
                [ptsL, ptsR].forEach(function (pts) {
                    kit.svg('circle', { 'class': 'cv-start', cx: pts[0].x, cy: pts[0].y, r: 7 }, svg);
                    kit.svg('circle', { 'class': 'cv-end', cx: pts[pts.length - 1].x, cy: pts[pts.length - 1].y, r: 7 }, svg);
                });
                balls = [kit.svg('circle', { 'class': 'cv-ball', r: 13, cx: ptsL[0].x, cy: ptsL[0].y }, svg), kit.svg('circle', { 'class': 'cv-ball', r: 13, cx: ptsR[0].x, cy: ptsR[0].y }, svg)];
                bL.disabled = bR.disabled = false;
                bL.className = bR.className = 'cv-btn';
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
                (side === 'L' ? bL : bR).classList.add(ok ? 'cv-btn--ok' : 'cv-btn--bad');
                Sfx.play('whoosh');
                head.textContent = '兩顆球一樣的速度，看誰先到…';
                var t0 = performance.now(), done = { L: false, R: false }, first = null;
                var lenL = Lv.L.len, lenR = Lv.R.len;
                /* 依經過時間算出兩顆球的弧長位置 */
                function place(now) {
                    var s = (now - t0) / 1000 * Lv.speed;
                    var pl = pointAt(ptsL, s), pr = pointAt(ptsR, s);
                    balls[0].setAttribute('cx', pl.x.toFixed(1)); balls[0].setAttribute('cy', pl.y.toFixed(1));
                    balls[1].setAttribute('cx', pr.x.toFixed(1)); balls[1].setAttribute('cy', pr.y.toFixed(1));
                    if (!done.L && s >= lenL) { done.L = true; if (!first) first = 'L'; arrive(); }
                    if (!done.R && s >= lenR) { done.R = true; if (!first) first = 'R'; arrive(); }
                }
                var arrived = false;
                function arrive() {
                    if (arrived) return;
                    arrived = true;     /* 第一顆球到的瞬間就公布結果；另一顆繼續滑到底 */
                    Sfx.play('tick');
                    verdict(ok, first);
                }
                var lp = my.loop(function (now) {
                    place(now);
                    if (done.L && done.R) return false;
                });
                /* 保底：rAF 被暫停時，時間到了直接定位到終點並公布 */
                /* 保底：rAF 被暫停時，時間到了直接定位到終點並公布 */
                var total = Math.max(lenL, lenR) / Lv.speed * 1000;
                my.after(Math.min(lenL, lenR) / Lv.speed * 1000 + 200, function () { if (!arrived) { place(t0 + Math.min(lenL, lenR) / Lv.speed * 1000 + 1); } });
                my.after(total + 400, function () { lp.stop(); place(t0 + total + 1); });
            }

            /* 公布結果：答對進下一關，答錯結算 */
            function verdict(ok, first) {
                var msg = '長度：左 ' + Lv.L.len.toFixed(0) + '、右 ' + Lv.R.len.toFixed(0) + '（差 ' + ((Lv.ratio - 1) * 100).toFixed(4) + '%）';
                if (ok) {
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    banner.textContent = (first === 'L' ? '左' : '右') + '邊先到！答對了';
                    banner.className = 'cv-banner cv-banner--ok';
                    head.textContent = msg;
                    meta();
                    Sfx.play('win');
                    level++;
                    my.after(1900, nextLevel);
                } else {
                    banner.textContent = (first === 'L' ? '左' : '右') + '邊先到…答錯了';
                    banner.className = 'cv-banner cv-banner--bad';
                    head.textContent = msg;
                    Sfx.play('bad');
                    state = 'over';
                    var failLevel = level, back = kit.resumeFrom(failLevel);
                    my.after(2300, function () {
                        kit.result(root, {
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
            bL.addEventListener('pointerdown', function (e) { e.preventDefault(); choose('L'); });
            bR.addEventListener('pointerdown', function (e) { e.preventDefault(); choose('R'); });

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

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '誰先到？',
        rule: '黑色畫面上有左右兩條彎彎曲曲的尋寶路線，判斷哪一條比較短，按下方的按鈕。按下去之後，兩顆球會用一樣的速度沿著路線滑下來，看看誰先到。第 1 關長度差 30%，每關縮小 3%，後面還會變成虛線，轉彎越來越多！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { segDist: segDist, polyOk: polyOk, diffFor: diffFor, kBase: kBase, yjitFor: yjitFor, makeShape: makeShape, buildPath: buildPath, solveAlpha: solveAlpha, validRope: validRope, makeLevel: makeLevel, speedFor: speedFor, dashFor: dashFor, pointAt: pointAt, pathLen: pathLen, MIN_SWING: MIN_SWING, CLEAR_PX: CLEAR_PX, SEP_PX: SEP_PX, SIDE_PAD: SIDE_PAD, PAD_TOP: PAD_TOP, PAD_BOT: PAD_BOT, VW: VW }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
