/* ═══════════════════════════════════════════════════════════════════
   reaction_carpet.js — 秒反應・鋪地毯（企劃 221「割草機」改題材）
   一個方格的房間，門口（黃色的地毯捲）在起點格。手指從地毯捲開始往上下左右的相鄰格拖，一路把地毯鋪出去，
   **每一格地板都要剛好鋪到一次**，放著家具（🎃🎄🧳🪑🛋️🛁🛏️🛌🪞）的格子不能走。手指往回拖＝把地毯一格一格捲回來。
   整個房間鋪滿就過關；時間到才失敗。走進死路（捲頭旁邊沒有可以鋪的格子）**不算失敗、也不提醒**，玩家自己往回拖、換一條路。
   ───────────────────────────────────────────────────────────────────
   · 為什麼從「割草機」改成「鋪地毯」（使用者的疑問）：原企劃的割草機可以「往回拖收回路線」，
     可是割掉的草不可能長回來，題材跟操作矛盾。鋪地毯就沒有這個問題——地毯本來就可以捲回去，往回拖＝捲回來，很自然。
   · 玩法與難度：房間 N×N（第 1 關 N_RANGE[0] → 第 RAMP_LEVELS 關 N_RANGE[1]）、家具 STONES[0] → STONES[1] 個、限時跟著要鋪的格數放寬（TIME_BASE ＋ TIME_PER_CELL × 格數）。
   ───────────────────────────────────────────────────────────────────
   · 這種「走遍每一格剛好一次」的題目，對人類來說難在哪（V1.36.0 的出題設計依據）：
       ① 人靠「死角」解題：只剩一個出口的格子一定是路的終點、只剩兩個出口的格子兩條邊都得走。家具放在牆邊、角落、擠成一團時，
          空地就變成一塊完整的長方形或一條走廊，沿邊繞圈／蛇行就鋪得完，而且處處都是「線索」。
       ② 家具分散放（彼此隔開、散在房間中央）：房間變成處處有洞，沒有任何一塊夠大的空地能用固定套路鋪；
          幾乎每一步都有 2～3 個看起來都行的方向，而錯誤的選擇要等到很多步之後才會變成孤島（鋪到一半，遠處的某一格已經被圍死了，人當下完全看不出來）。
       ③ 所以出題時：每個空格至少要有 2 個空鄰居（沒有死角＝沒有「終點在這裡」的線索，起點也至少有 2 個出口）、家具用「最遠候選點」取樣（盡量隔開、散開）、
          而且一定要有解（「強制邊」預檢＋ findPath 找出一條）；再從好幾個候選題裡挑「人工成本」最高的（humanCost：照老手捷徑走、走不通再退回去的人要走多少步）。
   · 出題（makeLevel）：scatterLayout 分散放家具（兩色空地一樣多）→ 檢查（連通、強制邊、不能被不動腦的走法鋪滿）→ findPath 找出一條走遍每一格空地的路（漢米爾頓路徑）當附上的解
     → 候選題數量隨關卡增加，挑最難的一題。時間用完還沒有候選題（很少發生）才退回「先造一條路再決定家具」的做法。
   · 封偷吃步：第 WARMUP + 1 關起，如果「沿著邊繞圈」「蛇行」這類不用動腦的走法（greedyWalk：直走優先、右轉優先、左轉優先…，四個初始方向）
     或「每步走往出口最少的鄰居」（Warnsdorff 規則，老手最常用的捷徑）任何一種就能鋪滿，這題就不要；前 WARMUP 關是暖身，不檢查。
   · 判定都是純函式：applyMove（往相鄰格鋪，或往回捲）、isStuck（走進死路；只給測試用，遊戲本身不用它判失敗）、isDone（鋪滿）；畫面只是把狀態畫出來。
   · 失敗時（時間到）：沒鋪到的格子閃紅，再用綠色的線畫出一條正確的路（動畫），停格 2.8 秒讓玩家看清楚。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'carpet';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var N_RANGE = [4, 9];                       /* 房間邊長（格）：第 1 關 → 到頂 */
    var STONES = [3, 20];                        /* 家具（不能走的格子）個數：第 1 關 → 到頂 */
    var WARMUP = 1;                             /* 前幾關是暖身，不檢查「偷吃步」 */
    var TIME_BASE = 15, TIME_PER_CELL = 1.5;    /* 限時（秒）＝ TIME_BASE ＋ TIME_PER_CELL × 要鋪的格數 */
    var MIN_FREE = 8;                           /* 空地至少幾格（家具太多會讓房間太小） */
    var MAX_LEVEL = 90;
    var FURNITURE = ['🎃', '🎄', '🧳', '🪑', '🛋️', '🛁', '🛏️', '🛌', '🪞'];      /* 家具圖案：每個家具格各自隨機抽一個（只是好看，不影響玩法） */
    var GEN_TRIES = 4000, GEN_BUDGET_MS = 340;   /* 出題：每一種放法最多試幾次；整個出題最多花幾毫秒（超過就用手上最難的候選題；沒有候選題才換下一種做法） */
    var CANDS = [2, 8];                         /* 候選題數量：第 1 關（暖身只要 1 題）→ 第 RAMP_LEVELS 關；之後再每 RAMP_LEVELS 關多 1 題，挑最難的那題（見 hardness） */
    var CAND_SAMPLES = 5;                       /* 放每個家具時，抽幾個候選格、挑「離其他家具最遠」的那個（愈大愈分散） */
    var NODE_CAP = 2500;                        /* 衡量難度（humanCost）時最多算幾步（高關卡的題目幾乎都超過，挑選時不分高下） */
    var BITE_TRIES = 400;                       /* 分散放家具出不了題時，改用「先造一條路再決定家具」最多試幾次 */
    var DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];      /* 上、右、下、左（順時針） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function sizeFor(level) { return Math.round(kit.ramp(level, N_RANGE[0], N_RANGE[1], RAMP_LEVELS)); }
    function stonesFor(level) { return Math.round(kit.ramp(level, STONES[0], STONES[1], RAMP_LEVELS)); }
    /* 限時（毫秒）：free＝要鋪的格數 */
    function timeMs(free) { return Math.round((TIME_BASE + TIME_PER_CELL * free) * 1000); }
    var neighbors = kit.gridNeighbors, adjacent = kit.gridAdjacent, connected = kit.gridConnected, parityOk = kit.gridParityOk, findPath = kit.hamPath;       /* 方格地圖的共用函式（js/reaction_kit4.js） */
    /* 「不動腦」的走法：從 start、朝 heading0（0 上 1 右 2 下 3 左）出發，每一步依 order（相對方向的優先順序：0 直走、1 右轉、2 迴轉、3 左轉）
       挑第一個可以走的格子，走到沒路為止；回傳鋪到幾格 */
    function greedyWalk(n, blocked, start, order, heading0) {
        var vis = new Uint8Array(n * n), cur = start, heading = heading0, count = 1, moved = true;
        vis[start] = 1;
        while (moved) {
            moved = false;
            for (var k = 0; k < order.length; k++) {
                var d = (heading + order[k]) % 4, r = Math.floor(cur / n) + DIRS[d][0], c = cur % n + DIRS[d][1];
                if (r < 0 || r >= n || c < 0 || c >= n) continue;
                var nx = r * n + c;
                if (blocked[nx] || vis[nx]) continue;
                vis[nx] = 1; cur = nx; heading = d; count++; moved = true;
                break;
            }
        }
        return count;
    }
    var GREEDY_ORDERS = [[0, 1, 3], [1, 0, 3], [3, 0, 1], [0, 3, 1]];       /* 直走優先（蛇行）、右轉優先（繞圈）、左轉優先、直走再左轉 */
    /* Warnsdorff 走法（老手最常用的捷徑）：每一步都走往「出口最少」的鄰居（先把快要變成孤島的格子收掉），同分時照 tieOrder 的方向順序挑；回傳鋪到幾格 */
    function warnsdorffWalk(n, blocked, start, tieShift) {
        var vis = new Uint8Array(n * n), cur = start, count = 1;
        for (var i = 0; i < n * n; i++) vis[i] = blocked[i] ? 2 : 0;
        vis[start] = 1;
        for (;;) {
            var best = -1, bestDeg = 99, r = Math.floor(cur / n), c = cur % n;
            for (var k = 0; k < 4; k++) {
                var d = (k + tieShift) % 4, rr = r + DIRS[d][0], cc = c + DIRS[d][1];
                if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
                var nx = rr * n + cc;
                if (vis[nx]) continue;
                var deg = 0;
                for (var e = 0; e < 4; e++) {
                    var r2 = rr + DIRS[e][0], c2 = cc + DIRS[e][1];
                    if (r2 >= 0 && r2 < n && c2 >= 0 && c2 < n && !vis[r2 * n + c2]) deg++;
                }
                if (deg < bestDeg) { bestDeg = deg; best = nx; }
            }
            if (best < 0) return count;
            vis[best] = 1; cur = best; count++;
        }
    }
    /* 這一題有沒有被「不動腦的走法」鋪滿？（有＝太容易，不要）：四種固定套路 × 四個初始方向；strong 為真時再加上 Warnsdorff 走法（小房間幾乎一定被它鋪滿，所以只在大房間用） */
    function shortcutWorks(n, blocked, start, free, strong) {
        for (var o = 0; o < GREEDY_ORDERS.length; o++) for (var d = 0; d < 4; d++) if (greedyWalk(n, blocked, start, GREEDY_ORDERS[o], d) === free) return true;
        if (strong) for (var t = 0; t < 4; t++) if (warnsdorffWalk(n, blocked, start, t) === free) return true;
        return false;
    }
    /* 隨機放家具、挑起點——但「兩種顏色的空地一樣多」（棋盤格塗色，相差最多 1）。
       為什麼要這樣放：走遍每一格的路，一定是黑白交替的，所以兩色空地數量相差超過 1 就一定無解。
       完全隨機放家具時，家具一多（例如 10 格以上）有八成以上的配置因為這一條被淘汰，第 13 關起幾乎湊不出題目，
       只好退回「空房間蛇行」的保底題（等於沒有難度）。先把兩色的家具數量配好，幾乎每一次都能通過奇偶檢查。
       回傳 { stones: 家具格編號陣列, start: 起點格 }；起點挑在「空地比較多的那個顏色」（兩色一樣多就任意挑）。 */
    function pickLayout(n, ns, rand) {
        var plan = colorPlan(n, ns, rand);
        if (!plan) {                               /* 配不出來（家具數太極端）：回到完全隨機放 */
            var all = kit.shuffle(plan0(n).A.concat(plan0(n).B), rand);
            return { stones: all.slice(0, ns), start: all[ns] };
        }
        var remA = plan.A.slice(plan.sA), remB = plan.B.slice(plan.sB);
        var pool = plan.d > 0 ? remA : plan.d < 0 ? remB : remA.concat(remB);       /* 某一色空地多 1 格時，起點一定要在那一色 */
        return { stones: plan.A.slice(0, plan.sA).concat(plan.B.slice(0, plan.sB)), start: pool[Math.floor(rand() * pool.length)] };
    }
    /* 棋盤格兩色的格子編號：A＝(0,0) 同色，B＝另一色 */
    function plan0(n) {
        var A = [], B = [];
        for (var i = 0; i < n * n; i++) ((Math.floor(i / n) + i % n) % 2 === 0 ? A : B).push(i);
        return { A: A, B: B };
    }
    /* 兩色家具各放幾個：回傳 { A, B（兩色的格子編號，已洗牌）, sA, sB（兩色各放幾個家具）, d（空地 A 的格數 − 空地 B 的格數，-1、0 或 1）}；配不出來回傳 null */
    function colorPlan(n, ns, rand) {
        var p = plan0(n), A = kit.shuffle(p.A, rand), B = kit.shuffle(p.B, rand);        /* kit.shuffle 回傳洗好的新陣列 */
        var diff = A.length - B.length, ds = [];
        for (var d = -1; d <= 1; d++) {            /* d ＝ 空地 A 的格數 − 空地 B 的格數；家具數 sA ＋ sB ＝ ns，要整數、不超過各色的格數 */
            var sA2 = ns + diff - d;
            if (sA2 % 2 !== 0) continue;
            var sA = sA2 / 2, sB = ns - sA;
            if (sA >= 0 && sA <= A.length && sB >= 0 && sB <= B.length) ds.push([d, sA, sB]);
        }
        if (!ds.length) return null;
        var pick = ds[Math.floor(rand() * ds.length)];
        return { A: A, B: B, d: pick[0], sA: pick[1], sB: pick[2] };
    }
    /* 空地的出口數：格子 c 旁邊有幾個沒被擋住的格子 */
    function freeDeg(n, blocked, c) {
        var k = 0, nb = neighbors(n, c);
        for (var i = 0; i < nb.length; i++) if (!blocked[nb[i]]) k++;
        return k;
    }
    /* 「強制邊」預檢（很便宜的必要條件，擋掉九成以上一定無解的家具位置）：
       走遍每一格的路，每個格子最多用 2 條邊（起點只用 1 條、終點只用 1 條）。只剩 2 個出口的格子，兩條邊都得走（除非它剛好是終點）——
       如果某個格子被這些「強制」的邊塞進 3 條以上、或強制的邊連成一個圈，這個配置就沒有解。
       精確版（有起點 start、loose 不傳）：終點只有一個，所以逐一假設「終點是某個只剩 2 個出口的格子」再檢查，只要有任何一種假設成立就通過——這樣不會誤殺有解的配置。
       寬鬆版（loose 為真，放家具的過程中用，起點跟終點都還沒定）：只檢查「全部都強制」這一種，偶爾會誤殺終點剛好在走廊上的配置，
       但這只是挑家具位置的過濾，最後還有 findPath 保證每一題真的有解。 */
    function forcedOk(n, blocked, start, loose) {
        var total = n * n, d2 = [], isD2 = new Uint8Array(total), c;
        for (c = 0; c < total; c++) if (!blocked[c] && c !== start && freeDeg(n, blocked, c) === 2) { d2.push(c); isD2[c] = 1; }
        function consistent(except) {                    /* except：假設終點是這一格（-1＝不假設）；這一格不強制，而且最多只能被塞 1 條邊 */
            var cnt = new Int8Array(total), uf = [], k, i;
            for (i = 0; i < total; i++) uf.push(i);
            function find(x) { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; }
            for (k = 0; k < d2.length; k++) {
                var cc = d2[k];
                if (cc === except) continue;
                var nb = neighbors(n, cc);
                for (i = 0; i < nb.length; i++) {
                    var j = nb[i];
                    if (blocked[j] || (isD2[j] && j !== except && j < cc)) continue;       /* 兩端都被強制的邊只算一次 */
                    cnt[cc]++; cnt[j]++;
                    var a = find(cc), b = find(j);
                    if (a === b) return false;                                              /* 強制的邊連成一圈 */
                    uf[a] = b;
                }
            }
            for (i = 0; i < total; i++) if (cnt[i] > 2 || (i === start && cnt[i] > 1) || (i === except && cnt[i] > 1)) return false;
            return true;
        }
        if (consistent(-1)) return true;
        if (loose) return false;
        for (var e = 0; e < d2.length; e++) if (consistent(d2[e])) return true;
        return false;
    }
    /* 分散放家具（V1.36.0）：兩色空地一樣多（走得完的必要條件）、家具彼此盡量隔開、而且「每個空格至少有 2 個空鄰居」（沒有死角＝沒有「終點在這裡」的線索）。
       做法：一個一個放；每個家具先抽 CAND_SAMPLES 個「放了不會製造死角、也不會讓強制邊預檢失敗」的候選格，挑離已放家具最遠的那個（藍噪聲取樣）。
       起點挑在「空地比較多的那個顏色」、而且至少有 2 個出口。minDeg（預設 2）是每個空格至少要有幾個空鄰居，小房間放不下時 makeLevel 會降成 1。
       回傳 { stones, start }；放不下回傳 null（呼叫的人再試一次）。 */
    function scatterLayout(n, ns, rand, minDeg) {
        minDeg = minDeg || 2;
        var plan = colorPlan(n, ns, rand);
        if (!plan) return null;
        var total = n * n, blocked = new Uint8Array(total), stones = [], needA = plan.sA, needB = plan.sB, guard = 0, i, k;
        function isA(x) { return (Math.floor(x / n) + x % n) % 2 === 0; }
        function dist(x) {                                       /* 到最近的家具的距離（走幾步）；還沒有家具就算很遠 */
            var best = 99, r = Math.floor(x / n), c = x % n;
            for (var s = 0; s < stones.length; s++) { var dd = Math.abs(Math.floor(stones[s] / n) - r) + Math.abs(stones[s] % n - c); if (dd < best) best = dd; }
            return best;
        }
        function allowed(x) {                                    /* 把家具放在 x：x 旁邊的空格都還要有 ≥ 2 個空鄰居，且強制邊預檢要過 */
            blocked[x] = 1;
            var ok = true, nb = neighbors(n, x);
            for (var q = 0; q < nb.length && ok; q++) if (!blocked[nb[q]] && freeDeg(n, blocked, nb[q]) < minDeg) ok = false;
            if (ok && minDeg >= 2) ok = forcedOk(n, blocked, -1, true);
            blocked[x] = 0;
            return ok;
        }
        while (needA + needB > 0 && guard++ < ns * 6) {
            var wantA = needA > 0 && needB > 0 ? rand() < needA / (needA + needB) : needA > 0;
            var pool = wantA ? plan.A : plan.B, cand = [];
            var from = Math.floor(rand() * pool.length);          /* 從隨機位置開始往後找，每次抽到的候選格才不會總是同幾格 */
            for (k = 0; k < pool.length && cand.length < CAND_SAMPLES; k++) {
                var x = pool[(from + k) % pool.length];
                if (!blocked[x] && allowed(x)) cand.push(x);
            }
            if (!cand.length) return null;
            var best = cand[0], bestD = dist(cand[0]);
            for (k = 1; k < cand.length; k++) { var dk = dist(cand[k]); if (dk > bestD) { bestD = dk; best = cand[k]; } }
            blocked[best] = 1; stones.push(best);
            if (wantA) needA--; else needB--;
        }
        if (needA + needB > 0) return null;
        var starts = [];
        for (i = 0; i < total; i++) {
            if (blocked[i] || freeDeg(n, blocked, i) < minDeg) continue;
            if (plan.d > 0 && !isA(i)) continue;                 /* 某一色空地多 1 格時，起點一定要在那一色 */
            if (plan.d < 0 && isA(i)) continue;
            starts.push(i);
        }
        if (!starts.length) return null;
        return { stones: stones, start: starts[Math.floor(rand() * starts.length)] };
    }
    /* 「人工成本」：模擬一個照老手捷徑走的人——每一步都走往出口最少的鄰居（Warnsdorff 規則，同分時依 tie 決定方向的優先順序），
       只看得出「某一格被圍死」這種一眼可見的死路；走不通就退回上一步換別的鄰居。回傳他總共走了幾步（含退回去再走的），最多算到 cap。
       為什麼用它衡量難度（V1.36.0 實測）：先造路再放家具的舊做法，這樣走 75～100% 一路鋪滿（空地是一整塊、有死角當線索），成本只有幾十步；
       分散放家具的題目 0% 鋪得滿，要退回去很多次（同樣 6×6 房間成本差約 24 倍）。窮舉搜尋樹的大小反而看不出這個差別（舊做法的樹也很大，但人不是窮舉）。 */
    function humanCost(n, blocked, start, cap, tie) {
        var total = n * n, free = 0, i;
        for (i = 0; i < total; i++) if (!blocked[i]) free++;
        var vis = new Uint8Array(total);
        for (i = 0; i < total; i++) vis[i] = blocked[i] ? 2 : 0;
        vis[start] = 1;
        var nodes = 0, solved = false;
        function deg(c) { var k = 0, nb = neighbors(n, c); for (var q = 0; q < nb.length; q++) if (!vis[nb[q]]) k++; return k; }
        function dfs(head, count) {
            if (count === free) { solved = true; return true; }
            if (++nodes > cap) return false;
            var nb = neighbors(n, head), cand = [], q;
            for (q = 0; q < nb.length; q++) if (!vis[nb[q]]) { vis[nb[q]] = 1; cand.push({ j: nb[q], d: deg(nb[q]), o: (q + tie) % 4 }); vis[nb[q]] = 0; }
            cand.sort(function (a, b) { return a.d - b.d || a.o - b.o; });
            for (q = 0; q < cand.length; q++) {
                var j = cand[q].j, dead = false, nb2 = neighbors(n, j);
                vis[j] = 1;
                for (var w = 0; w < nb2.length && !dead; w++) if (!vis[nb2[w]] && deg(nb2[w]) === 0 && free - count - 1 > 1) dead = true;     /* 旁邊有格子被圍死（進去就出不來）→ 這一步一眼看得出不行 */
                if (!dead && dfs(j, count + 1)) return true;
                vis[j] = 0;
                if (nodes > cap) return false;
            }
            return false;
        }
        dfs(start, 1);
        return { nodes: nodes, solved: solved };
    }
    /* 一題有多難：兩種同分順序的人工成本平均（最多 NODE_CAP）。越大越難 */
    function hardness(n, blocked, start) {
        var a = humanCost(n, blocked, start, NODE_CAP, 0), b = humanCost(n, blocked, start, NODE_CAP, 2);
        return { nodes: (a.nodes + b.nodes) / 2, score: (a.nodes + b.nodes) / 2 };
    }
    /* 這一關要比幾個候選題：第 1 關 CANDS[0]（暖身另外只用 1 個）→ 第 RAMP_LEVELS 關 CANDS[1]，之後每 RAMP_LEVELS 關再多 1 個 */
    function candCount(level) {
        if (level <= WARMUP) return 1;
        return Math.round(kit.ramp(level, CANDS[0], CANDS[1], RAMP_LEVELS)) + Math.floor(Math.max(0, level - RAMP_LEVELS) / RAMP_LEVELS);
    }
    /* 隨機造一條走遍 n×n 全部格子的一筆畫（漢米爾頓路徑）：從蛇行的路開始，一直做「咬尾巴」的變形（backbite）——
       挑路徑的一端（頭或尾），看它旁邊的一格 c（不是路徑上它的下一格），讓這一端改接到 c，
       於是原路徑從 c 到這一端之間的那一段整段倒過來，仍然是一條走遍每一格的路。重複幾十倍格數次，就是一條很隨機、彎彎曲曲的路。
       為什麼需要它：家具多的關卡，「隨機放家具再去找有沒有一筆畫」幾乎都失敗（家具會把空地切成好幾塊、或讓某些格子變成死巷）；
       反過來「先有一條路，家具是路沒走到的格子」就一定有解。 */
    function randomHamPath(n, rand) {
        var total = n * n, P = [], r, c, i;
        for (r = 0; r < n; r++) for (c = 0; c < n; c++) P.push(r * n + (r % 2 ? n - 1 - c : c));
        for (var it = 0; it < total * 30; it++) {
            var pos = new Int32Array(total);
            for (i = 0; i < total; i++) pos[P[i]] = i;
            if (rand() < 0.5) {
                /* 尾巴：旁邊的格子 c（不是倒數第二格）在路徑第 k 個位置；把第 k+1 個到最後倒過來 */
                var nb = neighbors(n, P[total - 1]).filter(function (x) { return x !== P[total - 2]; });
                if (!nb.length) continue;
                var k = pos[nb[Math.floor(rand() * nb.length)]];
                P = P.slice(0, k + 1).concat(P.slice(k + 1).reverse());
            } else {
                /* 頭：旁邊的格子 c（不是第 2 格）在第 k 個位置；把第 0 個到第 k−1 個倒過來 */
                var nb2 = neighbors(n, P[0]).filter(function (x) { return x !== P[1]; });
                if (!nb2.length) continue;
                var k2 = pos[nb2[Math.floor(rand() * nb2.length)]];
                P = P.slice(0, k2).reverse().concat(P.slice(k2));
            }
        }
        return P;
    }
    /* 幫每個家具格各抽一個圖案（照家具格編號的順序，跟 stones 一一對應） */
    function pickIcons(count, rand) {
        var out = [];
        for (var i = 0; i < count; i++) out.push(FURNITURE[Math.floor(rand() * FURNITURE.length)]);
        return out;
    }
    /* 出一關：{ n, stones（家具格編號陣列，由小到大）, icons（每個家具的圖案，跟 stones 一一對應）, start, free（空地格數）, solution（一條正確的路，從 start 開始）, level, hard（難度：節點數／解數）, how（怎麼出的：'scatter'＝分散放家具、'scatter2'／'random'＝小房間放寬的做法、'bite'＝保底做法、'empty'＝空房間） }
       budgetMs：這一關最多花幾毫秒出題（預設 GEN_BUDGET_MS；測試用小一點的值讓測試跑得快） */
    function makeLevel(level, rand, budgetMs) {
        rand = rand || Math.random; budgetMs = budgetMs || GEN_BUDGET_MS;
        var n = sizeFor(level), ns = Math.min(stonesFor(level), n * n - MIN_FREE), total = n * n, t0 = Date.now();
        function pack(stones, start, free, solution, how, hard) {
            var sorted = stones.slice().sort(function (a, b) { return a - b; });
            return { n: n, stones: sorted, icons: pickIcons(sorted.length, rand), start: start, free: free, solution: solution, level: level, hard: hard || 0, how: how };
        }
        /* 第一階段：依序試三種放法，每一種各有一段時間（累計到 budgetMs 的 70%／85%／100%）；收集候選題，挑最難的那題。
           ① 'scatter'：分散放家具＋每個空格至少 2 個空鄰居＋連 Warnsdorff 走法都鋪不滿（只有這樣才是真正的「難題」；房間太小時放不出來）
           ② 'scatter2'：同上但允許被 Warnsdorff 鋪滿、死角放寬成 1（4×4、5×5 的小房間用）
           ③ 'random'：完全隨機放（兩色空地一樣多），只擋四種固定套路（最早的做法） */
        var STYLES = [{ how: 'scatter', deg: 2, strong: true, until: 0.7 }, { how: 'scatter2', deg: 1, strong: false, until: 0.85 }, { how: 'random', deg: 0, strong: false, until: 1 }];
        var want = candCount(level), free = total - ns;
        for (var si = 0; si < STYLES.length; si++) {
            var sty = STYLES[si], best = null, got = 0;
            for (var tr = 0; tr < GEN_TRIES && got < want; tr++) {
                if (tr > 20 && Date.now() - t0 > budgetMs * sty.until) break;      /* 這一種試太久就換下一種，不讓玩家等 */
                var lay = sty.deg ? scatterLayout(n, ns, rand, sty.deg) : pickLayout(n, ns, rand);
                if (!lay) continue;
                var blocked = new Uint8Array(total), start = lay.start;
                lay.stones.forEach(function (i) { blocked[i] = 1; });
                if (!parityOk(n, blocked, start) || !connected(n, blocked, start)) continue;
                if (sty.deg >= 2 && !forcedOk(n, blocked, start)) continue;
                if (level > WARMUP && shortcutWorks(n, blocked, start, free, sty.strong)) continue;
                var path = findPath(n, blocked, start, rand);
                if (!path) continue;
                got++;
                var hd = level > WARMUP && want > 1 ? hardness(n, blocked, start).score : 0;
                if (!best || hd > best.hard) best = { stones: lay.stones, start: start, solution: path, hard: hd };
            }
            if (best) return pack(best.stones, best.start, free, best.solution, sty.how, best.hard);
        }
        /* 第二階段：先造一條走遍全部格子的路 P，取其中連續的 free 格當「要鋪的地」（路的前後 ns 格就是家具），這樣一定有解、空地一定連在一起（家具會擠成兩團，比較容易） */
        var free2 = total - ns;
        for (var tb = 0; tb < BITE_TRIES; tb++) {
            if (Date.now() - t0 > budgetMs * 2) break;
            var P = randomHamPath(n, rand), a = Math.floor(rand() * (ns + 1)), sub = P.slice(a, a + free2);
            var blocked2 = new Uint8Array(total), stones2 = P.slice(0, a).concat(P.slice(a + free2));
            stones2.forEach(function (i) { blocked2[i] = 1; });
            if (level > WARMUP && shortcutWorks(n, blocked2, sub[0], free2)) continue;
            return pack(stones2, sub[0], free2, sub, 'bite');
        }
        /* 保底（極少用到）：空房間、從角落蛇行就鋪得完 */
        var sol = []; for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) sol.push(r * n + (r % 2 ? n - 1 - c : c));
        return pack([], 0, total, sol, 'empty');
    }
    /* 目前的鋪法：{ path（已鋪的格子，第 0 個是起點，最後一個是捲頭）, vis（Uint8Array：1＝已鋪或家具）, free } */
    function newState(q) {
        var vis = new Uint8Array(q.n * q.n);
        q.stones.forEach(function (i) { vis[i] = 2; });
        vis[q.start] = 1;
        return { n: q.n, path: [q.start], vis: vis, free: q.free };
    }
    /* 手指拖到格子 cell：是上一格（路徑倒數第二個）＝把地毯捲回一格；是捲頭的相鄰空格＝再鋪一格；其他不動。回傳 'add'／'back'／null */
    function applyMove(s, cell) {
        var p = s.path, head = p[p.length - 1];
        if (p.length >= 2 && cell === p[p.length - 2]) { s.vis[head] = 0; p.pop(); return 'back'; }
        if (adjacent(s.n, head, cell) && !s.vis[cell]) { s.vis[cell] = 1; p.push(cell); return 'add'; }
        return null;
    }
    function isDone(s) { return s.path.length === s.free; }
    /* 走進死路：還沒鋪滿，而且捲頭旁邊已經沒有可以鋪的空格 */
    function isStuck(s) {
        if (isDone(s)) return false;
        var head = s.path[s.path.length - 1];
        return neighbors(s.n, head).every(function (j) { return s.vis[j]; });
    }
    function rating(n) {
        if (n >= 25) return '地毯大師！';
        if (n >= 15) return '腦袋很會繞！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先看哪一格最容易變成孤島，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'cpt-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), n = q.n, st = newState(q), done = false;
        api.info = q;
        console.log('[鋪地毯] 第 ' + level + ' 關：' + n + '×' + n + '，家具 ' + q.stones.length + ' 個，要鋪 ' + q.free + ' 格，起點第 ' + (q.start + 1) + ' 格；限時 ' + timeMs(q.free) + ' ms；出題方式 ' + q.how + '，難度 ' + Math.round(q.hard));

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, topPad = 56;
        var cell = Math.floor(Math.min((W - 20) / n, (H - topPad - 20) / n, 96)), BS = cell * n, bx = Math.round((W - BS) / 2), by = topPad + Math.round((H - topPad - BS) / 2) - 8;
        var tip = h('div', { 'class': 'qz-note cpt-tip', text: '' });
        stage.appendChild(tip);
        var board = h('div', { 'class': 'cpt-board' });
        board.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;width:' + BS + 'px;height:' + BS + 'px;';
        stage.appendChild(board);
        var cells = [], iconOf = {};
        q.stones.forEach(function (s, k) { iconOf[s] = q.icons[k]; });
        for (var i = 0; i < n * n; i++) {
            var r = Math.floor(i / n), c = i % n, el = h('div', { 'class': 'cpt-cell ' + ((r + c) % 2 ? 'cpt-cell--b' : 'cpt-cell--a') });
            el.style.cssText = 'left:' + c * cell + 'px;top:' + r * cell + 'px;width:' + cell + 'px;height:' + cell + 'px;';
            if (st.vis[i] === 2) {                                   /* 家具：一個表情符號放在格子正中央（字級是格子的 62%） */
                var stone = h('div', { 'class': 'cpt-stone', text: iconOf[i] || FURNITURE[0] });
                stone.style.fontSize = Math.round(cell * 0.62) + 'px';
                el.appendChild(stone);
            }
            board.appendChild(el); cells.push(el);
        }
        function cx(i) { return (i % n + 0.5) * cell; }
        function cy(i) { return (Math.floor(i / n) + 0.5) * cell; }
        var svg = kit.svg('svg', { 'class': 'cpt-svg', viewBox: '0 0 ' + BS + ' ' + BS, width: BS, height: BS }, board);
        var solLine = kit.svg('path', { 'class': 'cpt-sol', d: '', pathLength: 1 }, svg);
        var rug = kit.svg('path', { 'class': 'cpt-rug', d: '' }, svg);
        var rugPat = kit.svg('path', { 'class': 'cpt-rug-pat', d: '' }, svg);
        rug.setAttribute('stroke-width', (cell * 0.64).toFixed(1)); rugPat.setAttribute('stroke-width', (cell * 0.34).toFixed(1));
        var roll = kit.svg('circle', { 'class': 'cpt-roll', r: cell * 0.33, cx: 0, cy: 0 }, svg), rollIn = kit.svg('circle', { 'class': 'cpt-roll-in', r: cell * 0.14, cx: 0, cy: 0 }, svg);
        function pathD(p) { return p.map(function (k, j) { return (j ? 'L' : 'M') + cx(k).toFixed(1) + ' ' + cy(k).toFixed(1); }).join(' '); }
        function paint() {
            var d = pathD(st.path), head = st.path[st.path.length - 1];
            if (st.path.length === 1) d += ' L' + (cx(head) + 0.01) + ' ' + cy(head);              /* 只有一格時畫一個圓點 */
            rug.setAttribute('d', d); rugPat.setAttribute('d', d);
            roll.setAttribute('cx', cx(head)); roll.setAttribute('cy', cy(head)); rollIn.setAttribute('cx', cx(head)); rollIn.setAttribute('cy', cy(head));
            tip.textContent = '已鋪 ' + st.path.length + '／' + st.free + ' 格　往回拖＝把地毯捲回來';
        }
        paint();
        api.timer(timeMs(q.free), function () { finish('time'); });
        if (level === 1 && kit.once('carpet.hint')) {
            var nb = neighbors(n, q.start).filter(function (j) { return !st.vis[j]; })[0];
            kit.hintOn(stage, null, { mode: 'drag', x: bx + cx(q.start), y: by + cy(q.start), dx: cx(nb) - cx(q.start), dy: cy(nb) - cy(q.start), delay: 500, text: '從地毯捲往旁邊拖，每格都要鋪' });
        }

        /* 手指：從捲頭按下才開始鋪；移動時把手指經過的每一格依序處理（手指一次跨好幾格，也不會漏格） */
        var pid = null, lastPt = null;
        function cellAt(x, y) {
            var c = Math.floor((x - bx) / cell), r = Math.floor((y - by) / cell);
            return c < 0 || c >= n || r < 0 || r >= n ? -1 : r * n + c;
        }
        function feed(p) {
            if (api.over || done) return;
            var from = lastPt || p, dist = kit.dist(from.x, from.y, p.x, p.y), steps = Math.max(1, Math.ceil(dist / (cell / 4)));
            for (var s = 1; s <= steps && !done && !api.over; s++) {
                var x = from.x + (p.x - from.x) * s / steps, y = from.y + (p.y - from.y) * s / steps, k = cellAt(x, y);
                if (k < 0) continue;
                var act = applyMove(st, k);
                if (act) { Sfx.play(act === 'add' ? 'tick' : 'flip'); paint(); check(); }
            }
            lastPt = p;
        }
        stage.addEventListener('pointerdown', function (e) {
            if (api.over || done || pid != null) return;
            var p = kit.localPt(e, stage), k = cellAt(p.x, p.y), head = st.path[st.path.length - 1];
            if (k !== head) return;                                    /* 要從捲頭（黃色地毯捲）開始拖 */
            e.preventDefault(); pid = e.pointerId; lastPt = p;
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
        });
        stage.addEventListener('pointermove', function (e) { if (pid === e.pointerId) feed(kit.localPt(e, stage)); });
        function up(e) { if (pid === e.pointerId) { pid = null; lastPt = null; } }
        stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

        /* 只有「鋪滿了」才會結束。走進死路（捲頭旁邊沒有空格可以鋪）不判失敗、也不提醒——玩家自己把地毯往回拖、換一條路；只有時間到才失敗 */
        function check() {
            if (isDone(st)) finish('ok');
        }
        /* 結束：kind＝'ok'（鋪滿了）／'time'（時間到） */
        function finish(kind) {
            if (done || api.over) return;
            done = true; pid = null;
            if (kind === 'ok') {
                cells.forEach(function (el) { el.classList.add('cpt-cell--ok'); });
                tip.textContent = '整個房間都鋪好了！';
                kit.flash(stage, true, api.my);
                api.pass({ delay: 1500 });
                return;
            }
            /* 失敗：沒鋪到的格子閃紅，再用綠線畫出一條正確的路，停格 2.8 秒 */
            var miss = 0;
            for (var k = 0; k < n * n; k++) if (st.vis[k] === 0) { cells[k].classList.add('cpt-cell--miss'); miss++; }
            solLine.setAttribute('d', pathD(q.solution));
            solLine.classList.add('cpt-sol--draw');
            tip.textContent = '時間到！綠線是其中一種鋪法';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2800, lines: ['時間到，還有 ' + miss + ' 格沒鋪到', '房間 ' + n + '×' + n + '、家具 ' + q.stones.length + ' 個、要鋪 ' + q.free + ' 格'] });
        }
        /* 驗證用：api.solve 把地毯先全部捲回起點、再照正確的路一格一格鋪完；
           api.wrong 往最容易走進死路的方向鋪（不動腦的走法）直到被困住，然後直接宣告時間到（走進死路本身不會結束遊戲） */
        api.solve = function () {
            while (st.path.length > 1) applyMove(st, st.path[st.path.length - 2]);
            q.solution.slice(1).forEach(function (k) { if (!done) { applyMove(st, k); } }); paint(); check();
        };
        api.wrong = function () {
            var guard = 0;
            while (!done && guard++ < 400) {
                var head = st.path[st.path.length - 1], nb = neighbors(n, head).filter(function (j) { return !st.vis[j]; });
                if (!nb.length) break;
                nb.sort(function (a, b) { return neighbors(n, a).filter(function (j) { return !st.vis[j]; }).length - neighbors(n, b).filter(function (j) { return !st.vis[j]; }).length; });
                applyMove(st, nb[nb.length - 1]); paint();
                if (isDone(st)) break;
            }
            if (!done) { if (isDone(st)) check(); else finish('time'); }
        };
    }

    var G = {
        id: ID,
        name: '鋪地毯',
        rule: '房間裡要鋪地毯。**手指從黃色的地毯捲開始，往上下左右的相鄰格拖，一路把地毯鋪出去**。**每一格地板都要剛好鋪到一次**，放著家具的格子不能走。**往回拖就是把地毯捲回來**，走進死路不會結束，自己捲回去換條路。整個房間鋪滿就過關；來不及就結束，看你能過幾關。越後面，房間越大、家具越多、散得越開！',
        mount: mount,
        score: SCORE,
        test: {
            sizeFor: sizeFor, stonesFor: stonesFor, timeMs: timeMs, parityOk: parityOk, neighbors: neighbors, adjacent: adjacent, connected: connected, findPath: findPath, greedyWalk: greedyWalk, shortcutWorks: shortcutWorks, warnsdorffWalk: warnsdorffWalk,
            scatterLayout: scatterLayout, forcedOk: forcedOk, freeDeg: freeDeg, hardness: hardness, candCount: candCount, pickIcons: pickIcons, FURNITURE: FURNITURE, CANDS: CANDS, NODE_CAP: NODE_CAP, humanCost: humanCost, GEN_BUDGET_MS: GEN_BUDGET_MS,
            makeLevel: makeLevel, pickLayout: pickLayout, randomHamPath: randomHamPath, GEN_TRIES: GEN_TRIES, newState: newState, applyMove: applyMove, isDone: isDone, isStuck: isStuck, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, N_RANGE: N_RANGE, STONES: STONES, WARMUP: WARMUP, TIME_BASE: TIME_BASE, TIME_PER_CELL: TIME_PER_CELL, MIN_FREE: MIN_FREE, GREEDY_ORDERS: GREEDY_ORDERS, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
