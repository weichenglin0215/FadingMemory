/* ═══════════════════════════════════════════════════════════════════
   reaction_stackup.js — 秒反應・重心疊疊樂（原企劃「002 重心落點」的復活版）
   上方出現一個方塊（長方形、梯形或三角形），下方的橫桿可以左右拖曳決定它落下的位置，
   按「放下」就會筆直掉下去；方塊必須「平穩」地擺在地板或其他方塊上面。
   傾斜（重心超出支撐）、滑掉（落在斜面或尖端）、頂到天花板，都算失敗。
   關卡制：一關放一個方塊，成績＝成功疊了幾塊（越多越好）。
   ───────────────────────────────────────────────────────────────────
   【物理規則（不是真的物理引擎，是一套簡單、固定、看得懂的判定）】
   座標：x 由左到右（px），y 由地板往上算（地板＝0）。每個方塊是一個「底邊水平」的形狀，
   用 {kind, x0, w, y0, h} 表示：左下角 x0、底寬 w、底部高度 y0、高度 h。
     · rect 長方形：頂面水平，寬 w。
     · trap 梯形：底寬 w、頂寬 w×TRAP_TOP（預設一半），頂面水平。
     · tri 三角形：底寬 w，頂端是一個尖點。
   1. 落地高度：方塊的底邊會停在「它底下所有東西頂面的最高點」。
   2. 接觸範圍：底邊上、高度跟落地高度差不到 EPS 的那些位置（可能一段，也可能只有一個點）；
      接觸範圍的「最左～最右」叫支撐範圍。
   3. 站得住：支撐範圍寬度至少 MIN_CONTACT（落在斜面或尖點上＝滑掉），而且
      「它自己加上壓在它上面的所有方塊」的重心（x）要落在支撐範圍裡，否則傾倒。
      重量＝面積；上面的重量依接觸寬度分給它底下的各個方塊，作用點取「重心夾到那一段接觸範圍裡」的位置。
   4. 疊上去之後，整座塔從上往下逐塊檢查（因為新方塊可能把下面某一塊壓倒）。
   5. 頂到畫面最上緣（超過 ZONE_H）也算失敗。
   【難度（隨關卡線性）】前 2 關只有長方形；第 3 關起出現梯形（機率 0 → 30%）；
   第 6 關起出現三角形（5% → 25%）。方塊寬度＝畫面寬的 1/6～1/2，高度固定 BLOCK_H。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'stackup';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 塊', label: '疊了幾塊', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var MAX_LEVEL = 60;                 /* 疊滿幾塊算全破 */
    var BLOCK_H = 56;                   /* 方塊高度（固定，px） */
    var W_MIN_RATIO = 1 / 6, W_MAX_RATIO = 1 / 2;      /* 方塊寬度佔畫面寬的比例範圍 */
    var TRAP_TOP = 0.5;                 /* 梯形的頂寬是底寬的幾倍 */
    var EPS = 2;                        /* 兩個高度差在這個值以內算「一樣高」（接觸）（px） */
    var MIN_CONTACT = 8;                /* 支撐範圍至少要多寬，不然算落在尖點或斜面上、會滑掉（px） */
    var TOL = 0.5;                      /* 重心超出支撐範圍多少以內還算站得住（px） */
    var TRAP_FROM = 3, TRAP_P = [0, 0.3], TRAP_RAMP = 12;   /* 梯形：第幾關起、機率範圍、幾關升到頂 */
    var TRI_FROM = 6, TRI_P = [0.05, 0.25], TRI_RAMP = 20;  /* 三角形 */
    var PREVIEW_H = 84;                 /* 上方預覽區的高度（px） */
    var BAR_H = 56;                     /* 橫桿區高度（px） */
    var FALL_MS = 380;                  /* 方塊落下的時間 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 方塊面積（＝重量）：長方形 w×h、梯形 (底＋頂)／2×h、三角形 w×h／2 */
    function areaOf(b) {
        if (b.kind === 'tri') return b.w * b.h / 2;
        if (b.kind === 'trap') return (b.w + b.w * TRAP_TOP) / 2 * b.h;
        return b.w * b.h;
    }
    /* 方塊在水平位置 x 的頂面高度（絕對高度）；x 在方塊範圍外回傳 null */
    function topAt(b, x) {
        if (x < b.x0 || x > b.x0 + b.w) return null;
        if (b.kind === 'rect') return b.y0 + b.h;
        if (b.kind === 'tri') return b.y0 + b.h * (1 - Math.abs(x - (b.x0 + b.w / 2)) / (b.w / 2));
        var e = b.w * (1 - TRAP_TOP) / 2, u = x - b.x0, d = Math.min(u, b.w - u);
        return b.y0 + b.h * Math.min(1, d / e);
    }
    /* 方塊「頂面高度 ≥ level」的水平範圍 [p, q]；沒有就回傳 null（頂面是凹的折線，所以一定是一段） */
    function levelSet(b, level) {
        var frac = (level - b.y0) / b.h;
        if (frac > 1 + 1e-9) return null;
        if (frac <= 0) return [b.x0, b.x0 + b.w];
        if (b.kind === 'rect') return [b.x0, b.x0 + b.w];
        if (b.kind === 'tri') { var c = b.x0 + b.w / 2, r = (1 - frac) * b.w / 2; return [c - r, c + r]; }
        var e = b.w * (1 - TRAP_TOP) / 2;
        return [b.x0 + frac * e, b.x0 + b.w - frac * e];
    }
    /* 底寬 w 的方塊放在左邊界 x0：它底下所有方塊頂面的最高點（沒有就是地板 0） */
    function restLevel(tower, x0, w) {
        var R = 0, x1 = x0 + w;
        tower.forEach(function (b) {
            var a = Math.max(x0, b.x0), z = Math.min(x1, b.x0 + b.w);
            if (a > z) return;
            var cand = [a, z];
            if (b.kind === 'tri') cand.push(b.x0 + b.w / 2);
            if (b.kind === 'trap') { var e = b.w * (1 - TRAP_TOP) / 2; cand.push(b.x0 + e, b.x0 + b.w - e); }
            cand.forEach(function (x) { if (x >= a && x <= z) { var t = topAt(b, x); if (t != null && t > R) R = t; } });
        });
        return R;
    }
    /* 落在高度 R 時的接觸清單：[{i: 方塊編號（-1＝地板）, a, b: 接觸範圍的左右端}] */
    function contactsAt(tower, x0, w, R, W) {
        var out = [], x1 = x0 + w;
        if (R <= EPS) out.push({ i: -1, a: Math.max(0, x0), b: Math.min(W, x1) });
        tower.forEach(function (b, i) {
            var s = levelSet(b, R - EPS);
            if (!s) return;
            var a = Math.max(x0, s[0]), z = Math.min(x1, s[1]);
            if (a <= z) out.push({ i: i, a: a, b: z });
        });
        return out;
    }
    function hullOf(cs) {
        var a = Infinity, z = -Infinity;
        cs.forEach(function (c) { if (c.a < a) a = c.a; if (c.b > z) z = c.b; });
        return { a: a, b: z, w: z - a };
    }
    /* 整座塔從上往下逐塊檢查（新方塊已經在 tower 最後面）。回傳 { ok:true } 或 { ok:false, idx, reason:'tip'|'slide', pivot:{x,y} } */
    function checkTower(tower) {
        var n = tower.length, recM = [], recMx = [], i;
        for (i = 0; i < n; i++) { recM.push(0); recMx.push(0); }
        for (i = n - 1; i >= 0; i--) {
            var b = tower[i], cx = b.x0 + b.w / 2, ar = areaOf(b);
            var M = ar + recM[i], com = (ar * cx + recMx[i]) / M;
            var hull = hullOf(b.sup);
            /* dir：往哪邊倒（-1 往左、1 往右），動畫用 */
            if (hull.w < MIN_CONTACT) return { ok: false, idx: i, reason: 'slide', dir: com < (hull.a + hull.b) / 2 ? -1 : 1, pivot: { x: com < (hull.a + hull.b) / 2 ? hull.a : hull.b, y: b.y0 } };
            if (com < hull.a - TOL || com > hull.b + TOL) return { ok: false, idx: i, reason: 'tip', dir: com < hull.a ? -1 : 1, pivot: { x: com < hull.a ? hull.a : hull.b, y: b.y0 } };
            /* 把這一塊（加上它承受的重量）依接觸寬度分給底下的方塊；作用點＝重心夾到各自接觸範圍裡 */
            var tot = 0;
            b.sup.forEach(function (c) { tot += Math.max(c.b - c.a, 0.001); });
            b.sup.forEach(function (c) {
                if (c.i < 0) return;
                var part = M * Math.max(c.b - c.a, 0.001) / tot;
                recM[c.i] += part;
                recMx[c.i] += part * Math.min(c.b, Math.max(c.a, com));
            });
        }
        return { ok: true };
    }
    /* 模擬一次放下：block＝{kind, w, h}，x0＝左邊界。回傳
       { ok, reason:'ok'|'tip'|'slide'|'ceiling', rest（落地高度）, placed（疊上去之後的那一塊）, tower（含新方塊的新塔）, fail:{idx,pivot}（失敗時） } */
    function evaluateDrop(tower, block, x0, W, ZH) {
        var R = restLevel(tower, x0, block.w);
        var placed = { kind: block.kind, x0: x0, w: block.w, y0: R, h: block.h, hue: block.hue, sup: contactsAt(tower, x0, block.w, R, W) };
        var nt = tower.concat([placed]);
        if (R + block.h > ZH) return { ok: false, reason: 'ceiling', rest: R, placed: placed, tower: nt };
        var r = checkTower(nt);
        if (!r.ok) return { ok: false, reason: r.reason, rest: R, placed: placed, tower: nt, fail: { idx: r.idx, pivot: r.pivot, dir: r.dir } };
        return { ok: true, reason: 'ok', rest: R, placed: placed, tower: nt };
    }
    /* 出一塊：形狀（依關卡機率）、寬度（畫面寬的 1/6～1/2）、顏色 */
    function makeBlock(level, W, rand) {
        rand = rand || Math.random;
        var pT = level >= TRAP_FROM ? kit.ramp(level - TRAP_FROM + 1, TRAP_P[0], TRAP_P[1], TRAP_RAMP) : 0;
        var pR = level >= TRI_FROM ? kit.ramp(level - TRI_FROM + 1, TRI_P[0], TRI_P[1], TRI_RAMP) : 0;
        var r = rand(), kind = r < pR ? 'tri' : (r < pR + pT ? 'trap' : 'rect');
        return { kind: kind, w: kit.randInt(Math.round(W * W_MIN_RATIO), Math.round(W * W_MAX_RATIO), rand), h: BLOCK_H, hue: Math.round(rand() * 360) };
    }
    /* 找「站得住」的左邊界清單（每隔 step px 試一次）；除錯／測試用 */
    function stableSpots(tower, block, W, ZH, step) {
        var out = [], x;
        for (x = 0; x <= W - block.w; x += step || 2) if (evaluateDrop(tower, block, x, W, ZH).ok) out.push(x);
        return out;
    }
    function rating(n) {
        if (n >= 30) return '重心大師！';
        if (n >= 18) return '疊得真穩！';
        if (n >= 10) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '重心要落在底下的支撐範圍裡，再試一次！';
    }
    var FAIL_TEXT = {
        tip: '重心超出支撐，傾倒了！',
        slide: '落在斜面或尖端上，滑掉了！',
        ceiling: '塔頂碰到天花板了！'
    };

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8, resume: false,
            numText: function (v) { return v + ' 塊'; },
            rating: rating,
            head: function (level) { return '第 ' + level + ' 塊'; },
            lines: function (S) { return ['成功疊了 ' + S.cleared + ' 塊']; },
            stageClass: 'su-stage',
            setup: setup
        });
    }

    /* 目前疊好的塔（跨關保留；第 1 關開始時清空） */
    var tower = [];

    function setup(api) {
        var stage = api.stage, level = api.level;
        if (level === 1) tower = [];
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var ZH = Math.max(200, H - PREVIEW_H - BAR_H - 84 - 36);        /* 疊塔區高度：扣掉預覽、橫桿、按鈕與間距 */
        var block = makeBlock(level, W, api.rand);
        api.info = { block: block, towerSize: tower.length, W: W, ZH: ZH };
        var x0 = Math.round((W - block.w) / 2);
        console.log('[重心疊疊樂] 第 ' + level + ' 塊：' + ({ rect: '長方形', trap: '梯形', tri: '三角形' })[block.kind] + '，寬 ' + block.w + 'px；塔上已有 ' + tower.length + ' 塊');

        /* 世界座標（地板往上）→ SVG 座標（上方往下） */
        var SVG_H = PREVIEW_H + ZH;
        function sy(y) { return PREVIEW_H + ZH - y; }
        var svg = kit.svg('svg', { 'class': 'su-svg', viewBox: '0 0 ' + W + ' ' + SVG_H, width: W, height: SVG_H }, stage);
        kit.svg('line', { x1: 0, x2: W, y1: sy(ZH), y2: sy(ZH), 'class': 'su-ceil' }, svg);
        kit.svg('rect', { x: 0, y: sy(0), width: W, height: 400, 'class': 'su-floor' }, svg);

        function pts(b, dx) {
            var x = b.x0 + (dx || 0), y0 = b.y0;
            if (b.kind === 'tri') return [[x, y0], [x + b.w, y0], [x + b.w / 2, y0 + b.h]];
            if (b.kind === 'trap') { var e = b.w * (1 - TRAP_TOP) / 2; return [[x, y0], [x + b.w, y0], [x + b.w - e, y0 + b.h], [x + e, y0 + b.h]]; }
            return [[x, y0], [x + b.w, y0], [x + b.w, y0 + b.h], [x, y0 + b.h]];
        }
        function pointsStr(b, dx, dy) { return pts(b, dx).map(function (p) { return p[0].toFixed(1) + ',' + (sy(p[1]) + (dy || 0)).toFixed(1); }).join(' '); }
        function drawBlock(b, parent) {
            return kit.svg('polygon', { points: pointsStr(b), 'class': 'su-block', style: 'fill:hsl(' + b.hue + ',62%,70%)' }, parent);
        }
        /* 已經疊好的塔：每塊一個 <g>（失敗時整組一起轉） */
        var gTower = kit.svg('g', {}, svg), gEls = [];
        tower.forEach(function (b) { var g = kit.svg('g', {}, gTower); drawBlock(b, g); gEls.push(g); });

        /* 上方預覽：要放的那一塊（底邊在預覽區底部上方一點），用同一個形狀函式畫 */
        var prev = { kind: block.kind, x0: x0, w: block.w, y0: ZH + 14, h: block.h, hue: block.hue };
        var gPrev = kit.svg('g', {}, svg);
        var polyPrev = kit.svg('polygon', { points: pointsStr(prev), 'class': 'su-block su-block--prev', style: 'fill:hsl(' + block.hue + ',62%,70%)' }, gPrev);
        var guide = kit.svg('line', { x1: 0, x2: 0, y1: sy(ZH), y2: sy(0), 'class': 'su-guide' }, svg);
        function paintPrev() {
            prev.x0 = x0;
            polyPrev.setAttribute('points', pointsStr(prev));
            guide.setAttribute('x1', x0 + block.w / 2); guide.setAttribute('x2', x0 + block.w / 2);
        }
        paintPrev();

        /* 橫桿：拖曳旋鈕決定方塊的左右位置 */
        var bar = h('div', { 'class': 'su-bar' }), track = h('div', { 'class': 'su-track' }), knob = h('div', { 'class': 'su-knob' });
        bar.appendChild(track); bar.appendChild(knob);
        var okBtn = h('button', { 'class': 'btn btn--go su-ok', text: '放下' });
        stage.appendChild(bar); stage.appendChild(okBtn);
        var KR = 24;                                   /* 旋鈕半徑 */
        function knobX() { return KR + (W - 2 * KR) * (W - block.w > 0 ? x0 / (W - block.w) : 0.5); }
        function paintKnob() { knob.style.left = (knobX() - KR) + 'px'; }
        paintKnob();
        var locked = false, hint = null;
        function setFromPointer(e) {
            var p = kit.localPt(e, bar), f = kit.clamp((p.x - KR) / (W - 2 * KR), 0, 1);
            x0 = Math.round(f * (W - block.w));
            paintPrev(); paintKnob();
        }
        var dragging = null;
        bar.addEventListener('pointerdown', function (e) {
            if (locked || dragging != null) return;
            e.preventDefault();
            try { bar.setPointerCapture(e.pointerId); } catch (err) { }
            dragging = e.pointerId;
            if (hint) { hint.remove(); hint = null; }
            setFromPointer(e);
        });
        bar.addEventListener('pointermove', function (e) { if (dragging === e.pointerId && !locked) setFromPointer(e); });
        function endDrag(e) { if (dragging === e.pointerId) dragging = null; }
        bar.addEventListener('pointerup', endDrag);
        bar.addEventListener('pointercancel', endDrag);
        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，沿著橫桿左右移動 */
        if (level === 1 && kit.once('stackup.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: knobX(), y: SVG_H + 8 + BAR_H / 2, dx: 120, dy: 0, delay: 400, text: '請往左右拖曳' });
        var msg = h('div', { 'class': 'su-msg' });
        stage.appendChild(msg);

        /* 放下：先算結果，再播落下動畫 */
        function drop() {
            if (locked || api.over) return;
            locked = true;
            if (hint) { hint.remove(); hint = null; }
            Sfx.play('click');
            var res = evaluateDrop(tower, block, x0, W, ZH);
            gPrev.style.display = 'none'; guide.setAttribute('opacity', 0);
            var fallG = kit.svg('g', {}, svg);
            var fb = { kind: block.kind, x0: x0, w: block.w, y0: res.rest, h: block.h, hue: block.hue };
            var poly = drawBlock(fb, fallG);
            var dyStart = (ZH + 14 - res.rest);                     /* 從預覽位置到落地位置要掉多少 px */
            my_tween(FALL_MS, function (e) { fallG.setAttribute('transform', 'translate(0 ' + (-(1 - e) * dyStart).toFixed(2) + ')'); }, kit.easeInQuad).then(function () {
                fallG.setAttribute('transform', '');
                if (res.ok) {
                    tower = res.tower;
                    Sfx.play('ok');
                    msg.textContent = '站穩了！'; msg.classList.add('su-msg--ok');
                    api.pass({ gain: 1, delay: 600 });
                } else {
                    failAnim(res, fallG);
                }
            });
        }
        function my_tween(ms, fn, ease) { return api.my.tween(ms, fn, ease); }
        /* 失敗動畫：失敗的那一塊（連同壓在它上面的）繞著支撐邊緣轉開，再掉下去 */
        function failAnim(res, fallG) {
            Sfx.play('bad');
            msg.textContent = FAIL_TEXT[res.reason] || '失敗了'; msg.classList.add('su-msg--bad');
            var idx = res.fail ? res.fail.idx : res.tower.length - 1;
            var groups = [];
            var set = {}; set[idx] = true;
            res.tower.forEach(function (b, i) { if (i > idx && b.sup.some(function (c) { return set[c.i]; })) set[i] = true; });
            res.tower.forEach(function (b, i) { if (set[i]) groups.push(i === res.tower.length - 1 ? fallG : gEls[i]); });
            var pv = res.fail ? res.fail.pivot : { x: x0 + block.w / 2, y: res.rest };
            var sign = res.fail ? res.fail.dir : (x0 + block.w / 2 < W / 2 ? -1 : 1);
            var px = pv.x, py = sy(pv.y);
            my_tween(700, function (e) {
                groups.forEach(function (g) { g.setAttribute('transform', 'rotate(' + (sign * 38 * e).toFixed(2) + ' ' + px + ' ' + py + ') translate(0 ' + (e * 40).toFixed(1) + ')'); });
            }, kit.easeInQuad).then(function () {
                api.fail({ delay: 500, lines: [FAIL_TEXT[res.reason] || '失敗了', '塔上共 ' + tower.length + ' 塊'] });
            });
        }
        kit.onTap(okBtn, drop);

        /* 驗證用：solve 放在一個站得住的位置；wrong 放在一個站不住的位置（找不到就直接判失敗） */
        api.solve = function () {
            var spots = stableSpots(tower, block, W, ZH, 2);
            if (!spots.length) { api.fail({ lines: ['沒有地方可以放了'] }); return; }
            x0 = spots[Math.floor(spots.length / 2)]; paintPrev(); paintKnob(); drop();
        };
        api.wrong = function () {
            var bad = null, x;
            for (x = 0; x <= W - block.w && bad == null; x += 2) if (!evaluateDrop(tower, block, x, W, ZH).ok) bad = x;
            if (bad == null) { api.fail({ lines: ['（驗證）這一塊放哪裡都站得住，直接判失敗'] }); return; }
            x0 = bad; paintPrev(); paintKnob(); drop();
        };
    }

    var G = {
        id: ID,
        name: '重心疊疊樂',
        rule: '上方有一個方塊，拖曳下方的橫桿決定它落下的左右位置，按「放下」就會掉下去。**方塊要平穩地擺在地板或別的方塊上**：**重心超出底下的支撐會傾倒**、落在斜面或尖端會滑掉、疊太高碰到天花板也不行。越後面越常出現梯形和三角形。看你能疊幾塊！',
        mount: mount,
        score: SCORE,
        test: {
            areaOf: areaOf, topAt: topAt, levelSet: levelSet, restLevel: restLevel, contactsAt: contactsAt, checkTower: checkTower,
            evaluateDrop: evaluateDrop, makeBlock: makeBlock, stableSpots: stableSpots, BLOCK_H: BLOCK_H, EPS: EPS, MIN_CONTACT: MIN_CONTACT,
            TRAP_TOP: TRAP_TOP, W_MIN_RATIO: W_MIN_RATIO, W_MAX_RATIO: W_MAX_RATIO, TRAP_FROM: TRAP_FROM, TRI_FROM: TRI_FROM,
            getTower: function () { return tower; }, setTower: function (t) { tower = t; }
        }
    };
    Reaction.register(G);
})();
