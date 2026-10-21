/* ═══════════════════════════════════════════════════════════════════
   reaction_sushi.js — 秒反應・迴轉壽司（企劃 393）
   迴轉壽司的輸送帶。**盤子的顏色代表價格**（白 30、紅 40、藍 60、金 100；第 10 關起加 50 元的綠盤），**價目表一直貼在畫面上**。
   上方寫「**預算剛好 280 元**」。**盤子從輸送帶經過時，點它就拿下來**；拿下來的盤子疊在旁邊（只看得到最上面一個，**總金額不會顯示**）。
   輸送帶轉完一圈（時間條跑完），或你按「夠了」，**拿的盤子要剛好是預算**才過關；多了、少了都失敗。輸送帶不會停，要邊算邊決定。
   ───────────────────────────────────────────────────────────────────
   · 一圈的盤子（makeLevel）：這一圈依序有 L 個盤子（8 → 24）。出題時**先挑好一組「剛好湊得出預算」的盤子**（m 個，3 → 9），
     預算＝這組的價錢總和，所以**一定有解**；這組盤子分散在整圈（不會全擠在開頭或最後一個）。其他盤子是干擾（隨機的價錢），
     所以後面的盤子不一定湊得出——拿太晚就湊不到。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：每圈盤子數 8 → 24、要湊的盤子數 3 → 9（預算越大）、盤子之間的間隔 1.2 → 0.7 秒（輸送帶速度 130 → 330 px／秒）、
     第 10 關起多了 50 元的綠盤（顏色多一種）。
   · 拿盤子：盤子在畫面上（已經進來、還沒出去）時，點到它就拿下來。點空白的地方沒有作用。
   · 揭曉：拿的盤子攤開，一盤一盤累加「3 盤共 130 元…290 元，多了 10 元」；並寫出一種剛好湊得出預算的拿法。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'sushi';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var PLATES = [8, 24];                      /* 一圈有幾個盤子：第 1 關 → 到頂（四捨五入） */
    var PICK = [3, 9];                          /* 要湊的盤子數（解的大小）：第 1 關 → 到頂（四捨五入） */
    var GAP_S = [1.2, 0.7];                     /* 相鄰兩個盤子經過同一點的間隔（秒）：第 1 關 → 到頂 */
    var SPEED = [130, 330];                     /* 輸送帶的速度（px／秒）：第 1 關 → 到頂 */
    var PRICE_BASE = [30, 40, 60, 100];         /* 一開始的價錢：白、紅、藍、金 */
    var PRICE_LATER = [30, 40, 50, 60, 100];    /* 第 LATER_FROM 關起多了 50 元的綠盤 */
    var LATER_FROM = 10;
    var PLATE_D = 76;                           /* 盤子的直徑（px） */
    var HIT_PAD = 8;                            /* 點盤子的容許範圍（px） */
    var LEAD_S = 0.8;                           /* 開場先等多久，第一個盤子才從右邊進來（秒） */
    var END_PAD_S = 0.6;                        /* 最後一個盤子離開畫面之後，多等一下才算「轉完一圈」 */
    var SOLVE_CAP = 99;
    var MAX_LEVEL = 90;
    var COLOR_OF = { 30: 'white', 40: 'red', 50: 'green', 60: 'blue', 100: 'gold' };
    var COLOR_NAME = { 30: '白', 40: '紅', 50: '綠', 60: '藍', 100: '金' };
    var SUSHI = ['salmon', 'egg', 'shrimp'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function platesFor(level) { return Math.round(ramp(level, PLATES)); }
    function pickFor(level) { return Math.min(Math.round(ramp(level, PICK)), platesFor(level) - 2); }
    function gapFor(level) { return Math.round(ramp(level, GAP_S) * 1000) / 1000; }
    function speedFor(level) { return Math.round(ramp(level, SPEED)); }
    function pricesFor(level) { return level >= LATER_FROM ? PRICE_LATER : PRICE_BASE; }
    /* 出一關：{ level, prices（這一關的價錢表）, plates（依序經過的盤子：[{ price, sushi }]）, solution（剛好湊得出預算的盤子編號，由小到大）, target（預算）, gap, speed, laps（整圈的毫秒數） } */
    function makeLevel(level, rand, W) {
        rand = rand || Math.random; W = W || 472;
        var L = platesFor(level), m = pickFor(level), prices = pricesFor(level), gap = gapFor(level), speed = speedFor(level), plates = [], i;
        for (i = 0; i < L; i++) plates.push({ price: kit.pick(prices, rand), sushi: kit.pick(SUSHI, rand) });
        /* 解：m 個盤子，分散在整圈（不挑最後一個盤子；把 0～L−2 分成 m 段，每段挑一個），價錢總和＝預算 */
        var sol = [], seg = (L - 1) / m;
        for (i = 0; i < m; i++) { var lo = Math.floor(i * seg), hi = Math.max(lo, Math.min(L - 2, Math.floor((i + 1) * seg) - 1)); sol.push(kit.randInt(lo, hi, rand)); }
        sol = sol.filter(function (v, k) { return sol.indexOf(v) === k; }).sort(function (a, b) { return a - b; });
        var target = 0; sol.forEach(function (k) { target += plates[k].price; });
        return { level: level, prices: prices, plates: plates, solution: sol, target: target, gap: gap, speed: speed, lap: lapMs(L, gap, speed, W) };
    }
    /* 輸送帶「轉完一圈」要多久（毫秒）：第一個盤子 LEAD_S 秒後才從右邊進來；最後一個盤子（第 L−1 個）進來之後還要走過整個畫面才離開 */
    function lapMs(L, gap, speed, W) { return Math.round((LEAD_S + (L - 1) * gap + (W + PLATE_D) / speed + END_PAD_S) * 1000); }
    /* 第 i 個盤子在 t 秒時的 x 座標（盤子中心）：從畫面右邊外面（W ＋ PLATE_D/2）進來，往左走 */
    function plateX(i, t, gap, speed, W) { return W + PLATE_D / 2 - speed * (t - LEAD_S - i * gap); }
    /* 這個盤子在 t 秒時有沒有在畫面上（可以點） */
    function visibleAt(i, t, gap, speed, W) { var x = plateX(i, t, gap, speed, W); return x >= -PLATE_D / 4 && x <= W + PLATE_D / 4; }
    /* 拿了 taken（盤子編號的集合）的總金額與判定：{ sum, result: 'ok'｜'few'｜'many', diff } */
    function judge(q, taken) {
        var s = 0; taken.forEach(function (k) { s += q.plates[k].price; });
        return { sum: s, result: s === q.target ? 'ok' : (s < q.target ? 'few' : 'many'), diff: s - q.target };
    }
    /* 有幾種拿法剛好湊到預算（動態規劃，只用來測試和說明；盤子不多） */
    function countSolutions(q) {
        var ways = {}; ways[0] = 1;
        q.plates.forEach(function (p) { var nw = {}; Object.keys(ways).forEach(function (s) { nw[s] = (nw[s] || 0) + ways[s]; var t = +s + p.price; if (t <= q.target) nw[t] = (nw[t] || 0) + ways[s]; }); ways = nw; });
        return ways[q.target] || 0;
    }
    function whyText(r, q) {
        if (r.result === 'ok') return '剛剛好 ' + q.target + ' 元！';
        if (r.result === 'few') return '拿了 ' + r.sum + ' 元，預算 ' + q.target + ' 元——少了 ' + (-r.diff) + ' 元';
        return '拿了 ' + r.sum + ' 元，預算 ' + q.target + ' 元——多了 ' + r.diff + ' 元';
    }
    function rating(n) {
        if (n >= 15) return '迴轉壽司達人！';
        if (n >= 9) return '心算很快！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '看價目表、邊拿邊加！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'ssh-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 一個盤子（div）：圓盤（顏色依價錢）、中間一塊壽司（鮭魚／玉子／蝦），不顯示價錢——價錢要看價目表 */
    function plateEl(p, mini) {
        var el = h('div', { 'class': 'ssh-plate ssh-p' + COLOR_OF[p.price] + (mini ? ' ssh-plate--mini' : '') });
        el.appendChild(h('div', { 'class': 'ssh-rice' })); el.appendChild(h('div', { 'class': 'ssh-top ssh-top--' + p.sushi }));
        return el;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var q = makeLevel(level, api.rand, W);
        api.info = q;
        console.log('[迴轉壽司] 第 ' + level + ' 關：預算 ' + q.target + ' 元；一圈 ' + q.plates.length + ' 盤（' + q.plates.map(function (p) { return p.price; }).join(',') + '）；剛好的拿法（盤子編號） ' + q.solution.join(',') + '；速度 ' + q.speed + ' px/秒、間隔 ' + q.gap + ' 秒；一圈 ' + q.lap + ' 毫秒；共 ' + countSolutions(q) + ' 種湊法');

        var field = h('div', { 'class': 'ssh-field' });
        stage.appendChild(field);
        /* 價目表：一直貼在畫面上 */
        var legend = h('div', { 'class': 'ssh-legend' });
        q.prices.forEach(function (pr) { var it = h('div', { 'class': 'ssh-legend__i' }); it.appendChild(h('div', { 'class': 'ssh-dot ssh-p' + COLOR_OF[pr] })); it.appendChild(h('div', { 'class': 'ssh-legend__t', text: pr + '元' })); legend.appendChild(it); });
        field.appendChild(legend);
        var goal = h('div', { 'class': 'ssh-goal' });
        goal.appendChild(h('span', { 'class': 'ssh-goal__t', text: '預算剛好 ' })); goal.appendChild(h('span', { 'class': 'ssh-goal__n', text: String(q.target) })); goal.appendChild(h('span', { 'class': 'ssh-goal__t', text: ' 元' }));
        field.appendChild(goal);
        /* 輸送帶與盤子 */
        var beltTop = 190, belt = h('div', { 'class': 'ssh-belt' }); belt.style.top = (beltTop + PLATE_D / 2 + 4) + 'px'; field.appendChild(belt);
        var lane = h('div', { 'class': 'ssh-lane' }); lane.style.cssText = 'top:' + beltTop + 'px;height:' + PLATE_D + 'px;'; field.appendChild(lane);
        var els = q.plates.map(function (p, i) { var el = plateEl(p, false); el.style.cssText = 'width:' + PLATE_D + 'px;height:' + PLATE_D + 'px;display:none;'; el.dataset.i = String(i); lane.appendChild(el); return el; });
        var taken = [], phase = 'play', stackBox = h('div', { 'class': 'ssh-stack' });
        stackBox.style.cssText = 'left:24px;top:' + (beltTop + PLATE_D + 40) + 'px;'; stackBox.appendChild(h('div', { 'class': 'ssh-stack__t', text: '拿下來的' })); var stackTop = h('div', { 'class': 'ssh-stack__top' }); stackBox.appendChild(stackTop); field.appendChild(stackBox);
        var info = h('div', { 'class': 'qz-note ssh-info', text: level === 1 ? '盤子經過時點它拿下來，剛好湊到預算！' : '邊拿邊加，剛好就按「夠了」' }); info.style.top = (beltTop + PLATE_D + 150) + 'px'; field.appendChild(info);
        var btn = kit.btnGrid(field, [{ text: '夠了！', kind: 'primary', cls: 'ssh-btn', onTap: function () { finish('done'); } }], { cols: 1, h: 92, bottom: 12 });
        if (level === 1 && kit.once('sushi.hint')) api.after(Math.round((LEAD_S + 0.8) * 1000), function () { if (phase === 'play') kit.hintOn(stage, null, { mode: 'tap', x: W * 0.62, y: lane.offsetTop + PLATE_D / 2, delay: 200, text: '盤子經過時點它' }); });

        var t0 = performance.now();
        function nowS() { return (performance.now() - t0) / 1000; }
        function paint(t) {
            q.plates.forEach(function (p, i) {
                if (taken.indexOf(i) >= 0) return;
                var x = plateX(i, t, q.gap, q.speed, W);
                if (!visibleAt(i, t, q.gap, q.speed, W) && (x < 0 || x > W + PLATE_D)) { els[i].style.display = 'none'; return; }
                els[i].style.display = 'block'; els[i].style.transform = 'translate3d(' + (x - PLATE_D / 2).toFixed(1) + 'px,0,0)';
            });
        }
        api.my.loop(function (now) { if (phase !== 'play' || api.over || !stage.isConnected) return false; paint(nowS()); });
        api.timer(q.lap, function () { finish('lap'); });

        /* 拿盤子：點到盤子（比外框多 HIT_PAD）就拿下來 */
        lane.addEventListener('pointerdown', function (e) {
            if (phase !== 'play' || api.over) return;
            e.preventDefault();
            var r = lane.getBoundingClientRect(), px = e.clientX - r.left, t = nowS(), best = -1, bd = 1e9;
            q.plates.forEach(function (p, i) { if (taken.indexOf(i) >= 0 || !visibleAt(i, t, q.gap, q.speed, W)) return; var d = Math.abs(px - plateX(i, t, q.gap, q.speed, W)); if (d <= PLATE_D / 2 + HIT_PAD && d < bd) { bd = d; best = i; } });
            if (best >= 0) take(best);
        });
        function take(i) {
            if (phase !== 'play' || taken.indexOf(i) >= 0) return;
            taken.push(i); els[i].style.display = 'none'; Sfx.play('click');
            stackTop.innerHTML = ''; stackTop.appendChild(plateEl(q.plates[i], true));
        }
        /* 結束：攤開拿的盤子，一盤一盤累加；寫出一種剛好的拿法 */
        function finish(kind) {
            if (phase !== 'play' || api.over) return;
            phase = 'end'; api.stopTimer();
            var r = judge(q, taken), why = whyText(r, q);
            btn.btns[0].classList.add('ssh-btn--off'); lane.style.display = 'none'; belt.style.display = 'none'; stackBox.style.display = 'none';
            showSpread();
            info.textContent = why; info.style.top = ''; info.style.bottom = '116px';
            if (r.result === 'ok') { info.classList.add('ssh-info--ok'); kit.flash(stage, true, api.my); Sfx.play('ok'); api.pass({ delay: 2200 }); return; }
            info.classList.add('ssh-info--bad'); kit.flash(stage, false, api.my);
            var way = q.solution.map(function (k) { return q.plates[k].price; }).join('＋') + ' ＝ ' + q.target;
            api.fail({ delay: 4400, lines: [why, '一種剛好的拿法（第 ' + q.solution.map(function (k) { return k + 1; }).join('、') + ' 個盤子）：' + way, '你拿了 ' + taken.length + ' 盤：' + (taken.length ? taken.slice().sort(function (a, b) { return a - b; }).map(function (k) { return q.plates[k].price; }).join('＋') : '（沒拿）') + ' ＝ ' + r.sum] });
        }
        function showSpread() {
            var box = h('div', { 'class': 'ssh-spread' }); box.style.top = '170px';
            var list = taken.slice().sort(function (a, b) { return a - b; }), cols = 5, cw = Math.floor((W - 24 - (cols - 1) * 6) / cols), run = 0;
            if (!list.length) box.appendChild(h('div', { 'class': 'ssh-spread__none', text: '一個盤子都沒拿' }));
            list.forEach(function (k) {
                run += q.plates[k].price; var cell = h('div', { 'class': 'ssh-cell' }), m = plateEl(q.plates[k], true); m.style.cssText = 'position:relative;width:' + cw + 'px;height:' + cw + 'px;';
                cell.appendChild(m); cell.appendChild(h('div', { 'class': 'ssh-cell__p', text: q.plates[k].price + '元' })); cell.appendChild(h('div', { 'class': 'ssh-cell__s', text: String(run) })); cell.style.width = cw + 'px'; box.appendChild(cell);
            });
            field.appendChild(box);
        }
        /* 驗證用：在每個「剛好那一組」的盤子剛進到畫面的時間拿下來，全部拿完就按「夠了」（solve，不真的點）；wrong＝拿一個不在解裡的盤子再按夠了；可重複呼叫（只排一次） */
        var armed = false;
        api.solve = function () {
            if (armed || phase !== 'play') return; armed = true;
            q.solution.forEach(function (k, n) { var tk = LEAD_S + k * q.gap + (PLATE_D / 2 + 50) / q.speed;          /* 盤子剛進到畫面（離右邊緣 50px）就拿，驗證才不會等太久 */ api.after(Math.max(0, Math.round((tk - nowS()) * 1000)), function () { take(k); if (n === q.solution.length - 1) api.after(120, function () { finish('done'); }); }); });
        };
        api.wrong = function () { if (armed || phase !== 'play') return; armed = true; api.after(300, function () { finish('done'); }); };
    }

    var G = {
        id: ID,
        name: '迴轉壽司',
        rule: '迴轉壽司的輸送帶，**盤子的顏色代表價格**（白 30、紅 40、藍 60、金 100，價目表貼在上面）。上面寫著預算（例如「剛好 280 元」）。**盤子經過時點它就拿下來**，拿下來的疊在旁邊，只看得到最上面一個，總金額不顯示。輸送帶轉完一圈（或你按「夠了」），**拿的盤子要剛好是預算**。輸送帶不會停，要邊算邊決定，拿太晚就湊不到。**第 10 關起多了 50 元的綠盤**。',
        mount: mount,
        score: SCORE,
        test: {
            platesFor: platesFor, pickFor: pickFor, gapFor: gapFor, speedFor: speedFor, pricesFor: pricesFor, makeLevel: makeLevel, lapMs: lapMs, plateX: plateX, visibleAt: visibleAt, judge: judge, countSolutions: countSolutions, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, PLATES: PLATES, PICK: PICK, GAP_S: GAP_S, SPEED: SPEED, PRICE_BASE: PRICE_BASE, PRICE_LATER: PRICE_LATER, LATER_FROM: LATER_FROM, PLATE_D: PLATE_D, HIT_PAD: HIT_PAD, LEAD_S: LEAD_S, MAX_LEVEL: MAX_LEVEL, COLOR_OF: COLOR_OF
        }
    };
    Reaction.register(G);
})();
