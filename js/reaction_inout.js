/* ═══════════════════════════════════════════════════════════════════
   reaction_inout.js — 秒反應・圈內圈外（企劃 271）
   一條很長、彎來彎去、首尾相連的紅色繩圈（自己不交叉），上面有一隻螞蟻。**螞蟻在繩圈裡面還是外面？** 點「裡面」或「外面」。
   ───────────────────────────────────────────────────────────────────
   · 繩圈怎麼造（makeLevel）：用「完美迷宮」——m×m 個房間、用隨機深度優先搜尋打通牆壁，房間與通道連成一棵樹（沒有環）。
     把房間和打通的通道（P，繩圈裡面）加粗成「一整塊」，剩下的牆和外框（W，繩圈外面）也是連成一片。
     因為 P 是一棵樹加粗、沒有洞，P 的邊界就是**剛好一條**不交叉、不碰到自己的封閉曲線——這就是繩圈（boundaryLoop 把邊界一段一段接起來，轉角畫成圓弧）。
     格子座標：(2m+1)×(2m+1)，房間在奇數列奇數欄，其餘（牆、通道、柱子）在偶數列或偶數欄；每個 2×2 的小方塊一定有一個房間和一個柱子，所以不會有兩塊 P 只靠對角相連的「夾點」。
   · 螞蟻放在哪：50% 在裡面（P 的格子）、50% 在外面（W 的格子）。「看起來被包住」的位置才有挑戰：
     外面的格子要離外框夠遠（在 W 裡走到外框要走很多步＝很深的凹口），裡面的格子要離迷宮入口夠遠（深深的死巷）。
     這個「深度下限」隨關卡增加（DEPTH_MIN），找不到夠深的格子就用最深的。
   · **不規則的隨機曲線（V1.36.0，玩家意見：線條太規則整齊，一秒就看出內外）**：迷宮的骨架還是格子，但畫出來的繩圈不再是橫平豎直的——
       ① 格線間隔不均勻（gridLines：每一格的寬度在 1 ± VARIANCE 之間隨機，再縮放到總長不變），通道有寬有窄；
       ② 每個轉角的圓弧大小不一樣（ROUND × 0.5～1.5 倍）；
       ③ 整條繩圈再經過一個平滑的「扭曲」（warpPoint：用幾個不同頻率的正弦波把每個點推開一點點，推開的幅度 WARP_A，梯度小於 1 所以不會讓線穿過自己）——直線變成蜿蜒的曲線。
     扭曲是一對一的連續變形，繩圈還是剛好一條不交叉的封閉曲線，螞蟻的位置跟著一起扭曲，裡外不變；出題時用「線段兩兩不相交」與「射線法」驗證，
     驗證不過就換一組扭曲參數，最後才退回沒有扭曲的版本。螞蟻縮小成原本的一半（ANT_SIZE ＝ 格子的 0.45 倍）。
   · 答案用格子是否屬於 P 決定；測試另外用「點在多邊形內」（射線法）驗證螞蟻的位置跟繩圈的內外一致。
   · 難度（線性）：迷宮 3×3 → 10×10 個房間（ROOMS）、深度下限 0 → 8 步（DEPTH_MIN）、格線不均勻程度 0.15 → 0.5（VARIANCE）、扭曲幅度 0.1 → 0.34 格（WARP_A）、限時 8 → 3 秒（TIME_S）。錯一次就結束，防亂按。
   · 揭曉：繩圈裡面整塊塗上淡綠色，螞蟻在不在色塊裡一目了然。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'inout';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var ROOMS = [3, 10];                        /* 迷宮每邊幾個房間：第 1 關 → 到頂（格子是 2m+1 邊） */
    var DEPTH_MIN = [0, 8];                     /* 螞蟻所在格子的「深度」下限（步數）：第 1 關 → 到頂 */
    var TIME_S = [8, 3];                        /* 每題限時（秒）：第 1 關 → 到頂 */
    var ROUND = 0.3;                            /* 繩圈轉角的圓弧大小（佔一格的比例；每個轉角再乘 0.5～1.5 倍隨機） */
    var VARIANCE = [0.15, 0.5];                 /* 格線間隔的不均勻程度：每一格的寬度在 1 ± 這個值 之間隨機：第 1 關 → 到頂 */
    var WARP_A = [0.1, 0.34];                   /* 整條繩圈的扭曲幅度（格）：第 1 關 → 到頂（太大會讓窄通道的兩側碰在一起，出題時有驗證） */
    var ANT_SIZE = 0.45;                        /* 螞蟻的大小（格子的幾倍）：V1.36.0 從 0.9 縮成一半 */
    var STEP = 0.3;                             /* 把繩圈切成小段（格）再扭曲，直線才會被扭成曲線 */
    var MAX_LEVEL = 90;
    var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function roomsFor(level) { return Math.round(ramp(level, ROOMS)); }
    function depthMinFor(level) { return Math.round(ramp(level, DEPTH_MIN)); }
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }
    function varianceFor(level) { return Math.round(ramp(level, VARIANCE) * 10000) / 10000; }
    function warpAFor(level) { return Math.round(ramp(level, WARP_A) * 10000) / 10000; }
    /* 用隨機深度優先搜尋造 m×m 的完美迷宮；回傳格子表 P（(2m+1)² 個，1＝房間或通道＝繩圈裡面）和每個房間的「離入口幾步」depth（以房間為單位）*/
    function makeMaze(m, rand) {
        var G = 2 * m + 1, P = new Int8Array(G * G), seen = {}, stack = [], depth = {};
        function cellOf(r, c) { return (2 * r + 1) * G + (2 * c + 1); }
        var r0 = kit.randInt(0, m - 1, rand), c0 = kit.randInt(0, m - 1, rand);
        stack.push([r0, c0]); seen[r0 + ',' + c0] = true; P[cellOf(r0, c0)] = 1; depth[cellOf(r0, c0)] = 0;
        while (stack.length) {
            var cur = stack[stack.length - 1], opts = [];
            DIRS.forEach(function (d) { var nr = cur[0] + d[0], nc = cur[1] + d[1]; if (nr >= 0 && nr < m && nc >= 0 && nc < m && !seen[nr + ',' + nc]) opts.push([nr, nc]); });
            if (!opts.length) { stack.pop(); continue; }
            var nx = kit.pick(opts, rand), a = cellOf(cur[0], cur[1]), b = cellOf(nx[0], nx[1]);
            P[(a + b) / 2] = 1; P[b] = 1;                                       /* 打通兩個房間中間的那一格 */
            depth[b] = depth[a] + 1; seen[nx[0] + ',' + nx[1]] = true; stack.push(nx);
        }
        return { G: G, m: m, P: P, depth: depth, root: cellOf(r0, c0) };
    }
    /* P 的格子裡，每一格離入口多遠（把通道也算進去，用格子數）；W 的格子離外框多遠（走 W 的格子，4 個方向）；-1＝不可能 */
    function distances(G, P, root) {
        var dIn = new Int32Array(G * G).fill(-1), dOut = new Int32Array(G * G).fill(-1), q = [], i, head;
        dIn[root] = 0; q.push(root); head = 0;
        while (head < q.length) { var cur = q[head++], r = Math.floor(cur / G), c = cur % G; DIRS.forEach(function (d) { var nr = r + d[0], nc = c + d[1]; if (nr < 0 || nr >= G || nc < 0 || nc >= G) return; var nn = nr * G + nc; if (P[nn] && dIn[nn] < 0) { dIn[nn] = dIn[cur] + 1; q.push(nn); } }); }
        q = []; for (i = 0; i < G * G; i++) { var rr = Math.floor(i / G), cc = i % G; if (!P[i] && (rr === 0 || cc === 0 || rr === G - 1 || cc === G - 1)) { dOut[i] = 0; q.push(i); } }
        head = 0;
        while (head < q.length) { var cu = q[head++], r2 = Math.floor(cu / G), c2 = cu % G; DIRS.forEach(function (d) { var nr = r2 + d[0], nc = c2 + d[1]; if (nr < 0 || nr >= G || nc < 0 || nc >= G) return; var nn = nr * G + nc; if (!P[nn] && dOut[nn] < 0) { dOut[nn] = dOut[cu] + 1; q.push(nn); } }); }
        return { dIn: dIn, dOut: dOut };
    }
    /* 區域 P 的邊界：把每一格四邊中「對面不是 P」的邊收集起來（P 在左手邊的方向），接成一圈；回傳 { loops（每圈是頂點座標 [x,y] 的陣列，已合併同方向的邊）, edges（總邊數）} */
    function boundaryLoop(G, P) {
        var next = {}, count = 0, startKey = null;
        function key(x, y) { return x + ',' + y; }
        function add(x1, y1, x2, y2) { next[key(x1, y1)] = [x2, y2]; count++; if (startKey === null) startKey = key(x1, y1); }
        for (var r = 0; r < G; r++) for (var c = 0; c < G; c++) {
            if (!P[r * G + c]) continue;
            if (r === 0 || !P[(r - 1) * G + c]) add(c, r, c + 1, r);               /* 上邊：往右走（P 在右下，順時針） */
            if (c === G - 1 || !P[r * G + c + 1]) add(c + 1, r, c + 1, r + 1);      /* 右邊：往下 */
            if (r === G - 1 || !P[(r + 1) * G + c]) add(c + 1, r + 1, c, r + 1);    /* 下邊：往左 */
            if (c === 0 || !P[r * G + c - 1]) add(c, r + 1, c, r);                  /* 左邊：往上 */
        }
        var loops = [], used = 0, visited = {};
        Object.keys(next).forEach(function (k0) {
            if (visited[k0]) return;
            var pts = [], k = k0;
            while (!visited[k]) { visited[k] = true; var p = k.split(',').map(Number); pts.push(p); used++; var nx = next[k]; k = key(nx[0], nx[1]); if (!next[k] && !visited[k]) break; }
            /* 合併同方向的連續邊：只留轉角的頂點 */
            var n = pts.length, out = [];
            for (var i = 0; i < n; i++) { var a = pts[(i + n - 1) % n], b = pts[i], c2 = pts[(i + 1) % n]; if ((b[0] - a[0]) * (c2[1] - b[1]) - (b[1] - a[1]) * (c2[0] - b[0]) !== 0) out.push(b); }
            loops.push(out);
        });
        return { loops: loops, edges: count, used: used };
    }
    /* 不均勻的格線座標（長度 G + 1，從 0 到 G）：每一格的寬度在 1 ± v 之間隨機，再縮放到總長剛好 G */
    function gridLines(G, v, rand) {
        var w = [], sum = 0, i, out = [0], acc = 0;
        for (i = 0; i < G; i++) { w.push(1 + v * (rand() * 2 - 1)); sum += w[i]; }
        for (i = 0; i < G; i++) { acc += w[i] * G / sum; out.push(acc); }
        out[G] = G;
        return out;
    }
    /* 扭曲的參數：幅度 a（格）、四個隨機頻率與相位。頻率對應 4～8 格的波長，a ≤ 0.34 時扭曲的梯度小於 1（一對一、不會讓線穿過自己） */
    function warpParams(a, rand) {
        function k() { return 2 * Math.PI / kit.randFloat(4, 8, rand); }
        function p() { return kit.randFloat(0, 2 * Math.PI, rand); }
        return { a: a, k1: k(), k2: k(), k3: k(), k4: k(), p1: p(), p2: p(), p3: p(), p4: p() };
    }
    /* 扭曲一個點（單位：格）：x、y 各被兩個不同方向、不同頻率的正弦波推開一點點 */
    function warpPoint(x, y, w) {
        return [x + w.a * (Math.sin(w.k1 * y + w.p1) + 0.5 * Math.sin(w.k2 * (x + y) * 0.7 + w.p2)), y + w.a * (Math.sin(w.k3 * x + w.p3) + 0.5 * Math.sin(w.k4 * (x - y) * 0.7 + w.p4))];
    }
    /* 兩線段 (a,b) (c,d) 是不是相交（不含端點相接） */
    function segCross(a, b, c, d) {
        function o(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
        var o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
        return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
    }
    /* 這個封閉折線（點的陣列）有沒有自己穿過自己（相鄰的線段不比） */
    function selfCrosses(pts) {
        var n = pts.length, i, j;
        for (i = 0; i < n; i++) {
            var a = pts[i], b = pts[(i + 1) % n];
            for (j = i + 2; j < n; j++) {
                if (i === 0 && j === n - 1) continue;
                if (Math.min(a[0], b[0]) > Math.max(pts[j][0], pts[(j + 1) % n][0]) || Math.max(a[0], b[0]) < Math.min(pts[j][0], pts[(j + 1) % n][0])) continue;
                if (segCross(a, b, pts[j], pts[(j + 1) % n])) return true;
            }
        }
        return false;
    }
    /* 把迷宮的邊界（整數頂點的轉角序列）畫成「不規則的曲線」：先對應到不均勻的格線座標，轉角換成隨機大小的圓弧，直線切成小段，最後整條扭曲。
       回傳封閉折線的點 [[x, y]…]（單位：格；跟螞蟻用同一套座標）。 */
    function curvePoints(loop, xs, ys, warp, rand) {
        var n = loop.length, P = loop.map(function (v) { return [xs[v[0]], ys[v[1]]]; }), arcs = [], i, t;
        for (i = 0; i < n; i++) {
            var a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n], la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
            var r = Math.min(ROUND * kit.randFloat(0.5, 1.5, rand), 0.5 * la, 0.5 * lc);
            arcs.push({ p1: [b[0] + (a[0] - b[0]) * r / la, b[1] + (a[1] - b[1]) * r / la], b: b, p2: [b[0] + (c[0] - b[0]) * r / lc, b[1] + (c[1] - b[1]) * r / lc] });
        }
        var pts = [];
        for (i = 0; i < n; i++) {
            var A = arcs[i], B = arcs[(i + 1) % n];
            for (t = 0; t <= 5; t++) { var u = t / 5; pts.push([(1 - u) * (1 - u) * A.p1[0] + 2 * u * (1 - u) * A.b[0] + u * u * A.p2[0], (1 - u) * (1 - u) * A.p1[1] + 2 * u * (1 - u) * A.b[1] + u * u * A.p2[1]]); }     /* 轉角的圓弧（二次貝茲曲線） */
            var len = Math.hypot(B.p1[0] - A.p2[0], B.p1[1] - A.p2[1]), m = Math.max(1, Math.ceil(len / STEP));
            for (t = 1; t < m; t++) pts.push([A.p2[0] + (B.p1[0] - A.p2[0]) * t / m, A.p2[1] + (B.p1[1] - A.p2[1]) * t / m]);                                                                              /* 直線切成小段 */
        }
        return warp ? pts.map(function (p) { return warpPoint(p[0], p[1], warp); }) : pts;
    }
    /* 封閉折線 → SVG path（單位：每格 cs px） */
    function polyPath(pts, cs) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + (p[0] * cs).toFixed(2) + ',' + (p[1] * cs).toFixed(2); }).join(' ') + ' Z'; }
    /* 點 (x, y) 在不在多邊形 poly（頂點 [x,y] 的陣列）裡面：射線法 */
    function pointInPoly(x, y, poly) {
        var inside = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
    }
    /* 把一圈頂點畫成圓角的 SVG path（單位：每格 cs px；r＝圓弧離頂點的距離）*/
    function loopPath(loop, cs, round) {
        var n = loop.length, d = '';
        function pt(p, q, t) { return [(p[0] + (q[0] - p[0]) * t) * cs, (p[1] + (q[1] - p[1]) * t) * cs]; }
        for (var i = 0; i < n; i++) {
            var a = loop[(i + n - 1) % n], b = loop[i], c = loop[(i + 1) % n];
            var la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
            var p1 = pt(b, a, Math.min(round, 0.5 * 1) / Math.max(la, 1e-9) * 1), p2 = pt(b, c, Math.min(round, 0.5) / Math.max(lc, 1e-9));
            d += (i === 0 ? 'M' : 'L') + p1[0].toFixed(2) + ',' + p1[1].toFixed(2) + ' Q' + (b[0] * cs).toFixed(2) + ',' + (b[1] * cs).toFixed(2) + ' ' + p2[0].toFixed(2) + ',' + p2[1].toFixed(2) + ' ';
        }
        return d + 'Z';
    }
    /* 出一關：{ G, m, P, loop（繩圈的轉角頂點）, ant: { r, c, cell, inside }, depthMin, depth（螞蟻所在格子的深度）, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var m = roomsFor(level), dmin = depthMinFor(level), mz = makeMaze(m, rand), G = mz.G, P = mz.P, ds = distances(G, P, mz.root);
        var wantInside = rand() < 0.5, cands = [], i;
        function collect(inside, minDepth) {
            var out = [];
            for (i = 0; i < G * G; i++) {
                var rr = Math.floor(i / G), cc = i % G;
                if (inside) { if (P[i] && ds.dIn[i] >= minDepth) out.push(i); }
                else if (!P[i] && rr > 0 && cc > 0 && rr < G - 1 && cc < G - 1 && ds.dOut[i] >= minDepth) out.push(i);
            }
            return out;
        }
        var md = dmin;
        while (md >= 0) { cands = collect(wantInside, md); if (cands.length) break; md--; }       /* 找不到夠深的就放寬，一路放寬到有為止 */
        if (!cands.length) { wantInside = !wantInside; cands = collect(wantInside, 0); }
        var cell = kit.pick(cands, rand), loops = boundaryLoop(G, P).loops, loop = loops[0], inside = !!P[cell], rr0 = Math.floor(cell / G), cc0 = cell % G;
        /* 不規則的曲線：不均勻的格線＋整條扭曲；驗證「不自己交叉」和「螞蟻的內外沒變」，不過就換一組參數，最後退回沒有扭曲的版本 */
        var curve = null, antXY = null, v = varianceFor(level), a = warpAFor(level), xs = gridLines(G, v, rand), ys = gridLines(G, v, rand);
        for (var tr = 0; tr < 8; tr++) {
            var amp = tr < 6 ? a : (tr === 6 ? a / 2 : 0), w = amp > 0 ? warpParams(amp, rand) : null;
            var pts = curvePoints(loop, xs, ys, w, rand), cx = (xs[cc0] + xs[cc0 + 1]) / 2, cy = (ys[rr0] + ys[rr0 + 1]) / 2, ap = w ? warpPoint(cx, cy, w) : [cx, cy];
            if (selfCrosses(pts) || pointInPoly(ap[0], ap[1], pts) !== inside) continue;
            curve = pts; antXY = ap; break;
        }
        if (!curve) { curve = curvePoints(loop, gridLines(G, 0, rand), gridLines(G, 0, rand), null, rand); antXY = [cc0 + 0.5, rr0 + 0.5]; }
        return { G: G, m: m, P: P, loop: loop, curve: curve, antXY: antXY, ant: { r: rr0, c: cc0, cell: cell, inside: inside }, depthMin: dmin, depth: P[cell] ? ds.dIn[cell] : ds.dOut[cell], variance: v, warpA: a, level: level };
    }
    function rating(n) {
        if (n >= 25) return '迷宮高手！';
        if (n >= 15) return '眼力很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '從螞蟻往外畫一條線，數穿過繩子幾次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'iof-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 螞蟻（SVG）：三節身體、六隻腳、兩根觸角；中心在 (x, y)、大小 s、朝向 deg 度 */
    function drawAnt(parent, x, y, s, deg) {
        var g = kit.svg('g', { 'class': 'iof-ant', transform: 'translate(' + x + ',' + y + ') rotate(' + deg + ')' }, parent);
        [-1, 0, 1].forEach(function (k) {
            kit.svg('line', { 'class': 'iof-ant__leg', x1: k * s * 0.12, y1: 0, x2: k * s * 0.3, y2: -s * 0.4 }, g);
            kit.svg('line', { 'class': 'iof-ant__leg', x1: k * s * 0.12, y1: 0, x2: k * s * 0.3, y2: s * 0.4 }, g);
        });
        kit.svg('line', { 'class': 'iof-ant__leg', x1: s * 0.42, y1: 0, x2: s * 0.62, y2: -s * 0.2 }, g);
        kit.svg('line', { 'class': 'iof-ant__leg', x1: s * 0.42, y1: 0, x2: s * 0.62, y2: s * 0.2 }, g);
        kit.svg('ellipse', { 'class': 'iof-ant__body', cx: -s * 0.3, cy: 0, rx: s * 0.22, ry: s * 0.17 }, g);
        kit.svg('ellipse', { 'class': 'iof-ant__body', cx: 0, cy: 0, rx: s * 0.14, ry: s * 0.11 }, g);
        kit.svg('circle', { 'class': 'iof-ant__body', cx: s * 0.28, cy: 0, r: s * 0.13 }, g);
        return g;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), G = q.G;
        api.info = q;
        console.log('[圈內圈外] 第 ' + level + ' 關：迷宮 ' + q.m + '×' + q.m + '（格子 ' + G + '×' + G + '）；螞蟻在 (' + q.ant.r + ',' + q.ant.c + ') ' + (q.ant.inside ? '裡面' : '外面') + '，深度 ' + q.depth + '（下限 ' + q.depthMin + '）；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, cs = Math.floor(Math.min((W - 16) / G, (H - 220) / G)), BS = cs * G, bx = Math.round((W - BS) / 2), by = 62;
        var field = h('div', { 'class': 'iof-field' });
        stage.appendChild(field);
        field.appendChild(h('div', { 'class': 'qz-note iof-tip', text: '螞蟻在繩圈的裡面還是外面？' }));
        var svg = kit.svg('svg', { 'class': 'iof-svg', viewBox: '0 0 ' + BS + ' ' + BS, width: BS, height: BS }, field);
        svg.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;';
        var d = polyPath(q.curve, cs);                                           /* 不規則的曲線（V1.36.0） */
        var fill = kit.svg('path', { 'class': 'iof-fill', d: d }, svg);              /* 揭曉時才顯示的「裡面」淡綠色 */
        kit.svg('path', { 'class': 'iof-rope', d: d }, svg);
        drawAnt(svg, q.antXY[0] * cs, q.antXY[1] * cs, cs * ANT_SIZE, Math.floor(api.rand() * 360));
        var info = h('div', { 'class': 'qz-note iof-info', text: '' });
        info.style.top = (by + BS + 6) + 'px';
        field.appendChild(info);
        var done = false;
        var grid = kit.btnGrid(field, [
            { text: '裡面', kind: 'line', cls: 'iof-btn', onTap: function () { judge(true); } },
            { text: '外面', kind: 'line', cls: 'iof-btn', onTap: function () { judge(false); } }
        ], { cols: 2, h: 100, gap: 12 });
        api.timer(timeMs(level), function () { judge(null); });
        if (level === 1 && kit.once('inout.hint')) kit.hintOn(stage, grid.btns[q.ant.inside ? 0 : 1], { mode: 'tap', delay: 700, text: '請點「裡面」或「外面」' });
        function judge(inside) {
            if (done || api.over) return;
            done = true;
            var ok = inside === q.ant.inside;
            fill.classList.add('iof-fill--show');
            grid.btns[q.ant.inside ? 0 : 1].classList.add('iof-btn--ok');
            if (inside !== null && !ok) grid.btns[inside ? 0 : 1].classList.add('iof-btn--bad');
            info.textContent = '螞蟻在繩圈' + (q.ant.inside ? '裡面' : '外面') + (ok ? '，答對了！' : (inside === null ? '（時間到）' : '，答錯了'));
            kit.flash(stage, ok, api.my);
            if (ok) { api.pass({ delay: 1500 }); return; }
            api.fail({ delay: 3000, lines: [inside === null ? '時間到！' : '答錯了', '螞蟻在繩圈' + (q.ant.inside ? '裡面' : '外面') + '（綠色的是繩圈裡面）'] });
        }
        api.solve = function () { judge(q.ant.inside); };
        api.wrong = function () { judge(!q.ant.inside); };
    }

    var G = {
        id: ID,
        name: '圈內圈外',
        rule: '地上有一條彎來彎去、首尾相連的紅色繩圈（不會自己交叉），上面有一隻螞蟻。**螞蟻在繩圈的裡面還是外面？** 點「裡面」或「外面」。繩圈是一條彎彎曲曲、粗細不一的不規則曲線，螞蟻又小，常常卡在一條很深的凹口裡，**看起來被包住，其實在外面**。小技巧：**從螞蟻往旁邊畫一條線出去，數穿過繩子幾次**——奇數次在裡面、偶數次在外面。答錯或來不及就結束，看你能過幾關。越後面，繩圈越長、凹口越深、時間越短！',
        mount: mount,
        score: SCORE,
        test: {
            roomsFor: roomsFor, depthMinFor: depthMinFor, timeMs: timeMs, varianceFor: varianceFor, warpAFor: warpAFor, gridLines: gridLines, warpParams: warpParams, warpPoint: warpPoint, segCross: segCross, selfCrosses: selfCrosses, curvePoints: curvePoints, polyPath: polyPath, makeMaze: makeMaze, distances: distances, boundaryLoop: boundaryLoop, pointInPoly: pointInPoly, loopPath: loopPath, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ROOMS: ROOMS, DEPTH_MIN: DEPTH_MIN, TIME_S: TIME_S, ROUND: ROUND, VARIANCE: VARIANCE, WARP_A: WARP_A, ANT_SIZE: ANT_SIZE, STEP: STEP, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
