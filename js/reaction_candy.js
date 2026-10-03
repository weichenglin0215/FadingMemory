/* ═══════════════════════════════════════════════════════════════════
   reaction_candy.js — 秒反應・幾顆糖
   一堆各種顏色的糖果閃一下就蓋起來，數出「指定顏色」的糖果有幾顆（瞬間數量感）。
   ───────────────────────────────────────────────────────────────────
   · 每一題先告訴你要數哪個顏色，再閃現糖果 showMs 毫秒，蓋住後四選一。
   · 難度全部線性（第 1 題 → 第 LEVEL_RAMP 題）：
        糖果總數 N         10 → 40
        顏色種類 K         3  → 6
        閃現時間           2.5 秒 → 0.9 秒
        選項間隔 gap       3  → 1（最後選項是 正確答案±1、±2 …，很容易猜錯一顆）
   · 指定顏色的顆數 c 在 N/K 的 0.5~1.6 倍之間（至少 2 顆），所以不會每次都是最少的那個顏色。
   · 有 3 次機會，答錯 / 超時扣 1 次。成績＝答對幾題。答完會把糖果再亮出來，
     指定顏色的糖果圈起來，讓你知道正確答案是怎麼數的。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'candy';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 20;
    var N_START = 10, N_END = 100;
    var K_START = 2, K_END = 5;
    var SHOW_START = 2000, SHOW_END = 15000;         /* 閃現時間（毫秒） */
    var GAP_START = 3, GAP_END = 1;
    var LIVES = 1;
    var ANSWER_S = 8;                              /* 蓋住後的作答時限（秒） */
    var PREP_MS = 1300;                            /* 告知顏色後多久閃現 */
    var REVEAL_MS = 1800;                          /* 答完揭曉停留 */
    var R = 21;                                    /* 糖果大小（半徑，邏輯 px） */
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
            gap: Math.round(kit.ramp(level, GAP_START, GAP_END, LEVEL_RAMP))
        };
    }
    /* 出題：回傳 { n, k, colors:[顏色索引], counts:[每色顆數], target(顏色索引), answer, options:[4 個], showMs } */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        var p = paramsFor(level);
        var colors = kit.shuffle(COLORS.map(function (_, i) { return i; }), rand).slice(0, p.k);
        var target = kit.pick(colors, rand);
        var avg = p.n / p.k;
        var lo = Math.max(2, Math.round(avg * 0.5)), hi = Math.max(lo, Math.round(avg * 1.6));
        var c = kit.randInt(lo, hi, rand);
        /* 其他顏色分剩下的：每色至少 1 顆，其餘隨機分配 */
        var rest = p.n - c, others = colors.filter(function (x) { return x !== target; });
        var counts = {};
        others.forEach(function (x) { counts[x] = 1; });
        rest -= others.length;
        while (rest > 0) { counts[kit.pick(others, rand)]++; rest--; }
        counts[target] = c;
        /* 四個選項：正確答案 ± gap 的倍數 */
        var cand = [-3, -2, -1, 1, 2, 3].map(function (k) { return c + k * p.gap; }).filter(function (v) { return v >= 1 && v !== c; });
        var near = kit.shuffle(cand, rand).sort(function (a, b) { return Math.abs(a - c) - Math.abs(b - c); }).slice(0, 4);
        var options = kit.shuffle([c].concat(kit.shuffle(near, rand).slice(0, 3)), rand);
        return { n: p.n, k: p.k, colors: colors, counts: counts, target: target, answer: c, options: options, showMs: p.showMs, gap: p.gap };
    }
    /* 糖果在托盤上的位置：互不重疊。放不下就整個重排（最多 8 次），保證不重疊 */
    function scatter(n, W, Hh, rand) {
        rand = rand || Math.random;
        var minD = R * 2 + 3, best = null;
        for (var attempt = 0; attempt < 8; attempt++) {
            var out = [], failed = false;
            for (var i = 0; i < n && !failed; i++) {
                var p = null;
                for (var t = 0; t < 400 && !p; t++) {
                    var x = R + 6 + rand() * (W - 2 * R - 12), y = R + 6 + rand() * (Hh - 2 * R - 12);
                    var ok = true;
                    for (var j = 0; j < out.length; j++) {
                        var dx = out[j].x - x, dy = out[j].y - y;
                        if (dx * dx + dy * dy < minD * minD) { ok = false; break; }
                    }
                    if (ok) p = { x: x, y: y, rot: rand() * 180 };
                }
                if (p) out.push(p); else failed = true;
            }
            if (!failed) return out;
            best = out;
        }
        /* 真的排不下（托盤太小）：剩下的隨便放，容許重疊 */
        while (best.length < n) best.push({ x: R + rand() * (W - 2 * R), y: R + rand() * (Hh - 2 * R), rot: rand() * 180 });
        return best;
    }

    function drawCandy(parent, x, y, rot, col, cls) {
        var g = kit.svg('g', { 'class': 'cd-candy' + (cls ? ' ' + cls : ''), transform: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot.toFixed(0) + ')' }, parent);
        /* 糖紙兩端的蝴蝶結 */
        kit.svg('polygon', { points: (-R * 0.55) + ',0 ' + (-R * 1.05) + ',' + (-R * 0.5) + ' ' + (-R * 1.05) + ',' + (R * 0.5), fill: col.fill, stroke: col.dark, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
        kit.svg('polygon', { points: (R * 0.55) + ',0 ' + (R * 1.05) + ',' + (-R * 0.5) + ' ' + (R * 1.05) + ',' + (R * 0.5), fill: col.fill, stroke: col.dark, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
        kit.svg('ellipse', { rx: R * 0.78, ry: R * 0.62, fill: col.fill, stroke: col.dark, 'stroke-width': 2.5 }, g);
        kit.svg('ellipse', { cx: -R * 0.2, cy: -R * 0.22, rx: R * 0.3, ry: R * 0.16, fill: 'rgba(255,255,255,0.55)' }, g);
        return g;
    }

    function mount(root, ctx) {
        var R_ = null;

        function round() {
            if (R_) R_.dispose();
            R_ = kit.round();
            var my = R_;
            root.innerHTML = '';
            var level = 1, right = 0, lives = LIVES, newRec = false, state = 'idle';
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
                /* 糖果清單：依各色顆數展開再洗牌，配合 scatter 的位置 */
                var list = [];
                Q.colors.forEach(function (c) { for (var i = 0; i < Q.counts[c]; i++) list.push(c); });
                list = kit.shuffle(list);
                var pos = scatter(list.length, W, Hh);
                list.forEach(function (c, i) {
                    var g = drawCandy(svg, pos[i].x, pos[i].y, pos[i].rot, COLORS[c]);
                    if (markTarget && c === Q.target) {
                        kit.svg('circle', { r: R * 1.35, fill: 'none', stroke: '#2B2B2B', 'stroke-width': 3, 'stroke-dasharray': '5 4' }, g);
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
                level++;
                setHead(); meta();
                if (lives <= 0) {
                    my.after(REVEAL_MS + 400, function () {
                        kit.result(root, {
                            num: right + ' 題', label: '機會用完了', lines: ['一共出了 ' + (level - 1) + ' 題，答對 ' + right + ' 題'],
                            isNew: newRec, sfx: right >= 8 ? 'win' : 'fail', onAgain: round
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

        round();
    }

    var G = {
        id: ID,
        name: '幾顆糖',
        rule: '先告訴你要數哪一種顏色的糖果，接著一堆糖果會閃一下就蓋起來，憑感覺選出那個顏色有幾顆。越後面糖果越多、閃得越快，選項也越接近。有 3 次機會，答對越多越厲害！',
        mount: mount,
        test: { paramsFor: paramsFor, makeQuestion: makeQuestion, scatter: scatter, COLORS: COLORS, R: R, LEVEL_RAMP: LEVEL_RAMP }
    };
    Reaction.register(G);
})();
