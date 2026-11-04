/* ═══════════════════════════════════════════════════════════════════
   reaction_kit4.js — 秒反應的第四批共用小工具（V1.34.0，給新的 51 款遊戲用；掛在 Reaction.kit 底下，要排在 reaction_kit3.js 之後）
   ───────────────────────────────────────────────────────────────────
   · 方格地圖（格子編號 i ＝ 列 × n ＋ 欄，n×n 的方形地圖）：
       kit.gridNeighbors(n, i)            i 的相鄰格（上右下左，超出地圖的略過）
       kit.gridAdjacent(n, a, b)          兩格是不是上下左右相鄰
       kit.gridConnected(n, blocked, s)   從 s 出發，能不能走到所有「沒被擋住」的格子（blocked 是 Uint8Array，1＝擋住）
       kit.gridParityOk(n, blocked, s)    棋盤格奇偶檢查：一定無解的「走遍每一格」配置先擋掉
       kit.hamPath(n, blocked, s, rand, budget)   隨機找一條從 s 出發、走遍每一格空地剛好一次的路（漢米爾頓路徑），找不到回傳 null
   · 蜿蜒曲線（「誰先到？」「照抄曲線」共用）：
       kit.meander(o, rand)               像手畫的蜿蜒線（圓弧接圓弧，大多左右交替、偶爾繞圈），整條不交疊；回傳密集的點 [{x, y, s}]
       kit.selfClear(pts, clear, sep)     曲線有沒有自己貼自己（弧長相隔超過 sep 的兩點距離都要 ≥ clear）
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。 */
    'use strict';
    var kit = Reaction.kit;                             /* kit：闖關遊戲共用的工具箱（計時、亂數、線性難度 ramp、過關失敗骨架…） */
    var DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];      /* 上、右、下、左（順時針） */
    var SEARCH_BUDGET = 12000;                          /* 找路時最多展開幾個節點（超過就放棄；有解的配置通常幾百個節點就找到了） */

    /* 格子編號 i ＝ 列 × n ＋ 欄；回傳 i 的相鄰格（上右下左，超出房間的略過） */
    function neighbors(n, i) {
        var r = Math.floor(i / n), c = i % n, out = []; /* Math.floor：無條件捨去成整數 */
        for (var d = 0; d < 4; d++) {
            var rr = r + DIRS[d][0], cc = c + DIRS[d][1];
            if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
        }
        return out;
    }
    function adjacent(n, a, b) { return Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs(a % n - b % n) === 1; }  /* Math.abs：取絕對值（去掉負號） */
    /* 房間裡「空地」連不連得起來（從 start 出發能走到全部空地）；blocked 是家具格的集合（Uint8Array，1＝家具） */
    function connected(n, blocked, start) {
        var seen = new Uint8Array(n * n), stack = [start], cnt = 0, free = 0, i;
        for (i = 0; i < n * n; i++) if (!blocked[i]) free++;
        seen[start] = 1;
        while (stack.length) {
            var cur = stack.pop(); cnt++;
            neighbors(n, cur).forEach(function (j) { if (!blocked[j] && !seen[j]) { seen[j] = 1; stack.push(j); } });  /* forEach：對陣列的每個元素各做一次 */
        }
        return cnt === free;
    }
    /* 棋盤格奇偶檢查（很便宜，先擋掉一定無解的配置，不然搜尋會白白花掉全部的節點預算）：方格地板依 (列＋欄) 的奇偶塗成兩色，一步一定換色。
       空地共 F 格：F 是偶數 → 兩色格數必須一樣多；F 是奇數 → 起點必須在「多一格」的那一色，而且兩色只差 1 格。 */
    function parityOk(n, blocked, start) {
        var a = 0, b = 0, i;
        for (i = 0; i < n * n; i++) if (!blocked[i]) { if ((Math.floor(i / n) + i % n) % 2) b++; else a++; }
        if ((a + b) % 2 === 0) return a === b;
        var startColor = (Math.floor(start / n) + start % n) % 2 ? 1 : 0;
        return Math.abs(a - b) === 1 && ((a > b) === (startColor === 0));
    }
    /* 找一條從 start 出發、走遍每一格空地剛好一次的路（漢米爾頓路徑）；找不到（或搜尋太久）回傳 null。
       做法：深度優先搜尋，下一步優先挑「出路少的鄰居」（Warnsdorff 規則）、同分隨機；每走一步先剪枝——
       剩下的空地必須還連得起來、而且「只剩一個出口的死角格」最多一個（那是整條路的終點）。 */
    function findPath(n, blocked, start, rand, budget) {
        rand = rand || Math.random; budget = budget || SEARCH_BUDGET;
        var total = n * n, free = 0, i;
        for (i = 0; i < total; i++) if (!blocked[i]) free++;
        var vis = new Uint8Array(total);
        for (i = 0; i < total; i++) vis[i] = blocked[i] ? 2 : 0;
        var path = [start], nodes = 0;
        vis[start] = 1;
        function degree(c) { var d = 0; neighbors(n, c).forEach(function (j) { if (!vis[j]) d++; }); return d; }
        /* 剪枝：從 head 出發，所有沒走過的空地必須連得起來；沒走過、而且「沒走過的鄰居」≤ 1 個（不算 head）的格子最多 1 個 */
        function ok(head, remaining) {
            if (!remaining) return true;
            var seen = new Uint8Array(total), stack = [], cnt = 0, deadEnds = 0;
            neighbors(n, head).forEach(function (j) { if (!vis[j] && !seen[j]) { seen[j] = 1; stack.push(j); } });
            while (stack.length) {
                var cur = stack.pop(); cnt++;
                var d = 0, adjHead = false;
                neighbors(n, cur).forEach(function (j) {
                    if (j === head) adjHead = true;
                    else if (!vis[j]) { d++; if (!seen[j]) { seen[j] = 1; stack.push(j); } }
                });
                if (d + (adjHead ? 1 : 0) <= 1) deadEnds++;            /* 能走進去的方向（沒走過的鄰居＋捲頭）只有 1 個以下：它只能是整條路的終點 */
            }
            return cnt === remaining && deadEnds <= 1;
        }
        function dfs(head, count) {
            if (count === free) return true;
            if (++nodes > budget) return false;
            var cand = neighbors(n, head).filter(function (j) { return !vis[j]; });  /* filter：留下符合條件的元素，回傳新陣列 */
            var scored = cand.map(function (j) { vis[j] = 1; var d = degree(j); vis[j] = 0; return { j: j, d: d, r: rand() }; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            scored.sort(function (a, b) { return a.d - b.d || a.r - b.r; });  /* sort：排序；比較函式回傳負數代表 a 排前面、回傳正數代表 b 排前面 */
            for (var k = 0; k < scored.length; k++) {
                var j2 = scored[k].j;
                vis[j2] = 1; path.push(j2);
                if (ok(j2, free - count - 1) && dfs(j2, count + 1)) return true;
                vis[j2] = 0; path.pop();
                if (nodes > budget) return false;
            }
            return false;
        }
        return dfs(start, 1) ? path.slice() : null;     /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
    }

    kit.gridNeighbors = neighbors;
    /* ═══ 蜿蜒曲線（「誰先到？」與「照抄曲線」共用）═══
       以前的曲線只是把轉折點往左右移動、折成直角、或是工整的迴紋針，很死板。現在改成像手畫的蜿蜒線：
       用「烏龜走路」的方式一段一段接起來——先直走一小段，再沿著一個圓弧轉彎（半徑、轉多少度都隨機），
       大多數時候左轉右轉交替（S 形的大圓弧），偶爾連續往同一邊轉（繞出圈圈、螺旋）。上下左右都能走，曲線可以往回繞，
       但整條曲線不能自己交疊或貼得太近（重疊會讓玩家誤判）。走完再整體縮放、置中，放進指定的範圍裡。 */
    /* 曲線有沒有自己貼自己：「弧長相隔超過 sep 的兩點」距離都要 ≥ clear（用格子雜湊，只比相鄰格子，O(n)）。pts＝[{x, y, s（累積弧長）}]，好＝true */
    function selfClear(pts, clear, sep) {
        var cell = clear, grid = {}, i;
        for (i = 0; i < pts.length; i++) {
            var key = Math.floor(pts[i].x / cell) + ',' + Math.floor(pts[i].y / cell);  /* Math.floor：無條件捨去成整數 */
            (grid[key] = grid[key] || []).push(i);
        }
        for (i = 0; i < pts.length; i++) {
            var a = pts[i], cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
            for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
                var arr = grid[(cx + dx) + ',' + (cy + dy)];
                if (!arr) continue;
                for (var m = 0; m < arr.length; m++) {
                    var j = arr[m]; if (j <= i || pts[j].s - a.s <= sep) continue;
                    var ddx = pts[j].x - a.x, ddy = pts[j].y - a.y;
                    if (ddx * ddx + ddy * ddy < clear * clear) return false;
                }
            }
        }
        return true;
    }
    /* kit.meander(o, rand)：產生一條蜿蜒曲線，回傳密集的點 [{x, y, s}]（約每 o.ds 像素一個，s＝累積弧長），整條落在 [0, W]×[0, H] 裡；做不出來回傳 null。
       o：{ W, H（要放進去的範圍，像素）, k（弧的個數＝彎數）, alt（轉向左右交替的機率，其餘＝繼續往同一邊轉）, radius:[最小, 最大]（圓弧半徑，占 W 的比例）,
            arc:[最小, 最大]（每個圓弧轉多少度）, line:[最短, 最長]（兩個圓弧之間直走多遠，占 W 的比例）, clear（曲線自己貼自己的最短距離，像素）, sep（弧長相隔多遠以內的點不檢查，預設 70）,
            margin（離範圍邊緣至少多遠，預設 0）, fill（左右至少占滿 W 的幾成，預設 0.5）, scale:[最小, 最大]（上下縮放倍率的範圍，預設 0.5～1.6）, aniso（左右、上下倍率最多差幾倍，預設 1.4；差越多圓弧被壓得越扁）, sway（左右交替轉彎時，方向最多偏離「往下」幾度，預設 100）, ds（取樣間距，預設 3）,
            ends（true＝起點一定在最上面、終點一定在最下面、而且都在左右正中央：把整條曲線沿上下方向做「剪切」把兩端拉到中央，「誰先到？」用）, tries（最多重抽幾次，預設 300）}
       做法：一段一段走完 → 量外框 → 上下縮放成剛好高 H（倍率要在 scale 範圍內）、左右縮放到放得進 W（盡量跟上下同倍率）→ 置中 → 檢查不貼太近。 */
    function meander(o, rand) {
        rand = rand || Math.random;
        var W = o.W, H = o.H, ds = o.ds || 3, mg = o.margin || 0, sep = o.sep || 70, fill = o.fill == null ? 0.5 : o.fill, sc = o.scale || [0.5, 1.6], an = o.aniso || 1.4, sway = (o.sway || 100) * Math.PI / 180;
        for (var attempt = 0; attempt < (o.tries || 300); attempt++) {
            var th = Math.PI / 2 + kit.randFloat(-0.4, 0.4, rand), x = 0, y = 0, s = 0, sgn = rand() < 0.5 ? -1 : 1, raw = [{ x: 0, y: 0, s: 0 }], i;
            var step = function (len, dth) {                /* 沿目前方向走 len（同時轉 dth 弧度），每 ds 像素記一個點 */
                var n = Math.max(1, Math.round(len / ds)), d = len / n;
                for (var q = 0; q < n; q++) { th += dth / n / 2; x += d * Math.cos(th); y += d * Math.sin(th); th += dth / n / 2; s += d; raw.push({ x: x, y: y, s: s }); }
            };
            for (i = 0; i < o.k; i++) {
                var alter = rand() < o.alt;                  /* 這一次左右交替，還是繼續往同一邊轉（繞圈） */
                sgn = alter ? -sgn : sgn;
                step(kit.randFloat(o.line[0], o.line[1], rand) * W, 0);
                var R = kit.randFloat(o.radius[0], o.radius[1], rand) * W, A = kit.randFloat(o.arc[0], o.arc[1], rand) * Math.PI / 180;
                if (!alter) R *= kit.randFloat(0.55, 0.8, rand);  /* 連續往同一邊轉：半徑越轉越小（往內捲的螺旋），不然轉一圈就會撞到自己 */
                if (alter) {                                 /* 左右交替時，方向最多偏離「往下」sway 度，不然會一直往旁邊或往上繞，整條曲線走不滿整個高度 */
                    var dev = th - Math.PI / 2; dev = Math.atan2(Math.sin(dev), Math.cos(dev));
                    A = Math.min(A, Math.max(20 * Math.PI / 180, sway - sgn * dev));
                }
                step(R * A, sgn * A);
            }
            step(kit.randFloat(o.line[0], o.line[1], rand) * W, 0);
            var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
            raw.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });  /* forEach：對陣列的每個元素各做一次 */
            var bw = x1 - x0, bh = y1 - y0;
            if (bh < 1) continue;
            var fy = (H - 2 * mg) / bh;                      /* 上下縮放成剛好高 H（扣掉邊） */
            if (fy < sc[0] || fy > sc[1]) continue;
            var fx = kit.clamp(fy, fill * W / bw, (W - 2 * mg) / bw);   /* 左右盡量跟上下同倍率（圓還是圓），放不進寬度、或太窄時才單獨調整 */
            if (fx > fy * an || fx < fy / an) continue;      /* 左右、上下的倍率差太多，圓弧會被壓得太扁，不要 */
            var cx = (x0 + x1) / 2, sAcc = 0;
            var pts = raw.map(function (p, idx) {            /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
                var q = { x: W / 2 + (p.x - cx) * fx, y: mg + (p.y - y0) * fy, s: 0 };
                if (idx) { var pr = raw[idx - 1]; sAcc += Math.sqrt(Math.pow((p.x - pr.x) * fx, 2) + Math.pow((p.y - pr.y) * fy, 2)); q.s = sAcc; }  /* Math.pow(x, y)：x 的 y 次方 */
                return q;
            });
            if (o.ends) {
                var a = pts[0], b = pts[pts.length - 1];
                if (a.y > mg + 0.05 * H || b.y < H - mg - 0.05 * H) continue;  /* 起點要在最上面、終點在最下面 */
                var okShear = true, out = [], len = 0;
                pts.forEach(function (p, idx) {
                    var t = (p.y - a.y) / (b.y - a.y), nx = p.x - (a.x + t * (b.x - a.x)) + W / 2;   /* 剪切：把起點終點的連線拉成正中央的直線 */
                    if (nx < mg || nx > W - mg) okShear = false;
                    if (idx) len += Math.sqrt((nx - out[idx - 1].x) * (nx - out[idx - 1].x) + (p.y - out[idx - 1].y) * (p.y - out[idx - 1].y));
                    out.push({ x: nx, y: p.y, s: len });
                });
                if (!okShear) continue;
                pts = out;
            }
            if (!selfClear(pts, o.clear, sep)) continue;
            var dense = [pts[0]], acc = 0;                   /* 放大之後點的間距會變大：每隔約 ds 像素補點（直線內插），讓畫面和相似度比對都用細密的點 */
            for (i = 1; i < pts.length; i++) {
                var pa = pts[i - 1], pb = pts[i], dd = Math.sqrt((pb.x - pa.x) * (pb.x - pa.x) + (pb.y - pa.y) * (pb.y - pa.y)), nn = Math.max(1, Math.ceil(dd / ds));
                for (var q = 1; q <= nn; q++) { var tt = q / nn; acc += dd / nn; dense.push({ x: pa.x + (pb.x - pa.x) * tt, y: pa.y + (pb.y - pa.y) * tt, s: acc }); }
            }
            return dense;
        }
        return null;
    }
    kit.selfClear = selfClear;
    kit.meander = meander;
    kit.gridAdjacent = adjacent;
    kit.gridConnected = connected;
    kit.gridParityOk = parityOk;
    kit.hamPath = findPath;
})(window);
