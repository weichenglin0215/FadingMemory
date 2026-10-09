/* ═══════════════════════════════════════════════════════════════════
   reaction_stamp.js — 秒反應・蓋在框內
   公文紙上有一個紅框，但只露出四個角標；把印章拖到框的位置、轉正，按「蓋章」，只有一次機會。
   ───────────────────────────────────────────────────────────────────
   · 紙張稍微歪斜（隨機 ±PAPER_TILT 度），紅框跟紙同角度，所以印章要「一起轉」才對得上。
   · 角標畫在框的外側 MARK_GAP px；印章跟框同大（不透明），蓋住時看不到紅框，只靠四個角標判斷。
   · 拖曳印章本體＝移動；拖曳印章上緣的圓形手柄＝旋轉。兩種都是「慢速微調」。
   · 成績 ＝ 印章四個角到紅框對應四個角的平均距離（像素換算成公釐：1px ＝ PX_MM 公釐，越小越好）。
   · 揭曉：印痕與紅框疊合，鏡頭放大到偏差最大的那個角，畫出偏移向量。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'stamp';
    var SCORE = { better: 'min', decimals: 4, format: '{v} 公釐', label: '偏差', min: 0, max: 200 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var FW = 220, FH = 140;                     /* 紅框（也是印章）的寬、高（px） */
    var PAPER = { x: 236, y: 230, w: 420, h: 420 };      /* 紙張中心與大小 */
    var PAPER_TILT = 8;                         /* 紙張歪斜上限（度） */
    var FRAME_OFF = { x: 30, y: 20 };           /* 紅框中心離紙張中心的隨機位移上限（px） */
    var MARK_GAP = 6, MARK_LEG = 24;            /* 角標離框的距離、角標每隻腳的長度 */
    var STAMP0 = { x: 236, y: 500 };            /* 印章起始中心 */
    var HANDLE_UP = 40;                         /* 旋轉手柄在印章上緣外側幾 px */
    var HANDLE_R = 34;                          /* 手柄可以抓住的半徑 */
    var ROT_MAX = 50;                           /* 印章最多轉幾度 */
    var PX_MM = 0.25;                           /* 1 像素 ＝ 幾公釐 */
    var ZOOM_REF = 150, ZOOM_MAX = 25, ZOOM_DIST_MAX = 70;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function rad(d) { return d * Math.PI / 180; }
    /* 以 (cx,cy) 為中心、旋轉 deg 度的 w×h 矩形四個角：左上、右上、右下、左下 */
    function corners(cx, cy, deg, w, hh) {
        var c = Math.cos(rad(deg)), s = Math.sin(rad(deg)), out = [];
        [[-w / 2, -hh / 2], [w / 2, -hh / 2], [w / 2, hh / 2], [-w / 2, hh / 2]].forEach(function (p) {
            out.push({ x: cx + p[0] * c - p[1] * s, y: cy + p[0] * s + p[1] * c });
        });
        return out;
    }
    function dist(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }
    /* 四個角的距離與平均（px） */
    function cornerErr(stamp, frame) {
        var a = corners(stamp.x, stamp.y, stamp.rot, FW, FH), b = corners(frame.x, frame.y, frame.rot, FW, FH);
        var ds = a.map(function (p, i) { return dist(p, b[i]); });
        var worst = 0; ds.forEach(function (d, i) { if (d > ds[worst]) worst = i; });
        return { ds: ds, mean: ds.reduce(function (x, y) { return x + y; }, 0) / 4, worst: worst, a: a, b: b };
    }
    function toMm(px) { return px * PX_MM; }
    function makeRound(rand) {
        rand = rand || Math.random;
        var phi = kit.randFloat(-PAPER_TILT, PAPER_TILT, rand);
        if (Math.abs(phi) < 2) phi = phi < 0 ? -2 : 2;                 /* 不要太接近 0：不然不用轉就對了 */
        var ox = kit.randFloat(-FRAME_OFF.x, FRAME_OFF.x, rand), oy = kit.randFloat(-FRAME_OFF.y, FRAME_OFF.y, rand);
        var c = Math.cos(rad(phi)), s = Math.sin(rad(phi));
        return { phi: phi, frame: { x: PAPER.x + ox * c - oy * s, y: PAPER.y + ox * s + oy * c, rot: phi } };
    }
    /* 點 p 是否在印章（含旋轉）矩形內 */
    function insideStamp(p, st) {
        var c = Math.cos(rad(-st.rot)), s = Math.sin(rad(-st.rot)), dx = p.x - st.x, dy = p.y - st.y;
        var lx = dx * c - dy * s, ly = dx * s + dy * c;
        return Math.abs(lx) <= FW / 2 && Math.abs(ly) <= FH / 2;
    }
    /* 旋轉手柄位置（印章上緣中央往外 HANDLE_UP + 半個手柄） */
    function handleOf(st) {
        var d = FH / 2 + HANDLE_UP, c = Math.cos(rad(st.rot)), s = Math.sin(rad(st.rot));
        return { x: st.x + d * s, y: st.y - d * c };
    }
    function zoomFor(distPx) { return distPx >= ZOOM_DIST_MAX ? 1 : kit.clamp(ZOOM_REF / Math.max(distPx * 2, 0.5), 2, ZOOM_MAX); }
    function rating(mm) {
        if (mm < 0.3) return '神乎其技！';
        if (mm < 1) return '高手！';
        if (mm < 2.5) return '很準！';
        if (mm < 6) return '不錯喔！';
        return '再試一次，會更準！';
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '把印章移到紅框的位置、轉正，再按「蓋章」',
            numText: function (v) { return v.toFixed(4) + ' 公釐'; },
            rating: rating,
            sfx: function (v) { return v < 1 ? 'perfect' : (v < 4 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeRound();
        var st = { x: STAMP0.x, y: Math.min(STAMP0.y, H - 150), rot: 0 }, locked = false, hint = null, mode = null, vp = null;
        console.log('[蓋在框內] 紙張歪 ' + cfg.phi.toFixed(2) + '°，紅框中心 (' + cfg.frame.x.toFixed(1) + ', ' + cfg.frame.y.toFixed(1) + ')');

        var svg = kit.svg('svg', { 'class': 'st-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var full = { vx: 0, vy: 0, vw: W, vh: H };
        /* 紙張 */
        kit.svg('rect', { x: -PAPER.w / 2, y: -PAPER.h / 2, width: PAPER.w, height: PAPER.h, rx: 6, 'class': 'st-paper',
            transform: 'translate(' + PAPER.x + ' ' + PAPER.y + ') rotate(' + cfg.phi.toFixed(3) + ')' }, svg);
        /* 紅框的四個角標（框外側） */
        var gF = kit.svg('g', { transform: 'translate(' + cfg.frame.x.toFixed(2) + ' ' + cfg.frame.y.toFixed(2) + ') rotate(' + cfg.phi.toFixed(3) + ')' }, svg);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (sg) {
            var px = sg[0] * (FW / 2 + MARK_GAP), py = sg[1] * (FH / 2 + MARK_GAP);
            kit.svg('polyline', { points: [px - sg[0] * MARK_LEG, py, px, py, px, py - sg[1] * MARK_LEG].join(','), 'class': 'st-mark' }, gF);
        });
        var frameRect = kit.svg('rect', { x: -FW / 2, y: -FH / 2, width: FW, height: FH, 'class': 'st-frame', opacity: 0 }, gF);
        var gRev = kit.svg('g', {}, svg);
        /* 印章與旋轉手柄 */
        var gS = kit.svg('g', {}, svg);
        var stem = kit.svg('line', { x1: 0, y1: -FH / 2, x2: 0, y2: -FH / 2 - HANDLE_UP, 'class': 'st-stem' }, gS);
        var rect = kit.svg('rect', { x: -FW / 2, y: -FH / 2, width: FW, height: FH, rx: 8, 'class': 'st-stamp' }, gS);
        kit.svg('rect', { x: -FW / 2 + 12, y: -FH / 2 + 12, width: FW - 24, height: FH - 24, rx: 4, 'class': 'st-stamp-in' }, gS);
        var label = kit.svg('text', { x: 0, y: 16, 'text-anchor': 'middle', 'class': 'st-text' }, gS);
        label.textContent = '核准';
        var knob = kit.svg('circle', { cx: 0, cy: -FH / 2 - HANDLE_UP, r: 17, 'class': 'st-knob' }, gS);
        function paint() { gS.setAttribute('transform', 'translate(' + st.x.toFixed(2) + ' ' + st.y.toFixed(2) + ') rotate(' + st.rot.toFixed(3) + ')'); }
        paint();
        var msg = h('div', { 'class': 'st-msg' });
        stage.appendChild(msg);
        var okBtn = h('button', { 'class': 'btn btn--go st-ok', text: '蓋章' });
        stage.appendChild(okBtn);

        /* 操作提示：拖曳（手指放在印章中央，往紙張方向來回） */
        hint = kit.fingerHint(stage, { mode: 'drag', x: st.x, y: st.y, dx: 0, dy: -90, delay: 400 });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        kit.dragDamp(stage, {
            enabled: function () { return !locked; },
            start: function (p) {
                var hd = handleOf(st);
                if (dist(p, hd) <= HANDLE_R) { mode = 'rot'; vp = { x: p.x, y: p.y }; hideHint(); return true; }
                if (insideStamp(p, st)) { mode = 'move'; hideHint(); return true; }
                return false;
            },
            move: function (dx, dy) {
                if (mode === 'move') {
                    st.x = kit.clamp(st.x + dx, 40, W - 40); st.y = kit.clamp(st.y + dy, 30, H - 110);
                } else if (mode === 'rot') {
                    vp.x += dx; vp.y += dy;
                    var a = Math.atan2(vp.y - st.y, vp.x - st.x) * 180 / Math.PI + 90;
                    st.rot = kit.clamp(((a + 540) % 360) - 180, -ROT_MAX, ROT_MAX);
                }
                paint();
            },
            end: function () { mode = null; }
        });
        kit.onTap(okBtn, function () { submit(); });

        function submit() {
            if (locked) return;
            locked = true; hideHint();
            okBtn.style.display = 'none'; knob.setAttribute('opacity', 0); stem.setAttribute('opacity', 0);
            Sfx.play('click');
            var res = cornerErr(st, cfg.frame), mm = toMm(res.mean);
            /* 蓋章動畫：往下壓一下 */
            var x0 = st.x, y0 = st.y;
            my.tween(280, function (e) {
                var k = 1 - 0.06 * Math.sin(Math.PI * e);
                gS.setAttribute('transform', 'translate(' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ') rotate(' + st.rot.toFixed(3) + ') scale(' + k.toFixed(4) + ')');
            }, kit.linear).then(function () {
                rect.setAttribute('class', 'st-stamp st-stamp--print');
                frameRect.setAttribute('opacity', 1);
                /* 偏差向量 */
                for (var i = 0; i < 4; i++) {
                    if (res.ds[i] < 0.2) continue;
                    kit.svg('line', { x1: res.b[i].x, y1: res.b[i].y, x2: res.a[i].x, y2: res.a[i].y, 'class': 'st-vec' }, gRev);
                }
                kit.svg('circle', { cx: res.b[res.worst].x, cy: res.b[res.worst].y, r: 5, 'class': 'st-wp' }, gRev);
                msg.textContent = '四角平均偏差 ' + mm.toFixed(4) + ' 公釐';
                msg.classList.add('st-msg--on');
                var z = zoomFor(res.ds[res.worst]);
                my.wait(600).then(function () {
                    if (z <= 1) return;
                    var c = { x: (res.a[res.worst].x + res.b[res.worst].x) / 2, y: (res.a[res.worst].y + res.b[res.worst].y) / 2 };
                    var vw = W / z, vh = H / z;
                    Sfx.play('zoom');
                    return kit.tweenViewBox(my, svg, full, { vx: c.x - vw / 2, vy: c.y - vh / 2, vw: vw, vh: vh }, 1100, kit.easeInOutCubic);
                }).then(function () {
                    my.after(1700, function () {
                        var rot = st.rot - cfg.phi, ctr = dist({ x: st.x, y: st.y }, cfg.frame);
                        api.finish(mm, { lines: [
                            '中心位移 ' + toMm(ctr).toFixed(4) + ' 公釐，歪斜 ' + Math.abs(rot).toFixed(4) + ' 度',
                            '偏差最大的是第 ' + (res.worst + 1) + ' 個角：' + toMm(res.ds[res.worst]).toFixed(4) + ' 公釐',
                            '只有一次機會，想拚更準就再挑戰一次'
                        ] });
                    });
                });
            });
        }

        G.debug = {
            state: function () { return { st: st, cfg: cfg, locked: locked }; },
            place: function (x, y, rot) { st.x = x; st.y = y; st.rot = rot; paint(); },
            solve: function () { st.x = cfg.frame.x; st.y = cfg.frame.y; st.rot = cfg.phi; paint(); submit(); },
            wrong: function () { st.x = cfg.frame.x + 40; st.y = cfg.frame.y + 30; st.rot = 0; paint(); submit(); },
            submit: submit
        };
    }

    var G = {
        id: ID,
        name: '蓋在框內',
        rule: '公文紙上有一個紅框，但只看得到四個角標，紙還歪歪的。拖曳印章移到框的位置，拖曳印章上方的圓點可以旋轉，對準後按「蓋章」。只有一次機會，印下去會告訴你偏差了幾公釐。',
        mount: mount,
        score: SCORE,
        test: { corners: corners, cornerErr: cornerErr, toMm: toMm, makeRound: makeRound, insideStamp: insideStamp, handleOf: handleOf, zoomFor: zoomFor, rating: rating, FW: FW, FH: FH, PAPER: PAPER, PAPER_TILT: PAPER_TILT, FRAME_OFF: FRAME_OFF, ROT_MAX: ROT_MAX }
    };
    Reaction.register(G);
})();
