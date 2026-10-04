/* ═══════════════════════════════════════════════════════════════════
   reaction_cake.js — 秒反應・分蛋糕
   圓形蛋糕要平分給幾個人。蛋糕上已經有切線了，用手指「拖曳」每一條切線的位置，讓每一塊都一樣大；
   調好按「切下去」。關卡挑戰：一關比一關分給更多人。
   ───────────────────────────────────────────────────────────────────
   · 第 1 關分 3 個人，每關 +1 人（最多 N_MAX 人）。蛋糕上有 n 條切線：橘色那一條是固定的（第一刀），
     其他 n−1 條是藍色的，起點是「平均分好的位置」加上一個隨機偏移（偏移最多是一塊角度的 JITTER 倍），
     而且一定不會一開始就已經過關。
   · 拖曳：手指按在蛋糕上，抓住「角度最接近手指」的那條藍線，之後這條線就一直指向手指的方向（繞著圓心轉），
     放手就停在那裡。圓周上 12 個小點是輔助刻度（透明度 100% → 0%，第 1 → AID_FADE_LEVELS 關線性，之後完全沒有）。
   · 角度從 12 點鐘方向起、順時針算（0°～360°）。把 n 條切線依角度排序，相鄰兩條的夾角就是各塊的圓心角
     （面積比例＝角度比例）。
   · 過關標準：**最大塊與最小塊的面積差，要小於平均面積的 PASS_RATIO（15%）**。
     例：切成 5 塊，平均每塊 20%，標準就是 20% 的 15% ＝ 3%（總面積），最大塊 − 最小塊 ≤ 3% 才過關。
   · 有 LIVES 次機會：沒過關扣 1 次，同一關換一個新的起始位置再試；成績＝通過的關數（越多越好）；
     失敗後可以從「失敗關卡 − 5」繼續。
   · 結算：蛋糕切塊往外散開，每塊標出占整個蛋糕的 %，最大塊、最小塊用顏色標示，並寫出差距與標準。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'cake';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var N_START = 3, N_MAX = 12;                /* 第 1 關分幾個人、最多分幾個人 */
    var PASS_RATIO = 0.15;                      /* 最大塊 − 最小塊 ≤ 平均面積 × 這個比例 才過關 */
    var JITTER = 0.4;                           /* 起始偏移：最多是一塊角度的幾倍 */
    var AID_FADE_LEVELS = 4;                    /* 輔助刻度在第幾關完全消失 */
    var LIVES = 3;
    var PICK_MAX_DEG = 40;                      /* 抓線時，手指方向離最近的藍線超過這麼多度就不抓（避免誤觸）*/
    var DEAD_PX = 28;                           /* 離圓心太近的點不理 */
    var R_CAKE = 190, VB = 460, C = VB / 2;
    var NEXT_MS = 3000;

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function nFor(level) { return Math.min(N_MAX, N_START + level - 1); }
    function aidOpacity(level) { return kit.clamp(1 - (level - 1) / (AID_FADE_LEVELS - 1), 0, 1); }
    function norm360(a) { return ((a % 360) + 360) % 360; }
    /* 螢幕座標 (dx, dy)（y 往下）→ 12 點鐘起、順時針的角度 */
    function angleOf(dx, dy) { return norm360(Math.atan2(dx, -dy) * 180 / Math.PI); }
    /* 各塊的圓心角（度）：cuts 是所有刀線的角度（含第一刀），回傳排序後相鄰的夾角 */
    function sliceAngles(cuts) {
        var s = cuts.map(norm360).sort(function (a, b) { return a - b; }), out = [];
        for (var i = 0; i < s.length; i++) out.push(i + 1 < s.length ? s[i + 1] - s[i] : s[0] + 360 - s[i]);
        return out;
    }
    /* 最大塊與最小塊的差，占「平均一塊」的比例（0.15＝15%）*/
    function spreadRatio(angles) {
        var mx = Math.max.apply(null, angles), mn = Math.min.apply(null, angles), avg = 360 / angles.length;
        return (mx - mn) / avg;
    }
    function passes(angles) { return spreadRatio(angles) <= PASS_RATIO + 1e-9; }
    /* 過關標準：最大塊 − 最小塊 最多是整個蛋糕的幾 %（例如 5 塊 → 3%）*/
    function tolerancePct(n) { return 100 / n * PASS_RATIO; }
    /* 把角度最接近 target 的那一個編號找出來（環狀距離），只在 idxs 裡找；超過 maxDeg 回傳 −1 */
    function nearestIndex(angles, idxs, target, maxDeg) {
        var best = -1, bd = 1e9;
        idxs.forEach(function (i) { var d = Math.abs(((angles[i] - target + 540) % 360) - 180); if (d < bd) { bd = d; best = i; } });
        return bd <= maxDeg ? best : -1;
    }
    /* 起始切線：第一刀隨機；其他 n−1 條＝平均分好的位置＋隨機偏移；起始一定不會已經過關（至少是標準的 2 倍以上）*/
    function makeStart(level, rand) {
        rand = rand || Math.random;
        var n = nFor(level), step = 360 / n;
        for (var tries = 0; tries < 400; tries++) {
            var first = rand() * 360, lines = [];
            for (var i = 1; i < n; i++) lines.push(norm360(first + i * step + kit.randFloat(-JITTER, JITTER, rand) * step));
            if (spreadRatio(sliceAngles([first].concat(lines))) >= PASS_RATIO * 2) return { n: n, first: first, lines: lines };
        }
        return { n: n, first: 0, lines: Array.apply(null, Array(n - 1)).map(function (_, i) { return norm360((i + 1) * step + (i % 2 ? 1 : -1) * 0.35 * step); }) };
    }
    function rating(level) {
        if (level >= 10) return '神級刀工！';
        if (level >= 6) return '刀工很準！';
        if (level >= 3) return '切得不錯！';
        return '再試一次，會更準！';
    }

    function sectorPath(a0, a1, r) {
        function pt(a) { var t = a * Math.PI / 180; return (C + r * Math.sin(t)).toFixed(2) + ' ' + (C - r * Math.cos(t)).toFixed(2); }
        var large = (a1 - a0) > 180 ? 1 : 0;
        return 'M' + C + ' ' + C + ' L' + pt(a0) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + pt(a1) + ' Z';
    }

    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var level = startAt || 1, cleared = level - 1, lives = LIVES, newRec = false, state = 'idle';
            var st = null, first = 0, lines = [], drag = -1, lineEls = [], handleEls = [];
            var head = h('div', { 'class': 'ca-head', text: ' ' });
            var banner = h('div', { 'class': 'ca-banner', text: ' ' });
            var field = h('div', { 'class': 'ca-field' });
            var cutBtn = h('button', { 'class': 'btn btn--go btn--sm ca-cut', text: '切下去' });
            var acts = h('div', { 'class': 'ca-acts' }, [cutBtn]);
            [head, banner, field, acts].forEach(function (x) { root.appendChild(x); });
            function meta() { ctx.setMeta(kit.meta(['已過 ' + cleared + ' 關', '機會 ' + lives])); }
            var svg = kit.svg('svg', { 'class': 'ca-svg', viewBox: '0 0 ' + VB + ' ' + VB }, field);
            var gCake = kit.svg('g', {}, svg);
            var gAid = kit.svg('g', {}, svg), gCuts = kit.svg('g', {}, svg), gOut = kit.svg('g', {}, svg);
            kit.svg('circle', { 'class': 'ca-cake', cx: C, cy: C, r: R_CAKE }, gCake);
            kit.svg('circle', { 'class': 'ca-icing', cx: C, cy: C, r: R_CAKE - 16 }, gCake);
            for (var i = 0; i < 12; i++) {
                var a = i * 30 * Math.PI / 180;
                kit.svg('circle', { 'class': 'ca-aid', cx: C + (R_CAKE + 4) * Math.sin(a), cy: C - (R_CAKE + 4) * Math.cos(a), r: 4.5 }, gAid);
            }
            kit.svg('circle', { 'class': 'ca-center', cx: C, cy: C, r: 8 }, svg);

            function tip(a, r) { var t = a * Math.PI / 180; return [C + r * Math.sin(t), C - r * Math.cos(t)]; }
            function buildLines() {
                gCuts.innerHTML = ''; lineEls = []; handleEls = [];
                var p = tip(first, R_CAKE);
                kit.svg('line', { 'class': 'ca-cutline ca-cutline--first', x1: C, y1: C, x2: p[0], y2: p[1] }, gCuts);
                lines.forEach(function () {
                    lineEls.push(kit.svg('line', { 'class': 'ca-cutline', x1: C, y1: C, x2: C, y2: C }, gCuts));
                    handleEls.push(kit.svg('circle', { 'class': 'ca-handle', r: 13, cx: C, cy: C }, gCuts));
                });
                paintLines();
            }
            function paintLines() {
                lines.forEach(function (a, i) {
                    var p = tip(a, R_CAKE), q = tip(a, R_CAKE + 2);
                    lineEls[i].setAttribute('x2', p[0].toFixed(1)); lineEls[i].setAttribute('y2', p[1].toFixed(1));
                    handleEls[i].setAttribute('cx', q[0].toFixed(1)); handleEls[i].setAttribute('cy', q[1].toFixed(1));
                    lineEls[i].setAttribute('class', 'ca-cutline' + (i === drag ? ' ca-cutline--drag' : ''));
                    handleEls[i].setAttribute('class', 'ca-handle' + (i === drag ? ' ca-handle--drag' : ''));
                });
            }

            function startLevel() {
                if (my.dead) return;
                st = makeStart(level);
                first = st.first; lines = st.lines.slice(); drag = -1; state = 'play';
                gOut.innerHTML = ''; gCake.style.display = ''; gCuts.style.display = '';
                gAid.setAttribute('opacity', aidOpacity(level).toFixed(2));
                head.textContent = '第 ' + level + ' 關　分給 ' + st.n + ' 個人';
                banner.textContent = '拖曳藍線，差 ≤ ' + tolerancePct(st.n).toFixed(1) + '% 就過關';
                acts.style.visibility = 'visible'; cutBtn.disabled = false;
                buildLines(); meta();
                try { console.info('[分蛋糕] 第 ' + level + ' 關：' + st.n + ' 個人、第一刀 ' + first.toFixed(1) + '°；標準 ' + (PASS_RATIO * 100).toFixed(0) + '%＝每塊差距最多 ' + tolerancePct(st.n).toFixed(2) + '% 的蛋糕（' + (360 * PASS_RATIO / st.n).toFixed(2) + '°）；起始差距 ' + (spreadRatio(sliceAngles([first].concat(lines))) * 100).toFixed(0) + '% 平均塊；輔助刻度透明度 ' + aidOpacity(level).toFixed(2)); } catch (e) { }
            }

            /* ─── 拖曳 ─── */
            function angleFromEvent(e) {
                var rc = svg.getBoundingClientRect(), sc = rc.width / VB;
                var dx = e.clientX - (rc.left + rc.width / 2), dy = e.clientY - (rc.top + rc.height / 2);
                if (Math.sqrt(dx * dx + dy * dy) < DEAD_PX * sc) return null;
                return angleOf(dx, dy);
            }
            function grab(angle) {
                var idxs = lines.map(function (_, i) { return i; });
                return nearestIndex(lines, idxs, angle, PICK_MAX_DEG);
            }
            var dragPid = null;
            field.addEventListener('pointerdown', function (e) {
                if (state !== 'play' || dragPid != null) return;
                var a = angleFromEvent(e); if (a == null) return;
                var k = grab(a); if (k < 0) return;
                e.preventDefault();
                try { field.setPointerCapture(e.pointerId); } catch (err) { }
                dragPid = e.pointerId; drag = k;
                lines[k] = a; paintLines(); Sfx.play('click');
            });
            field.addEventListener('pointermove', function (e) {
                if (state !== 'play' || drag < 0 || e.pointerId !== dragPid) return;
                var a = angleFromEvent(e); if (a == null) return;
                lines[drag] = a; paintLines();
            });
            function endDrag(e) { if (dragPid != null && e.pointerId === dragPid) { dragPid = null; drag = -1; paintLines(); } }
            field.addEventListener('pointerup', endDrag);
            field.addEventListener('pointercancel', endDrag);
            cutBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); submit(); });

            function submit() {
                if (state !== 'play') return;
                state = 'reveal'; drag = -1; dragPid = null;
                acts.style.visibility = 'hidden';
                var all = [first].concat(lines).map(norm360).sort(function (a, b) { return a - b; });
                var angs = sliceAngles(all), n = angs.length, ok = passes(angs);
                var mx = Math.max.apply(null, angs), mn = Math.min.apply(null, angs);
                var diffPct = (mx - mn) / 360 * 100;
                Sfx.play('pop');
                gCuts.style.display = 'none'; gCake.style.display = 'none';
                for (var i = 0; i < n; i++) {
                    var a0 = all[i], a1 = a0 + angs[i], mid = (a0 + angs[i] / 2) * Math.PI / 180;
                    var g = kit.svg('g', { 'class': 'ca-slice' }, gOut);
                    var cls = 'ca-slice__p' + (Math.abs(angs[i] - mx) < 1e-9 ? ' ca-slice__p--max' : (Math.abs(angs[i] - mn) < 1e-9 ? ' ca-slice__p--min' : ''));
                    kit.svg('path', { 'class': cls, d: sectorPath(a0, a1, R_CAKE - 2) }, g);
                    var tx = C + (R_CAKE * (n > 8 ? 0.7 : 0.62)) * Math.sin(mid), ty = C - (R_CAKE * (n > 8 ? 0.7 : 0.62)) * Math.cos(mid);
                    var t = kit.svg('text', { 'class': 'ca-slice__t' + (n > 8 ? ' ca-slice__t--sm' : ''), x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
                    t.textContent = (angs[i] / 360 * 100).toFixed(1) + '%';
                    var out = 14;
                    g.style.transform = 'translate(' + (out * Math.sin(mid)).toFixed(1) + 'px,' + (-out * Math.cos(mid)).toFixed(1) + 'px)';
                }
                banner.textContent = '最大 ' + (mx / 3.6).toFixed(1) + '％ − 最小 ' + (mn / 3.6).toFixed(1) + '％ ＝ ' + diffPct.toFixed(2) + '％（標準 ≤ ' + tolerancePct(n).toFixed(2) + '％）';
                if (ok) {
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    head.textContent = '第 ' + level + ' 關　過關！';
                    Sfx.play('win'); level++; meta();
                    my.after(NEXT_MS, startLevel);
                    return;
                }
                lives--; meta();
                head.textContent = '第 ' + level + ' 關　差太多了';
                Sfx.play('bad');
                if (lives > 0) { my.after(NEXT_MS, startLevel); return; }
                var failLevel = level, back = kit.resumeFrom(failLevel);
                my.after(NEXT_MS, function () {
                    kit.result(root, {
                        num: cleared + ' 關', label: rating(cleared),
                        lines: ['第 ' + failLevel + ' 關（分 ' + n + ' 塊）最大塊比最小塊多 ' + diffPct.toFixed(2) + '%', '標準是 ' + tolerancePct(n).toFixed(2) + '%（平均一塊的 15%）'],
                        isNew: newRec, sfx: cleared >= 3 ? 'win' : 'fail',
                        onAgain: function () { round(1); },
                        resume: { level: back, run: function () { round(back); } }
                    });
                });
            }

            G.debug = {
                state: function () { return { level: level, state: state, lives: lives, cleared: cleared, n: st && st.n, first: first, lines: lines.slice(), spread: spreadRatio(sliceAngles([first].concat(lines))) }; },
                /* 把藍線放到「平均分好」的位置（可加上 jitter 度的誤差）*/
                perfect: function (jitter) { var n = st.n; for (var i = 1; i < n; i++) lines[i - 1] = norm360(first + i * 360 / n + (jitter || 0) * (i % 2 ? 1 : -1)); paintLines(); return lines.slice(); },
                submit: submit,
                drag: function (k, angle) { lines[k] = norm360(angle); paintLines(); }
            };
            my.after(300, startLevel);
        }

        round(1);
    }

    var G = {
        id: ID,
        name: '分蛋糕',
        rule: '蛋糕要平分給幾個人。蛋糕上有切線，橘色那條固定不動，用手指拖曳藍色的線，讓每一塊都一樣大，調好按「切下去」。最大塊和最小塊的差距要小於平均一塊的 15% 才過關，一關比一關分給更多人！',
        mount: mount,
        test: { nFor: nFor, aidOpacity: aidOpacity, norm360: norm360, angleOf: angleOf, sliceAngles: sliceAngles, spreadRatio: spreadRatio, passes: passes, tolerancePct: tolerancePct, nearestIndex: nearestIndex, makeStart: makeStart, rating: rating, N_START: N_START, N_MAX: N_MAX, PASS_RATIO: PASS_RATIO, JITTER: JITTER, PICK_MAX_DEG: PICK_MAX_DEG }
    };
    Reaction.register(G);
})();
