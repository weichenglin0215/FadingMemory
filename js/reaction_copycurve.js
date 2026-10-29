/* ═══════════════════════════════════════════════════════════════════
   reaction_copycurve.js — 秒反應・照抄曲線（企劃 115）
   畫面左邊的長方格裡有一條「綠色的曲線」，兩端分別是「黃色的起點」和「水藍色的終點」；
   右邊的長方格只有同樣位置的起點與終點。用手指從其中一個端點開始，照著左邊的曲線，在右邊畫出一模一樣的曲線（白色），
   一直畫到另一個端點（可以從黃點開始，也可以從水藍點開始）。碰到另一個端點就算畫完：
   左右兩個長方格會往中間靠攏、疊在一起，比較兩條曲線有多像（相似度）。相似度達到這一關的要求才過關。
   關卡制：成績＝通過幾關。越後面，曲線越彎、形狀越花俏（直角轉彎、閃電、螺旋、迴紋針…），要求的相似度也越高。
   ───────────────────────────────────────────────────────────────────
   · 曲線種類隨關卡解鎖（見 typesFor）：S 形（第 1～9 關）→ 波浪（第 3 關起）→ 直角轉彎（第 7 關起）→ 閃電（第 10 關起）→
     螺旋（第 13 關起，起點在外圈、終點在圓心）→ 迴紋針（第 16 關起）。
     每種曲線的彎曲程度（振幅、波數、轉彎數、圈數）隨關卡線性增加（RAMP_LEVELS 關走到頂）。
   · 曲線用純函式產生一串密密的點（每隔約 3 像素一個），並且保證：全部點在長方格內、起點與終點相距至少 MIN_SEP、
     路徑長度在合理範圍（玩家畫得完）。畫面上的線就是這串點連起來。
   · 相似度（similarity）：把「目標曲線」與「你畫的曲線」各取 PTS 個等距的點，計算每個點到另一條曲線的最短距離，
     兩個方向的平均再平均（chamfer 距離，單位像素），相似度 ＝ 100％ × (1 − 平均距離 ÷ D0)，D0＝40 像素。
     所以：畫得貼著原曲線→接近 100％；平均偏 4 像素→90％；偏 8 像素→80％。畫的方向（從黃點或水藍點出發）不影響結果。
   · 要求的相似度線性：第 1 關 72％ → 第 RAMP_LEVELS 關 92％。相似度用 Leaderboard.fake4 產生「最終的數字」（第 3、4 位不為 0），
     過不過關就用這個數字判斷（規範 B4）。
   · 限時：每關 40 秒 → 22 秒；沒畫完放開手指，筆跡會清掉，可以重畫（在限時內不限次數）。
   · V1.34（玩家意見三則）：
       1) 第 3 關突然出現彎了十個彎的複雜曲線、第 4 關又變簡單＝難度忽高忽低：原本每一種曲線各自用自己的難度公式，換一種就換一個複雜度。
          現在「彎數」只由關卡決定（bendsFor：BENDS[0] → BENDS[1] 線性），每一種曲線（繩子、波浪、直角轉彎、閃電）都照這個彎數出，越後面一定彎得越多；
       2) 不能只因為手指經過終點（或起點）附近就自動判定畫完（只是路過卻被誤判）：改成「手指離開螢幕」才開始判定——放開的位置要在另一個端點附近（END_R 以內）
          而且畫夠長（MIN_DRAW）才算畫完並比較相似度；放開在別處就把筆跡清掉、可以重畫；手指快碰到另一個端點時，那個端點會亮綠框提醒「可以放開了」；
       3) 抄「誰先到？」的曲線畫法（genRope，見檔案中的說明）：多一種「繩子曲線」，轉折點的左右、上下位置都亂得有變化、用 Catmull-Rom 連成平滑曲線，
          有繩子可選時 ROPE_P（50%）的機率抽到它。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'copycurve';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var REQ = [50, 85];                         /* 要求的相似度（％）：第 1 關 → 到頂 */
    var TIME_S = [40, 30];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var PW = 224, PH = 520;                     /* 每個長方格的大小（邏輯 px） */
    var MG = 36;                                /* 曲線離長方格邊緣至少多遠 */
    var MIN_SEP = 70;                           /* 起點與終點至少相距多少 */
    var LEN_RANGE = [550, 1800];                /* 曲線全長的合理範圍 */
    var LEN_MIN_TYPE = { scurve: 420, rope: 420 };         /* 個別種類的長度下限（S 形本來就平緩、比較短；第 1～3 關才有，不能因此一直被判不合格） */
    var START_R = 40;                           /* 手指按在端點多近才算「從這個端點開始」 */
    var END_R = 32;                             /* 手指碰到另一個端點多近就算畫完 */
    var MIN_DRAW = 70;                          /* 至少畫了多長才算畫完（避免剛起筆就算） */
    var D0 = 40;                                /* 相似度的換算距離（像素）：平均距離 D0 → 相似度 0％ */
    var PTS = 120;                              /* 比較相似度時，每條曲線取幾個等距的點 */
    var STEP = 3;                               /* 曲線上相鄰兩點的間距（像素） */
    var MAX_LEVEL = 90;
    var BENDS = [2, 10];                        /* 彎數（轉折點、半個波、轉角的個數）：第 1 關 → 到頂關卡（RAMP_LEVELS）線性；每一種曲線都照這個數字出，難度才不會忽高忽低（V1.34） */
    var RIGHT_MAX = 8;                          /* 直角轉彎最多幾段線（彎數很多的後期關卡，放不進長方格就會一直重抽，所以封頂） */
    var ROPE_P = 0.5;                           /* 有「繩子曲線」可選的關卡，抽到它的機率（其餘種類平分） */
    var ROPE_YJIT = [0.8, 1.3];                 /* 繩子曲線：轉折點上下打亂的幅度（倍的間距）：第 1 關 → 到頂；越大越會往回走 */
    var ROPE_SWING = 0.8;                       /* 繩子曲線：相鄰兩個轉折點的左右距離，至少是半幅寬的幾倍 */
    var ROPE_CLEAR = 24, ROPE_SEP = 70;         /* 繩子曲線不重疊：弧長相隔超過 ROPE_SEP 像素的兩點，距離都要 ≥ ROPE_CLEAR 像素 */
    /* 各種曲線出現的關卡範圍 [從第幾關起, 到第幾關為止]：S 形太平緩，第 3 關之後就不再出現（不然拿直線隨便畫都過關） */
    var TYPE_RANGE = { scurve: [1, 3], rope: [1, 999], wave: [3, 999], right: [6, 999], bolt: [9, 999], spiral: [12, 999], clip: [15, 999] };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function reqSim(level) { return kit.ramp(level, REQ[0], REQ[1], RAMP_LEVELS); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function typesFor(level) { return Object.keys(TYPE_RANGE).filter(function (k) { return level >= TYPE_RANGE[k][0] && level <= TYPE_RANGE[k][1]; }); }
    function polyLen(pts) { var s = 0; for (var i = 1; i < pts.length; i++) s += kit.dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y); return s; }
    /* 依弧長等距重新取 n 個點（含頭尾） */
    function resample(pts, n) {
        var total = polyLen(pts), out = [pts[0]], step = total / (n - 1), acc = 0, i = 1, need = step;
        var a = pts[0];
        while (out.length < n - 1 && i < pts.length) {
            var b = pts[i], seg = kit.dist(a.x, a.y, b.x, b.y);
            if (acc + seg >= need - 1e-9 && seg > 0) {
                var t = (need - acc) / seg, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
                out.push(p); a = p; acc = 0; need = step;
            } else { acc += seg; a = b; i++; }
        }
        out.push(pts[pts.length - 1]);
        return out;
    }
    /* 把折線在每一段上補點，讓相鄰點的間距不超過 step */
    function densify(pts, step) {
        var out = [pts[0]];
        for (var i = 1; i < pts.length; i++) {
            var a = pts[i - 1], b = pts[i], d = kit.dist(a.x, a.y, b.x, b.y), n = Math.max(1, Math.ceil(d / step));
            for (var k = 1; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
        }
        return out;
    }
    /* 點 p 到折線 poly 的最短距離 */
    function distToPoly(p, poly) {
        var best = 1e18;
        for (var i = 1; i < poly.length; i++) {
            var a = poly[i - 1], b = poly[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
            var t = l2 === 0 ? 0 : kit.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
            var d = kit.dist(p.x, p.y, a.x + t * dx, a.y + t * dy);
            if (d < best) best = d;
        }
        return best;
    }
    /* 兩條曲線的平均距離（chamfer，像素）：A 的點到 B 的平均、B 的點到 A 的平均，再取平均 */
    function chamfer(A, B) {
        var ra = resample(A, PTS), rb = resample(B, PTS), sa = 0, sb = 0, i;
        for (i = 0; i < ra.length; i++) sa += distToPoly(ra[i], B);
        for (i = 0; i < rb.length; i++) sb += distToPoly(rb[i], A);
        return (sa / ra.length + sb / rb.length) / 2;
    }
    /* 相似度（％，0～100）：100 × (1 − 平均距離 ÷ D0) */
    function similarity(target, drawn) { return 100 * kit.clamp(1 - chamfer(target, drawn) / D0, 0, 1); }

    /* ── 曲線產生器：每個回傳「還沒放進長方格」的折線（原始座標），由 fit() 縮放、置中 ── */
    function arcPts(cx, cy, r, a0, a1, n) {                           /* 圓弧：角度用「數學角度」（逆時針為正），畫面 y 向下所以 y 取負 */
        var out = [];
        for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; out.push({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) }); }
        return out;
    }
    /* ═══ 繩子曲線（V1.34 玩家意見：抄「誰先到？」的曲線畫法，讓曲線更有變化）═══
       畫法抄自 js/reaction_curves.js（誰先到？的尋寶繩子）：
       · 一條曲線有 k 個「轉折點」：轉折點的左右位置差異很大（大多左右交替、偶爾連續同一邊；相鄰兩點的左右距離至少 ROPE_SWING 倍半幅寬、大小不一），
         上下位置也故意打亂（上下間距 × 打亂幅度），所以路線會忽左忽右、有時還會往回走，不是工整的正弦波；
       · 轉折點是「一個一個加上去」的，每加一個就檢查整條折線有沒有交叉、有沒有貼太近（至少 ROPE_CLEAR 像素）、有沒有折成太尖的髮夾彎；
       · 最後用 Catmull-Rom 曲線把「起點、所有轉折點、終點」連成一條平滑的曲線（每約 STEP 像素一點），再檢查真正畫出來的曲線：
         不跑出太多、「路徑上相隔超過 ROPE_SEP 像素的兩點」距離都要 ≥ ROPE_CLEAR（不會自己貼在自己身上）。
       · 跟「誰先到？」不同的地方：起點、終點的左右位置也隨機（不一定都在正中間）；轉折點的數量固定＝這一關的彎數 bendsFor(level)。 */
    var ROPE_FRAC = 0.86;                                             /* 轉折點最多伸到半幅寬的這個比例（曲線過彎時會稍微衝出去，要留空間） */
    function ptSegDist(p, q, r) { return distToPoly(p, [q, r]); }
    function segSegDist(a, b, c, e) { return segCross(a, b, c, e) ? 0 : Math.min(ptSegDist(a, c, e), ptSegDist(b, c, e), ptSegDist(c, a, b), ptSegDist(e, a, b)); }
    /* 折線 P（起點、轉折點…、終點）有沒有「自己交叉／貼太近／折成髮夾彎」：沒有＝true */
    function polyClear(P, clear) {
        var need = clear * 1.25, i, j;
        for (i = 0; i + 1 < P.length; i++) for (j = i + 2; j + 1 < P.length; j++) if (segSegDist(P[i], P[i + 1], P[j], P[j + 1]) < need) return false;
        for (i = 0; i + 2 < P.length; i++) if (ptSegDist(P[i], P[i + 1], P[i + 2]) < clear || ptSegDist(P[i + 2], P[i], P[i + 1]) < clear) return false;
        return true;
    }
    /* 起點（u0）、轉折點 [{u,v}]、終點（u1）→ 折線的點：u＝左右位置（−1～1，相對半幅寬）、v＝上下位置（0～1） */
    function ropePoly(u0, u1, turn, halfW, H) {
        var P = [{ x: u0 * halfW * ROPE_FRAC, y: 0 }];
        turn.forEach(function (t) { P.push({ x: t.u * halfW * ROPE_FRAC, y: t.v * H }); });
        P.push({ x: u1 * halfW * ROPE_FRAC, y: H });
        return P;
    }
    /* Catmull-Rom 曲線：把控制點連成平滑曲線，每段依長度取點（約每 STEP 像素一個），並記下累積弧長 s */
    function catmull(ctrl) {
        var pts = [], s = 0, n = ctrl.length;
        function at(i) { return ctrl[Math.max(0, Math.min(n - 1, i))]; }
        for (var i = 0; i < n - 1; i++) {
            var p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2), m = Math.max(2, Math.ceil(kit.dist(p1.x, p1.y, p2.x, p2.y) / STEP));
            for (var j = (i === 0 ? 0 : 1); j <= m; j++) {
                var t = j / m, t2 = t * t, t3 = t2 * t;
                var x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
                var y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
                if (pts.length) { var q = pts[pts.length - 1]; s += kit.dist(x, y, q.x, q.y); }
                pts.push({ x: x, y: y, s: s });
            }
        }
        return pts;
    }
    /* 畫出來的曲線有沒有在範圍內、有沒有自己貼自己（用格子雜湊：只比較相鄰格子裡的點，O(n)）：好＝true */
    function ropeValid(pts, box) {
        var cell = ROPE_CLEAR, grid = {}, i;
        for (i = 0; i < pts.length; i++) {
            var p = pts[i];
            if (p.x < box.x0 || p.x > box.x1 || p.y < box.y0 || p.y > box.y1) return false;
            var key = Math.floor(p.x / cell) + ',' + Math.floor(p.y / cell);
            (grid[key] = grid[key] || []).push(i);
        }
        for (i = 0; i < pts.length; i++) {
            var a = pts[i], cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
            for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
                var arr = grid[(cx + dx) + ',' + (cy + dy)];
                if (!arr) continue;
                for (var k = 0; k < arr.length; k++) {
                    var j = arr[k]; if (j <= i) continue;
                    if (pts[j].s - a.s <= ROPE_SEP) continue;
                    var ddx = pts[j].x - a.x, ddy = pts[j].y - a.y;
                    if (ddx * ddx + ddy * ddy < ROPE_CLEAR * ROPE_CLEAR) return false;
                }
            }
        }
        return true;
    }
    /* 產生一條繩子曲線：bends＝轉折點個數；d＝難度 0～1（上下打亂的幅度隨難度增加）。回傳「還沒放進長方格」的原始座標（中心在原點），做不出來回傳 null */
    function genRope(bends, rand, d) {
        var halfW = (PW - 2 * MG) / 2, H = PH - 2 * MG, k = Math.max(1, Math.round(bends)), yjit = kit.lerp(ROPE_YJIT[0], ROPE_YJIT[1], d == null ? 0.5 : d);
        var box = { x0: -halfW * 1.2, x1: halfW * 1.2, y0: -0.06 * H, y1: 1.06 * H };
        for (var attempt = 0; attempt < 80; attempt++) {
            var u0 = kit.randFloat(-0.5, 0.5, rand), u1 = kit.randFloat(-0.5, 0.5, rand);
            var turn = [], spacing = 1 / (k + 1), prevU = u0, side = rand() < 0.5 ? -1 : 1, fail = false, i, tries;
            for (i = 1; i <= k && !fail; i++) {
                var placed = false;
                for (tries = 0; tries < 40 && !placed; tries++) {
                    var v = kit.clamp(i * spacing + (rand() * 2 - 1) * yjit * spacing, 0.03, 0.97);
                    if (rand() < 0.85) side = -side;                              /* 大多左右交替，偶爾連續同一邊 */
                    var u = side * kit.randFloat(0.4, 1, rand);
                    if (i > 1 && Math.abs(u - prevU) < ROPE_SWING) continue;
                    turn.push({ u: u, v: v });
                    if (polyClear(ropePoly(u0, u1, turn, halfW, H), ROPE_CLEAR)) { placed = true; prevU = u; } else turn.pop();
                }
                if (!placed) fail = true;
            }
            if (fail) continue;
            var pts = catmull(ropePoly(u0, u1, turn, halfW, H));
            if (!ropeValid(pts, box)) continue;
            return pts.map(function (p) { return { x: p.x, y: p.y - H / 2 }; });
        }
        return null;
    }
    function genScurve(d, rand) {
        var A = kit.lerp(45, 96, d), H = PH - 2 * MG, sx = MG + 40, ex = PW - MG - 40, sgn = rand() < 0.5 ? 1 : -1;
        var P0 = { x: sx, y: PH - MG }, P3 = { x: ex, y: MG };
        var P1 = { x: P0.x + sgn * A * 1.6, y: P0.y - 0.45 * H }, P2 = { x: P3.x - sgn * A * 1.6, y: P3.y + 0.45 * H }, out = [];
        for (var i = 0; i <= 200; i++) {
            var t = i / 200, u = 1 - t;
            out.push({ x: u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x, y: u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y });
        }
        return out;
    }
    function genWave(d, rand, b) {
        var k = b != null ? b : Math.round(kit.lerp(3, 7, d)), A = kit.lerp(42, 75, d), H = PH - 2 * MG, out = [], tilt = kit.randFloat(-12, 12, rand) * Math.PI / 180;
        for (var i = 0; i <= 300; i++) {
            var s = i / 300, x = A * Math.sin(Math.PI * k * s), y = -H / 2 + s * H;
            out.push({ x: x * Math.cos(tilt) - y * Math.sin(tilt), y: x * Math.sin(tilt) + y * Math.cos(tilt) });
        }
        return out;
    }
    function segCross(a, b, c, e) {                                   /* 線段 ab 與 ce 是否相交 */
        function o(p, q, r) { return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); }
        return o(a, b, c) * o(a, b, e) < 0 && o(c, e, a) * o(c, e, b) < 0;
    }
    function genRight(d, rand, b) {
        var n = b != null ? Math.min(b + 1, RIGHT_MAX) : Math.round(kit.lerp(3, 8, d));      /* 直角轉彎的線段數：彎數 + 1，但最多 RIGHT_MAX 段（再多就放不進長方格了） */
        for (var tr = 0; tr < 300; tr++) {
            var pts = [{ x: kit.randFloat(MG, PW - MG, rand), y: kit.randFloat(MG, PH - MG, rand) }], horiz = rand() < 0.5, good = true;
            for (var i = 0; i < n && good; i++) {
                var last = pts[pts.length - 1], len = horiz ? kit.randFloat(60, PW - 2 * MG - 20, rand) : kit.randFloat(70, 170, rand), sg = rand() < 0.5 ? 1 : -1;
                var nx = last.x + (horiz ? sg * len : 0), ny = last.y + (horiz ? 0 : sg * len);
                if (nx < MG || nx > PW - MG || ny < MG || ny > PH - MG) { sg = -sg; nx = last.x + (horiz ? sg * len : 0); ny = last.y + (horiz ? 0 : sg * len); }
                if (nx < MG || nx > PW - MG || ny < MG || ny > PH - MG) { good = false; break; }
                var np = { x: nx, y: ny };
                /* 不能跟之前的線段交叉，也不能貼太近（至少 26 像素，相鄰那一段除外） */
                for (var j = 0; j + 1 < pts.length - 1 && good; j++) {
                    if (segCross(pts[j], pts[j + 1], last, np)) good = false;
                    else if (distToPoly(np, [pts[j], pts[j + 1]]) < 26 || distToPoly(pts[j], [last, np]) < 26 || distToPoly(pts[j + 1], [last, np]) < 26) good = false;
                }
                if (good) { pts.push(np); horiz = !horiz; }
            }
            if (good && pts.length === n + 1) return pts;
        }
        return [{ x: 40, y: 60 }, { x: 180, y: 60 }, { x: 180, y: 200 }, { x: 60, y: 200 }, { x: 60, y: 340 }];
    }
    function genBolt(d, rand, b) {
        var n = b != null ? b + 1 : Math.round(kit.lerp(3, 6, d)), H = PH - 2 * MG, ws = [], tot = 0, i;
        for (i = 0; i < n; i++) { var w = kit.randFloat(0.7, 1.3, rand); ws.push(w); tot += w; }
        var pts = [], y = 0;
        for (i = 0; i <= n; i++) {                                    /* 偶數個點在右邊那一帶、奇數個在左邊那一帶，高度一路往下 */
            pts.push({ x: i % 2 === 0 ? kit.randFloat(PW * 0.62, PW - MG, rand) : kit.randFloat(MG, PW * 0.38, rand), y: MG + y });
            if (i < n) y += ws[i] / tot * H;
        }
        return pts;
    }
    function genSpiral(d, rand) {
        var T = kit.lerp(1.25, 2.5, d), R0 = (PW - 2 * MG) / 2, rEnd = 7, th0 = rand() * Math.PI * 2, dir = rand() < 0.5 ? 1 : -1, out = [];
        for (var i = 0; i <= 400; i++) {
            var s = i / 400, r = R0 + (rEnd - R0) * s, th = th0 + dir * Math.PI * 2 * T * s;
            out.push({ x: r * Math.cos(th), y: r * Math.sin(th) });
        }
        return out;
    }
    function genClip() {
        var seg = [];
        function add(a) { a.forEach(function (p) { seg.push(p); }); }
        add([{ x: 16, y: 60 }, { x: 16, y: -100 }]);
        add(arcPts(0, -100, 16, 0, Math.PI, 20));
        add([{ x: -16, y: -100 }, { x: -16, y: 110 }]);
        add(arcPts(19, 110, 35, Math.PI, 2 * Math.PI, 40));
        add([{ x: 54, y: 110 }, { x: 54, y: -130 }]);
        add(arcPts(0, -130, 54, 0, Math.PI, 50));
        add([{ x: -54, y: -130 }, { x: -54, y: 90 }]);
        return seg;
    }
    /* 把原始折線縮放（只縮小不放大）、置中到長方格裡；回傳每隔 STEP 像素一個點的密集折線 */
    function fit(raw) {
        var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        raw.forEach(function (p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
        var bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
        var s = Math.min(1, (PW - 2 * MG) / bw, (PH - 2 * MG) / bh), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        var pts = raw.map(function (p) { return { x: PW / 2 + (p.x - cx) * s, y: PH / 2 + (p.y - cy) * s }; });
        return densify(pts, STEP);
    }
    /* 這一關的「彎數」（V1.34 玩家意見：第 3 關突然彎了十個彎、第 4 關又變簡單＝難度忽高忽低）：
       彎數只由關卡決定（BENDS[0] → BENDS[1] 線性），每一種曲線都照這個數字出（繩子曲線的轉折點數、波浪的半個波數、直角轉彎與閃電的轉角數），
       所以不管抽到哪一種，越後面的關卡一定彎得越多，不會忽高忽低；螺旋與迴紋針是固定造型，只在後面的關卡偶爾出現。 */
    function bendsFor(level) { return Math.round(kit.ramp(level, BENDS[0], BENDS[1], RAMP_LEVELS)); }
    /* 依種類產生一條原始曲線（d＝難度 0～1、b＝彎數） */
    function genByType(type, d, b, rand) {
        return type === 'rope' ? genRope(b, rand, d) : type === 'scurve' ? genScurve(d, rand) : type === 'wave' ? genWave(d, rand, b) : type === 'right' ? genRight(d, rand, b) :
            type === 'bolt' ? genBolt(d, rand, b) : type === 'spiral' ? genSpiral(d, rand) : genClip();
    }
    var fbCount = 0;                                                   /* 進了保底的次數（測試用：正常出題幾乎不會進保底） */
    var HAS_BENDS = { rope: 1, wave: 1, right: 1, bolt: 1 };           /* 彎數由 bendsFor 決定的種類 */
    /* 出一條曲線：{ type, pts（密集折線，從起點到終點）, start, end, len, bends（彎數；固定造型的種類是 null） }
       種類：有「繩子曲線」可選時有 ROPE_P 的機率抽它（變化最多），其餘種類平分（新解鎖的那一種多一點）；avoidType（上一關的種類）盡量不連續重複（繩子除外，每一條都不一樣） */
    function makeCurve(level, rand, avoidType) {
        rand = rand || Math.random;
        var d = kit.ramp(level, 0, 1, RAMP_LEVELS), b = bendsFor(level), types = typesFor(level);
        if (avoidType && avoidType !== 'rope' && types.length > 1) types = types.filter(function (t) { return t !== avoidType; });
        var others = types.filter(function (t) { return t !== 'rope'; });
        /* 新解鎖的種類出現機率高一點 */
        var newest = others.slice().sort(function (x, y) { return TYPE_RANGE[y][0] - TYPE_RANGE[x][0]; })[0];
        for (var tr = 0; tr < 100; tr++) {
            var type = (types.indexOf('rope') >= 0 && (!others.length || rand() < ROPE_P)) ? 'rope' : ((others.indexOf(newest) >= 0 && rand() < 0.4) ? newest : kit.pick(others, rand));
            var raw = genByType(type, d, b, rand);
            if (!raw) continue;
            var pts = fit(raw);
            /* 隨機左右、上下翻轉；除了螺旋（起點一定在外圈），也隨機把起點終點對調 */
            if (rand() < 0.5) pts = pts.map(function (p) { return { x: PW - p.x, y: p.y }; });
            if (rand() < 0.5) pts = pts.map(function (p) { return { x: p.x, y: PH - p.y }; });
            if (type !== 'spiral' && rand() < 0.5) pts = pts.slice().reverse();
            var len = polyLen(pts), a = pts[0], e = pts[pts.length - 1];
            if (len < (LEN_MIN_TYPE[type] || LEN_RANGE[0]) || len > LEN_RANGE[1] || kit.dist(a.x, a.y, e.x, e.y) < MIN_SEP) continue;
            return { type: type, pts: pts, start: a, end: e, len: len, bends: HAS_BENDS[type] ? b : null };
        }
        /* 保底（極少用到）：繩子曲線（只要彎數放得進長方格，一定做得出來），不行再用波浪；不要退回已經不再出現的 S 形（V1.28 修正） */
        fbCount++;
        for (var tr2 = 0; tr2 < 300; tr2++) {
            var fbType = tr2 < 200 ? 'rope' : 'wave', fraw = genByType(fbType, 1, fbType === 'rope' ? b : Math.min(b, 6), rand);
            if (!fraw) continue;
            var fp = fit(fraw), fl = polyLen(fp);
            if (fl >= (LEN_MIN_TYPE[fbType] || LEN_RANGE[0]) && fl <= LEN_RANGE[1] && kit.dist(fp[0].x, fp[0].y, fp[fp.length - 1].x, fp[fp.length - 1].y) >= MIN_SEP) return { type: fbType, pts: fp, start: fp[0], end: fp[fp.length - 1], len: fl, bends: fbType === 'rope' ? b : Math.min(b, 6) };
        }
        var fb = fit(genWave(1, rand, 4));
        return { type: 'wave', pts: fb, start: fb[0], end: fb[fb.length - 1], len: polyLen(fb), bends: 4 };
    }
    function rating(n) {
        if (n >= 20) return '神之一筆！';
        if (n >= 12) return '手眼協調超強！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '放慢一點，貼著線畫，再來一次！';
    }
    var TYPE_NAME = { scurve: 'S 形曲線', rope: '繩子曲線', wave: '波浪', right: '直角轉彎', bolt: '閃電', spiral: '螺旋', clip: '迴紋針' };

    var lastType = null;
    function mount(root, ctx) {
        /* V1.28 起成績＝撐到第幾關（以前是通過幾關，少 1）：舊的最佳紀錄＋1（只轉一次） */
        Reaction.migrateBest(ID, function (b) { return b + 1; }, '.v128');
        lastType = null;
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            /* V1.28：結算的數字要跟遊戲左上角的「第 N 關」一致——成績＝撐到第幾關（通過的關數＋1：第 1 關就失敗＝第 1 關，不再是 0） */
            scoreBase: 1,
            numText: function (v) { return '第 ' + v + ' 關'; },
            fmtBest: function (v) { return '第 ' + v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關，在第 ' + S.level + ' 關結束']; },
            setup: setup
        });
    }

    function pathD(pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' '); }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeCurve(level, api.rand, lastType);
        lastType = q.type;
        var need = reqSim(level);
        api.info = q;
        console.log('[照抄曲線] 第 ' + level + ' 關：' + TYPE_NAME[q.type] + '，全長 ' + q.len.toFixed(1) + ' 像素；要求相似度 ' + need.toFixed(4) + '％；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, top = 48;
        var shift = Math.round((W - PW) / 2);
        stage.style.setProperty('--cpc-shift', shift + 'px');
        function panel(side) {
            var p = h('div', { 'class': 'cpc-panel cpc-panel--' + side });
            p.style.width = PW + 'px'; p.style.height = PH + 'px'; p.style.top = top + 'px'; p.style.left = (side === 'L' ? 0 : W - PW) + 'px';
            var svg = kit.svg('svg', { 'class': 'cpc-svg', viewBox: '0 0 ' + PW + ' ' + PH, width: PW, height: PH }, p);
            stage.appendChild(p);
            return { el: p, svg: svg };
        }
        var L = panel('L'), R = panel('R');
        var labL = h('div', { 'class': 'cpc-lab', text: '照這條畫' }), labR = h('div', { 'class': 'cpc-lab', text: '你畫在這裡' });
        labL.style.left = '0px'; labL.style.width = PW + 'px'; labR.style.left = (W - PW) + 'px'; labR.style.width = PW + 'px';
        stage.appendChild(labL); stage.appendChild(labR);
        kit.svg('path', { d: pathD(q.pts), 'class': 'cpc-curve' }, L.svg);
        function markers(svg) {
            return { s: kit.svg('circle', { cx: q.start.x, cy: q.start.y, r: 13, 'class': 'cpc-start' }, svg), e: kit.svg('circle', { cx: q.end.x, cy: q.end.y, r: 13, 'class': 'cpc-end' }, svg) };
        }
        markers(L.svg);
        var drawn = kit.svg('path', { d: '', 'class': 'cpc-draw' }, R.svg);
        var mk = markers(R.svg);                                      /* 右邊的端點記號：手指靠近另一個端點時亮綠框（提醒可以放開了） */
        function clearNear() { mk.s.classList.remove('cpc-near'); mk.e.classList.remove('cpc-near'); }
        var msg = h('div', { 'class': 'qz-note cpc-msg', text: '從黃點或水藍點開始，一路畫到另一個端點，放開手指才判定' });
        msg.style.top = (top + PH + 12) + 'px';
        stage.appendChild(msg);

        var locked = false, cur = null;                     /* cur：目前這一筆 { anchor, pts, id } */
        function render() { drawn.setAttribute('d', cur ? pathD(cur.pts) : ''); }
        function lenOf(pts) { return polyLen(pts); }
        function finishWith(pts, anchor) {
            if (locked || api.over) return;
            locked = true; cur = null; api.stopTimer();
            var path = anchor === 'end' ? pts.slice().reverse() : pts;
            var raw = similarity(q.pts, path), sim = Leaderboard.fake4(raw), ok = sim >= need;
            console.log('[照抄曲線] 相似度 ' + sim.toFixed(4) + '％（真實 ' + raw.toFixed(6) + '），要求 ' + need.toFixed(4) + '％ → ' + (ok ? '過關' : '沒過'));
            drawn.setAttribute('d', pathD(pts));
            msg.textContent = '兩張圖疊在一起…';
            stage.classList.add('cpc-stage--merge');
            api.after(1100, function () {
                msg.innerHTML = '相似度 <b class="' + (ok ? 'qz-ok' : 'qz-bad') + '">' + sim.toFixed(4) + '％</b>（要求 ' + need.toFixed(4) + '％）';
                kit.flash(stage, ok, api.my);
                if (ok) api.pass({ delay: 1500 });
                else api.fail({ delay: 2400, lines: ['相似度 ' + sim.toFixed(4) + '％，沒達到要求的 ' + need.toFixed(4) + '％', '平均偏離 ' + chamfer(q.pts, path).toFixed(4) + ' 像素（曲線種類：' + TYPE_NAME[q.type] + '）'] });
            });
        }
        /* 在右邊長方格裡畫 */
        R.el.addEventListener('pointerdown', function (e) {
            if (locked || api.over || cur) return;
            var p = kit.localPt(e, R.svg), ds = kit.dist(p.x, p.y, q.start.x, q.start.y), de = kit.dist(p.x, p.y, q.end.x, q.end.y);
            if (Math.min(ds, de) > START_R) { msg.textContent = '請先按在黃點或水藍點上，再開始畫'; return; }
            e.preventDefault();
            try { R.el.setPointerCapture(e.pointerId); } catch (err) { }
            cur = { anchor: ds <= de ? 'start' : 'end', pts: [ds <= de ? { x: q.start.x, y: q.start.y } : { x: q.end.x, y: q.end.y }], id: e.pointerId };
            msg.textContent = '一路畫到另一個端點，放開手指才判定';
            render();
        });
        R.el.addEventListener('pointermove', function (e) {
            if (!cur || e.pointerId !== cur.id || locked) return;
            var evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
            for (var i = 0; i < evs.length; i++) {
                var p = kit.localPt(evs[i], R.svg);
                p = { x: kit.clamp(p.x, 2, PW - 2), y: kit.clamp(p.y, 2, PH - 2) };
                var last = cur.pts[cur.pts.length - 1];
                if (kit.dist(p.x, p.y, last.x, last.y) < 1.5) continue;
                cur.pts.push(p);
            }
            /* V1.34：手指碰到另一個端點附近不會自動判定（可能只是路過），只讓那個端點亮綠框提醒「放開就會判定」 */
            var lp = cur.pts[cur.pts.length - 1], oth = cur.anchor === 'start' ? q.end : q.start;
            (cur.anchor === 'start' ? mk.e : mk.s).classList.toggle('cpc-near', kit.dist(lp.x, lp.y, oth.x, oth.y) <= END_R && lenOf(cur.pts) >= MIN_DRAW);
            render();
        });
        /* 手指離開螢幕才判定：放開的位置在另一個端點附近（END_R 以內）、而且畫夠長（MIN_DRAW）→ 畫完了，比較相似度；否則筆跡清掉可以重畫（pointercancel 一律當作沒畫完） */
        function up(e) {
            if (!cur || e.pointerId !== cur.id || locked) return;
            var other = cur.anchor === 'start' ? q.end : q.start, lastP = cur.pts[cur.pts.length - 1], mine = cur;
            clearNear();
            if (e.type === 'pointerup' && kit.dist(lastP.x, lastP.y, other.x, other.y) <= END_R && lenOf(mine.pts) >= MIN_DRAW) {
                mine.pts.push({ x: other.x, y: other.y });
                finishWith(mine.pts, mine.anchor);
                return;
            }
            cur = null; render();
            msg.textContent = '放開的地方不在另一個端點上，還沒畫完，可以重畫';
        }
        R.el.addEventListener('pointerup', up); R.el.addEventListener('pointercancel', up);
        api.timer(timeMs(level), function () {
            if (locked || api.over) return;
            locked = true; cur = null;
            api.fail({ delay: 1800, lines: ['時間到！還沒畫完', '曲線種類：' + TYPE_NAME[q.type]] });
        });
        if (level === 1 && kit.once('copycurve.hint')) kit.hintOn(stage, null, { mode: 'drag', x: W - PW + q.start.x, y: top + q.start.y, dx: q.end.x - q.start.x, dy: q.end.y - q.start.y, delay: 600, text: '請照著左邊的線拖曳' });

        api.solve = function () { finishWith(q.pts.map(function (p) { return { x: p.x, y: p.y }; }), 'start'); };
        api.wrong = function () {
            /* 故意亂畫：起點 → 右側中間 → 左下角 → 終點，離目標曲線很遠 */
            var bad = densify([q.start, { x: PW - 6, y: PH / 2 }, { x: 6, y: PH - 6 }, q.end], 3);
            finishWith(bad, 'start');
        };
    }

    var G = {
        id: ID,
        name: '照抄曲線',
        rule: '左邊的長方格有一條綠色曲線，兩端是黃色起點和水藍色終點。請用手指在右邊的長方格，從其中一個端點開始，**照著畫出一樣的曲線**，**一直畫到另一個端點**。兩張圖會疊在一起比較相似度，達到要求才過關。**手指離開螢幕才會判定**（在另一個端點上放開才算畫完）。越後面，曲線越彎、形狀越花俏，要求的相似度也越高！',
        mount: mount,
        score: SCORE,
        test: {
            reqSim: reqSim, timeMs: timeMs, typesFor: typesFor, polyLen: polyLen, resample: resample, densify: densify, distToPoly: distToPoly, chamfer: chamfer, similarity: similarity,
            makeCurve: makeCurve, fit: fit, genClip: genClip, genSpiral: genSpiral, genRope: genRope, genWave: genWave, genRight: genRight, genBolt: genBolt, bendsFor: bendsFor, fallbackCount: function () { return fbCount; }, RIGHT_MAX: RIGHT_MAX, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, BENDS: BENDS, ROPE_P: ROPE_P, END_R: END_R, MIN_DRAW: MIN_DRAW, TIME_S: TIME_S, REQ: REQ, PW: PW, PH: PH, MG: MG, MIN_SEP: MIN_SEP, LEN_RANGE: LEN_RANGE, LEN_MIN_TYPE: LEN_MIN_TYPE, D0: D0, TYPE_RANGE: TYPE_RANGE, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
