/* ═══════════════════════════════════════════════════════════════════
   reaction_dough.js — 秒反應・擀水餃皮（企劃 417）
   包水餃。一小團麵糰。**手指往某個方向拖，擀麵棍就往那個方向擀，麵皮就往那個方向變長**。
   要把麵皮擀成「**圓的**、**和樣品（虛線圓）一樣大**」。做好按「好了」：圓度 91.2318%、大小差 3.1%。
   **圓度和大小差都要達到及格線才過關**（圓度 80% → 95%、大小差 15% → 3%）。
   ───────────────────────────────────────────────────────────────────
   · 麵皮是一個多邊形（K 個頂點，原點在麵皮的中心）。擀一下（roll）：手指移動了一小段（方向 φ、長度 s px），
     把每個頂點 p 分成「沿著擀的方向」和「垂直方向」兩個分量：沿著方向放大 (1 ＋ ε) 倍、垂直方向放大 (1 ＋ κ·ε) 倍（麵皮被壓扁，也會往旁邊散開一點），
     ε ＝ ROLL_K × s，κ ＝ SPREAD。擀完再把中心移回原點。**麵皮只會越擀越大，回不去**。
   · 一直往同一個方向擀會變成橢圓：要**轉著方向擀**（像真的包水餃）——往麵皮比較短的方向擀，就會越來越圓。
   · 圓度（roundness）＝ 100 × 2·r最小 ÷ (r最小 ＋ r最大)，r 是頂點到中心的距離。圓＝100%；長短軸比 1.1 的橢圓 ≈ 95.2%。
     大小差（sizeDiff）＝ |麵皮面積 − 樣品圓面積| ÷ 樣品圓面積 × 100%。面積用多邊形的鞋帶公式算。
   · 擀過頭：麵皮的面積超過「樣品面積 × (1 ＋ 大小差上限)」就**再也回不來**，立刻失敗（「擀太大了」）。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：圓度及格線 80% → 95%、大小差上限 15% → 3%、麵糰一開始的長短軸比 1.15 → 1.6（越來越不圓）、一開始越來越小（樣品的 0.45 → 0.3 倍）。
   · 揭曉：麵皮、樣品圓（虛線）和「最接近的圓」並排，寫出圓度和大小差各自有沒有達到。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'dough';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂 */
    var ROUND_MIN = [80, 95];                   /* 圓度及格線（%）：第 1 關 → 到頂（使用者企劃 80% → 95%） */
    var SIZE_MAX = [15, 3];                     /* 大小差上限（%）：第 1 關 → 到頂（使用者企劃 15% → 3%） */
    var RATIO0 = [1.15, 1.6];                   /* 麵糰一開始的長短軸比：第 1 關 → 到頂 */
    var START_FRAC = [0.45, 0.3];               /* 麵糰一開始的半徑占樣品半徑的比例：第 1 關 → 到頂 */
    var LUMP = [0.008, 0.02];                   /* 麵糰表面小凹凸的最大幅度（占半徑的比例）：第 1 關 → 到頂（凹凸擀不掉，所以不能太大） */
    var SAMPLE_R = 112;                         /* 樣品圓的半徑（px） */
    var K = 96;                                 /* 麵皮多邊形的頂點數 */
    var ROLL_K = 0.0035;                        /* 手指每移動 1px，沿著擀的方向放大多少（ε ＝ ROLL_K × s） */
    var SPREAD = 0.25;                          /* 垂直方向跟著放大的比例（κ） */
    var MAX_STEP = 36;                          /* 一次移動事件最多算幾 px（避免一下子擀太多） */
    var SOLVE_STEP = 14;                        /* 驗證用：api.solve 每一小步擀幾 px */
    var MAX_LEVEL = 60;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function roundMinFor(level) { return Math.round(ramp(level, ROUND_MIN) * 10000) / 10000; }
    function sizeMaxFor(level) { return Math.round(ramp(level, SIZE_MAX) * 10000) / 10000; }
    function ratioFor(level) { return Math.round(ramp(level, RATIO0) * 1000) / 1000; }
    function startFracFor(level) { return Math.round(ramp(level, START_FRAC) * 1000) / 1000; }
    function lumpFor(level) { return Math.round(ramp(level, LUMP) * 10000) / 10000; }
    /* 多邊形面積（鞋帶公式）；pts＝[{x, y}] */
    function area(pts) { var s = 0; for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; }
    /* 多邊形的重心（面積重心） */
    function centroid(pts) {
        var A = 0, cx = 0, cy = 0;
        for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length], cr = a.x * b.y - b.x * a.y; A += cr; cx += (a.x + b.x) * cr; cy += (a.y + b.y) * cr; }
        return A === 0 ? { x: 0, y: 0 } : { x: cx / (3 * A), y: cy / (3 * A) };
    }
    /* 把多邊形的重心移到原點 */
    function recenter(pts) { var c = centroid(pts); return pts.map(function (p) { return { x: p.x - c.x, y: p.y - c.y }; }); }
    /* 頂點到原點的距離（半徑）的最小、最大、平均 */
    function radii(pts) { var mn = 1e18, mx = 0, sum = 0; pts.forEach(function (p) { var r = Math.hypot(p.x, p.y); if (r < mn) mn = r; if (r > mx) mx = r; sum += r; }); return { min: mn, max: mx, mean: sum / pts.length }; }
    /* 圓度（%）：2·r最小 ÷ (r最小 ＋ r最大) × 100 */
    function roundness(pts) { var r = radii(recenter(pts)); return Math.round(200 * r.min / (r.min + r.max) * 10000) / 10000; }
    /* 大小差（%）：跟樣品圓面積差多少 */
    function sizeDiff(pts, sampleR) { var A0 = Math.PI * sampleR * sampleR; return Math.round(Math.abs(area(pts) - A0) / A0 * 100 * 10000) / 10000; }
    /* 擀一下：方向 phi（弧度）、長度 s（px）；沿著方向放大 1 ＋ ε、垂直方向放大 1 ＋ κε；回傳新的（已經把重心移回原點的）多邊形 */
    function roll(pts, phi, s) {
        var e = ROLL_K * s, ux = Math.cos(phi), uy = Math.sin(phi), vx = -uy, vy = ux, fa = 1 + e, fp = 1 + SPREAD * e;
        return recenter(pts.map(function (p) { var a = p.x * ux + p.y * uy, b = p.x * vx + p.y * vy; a *= fa; b *= fp; return { x: a * ux + b * vx, y: a * uy + b * vy }; }));
    }
    /* 一團麵糰：{ level, pts（K 個頂點，重心在原點）, sampleR, ratio, startR, roundMin, sizeMax, alpha（橢圓的方向）, lump } */
    function makeDough(level, rand) {
        rand = rand || Math.random;
        var ratio = ratioFor(level), r0 = SAMPLE_R * startFracFor(level), alpha = kit.randFloat(0, Math.PI, rand), lump = lumpFor(level), a = r0 * Math.sqrt(ratio), b = r0 / Math.sqrt(ratio), pts = [], ph = [kit.randFloat(0, 6.28, rand), kit.randFloat(0, 6.28, rand), kit.randFloat(0, 6.28, rand)];
        for (var i = 0; i < K; i++) {
            var t = i / K * 2 * Math.PI, ex = a * Math.cos(t), ey = b * Math.sin(t), f = 1 + lump * (0.5 * Math.cos(3 * t + ph[0]) + 0.3 * Math.cos(4 * t + ph[1]) + 0.2 * Math.cos(5 * t + ph[2]));
            pts.push({ x: (ex * Math.cos(alpha) - ey * Math.sin(alpha)) * f, y: (ex * Math.sin(alpha) + ey * Math.cos(alpha)) * f });
        }
        return { level: level, pts: recenter(pts), sampleR: SAMPLE_R, ratio: ratio, startR: r0, roundMin: roundMinFor(level), sizeMax: sizeMaxFor(level), alpha: alpha, lump: lump };
    }
    /* 判定：{ round, size, okRound, okSize, ok, tooBig（已經大到回不來）} */
    function judge(pts, level, sampleR) {
        sampleR = sampleR || SAMPLE_R;
        var rd = roundness(pts), sz = sizeDiff(pts, sampleR), A0 = Math.PI * sampleR * sampleR, big = area(pts) > A0 * (1 + sizeMaxFor(level) / 100);
        return { round: rd, size: sz, okRound: rd >= roundMinFor(level), okSize: sz <= sizeMaxFor(level), ok: rd >= roundMinFor(level) && sz <= sizeMaxFor(level), tooBig: big };
    }
    /* 最好的下一擀：往麵皮「最短的半徑」的方向擀（把短軸拉長，麵皮就越來越圓）；回傳角度（弧度） */
    function bestDirection(pts) { var c = recenter(pts), best = null, bd = 1e18; c.forEach(function (p) { var r = Math.hypot(p.x, p.y); if (r < bd) { bd = r; best = Math.atan2(p.y, p.x); } }); return best; }
    function whyText(j, level) {
        var t = '圓度 ' + j.round.toFixed(4) + '%（及格線 ' + roundMinFor(level).toFixed(4) + '%）、大小差 ' + j.size.toFixed(4) + '%（上限 ' + sizeMaxFor(level).toFixed(4) + '%）';
        if (j.ok) return t + '——過關！';
        if (j.tooBig) return '擀太大了，回不去了！' + t;
        return (j.okRound ? '' : '不夠圓！') + (j.okSize ? '' : '大小不對！') + t;
    }
    function rating(n) {
        if (n >= 15) return '包水餃師傅！';
        if (n >= 9) return '手感很好！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '轉著方向擀才會圓！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'dgh-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function pathOf(pts, cx, cy) { return 'M' + pts.map(function (p) { return (cx + p.x).toFixed(1) + ',' + (cy + p.y).toFixed(1); }).join(' L') + ' Z'; }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeDough(level, api.rand), pts = q.pts.slice();
        api.info = q;
        console.log('[擀水餃皮] 第 ' + level + ' 關：麵糰長短軸比 ' + q.ratio + '、一開始半徑 ' + q.startR.toFixed(1) + '（樣品 ' + q.sampleR + '）；及格線 圓度 ' + q.roundMin + '%、大小差 ≤ ' + q.sizeMax + '%；一開始圓度 ' + roundness(pts).toFixed(2) + '%');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, cx = Math.round(W / 2), cy = Math.round(H * 0.4);
        var field = h('div', { 'class': 'dgh-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note dgh-tip', text: level === 1 ? '手指往哪拖，麵皮就往哪邊變長（要擀成虛線圓那麼大）' : '轉著方向擀成虛線圓的大小，再按「好了」' });
        field.appendChild(tip);
        var svg = kit.svg('svg', { 'class': 'dgh-svg', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H }, field);
        kit.svg('circle', { 'class': 'dgh-sample', cx: cx, cy: cy, r: q.sampleR }, svg);
        var cut = kit.svg('circle', { 'class': 'dgh-best', cx: cx, cy: cy, r: 0 }, svg);
        var skin = kit.svg('path', { 'class': 'dgh-dough', d: pathOf(pts, cx, cy) }, svg);
        var pin = h('div', { 'class': 'dgh-pin' }); pin.style.display = 'none'; field.appendChild(pin);
        var info = h('div', { 'class': 'qz-note dgh-info', text: '' }); info.style.top = (cy + q.sampleR + 38) + 'px'; field.appendChild(info);
        var btn = kit.btnGrid(field, [{ text: '好了！', kind: 'primary', cls: 'dgh-btn', onTap: function () { done(); } }], { cols: 1, h: 92, bottom: 12 });
        if (level === 1 && kit.once('dough.hint')) kit.hintOn(stage, null, { mode: 'drag', x: cx - 60, y: cy + q.sampleR + 30, dx: 120, dy: 0, delay: 800, text: '往旁邊拖，麵皮就往旁邊變長' });

        var phase = 'roll', down = null, last = null, rolls = 0;
        function paint() { skin.setAttribute('d', pathOf(pts, cx, cy)); }
        /* 手指：每個移動事件，算移動的方向和距離，擀一下；太大就立刻失敗 */
        field.addEventListener('pointerdown', function (e) {
            if (phase !== 'roll' || api.over || down) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }
            var p = kit.localPt(e, field); down = { id: e.pointerId }; last = p; showPin(p, 0);
        });
        field.addEventListener('pointermove', function (e) {
            if (!down || e.pointerId !== down.id || phase !== 'roll') return;
            var p = kit.localPt(e, field), dx = p.x - last.x, dy = p.y - last.y, s = Math.min(MAX_STEP, Math.hypot(dx, dy));
            if (s < 1) return;
            var phi = Math.atan2(dy, dx); last = p; showPin(p, phi);
            pts = roll(pts, phi, s); rolls++; paint();
            if (judge(pts, level, q.sampleR).tooBig) finish(true);
        });
        function up(e) { if (down && e.pointerId === down.id) { down = null; pin.style.display = 'none'; } }
        field.addEventListener('pointerup', up); field.addEventListener('pointercancel', up);
        function showPin(p, phi) { var r = field.getBoundingClientRect(); void r; pin.style.display = 'block'; pin.style.left = (p.x - 60) + 'px'; pin.style.top = (p.y - 14) + 'px'; pin.style.transform = 'rotate(' + (phi * 180 / Math.PI + 90) + 'deg)'; }
        function done() { if (phase !== 'roll' || api.over) return; finish(false); }

        /* 結果：把麵皮、樣品圓、「最接近的圓」並排；圓度和大小差各自有沒有達到 */
        function finish(overshoot) {
            if (phase !== 'roll' || api.over) return;
            phase = 'end'; down = null; pin.style.display = 'none'; btn.btns[0].classList.add('dgh-btn--off');
            var j = judge(pts, level, q.sampleR), rr = radii(recenter(pts));
            cut.setAttribute('r', rr.mean.toFixed(1));
            var why = whyText(j, level);
            info.textContent = why; info.classList.add(j.ok ? 'dgh-info--ok' : 'dgh-info--bad');
            tip.textContent = j.ok ? '擀得又圓又剛好！' : (overshoot ? '麵皮擀太大了' : (j.okRound ? '大小不對' : '麵皮不夠圓（粉色虛線圈是平均大小的圓）'));
            if (j.ok) { kit.flash(stage, true, api.my); Sfx.play('ok'); api.pass({ delay: 2300 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 4200, lines: [why, '擀了 ' + rolls + ' 下', '只往同一個方向擀會變橢圓；要往麵皮比較短的方向擀才會變圓，而且不能擀過頭（變大了回不去）'] });
        }
        /* 驗證用：每一次呼叫直接擀一小步（往最短的方向擀 SOLVE_STEP px），大小夠了且夠圓就按好了（solve）；wrong＝直接按好了（太小）；可以重複呼叫 */
        api.solve = function () {
            if (phase !== 'roll') return;
            for (var k = 0; k < 400 && phase === 'roll'; k++) {
                var j = judge(pts, level, q.sampleR);
                if (j.ok) { paint(); finish(false); return; }
                if (j.tooBig) { paint(); finish(true); return; }
                pts = roll(pts, bestDirection(pts), area(pts) < Math.PI * q.sampleR * q.sampleR * 0.5 ? SOLVE_STEP * 2 : SOLVE_STEP); rolls++;
            }
            paint(); finish(false);
        };
        api.wrong = function () { if (phase === 'roll') done(); };
    }

    var G = {
        id: ID,
        name: '擀水餃皮',
        rule: '一小團麵糰。**手指往某個方向拖，擀麵棍就往那個方向擀，麵皮就往那個方向變長**。要把麵皮擀成圓的、和樣品（虛線圓）一樣大，做好按「好了」。圓度和大小差都要達到及格線才過關（圓度 80% → 95%、大小差 15% → 3%）。**一直往同一個方向擀會變成橢圓**，要**轉著方向擀**（往麵皮比較短的方向擀）；**擀過頭、變太大了就回不去**。越後面，麵糰一開始越不圓。',
        mount: mount,
        score: SCORE,
        test: {
            roundMinFor: roundMinFor, sizeMaxFor: sizeMaxFor, ratioFor: ratioFor, startFracFor: startFracFor, lumpFor: lumpFor, area: area, centroid: centroid, recenter: recenter, radii: radii, roundness: roundness, sizeDiff: sizeDiff, roll: roll, makeDough: makeDough, judge: judge, bestDirection: bestDirection, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ROUND_MIN: ROUND_MIN, SIZE_MAX: SIZE_MAX, RATIO0: RATIO0, START_FRAC: START_FRAC, LUMP: LUMP, SAMPLE_R: SAMPLE_R, K: K, ROLL_K: ROLL_K, SPREAD: SPREAD, MAX_STEP: MAX_STEP, SOLVE_STEP: SOLVE_STEP, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
