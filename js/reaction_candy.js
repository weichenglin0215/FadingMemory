/* ═══════════════════════════════════════════════════════════════════
   reaction_candy.js — 秒反應・幾顆糖
   一堆各種顏色的糖果閃一下就蓋起來，數出「指定顏色」的糖果有幾顆（瞬間數量感）。
   ───────────────────────────────────────────────────────────────────
   · 每一題先告訴你要數哪個顏色（出題時一定挑整堆糖果裡數量最多的顏色），再閃現糖果 showMs 毫秒，蓋住後四選一。
   · 難度全部線性（第 1 題 → 第 LEVEL_RAMP 題）：
        糖果總數 N         N_START → N_END（N_END 是「放得下」的上限，見下面的擺放）
        顏色種類 K         K_START → K_END
        閃現時間           SHOW_START → SHOW_END 毫秒
        選項間隔 gap       3 → 1（最後選項是 正確答案±1、±2 …，很容易猜錯一顆）
        第一名領先第二名   LEAD_START → LEAD_END 顆（第一名一定比任何其他顏色至少多這麼多顆，沒有並列）
   · 糖果大小 R = 42（邏輯 px，是原本的兩倍）。糖果可以重疊，但每一顆露出來的面積都要 ≥ MIN_VIS（30%）：
     scatter 一顆一顆往上疊，疊上去之後，前面每一顆被蓋住的比例用取樣點數（糖果形狀內的格點）逐一檢查，
     不夠露出就換位置重擺；放不下整個重排（最多 SCATTER_RESTARTS 次）。
   · 題目頁與答案頁用「同一份擺放」（Q.layout：位置、角度、疊放順序、顏色都一樣），答案頁只是把數量最多的
     顏色圈起來。
   · 有 LIVES 次機會（目前 1：錯一次就結束）。成績＝答對幾題；失敗後可從「失敗題數 − 5」繼續。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'candy';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 20;
    var N_START = 10, N_END = 70;                  /* 放得下的上限：t_candy.js 會驗證在托盤 W×H 內擺得下 */
    var K_START = 2, K_END = 5;
    var LEAD_START = 3, LEAD_END = 1;              /* 第一名領先第二名的顆數 */
    var MIN_VIS = 0.30;                            /* 每顆糖果至少要露出幾成的面積 */
    var SCATTER_RESTARTS = 24;
    var SHOW_START = 2000, SHOW_END = 15000;         /* 閃現時間（毫秒） */
    var GAP_START = 3, GAP_END = 1;
    var LIVES = 1;
    var ANSWER_S = 8;                              /* 蓋住後的作答時限（秒） */
    var PREP_MS = 1300;                            /* 告知顏色後多久閃現 */
    var REVEAL_MS = 1800;                          /* 答完揭曉停留 */
    var R = 42;                                    /* 糖果大小（半徑，邏輯 px） */
    var COLORS = [
        { name: '紅', fill: '#E8685A', dark: '#A8342A' },
        { name: '藍', fill: '#4A90D9', dark: '#245E9C' },
        { name: '綠', fill: '#3FA46A', dark: '#1E6E40' },
        { name: '黃', fill: '#F2C230', dark: '#A8800A' },
        { name: '紫', fill: '#9B59B6', dark: '#62307A' },
        { name: '橘', fill: '#F08A24', dark: '#A8570A' }
    ];

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 題'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function paramsFor(level) {
        return {
            n: Math.round(kit.ramp(level, N_START, N_END, LEVEL_RAMP)),
            k: Math.round(kit.ramp(level, K_START, K_END, LEVEL_RAMP)),
            showMs: Math.round(kit.ramp(level, SHOW_START, SHOW_END, LEVEL_RAMP)),
            gap: Math.round(kit.ramp(level, GAP_START, GAP_END, LEVEL_RAMP)),
            lead: Math.round(kit.ramp(level, LEAD_START, LEAD_END, LEVEL_RAMP))
        };
    }
    /* 出題：回傳 { n, k, colors:[顏色索引], counts:{顏色:顆數}, target(數量最多的顏色), answer, options:[4 個], showMs, gap, lead }
       target 的顆數一定比任何其他顏色至少多 lead 顆（所以最多的顏色是唯一的）。 */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        var p = paramsFor(level);
        var colors = kit.shuffle(COLORS.map(function (_, i) { return i; }), rand).slice(0, p.k);
        var target = kit.pick(colors, rand);
        var others = colors.filter(function (x) { return x !== target; });
        var lead = p.lead;
        /* c 的範圍：其他每色至少 1 顆且不超過 c − lead，所以 (k−1)(c−lead) ≥ n − c */
        var cmin = Math.max(1 + lead, Math.ceil((p.n + (p.k - 1) * lead) / p.k)), cmax = Math.min(p.n - (p.k - 1), Math.round(p.n / p.k * 2));
        if (cmax < cmin) cmax = cmin;
        var c = kit.randInt(cmin, cmax, rand);
        var counts = {};
        others.forEach(function (x) { counts[x] = 1; });
        var rest = p.n - c - others.length, guard = 0;
        while (rest > 0 && guard++ < 10000) {
            var x = kit.pick(others, rand);
            if (counts[x] < c - lead) { counts[x]++; rest--; }
        }
        counts[target] = c;
        /* 四個選項：正確答案 ± gap 的倍數 */
        var cand = [-3, -2, -1, 1, 2, 3].map(function (k) { return c + k * p.gap; }).filter(function (v) { return v >= 1 && v !== c; });
        var near = kit.shuffle(cand, rand).sort(function (a, b) { return Math.abs(a - c) - Math.abs(b - c); }).slice(0, 4);
        var options = kit.shuffle([c].concat(kit.shuffle(near, rand).slice(0, 3)), rand);
        return { n: p.n, k: p.k, colors: colors, counts: counts, target: target, answer: c, options: options, showMs: p.showMs, gap: p.gap, lead: lead };
    }

    /* ─── 糖果的形狀（以糖果中心為原點，長軸沿 x）：中間的橢圓＋兩端的蝴蝶結三角形 ─── */
    function inCandy(px, py, cx, cy, rot) {
        var a = -rot * Math.PI / 180, dx = px - cx, dy = py - cy;
        var x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a);       /* 轉回糖果自己的座標 */
        var ex = x / (R * 0.78), ey = y / (R * 0.62);
        if (ex * ex + ey * ey <= 1) return true;
        var ax = Math.abs(x);
        /* 蝴蝶結：x 從 0.55R 到 1.05R，高度由 0 長到 ±0.5R */
        if (ax >= R * 0.55 && ax <= R * 1.05) return Math.abs(y) <= (ax - R * 0.55) / (R * 0.5) * R * 0.5;
        return false;
    }
    var SAMPLES = (function () {
        var out = [], step = R / 7;
        for (var x = -R * 1.05; x <= R * 1.05; x += step) for (var y = -R * 0.62; y <= R * 0.62; y += step) if (inCandy(x, y, 0, 0, 0)) out.push({ x: x, y: y });
        return out;
    })();
    /* 糖果 i 的取樣點（世界座標） */
    function samplePoints(c) {
        var a = c.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        return SAMPLES.map(function (q) { return { x: c.x + q.x * ca - q.y * sa, y: c.y + q.x * sa + q.y * ca }; });
    }
    /* 每顆糖果露出來的比例（陣列最後一顆在最上面）。給測試與 scatter 用 */
    function visibleFractions(layout) {
        var pts = layout.map(samplePoints);
        return layout.map(function (c, i) {
            var vis = 0;
            pts[i].forEach(function (q) {
                for (var j = i + 1; j < layout.length; j++) {
                    var d = layout[j];
                    if ((d.x - c.x) * (d.x - c.x) + (d.y - c.y) * (d.y - c.y) > 4.4 * R * R) continue;
                    if (inCandy(q.x, q.y, d.x, d.y, d.rot)) return;
                }
                vis++;
            });
            return vis / pts[i].length;
        });
    }
    /* 糖果在托盤上的位置（疊放順序＝陣列順序，後面的疊在前面上面）。每顆都露出至少 MIN_VIS；放不下就整個重排，
       真的不行回傳 null。 */
    function scatter(n, W, Hh, rand) {
        rand = rand || Math.random;
        var mx = R * 1.1 + 4, my = R * 1.1 + 4;
        for (var attempt = 0; attempt < SCATTER_RESTARTS; attempt++) {
            var out = [], samples = [], covered = [], failed = false;
            for (var i = 0; i < n && !failed; i++) {
                var placed = false;
                for (var t = 0; t < 120 && !placed; t++) {
                    var cand = { x: mx + rand() * (W - 2 * mx), y: my + rand() * (Hh - 2 * my), rot: rand() * 180 };
                    /* 這顆疊上去之後，附近每顆前面的糖果被蓋住的取樣點數 */
                    var changes = [], ok = true;
                    for (var j = 0; j < out.length && ok; j++) {
                        var d = out[j];
                        if ((d.x - cand.x) * (d.x - cand.x) + (d.y - cand.y) * (d.y - cand.y) > 4.4 * R * R) continue;
                        var add = [];
                        for (var q = 0; q < samples[j].length; q++) {
                            if (covered[j][q]) continue;
                            if (inCandy(samples[j][q].x, samples[j][q].y, cand.x, cand.y, cand.rot)) add.push(q);
                        }
                        if (add.length) {
                            var nowCovered = covered[j].filter(Boolean).length + add.length;
                            if ((samples[j].length - nowCovered) / samples[j].length < MIN_VIS) ok = false;
                            changes.push([j, add]);
                        }
                    }
                    if (!ok) continue;
                    changes.forEach(function (ch) { ch[1].forEach(function (q) { covered[ch[0]][q] = true; }); });
                    out.push(cand); samples.push(samplePoints(cand)); covered.push(samples[samples.length - 1].map(function () { return false; }));
                    placed = true;
                }
                if (!placed) failed = true;
            }
            if (!failed) return out;
        }
        return null;
    }

    function drawCandy(parent, x, y, rot, col, cls) {
        var g = kit.svg('g', { 'class': 'cd-candy' + (cls ? ' ' + cls : ''), transform: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot.toFixed(0) + ')' }, parent);
        /* 糖紙兩端的蝴蝶結 */
        kit.svg('polygon', { points: (-R * 0.55) + ',0 ' + (-R * 1.05) + ',' + (-R * 0.5) + ' ' + (-R * 1.05) + ',' + (R * 0.5), fill: col.fill, stroke: col.dark, 'stroke-width': R * 0.09, 'stroke-linejoin': 'round' }, g);
        kit.svg('polygon', { points: (R * 0.55) + ',0 ' + (R * 1.05) + ',' + (-R * 0.5) + ' ' + (R * 1.05) + ',' + (R * 0.5), fill: col.fill, stroke: col.dark, 'stroke-width': R * 0.09, 'stroke-linejoin': 'round' }, g);
        kit.svg('ellipse', { rx: R * 0.78, ry: R * 0.62, fill: col.fill, stroke: col.dark, 'stroke-width': R * 0.11 }, g);
        kit.svg('ellipse', { cx: -R * 0.2, cy: -R * 0.22, rx: R * 0.3, ry: R * 0.16, fill: 'rgba(255,255,255,0.55)' }, g);
        return g;
    }

    function mount(root, ctx) {
        var R_ = null;

        /* start：從第幾題開始（失敗後可從前 5 題繼續）*/
        function round(start) {
            if (R_) R_.dispose();
            R_ = kit.round();
            var my = R_;
            root.innerHTML = '';
            var level = start || 1, right = level - 1, lives = LIVES, newRec = false, state = 'idle';
            var Q = null;

            var head = h('div', { 'class': 'cd-head' });
            var ask = h('div', { 'class': 'cd-ask' });
            var tray = h('div', { 'class': 'cd-tray' });
            var cover = h('div', { 'class': 'cd-cover', text: '?' });
            var bar = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = bar.firstChild;
            var opts = h('div', { 'class': 'cd-opts' });
            tray.appendChild(cover);
            root.appendChild(head);
            root.appendChild(ask);
            root.appendChild(tray);
            root.appendChild(bar);
            root.appendChild(opts);

            function meta() { ctx.setMeta(kit.meta(['答對 ' + right, '機會 ' + lives, fmtBest(Reaction.getBest(ID))])); }
            function setHead() { head.textContent = '第 ' + level + ' 題'; }

            function nextQ() {
                if (my.dead) return;
                Q = makeQuestion(level);
                state = 'prep';
                setHead(); meta();
                var col = COLORS[Q.target];
                ask.innerHTML = '';
                ask.appendChild(h('span', { text: '請數：' }));
                var chip = h('span', { 'class': 'cd-chip', text: col.name });
                chip.style.background = col.fill; chip.style.borderColor = col.dark;
                ask.appendChild(chip);
                ask.appendChild(h('span', { text: '色糖果有幾顆？' }));
                opts.innerHTML = '';
                tray.querySelectorAll('svg').forEach(function (s) { s.remove(); });
                cover.classList.remove('cd-cover--off');
                cover.textContent = '準備…';
                fill.style.width = '100%';
                try {
                    var cs = Q.colors.map(function (c) { return COLORS[c].name + ' ' + Q.counts[c]; }).join('、');
                    console.info('[幾顆糖] 第 ' + level + ' 題 共 ' + Q.n + ' 顆（' + cs + '），要數「' + col.name + '」＝' + Q.answer + '，閃現 ' + Q.showMs + ' 毫秒，選項 ' + Q.options.join('/') + '（間隔 ' + Q.gap + '）');
                } catch (e) { }
                my.after(PREP_MS, flash);
            }

            function buildSvg(markTarget) {
                var W = tray.clientWidth, Hh = tray.clientHeight;
                var svg = kit.svg('svg', { 'class': 'cd-svg', viewBox: '0 0 ' + W + ' ' + Hh }, tray);
                /* 擺放只做一次（Q.layout）：題目頁與答案頁的位置、角度、疊放順序、顏色完全相同 */
                if (!Q.layout) {
                    var list = [];
                    Q.colors.forEach(function (c) { for (var i = 0; i < Q.counts[c]; i++) list.push(c); });
                    list = kit.shuffle(list);
                    var pos = scatter(list.length, W, Hh);
                    if (!pos) throw new Error('candy: cannot place ' + list.length + ' candies in ' + W + 'x' + Hh);
                    Q.layout = list.map(function (c, i) { return { x: pos[i].x, y: pos[i].y, rot: pos[i].rot, color: c }; });
                }
                Q.layout.forEach(function (c) {
                    var g = drawCandy(svg, c.x, c.y, c.rot, COLORS[c.color]);
                    if (markTarget && c.color === Q.target) {
                        kit.svg('circle', { r: R * 1.2, fill: 'none', stroke: '#2B2B2B', 'stroke-width': 4, 'stroke-dasharray': '8 6' }, g);
                    }
                });
                return svg;
            }

            function flash() {
                if (state !== 'prep') return;
                state = 'show';
                tray.querySelectorAll('svg').forEach(function (s) { s.remove(); });
                buildSvg(false);
                cover.classList.add('cd-cover--off');
                Sfx.play('go');
                var t0 = performance.now(), dur = Q.showMs;
                var lp = my.loop(function (now) {
                    if (state !== 'show') return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - t0) / dur)).toFixed(1) + '%';
                });
                my.after(dur, function () {
                    lp.stop();
                    state = 'ans';
                    tray.querySelectorAll('svg').forEach(function (s) { s.remove(); });
                    cover.classList.remove('cd-cover--off');
                    cover.textContent = '幾顆？';
                    showOptions();
                });
            }

            function showOptions() {
                opts.innerHTML = '';
                Q.options.forEach(function (v) {
                    var b = h('button', { 'class': 'cd-opt', text: String(v) });
                    b.addEventListener('pointerdown', function (e) { e.preventDefault(); answer(v, b); });
                    opts.appendChild(b);
                });
                var t0 = performance.now(), dur = ANSWER_S * 1000;
                var lp = my.loop(function (now) {
                    if (state !== 'ans') return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - t0) / dur)).toFixed(1) + '%';
                });
                Q.timer = my.after(dur, function () { if (state === 'ans') answer(null, null); });
                Q.lp = lp;
            }

            function answer(v, btn) {
                if (state !== 'ans') return;
                state = 'rev';
                my.cancel(Q.timer); Q.lp.stop();
                fill.style.width = '0%';
                var ok = v === Q.answer;
                [].forEach.call(opts.children, function (b) {
                    if (+b.textContent === Q.answer) b.classList.add('cd-opt--ok');
                    else if (b === btn) b.classList.add('cd-opt--bad');
                });
                /* 揭曉：糖果再亮出來，指定顏色的圈起來 */
                tray.querySelectorAll('svg').forEach(function (s) { s.remove(); });
                buildSvg(true);
                cover.classList.add('cd-cover--off');
                ask.textContent = (v == null ? '時間到！' : (ok ? '答對了！' : '答錯了…')) + ' 正確是 ' + Q.answer + ' 顆（共 ' + Q.n + ' 顆）';
                if (ok) { right++; Sfx.play('ok'); if (Reaction.setBest(ID, right, function (a, b) { return a > b; })) newRec = true; }
                else { lives--; Sfx.play('bad'); }
                var failLevel = level;
                level++;
                setHead(); meta();
                if (lives <= 0) {
                    var back = kit.resumeFrom(failLevel);
                    my.after(REVEAL_MS + 400, function () {
                        kit.result(root, {
                            num: right + ' 題', label: '機會用完了', lines: ['第 ' + failLevel + ' 題沒數對：' + COLORS[Q.target].name + '色（全堆最多的顏色）有 ' + Q.answer + ' 顆'],
                            isNew: newRec, sfx: right >= 8 ? 'win' : 'fail',
                            onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                } else {
                    my.after(REVEAL_MS, nextQ);
                }
            }

            G.debug = {
                state: function () { return { level: level, right: right, lives: lives, state: state, Q: Q }; },
                answerRight: function () { answer(Q.answer, null); },
                answerWrong: function () { answer(-999, null); }
            };
            my.after(300, nextQ);
        }

        round(1);
    }

    var G = {
        id: ID,
        name: '幾顆糖',
        rule: '先告訴你要數哪一種顏色的糖果（那是整堆糖果裡數量最多的顏色），接著一堆糖果會閃一下就蓋起來，憑感覺選出那個顏色有幾顆。糖果會互相疊在一起，但每一顆都看得到。越後面糖果越多、閃得越快，選項也越接近。只有一次機會，答錯就結束！',
        mount: mount,
        test: { paramsFor: paramsFor, makeQuestion: makeQuestion, scatter: scatter, visibleFractions: visibleFractions, inCandy: inCandy, COLORS: COLORS, R: R, LEVEL_RAMP: LEVEL_RAMP, MIN_VIS: MIN_VIS, N_END: N_END }
    };
    Reaction.register(G);
})();
