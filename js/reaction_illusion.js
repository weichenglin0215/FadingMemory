/* ═══════════════════════════════════════════════════════════════════
   reaction_illusion.js — 秒反應・錯覺大師
   兩個圖形比一比，哪個比較長／大／亮？眼睛會騙人，看你能不能不被騙。
   ───────────────────────────────────────────────────────────────────
   · 五種經典錯覺，全部用 SVG 依參數畫出（長度、半徑、灰階都是精確的數值，所以
     「真實差距」才準）：
       muller    繆勒－萊爾：兩條線哪條長（箭尾向外的那條看起來比較長）
       ebbinghaus 艾賓豪斯：中間哪個圓大（被小圓圍著的看起來比較大）
       ponzo     龐佐：鐵軌上的兩條橫線哪條長（靠遠處的上面那條看起來比較長）
       vh        垂直水平：倒 T 的兩條線哪條長（垂直那條看起來比較長）
       contrast  同時對比：兩個灰方塊哪個亮（放在深色底上的看起來比較亮）
   · 每題的「錯覺方向」和「真相」有時一致（錯覺幫忙）、有時相反（錯覺陷阱）；陷阱比例隨
     關卡線性提高（TRAP_START → TRAP_END）。真實差距 Δ 也線性縮小。
   · 答完立刻揭曉真相（畫出對齊的輔助線、寫出數字）1 秒多，答錯或超時就結束。
     成績＝連續答對題數（越多越好）。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'illusion';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var DELTA_START = 0.15, DELTA_END = 0.02;     /* 真實差距（相對比例）：第 1 關 → LEVEL_RAMP 關 */
    var TRAP_START = 0.2, TRAP_END = 0.8;         /* 錯覺陷阱的比例 */
    var TIME_START = 4.0, TIME_END = 2.5;         /* 每題限時（秒） */
    var LEVEL_RAMP = 20;
    var REVEAL_MS = 1500;       /* 答完後揭曉真相停多久 */
    var KINDS = ['muller', 'ebbinghaus', 'ponzo', 'vh', 'contrast'];

    function fmtBest(v) { return v == null ? '' : '最佳連對 ' + v; }

    /* ═══ 出題（純函式，也給 Node 測試用）═══
       回傳：{ kind, delta, help, big(較大／較亮那個選項的編號 0 或 1), q0, q1(兩個選項的真實數量), ... } */
    function makeQuestion(level, rand, avoidKind, forceKind) {
        rand = rand || Math.random;
        var delta = kit.ramp(level, DELTA_START, DELTA_END, LEVEL_RAMP);
        var trap = kit.ramp(level, TRAP_START, TRAP_END, LEVEL_RAMP);
        var help = rand() >= trap;
        var pool = KINDS.filter(function (k) { return k !== avoidKind; });
        var kind = forceKind || pool[Math.floor(rand() * pool.length)];
        var q = { kind: kind, delta: delta, help: help };
        /* big：真實數量比較大的那個選項。ponzo／vh／contrast 的錯覺方向跟「位置」綁死
           （上面／垂直／深色底那一個看起來比較大），所以由 help 決定；
           muller／ebbinghaus 的錯覺方向跟「圖案樣式」綁，位置可以隨機。 */
        if (kind === 'ponzo' || kind === 'vh' || kind === 'contrast') q.big = help ? 0 : 1;
        else q.big = rand() < 0.5 ? 0 : 1;
        var base = kind === 'ebbinghaus' ? 40 : (kind === 'contrast' ? 120 : 200);
        if (kind === 'ponzo') base = 96;
        if (kind === 'muller') base = 250;
        q.base = base;
        /* 較小的是 base，較大的是 base × (1 + Δ)；contrast 用灰階差：Δ × 255 */
        if (kind === 'contrast') {
            var gap = Math.round(delta * 255);
            var lo = Math.round(kit.randFloat(95, 150, rand));
            q.v = [0, 0];
            q.v[q.big] = lo + gap; q.v[1 - q.big] = lo;
        } else {
            q.v = [0, 0];
            q.v[q.big] = base * (1 + delta); q.v[1 - q.big] = base;
        }
        q.time = kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP);
        return q;
    }
    /* 兩個選項真實數量差了多少 %（相對較小的那個） */
    function realPct(q) {
        var a = q.v[q.big], b = q.v[1 - q.big];
        return (a - b) / b * 100;
    }

    /* ═══ 畫題目：每一種錯覺一個函式，回傳 { hits:[選項0的點擊區, 選項1的點擊區], guides(g) } ═══ */
    var DRAW = {};

    function hitRect(svg, x, y, w, hh) {
        return kit.svg('rect', { 'class': 'il-hit', x: x, y: y, width: w, height: hh, rx: 18 }, svg);
    }

    /* 繆勒－萊爾：選項 0＝上面那條、1＝下面那條 */
    DRAW.muller = function (svg, FW, FH, q) {
        var cx = FW / 2, ys = [FH * 0.32, FH * 0.68], hits = [], fin = 36;
        for (var i = 0; i < 2; i++) {
            var L = q.v[i], isBig = i === q.big;
            /* 錯覺幫忙：較長的那條用箭尾（向外，看起來更長）；陷阱：較長的那條用箭頭（向內，看起來更短） */
            var tail = q.help ? isBig : !isBig;
            var x1 = cx - L / 2, x2 = cx + L / 2, y = ys[i];
            kit.svg('line', { 'class': 'il-line', x1: x1, y1: y, x2: x2, y2: y }, svg);
            [[x1, -1], [x2, 1]].forEach(function (e) {
                var dir = tail ? 1 : -1;     /* tail：翼往外；arrow：翼往內 */
                [-1, 1].forEach(function (s) {
                    kit.svg('line', { 'class': 'il-line', x1: e[0], y1: y, x2: e[0] + e[1] * dir * fin, y2: y + s * fin }, svg);
                });
            });
            hits.push(hitRect(svg, cx - L / 2 - fin - 10, y - 62, L + fin * 2 + 20, 124));
        }
        return {
            hits: hits,
            guides: function (g) {
                var small = 1 - q.big, L = q.v[small];
                [cx - L / 2, cx + L / 2].forEach(function (x) { kit.svg('line', { 'class': 'il-guide', x1: x, y1: ys[0] - 50, x2: x, y2: ys[1] + 50 }, g); });
            }
        };
    };

    /* 艾賓豪斯：選項 0＝左邊、1＝右邊 */
    DRAW.ebbinghaus = function (svg, FW, FH, q) {
        var cy = FH * 0.5, xs = [FW * 0.27, FW * 0.73], hits = [];
        for (var i = 0; i < 2; i++) {
            var r = q.v[i], isBig = i === q.big;
            /* 錯覺幫忙：較大的圓被小圓圍著（看起來更大）；陷阱：較大的圓被大圓圍著 */
            var smallSurround = q.help ? isBig : !isBig;
            var sr = smallSurround ? 9 : 25, d = r + sr + (smallSurround ? 12 : 9);
            for (var k = 0; k < 6; k++) {
                var a = k * Math.PI / 3 + (i ? Math.PI / 6 : 0);
                kit.svg('circle', { 'class': 'il-surround', cx: xs[i] + d * Math.cos(a), cy: cy + d * Math.sin(a), r: sr }, svg);
            }
            kit.svg('circle', { 'class': 'il-center', cx: xs[i], cy: cy, r: r }, svg);
            hits.push(kit.svg('circle', { 'class': 'il-hit', cx: xs[i], cy: cy, r: 105 }, svg));
        }
        return {
            hits: hits,
            guides: function (g) {
                for (var i = 0; i < 2; i++) kit.svg('circle', { 'class': 'il-guide', cx: xs[i], cy: cy, r: q.v[q.big], fill: 'none' }, g);
            }
        };
    };

    /* 龐佐：選項 0＝上面那條橫線、1＝下面那條 */
    DRAW.ponzo = function (svg, FW, FH, q) {
        var cx = FW / 2, yTop = FH * 0.1, yBot = FH * 0.92;
        var wTop = 40, wBot = 130;     /* 鐵軌在最上／最下的半寬 */
        [-1, 1].forEach(function (s) {
            kit.svg('line', { 'class': 'il-rail', x1: cx + s * wBot, y1: yBot, x2: cx + s * wTop, y2: yTop }, svg);
        });
        for (var k = 0; k < 7; k++) {      /* 枕木，增加透視感 */
            var t = k / 6, y = yBot - (yBot - yTop) * (0.04 + 0.96 * t);
            var w = wBot - (wBot - wTop) * ((yBot - y) / (yBot - yTop));
            kit.svg('line', { 'class': 'il-tie', x1: cx - w - 14, y1: y, x2: cx + w + 14, y2: y }, svg);
        }
        var ys = [FH * 0.3, FH * 0.7], hits = [];
        for (var i = 0; i < 2; i++) {
            var L = q.v[i];
            kit.svg('line', { 'class': 'il-bar', x1: cx - L / 2, y1: ys[i], x2: cx + L / 2, y2: ys[i] }, svg);
            hits.push(hitRect(svg, cx - 120, ys[i] - 55, 240, 110));
        }
        return {
            hits: hits,
            guides: function (g) {
                var L = q.v[1 - q.big];
                [cx - L / 2, cx + L / 2].forEach(function (x) { kit.svg('line', { 'class': 'il-guide', x1: x, y1: ys[0] - 45, x2: x, y2: ys[1] + 45 }, g); });
            }
        };
    };

    /* 垂直水平：倒 T。選項 0＝垂直線、1＝水平線 */
    DRAW.vh = function (svg, FW, FH, q) {
        var cx = FW / 2, baseY = FH * 0.74;
        var V = q.v[0], H = q.v[1];
        kit.svg('line', { 'class': 'il-bar', x1: cx - H / 2, y1: baseY, x2: cx + H / 2, y2: baseY }, svg);
        kit.svg('line', { 'class': 'il-bar', x1: cx, y1: baseY, x2: cx, y2: baseY - V }, svg);
        var hits = [hitRect(svg, cx - 34, baseY - V - 20, 68, V + 20 - 38), hitRect(svg, cx - H / 2 - 12, baseY - 34, H + 24, 68)];
        return { hits: hits, guides: function () { } };
    };

    /* 同時對比：選項 0＝深色底上的方塊（左）、1＝淺色底上的方塊（右） */
    DRAW.contrast = function (svg, FW, FH, q) {
        var half = FW / 2, side = 120, cy = FH * 0.5, hits = [];
        kit.svg('rect', { x: 0, y: 0, width: half, height: FH, fill: '#2B2B2B' }, svg);
        kit.svg('rect', { x: half, y: 0, width: half, height: FH, fill: '#EDEDED' }, svg);
        for (var i = 0; i < 2; i++) {
            var gv = q.v[i], cxi = half * (i + 0.5);
            kit.svg('rect', { x: cxi - side / 2, y: cy - side / 2, width: side, height: side, fill: 'rgb(' + gv + ',' + gv + ',' + gv + ')' }, svg);
            hits.push(hitRect(svg, cxi - side / 2 - 30, cy - side / 2 - 30, side + 60, side + 60));
        }
        return { hits: hits, guides: function () { } };
    };

    var QTEXT = {
        muller: '哪一條線比較長？', ponzo: '哪一條橫線比較長？', vh: '哪一條線比較長？',
        ebbinghaus: '中間哪個圓比較大？', contrast: '哪一個方塊比較亮？'
    };
    var NAMES = {
        muller: ['上面那條', '下面那條'], ponzo: ['上面那條', '下面那條'], vh: ['垂直的那條', '水平的那條'],
        ebbinghaus: ['左邊的圓', '右邊的圓'], contrast: ['左邊的方塊', '右邊的方塊']
    };

    function mount(root, ctx) {
        var R = null;
        var newRec = false;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            newRec = false;
            var streak = 0, lastKind = null;
            var bar = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = bar.firstChild;
            var hint = h('div', { 'class': 'il-q', text: '' });
            var field = h('div', { 'class': 'il-field' });
            root.appendChild(hint);
            root.appendChild(field);
            root.appendChild(bar);
            var FW = field.clientWidth, FH = field.clientHeight;

            function meta() { ctx.setMeta(kit.meta(['連對 ' + streak, fmtBest(Reaction.getBest(ID))])); }
            meta();

            function ask() {
                if (my.dead) return;
                field.innerHTML = '';
                var level = streak + 1;
                var q = makeQuestion(level, null, lastKind, G.dev.kind);
                if (G.dev.time) q.time = G.dev.time;
                lastKind = q.kind;
                var svg = kit.svg('svg', { 'class': 'il-svg', viewBox: '0 0 ' + FW + ' ' + FH, preserveAspectRatio: 'none' }, field);
                var d = DRAW[q.kind](svg, FW, FH, q);
                var gGuides = kit.svg('g', {}, svg);
                hint.textContent = QTEXT[q.kind];
                var answered = false;
                var t0 = performance.now(), limit = q.time * 1000;
                var loop = my.loop(function (now) {
                    if (answered) return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - t0) / limit)).toFixed(1) + '%';
                });
                var timer = my.after(limit, function () { if (!answered) answer(-1); });

                function answer(idx) {
                    if (answered) return;
                    answered = true;
                    my.cancel(timer); loop.stop();
                    fill.style.width = '0%';
                    var ok = idx === q.big;
                    d.hits.forEach(function (el, i) {
                        if (i === q.big) el.classList.add('il-hit--ok');
                        else if (i === idx) el.classList.add('il-hit--bad');
                    });
                    d.guides(gGuides);
                    var pct = realPct(q);
                    var what = q.kind === 'contrast' ? '亮' : (q.kind === 'ebbinghaus' ? '大' : '長');
                    var truth = (idx === -1 ? '時間到！' : (ok ? '答對了！' : '答錯了…')) + ' 其實是「' + NAMES[q.kind][q.big] + '」比較' + what +
                        (q.kind === 'contrast' ? '（灰階 ' + q.v[q.big] + ' 對 ' + q.v[1 - q.big] + '）' : '（多了 ' + pct.toFixed(1) + '%）') +
                        (q.help ? '' : '　（錯覺陷阱）');
                    hint.textContent = truth;
                    if (ok) {
                        streak++;
                        Sfx.play('ok');
                        if (Reaction.setBest(ID, streak, function (v, b) { return v > b; })) newRec = true;
                        meta();
                        my.after(G.dev.reveal || REVEAL_MS, ask);
                    } else {
                        Sfx.play('bad');
                        my.after(REVEAL_MS + 300, function () {
                            kit.result(root, {
                                num: streak + ' 題', label: idx === -1 ? '時間到了' : '被錯覺騙到了',
                                note: truth,
                                isNew: newRec, sfx: streak >= 8 ? 'win' : 'fail', onAgain: round
                            });
                        });
                    }
                }
                d.hits.forEach(function (el, i) {
                    el.addEventListener('pointerdown', function (e) { e.preventDefault(); answer(i); });
                });
                G.debug = { q: q, answer: answer, streak: function () { return streak; } };
            }

            my.after(500, ask);
        }

        round();
    }

    var G = {
        id: ID,
        name: '錯覺大師',
        rule: '兩個圖形比一比，哪個比較長、比較大、比較亮？眼睛會騙人！有時候錯覺會幫你，有時候剛好相反，而且真正的差距會越來越小。答完立刻揭曉真相，連對越多越好。',
        mount: mount,
        dev: { kind: null, time: null, reveal: null },      /* 開發驗證用：強制題型／限時，正式遊戲不會設定 */
        test: { makeQuestion: makeQuestion, realPct: realPct, KINDS: KINDS, TRAP_END: TRAP_END }
    };
    Reaction.register(G);
})();
