/* ═══════════════════════════════════════════════════════════════════
   reaction_slicechar.js — 秒反應・切字（企劃 341）
   上方寫著目標字「己」。一個一個「寫著字的湯圓」像水果一樣拋上來，**只切「己」**，其他的字不要切。切錯、或漏掉一個「己」就結束。
   ───────────────────────────────────────────────────────────────────
   · 拋上來的其他字全是共用字庫（SimilarChars）裡目標字的**形近字**（己 → 已、巳、巴…），字在空中旋轉。
   · 出題（makeLevel）：挑一個字群（平均筆劃落在這一關的範圍內），其中一個字當目標、其餘當干擾。一共拋 F 顆，約 TARGET_FRAC 是目標字；
     一次拋 1～batchMax 顆（越後面一次拋越多，同一批的橫向位置彼此拉開）。
   · 飛行：每顆從畫面下方拋出，走拋物線（高度、飛行時間、橫向速度不同；flightPos／landTime），掉回畫面下方就算落地。
   · 切：手指在畫面上拖過湯圓（走過的線段碰到它的圓，segHitsCircle）。切到干擾字 → 馬上結束；目標字落地沒切 → 結束；所有字都處理完（切了或落地了）就過關。
   · 難度（線性）：拋出的字 8 → 30 顆（TOTAL）、間隔 1000 → 420 毫秒（SPAWN_MS）、一次拋 1 → 3 顆（BATCH）、字群的平均筆劃 3～8 → 12～22（STROKES）。
   · 結束時：把你切錯（或漏掉）的字和目標字並排，**差異的筆畫標紅**（兩個字用畫布畫出來比對像素）；切開時湯圓裂成兩半、字也裂成兩半。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'slicechar';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TOTAL = [8, 30];                        /* 這一關拋出的字總數：第 1 關 → 到頂 */
    var SPAWN_MS = [1000, 420];                 /* 每一批拋出的間隔（毫秒）：第 1 關 → 到頂 */
    var BATCH = [1, 3];                         /* 一次最多拋幾顆：第 1 關 → 到頂 */
    var TARGET_FRAC = 0.4;                      /* 拋出的字裡，目標字佔幾成 */
    var STROKES_LO = [3, 12], STROKES_HI = [8, 22];     /* 字群的平均筆劃範圍：第 1 關 → 到頂 */
    var LEAD_MS = 900;                          /* 開始後多久拋第一批 */
    var BOTTOM = 1.1, EXIT = 1.14;              /* 拋出的起點、掉到這裡算落地（畫面高度的倍數） */
    var APEX = [0.2, 0.5], T_APEX = [0.8, 1.0], X_RANGE = [0.14, 0.86];
    var DUMP_PX = 76;                           /* 湯圓的大小（px） */
    var HIT_EXTRA = 8;                          /* 切到的判定半徑比湯圓多幾 px */
    var MIN_GROUP = 4;
    var MAX_LEVEL = 90;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function totalFor(level) { return Math.round(ramp(level, TOTAL)); }
    function spawnMsFor(level) { return Math.round(ramp(level, SPAWN_MS)); }
    function batchMaxFor(level) { return Math.max(1, Math.round(ramp(level, BATCH))); }
    function strokeRange(level) { return [ramp(level, STROKES_LO), ramp(level, STROKES_HI)]; }
    function flightPos(tz, t) { var g = 2 * (BOTTOM - tz.ya) / (tz.ta * tz.ta), vy0 = -g * tz.ta; return { x: tz.x0 + tz.vx * t, y: BOTTOM + vy0 * t + g * t * t / 2 }; }
    function landTime(tz) { var g = 2 * (BOTTOM - tz.ya) / (tz.ta * tz.ta), vy0 = -g * tz.ta, c = BOTTOM - EXIT; return (-vy0 + Math.sqrt(vy0 * vy0 - 2 * g * c)) / g; }
    function segHitsCircle(ax, ay, bx, by, cx, cy, r) {
        var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 < 1e-12 ? 0 : kit.clamp(((cx - ax) * dx + (cy - ay) * dy) / l2, 0, 1);
        return Math.hypot(ax + t * dx - cx, ay + t * dy - cy) <= r;
    }
    /* 出一關：{ target, mates（干擾字候選）, group, total, tosses（[{ t, ch, onTarget, x0, vx, ya, ta, spin }]）, spawnMs, strokes, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var rg = strokeRange(level), pool = SimilarChars.groups({ minSize: MIN_GROUP, minStrokes: rg[0], maxStrokes: rg[1] });
        if (!pool.length) pool = SimilarChars.groups({ minSize: MIN_GROUP });
        var g = kit.pick(pool, rand), target = kit.pick(g.chars, rand), mates = g.chars.filter(function (c) { return c !== target; });
        var F = totalFor(level), nT = Math.max(3, Math.round(F * TARGET_FRAC)), list = [], i;
        for (i = 0; i < nT; i++) list.push({ ch: target, onTarget: true });
        for (i = nT; i < F; i++) list.push({ ch: mates[(i - nT) % mates.length], onTarget: false });
        list = kit.shuffle(list, rand);
        var spawn = spawnMsFor(level), bmax = batchMaxFor(level), t = LEAD_MS, tosses = [], idx = 0;
        while (idx < list.length) {
            var b = Math.min(list.length - idx, kit.randInt(1, bmax, rand)), xs = [];
            for (i = 0; i < b; i++) {
                var x0 = kit.randFloat(X_RANGE[0], X_RANGE[1], rand), guard = 0;
                while (xs.some(function (x) { return Math.abs(x - x0) < 0.2; }) && guard++ < 30) x0 = kit.randFloat(X_RANGE[0], X_RANGE[1], rand);
                xs.push(x0);
                var it = list[idx++];
                tosses.push({ t: Math.round(t + i * 140), ch: it.ch, onTarget: it.onTarget, x0: x0, vx: (0.5 - x0) * kit.randFloat(0.05, 0.3, rand), ya: kit.randFloat(APEX[0], APEX[1], rand), ta: kit.randFloat(T_APEX[0], T_APEX[1], rand), spin: kit.randFloat(-220, 220, rand) });
            }
            t += spawn * b * kit.randFloat(0.85, 1.15, rand);                       /* 一次拋越多顆，下一批隔越久（整體密度才不會爆掉） */
        }
        return { target: target, mates: mates, group: g.chars, total: F, tosses: tosses, spawnMs: spawn, batchMax: bmax, strokes: rg, level: level };
    }
    /* 兩個字的筆畫差異（像素比對）畫在 canvas 上：兩個字都有的筆畫是墨色、只有一個有的塗紅 */
    function drawDiff(canvas, a, b, size) {
        var ctx = canvas.getContext('2d'); if (!ctx) return null;
        canvas.width = canvas.height = size;
        function mask(ch) { var c = document.createElement('canvas'); c.width = c.height = size; var x = c.getContext('2d'); x.fillStyle = '#000'; x.font = '900 ' + Math.round(size * 0.82) + 'px "Noto Serif TC","Songti TC","PMingLiU",serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, size / 2, size / 2 + size * 0.04); return x.getImageData(0, 0, size, size).data; }
        var da = mask(a), db = mask(b), out = ctx.createImageData(size, size), o = out.data, diff = 0;
        for (var i = 0; i < size * size; i++) {
            var ia = da[i * 4 + 3] > 100, ib = db[i * 4 + 3] > 100;
            if (ia && ib) { o[i * 4] = 74; o[i * 4 + 1] = 59; o[i * 4 + 2] = 30; o[i * 4 + 3] = 255; }
            else if (ia || ib) { diff++; o[i * 4] = 226; o[i * 4 + 1] = 64; o[i * 4 + 2] = 48; o[i * 4 + 3] = 255; }
        }
        ctx.putImageData(out, 0, 0);
        return { diff: diff };
    }
    function rating(n) {
        if (n >= 15) return '切字高手！';
        if (n >= 10) return '眼明手快！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '只切一模一樣的那個字！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'scc-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), F = q.total;
        api.info = q;
        console.log('[切字] 第 ' + level + ' 關：目標「' + q.target + '」，干擾 ' + q.mates.join('') + '；拋 ' + F + ' 顆（目標 ' + q.tosses.filter(function (t) { return t.onTarget; }).length + ' 顆），一批最多 ' + q.batchMax + ' 顆，間隔約 ' + q.spawnMs + ' 毫秒');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'scc-field' });
        stage.appendChild(field);
        var goal = h('div', { 'class': 'scc-goal' }, [h('span', { 'class': 'scc-goal__t', text: '只切：' }), h('span', { 'class': 'scc-goal__ch', text: q.target })]);
        field.appendChild(goal);
        var counter = h('div', { 'class': 'scc-counter', text: '0／' + F }); field.appendChild(counter);
        var info = h('div', { 'class': 'qz-note scc-info', text: '' }); field.appendChild(info);
        var arena = h('div', { 'class': 'scc-arena' }); field.appendChild(arena);

        var resolved = 0, flying = [], halted = false, lastP = null, down = false, over = false;
        q.tosses.forEach(function (tz) { api.after(tz.t, function () { launch(tz); }); });
        if (level === 1 && kit.once('slicechar.hint')) api.after(LEAD_MS + 600, function () { if (!over) kit.hintOn(stage, null, { mode: 'drag', x: W * 0.3, y: H * 0.55, dx: W * 0.4, dy: -40, text: '只切目標字' }); });
        function launch(tz) {
            if (halted || api.over) return;
            var el = h('div', { 'class': 'scc-dump' }, [h('div', { 'class': 'scc-dump__ch', text: tz.ch })]);
            el.style.width = el.style.height = DUMP_PX + 'px'; el.style.lineHeight = DUMP_PX + 'px'; el.firstChild.style.fontSize = Math.round(DUMP_PX * 0.66) + 'px';
            arena.appendChild(el);
            flying.push({ tz: tz, el: el, t: 0, cut: false, lt: landTime(tz) });
        }
        api.my.loop(function (now, dt) {
            if (!arena.isConnected) return false;
            if (halted) return;
            var d = Math.min(dt, 50) / 1000;
            for (var i = flying.length - 1; i >= 0; i--) {
                var f = flying[i]; if (f.cut) continue;
                f.t += d;
                var p = flightPos(f.tz, f.t);
                f.px = p.x * W; f.py = p.y * H;
                f.el.style.transform = 'translate(' + (f.px - DUMP_PX / 2).toFixed(1) + 'px,' + (f.py - DUMP_PX / 2).toFixed(1) + 'px) rotate(' + (f.tz.spin * f.t).toFixed(1) + 'deg)';
                if (f.t >= f.lt) {
                    flying.splice(i, 1); f.el.remove();
                    if (f.tz.onTarget) { missed(f); return; }
                    resolve();
                }
            }
        });
        function resolve() {
            resolved++; counter.textContent = resolved + '／' + F;
            if (resolved >= F && !over) { over = true; info.textContent = '全部處理完了！'; kit.flash(stage, true, api.my); api.pass({ delay: 1100 }); }
        }
        arena.addEventListener('pointerdown', function (e) { if (over) return; e.preventDefault(); try { arena.setPointerCapture(e.pointerId); } catch (err) { } var p = kit.localPt(e, arena); lastP = p; down = true; sliceSeg(p, p); });
        arena.addEventListener('pointermove', function (e) { if (!down || over) return; var p = kit.localPt(e, arena); sliceSeg(lastP, p); lastP = p; });
        function endDrag() { down = false; lastP = null; }
        arena.addEventListener('pointerup', endDrag); arena.addEventListener('pointercancel', endDrag);
        function sliceSeg(a, b) {
            for (var i = flying.length - 1; i >= 0 && !over; i--) {
                var f = flying[i]; if (f.cut || f.px == null) continue;
                if (segHitsCircle(a.x, a.y, b.x, b.y, f.px, f.py, DUMP_PX / 2 + HIT_EXTRA)) cut(f, i, a, b);
            }
        }
        /* 切開：湯圓裂成兩半、字也裂成兩半；切到干擾字 → 結束 */
        function cut(f, idx, a, b) {
            f.cut = true; flying.splice(idx, 1);
            var el = f.el;
            [['left', -1], ['right', 1]].forEach(function (half) {
                var c = el.cloneNode(true); c.className = 'scc-half scc-half--' + half[0]; c.style.transform = el.style.transform; c.style.setProperty('--dir', half[1]);
                arena.appendChild(c); api.after(650, function () { c.remove(); });
            });
            el.remove(); Sfx.play('pop');
            if (!f.tz.onTarget) { wrong(f); return; }
            resolve();
        }
        /* 失敗：停住畫面，把目標字和你切錯（漏掉）的字並排，差異的筆畫標紅 */
        function compare(badCh, missedFlag) {
            halted = true; over = true;
            var box = h('div', { 'class': 'scc-cmp' });
            var l = h('div', { 'class': 'scc-cmp__box' }, [h('div', { 'class': 'scc-cmp__t', text: '目標字' }), h('div', { 'class': 'scc-cmp__big', text: q.target })]);
            box.appendChild(l);
            if (!missedFlag) {
                var cv = h('canvas', { 'class': 'scc-cmp__cv' }), r = h('div', { 'class': 'scc-cmp__box scc-cmp__box--bad' }, [h('div', { 'class': 'scc-cmp__t', text: '你切了（紅＝差異）' }), cv]);
                box.appendChild(r); field.appendChild(box); try { drawDiff(cv, q.target, badCh, 150); } catch (err) { }
            } else { box.appendChild(h('div', { 'class': 'scc-cmp__box scc-cmp__box--bad' }, [h('div', { 'class': 'scc-cmp__t', text: '漏掉了' }), h('div', { 'class': 'scc-cmp__big', text: q.target })])); field.appendChild(box); }
        }
        function wrong(f) {
            info.textContent = '「' + f.tz.ch + '」不是目標字「' + q.target + '」！';
            compare(f.tz.ch, false); kit.flash(stage, false, api.my);
            api.fail({ delay: 3600, lines: ['你切了「' + f.tz.ch + '」，目標字是「' + q.target + '」', '形近字：' + q.group.join('、')] });
        }
        function missed(f) {
            info.textContent = '漏掉了一個「' + q.target + '」！';
            compare(null, true); kit.flash(stage, false, api.my);
            api.fail({ delay: 3400, lines: ['漏掉了一個目標字「' + q.target + '」', '形近字：' + q.group.join('、')] });
        }
        /* 驗證用（會被重複呼叫，要冪等）：solve＝切掉所有在空中的目標字、wrong＝切第一個在空中的干擾字 */
        api.solve = function () {
            if (over) return;
            for (var i = flying.length - 1; i >= 0; i--) { var f = flying[i]; if (f.tz.onTarget && !f.cut && f.px != null) cut(f, i, { x: f.px - 20, y: f.py }, { x: f.px + 20, y: f.py }); }
        };
        api.wrong = function () {
            if (over) return;
            for (var i = flying.length - 1; i >= 0; i--) { var f = flying[i]; if (!f.tz.onTarget && !f.cut && f.px != null) { cut(f, i, { x: f.px - 20, y: f.py }, { x: f.px + 20, y: f.py }); return; } }
        };
    }

    var G = {
        id: ID,
        name: '切字',
        rule: '上方寫著目標字。一個一個寫著字的湯圓像水果一樣拋上來，**用手指切過去，只切目標字**，其他的字不要切。**切錯一顆**、或**漏掉一顆目標字**，就結束。小心：拋上來的其他字全是目標字的形近字（像「己」配「已、巳、巴」），字在空中還會旋轉。結束時會把你切錯的字和目標字並排，**不一樣的筆畫標紅**。越後面，一次拋上來的字越多、筆劃越多、拋得越快！',
        mount: mount,
        score: SCORE,
        test: {
            totalFor: totalFor, spawnMsFor: spawnMsFor, batchMaxFor: batchMaxFor, strokeRange: strokeRange, flightPos: flightPos, landTime: landTime, segHitsCircle: segHitsCircle, makeLevel: makeLevel, drawDiff: drawDiff, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, TOTAL: TOTAL, SPAWN_MS: SPAWN_MS, BATCH: BATCH, TARGET_FRAC: TARGET_FRAC, STROKES_LO: STROKES_LO, STROKES_HI: STROKES_HI, LEAD_MS: LEAD_MS, BOTTOM: BOTTOM, EXIT: EXIT, APEX: APEX, T_APEX: T_APEX, X_RANGE: X_RANGE, DUMP_PX: DUMP_PX, MIN_GROUP: MIN_GROUP, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
