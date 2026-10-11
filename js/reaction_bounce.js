/* ═══════════════════════════════════════════════════════════════════
   reaction_bounce.js — 秒反應・球會跑去哪（彈珠檯）
   彈珠從檯子上方掉下來，在交錯排列的釘子間彈來彈去；最下面的收集口（共 7 個）和它上面一段被簾子蓋住。
   猜猜珠子最後會掉進哪一個收集口，點下去：猜中就進下一關，簾子越來越高；猜錯就結束，看你能過第幾關。
   ───────────────────────────────────────────────────────────────────
   · 幾何（單位：檯面座標 px，w＝收集口寬度＝64）：
        - 檯面寬 7w＝448；收集口 7 個；珠子直徑＝0.8w（半徑 25.6）；
        - 釘子很小（半徑 4），同一列的釘子相隔 w；奇偶列錯開半格（單數列在收集口中央，雙數列在收集口分隔線上），
          所以珠子上下兩列永遠「正對著」一根釘子，一定會被彈開；兩根釘子的間隙 w − 8 = 56 > 珠子直徑 51.2，
          珠子對準縫隙時過得去，只是不容易剛好。
        - 從上面數下來的第 1、3、5、7 排（在收集口中央的那幾排）最左與最右也各放一根釘子（一樣相隔 w），
          不然珠子貼著左右牆時會一路直直掉到最底下，變得太好猜。
        - 簾子蓋住的高度＝收集口高度 SLOT_H ＋ LEAD_BALLS × 基數 × 珠子半徑（基數隨關卡變高，見下面）。
   · 關卡（單位：關）：第 1 關的簾子基數是 CURTAIN_BASE_START（1），每過一關加 CURTAIN_BASE_STEP（0.333），
     基數超過 CURTAIN_BASE_LAST（11）的那一關就是最後一關（共 LAST_LEVEL 關，約 32 關，沒人過得了）。
     只看「有沒有猜中那一格」，猜錯就結束，不管差幾格；沒有時間限制，可以慢慢想（也可以在珠子還沒掉完時就先點）。
   · 物理：固定步長 1/240 秒、重力 G、珠子與釘子（圓對圓）及左右牆的彈性碰撞（恢復係數 E_PEG／E_WALL）。
     整條路線在出題時就**預先模擬完**，存成取樣點；畫面只是依時間查表播放，所以答案在珠子落下前就確定，
     不受影格率影響。落點＝珠子中心越過分隔線頂端 (BH − SLOT_H) 時的 x 屬於哪個收集口。
   · 為了不會卡住：珠子若幾乎沒有往下掉，就給一個朝檯面中央的推力。最左最右的釘子離牆只有 32px，珠子可能
     「靠著牆停在釘子頂端」（夾在牆和釘子之間），要約 100 px/秒以上的水平速度才爬得過釘子頂，所以這種情況
     每 0.25 秒檢查、直接推 130 px/秒（一般卡住還是每 0.5 秒推 70 px/秒；只推 70 的話夾住的珠子永遠推不動）。
   · 成績＝通過的關數（越大越好）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'bounce';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 bounce 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。
       max 比 LAST_LEVEL（32）大一點，只是留餘裕；改了簾子的參數之後，LAST_LEVEL 如果超過它，要一起調大。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 40 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區（改數字就能調整檯子與難度） */
    /* ═══ 可以自己調的參數 ═══ */
    /* 7 個收集口、每個寬 64px */
    var SLOTS = 7, W = 64;                      /* 收集口數量與寬度 */
    var BW = SLOTS * W;                         /* 檯面寬 448 */
    /* 珠子半徑：直徑是收集口寬度的 80% */
    var BALL_R = 0.35 * W;                       /* 珠子半徑（直徑＝收集口寬度的 80%）*/
    var PEG_R = 4;
    /* 釘子列距 52px、第一列的 y、共 8 列 */
    var ROW_GAP = 52, ROW0_Y = 70, ROWS = 8;
    var SLOT_H = 60, LEAD_BALLS = 1.5;
    var BH = 560;
    /* 簾子高度的「基數」：第 1 關 CURTAIN_BASE_START，每過一關加 CURTAIN_BASE_STEP，基數超過 CURTAIN_BASE_LAST 的那一關是最後一關。
       簾子高度＝收集口高度 + LEAD_BALLS × 基數 × 珠子半徑；CURTAIN_Y（簾子上緣的 y 座標）＝檯面高 − 簾子高度 */
    var CURTAIN_BASE_START = 1, CURTAIN_BASE_STEP = 0.333, CURTAIN_BASE_LAST = 11;
    /* 最後一關的編號：基數 > CURTAIN_BASE_LAST 的第一關（算出來是 32；1e-9 是避免小數誤差剛好差一點點） */
    var LAST_LEVEL = Math.floor((CURTAIN_BASE_LAST - CURTAIN_BASE_START) / CURTAIN_BASE_STEP + 1e-9) + 2;
    /* DIV_Y：分隔線上緣；珠子中心越過這條線就算「掉進收集口」 */
    var DIV_Y = BH - SLOT_H;                    /* 分隔線頂端：越過它就算進了收集口 */
    /* 重力、初速左右最大值（所有關卡一樣；舊版 8 回合是 1500 → 2400、0 → 180，現在取中間值，難度改由簾子高度決定） */
    var G_FALL = 1950;
    var VX_MAX = 90;
    /* E_PEG／E_WALL：碰撞後速度剩幾成（恢復係數，0.5＝彈起來的速度是撞擊速度的一半） */
    var E_PEG = 0.7, E_WALL = 0.7;
    var DROP_MIN = W * 1.0;                     /* 珠子從上方掉下來的位置：離左右牆至少一個收集口寬（太靠牆的落點會讓結果偏向兩邊）*/
    /* DT：物理模擬的時間步長（1/240 秒）；MAX_SIM_S 最多模擬 12 秒（保險） */
    var DT = 1 / 240, MAX_SIM_S = 12;
    /* 防卡住的推力：NUDGE_V＝一般卡住時的推力（px/秒）；夾在牆和邊上那根釘子之間時，每 WALL_STEPS 步（60 步＝0.25 秒）檢查一次，推 NUDGE_WALL px/秒 */
    var NUDGE_V = 70, NUDGE_WALL = 130, WALL_STEPS = 60;
    var NEXT_OK_MS = 1800;                      /* 猜中之後多久進下一關 */
    var NEXT_FAIL_MS = 2600;                    /* 猜錯之後多久出結算（讓玩家看清楚珠子怎麼走的）*/

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* 純函式（只靠輸入算結果，也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關簾子的基數（1、1.333、1.666、…） */
    function baseAt(level) { return CURTAIN_BASE_START + CURTAIN_BASE_STEP * (level - 1); }
    /* 這一關簾子的高度（收集口高度 + 若干顆珠子的高度） */
    function hiddenH(level) { return SLOT_H + LEAD_BALLS * baseAt(level) * BALL_R; }
    /* 這一關簾子上緣的 y 座標 */
    function curtainY(level) { return BH - hiddenH(level); }
    /* 全部釘子的位置：單數列（第 1、3、5、7 排）在收集口中央、雙數列在分隔線上，這樣上下兩列互相錯開半格，珠子一定會碰到釘子 */
    /* 全部釘子：程式裡 r＝0,2,4,6 那幾排（畫面上第 1、3、5、7 排）在收集口中央 (k+0.5)w，k=0..6（含最左最右）；其他排在分隔線 k·w，k=1..6 */
    function makePegs() {
        var pegs = [];
        for (var r = 0; r < ROWS; r++) {
            var y = ROW0_Y + r * ROW_GAP;
            /* 收集口中央那幾排：最左（x=32）與最右（x=416）也放一根，跟其他釘子一樣相隔 w；
               不放的話珠子貼著牆就會直接掉到底（離牆 32px 的釘子會讓珠子停在釘子頂端靠著牆，靠 simulate 的推力解決） */
            if (r % 2 === 0) for (var k = 0; k < SLOTS; k++) pegs.push({ x: (k + 0.5) * W, y: y, row: r });
            else for (var k2 = 1; k2 < SLOTS; k2++) pegs.push({ x: k2 * W, y: y, row: r });
        }
        return pegs;
    }
    /* PEGS 是釘子的資料，程式一載入就先算好 */
    var PEGS = makePegs();
    /* 物理模擬：從 (x0, 最上方) 開始，用固定時間步長一步一步算珠子的位置，記錄每一步，直到越過分隔線。
       level：第幾關（決定簾子上緣在哪，用來算「整顆珠子被簾子蓋住」的時間；不傳就當第 1 關） */
    /* 模擬一顆珠子：回傳 { xs, ys（每 DT 一個取樣點）, slot, tCross（越過分隔線的時間，秒）, tHide（整顆珠子被簾子蓋住的時間）, steps } */
    function simulate(x0, vx0, g, level) {
        var cy = curtainY(level || 1);
        var x = x0, y = BALL_R + 4, vx = vx0, vy = 0, xs = [x], ys = [y], t = 0, yMark = y, yMarkW = y, tHide = null, tCross = null, nudged = 0;
        /* vy（垂直速度）每步加 g×DT（重力加速度）；位置每步加 速度×DT */
        var maxSteps = Math.round(MAX_SIM_S / DT);
        for (var step = 0; step < maxSteps; step++) {
            vy += g * DT;
            x += vx * DT; y += vy * DT;
            /* 碰到左右牆：把珠子推回牆內，並讓水平速度反向（乘 E_WALL 損耗） */
            /* 左右牆 */
            if (x < BALL_R) { x = BALL_R; if (vx < 0) vx = -vx * E_WALL; }
            if (x > BW - BALL_R) { x = BW - BALL_R; if (vx > 0) vx = -vx * E_WALL; }
            /* 釘子碰撞：只檢查附近的釘子；兩圓相交（距離 < 兩半徑和）就把珠子推出去，並讓速度沿著碰撞方向反彈 */
            /* 釘子（只檢查附近的列）*/
            for (var i = 0; i < PEGS.length; i++) {
                var p = PEGS[i];
                if (Math.abs(p.y - y) > BALL_R + PEG_R + 2) continue;
                var dx = x - p.x, dy = y - p.y, d2 = dx * dx + dy * dy, rr = BALL_R + PEG_R;
                if (d2 < rr * rr) {
                    var d = Math.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d;
                    x = p.x + nx * rr; y = p.y + ny * rr;
                    /* vn 是速度在碰撞方向上的分量；vn < 0 表示正在靠近釘子，才需要反彈 */
                    var vn = vx * nx + vy * ny;
                    if (vn < 0) { vx -= (1 + E_PEG) * vn * nx; vy -= (1 + E_PEG) * vn * ny; }
                }
            }
            /* 釘子把珠子往外推的時候，貼牆的珠子可能被推進牆裡（最左最右的釘子離牆只有 32px），所以再擋一次牆：珠子絕不出界 */
            if (x < BALL_R) x = BALL_R;
            if (x > BW - BALL_R) x = BW - BALL_R;
            t += DT;
            xs.push(x); ys.push(y);
            if (tHide == null && y - BALL_R >= cy) tHide = t;
            if (y >= DIV_Y) { tCross = t; break; }
            /* 防卡住（兩種，都只看位置，所以結果永遠一樣）：
               ① 夾在牆和最左／最右那根釘子之間：珠子貼著牆（x 被牆擋住）、而且每 0.25 秒往下掉不到 3px，
                  就馬上朝檯面中央推 NUDGE_WALL px/秒。要有約 100 px/秒以上才爬得過釘子頂，太小的推力推一百次也沒用；
               ② 其他地方卡住：每 0.5 秒看一次，沒往下掉 4px 就朝檯面中央推 NUDGE_V px/秒（跟舊版一樣）。 */
            if (step % WALL_STEPS === WALL_STEPS - 1) {
                var onWall = x <= BALL_R + 0.01 || x >= BW - BALL_R - 0.01;
                if (onWall && y - yMarkW < 3) { vx += (x < BW / 2 ? 1 : -1) * NUDGE_WALL; nudged++; }
                yMarkW = y;
            }
            if (step % 120 === 119) {
                if (y - yMark < 4) { vx += (x < BW / 2 ? 1 : -1) * NUDGE_V; nudged++; }
                yMark = y;
            }
        }
        if (tCross == null) tCross = t;
        if (tHide == null) tHide = tCross;
        /* 落點收集口＝珠子 x 座標除以收集口寬度取整，並限制在 0～6 之間 */
        var slot = Math.max(0, Math.min(SLOTS - 1, Math.floor(x / W)));
        return { xs: xs, ys: ys, slot: slot, tCross: tCross, tHide: tHide, steps: xs.length - 1, xEnd: x, nudged: nudged };
    }
    /* 查表：回傳模擬在時間 t 的位置（在兩個取樣點之間做線性插值），畫面播放用 */
    function pathAt(sim, t) {
        var f = Math.max(0, t) / DT, i = Math.min(sim.steps, Math.floor(f)), j = Math.min(sim.steps, i + 1), u = f - i;
        return { x: sim.xs[i] + (sim.xs[j] - sim.xs[i]) * u, y: sim.ys[i] + (sim.ys[j] - sim.ys[i]) * u };
    }
    /* 出一關：隨機決定起點與初速，預先把整條軌跡模擬完（所以答案在珠子落下前就確定，不受畫面卡頓影響） */
    function makeRound(level, rand) {
        rand = rand || Math.random;
        var x0 = kit.randFloat(DROP_MIN, BW - DROP_MIN, rand), vx0 = kit.randFloat(-VX_MAX, VX_MAX, rand);
        var sim = simulate(x0, vx0, G_FALL, level);
        return { level: level, x0: x0, vx0: vx0, g: G_FALL, sim: sim, base: baseAt(level), hiddenH: hiddenH(level), curtainY: curtainY(level) };
    }
    /* 依通過的關數給評語 */
    function rating(cleared) {
        if (cleared >= LAST_LEVEL) return '全部通關！彈珠之神！';
        if (cleared >= 15) return '彈珠大師！';
        if (cleared >= 7) return '抓得到節奏！';
        return '再試一次，會更準！';
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* 舊版是「8 回合平均誤差（格）」，跟現在的「通過幾關」完全不同：第一次進來把舊的最佳紀錄清掉（只清一次） */
        Reaction.migrateBest(ID, function () { return null; }, '.levels');
        var R = null;

        /* round：開一局（從第 1 關開始，猜錯就結束） */
        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* level 目前第幾關；cleared 已經猜中幾關；newRec 有沒有刷新最佳；cur 這一關的資料；picked 玩家猜的收集口 */
            var level = 0, cleared = 0, newRec = false, state = 'idle', rid = 0, cur = null, picked = null;
            var head = h('div', { 'class': 'bo-head' });
            var banner = h('div', { 'class': 'bo-banner' });
            var field = h('div', { 'class': 'bo-field' });
            [head, banner, field].forEach(function (n) { root.appendChild(n); });
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            /* 畫檯面（SVG）：底板、釘子、分隔線、軌跡、珠子、簾子、7 個可點的收集口 */
            /* 檯面（SVG）*/
            var svg = kit.svg('svg', { 'class': 'bo-svg', viewBox: '0 0 ' + BW + ' ' + BH, preserveAspectRatio: 'xMidYMid meet' }, field);
            kit.svg('rect', { 'class': 'bo-board', x: 0, y: 0, width: BW, height: BH }, svg);
            PEGS.forEach(function (p) { kit.svg('circle', { 'class': 'bo-peg', cx: p.x, cy: p.y, r: PEG_R }, svg); });
            /* 分隔線 */
            for (var k = 1; k < SLOTS; k++) kit.svg('line', { 'class': 'bo-div', x1: k * W, y1: DIV_Y, x2: k * W, y2: BH }, svg);
            /* 軌跡線（polyline，揭曉時才畫） */
            var trail = kit.svg('polyline', { 'class': 'bo-trail', points: '' }, svg);
            var ball = kit.svg('circle', { 'class': 'bo-ball', cx: -100, cy: -100, r: BALL_R }, svg);
            /* 簾子（遮住最下面的收集口）：高度每一關不一樣，位置在 layoutCurtain 裡設定 */
            var curtain = kit.svg('rect', { 'class': 'bo-curtain', x: 0, y: curtainY(1), width: BW, height: hiddenH(1) }, svg);
            var slotEls = [], slotBgs = [], slotTxts = [];
            /* 7 個收集口：用立即執行函式 (function (s) {...})(s) 讓每個按鈕記住自己的編號 s（var 沒有區塊範圍，不這樣寫所有按鈕都會共用最後一個 s） */
            for (var s = 0; s < SLOTS; s++) {
                (function (s) {
                    var g = kit.svg('g', { 'class': 'bo-slot' }, svg);
                    slotBgs.push(kit.svg('rect', { 'class': 'bo-slot__bg', x: s * W + 3, y: 0, width: W - 6, height: 10, rx: 10 }, g));
                    var t = kit.svg('text', { 'class': 'bo-slot__t', x: s * W + W / 2, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
                    t.textContent = String(s + 1);
                    slotTxts.push(t);
                    g.addEventListener('pointerdown', function (e) { e.preventDefault(); choose(s); });
                    slotEls.push(g);
                })(s);
            }
            /* 依這一關的簾子高度，擺好簾子與 7 個收集口按鈕（按鈕蓋滿簾子的範圍，數字在簾子正中間） */
            function layoutCurtain(hh) {
                var cy = BH - hh;
                curtain.setAttribute('y', cy); curtain.setAttribute('height', hh);
                for (var i = 0; i < SLOTS; i++) {
                    slotBgs[i].setAttribute('y', cy + 14); slotBgs[i].setAttribute('height', hh - 20);
                    slotTxts[i].setAttribute('y', cy + hh / 2 + 6);
                }
            }

            /* 開始一關 */
            function startLevel() {
                if (my.dead) return;
                level++;
                var id = ++rid;
                cur = makeRound(level); picked = null;
                layoutCurtain(cur.hiddenH);
                head.textContent = '第 ' + level + ' 關　已過 ' + cleared + ' 關';
                banner.textContent = '猜珠子會掉進幾號（不限時間）';
                curtain.setAttribute('opacity', 1);
                slotEls.forEach(function (g) { g.classList.remove('bo-slot--pick', 'bo-slot--ok', 'bo-slot--bad'); g.style.display = ''; });
                trail.setAttribute('points', '');
                ball.setAttribute('cx', -100);
                state = 'fall';
                /* 主控台印出這一關的實際資料（簾子、起點、初速、全程秒數、落在哪個收集口），方便驗證 */
                try { console.info('[球會跑去哪] 第 ' + level + ' 關：簾子基數 ' + cur.base.toFixed(3) + '（高 ' + cur.hiddenH.toFixed(1) + 'px，上緣 y=' + cur.curtainY.toFixed(1) + '）；起點 x=' + cur.x0.toFixed(1) + '、初速 ' + cur.vx0.toFixed(0) + ' px/秒；全程 ' + cur.sim.tCross.toFixed(2) + ' 秒、被簾子蓋住時 ' + cur.sim.tHide.toFixed(2) + ' 秒；會掉進第 ' + (cur.sim.slot + 1) + ' 個收集口'); } catch (e) { }
                var t0 = performance.now();
                /* my.loop：每個畫面更新一次，用「現在時間」查表算出珠子位置；珠子掉完（或玩家已經選了）就停 */
                my.loop(function (now) {
                    if (id !== rid || state !== 'fall') return false;
                    var t = (now - t0) / 1000;
                    var p = pathAt(cur.sim, Math.min(t, cur.sim.tCross));
                    ball.setAttribute('cx', p.x.toFixed(1)); ball.setAttribute('cy', p.y.toFixed(1));
                    if (t >= cur.sim.tCross) return false;
                });
            }

            /* 玩家點了第 s 號收集口（沒有時間限制，什麼時候點都可以，包括珠子還在掉的時候） */
            function choose(s) {
                if (state !== 'fall') return;
                picked = s;
                slotEls[s].classList.add('bo-slot--pick');
                Sfx.play('click');
                reveal(s);
            }

            /* 揭曉：簾子變透明、畫出完整軌跡、顯示實際落點；猜中進下一關，猜錯結束 */
            function reveal(s) {
                if (state !== 'fall') return;
                state = 'reveal';
                var actual = cur.sim.slot, right = s === actual;
                /* 簾子拉開，畫出完整軌跡，珠子停在實際的收集口 */
                curtain.setAttribute('opacity', 0.12);
                slotEls.forEach(function (g) { g.style.display = 'none'; });
                /* 軌跡太密，每隔幾個取樣點取一個，避免畫太多點 */
                var pts = [], step = Math.max(1, Math.floor(cur.sim.steps / 160));
                for (var i = 0; i <= cur.sim.steps; i += step) pts.push(cur.sim.xs[i].toFixed(1) + ',' + cur.sim.ys[i].toFixed(1));
                trail.setAttribute('points', pts.join(' '));
                ball.setAttribute('cx', (actual * W + W / 2).toFixed(1)); ball.setAttribute('cy', (BH - 26).toFixed(1));
                var tag = kit.svg('g', { 'class': 'bo-result' }, svg);
                kit.svg('rect', { 'class': 'bo-result__bg ' + (right ? 'bo-result__bg--ok' : 'bo-result__bg--bad'), x: actual * W + 2, y: DIV_Y, width: W - 4, height: SLOT_H - 4, rx: 8 }, tag);
                if (!right) kit.svg('rect', { 'class': 'bo-result__bg bo-result__bg--you', x: s * W + 2, y: DIV_Y, width: W - 4, height: SLOT_H - 4, rx: 8 }, tag);
                Sfx.play(right ? 'win' : 'bad');
                banner.textContent = (right ? '猜中了！' : '猜錯了！') + '　珠子掉進第 ' + (actual + 1) + ' 號';
                if (right) {
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    ctx.setMeta(fmtBest(Reaction.getBest(ID)));
                    head.textContent = '第 ' + level + ' 關　過關！已過 ' + cleared + ' 關';
                    my.after(NEXT_OK_MS, function () {
                        if (tag.parentNode) tag.parentNode.removeChild(tag);
                        if (level >= LAST_LEVEL) finish(true); else startLevel();
                    });
                } else {
                    my.after(NEXT_FAIL_MS, function () { finish(false); });
                }
            }

            /* 結算：通過幾關，越多越好 */
            function finish(all) {
                state = 'done';
                console.log('球會跑去哪：通過 ' + cleared + ' 關' + (all ? '（全部通關）' : '，第 ' + level + ' 關猜錯（簾子基數 ' + cur.base.toFixed(3) + '）'));
                kit.result(root, {
                    score: cleared,        /* 世界排行榜成績（跟 setBest 存的同一個數字；0 關不在有效範圍，不會送） */
                    num: cleared + ' 關', label: rating(cleared),
                    lines: all ? [LAST_LEVEL + ' 關全部猜中！簾子已經高到幾乎看不到任何東西了'] : ['第 ' + level + ' 關猜錯了', '只有猜中那一格才算過關，沒有時間限制'],
                    isNew: newRec && cleared > 0, sfx: cleared >= 7 ? 'win' : 'fail', onAgain: round
                });
            }

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { level: level, state: state, cleared: cleared, slot: cur && cur.sim.slot, cur: cur }; },
                choose: choose,
                chooseRight: function () { choose(cur.sim.slot); },
                chooseWrong: function () { choose((cur.sim.slot + 3) % SLOTS); },
                /* 直接跳到第 n 關（驗證高關卡的畫面用；前面的關卡視為已通過） */
                goto: function (n) { level = n - 1; cleared = n - 1; startLevel(); }
            };
            /* 開場等 400 毫秒再開始第 1 關 */
            my.after(400, startLevel);
        }

        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '球會跑去哪',
        rule: '彈珠從上面掉下來，在釘子之間彈來彈去，最下面一段被簾子蓋住。**猜猜它最後會掉進哪一個收集口**（共 7 個），點下面的號碼。猜中就過關，不限時間，可以慢慢想；但簾子會一關比一關高，**猜錯就結束**，看你能過第幾關！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: {
            baseAt: baseAt, hiddenH: hiddenH, curtainY: curtainY, PEGS: PEGS, makePegs: makePegs, simulate: simulate, pathAt: pathAt, makeRound: makeRound, rating: rating,
            SLOTS: SLOTS, W: W, BW: BW, BH: BH, BALL_R: BALL_R, PEG_R: PEG_R, DIV_Y: DIV_Y, SLOT_H: SLOT_H, LEAD_BALLS: LEAD_BALLS, ROW_GAP: ROW_GAP, ROW0_Y: ROW0_Y, ROWS: ROWS, DT: DT,
            LAST_LEVEL: LAST_LEVEL, CURTAIN_BASE_START: CURTAIN_BASE_START, CURTAIN_BASE_STEP: CURTAIN_BASE_STEP, CURTAIN_BASE_LAST: CURTAIN_BASE_LAST, G_FALL: G_FALL, VX_MAX: VX_MAX, SCORE_MAX: SCORE.max
        }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
