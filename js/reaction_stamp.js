/* ═══════════════════════════════════════════════════════════════════
   reaction_stamp.js — 秒反應・心在正中央（檔名／id 仍是 stamp；V1.27 之前叫「蓋在框內」）
   公文紙上有一個紅框，但只露出四個角標；把「愛心印章」拖到框裡，讓愛心的正中心對準紅框的正中心，按「蓋章」，只有一次機會。
   ───────────────────────────────────────────────────────────────────
   · V1.27（玩家意見）：改名「心在正中央」；評分標準改成「印章的中心點」與「紅框中心點」的距離（不再看邊緣貼不貼齊）；
     印章改成愛心形，只畫虛線外框（外圈、內圈各自用不同的顏色、粗細、虛線間隔，每次都不一樣），愛心上不寫任何字
     （寫字會讓人很容易找到中心）；印章的大小也不必跟紅框一樣大，每次隨機放大縮小，更難用「貼齊邊」來判斷。
   · V1.25 留下來的難度：紅框很大（330×210）、紙張歪斜（隨機 ±28°，至少 6°）、角標很短，紅框的中心要自己從四個角標想像出來。
   · 愛心的中心＝剛好框住愛心的長方形（外框）的正中央；內圈愛心以同一個中心縮小。
   · 紙張歪斜（隨機 ±PAPER_TILT 度，至少 PAPER_TILT_MIN 度），紅框跟紙同角度；印章不能旋轉（只比中心，轉了沒意義）。
   · 拖曳印章＝移動，是「慢速微調」（手指越慢，變化越細）。
   · 成績 ＝ 兩個中心的距離（像素換算成公釐：1px ＝ PX_MM 公釐，越小越好）。
   · 揭曉：印痕與紅框疊合，畫出紅框中心（紅色十字）、愛心中心（黑點）和兩點之間的連線，鏡頭放大到那條線。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'stamp';
    var SCORE = { better: 'min', decimals: 4, format: '{v} 公釐', label: '中心偏差', min: 0, max: 200 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var FW = 330, FH = 210;                     /* 紅框的寬、高（px） */
    var PAPER = { x: 236, y: 240, w: 460, h: 440 };      /* 紙張中心與大小 */
    var PAPER_TILT = 28, PAPER_TILT_MIN = 6;    /* 紙張歪斜範圍（度）：越歪越難 */
    var FRAME_OFF = { x: 10, y: 8 };            /* 紅框中心離紙張中心的隨機位移上限（px） */
    var MARK_GAP = 6, MARK_LEG = 12;            /* 角標離框的距離、角標每隻腳的長度（縮短，更難對） */
    var HEART_W = [110, 300];                   /* 愛心的寬（px）：每次隨機，可以比紅框小很多、也可以比紅框寬一點 */
    var INNER_K = [0.5, 0.78];                  /* 內圈愛心是外圈的幾倍大（隨機） */
    var GRAB = 16;                              /* 抓愛心的容許範圍：愛心外框再往外多幾 px */
    var STAMP_BOTTOM = 100;                     /* 愛心起始位置的底部離舞台底的距離（要留空間給「蓋章」按鈕） */
    var PX_MM = 0.25;                           /* 1 像素 ＝ 幾公釐 */
    var ZOOM_REF = 150, ZOOM_MAX = 25, ZOOM_DIST_MAX = 70;
    var HEART_N = 120;                          /* 愛心外框的取樣點數 */
    /* 虛線外框的顏色（愛心上外圈、內圈各抽一個，不會一樣）、粗細（px）、虛線「畫 / 空」長度（px） */
    var COLORS = ['#D1493F', '#2F7FC1', '#3F9A55', '#8A57B8', '#E08A1E', '#1E9C9C', '#C2468A', '#6B7280'];
    var WIDTHS = [2, 3, 4, 5, 7];
    var DASHES = [3, 5, 8, 12, 16];
    var GAPS = [3, 6, 10, 16, 22];

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
    /* 愛心曲線（經典參數式）：x ＝ 16 sin³t，y ＝ 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t（y 朝上）。
       這裡轉成螢幕座標（y 朝下）、平移到「外框的正中央」是 (0,0)、縮放成寬 w。回傳 { pts: [[x,y]…], w, h } */
    var RAW = (function () {
        var pts = [], minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        for (var i = 0; i < HEART_N; i++) {
            var t = i / HEART_N * 2 * Math.PI;
            var x = 16 * Math.pow(Math.sin(t), 3), y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
            pts.push([x, y]);
            if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        return { pts: pts, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
    })();
    function heartShape(w) {
        var k = w / RAW.w;
        return { pts: RAW.pts.map(function (p) { return [(p[0] - RAW.cx) * k, (p[1] - RAW.cy) * k]; }), w: w, h: RAW.h * k };
    }
    function toMm(px) { return px * PX_MM; }
    /* 兩個中心的距離（px）與在紅框座標裡的偏移（dx：往紅框的右邊多少、dy：往紅框的下面多少） */
    function centerErr(stamp, frame) {
        var wx = stamp.x - frame.x, wy = stamp.y - frame.y, c = Math.cos(rad(frame.rot)), s = Math.sin(rad(frame.rot));
        var dx = wx * c + wy * s, dy = -wx * s + wy * c;
        return { dist: Math.sqrt(wx * wx + wy * wy), dx: dx, dy: dy };
    }
    function makeRound(rand) {
        rand = rand || Math.random;
        var phi = kit.randFloat(-PAPER_TILT, PAPER_TILT, rand);
        if (Math.abs(phi) < PAPER_TILT_MIN) phi = phi < 0 ? -PAPER_TILT_MIN : PAPER_TILT_MIN;   /* 不要太接近 0：不然不用轉就對了 */
        var ox = kit.randFloat(-FRAME_OFF.x, FRAME_OFF.x, rand), oy = kit.randFloat(-FRAME_OFF.y, FRAME_OFF.y, rand);
        var c = Math.cos(rad(phi)), s = Math.sin(rad(phi));
        return { phi: phi, frame: { x: PAPER.x + ox * c - oy * s, y: PAPER.y + ox * s + oy * c, rot: phi } };
    }
    /* 愛心印章的外觀：大小、外圈／內圈各自的顏色、粗細、虛線間隔（外圈與內圈的顏色一定不同；虛線樣式也不同） */
    function makeStamp(rand) {
        rand = rand || Math.random;
        var w = kit.randFloat(HEART_W[0], HEART_W[1], rand), c1 = kit.pick(COLORS, rand), c2;
        do { c2 = kit.pick(COLORS, rand); } while (c2 === c1);
        var d1 = kit.pick(DASHES, rand), g1 = kit.pick(GAPS, rand), d2, g2;
        do { d2 = kit.pick(DASHES, rand); g2 = kit.pick(GAPS, rand); } while (d2 === d1 && g2 === g1);
        return {
            w: w, h: RAW.h / RAW.w * w, k2: kit.randFloat(INNER_K[0], INNER_K[1], rand),
            outer: { color: c1, width: kit.pick(WIDTHS, rand), dash: d1, gap: g1 },
            inner: { color: c2, width: kit.pick(WIDTHS, rand), dash: d2, gap: g2 }
        };
    }
    /* 點 p 是否抓得到愛心（愛心外框再往外多 GRAB px；愛心是空心虛線，所以用整個外框來抓） */
    function insideStamp(p, st, look) {
        return Math.abs(p.x - st.x) <= look.w / 2 + GRAB && Math.abs(p.y - st.y) <= look.h / 2 + GRAB;
    }
    /* 愛心的起始位置：水平置中、貼近舞台下方（離紅框很遠） */
    function startOf(look, W, H) {
        return { x: W / 2, y: Math.min(H - STAMP_BOTTOM - look.h / 2, 540) };
    }
    function zoomFor(distPx) { return distPx >= ZOOM_DIST_MAX ? 1 : kit.clamp(ZOOM_REF / Math.max(distPx * 2, 0.5), 2, ZOOM_MAX); }
    function rating(mm) {
        if (mm < 0.3) return '神乎其技！';
        if (mm < 1) return '高手！';
        if (mm < 2.5) return '很準！';
        if (mm < 6) return '不錯喔！';
        return '再試一次，會更準！';
    }
    function pts2str(pts) { return pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }

    function mount(root, ctx) {
        /* 舊版的成績不能比：V1.25 改橢圓印章、四條邊的偏差；V1.27 再改成愛心印章、中心的距離。第一次進來各清一次 */
        Reaction.migrateBest(ID, function () { return null; }, '.v125');
        Reaction.migrateBest(ID, function () { return null; }, '.v127');
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '把愛心的正中心對準紅框的正中心，再按「蓋章」',
            numText: function (v) { return v.toFixed(4) + ' 公釐'; },
            rating: rating,
            sfx: function (v) { return v < 1 ? 'perfect' : (v < 4 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeRound(), look = makeStamp(), s0 = startOf(look, W, H);
        var st = { x: s0.x, y: s0.y }, locked = false, hint = null;
        console.log('[心在正中央] 紙張歪 ' + cfg.phi.toFixed(2) + '°，紅框中心 (' + cfg.frame.x.toFixed(1) + ', ' + cfg.frame.y.toFixed(1) + ')，愛心寬 ' + look.w.toFixed(0));

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
        /* 愛心印章：只有虛線外框（外圈、內圈各自的顏色／粗細／虛線間隔），沒有任何字 */
        var gS = kit.svg('g', {}, svg);
        var outerShape = heartShape(look.w), innerShape = heartShape(look.w * look.k2);
        function heartEl(shape, sty) {
            return kit.svg('polygon', { points: pts2str(shape.pts), 'class': 'st-heart', fill: 'none', stroke: sty.color, 'stroke-width': sty.width,
                'stroke-dasharray': sty.dash + ' ' + sty.gap }, gS);
        }
        var outerEl = heartEl(outerShape, look.outer);
        heartEl(innerShape, look.inner);
        function paint() { gS.setAttribute('transform', 'translate(' + st.x.toFixed(2) + ' ' + st.y.toFixed(2) + ')'); }
        paint();
        var msg = h('div', { 'class': 'st-msg' });
        stage.appendChild(msg);
        var okBtn = h('button', { 'class': 'btn btn--go st-ok', text: '蓋章' });
        stage.appendChild(okBtn);

        /* 操作提示（只在第一次進遊戲時）：手指＋箭頭，從愛心中央往「紅框中央」重複移動（第一次的正確答案） */
        if (kit.once('stamp.hint')) hint = kit.fingerHint(stage, { mode: 'drag', x: st.x, y: st.y, dx: cfg.frame.x - st.x, dy: cfg.frame.y - st.y, delay: 400, text: '請把愛心的中心拖到紅框的中心' });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        kit.dragDamp(stage, {
            enabled: function () { return !locked; },
            start: function (p) {
                if (insideStamp(p, st, look)) { hideHint(); return true; }
                return false;
            },
            move: function (dx, dy) {
                st.x = kit.clamp(st.x + dx, 30, W - 30); st.y = kit.clamp(st.y + dy, 30, H - 100);
                paint();
            }
        });
        kit.onTap(okBtn, function () { submit(); });

        function submit() {
            if (locked) return;
            locked = true; hideHint();
            okBtn.style.display = 'none';
            Sfx.play('click');
            var res = centerErr(st, cfg.frame), mm = toMm(res.dist);
            /* 蓋章動畫：往下壓一下 */
            var x0 = st.x, y0 = st.y;
            my.tween(280, function (e) {
                var k = 1 - 0.06 * Math.sin(Math.PI * e);
                gS.setAttribute('transform', 'translate(' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ') scale(' + k.toFixed(4) + ')');
            }, kit.linear).then(function () {
                outerEl.setAttribute('fill', look.outer.color); outerEl.setAttribute('fill-opacity', 0.18);
                frameRect.setAttribute('opacity', 1);
                /* 紅框中心（紅色十字）、愛心中心（黑點）、兩點之間的連線 */
                var fc = cfg.frame;
                kit.svg('line', { x1: fc.x, y1: fc.y, x2: st.x, y2: st.y, 'class': 'st-vec' }, gRev);
                kit.svg('line', { x1: fc.x - 9, y1: fc.y, x2: fc.x + 9, y2: fc.y, 'class': 'st-fc' }, gRev);
                kit.svg('line', { x1: fc.x, y1: fc.y - 9, x2: fc.x, y2: fc.y + 9, 'class': 'st-fc' }, gRev);
                kit.svg('circle', { cx: st.x, cy: st.y, r: 4, 'class': 'st-sc' }, gRev);
                msg.textContent = '兩個中心相距 ' + mm.toFixed(4) + ' 公釐';
                msg.classList.add('st-msg--on');
                var z = zoomFor(res.dist);
                my.wait(600).then(function () {
                    if (z <= 1) return;
                    var c = { x: (st.x + fc.x) / 2, y: (st.y + fc.y) / 2 };
                    var vw = W / z, vh = H / z;
                    Sfx.play('zoom');
                    return kit.tweenViewBox(my, svg, full, { vx: c.x - vw / 2, vy: c.y - vh / 2, vw: vw, vh: vh }, 1100, kit.easeInOutCubic);
                }).then(function () {
                    my.after(1700, function () {
                        api.finish(mm, { lines: [
                            '愛心中心比紅框中心' + (res.dx >= 0 ? '偏右 ' : '偏左 ') + toMm(Math.abs(res.dx)).toFixed(4) + ' 公釐，' + (res.dy >= 0 ? '偏下 ' : '偏上 ') + toMm(Math.abs(res.dy)).toFixed(4) + ' 公釐',
                            '（方向是順著歪斜的紙來看）',
                            '只有一次機會，想拚更準就再挑戰一次'
                        ] });
                    });
                });
            });
        }

        G.debug = {
            state: function () { return { st: st, look: look, cfg: cfg, locked: locked }; },
            place: function (x, y) { st.x = x; st.y = y; paint(); },
            solve: function () { st.x = cfg.frame.x; st.y = cfg.frame.y; paint(); submit(); },
            wrong: function () { st.x = cfg.frame.x + 40; st.y = cfg.frame.y + 30; paint(); submit(); },
            submit: submit
        };
    }

    var G = {
        id: ID,
        name: '心在正中央',
        rule: '公文紙上有一個紅框，但只看得到四個角標，紙還**歪得很厲害**。**拖曳愛心印章，讓愛心的正中心對準紅框的正中心**，對準後按「蓋章」。愛心每次的大小和虛線都不一樣，不用跟紅框一樣大。愛心的中心，是剛好框住愛心的長方形的正中央。**只有一次機會**，印下去會告訴你兩個中心差了幾公釐。',
        mount: mount,
        score: SCORE,
        test: { corners: corners, centerErr: centerErr, heartShape: heartShape, makeStamp: makeStamp, startOf: startOf, toMm: toMm, makeRound: makeRound, insideStamp: insideStamp, zoomFor: zoomFor, rating: rating, FW: FW, FH: FH, PAPER: PAPER, PAPER_TILT: PAPER_TILT, PAPER_TILT_MIN: PAPER_TILT_MIN, MARK_LEG: MARK_LEG, FRAME_OFF: FRAME_OFF, HEART_W: HEART_W, INNER_K: INNER_K, GRAB: GRAB, COLORS: COLORS, WIDTHS: WIDTHS, DASHES: DASHES, GAPS: GAPS, HEART_N: HEART_N, STAMP_BOTTOM: STAMP_BOTTOM, PX_MM: PX_MM }
    };
    Reaction.register(G);
})();
