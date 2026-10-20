/* ═══════════════════════════════════════════════════════════════════
   reaction_seesaw.js — 秒反應・蹺蹺板比重（企劃 257，依使用者的修改改成「拖動物配平衡」）
   公園的蹺蹺板。**一開始動物們就已經坐在蹺蹺板上**（左右各幾隻，板子是歪的）。玩家要**把動物拖到另外一邊**，
   直到蹺蹺板**平衡**（兩邊的總重量一樣）。
   ───────────────────────────────────────────────────────────────────
   · 動物的重量（1～W 的整數）是藏起來的，跟動物的大小無關。可以「量」出來：
     蹺蹺板的傾斜角 = 重量差 × TILT_PER_UNIT（度），最多傾斜 TILT_MAX 度；
     **平衡的計算是持續的**——玩家把某隻動物拖離蹺蹺板，板子就馬上開始傾斜（有彈簧的動畫）；放回去（放到板子的左半或右半）又重新計算、再演一次，
     直到兩邊一樣重。所以拿起一隻動物看傾斜角變化了多少，就知道牠有多重（變化 ÷ TILT_PER_UNIT ＝ 牠的重量）。
   · 一定有解：出題（makeLevel）保證「存在一種左右分法讓兩邊一樣重」，而且從現在這個分法到平衡，**最少要搬 MOVES 隻**（minMoves 窮舉 2^n 種分法算出），
     第 1 關只要搬 1 隻、後面要搬 2～3 隻；初始的重量差不超過 DIFF_MAX（傾斜角才不會超過上限而量不出來）。
   · 難度（線性）：動物 3 → 7 隻（ANIMALS）、重量上限 3 → 9（WEIGHT_MAX）、最少要搬的隻數 1 → 3（MOVES）、限時 60 → 30 秒（TIME_S）。
   · 過關：所有動物都坐在板上（沒有被拿在手上）、兩邊重量一樣、板子靜止，就過關；動物們都笑了。限時內沒平衡：把每隻的重量標出來，並指出該搬哪幾隻。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'seesaw';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 24;                       /* 幾關之後難度到頂 */
    var ANIMALS = [3, 7];                       /* 動物隻數：第 1 關 → 到頂 */
    var WEIGHT_MAX = [3, 9];                    /* 動物重量上限（1～W）：第 1 關 → 到頂 */
    var MOVES = [1, 3];                         /* 從初始分法到平衡「最少要搬幾隻」的上限：第 1 關 → 到頂（下限是 1 → 2） */
    var MOVES_MIN = [1, 2];
    var TIME_S = [60, 30];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var TILT_PER_UNIT = 3, TILT_MAX = 36;       /* 每差 1 單位重量，蹺蹺板傾斜幾度；最多傾斜幾度 */
    var DIFF_MAX = TILT_MAX / TILT_PER_UNIT;    /* 初始重量差上限（再大傾斜角就卡在上限、量不出來） */
    var SPRING = { omega: 9, zeta: 0.5 };       /* 蹺蹺板傾斜的彈簧動畫：角頻率、阻尼比（小於 1 會有一點彈跳） */
    var SETTLE_MS = 350;                        /* 平衡之後要靜止多久才算過關 */
    var SEAT_NEAR = 52, SEAT_FAR = 188;         /* 動物座位離支點的距離範圍（px） */
    var MAX_LEVEL = 60;
    var SPECIES = [                             /* 動物（id 對應 CSS 的 .sea-an--id 與 theme 的毛色變數） */
        { id: 'bear', name: '熊' }, { id: 'pig', name: '豬' }, { id: 'dog', name: '狗' }, { id: 'cat', name: '貓' },
        { id: 'rabbit', name: '兔' }, { id: 'chick', name: '雞' }, { id: 'panda', name: '貓熊' }
    ];
    var LEFT = -1, RIGHT = 1;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return Math.round(kit.ramp(level, pair[0], pair[1], RAMP_LEVELS)); }
    function nFor(level) { return ramp(level, ANIMALS); }
    function weightMaxFor(level) { return ramp(level, WEIGHT_MAX); }
    function movesRange(level) { return [ramp(level, MOVES_MIN), ramp(level, MOVES)]; }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    /* 兩邊的重量：sides[i] 是 LEFT（−1）或 RIGHT（1）或 0（被拿在手上，不算） */
    function sumsOf(weights, sides) {
        var l = 0, r = 0;
        for (var i = 0; i < weights.length; i++) { if (sides[i] === LEFT) l += weights[i]; else if (sides[i] === RIGHT) r += weights[i]; }
        return { l: l, r: r };
    }
    /* 蹺蹺板的目標傾斜角（度，CSS rotate 順時針為正）：左邊重 → 左邊下沉 → 逆時針 → 負角度 */
    function angleFor(diffLR) { return -kit.clamp(TILT_PER_UNIT * diffLR, -TILT_MAX, TILT_MAX); }
    /* 窮舉 2^n 種分法，找離現在的分法最近的「平衡分法」：{ moves（要搬幾隻）, sides（平衡後的分法）, move（要搬的動物編號） }；沒有平衡分法回傳 null */
    function minMoves(weights, sides) {
        var n = weights.length, best = null;
        for (var mask = 0; mask < (1 << n); mask++) {
            var l = 0, r = 0, mv = [], i;
            for (i = 0; i < n; i++) {
                var side = (mask >> i) & 1 ? RIGHT : LEFT;
                if (side === LEFT) l += weights[i]; else r += weights[i];
                if (side !== sides[i]) mv.push(i);
            }
            if (l !== r || l === 0) continue;
            if (!best || mv.length < best.moves) {
                var target = []; for (i = 0; i < n; i++) target.push((mask >> i) & 1 ? RIGHT : LEFT);
                best = { moves: mv.length, sides: target, move: mv };
            }
        }
        return best;
    }
    /* 某一邊有 c 隻動物時，第 i 隻（從靠近支點算起）離支點的距離（px）：平均分布在 SEAT_NEAR～SEAT_FAR */
    function seatDist(i, c) { return c <= 1 ? (SEAT_NEAR + SEAT_FAR) / 2 : SEAT_NEAR + (SEAT_FAR - SEAT_NEAR) * i / (c - 1); }
    /* 出一關：{ n, kinds（動物編號，對應 SPECIES）, weights, sides（初始分法）, diff（初始重量差，左 − 右）, best（minMoves 的結果）, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = nFor(level), W = weightMaxFor(level), mr = movesRange(level);
        for (var tr = 0; tr < 5000; tr++) {
            var weights = [], sum = 0, i;
            for (i = 0; i < n; i++) { var w = kit.randInt(1, W, rand); weights.push(w); sum += w; }
            if (sum % 2 || weights.every(function (x) { return x === weights[0]; })) continue;
            var sides = []; for (i = 0; i < n; i++) sides.push(rand() < 0.5 ? LEFT : RIGHT);
            var s = sumsOf(weights, sides), diff = s.l - s.r, cl = sides.filter(function (x) { return x === LEFT; }).length;
            if (cl === 0 || cl === n || Math.abs(diff) < 2 || Math.abs(diff) > DIFF_MAX) continue;
            var best = minMoves(weights, sides);
            if (!best || best.moves < mr[0] || best.moves > mr[1]) continue;
            var kinds = kit.shuffle(SPECIES.map(function (sp, k) { return k; }), rand).slice(0, n);
            return { n: n, kinds: kinds, weights: weights, sides: sides, diff: diff, best: best, level: level };
        }
        /* 保底：熊 2、豬 1、狗 3；熊和狗在左、豬在右（搬 2 隻） */
        var fw = [2, 3, 1], fs = [LEFT, LEFT, RIGHT];
        return { n: 3, kinds: [0, 2, 1], weights: fw, sides: fs, diff: 4, best: minMoves(fw, fs), level: level };
    }
    function rating(n) {
        if (n >= 25) return '蹺蹺板大師！';
        if (n >= 15) return '量得很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '拿起一隻看傾斜多少，就知道牠多重！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'sea-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 動物的臉（SVG）：毛色由 CSS 的 .sea-an--種類 決定；不同動物的耳朵、鼻子不一樣 */
    function animalSvg(id) {
        var s = kit.svg('svg', { 'class': 'sea-face', viewBox: '0 0 60 60', width: 60, height: 60 });
        function el(tag, attrs, cls) { attrs['class'] = cls; return kit.svg(tag, attrs, s); }
        /* 耳朵（畫在臉後面） */
        if (id === 'bear' || id === 'panda') { el('circle', { cx: 13, cy: 17, r: 8 }, 'sea-ear' + (id === 'panda' ? ' sea-ear--dark' : '')); el('circle', { cx: 47, cy: 17, r: 8 }, 'sea-ear' + (id === 'panda' ? ' sea-ear--dark' : '')); }
        if (id === 'pig' || id === 'cat') { el('path', { d: 'M9 24 L13 6 L26 16 Z' }, 'sea-ear'); el('path', { d: 'M51 24 L47 6 L34 16 Z' }, 'sea-ear'); }
        if (id === 'dog') { el('ellipse', { cx: 11, cy: 30, rx: 7, ry: 14 }, 'sea-ear sea-ear--dark2'); el('ellipse', { cx: 49, cy: 30, rx: 7, ry: 14 }, 'sea-ear sea-ear--dark2'); }
        if (id === 'rabbit') { el('ellipse', { cx: 21, cy: 11, rx: 6, ry: 15 }, 'sea-ear'); el('ellipse', { cx: 39, cy: 11, rx: 6, ry: 15 }, 'sea-ear'); }
        if (id === 'chick') { el('path', { d: 'M30 10 Q26 2 22 6 Q27 6 28 12 Z M30 10 Q34 2 38 6 Q33 6 32 12 Z' }, 'sea-ear'); }
        el('circle', { cx: 30, cy: 35, r: 21 }, 'sea-head');
        if (id === 'panda') { el('ellipse', { cx: 22, cy: 32, rx: 5, ry: 7 }, 'sea-patch'); el('ellipse', { cx: 38, cy: 32, rx: 5, ry: 7 }, 'sea-patch'); }
        el('circle', { cx: 22, cy: 32, r: 2.8 }, 'sea-eye'); el('circle', { cx: 38, cy: 32, r: 2.8 }, 'sea-eye');
        if (id === 'pig') { el('ellipse', { cx: 30, cy: 42, rx: 8, ry: 6 }, 'sea-snout'); el('circle', { cx: 27, cy: 42, r: 1.4 }, 'sea-eye'); el('circle', { cx: 33, cy: 42, r: 1.4 }, 'sea-eye'); }
        else if (id === 'chick') el('path', { d: 'M25 40 L35 40 L30 47 Z' }, 'sea-beak');
        else if (id === 'cat') { el('path', { d: 'M26 40 L34 40 L30 44 Z' }, 'sea-nose'); el('path', { d: 'M8 38 L19 40 M8 44 L19 43 M52 38 L41 40 M52 44 L41 43' }, 'sea-whisker'); }
        else { el('ellipse', { cx: 30, cy: 41, rx: 4, ry: 3 }, 'sea-nose'); }
        el('path', { d: 'M24 48 Q30 51 36 48' }, 'sea-mouth');                  /* 平常的嘴（一條淡淡的線） */
        el('path', { d: 'M22 46 Q30 56 38 46' }, 'sea-smile');                  /* 平衡時的笑（平常是藏起來的） */
        return s;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), n = q.n, weights = q.weights, sides = q.sides.slice();
        api.info = q;
        console.log('[蹺蹺板比重] 第 ' + level + ' 關：' + n + ' 隻動物 ' + q.kinds.map(function (k, i) { return SPECIES[k].name + weights[i]; }).join('、') + '；初始左 ' + sumsOf(weights, sides).l + '／右 ' + sumsOf(weights, sides).r + '（差 ' + q.diff + '）；最少搬 ' + q.best.moves + ' 隻；限時 ' + timeMs(level) + ' ms');

        var field = h('div', { 'class': 'sea-field' });                  /* 這一關專用的容器：所有東西和事件監聽都放在裡面，換關時整個丟掉 */
        var W = stage.clientWidth || 472, PL = Math.min(W - 24, 420), PX = W / 2, PY = 360, AN = n >= 6 ? 50 : (n >= 5 ? 56 : 62);          /* 動物越多，圖越小（才不會疊太多） */
        stage.appendChild(field);
        field.appendChild(h('div', { 'class': 'qz-note sea-tip', text: '把動物拖到另一邊，讓蹺蹺板平衡' }));
        var pivot = h('div', { 'class': 'sea-pivot' });
        pivot.style.cssText = 'left:' + (PX - 40) + 'px;top:' + (PY + 6) + 'px;';
        field.appendChild(pivot);
        var board = h('div', { 'class': 'sea-board' });
        board.style.cssText = 'left:' + (PX - PL / 2) + 'px;top:' + (PY - 8) + 'px;width:' + PL + 'px;';
        field.appendChild(board);
        var info = h('div', { 'class': 'qz-note sea-info', text: '' });
        info.style.top = (PY + 110) + 'px';
        field.appendChild(info);

        /* 動物們 */
        var els = [], badges = [];
        q.kinds.forEach(function (k, i) {
            var sp = SPECIES[k], el = h('div', { 'class': 'sea-an sea-an--' + sp.id });
            el.style.width = el.style.height = AN + 'px';
            el.setAttribute('data-i', String(i));                                 /* 第幾隻（測試用） */
            el.appendChild(animalSvg(sp.id));
            var badge = h('div', { 'class': 'sea-badge', text: String(weights[i]) });
            badge.style.display = 'none'; el.appendChild(badge);
            els.push(el); badges.push(badge);
            kit.onTap(el, function (e) { startDrag(i, e); });
        });
        /* 放回板子上（對 side 這一邊重新排座位） */
        function seat(animate) {
            [LEFT, RIGHT].forEach(function (side) {
                var idx = []; for (var i = 0; i < n; i++) if (sides[i] === side) idx.push(i);
                /* 重的靠近支點？不排序，維持放進去的順序（先來的靠近支點） */
                idx.forEach(function (i, j) {
                    var d = seatDist(j, idx.length), el = els[i];
                    if (el.parentNode !== board) board.appendChild(el);
                    el.style.left = (PL / 2 + side * d - AN / 2) + 'px';
                    el.style.zIndex = String(10 - j);
                });
            });
        }
        seat();
        var lastSide = q.sides.slice();                                          /* 每隻動物上一次坐的那一邊（放到板子外面時回去） */
        var held = -1, drag = null, over = false, angle = 0, vel = 0, settle = 0, won = false;
        function target() { var s = sumsOf(weights, sides); return angleFor(s.l - s.r); }
        angle = target(); board.style.transform = 'rotate(' + angle.toFixed(3) + 'deg)';
        api.my.loop(function (now, dt) {
            if (!board.isConnected) return false;                                /* 換關了（板子已經被丟掉）：迴圈停止 */
            var d = Math.min(dt, 50) / 1000, tgt = target();
            /* 彈簧：加速度 = −ω²(角度 − 目標) − 2ζω × 角速度 */
            vel += (-SPRING.omega * SPRING.omega * (angle - tgt) - 2 * SPRING.zeta * SPRING.omega * vel) * d;
            angle += vel * d;
            board.style.transform = 'rotate(' + angle.toFixed(3) + 'deg)';
            /* 平衡而且靜止一小段時間 → 過關 */
            var s = sumsOf(weights, sides);
            if (!won && !over && held < 0 && s.l === s.r && Math.abs(angle) < 0.4 && Math.abs(vel) < 2) { settle += d * 1000; if (settle >= SETTLE_MS) win(); } else settle = 0;
        });
        api.timer(timeMs(level), function () { timeout(); });
        if (level === 1 && kit.once('seesaw.hint')) {
            var mv = q.best.move[0], to = q.best.sides[mv] === LEFT ? PX - 110 : PX + 110;                 /* 提示：拖到「平衡後那一邊」 */
            api.after(0, function () { kit.hintOn(stage, els[mv], { mode: 'drag', to: { x: to, y: PY - 40 }, delay: 700, text: '把動物拖到另一邊' }); });
        }

        function startDrag(i, e) {
            if (drag || over || won) return;
            var p = kit.localPt(e, field);
            try { field.setPointerCapture(e.pointerId); } catch (err) { }
            drag = { i: i, id: e.pointerId };
            lastSide[i] = sides[i]; held = i; sides[i] = 0;                                              /* 離開板子：不算在任何一邊，板子馬上重新計算、開始傾斜 */
            var el = els[i]; field.appendChild(el); el.classList.add('sea-an--held'); el.style.zIndex = '50';
            moveHeld(p);
            seat();
            info.textContent = '';
        }
        function moveHeld(p) { var el = els[drag.i]; el.style.left = (p.x - AN / 2) + 'px'; el.style.top = (p.y - AN / 2) + 'px'; el.style.bottom = 'auto'; }
        field.addEventListener('pointermove', function (e) { if (drag && e.pointerId === drag.id) moveHeld(kit.localPt(e, field)); });
        function drop(e) {
            if (!drag || e.pointerId !== drag.id) return;
            var i = drag.i, p = kit.localPt(e, field), el = els[i];
            drag = null; held = -1; el.classList.remove('sea-an--held'); el.style.top = ''; el.style.bottom = '';
            var onBoard = p.x > PX - PL / 2 - 30 && p.x < PX + PL / 2 + 30 && p.y > PY - 150 && p.y < PY + 70;
            sides[i] = onBoard ? (p.x < PX ? LEFT : RIGHT) : lastSide[i];                  /* 放到板子外面：回到原來那一邊 */
            lastSide[i] = sides[i];
            seat();
            el.classList.remove('sea-an--drop'); void el.offsetWidth; el.classList.add('sea-an--drop');                 /* 坐上去有一點彈跳 */
            Sfx.play('pop');
        }
        field.addEventListener('pointerup', drop);
        field.addEventListener('pointercancel', drop);

        function showWeights() { badges.forEach(function (b) { b.style.display = ''; }); }
        function win() {
            if (won || api.over) return;
            won = true; stage.classList.add('sea-happy'); showWeights();
            var s = sumsOf(weights, sides);
            info.textContent = '兩邊都是 ' + s.l + '，平衡了！';
            kit.flash(stage, true, api.my);
            api.pass({ delay: 1800 });
        }
        function timeout() {
            if (won || api.over) return;
            over = true;
            if (drag) { var i0 = drag.i; drag = null; held = -1; els[i0].classList.remove('sea-an--held'); els[i0].style.top = ''; els[i0].style.bottom = ''; sides[i0] = lastSide[i0] || LEFT; }
            seat(); showWeights();
            /* 指出該搬哪幾隻：從現在的分法找最近的平衡分法 */
            var cur = sides.map(function (s, i) { return s || lastSide[i] || LEFT; }), best = minMoves(weights, cur);
            if (best) best.move.forEach(function (i) { els[i].classList.add('sea-an--move'); });
            var names = best ? best.move.map(function (i) { return SPECIES[q.kinds[i]].name + '（' + weights[i] + '）'; }).join('、') : '';
            info.textContent = best ? '時間到！把 ' + names + ' 搬到另一邊就平衡了' : '時間到！';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3400, lines: ['時間到！蹺蹺板還沒平衡', best ? '各動物的重量已標出來，搬 ' + names + ' 到另一邊就平衡了' : ''] });
        }
        api.solve = function () { for (var i = 0; i < n; i++) { sides[i] = q.best.sides[i]; lastSide[i] = sides[i]; } seat(); };
        api.wrong = function () { timeout(); };
    }

    var G = {
        id: ID,
        name: '蹺蹺板比重',
        rule: '蹺蹺板上一開始就坐著幾隻動物，板子是歪的。**把動物拖到另一邊，讓兩邊一樣重**，蹺蹺板就平衡了。動物有多重是藏起來的，跟牠長得多大無關，但**蹺蹺板會告訴你**：把一隻動物拖離板子，板子馬上跟著傾斜；**傾斜角變化越多，那隻就越重**。在時間內讓蹺蹺板平衡就過關，看你能過幾關。越後面，動物越多、越重！',
        mount: mount,
        score: SCORE,
        test: {
            nFor: nFor, weightMaxFor: weightMaxFor, movesRange: movesRange, timeMs: timeMs, sumsOf: sumsOf, angleFor: angleFor, minMoves: minMoves, seatDist: seatDist, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ANIMALS: ANIMALS, WEIGHT_MAX: WEIGHT_MAX, MOVES: MOVES, MOVES_MIN: MOVES_MIN, TIME_S: TIME_S, TILT_PER_UNIT: TILT_PER_UNIT, TILT_MAX: TILT_MAX, DIFF_MAX: DIFF_MAX,
            SPRING: SPRING, SETTLE_MS: SETTLE_MS, SEAT_NEAR: SEAT_NEAR, SEAT_FAR: SEAT_FAR, SPECIES: SPECIES, LEFT: LEFT, RIGHT: RIGHT, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
