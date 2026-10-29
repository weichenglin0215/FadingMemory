/* ═══════════════════════════════════════════════════════════════════
   reaction_swipecopy.js — 秒反應・反著滑（企劃 312「照著滑」，依使用者的修改改成「反著滑」；V1.36.0 再改成「一次一個箭頭、箭頭一出現就可以滑」）
   畫面分成九宮格。**每一關只出現一個箭頭**（上、下、左、右，後面還有斜的），出現在九宮格的某一格正中央（位置固定、不會偏移）。
   **箭頭一出現就可以用手指往「箭頭的反方向」滑**（箭頭朝上就要往下滑；在畫面任何地方滑都可以）——不用等箭頭消失。
   箭頭只會亮 SHOW_MS（例如 0.5 秒）就消失，但你可以滑到 RESP_MS（例如 1.0 秒）為止；**越快滑出正確的方向越好**，過關後會告訴你反應時間。滑錯方向或超過時間就結束。
   ───────────────────────────────────────────────────────────────────
   · 規則：箭頭指 dir，要滑的方向是它的反方向 opposite(dir)（8 個方向編號 0～7，從正上方順時針每 45° 一個，反方向就是 +4）。
   · 判定（越快越好）：手指按下之後，**位移一超過 MIN_SWIPE 就立刻判定**（不用等手指放開），用當下位移的角度分成 4 個（每個 90° 的扇形）或 8 個（每個 45° 的扇形）方向；
     反應時間 ＝ 箭頭出現到手指位移超過 MIN_SWIPE 的時間。箭頭出現「之前」按下去的不算（箭頭出現時如果手指已經按著，從那一刻的位置開始算）。
   · 九宮格位置的干擾（玩家意見）：格子編號 0～8 由左到右、由上到下。簡單的關卡，箭頭出現在「它所指的那一格」（cellOfDir：朝上的出現在上方中間、朝右的在右邊中間、右上的在右上角…），
     位置和該滑的方向正好衝突（直覺會被位置帶著走，Simon 效應）；到了中難度（第 SCATTER_FROM 關起），箭頭有 SCATTER_P 的機率出現在任意一格（9 格都可能），
     玩家要完全不理位置、只看箭頭的方向；機率隨關卡線性增加，到頂 100%。
   · 難度（線性）：箭頭停留 SHOW_MS 500 → 200 毫秒、可以滑的時間 RESP_MS 1000 → 500 毫秒（從箭頭出現算起）；箭頭出現之前的準備時間 PREP_MS 在範圍內隨機（猜不到什麼時候出現）；第 DIAG_FROM 關起箭頭會有斜的（8 個方向，斜的箭頭在角落格）。
   · 滑錯或超時：把箭頭、該滑的方向、你滑的方向並排畫出來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'swipecopy';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後速度到頂 */
    var SHOW_MS = [500, 200];                   /* 箭頭亮多久（毫秒）：第 1 關 → 到頂 */
    var RESP_MS = [1000, 500];                  /* 從箭頭出現算起，最晚要在多久之內滑出方向（毫秒）：第 1 關 → 到頂（要比 SHOW_MS 長：箭頭消失之後還可以繼續滑） */
    var PREP_MS = [800, 1600];                  /* 上一關結束（或剛開始）到箭頭出現之間的等待（毫秒，範圍內隨機） */
    var DIAG_FROM = 15;                         /* 第幾關起有斜的箭頭（8 個方向） */
    var SCATTER_FROM = 5;                       /* 第幾關起箭頭可能出現在「不是它所指的那一格」 */
    var SCATTER_P = [0.25, 1];                  /* 出現在任意一格的機率：第 SCATTER_FROM 關 → 到頂（其餘時候出現在它所指的那一格） */
    var MIN_SWIPE = 36;                         /* 手指位移至少幾 px 就立刻判定 */
    var REPLAY_MS = 170;                        /* 失敗後重播，每個箭頭亮多久（毫秒） */
    var MAX_LEVEL = 90;
    var NAMES = ['上', '右上', '右', '右下', '下', '左下', '左', '左上'];      /* 方向編號 0～7 的名字（從正上方順時針） */
    var CELL_OF_DIR = [1, 2, 5, 8, 7, 6, 3, 0];                         /* 方向 → 九宮格裡「它所指的那一格」：上＝上方中間(1)、右上＝右上角(2)、右＝右邊中間(5)… */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function showMsFor(level) { return Math.round(ramp(level, SHOW_MS)); }
    function respMsFor(level) { return Math.max(showMsFor(level), Math.round(ramp(level, RESP_MS))); }
    function dirCountFor(level) { return level >= DIAG_FROM ? 8 : 4; }
    function scatterPFor(level) { return level < SCATTER_FROM ? 0 : Math.round(kit.ramp(level, SCATTER_P[0], SCATTER_P[1], RAMP_LEVELS) * 10000) / 10000; }
    function opposite(d) { return (d + 4) % 8; }
    /* 方向編號 → 單位向量（x 向右、y 向下；0＝上） */
    function vec(d) { var a = d * Math.PI / 4; return { x: Math.sin(a), y: -Math.cos(a) }; }
    /* 手指位移 (dx, dy) → 方向編號：n＝4（上右下左，編號 0、2、4、6）或 8；位移太短回傳 −1 */
    function swipeDir(dx, dy, n, minDist) {
        if (Math.hypot(dx, dy) < (minDist == null ? MIN_SWIPE : minDist)) return -1;
        var a = Math.atan2(dx, -dy) * 180 / Math.PI;                    /* 從正上方順時針 */
        if (a < 0) a += 360;
        if (n === 4) return (Math.round(a / 90) % 4) * 2;
        return Math.round(a / 45) % 8;
    }
    /* 箭頭 d 出現在哪一格（九宮格編號 0～8，由左到右、由上到下）：scatter 為真時 9 格任選一格，否則是它所指的那一格 */
    function cellFor(d, scatter, rand) { return scatter ? kit.randInt(0, 8, rand || Math.random) : CELL_OF_DIR[d]; }
    /* 九宮格第 cell 格的正中央（在 W×H 的方框裡），回傳 { x, y, cw, ch }（cw、ch 是每一格的寬高） */
    function cellCenter(cell, W, H) { var cw = W / 3, ch = H / 3; return { x: (cell % 3 + 0.5) * cw, y: (Math.floor(cell / 3) + 0.5) * ch, cw: cw, ch: ch }; }
    /* 出一關：{ dirs（長度 1：箭頭指的方向）, req（長度 1：要滑的方向＝反方向）, cell（出現在九宮格的哪一格）, matched（是不是它所指的那一格）, showMs, respMs, prepMs, nDir, level }
       （dirs／req 用陣列只是為了跟失敗畫面共用同一套顯示程式） */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = dirCountFor(level), pool = n === 4 ? [0, 2, 4, 6] : [0, 1, 2, 3, 4, 5, 6, 7], d = kit.pick(pool, rand), scatter = rand() < scatterPFor(level), cell = cellFor(d, scatter, rand);
        return { dirs: [d], req: [opposite(d)], cell: cell, matched: cell === CELL_OF_DIR[d], showMs: showMsFor(level), respMs: respMsFor(level), prepMs: Math.round(kit.randFloat(PREP_MS[0], PREP_MS[1], rand)), nDir: n, level: level };
    }
    function rating(n) {
        if (n >= 15) return '反應與眼力都超強！';
        if (n >= 10) return '反著滑也難不倒你！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '箭頭指哪邊，就往相反的方向滑！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'swc-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 交通號誌的箭頭：藍色圓牌上一個白色粗箭頭，朝向 d（0＝上）；回傳元素，size 是圓牌直徑 */
    function sign(parent, d, size, cls) {
        var s = kit.svg('svg', { 'class': 'swc-sign ' + (cls || ''), viewBox: '-50 -50 100 100', width: size, height: size }, parent);
        kit.svg('circle', { 'class': 'swc-sign__disc', cx: 0, cy: 0, r: 48 }, s);
        var g = kit.svg('g', { transform: 'rotate(' + d * 45 + ')' }, s);
        kit.svg('path', { 'class': 'swc-sign__arrow', d: 'M0,-32 L24,-4 L9,-4 L9,30 L-9,30 L-9,-4 L-24,-4 Z' }, g);
        return s;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[反著滑] 第 ' + level + ' 關：箭頭指 ' + NAMES[q.dirs[0]] + '、要滑 ' + NAMES[q.req[0]] + '；出現在第 ' + (q.cell + 1) + ' 格（' + (q.matched ? '它所指的那一格' : '別的格子') + '）；亮 ' + q.showMs + ' 毫秒、可以滑到 ' + q.respMs + ' 毫秒；準備 ' + q.prepMs + ' 毫秒；' + q.nDir + ' 個方向');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'swc-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note swc-tip', text: '等箭頭出現，立刻往「反方向」滑' });
        field.appendChild(tip);
        var areaT = 64, areaH = H - 230, zone = h('div', { 'class': 'swc-zone' });
        zone.style.cssText = 'left:12px;right:12px;top:' + areaT + 'px;height:' + areaH + 'px;';
        field.appendChild(zone);
        var zw = (W - 24) - 6, zh = areaH - 6;                                  /* 九宮格的範圍（扣掉虛線框） */
        [1, 2].forEach(function (i) {                                           /* 九宮格的格線：兩條直線、兩條橫線 */
            var v = h('div', { 'class': 'swc-gridline swc-gridline--v' }); v.style.left = (zw * i / 3) + 'px'; zone.appendChild(v);
            var hl = h('div', { 'class': 'swc-gridline swc-gridline--h' }); hl.style.top = (zh * i / 3) + 'px'; zone.appendChild(hl);
        });
        var info = h('div', { 'class': 'qz-note swc-info', text: '' });
        info.style.top = (areaT + areaH + 16) + 'px';
        field.appendChild(info);
        var strip = h('div', { 'class': 'swc-strip' });
        field.appendChild(strip);

        var phase = 'wait', done = false, down = null, cur = null, t0 = 0, popEl = null;
        /* 箭頭出現：放在九宮格的某一格正中央；從這一刻起就可以滑 */
        function appear() {
            if (api.over || done) return;
            var c = cellCenter(q.cell, zw, zh), SZ = Math.floor(Math.min(c.cw, c.ch) * 0.82);
            popEl = h('div', { 'class': 'swc-pop' });
            popEl.style.cssText = 'left:' + (c.x - SZ / 2) + 'px;top:' + (c.y - SZ / 2) + 'px;width:' + SZ + 'px;height:' + SZ + 'px;';
            sign(popEl, q.dirs[0], SZ); zone.appendChild(popEl); Sfx.play('ok');
            phase = 'live'; t0 = performance.now(); tip.textContent = '現在！往「反方向」滑';
            if (down && cur) { down.x = cur.x; down.y = cur.y; }                    /* 箭頭出現時手指已經按著：從這一刻的位置開始算 */
            api.after(q.showMs, function () { if (popEl && popEl.parentNode) popEl.parentNode.removeChild(popEl); });
            api.after(q.respMs, function () { if (phase === 'live') fail(-1, 0); });                /* 超過時間還沒滑出方向 */
        }
        api.after(q.prepMs, appear);
        if (level === 1 && kit.once('swipecopy.hint')) api.after(q.prepMs + 500, function () { if (phase === 'live') kit.hintOn(stage, null, { mode: 'drag', x: W / 2, y: areaT + areaH / 2 - 40, dx: 0, dy: 90, text: '箭頭朝上就往下滑' }); });

        /* 滑：按下之後，位移一超過 MIN_SWIPE 就判定（不用等手指放開）；箭頭出現之前的動作不算 */
        zone.addEventListener('pointerdown', function (e) { if (done || api.over || down) return; e.preventDefault(); try { zone.setPointerCapture(e.pointerId); } catch (err) { } var p = kit.localPt(e, zone); cur = p; down = { id: e.pointerId, x: p.x, y: p.y }; });
        zone.addEventListener('pointermove', function (e) {
            if (!down || e.pointerId !== down.id) return;
            var p = kit.localPt(e, zone); cur = p;
            if (phase !== 'live' || done || api.over) { if (phase === 'wait') { down.x = p.x; down.y = p.y; } return; }          /* 還沒出現箭頭：不算，起點跟著手指走 */
            var d = swipeDir(p.x - down.x, p.y - down.y, q.nDir);
            if (d >= 0) judge(d, performance.now() - t0);
        });
        function up(e) { if (down && e.pointerId === down.id) down = null; }
        zone.addEventListener('pointerup', up);
        zone.addEventListener('pointercancel', up);
        function judge(d, rt) {
            if (done || api.over || phase !== 'live') return;
            var want = q.req[0];
            /* 在畫面中央閃一下你滑的方向 */
            var fl = h('div', { 'class': 'swc-flash' }); fl.style.cssText = 'left:' + (zw / 2 - 36) + 'px;top:' + (zh / 2 - 36) + 'px;'; sign(fl, d, 72, 'swc-sign--mine'); zone.appendChild(fl); api.after(260, function () { if (fl.parentNode) fl.parentNode.removeChild(fl); });
            if (d !== want) { fail(0, d); return; }
            done = true; phase = 'end'; api.stopTimer();
            info.textContent = '反應 ' + (rt / 1000).toFixed(4) + ' 秒';
            Sfx.play('click'); kit.flash(stage, true, api.my); api.pass({ delay: 900 });
        }
        /* 滑錯（at ＝ 0，mine ＝你滑的方向）或超時（at ＝ −1）：把箭頭、該滑的方向、你滑的方向排出來 */
        function fail(at, mine) {
            if (done || api.over) return;
            done = true; phase = 'end'; api.stopTimer();
            zone.style.display = 'none';
            var timeout = at < 0;
            tip.textContent = timeout ? '來不及了' : '滑錯方向了';
            info.textContent = '箭頭指 ' + NAMES[q.dirs[0]] + '，要往 ' + NAMES[q.req[0]] + ' 滑' + (timeout ? '；你沒有在 ' + (q.respMs / 1000).toFixed(4) + ' 秒內滑出方向' : '；你滑了 ' + NAMES[mine]);
            strip.style.top = '90px';
            var row = h('div', { 'class': 'swc-strip__row' }), cell = h('div', { 'class': 'swc-cell swc-cell--bad swc-cell--lit' });
            cell.appendChild(h('div', { 'class': 'swc-cell__no', text: '箭頭' }));
            sign(cell, q.dirs[0], 96);
            cell.appendChild(h('div', { 'class': 'swc-cell__to', text: '要滑' }));
            sign(cell, q.req[0], 72, 'swc-sign--req');
            if (!timeout) { cell.appendChild(h('div', { 'class': 'swc-cell__to', text: '你滑了' })); sign(cell, mine, 72, 'swc-sign--bad'); }
            row.appendChild(cell); strip.appendChild(row);
            info.style.top = (strip.offsetTop + strip.offsetHeight + 14) + 'px';                /* 說明文字放在「箭頭／要滑／你滑了」那一欄的正下方（欄的高度要等內容放進去才量得到，所以排在這裡） */
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2600, lines: [(timeout ? '來不及：' : '滑錯了：') + '箭頭指 ' + NAMES[q.dirs[0]] + '，要往 ' + NAMES[q.req[0]] + ' 滑' + (timeout ? '' : '，你滑了 ' + NAMES[mine]), '箭頭出現在九宮格的第 ' + (q.cell + 1) + ' 格' + (q.matched ? '（就是它所指的那一邊）' : '（不是它所指的那一邊）')] });
        }
        /* 驗證用：api.solve 在箭頭出現之後立刻滑出正確的方向；api.wrong 順著箭頭滑（忘了要反著滑）；箭頭還沒出現就等它出現 */
        api.solve = function () { if (phase === 'live' && !done) judge(q.req[0], 1); };
        api.wrong = function () { if (phase === 'live' && !done) judge(q.dirs[0], 1); };
    }

    var G = {
        id: ID,
        name: '反著滑',
        rule: '畫面分成九宮格，**每一關只會出現一個箭頭**（上、下、左、右）。**箭頭一出現就要用手指往「反方向」滑**——箭頭朝上就往下滑，朝左就往右滑（在畫面任何地方滑都可以，不用等箭頭消失）。箭頭只亮一下就消失，但你可以一直滑到時間到為止，**越快滑出正確的方向越好**。小心：箭頭出現的格子常常在「它所指的那一邊」，**會帶著你滑錯**；越後面，它會出現在任何一格。滑錯或來不及就結束，看你能過幾關。越後面，箭頭亮得越短、時間越緊，第 15 關起還會有斜的箭頭（8 個方向）！',
        mount: mount,
        score: SCORE,
        test: {
            showMsFor: showMsFor, respMsFor: respMsFor, dirCountFor: dirCountFor, scatterPFor: scatterPFor, opposite: opposite, vec: vec, swipeDir: swipeDir, cellFor: cellFor, cellCenter: cellCenter, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SHOW_MS: SHOW_MS, RESP_MS: RESP_MS, PREP_MS: PREP_MS, DIAG_FROM: DIAG_FROM, SCATTER_FROM: SCATTER_FROM, SCATTER_P: SCATTER_P, CELL_OF_DIR: CELL_OF_DIR, MIN_SWIPE: MIN_SWIPE, REPLAY_MS: REPLAY_MS, NAMES: NAMES, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
