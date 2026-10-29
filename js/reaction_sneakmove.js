/* ═══════════════════════════════════════════════════════════════════
   reaction_sneakmove.js — 秒反應・誰在偷偷動（企劃 152）
   畫面上散著一堆圓點，其中有幾個會「偷偷地」極慢移動，其他全部靜止，在限時內把會動的點出來。
   越後面，圓點越多、會動的越多、漂移越慢（每秒 20 像素 → 2 像素）。關卡制：點錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · V1.29（玩家意見）改玩法：
       - 圓點個數 N_DOTS ＝ [第 1 關, 到頂關卡] 線性增加（預設 10 → 30）；
       - 會動的圓點個數 MOVE_DOTS ＝ [1, 3]（隨關卡增加）；
       - 不是持續移動：每顆會動的圓點「輪流」移動 MOVE_TIME 秒（預設 3 → 1 秒）：
           只有 1 顆會動時：移動 MOVE_TIME 秒之後暫停 PAUSE_S（1）秒，再接著動；
           有 2 顆以上會動時：一顆移動 MOVE_TIME 秒之後，立刻換下一顆接著動，輪流不停；
       - 限時 TIME_S 是「只有 1 顆會動」的限制秒數；有 k 顆會動就延長成 k 倍（2 顆＝2 倍、3 顆＝3 倍）。
       - （V1.34 起改了，見下面）要把所有會動的圓點一顆一顆都找出來才過關。
   · 出題（規範 Q1、Q15：先決定結果、再驗證玩家辦得到）：先決定「哪幾顆會動」，再排圓點的位置：圓點之間至少相距 MIN_GAP
     （圓點很多時自動縮小，最小 MIN_GAP_FLOOR；再不行就繼續縮小，但位置永遠是隨機的）；圓心位置全部用浮點數（可以有小數）。
     每顆會動的圓點各自挑一個方向（隨機試很多個角度，挑「能直直走最遠」的那個）：路徑不出畫面，而且離其他圓點、離其他會動的圓點的路徑至少 PATH_CLEAR，
     不會撞到或擠到別人（那樣會害人看不出來是誰在動）。
   · V1.32 修正（玩家回報：兩顆會動時，圓點排成整齊的 5 欄陣列，會動的永遠是左上角兩顆）：以前要求「整個限時內走的路徑」都要完整放得進畫面，
     速度慢但限時很長（TIME_S＝180 秒、兩顆就是 360 秒）時，路徑長達幾百 px，怎麼排都放不進去，就掉進「保底」——圓點排成固定的格子、
     會動的永遠是 0 號和 1 號。現在改成：圓點走不完整條路徑時，走到「能直直走的最遠處」就掉頭走回來（來回走，位置是時間的純函式，三角波），
     所以不管限時多長、速度多慢，路徑都放得進去；保底也不再用格子，而是隨機排列（間距縮小）、隨機挑會動的圓點。
   · V1.34（玩家意見）：
       - 兩顆以上會動時，原本「只點到一顆就算這關完成」沒有挑戰性。改成要「一顆接著一顆」把所有會動的都找出來：點到會動的圓點，那一顆就停下來、
         加上綠色外框（找到了，再點它不算），其他的繼續輪流動；全部找到才過關；點到不動的圓點、或限時內還沒找齊就失敗；
       - 顏色：答對（找到會動的）的圓點加「綠色」外框，答錯（點到不動的）的圓點才加「紅色」外框；失敗時沒找到的會動圓點也用綠色外框標出答案。
   · 位置是時間的純函式（規範 T3）：第 i 顆會動的圓點在第 t 秒的位置 ＝ 起點 ＋ 方向 × 速度 × 它「已經動了幾秒」（movedTime），畫面只是把它畫出來。
   · 難度線性（RAMP_LEVELS 關走到頂）：漂移速度 SPEED 20 → 2 像素／秒。
   · 揭曉：每一顆會動的圓點的軌跡畫成一條細線，寫出各自「漂移了 X.XXXX 像素」（到你點下去的那一刻為止）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'sneakmove';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var SPEED = [5.0, 2.0];                        /* 漂移速度（像素／秒）：第 1 關 → 到頂 */
    var TIME_S = 180;                            /* 作答限時（秒）：只有 1 顆會動時的限制秒數；k 顆會動就乘 k */
    var N_DOTS = [20, 36];                      /* 圓點個數：第 1 關 → 到頂關卡 */
    var MOVE_DOTS = [1, 3];                     /* 會動的圓點個數：第 1 關 → 到頂關卡 */
    var MOVE_TIME = [0.5, 0.1];                     /* 每顆會動的圓點，一次連續移動幾秒：第 1 關 → 到頂關卡 */
    var PAUSE_S = 1.0;                            /* 只有 1 顆會動時，移動之後暫停幾秒（2 顆以上時不暫停，立刻換下一顆） */
    var DOT_R = 18;                             /* 圓點畫出來的半徑 */
    var HIT_R = 40;                             /* 命中半徑（比畫出來的大，手指好點） */
    var MIN_GAP = 74;                           /* 任兩顆圓點圓心至少相距多少 */
    var MIN_GAP_FLOOR = 50;                     /* 圓點太多排不下時，間距最小縮到多少 */
    var PATH_CLEAR = 52;                        /* 漂移路徑離其他圓點（與其他會動的圓點的路徑）至少多遠 */
    var MARGIN = 34;                            /* 圓點離遊戲區邊緣至少多遠 */
    var TRAVEL_MIN = 70;                        /* 每顆會動的圓點，能走的路徑至少要有多長（px）才算合格（總路徑本來就比這短的話，以總路徑為準）：走得太短就看不出在動 */
    var ANGLES = 90;                            /* 挑方向時，試幾個角度 */
    var GAP_LAST = 40;                          /* 最後的保底，圓點間距最小縮到多少（圓點半徑 DOT_R ＝ 18，再小就會疊在一起） */
    var MAX_LEVEL = 90;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function speedFor(level) { return kit.ramp(level, SPEED[0], SPEED[1], RAMP_LEVELS); }
    function dotCountFor(level) { return Math.round(kit.ramp(level, N_DOTS[0], N_DOTS[1], RAMP_LEVELS)); }
    function moverCountFor(level) { return Math.max(1, Math.round(kit.ramp(level, MOVE_DOTS[0], MOVE_DOTS[1], RAMP_LEVELS))); }
    function moveTimeFor(level) { return Math.round(kit.ramp(level, MOVE_TIME[0], MOVE_TIME[1], RAMP_LEVELS) * 100) / 100; }
    /* 限時（秒）：1 顆會動＝TIME_S，k 顆＝TIME_S × k */
    function limitFor(k) { return TIME_S * Math.max(1, k); }
    /* 點 (px,py) 到線段 (ax,ay)-(bx,by) 的最短距離 */
    function segDist(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        var t = l2 === 0 ? 0 : kit.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
        return kit.dist(px, py, ax + t * dx, ay + t * dy);
    }
    /* 兩條線段的最短距離（相交＝0） */
    function segsDist(a, b, c, d) {
        function cross(p, q, r) { return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); }
        var d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
        if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
        return Math.min(segDist(a.x, a.y, c.x, c.y, d.x, d.y), segDist(b.x, b.y, c.x, c.y, d.x, d.y), segDist(c.x, c.y, a.x, a.y, b.x, b.y), segDist(d.x, d.y, a.x, a.y, b.x, b.y));
    }
    /* 第 idx 顆會動的圓點（0～k−1），到第 t 秒為止「已經動了幾秒」：
       k＝1：動 moveTime 秒、停 PAUSE_S 秒，重複；k≥2：0 號動 moveTime 秒 → 立刻換 1 號 → … → 最後一號動完又換回 0 號，輪流不停 */
    function movedTime(k, moveTime, idx, t) {
        if (t <= 0) return 0;
        if (k <= 1) {
            var cyc = moveTime + PAUSE_S, full = Math.floor(t / cyc), rem = t - full * cyc;
            return full * moveTime + Math.min(rem, moveTime);
        }
        var cycle = k * moveTime, f = Math.floor(t / cycle), r = t - f * cycle;
        return f * moveTime + kit.clamp(r - idx * moveTime, 0, moveTime);
    }
    /* 第 t 秒有哪一顆（會動的第幾顆）正在動；沒有（暫停中）回傳 −1 */
    function activeAt(k, moveTime, t) {
        if (t < 0) return -1;
        if (k <= 1) { var cyc = moveTime + PAUSE_S; return (t % cyc) < moveTime ? 0 : -1; }
        return Math.floor((t % (k * moveTime)) / moveTime);
    }
    /* 三角波：沿著長度 len 的路徑來回走，走了總距離 d 之後在哪裡（0～len）：走到盡頭就掉頭走回來 */
    function triangle(d, len) {
        if (!(len > 0)) return 0;
        var m = d % (2 * len);
        return m > len ? 2 * len - m : m;
    }
    /* 第 idx 顆會動的圓點在第 t 秒的位置（浮點數）：已經動了 d 像素；路徑長度 m.len（走到盡頭就掉頭走回來） */
    function posAt(q, idx, t) {
        var m = q.movers[idx], d = q.speed * movedTime(q.movers.length, q.moveTime, idx, t), sd = m.len == null ? d : triangle(d, m.len);
        return { x: m.x0 + m.dx * sd, y: m.y0 + m.dy * sd };
    }
    /* 從 (x0,y0) 朝單位方向 (dx,dy) 直直走，最遠能走多遠：不出畫面（離邊緣至少 MARGIN），而且離每個障礙點至少 clear */
    function freeLen(x0, y0, dx, dy, obstacles, W, H, clear) {
        var L = 1e9;
        if (dx > 1e-9) L = Math.min(L, (W - MARGIN - x0) / dx); else if (dx < -1e-9) L = Math.min(L, (MARGIN - x0) / dx);
        if (dy > 1e-9) L = Math.min(L, (H - MARGIN - y0) / dy); else if (dy < -1e-9) L = Math.min(L, (MARGIN - y0) / dy);
        for (var i = 0; i < obstacles.length; i++) {
            var px = obstacles[i].x - x0, py = obstacles[i].y - y0, proj = px * dx + py * dy;
            if (proj <= 0) continue;
            var perp2 = px * px + py * py - proj * proj;
            if (perp2 >= clear * clear) continue;
            var hit = proj - Math.sqrt(clear * clear - perp2);
            if (hit < L) L = hit;
        }
        return Math.max(0, L);
    }
    /* 在 W×H 裡放 n 顆圓點，彼此至少相距 gap；放不下回傳 null */
    function placeDots(n, W, H, gap, rand) {
        var dots = [], guard = 0;
        while (dots.length < n && guard++ < 4000) {
            var x = kit.randFloat(MARGIN, W - MARGIN, rand), y = kit.randFloat(MARGIN, H - MARGIN, rand);
            if (dots.every(function (d) { return kit.dist(x, y, d.x, d.y) >= gap; })) dots.push({ x: x, y: y });
        }
        return dots.length === n ? dots : null;
    }
    /* 幫每顆會動的圓點挑方向與路徑：試 ANGLES 個角度，依「能直直走多遠」由長到短排，挑第一個「路徑夠長、離前面已經決定的會動圓點的路徑夠遠」的；
       回傳 movers 陣列，找不到回傳 null。need[i]＝這顆在整個限時內總共要走的距離；accept＝路徑至少要有多長才算合格 */
    function pickMovers(dots, ids, need, W, H, clear, accept, rand) {
        var movers = [];
        for (var m = 0; m < ids.length; m++) {
            var di = ids[m], s0 = dots[di], obstacles = dots.filter(function (d, i) { return i !== di; }), cands = [], base = rand() * Math.PI * 2;
            for (var a = 0; a < ANGLES; a++) {
                var ang = base + a * 2 * Math.PI / ANGLES, dx = Math.cos(ang), dy = Math.sin(ang);
                var L = Math.min(freeLen(s0.x, s0.y, dx, dy, obstacles, W, H, clear), need[m]);
                cands.push({ dx: dx, dy: dy, len: L });
            }
            cands.sort(function (u, v) { return v.len - u.len; });
            var need0 = Math.min(accept, need[m]), picked = null;
            for (var c = 0; c < cands.length && !picked; c++) {
                var cd = cands[c];
                if (cd.len < need0) break;                                          /* 後面的更短，不用看了 */
                var sa = { x: s0.x, y: s0.y }, ea = { x: s0.x + cd.dx * cd.len, y: s0.y + cd.dy * cd.len }, okc = true;
                for (var p = 0; p < movers.length && okc; p++) {
                    var o = movers[p];
                    if (segsDist(sa, ea, { x: o.x0, y: o.y0 }, { x: o.x0 + o.dx * o.len, y: o.y0 + o.dy * o.len }) < clear) okc = false;
                }
                if (okc) picked = cd;
            }
            if (!picked) return null;
            movers.push({ idx: di, dx: picked.dx, dy: picked.dy, x0: s0.x, y0: s0.y, len: picked.len });
        }
        return movers;
    }
    /* 出一關：{ W, H, dots:[{x,y}], movers:[{idx（是第幾顆圓點）, dx, dy（單位方向）, x0, y0, len（路徑長度，走到盡頭就掉頭走回來）}], speed, moveTime, limitS, gap }。
       圓心位置全部是浮點數。先用 MIN_GAP 試，排不下或路徑不合格就把間距一格一格縮小，最後縮到 GAP_LAST，仍然是隨機排列（不會變成整齊的格子）。 */
    function makeLevel(level, W, H, rand) {
        rand = rand || Math.random;
        var speed = speedFor(level), n = dotCountFor(level), k = Math.min(moverCountFor(level), n - 1), mt = moveTimeFor(level), limit = limitFor(k);
        var need = []; for (var m = 0; m < k; m++) need.push(speed * movedTime(k, mt, m, limit));           /* 整個限時內，每一顆總共會動多遠 */
        var best = null;
        for (var gap = MIN_GAP; gap >= GAP_LAST - 1e-9; gap -= 4) {
            var tries = gap >= MIN_GAP_FLOOR - 1e-9 ? 120 : 200, accept = gap >= MIN_GAP_FLOOR - 1e-9 ? TRAVEL_MIN : TRAVEL_MIN / 2;
            for (var tr = 0; tr < tries; tr++) {
                var dots = placeDots(n, W, H, gap, rand);
                if (!dots) continue;
                var ids = kit.shuffle(dots.map(function (d, i) { return i; }), rand).slice(0, k);
                var movers = pickMovers(dots, ids, need, W, H, Math.min(PATH_CLEAR, gap - 4), accept, rand);
                if (movers) return { W: W, H: H, dots: dots, movers: movers, speed: speed, moveTime: mt, limitS: limit, gap: gap };
                if (!best) best = { dots: dots, ids: ids, gap: gap };
            }
        }
        /* 保底（極少用到）：還是隨機排列，路徑不夠長也接受（至少 1px），絕對不再用固定的格子 */
        var dots2 = best ? best.dots : placeDots(n, W, H, GAP_LAST - 8, rand) || placeDots(n, W, H, 20, rand), ids2 = best ? best.ids : kit.shuffle(dots2.map(function (d, i) { return i; }), rand).slice(0, k);
        var mv = pickMovers(dots2, ids2, need, W, H, 8, 1, rand) || pickMovers(dots2, ids2, need, W, H, 0, 0, rand);
        return { W: W, H: H, dots: dots2, movers: mv, speed: speed, moveTime: mt, limitS: limit, gap: best ? best.gap : 0 };
    }
    function rating(n) {
        if (n >= 25) return '火眼金睛！';
        if (n >= 15) return '觀察力很強！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '盯住整個畫面找不對勁的地方，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var W = stage.clientWidth || 472, H = (stage.clientHeight || 640) - 64;          /* 下面留 64 像素放說明文字 */
        var q = makeLevel(level, W, H, api.rand), k = q.movers.length, moverOf = {};
        q.movers.forEach(function (m, i) { moverOf[m.idx] = i; });
        api.info = q;
        console.log('[誰在偷偷動] 第 ' + level + ' 關：' + q.dots.length + ' 顆圓點，會動的 ' + k + ' 顆（第 ' + q.movers.map(function (m) { return m.idx + 1; }).join('、') + ' 顆），每顆輪流動 ' + q.moveTime + ' 秒，速度 ' + q.speed.toFixed(4) + ' 像素/秒；限時 ' + q.limitS + ' 秒');

        var svg = kit.svg('svg', { 'class': 'snk-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var gTrail = kit.svg('g', {}, svg);
        var circles = q.dots.map(function (d) { return kit.svg('circle', { cx: d.x, cy: d.y, r: DOT_R, 'class': 'snk-dot' }, svg); });
        var tip = h('div', { 'class': 'qz-note snk-tip', text: k > 1 ? '有幾個圓點會輪流慢慢移動，找出其中一個！' : '有一個圓點在慢慢移動，找出它！' });
        stage.appendChild(tip);
        var t0 = performance.now(), found = {}, nFound = 0;               /* found[第幾顆會動的] ＝ 找到的那一刻（秒），那一顆就停在那裡 */
        function nowSec() { return (performance.now() - t0) / 1000; }
        function timeOf(mi, t) { return found[mi] != null ? found[mi] : t; }     /* 這一顆會動的圓點「現在該畫在哪一秒的位置」：找到了就停在找到的那一刻 */
        var loop = api.my.loop(function () {
            if (api.over) return false;
            var t = nowSec();
            q.movers.forEach(function (m, i) { var p = posAt(q, i, timeOf(i, t)); circles[m.idx].setAttribute('cx', p.x); circles[m.idx].setAttribute('cy', p.y); });
        });
        api.timer(q.limitS * 1000, function () { finish('time', -1, q.limitS); });
        if (level === 1 && kit.once('sneakmove.hint')) kit.hintOn(stage, null, { mode: 'tap', x: q.movers[0].x0, y: q.movers[0].y0, delay: 800, text: '請點擊正在移動的圓點' });
        /* 點擊：找離手指最近的圓點（在 HIT_R 以內才算點到）；點到會動的就是找到一顆（要全部找齊才過關），點到不動的就失敗 */
        kit.onTap(stage, function (e) {
            if (api.over) return;
            var pt = kit.localPt(e, stage), t = nowSec();
            var best = -1, bd = 1e9;
            q.dots.forEach(function (d, i) {
                var p = moverOf[i] != null ? posAt(q, moverOf[i], timeOf(moverOf[i], t)) : d, dd = kit.dist(pt.x, pt.y, p.x, p.y);
                if (dd < bd) { bd = dd; best = i; }
            });
            if (bd <= HIT_R) tapDot(best, t);
        });
        /* 點了第 i 顆圓點（t＝現在是第幾秒） */
        function tapDot(i, t) {
            if (api.over) return;
            var mi = moverOf[i];
            if (mi == null) { finish('wrong', i, t); return; }                   /* 點到不動的：失敗 */
            if (found[mi] != null) return;                                         /* 這一顆已經找到了，再點不算 */
            found[mi] = Math.min(t, q.limitS); nFound++;
            circles[i].classList.add('snk-dot--right');                             /* 找到了：綠色外框，停在原地 */
            Sfx.play('ok');
            if (nFound >= k) finish('ok', -1, t);
            else tip.textContent = '找到了！已找到 ' + nFound + '／' + k + ' 顆，繼續找下一顆（會動的圓點輪流在動）';
        }

        /* 結束：kind＝'ok'（全部找到）／'wrong'（點到不動的第 i 顆）／'time'（限時到了）。
           每一顆會動的圓點都標上綠色外框（找到的、沒找到的答案都是綠色），軌跡畫成細線並寫出漂移了多少；點錯的那一顆才加紅色外框。 */
        function finish(kind, i, t) {
            if (api.over) return;
            loop.stop();
            t = Math.min(t, q.limitS);
            var lines = [];
            q.movers.forEach(function (m, mi) {
                var tt = timeOf(mi, t), p = posAt(q, mi, tt), moved = q.speed * movedTime(k, q.moveTime, mi, tt);
                circles[m.idx].setAttribute('cx', p.x); circles[m.idx].setAttribute('cy', p.y);
                circles[m.idx].classList.add('snk-dot--right');
                kit.svg('line', { x1: m.x0, y1: m.y0, x2: p.x, y2: p.y, 'class': 'snk-trail' }, gTrail);
                kit.svg('circle', { cx: m.x0, cy: m.y0, r: 5, 'class': 'snk-start' }, gTrail);
                lines.push('第 ' + (m.idx + 1) + ' 顆漂移了 ' + moved.toFixed(4) + ' 像素');
            });
            if (kind === 'wrong') circles[i].classList.add('snk-dot--wrong');
            /* 提示文字只有 64 像素高：會動的有好幾顆時，各自漂移多少寫在結算頁就好，這裡只留一句 */
            tip.textContent = k > 1 ? '共 ' + k + ' 顆會動（綠框），每秒漂移 ' + q.speed.toFixed(4) + ' 像素，輪流各動 ' + q.moveTime.toFixed(4) + ' 秒' : '每秒漂移 ' + q.speed.toFixed(4) + ' 像素：' + lines.join('、');
            if (kind === 'ok') { kit.flash(stage, true, api.my); api.pass({ delay: 1700 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({
                delay: 2600, lines: [
                    (kind === 'time' ? '時間到！' : '那一顆是靜止的') + '，' + (k > 1 ? '你找到了 ' + nFound + '／' + k + ' 顆，' : '') + '會動的是第 ' + q.movers.map(function (m) { return m.idx + 1; }).join('、') + ' 顆（已標出）',
                    '它們每秒漂移 ' + q.speed.toFixed(4) + ' 像素：' + lines.join('、')
                ]
            });
        }
        /* 驗證用：api.solve 依序點出每一顆會動的；api.wrong 點一顆不動的 */
        api.solve = function () { q.movers.forEach(function (m) { tapDot(m.idx, nowSec()); }); };
        api.wrong = function () {
            var still = 0; while (moverOf[still] != null) still++;
            tapDot(still, nowSec());
        };
    }

    var G = {
        id: ID,
        name: '誰在偷偷動',
        rule: '畫面上有一堆圓點，其中**有幾個會輪流慢慢移動**，其他都不動。一顆動一下就換下一顆，**在限時內，一顆接著一顆把「所有」會動的圓點都點出來**（點對的會加上綠框、停下來）。越後面，圓點越多、會動的越多、漂移得越慢！會動的圓點越多，限時就越長。點到不動的圓點（紅框）或來不及找齊就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        test: {
            triangle: triangle, freeLen: freeLen, pickMovers: pickMovers, TRAVEL_MIN: TRAVEL_MIN, GAP_LAST: GAP_LAST, speedFor: speedFor, dotCountFor: dotCountFor, moverCountFor: moverCountFor, moveTimeFor: moveTimeFor, limitFor: limitFor, segDist: segDist, segsDist: segsDist, movedTime: movedTime, activeAt: activeAt, posAt: posAt, placeDots: placeDots, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SPEED: SPEED, TIME_S: TIME_S, N_DOTS: N_DOTS, MOVE_DOTS: MOVE_DOTS, MOVE_TIME: MOVE_TIME, PAUSE_S: PAUSE_S, MIN_GAP: MIN_GAP, MIN_GAP_FLOOR: MIN_GAP_FLOOR, PATH_CLEAR: PATH_CLEAR, MARGIN: MARGIN, HIT_R: HIT_R, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
