/* ═══════════════════════════════════════════════════════════════════
   reaction_paint.js — 秒反應・刷油漆
   方塊的底色上畫著鮮豔的塗鴉。玩家用「底色」的油漆，把所有塗鴉蓋掉，一處都不能漏。
   V1.34.0 起是闖關制（玩家說「太難了」）：第 1 關只有 1 處大塗鴉，每過一關多 1 處，第 12 關有 12 處（舊版的難度）；
   每一關沾油漆的次數有上限（DIP_MAX ＝ 40 次），超過就失敗；成績＝闖過幾關。
   ───────────────────────────────────────────────────────────────────
   · 塗鴉怎麼產生（makeScribbles(rand, level)）：第 level 關有 K ＝ min(level, SCRIBBLE_MAX) 處。把 400×400 的方塊切成
     g×g 個小區（K=1→1×1、2～4→2×2、5～9→3×3、10 以上→4×4），隨機挑 K 個小區，每個小區放一處塗鴉，
     塗鴉整個縮在自己的小區裡、離小區邊緣至少「筆頭半徑＋SCRIBBLE_GAP」，所以任兩處塗鴉之間至少隔 2×SCRIBBLE_GAP（12px），
     一定不連在一起——「K 處不連續的塗鴉」是用做法保證的，測試也用連通區域再數一次。
     「面積」：每一關所有塗鴉的外框（方形）面積總和固定是 SCRIBBLE_AREA（＝舊版 10～12 處塗鴉的平均），
     所以第 1 關那一處被放大成邊長約 234px 的大圖案，處數越多每一處越小（K ≥ 10 就跟舊版一樣）。
     每一處的形狀隨機：折線（zigzag）、波浪（wave）、螺旋（spiral）、連環圈（loops）、星星（star）、圓環（ring）、叉叉（cross）、
     密集刷痕（hatch）、圓點（dot，大圖案不抽）；筆頭粗細（直徑）從 6 到 30px，七種粗細洗牌後輪流用；顏色從鮮豔的七色隨機挑。
   · 下方的圓形就是油漆刷（大小＝筆刷粗細），也是「沾油漆」按鈕：
       每沾一次 → 筆刷縮小 7%（直徑 ×SHRINK＝0.93，最小 BRUSH_MIN＝10），油漆量補滿；
       油漆量＝方塊寬度的 BUDGET_MULT（1）倍的筆畫長度，用完就畫不出來，畫面中央出現警語，要再去沾。
       拖曳時，手指移動多遠就用掉多少；點一下的圓點也要用油漆（用掉一個筆刷直徑的長度），不然光用點的、不拖曳，沾一次漆就能全部點完。
       油漆刷沾的是「底色」，塗在塗鴉上就把它蓋住。
       每一關的沾油漆次數、筆刷大小都從頭算；沾第 41 次（超過 DIP_MAX）就失敗，或者沾滿 40 次、油漆又用完了也失敗。
   · 判斷「塗鴉是否全部蓋住」：用一張跟方塊同大的點陣遮罩（每個邏輯 px 一格，Uint8Array）。一開始把「塗鴉會碰到的格子」標成 0（還沒蓋），
       其他格子標成 1（不用蓋）；塗鴉的範圍比畫出來的線多算 0.5px（保守）。玩家每畫一小段就沿著筆畫每隔幾 px 蓋一個圓
       （逐列填、同時數有幾格從 0 變 1），「還沒蓋的格數」減到 0 就是全部蓋住——不需要讀取畫布像素，每一格都精確，
       任何 1px 的線、任何一個角落都不會被漏掉。筆刷的圓半徑少算 0.5px（保守），所以只有「整格幾乎都被蓋到」才算蓋住，
       不會因為邊緣反鋸齒留下肉眼看得到的顏色線，卻被當成蓋完。
   · 不會自動告訴玩家哪裡還沒蓋到：要玩家自己去找。真的找不到，可以按最下面的按鈕
       「消耗三次沾漆，顯示未完成區域」：這一關的沾油漆次數 +HINT_COST，並在方塊上標出
       「最大的一塊」還沒蓋掉的塗鴉（紅色脈動圓圈，每按一次只標一處；下一筆開始畫就消失）。
       加上去會超過上限（或加完沒油漆又沒次數）時按鈕按不了。找出區域用連通區域（holes）：每一處漏掉的點都能找到。
       失敗的時候，也用同樣的紅圈標出最大的 FAIL_MARKS 塊沒蓋到的地方，讓玩家知道差在哪裡。
   · 圓形畫筆變成虛線（沒有油漆了，要去沾）時，圓形右上方會出現一支油漆刷，上下點動提醒玩家來點圓形
       （高度＝圓形直徑的 200%，圓形縮得很小時刷子最小 POINTER_MIN_H px）。
   · 成績＝闖過幾關（越多越好）；失敗後可以從「失敗關卡 − 5」繼續（kit.resumeFrom），下次進場從「最佳關卡 − 4」開始（kit.enter）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'paint';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 paint 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。
       V1.34.0 起成績是「闖過幾關」（越大越好，1～MAX_LEVEL），舊版是「沾油漆次數」（越少越好）——計分方式變了，舊成績要從榜上清掉（見 README V1.34.0）。 */
    var MAX_LEVEL = 90;            /* 全部幾關（蓋完最後一關＝全破） */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: MAX_LEVEL };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 方塊邊長 400（邏輯 px） */
    var SQ = 400;                  /* 方塊邊長（邏輯 px） */
    /* 筆刷一開始直徑 80，每沾一次 ×SHRINK，最小 BRUSH_MIN。
       V1.34.0 依玩家意見（太難了）：縮小比例從 0.88 放寬成 0.93（每次只縮 7%，不會很快就縮得太小），
       最小直徑從 3 放大成 10（面積約 11 倍；再細的筆刷根本畫不完）。 */
    var BRUSH_START = 80;         /* 第一次沾油漆之前的筆刷直徑 */
    var SHRINK = 0.93;             /* 每沾一次，直徑 ×0.93 */
    var BRUSH_MIN = 10;            /* 筆刷最小直徑 */
    /* 一次沾油漆可以刷幾倍方塊寬度的長度 */
    var BUDGET_MULT = 1;           /* 一次沾油漆可以刷幾倍方塊寬度的長度 */
    /* 每一關沾油漆的次數上限：超過（沾第 DIP_MAX + 1 次，或已經沾滿又沒油漆了）就失敗；DIP_WARN：剩幾次以內，上方的字變警示色 */
    var DIP_MAX = 40, DIP_WARN = 5;
    /* 失敗時，把最大的幾塊沒蓋到的地方標出來給玩家看 */
    var FAIL_MARKS = 4;
    /* 遮罩判定時半徑少算 0.5px（保守：整格幾乎都被蓋到才算塗到） */
    var EDGE_SLACK = 0.5;          /* 遮罩半徑少算幾 px（保守判定） */
    var HINT_COST = 3;             /* 按「顯示未完成區域」要消耗幾次沾漆（直接加進這一關的沾油漆次數） */
    var HINT_R_MIN = 22, HINT_R_MAX = 70;   /* 標出未完成區域的紅圈半徑範圍（px；區域越大圈越大） */
    var HIT_MIN = 56;              /* 點擊區至少多大（px）：筆刷縮得很小時，圓形旁邊的空白也算點到 */
    var POINTER_MIN_H = 52, POINTER_MAX_H = 160;   /* 油漆刷提示的高度範圍（px）；正常是圓形直徑的 2 倍 */
    /* 底色（也是油漆的顏色）：淡色，這樣鮮豔的塗鴉才醒目；塗鴉的顏色：鮮豔的七色 */
    var BASE_COLORS = ['#FFF1C1', '#D6ECFF', '#DDF5E3', '#FFE0E8', '#EADFFF', '#FFE6C9', '#E3F7F7'];
    var INK_COLORS = ['#E53935', '#1E88E5', '#00A152', '#8E24AA', '#FB8C00', '#D81B60', '#00ACC1'];
    /* 塗鴉：
       · SCRIBBLE_MAX：處數最多幾處（第 1 關 1 處，每過一關多 1 處，到這個數字就不再增加；舊版是 10～12 處）；
       · SCRIBBLE_AREA：每一關所有塗鴉的「外框（方形）面積總和」＝54600 px²（舊版 10～12 處、每處約 88−筆頭粗細 的方框，平均算出來的），
         所以第 1 關只有 1 處時，這一處就放大到邊長約 234px（舊版每處只有約 70px）——「面積等於原來多個圖案的總面積」；
       · PEN_SIZES：筆頭粗細（直徑 px）；SCRIBBLE_GAP：塗鴉離小區邊緣的空隙；DOT_MAX_SIDE：圖案邊長超過這個數字就不抽「圓點」。 */
    var SCRIBBLE_MAX = 12;
    var SCRIBBLE_AREA = 54600;
    var PEN_SIZES = [6, 10, 14, 18, 22, 26, 30];
    var SCRIBBLE_GAP = 6, DOT_MAX_SIDE = 100;
    var KINDS = ['zigzag', 'wave', 'spiral', 'loops', 'star', 'ring', 'cross', 'hatch', 'dot'];

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }
    /* 按鈕文字用中文數字（HINT_COST 改成 2 或 5，文字會跟著變） */
    var NUM_CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

    /* 純函式：遮罩（也給 Node 測試用） */
    /* ═══ 純函式：遮罩（也給 Node 測試用）═══ */
    /* 遮罩是一張 n×n 的點陣（每個邏輯 px 一格），0＝沒塗、1＝塗到了；left 記還有幾格沒塗，減到 0 就完全塗滿 */
    function makeMask(n) {
        return { n: n, data: new Uint8Array(n * n), left: n * n };
    }
    /* 蓋一個圓（圓心、半徑）：逐列填入，並算有幾格是「新塗到」的 */
    /* 蓋一個圓（圓心 cx,cy 是方塊座標，r 是畫出來的半徑）；回傳新塗到幾格 */
    function stampDisc(m, cx, cy, r) {
        var re = r - EDGE_SLACK;
        if (re <= 0) return 0;
        var n = m.n, d = m.data, added = 0;
        /* y0..y1：圓覆蓋的列範圍 */
        var y0 = Math.max(0, Math.ceil(cy - re - 0.5)), y1 = Math.min(n - 1, Math.floor(cy + re - 0.5));
        for (var y = y0; y <= y1; y++) {
            var dy = (y + 0.5) - cy;
            /* hw：這一列圓的半寬（勾股定理） */
            var hw = Math.sqrt(re * re - dy * dy);
            var x0 = Math.max(0, Math.ceil(cx - hw - 0.5)), x1 = Math.min(n - 1, Math.floor(cx + hw - 0.5));
            var row = y * n;
            for (var x = x0; x <= x1; x++) {
                if (!d[row + x]) { d[row + x] = 1; added++; }
            }
        }
        m.left -= added;
        return added;
    }
    /* 沿線段每隔幾 px 蓋一個圓，這樣畫得快也不會漏縫 */
    /* 沿線段蓋圓，間隔 ≤ min(3, r/3) px。第一個點（起點）也會蓋，所以一小段一小段呼叫時
       上一段的終點會重複蓋一次（無害） */
    function stampSegment(m, x0, y0, x1, y1, r) {
        var len = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
        var step = Math.max(0.5, Math.min(3, r / 3));
        var k = Math.max(1, Math.ceil(len / step));
        var added = 0;
        for (var i = 0; i <= k; i++) {
            var t = i / k;
            added += stampDisc(m, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r);
        }
        return added;
    }
    /* 找出沒塗到的連通區域（用深度優先搜尋 + 堆疊 stack），回傳各區域的質心，最大的排前面；用來標出還沒塗到的地方 */
    /* 找出沒塗到的連通區域（4 鄰接），回傳 [{x,y,size,px,py}]，最大的在前，最多 limit 個：
       x,y＝質心；size＝格數；px,py＝「區域裡面、離質心最近的一格」的中心（環狀或彎曲的區域質心可能落在已經塗到的地方，
       要標記區域就用 px,py 才一定指在還沒塗到的格子上） */
    /* seen 記錄已處理的格子，stack 是待處理格子的堆疊（後進先出），order 依序記下這一區的格子（找代表點用） */
    function holes(m, limit) {
        var n = m.n, d = m.data, seen = new Uint8Array(n * n), out = [];
        var stack = new Int32Array(n * n), order = new Int32Array(n * n);
        for (var s = 0; s < n * n; s++) {
            if (d[s] || seen[s]) continue;
            var sp = 0, sx = 0, sy = 0, cnt = 0;
            stack[sp++] = s; seen[s] = 1;
            while (sp) {
                var p = stack[--sp], px = p % n, py = (p - px) / n;
                order[cnt] = p;
                sx += px; sy += py; cnt++;
                if (px > 0 && !d[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
                if (px < n - 1 && !d[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
                if (py > 0 && !d[p - n] && !seen[p - n]) { seen[p - n] = 1; stack[sp++] = p - n; }
                if (py < n - 1 && !d[p + n] && !seen[p + n]) { seen[p + n] = 1; stack[sp++] = p + n; }
            }
            /* 代表點：這一區裡離質心最近的格子 */
            var cx = sx / cnt, cy = sy / cnt, best = order[0], bestD = Infinity;
            for (var i = 0; i < cnt; i++) {
                var q = order[i], qx = q % n, qy = (q - qx) / n, dd = (qx - cx) * (qx - cx) + (qy - cy) * (qy - cy);
                if (dd < bestD) { bestD = dd; best = q; }
            }
            var bx = best % n;
            out.push({ x: cx + 0.5, y: cy + 0.5, size: cnt, px: bx + 0.5, py: (best - bx) / n + 0.5 });
        }
        out.sort(function (a, b) { return b.size - a.size; });
        return out.slice(0, limit || 20);
    }
    /* 沾油漆後筆刷縮小到多少 */
    function brushAfter(d) { return Math.max(BRUSH_MIN, d * SHRINK); }

    /* ═══ 塗鴉 ═══ */
    /* 一處塗鴉的所有線條：在邊長 s、左上角 (bx, by) 的方框裡，依 kind 畫出幾條折線（每條線是 [[x,y], …]，點跟點之間 ≤ 3px，畫出來才圓滑）。
       這些座標是「畫布上的 x、y」，畫圖與算遮罩都用同一份，所以遮罩跟看到的塗鴉完全一致。 */
    function scribbleLines(kind, bx, by, s, rand) {
        var cx = bx + s / 2, cy = by + s / 2, i, pts = [];
        function densify(a) {                      /* 把折線補點補到每 3px 一個點（轉折點保留） */
            var out = [a[0]];
            for (var k = 1; k < a.length; k++) {
                var p = a[k - 1], q = a[k], len = Math.sqrt((q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1])), n = Math.max(1, Math.ceil(len / 3));
                for (var j = 1; j <= n; j++) out.push([p[0] + (q[0] - p[0]) * j / n, p[1] + (q[1] - p[1]) * j / n]);
            }
            return out;
        }
        if (kind === 'zigzag' || kind === 'hatch') {
            /* 折線：在方框的兩側來回；hatch 是來回很多趟、間距很密的刷痕（等於塗黑一塊） */
            var n = kind === 'hatch' ? kit.randInt(7, 10, rand) : kit.randInt(4, 7, rand), horiz = rand() < 0.5, gap = kind === 'hatch' ? s * 0.85 : s;
            for (i = 0; i <= n; i++) { var t = i / n, a = i % 2 ? 1 : 0; pts.push(horiz ? [bx + s * t, by + (kind === 'hatch' ? (s - gap) / 2 : 0) + gap * a] : [bx + (kind === 'hatch' ? (s - gap) / 2 : 0) + gap * a, by + s * t]); }
            return [densify(pts)];
        }
        if (kind === 'wave') {
            var amp = s * kit.randFloat(0.15, 0.32, rand), waves = kit.randInt(2, 3, rand), steps = 48, vert = rand() < 0.5;
            for (i = 0; i <= steps; i++) { var u = i / steps, o = amp * Math.sin(u * waves * 2 * Math.PI); pts.push(vert ? [cx + o, by + s * u] : [bx + s * u, cy + o]); }
            return [densify(pts)];
        }
        if (kind === 'spiral') {
            /* 阿基米德螺線：半徑隨角度線性變大，繞 2～3 圈 */
            var turns = kit.randFloat(1.6, 2.6, rand), R = s / 2, steps2 = 90;
            for (i = 0; i <= steps2; i++) { var th = i / steps2 * turns * 2 * Math.PI, r = R * i / steps2; pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]); }
            return [densify(pts)];
        }
        if (kind === 'loops') {
            /* 連環圈（像草寫的連續 e）：一邊往右走、一邊畫圓，圓的半徑 0.2 倍方框 */
            var loops = kit.randInt(2, 4, rand), rr = s * 0.2, steps3 = loops * 30;
            for (i = 0; i <= steps3; i++) { var uu = i / steps3, ang = uu * loops * 2 * Math.PI; pts.push([bx + rr + (s - 2 * rr) * uu + rr * Math.sin(ang) * 0.9, cy - rr * Math.cos(ang) * 0.9 + rr * 0.9]); }
            return [densify(pts)];
        }
        if (kind === 'star') {
            /* 五角星（一筆畫出來）：每隔 144 度連一個頂點，繞兩圈回到起點 */
            var rs = s / 2 * 0.98, rot = rand() * 2 * Math.PI;
            for (i = 0; i <= 5; i++) pts.push([cx + rs * Math.cos(rot + i * 4 * Math.PI / 5), cy + rs * Math.sin(rot + i * 4 * Math.PI / 5)]);
            return [densify(pts)];
        }
        if (kind === 'ring') {
            var rg = s / 2 * 0.95, steps4 = 40;
            for (i = 0; i <= steps4; i++) pts.push([cx + rg * Math.cos(i / steps4 * 2 * Math.PI), cy + rg * Math.sin(i / steps4 * 2 * Math.PI)]);
            return [densify(pts)];
        }
        if (kind === 'cross') {
            /* 叉叉：兩條斜線（分開的兩條線，中間交叉） */
            return [densify([[bx, by], [bx + s, by + s]]), densify([[bx + s, by], [bx, by + s]])];
        }
        /* dot：一個圓點（兩個點靠很近，畫出來就是一個粗圓點） */
        return [[[cx, cy], [cx + 1, cy]]];
    }
    /* 第 level 關要畫幾處塗鴉：第 1 關只有 1 處，每過一關多 1 處，最多 SCRIBBLE_MAX 處（＝舊版的 10～12 處）。
       level 沒給（舊測試、舊呼叫）就當最後一關。 */
    function scribbleCount(level) { return level == null ? SCRIBBLE_MAX : Math.max(1, Math.min(SCRIBBLE_MAX, Math.floor(level))); }
    /* k 處塗鴉要把方塊切成幾乘幾個小區才放得下（每處各占一個小區，所以互相分開）：
       1 處＝整個方塊（1×1）、2～4 處＝2×2、5～9 處＝3×3、10 處以上＝4×4（跟舊版一樣） */
    function gridFor(k) { return k <= 1 ? 1 : (k <= 4 ? 2 : (k <= 9 ? 3 : 4)); }
    /* 產生第 level 關的塗鴉：回傳 [{ kind, w（筆頭直徑）, color, lines }]。
       做法：
       1. 處數 K ＝ scribbleCount(level)，方塊切成 gridFor(K)×gridFor(K) 個小區，隨機挑 K 個不同的小區，每區一處塗鴉；
       2. 「面積」：K 處塗鴉的外框（方形）面積總和固定是 SCRIBBLE_AREA（＝舊版 10～12 處塗鴉的外框面積總和），
          所以每處的邊長 ＝ √(SCRIBBLE_AREA ÷ K)——第 1 關只有一處，就把這一處放大到整個面積；處數越多，每一處越小，
          到 K ≥ 10 就跟舊版一樣（小區太小時邊長受小區限制，筆頭越粗圖越小，跟舊版一樣）；
       3. 筆頭粗細從 PEN_SIZES 洗牌後輪流取（處數夠多時七種粗細都會出現）；
       4. 塗鴉整個縮在自己的小區裡，離小區邊緣至少 筆頭半徑 ＋ SCRIBBLE_GAP，所以任兩處塗鴉互相分開（至少隔 2×SCRIBBLE_GAP px）；
          圖案在小區裡剩下的空位內隨機擺（位置不固定在左上角）；
       5. 連續兩處不是同一種形狀；「圓點」沒有大小可言，邊長超過 DOT_MAX_SIDE 的大圖案不抽它。 */
    function makeScribbles(rand, level) {
        rand = rand || Math.random;
        var K = scribbleCount(level), g = gridFor(K), cell = SQ / g, cells = [], c;
        for (c = 0; c < g * g; c++) cells.push(c);
        var spots = kit.shuffle(cells, rand).slice(0, K);
        var sizes = kit.shuffle(PEN_SIZES, rand), out = [], lastKind = null, want = Math.sqrt(SCRIBBLE_AREA / K);
        spots.forEach(function (ci, k) {
            var w = sizes[k % sizes.length], pad = w / 2 + SCRIBBLE_GAP, room = cell - 2 * pad, side = Math.min(want, room);
            var bx = (ci % g) * cell + pad + rand() * (room - side), by = Math.floor(ci / g) * cell + pad + rand() * (room - side);
            var kind, tries = 0;
            do { kind = kit.pick(KINDS, rand); tries++; } while ((kind === lastKind || (kind === 'dot' && side > DOT_MAX_SIDE)) && tries < 60);        /* 連續兩處不要同一種形狀 */
            lastKind = kind;
            out.push({ kind: kind, w: w, color: kit.pick(INK_COLORS, rand), lines: scribbleLines(kind, bx, by, side, rand), side: side });
        });
        return out;
    }
    /* 塗鴉的遮罩：回傳可以直接拿來玩的遮罩 { n, data, left, total }——塗鴉會碰到的格子是 0（還沒蓋）、其他格子是 1（不用蓋），
       left＝還沒蓋的格數（一開始＝total＝塗鴉的總格數）。塗鴉的範圍比畫出來的線多算 0.5px（stampSegment 會少算 0.5，所以傳進去半徑 + 1）。 */
    function scribbleMask(scribbles, n) {
        n = n || SQ;
        var m = makeMask(n);
        scribbles.forEach(function (sc) {
            sc.lines.forEach(function (ln) { for (var i = 1; i < ln.length; i++) stampSegment(m, ln[i - 1][0], ln[i - 1][1], ln[i][0], ln[i][1], sc.w / 2 + 1); });
        });
        var total = n * n - m.left;                    /* m.left＝沒被塗鴉碰到的格數，所以塗鴉的格數＝全部 − m.left */
        for (var k = 0; k < m.data.length; k++) m.data[k] = m.data[k] ? 0 : 1;      /* 反過來：塗鴉＝0（要蓋）、其他＝1（不用蓋） */
        m.left = total; m.total = total;
        return m;
    }
    /* 依闖過的關數給評語（成績＝闖過幾關，越多越好）。全部 MAX_LEVEL 關蓋完＝最高評價 */
    function rating(cleared) {
        if (cleared >= MAX_LEVEL) return '油漆大師！';
        if (cleared >= 12) return '蓋得真漂亮';         /* 第 12 關起塗鴉處數就到頂了（SCRIBBLE_MAX），之後比的是耐力 */
        if (cleared >= 6) return '很不錯';
        if (cleared >= 3) return '蓋好了';
        return '再接再厲';
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;
        /* 計分方式改成「闖過幾關」（V1.34.0）：舊版存的是「沾油漆次數」（越少越好），數字不能跟關數比，第一次進來把它清掉 */
        Reaction.migrateBest(ID, function () { return null; }, '.levels');

        /* round：開一局，從第 startAt 關開始（預設第 1 關；失敗後可從前 5 關繼續、下次進場從最佳關卡 − 4 開始，見 kit.enter） */
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            var first = startAt || 1;
            var cleared = first - 1;             /* 已經闖過幾關（也是成績；從第 first 關開始的話，前面的關算已過） */
            var runDips = 0;                     /* 這一局（所有關卡加起來）沾了幾次油漆，結算時顯示 */
            var newRec = false;

            /* buildLevel：畫第 n 關。每一關都重新蓋一張新的方塊（新的底色、新的塗鴉），筆刷與沾油漆次數歸零 */
            function buildLevel(n) {
                root.innerHTML = '';

                /* color 這關的底色（也是油漆的顏色）；scribbles 這關的塗鴉；mask 遮罩（塗鴉的格子是 0、蓋掉變 1）；D 目前筆刷直徑；dips 這關沾了幾次；budget 剩餘油漆量（可畫多長）；swept 所有筆畫掃過的面積總和 */
                var color = kit.pick(BASE_COLORS);
                var scribbles = makeScribbles(Math.random, n);
                var mask = scribbleMask(scribbles, SQ);
                var D = BRUSH_START;                 /* 目前筆刷直徑 */
                var dips = 0;
                var budget = 0, budgetMax = SQ * BUDGET_MULT;     /* 目前剩下的筆畫長度 */
                var swept = 0;                       /* 所有筆畫掃過的面積總和 */
                var state = 'play';                  /* play（玩）／done（這關蓋完了）／fail（沾油漆超過上限） */
                /* last：目前這一筆的上一個點，沒有在畫＝null；pid 正在畫的手指 */
                var last = null;                     /* 目前這一筆的上一個點（方塊座標），沒有在畫＝null */
                var pid = null;
                var warnTimer = null;
                var hints = 0;                       /* 用了幾次「顯示未完成區域」 */
                var hintShown = false;               /* 目前方塊上有沒有正在顯示的未完成區域標記（下一筆開始畫就消失） */

                /* 建立畫面元素：資訊、方塊（canvas 畫布）、警語、油漆量長條、筆刷按鈕 */
                var info = h('div', { 'class': 'pa-info' });
                var field = h('div', { 'class': 'pa-field' });
                var sq = h('div', { 'class': 'pa-square' });
                /* canvas：用 JS 在上面畫點陣圖 */
                var cv = h('canvas', { 'class': 'pa-canvas' });
                /* DPR：畫布解析度加倍（2 倍），在高解析度螢幕上筆跡才不會模糊 */
                var DPR = 2;
                cv.width = SQ * DPR; cv.height = SQ * DPR;
                cv.style.width = SQ + 'px'; cv.style.height = SQ + 'px';
                /* getContext('2d')：取得 2D 畫筆；g.scale 讓之後座標仍以邏輯 px 計 */
                var g = cv.getContext('2d');
                g.scale(DPR, DPR);
                g.lineCap = 'round'; g.lineJoin = 'round';
                /* 先把底色塗滿整張畫布，再把每一處塗鴉畫上去（用跟遮罩同一份折線） */
                g.fillStyle = color; g.fillRect(0, 0, SQ, SQ);
                scribbles.forEach(function (sc) {
                    g.strokeStyle = sc.color; g.lineWidth = sc.w;
                    sc.lines.forEach(function (ln) { g.beginPath(); g.moveTo(ln[0][0], ln[0][1]); for (var i = 1; i < ln.length; i++) g.lineTo(ln[i][0], ln[i][1]); g.stroke(); });
                });
                console.info('[刷油漆] 第 ' + n + ' 關：底色 ' + color + '；塗鴉 ' + scribbles.length + ' 處（' + scribbles.map(function (sc) { return sc.kind + '×' + sc.w + 'px'; }).join('、') + '）；要蓋的格數 ' + mask.total + '（連通區域 ' + holes(mask, 99).length + ' 塊）');
                sq.style.width = sq.style.height = SQ + 'px';
                sq.style.background = color;
                sq.appendChild(cv);
                var marks = h('div', { 'class': 'pa-marks' });
                sq.appendChild(marks);
                field.appendChild(sq);
                var warn = h('div', { 'class': 'pa-warn' });
                field.appendChild(warn);
                var zone = h('div', { 'class': 'pa-zone' });
                var gauge = h('div', { 'class': 'pa-gauge' }, [h('div', { 'class': 'pa-gauge__fill' })]);
                var gfill = gauge.firstChild;
                var brush = h('button', { 'class': 'pa-brush' });
                var brushLabel = h('div', { 'class': 'pa-brushlabel' });
                /* 油漆刷提示：用 SVG 畫（木柄、金屬環、刷毛），刷毛的顏色＝這一局的油漆色；平常隱藏，圓形變成虛線時才顯示（見 refresh） */
                var pointer = h('div', { 'class': 'pa-pointer' });
                var ps = kit.svg('svg', { 'class': 'pa-pointer__svg', viewBox: '0 0 50 100', preserveAspectRatio: 'xMidYMax meet' }, pointer);
                kit.svg('rect', { 'class': 'pa-pt-handle', x: 19, y: 2, width: 12, height: 48, rx: 6 }, ps);
                kit.svg('rect', { 'class': 'pa-pt-ferrule', x: 14, y: 48, width: 22, height: 14, rx: 2 }, ps);
                var bristle = kit.svg('path', { 'class': 'pa-pt-bristle', d: 'M15 62 H35 C38 74 33 90 25 98 C17 90 12 74 15 62 Z' }, ps);
                bristle.style.fill = color;
                /* 畫筆的點擊區（圓形＋油漆刷提示都放在裡面）；放在下方操作區，圓形貼著下緣 */
                var brushBox = h('div', { 'class': 'pa-brushbox' }, [brush, pointer]);
                var brushWrap = h('div', { 'class': 'pa-brushwrap' }, [brushBox]);
                /* 最下面的按鈕：消耗 HINT_COST 次沾漆，標出最大的一塊未完成區域 */
                var hintBtn = h('button', { 'class': 'btn btn--line pa-hintbtn', text: '消耗' + (NUM_CN[HINT_COST] || HINT_COST) + '次沾漆，顯示未完成區域。' });
                zone.appendChild(gauge);
                zone.appendChild(brushWrap);
                zone.appendChild(brushLabel);
                zone.appendChild(hintBtn);
                root.appendChild(info);
                root.appendChild(field);
                root.appendChild(zone);

                /* 塗鴉已經蓋掉的百分比 */
                function paintedPct() { return (1 - mask.left / mask.total) * 100; }
                /* 重新整理畫面上的文字、油漆量、筆刷大小與顏色 */
                function refresh() {
                    var pct = paintedPct();
                    /* 沒蓋完不顯示 100%：用無條件捨去 */
                    var shown = mask.left === 0 ? '100.0000' : (Math.floor(pct * 10000) / 10000).toFixed(4);
                    info.textContent = '沾了 ' + dips + '／' + DIP_MAX + ' 次　已蓋 ' + shown + '%';        /* 文字要短（100.0000% 也要一行放得下），才不會折成兩行把方塊擠扁 */
                    info.classList.toggle('pa-info--low', dips >= DIP_MAX - DIP_WARN);          /* 快到上限了：字變成警示色 */
                    ctx.setMeta(kit.meta(['第 ' + n + ' 關', fmtBest(Reaction.getBest(ID))]));
                    gfill.style.width = (100 * budget / budgetMax).toFixed(1) + '%';
                    brush.style.width = brush.style.height = D + 'px';
                    brush.style.background = budget > 0 ? color : 'transparent';
                    brush.classList.toggle('pa-brush--empty', budget <= 0);
                    brushLabel.textContent = budget > 0 ? '油漆剩 ' + Math.round(100 * budget / budgetMax) + '%' : (dips === 0 ? '點圓形沾油漆' : (dips >= DIP_MAX ? '已沾滿 ' + DIP_MAX + ' 次，再沾就失敗' : '油漆用完了，點圓形再沾'));
                    /* 點擊區：筆刷直徑，但至少 HIT_MIN px（圓形在框的正中間） */
                    var S = Math.max(D, HIT_MIN);
                    brushBox.style.width = brushBox.style.height = S + 'px';
                    /* 油漆刷提示：只在「圓形是虛線（要去沾油漆）」而且遊戲還沒結束時顯示。
                       高度＝圓形直徑的 2 倍（限制在 POINTER_MIN_H～POINTER_MAX_H），寬度是高度的一半；
                       筆尖（圖的底邊正中央）壓在圓形中心偏右下的位置，刷子往右上方傾斜，所以整支刷在圓形的右上方、一部分蓋在圓形上 */
                    var ph = Math.max(POINTER_MIN_H, Math.min(POINTER_MAX_H, D * 2));
                    pointer.style.height = ph + 'px'; pointer.style.width = (ph / 2) + 'px';
                    pointer.style.left = (S / 2 + 0.12 * D - ph / 4) + 'px';
                    pointer.style.top = (S / 2 + 0.4 * D - ph) + 'px';
                    pointer.classList.toggle('pa-pointer--on', budget <= 0 && state === 'play' && dips < DIP_MAX);
                    /* 提示按鈕：還沒塗任何東西、已經塗滿、標記還在顯示、或加上 HINT_COST 次會超過上限時都不能按（避免白白消耗／直接失敗） */
                    hintBtn.disabled = !(state === 'play' && swept > 0 && mask.left > 0 && !hintShown && hintOk());
                }
                /* 提示能不能用：加上 HINT_COST 次之後不能超過上限；而且不能剛好卡在「沾滿了、油漆又沒了」（那樣一按就直接失敗） */
                function hintOk() { return dips + HINT_COST <= DIP_MAX && (budget > 0 || dips + HINT_COST < DIP_MAX); }
                /* 顯示警語一陣子後自動消失 */
                function showWarn(text) {
                    warn.textContent = text;
                    warn.classList.add('pa-warn--on');
                    my.cancel(warnTimer);
                    warnTimer = my.after(1600, function () { warn.classList.remove('pa-warn--on'); });
                }

                /* ─── 沾油漆：油漆量補滿，筆刷縮小一圈；這一關已經沾滿 DIP_MAX 次還要再沾＝超過上限，失敗 ─── */
                function dip() {
                    if (state !== 'play') return;
                    if (dips >= DIP_MAX) { failLevel(); return; }
                    dips++; runDips++;
                    D = brushAfter(D);
                    budget = budgetMax;
                    Sfx.play('flip');
                    warn.classList.remove('pa-warn--on');
                    refresh();
                }
                brushBox.addEventListener('pointerdown', function (e) { e.preventDefault(); dip(); });
                hintBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); useHint(); });

                /* ─── 畫 ─── */
                /* 方塊的左上角（螢幕座標轉成邏輯座標） */
                var sqOrigin = null;
                function origin() {
                    var r = sq.getBoundingClientRect();
                    var o = Stage.toLogical(r.left, r.top);
                    return o;
                }
                /* 把事件座標轉成方塊內的座標 */
                function toSq(e) {
                    var p = kit.pt(e);
                    if (!sqOrigin) sqOrigin = origin();
                    return { x: p.x - sqOrigin.x, y: p.y - sqOrigin.y };
                }
                /* 一筆畫完（或油漆用完）後檢查：塗鴉全蓋住＝過關；油漆用完而且已經沾滿 DIP_MAX 次＝沒有油漆也沒有次數了，直接失敗 */
                function check() {
                    if (state !== 'play') return;
                    if (mask.left === 0) complete();
                    else if (budget <= 0 && dips >= DIP_MAX) failLevel();
                }
                /* 把一段筆畫畫出來並更新遮罩；油漆量不夠就只畫到用完為止 */
                function drawTo(x, y) {
                    /* 把這一段畫出來，並更新遮罩。budget 不夠就只畫到用完為止 */
                    var dx = x - last.x, dy = y - last.y;
                    var len = Math.sqrt(dx * dx + dy * dy);
                    if (len <= 0) return;
                    var use = Math.min(len, budget);
                    var ex = last.x + dx * use / len, ey = last.y + dy * use / len;
                    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = D;
                    /* canvas 畫線：beginPath 開始路徑、moveTo 移動、lineTo 畫線、stroke 描邊 */
                    g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(ex, ey); g.stroke();
                    /* 同時更新遮罩（stampSegment）：之後判定「是否塗滿」靠它，不讀取畫布像素 */
                    stampSegment(mask, last.x, last.y, ex, ey, D / 2);
                    budget -= use;
                    swept += use * D;
                    last = { x: ex, y: ey };
                    /* 油漆用完：警語提示要再沾 */
                    if (use < len) {            /* 油漆用完 */
                        budget = 0;
                        last = null;
                        Sfx.play('bad');
                        if (dips < DIP_MAX) showWarn('油漆用完了！\n點下方圓形再沾一次');
                    }
                    refresh();
                    check();
                }
                /* 開始一筆：點一下也要有一個圓點。圓點也要用油漆：用掉相當於一個筆刷直徑（D px）的油漆量，
                   不然「一直點、不拖曳」就不會用掉油漆，沾一次漆就能把全部塗鴉點完，沾油漆次數就沒有意義了 */
                function startAt(x, y) {
                    if (budget <= 0) { showWarn(dips === 0 ? '先點下方的圓形\n沾一點油漆' : '油漆用完了！\n點下方圓形再沾一次'); return; }
                    last = { x: x, y: y };
                    budget = Math.max(0, budget - D);
                    /* 點一下也要有一個圓點 */
                    g.fillStyle = color;
                    /* arc 畫圓；fill 填滿 */
                    g.beginPath(); g.arc(x, y, D / 2, 0, Math.PI * 2); g.fill();
                    stampDisc(mask, x, y, D / 2);
                    swept += Math.PI * D * D / 4;
                    clearMarks();
                    /* 圓點把油漆用光了：跟拖曳用完一樣出現警語，要再去沾 */
                    if (budget <= 0) { last = null; Sfx.play('bad'); if (dips < DIP_MAX) showWarn('油漆用完了！\n點下方圓形再沾一次'); }
                    refresh();
                    check();
                }
                /* 手指按下 */
                function onDown(e) {
                    if (state !== 'play' || pid != null) return;
                    e.preventDefault();
                    pid = e.pointerId;
                    try { field.setPointerCapture(e.pointerId); } catch (err) { }
                    /* 每一筆都重新量方塊位置（視窗縮放後也準） */
                    sqOrigin = origin();            /* 每一筆重新量方塊位置（視窗縮放後也準） */
                    var p = toSq(e);
                    startAt(p.x, p.y);
                }
                /* 手指移動 */
                function onMove(e) {
                    if (state !== 'play' || e.pointerId !== pid || !last) return;
                    /* getCoalescedEvents：取回被瀏覽器合併掉的中間點，筆畫才不會出現缺口 */
                    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
                    var list = evs && evs.length ? evs : [e];
                    for (var i = 0; i < list.length && last && state === 'play'; i++) {
                        var p = toSq(list[i]);
                        drawTo(p.x, p.y);
                    }
                }
                /* 手指放開 */
                function onUp(e) {
                    if (e.pointerId !== pid) return;
                    pid = null; last = null;
                }
                /* 綁定手指事件；setPointerCapture 讓手指移出方塊外也持續收到事件 */
                field.addEventListener('pointerdown', onDown);
                field.addEventListener('pointermove', onMove);
                field.addEventListener('pointerup', onUp);
                field.addEventListener('pointercancel', onUp);
                /* 操作提示（只在第一次進遊戲時）：先提示「點下方的圓形沾油漆」（手指縮放）；玩家沾了油漆之後，再提示「拖曳蓋掉塗鴉」（手指＋箭頭） */
                if (Reaction.kit.once('paint.hint')) Reaction.kit.hintOn(root, brushBox, { mode: 'tap', fy: 0.75, text: '請點擊圓形沾油漆' });
                brushBox.addEventListener('pointerdown', function () {
                    if (Reaction.kit.once('paint.hint2')) Reaction.kit.hintOn(root, field, { mode: 'drag', dx: field.clientWidth * 0.55, dy: 0, fx: 0.2, fy: 0.25, delay: 300, text: '請拖曳，蓋掉彩色塗鴉' });
                });
                /* 這一關結束（換關、重玩）時把事件監聽拿掉 */
                my.onDispose(function () {
                    field.removeEventListener('pointerdown', onDown);
                    field.removeEventListener('pointermove', onMove);
                    field.removeEventListener('pointerup', onUp);
                    field.removeEventListener('pointercancel', onUp);
                });

                /* ─── 未完成的區域（還沒蓋掉的塗鴉）：不會自動標出來，玩家按「顯示未完成區域」按鈕（消耗 HINT_COST 次沾漆）才標一處 ─── */
                function clearMarks() { marks.innerHTML = ''; hintShown = false; }
                /* 在方塊上標一個紅色脈動圓圈：hl 是 holes() 傳回的區域；紅圈半徑：區域越大圈越大（等面積圓的半徑 + 12px），限制在 HINT_R_MIN～HINT_R_MAX */
                function addMark(hl) {
                    var r = Math.max(HINT_R_MIN, Math.min(HINT_R_MAX, Math.sqrt(hl.size / Math.PI) + 12));
                    var m = h('div', { 'class': 'pa-mark' });
                    m.style.left = hl.px + 'px';
                    m.style.top = hl.py + 'px';
                    m.style.width = m.style.height = (r * 2) + 'px';
                    m.style.margin = (-r) + 'px 0 0 ' + (-r) + 'px';
                    marks.appendChild(m);
                }
                /* 按鈕：沾油漆次數 +HINT_COST，標出「最大的一塊」還沒蓋掉的塗鴉（只洩漏最容易看出來的那一處）。
                   標記留在方塊上，直到玩家下一筆開始畫（startAt 會清掉）；標記還在的時候按鈕按不了，不會重複扣；
                   加上 HINT_COST 次會超過這一關的上限時也不能按（refresh 會把按鈕關掉）。 */
                function useHint() {
                    if (state !== 'play' || mask.left === 0 || swept <= 0 || hintShown || !hintOk()) return;
                    var hl = holes(mask, 1)[0];
                    if (!hl) return;
                    dips += HINT_COST; runDips += HINT_COST; hints++;
                    clearMarks();
                    addMark(hl);
                    hintShown = true;
                    Sfx.play('pop');
                    console.log('刷油漆：提示 → 最大的未完成區域 ' + hl.size + ' 格，中心 (' + hl.px.toFixed(1) + ', ' + hl.py.toFixed(1) + ')，這關沾油漆次數 +' + HINT_COST + ' → ' + dips);
                    refresh();
                    check();
                }

                /* ─── 過關：這一關的塗鴉全部蓋掉 ─── */
                function complete() {
                    if (state !== 'play') return;
                    state = 'done';
                    pid = null; last = null;
                    clearMarks();
                    refresh();
                    cleared = n;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    ctx.setMeta(kit.meta(['第 ' + n + ' 關', fmtBest(Reaction.getBest(ID))]));
                    var allClear = n >= MAX_LEVEL;
                    warn.textContent = allClear ? '全部蓋完了！' : '第 ' + n + ' 關完成！';
                    warn.classList.add('pa-warn--on', 'pa-warn--ok');
                    Sfx.play('win');
                    console.log('刷油漆：第 ' + n + ' 關過關，沾油漆 ' + dips + ' 次（上限 ' + DIP_MAX + '）' + (hints ? '，含提示 ' + hints + ' 次' : ''));
                    my.after(1100, function () { if (allClear) finish(n, true, 0); else buildLevel(n + 1); });
                }
                /* ─── 失敗：這一關沾油漆超過 DIP_MAX 次還沒蓋完。把最大的幾塊沒蓋到的地方標出來給玩家看，一下子再結算 ─── */
                function failLevel() {
                    if (state !== 'play') return;
                    state = 'fail';
                    pid = null; last = null;
                    clearMarks();
                    var hs = holes(mask, FAIL_MARKS);
                    hs.forEach(addMark);
                    my.cancel(warnTimer);
                    warn.textContent = '沾油漆超過 ' + DIP_MAX + ' 次了！';
                    warn.classList.add('pa-warn--on');
                    warn.classList.remove('pa-warn--ok');
                    refresh();
                    Sfx.play('bad');
                    var left = holes(mask, 999).length;
                    console.log('刷油漆：第 ' + n + ' 關失敗，沾油漆超過 ' + DIP_MAX + ' 次，還有 ' + left + ' 塊沒蓋到');
                    my.after(2000, function () { finish(n, false, left); });
                }

                refresh();
                showWarn('先點下方的圓形\n沾一點油漆');

                /* G.debug：測試用後門，stroke() 可以模擬一筆 */
                G.debug = {
                    SQ: SQ,
                    state: function () { return { level: n, cleared: cleared, dips: dips, runDips: runDips, D: D, budget: budget, left: mask.left, total: mask.total, pct: paintedPct(), state: state, swept: swept }; },
                    scribbles: function () { return scribbles; },
                    color: function () { return color; },
                    dip: dip,
                    /* 模擬一筆：points 是方塊座標 [{x,y}]，從第一點按下、依序移動、最後放開 */
                    stroke: function (points) {
                        if (state !== 'play') return state;
                        startAt(points[0].x, points[0].y);
                        for (var i = 1; i < points.length && last; i++) drawTo(points[i].x, points[i].y);
                        last = null;
                        return state;
                    },
                    /* 機器人過關（驗證用）：沾油漆、沿著每一處塗鴉的線畫過去，油漆用完就再沾，直到這一關過關或失敗；走的是真正的 dip／startAt／drawTo */
                    solve: function () {
                        var guard = 0;
                        scribbles.slice().sort(function (a, b) { return b.w - a.w; }).forEach(function (sc) {
                            sc.lines.forEach(function (ln) {
                                var i = 0;
                                while (i < ln.length && state === 'play' && guard++ < 20000) {
                                    if (budget <= 0) { dip(); if (state !== 'play') return; }
                                    startAt(ln[i][0], ln[i][1]);
                                    while (++i < ln.length && last && state === 'play') drawTo(ln[i][0], ln[i][1]);
                                    last = null;
                                }
                            });
                        });
                        return state;
                    },
                    /* 故意失敗（驗證用）：一直沾油漆，沾到超過上限 */
                    wrong: function () { var k = 0; while (state === 'play' && k++ < DIP_MAX + 5) dip(); return state; },
                    holes: function () { return holes(mask, 50); },
                    hint: useHint,
                    hintState: function () { return { hints: hints, hintShown: hintShown, disabled: hintBtn.disabled, marks: marks.children.length, pointerOn: pointer.classList.contains('pa-pointer--on'), pointerH: pointer.style.height }; },
                    goto: function (k) { my.cancel(warnTimer); buildLevel(k); }
                };
            }

            /* ─── 結算：闖關失敗（沾油漆超過上限）或全部 MAX_LEVEL 關蓋完 ─── */
            function finish(n, allClear, left) {
                console.log('刷油漆：結算，闖過 ' + cleared + ' 關' + (allClear ? '（全部通關）' : '，第 ' + n + ' 關失敗'));
                var back = kit.resumeFrom(n);
                kit.result(root, {
                    score: cleared,        /* 世界排行榜成績（跟 setBest 存的同一個數字；0 關不在有效範圍，不會送） */
                    level: n,              /* 記下到過第幾關，下次進場從最佳關卡 − 4 開始（kit.noteLevel） */
                    num: cleared + ' 關', label: rating(cleared),
                    lines: allClear ? ['全部 ' + MAX_LEVEL + ' 關都蓋完了！', '這一局共沾了 ' + runDips + ' 次油漆']
                        : ['第 ' + n + ' 關沾油漆超過 ' + DIP_MAX + ' 次，還有 ' + left + ' 塊塗鴉沒蓋到', '這一局共沾了 ' + runDips + ' 次油漆'],
                    isNew: newRec && cleared > 0, sfx: allClear ? 'perfect' : (cleared >= 6 ? 'win' : 'fail'),
                    onAgain: function () { round(1); },
                    resume: allClear ? null : { level: back, run: function () { round(back); } }
                });
            }

            buildLevel(first);
        }

        /* 進場：從「個人最佳關卡 − 4」開始（沒玩過就是第 1 關），見 kit.enter（reaction_kit.js） */
        kit.enter(ID, round);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '刷油漆',
        rule: '方塊的底色上畫著彩色塗鴉。**用底色的油漆把全部塗鴉蓋掉**，一處都不能漏（連最細的線頭都要蓋住），其他地方不用管。**第 1 關只有 1 處大塗鴉**，每過一關多 1 處（最多 ' + SCRIBBLE_MAX + ' 處）。點下方的圓形沾油漆：每沾一次，筆刷縮小 ' + Math.round((1 - SHRINK) * 100) + '%，只能刷方塊寬度 ' + BUDGET_MULT + ' 倍的長度，用完要再沾。**每一關最多沾 ' + DIP_MAX + ' 次**，超過就失敗！找不到漏掉的，可以按最下面的按鈕，消耗 ' + HINT_COST + ' 次沾漆，標出最大的一塊。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: {
            makeMask: makeMask, stampDisc: stampDisc, stampSegment: stampSegment, holes: holes, brushAfter: brushAfter, rating: rating, makeScribbles: makeScribbles, scribbleMask: scribbleMask, scribbleLines: scribbleLines,
            scribbleCount: scribbleCount, gridFor: gridFor,
            BRUSH_MIN: BRUSH_MIN, SQ: SQ, BRUSH_START: BRUSH_START, BUDGET_MULT: BUDGET_MULT, SHRINK: SHRINK, SCRIBBLE_MAX: SCRIBBLE_MAX, SCRIBBLE_AREA: SCRIBBLE_AREA, DOT_MAX_SIDE: DOT_MAX_SIDE, MAX_LEVEL: MAX_LEVEL, DIP_MAX: DIP_MAX, HINT_COST: HINT_COST,
            PEN_SIZES: PEN_SIZES, SCRIBBLE_GAP: SCRIBBLE_GAP, KINDS: KINDS, BASE_COLORS: BASE_COLORS, INK_COLORS: INK_COLORS
        }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
