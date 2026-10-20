/* ═══════════════════════════════════════════════════════════════════
   reaction_kit4.js — 秒反應的第四批共用小工具（V1.34.0，給新的 51 款遊戲用；掛在 Reaction.kit 底下，要排在 reaction_kit3.js 之後）
   ───────────────────────────────────────────────────────────────────
   · 方格地圖（格子編號 i ＝ 列 × n ＋ 欄，n×n 的方形地圖）：
       kit.gridNeighbors(n, i)            i 的相鄰格（上右下左，超出地圖的略過）
       kit.gridAdjacent(n, a, b)          兩格是不是上下左右相鄰
       kit.gridConnected(n, blocked, s)   從 s 出發，能不能走到所有「沒被擋住」的格子（blocked 是 Uint8Array，1＝擋住）
       kit.gridParityOk(n, blocked, s)    棋盤格奇偶檢查：一定無解的「走遍每一格」配置先擋掉
       kit.hamPath(n, blocked, s, rand, budget)   隨機找一條從 s 出發、走遍每一格空地剛好一次的路（漢米爾頓路徑），找不到回傳 null
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
    'use strict';
    var kit = Reaction.kit;
    var DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];      /* 上、右、下、左（順時針） */
    var SEARCH_BUDGET = 12000;                          /* 找路時最多展開幾個節點（超過就放棄；有解的配置通常幾百個節點就找到了） */

    /* 格子編號 i ＝ 列 × n ＋ 欄；回傳 i 的相鄰格（上右下左，超出房間的略過） */
    function neighbors(n, i) {
        var r = Math.floor(i / n), c = i % n, out = [];
        for (var d = 0; d < 4; d++) {
            var rr = r + DIRS[d][0], cc = c + DIRS[d][1];
            if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
        }
        return out;
    }
    function adjacent(n, a, b) { return Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs(a % n - b % n) === 1; }
    /* 房間裡「空地」連不連得起來（從 start 出發能走到全部空地）；blocked 是家具格的集合（Uint8Array，1＝家具） */
    function connected(n, blocked, start) {
        var seen = new Uint8Array(n * n), stack = [start], cnt = 0, free = 0, i;
        for (i = 0; i < n * n; i++) if (!blocked[i]) free++;
        seen[start] = 1;
        while (stack.length) {
            var cur = stack.pop(); cnt++;
            neighbors(n, cur).forEach(function (j) { if (!blocked[j] && !seen[j]) { seen[j] = 1; stack.push(j); } });
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
            var cand = neighbors(n, head).filter(function (j) { return !vis[j]; });
            var scored = cand.map(function (j) { vis[j] = 1; var d = degree(j); vis[j] = 0; return { j: j, d: d, r: rand() }; });
            scored.sort(function (a, b) { return a.d - b.d || a.r - b.r; });
            for (var k = 0; k < scored.length; k++) {
                var j2 = scored[k].j;
                vis[j2] = 1; path.push(j2);
                if (ok(j2, free - count - 1) && dfs(j2, count + 1)) return true;
                vis[j2] = 0; path.pop();
                if (nodes > budget) return false;
            }
            return false;
        }
        return dfs(start, 1) ? path.slice() : null;
    }

    kit.gridNeighbors = neighbors;
    kit.gridAdjacent = adjacent;
    kit.gridConnected = connected;
    kit.gridParityOk = parityOk;
    kit.hamPath = findPath;
})(window);
