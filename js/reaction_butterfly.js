/* ═══════════════════════════════════════════════════════════════════
   reaction_butterfly.js — 秒反應・蝴蝶不對稱（企劃 344）
   一隻蝴蝶，左右翅膀應該是鏡射對稱的，但**有一個地方不對稱**（一個斑點的大小、一個斑點的顏色、一條紋路的方向）。點那個地方。
   ───────────────────────────────────────────────────────────────────
   · 蝴蝶怎麼畫：先在右翅膀（以身體中線 x ＝ CENTER 為對稱軸，右邊）隨機放斑點與紋路，左翅膀就是同樣的東西左右翻過來
     （x → 2×CENTER − x），再把其中一個東西改掉（makeLevel 的 mod：種類、第幾個、改在左還是右、改了多少）。
   · 三種差異（隨關卡出現）：'size' 斑點的半徑差（40% → 8%）、'color' 斑點的顏色差（色相轉 50° → 12°）、'angle' 紋路的角度差（40° → 8°）。
     第 COLOR_FROM 關起有顏色差、第 ANGLE_FROM 關起有紋路角度差。
   · 難度（線性）：斑點 4 → 20 個（SPOTS）、差異越來越小（上面三個）、限時 15 → 8 秒（TIME_S）；第 TILT_FROM 關起整隻蝴蝶微微歪斜（對稱軸不是直的，最多 TILT_MAX°）。
   · 判定：點在「被改掉的那個東西」或「它在另一邊的鏡像」附近（半徑＋HIT_EXTRA）。把點擊座標先轉回沒歪斜的座標系再比（isHit）。
   · 揭曉：左翅膀翻過去疊到右邊（半透明），不一樣的地方閃紅圈，並寫出差了多少。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'butterfly';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 24;                       /* 幾關之後難度到頂 */
    var SPOTS = [4, 20];                        /* 斑點數：第 1 關 → 到頂 */
    var SIZE_DIFF = [0.40, 0.08];               /* 斑點半徑的差（比例）：第 1 關 → 到頂 */
    var HUE_DIFF = [50, 12];                    /* 斑點顏色的差（色相轉幾度）：第 1 關 → 到頂 */
    var ANGLE_DIFF = [40, 8];                   /* 紋路角度的差（度）：第 1 關 → 到頂 */
    var TIME_S = [15, 8];                       /* 每關限時（秒）：第 1 關 → 到頂 */
    var COLOR_FROM = 4, ANGLE_FROM = 8;         /* 第幾關起有顏色差、紋路角度差 */
    var TILT_FROM = 10, TILT_MAX = 9;           /* 第幾關起整隻蝴蝶歪斜、最多歪幾度 */
    var HIT_EXTRA = 16;                         /* 點擊判定比東西本身多幾（viewBox 單位） */
    var VB = { w: 400, h: 300 }, CENTER = 200;  /* 蝴蝶的座標系：寬 400、高 300，身體中線在 x ＝ 200 */
    var MAX_LEVEL = 60;
    var COLORS = ['orange', 'yellow', 'blue', 'white', 'red'];
    /* 右翅膀的兩片：上翅（大）、下翅（小）都用橢圓近似，斑點與紋路放在裡面（中心 cx, cy、半徑 rx, ry） */
    var LOBES = [{ cx: 290, cy: 105, rx: 88, ry: 66 }, { cx: 272, cy: 205, rx: 62, ry: 52 }];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function spotsFor(level) { return Math.round(ramp(level, SPOTS)); }
    function sizeDiffFor(level) { return Math.round(ramp(level, SIZE_DIFF) * 1000) / 1000; }
    function hueDiffFor(level) { return Math.round(ramp(level, HUE_DIFF) * 10) / 10; }
    function angleDiffFor(level) { return Math.round(ramp(level, ANGLE_DIFF) * 10) / 10; }
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }
    function tiltMaxFor(level) { return level < TILT_FROM ? 0 : TILT_MAX * Math.min(1, (level - TILT_FROM + 1) / (RAMP_LEVELS - TILT_FROM + 1)); }
    function kindsFor(level) { var k = ['size']; if (level >= COLOR_FROM) k.push('color'); if (level >= ANGLE_FROM) k.push('angle'); return k; }
    /* 斑點的半徑：斑點越多越小（20 個時約 5、4 個時 14） */
    function spotRadius(n) { return Math.max(5, 14 - (n - 4) * 0.55); }
    function inLobe(x, y, r) { return LOBES.some(function (l) { var dx = (x - l.cx) / (l.rx - r - 4), dy = (y - l.cy) / (l.ry - r - 4); return dx * dx + dy * dy <= 1; }); }
    /* 出一關：{ spots（右翅膀的斑點 [{ x, y, r, c（顏色編號）}]）, stripes（[{ x, y, len, ang }]）, mod: { kind, index（第幾個，在 spots 或 stripes 裡）, side（'L'｜'R'：改在哪一邊）, delta（改了多少：比例／度）}, tilt（整隻蝴蝶歪幾度）, timeMs, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = spotsFor(level), r0 = spotRadius(n), spots = [], stripes = [], guard = 0, i;
        function free(x, y, r) { for (var k = 0; k < spots.length; k++) if (Math.hypot(spots[k].x - x, spots[k].y - y) < spots[k].r + r + 6) return false; for (k = 0; k < stripes.length; k++) if (Math.hypot(stripes[k].x - x, stripes[k].y - y) < stripes[k].len / 2 + r + 4) return false; return true; }
        /* 先放紋路（比較大、數量少），再放斑點（斑點會自己避開紋路）；這樣斑點多到 20 個也放得下 */
        var ns = Math.max(2, Math.round(n / 4)); guard = 0;
        while (stripes.length < ns && guard++ < 4000) {
            var len = kit.randFloat(22, 32, rand), sx = kit.randFloat(CENTER + 24, 392, rand), sy = kit.randFloat(24, 270, rand);
            if (inLobe(sx, sy, len / 2) && free(sx, sy, len / 2)) stripes.push({ x: sx, y: sy, len: len, ang: kit.randFloat(0, 180, rand) });
        }
        guard = 0;
        while (spots.length < n && guard++ < 8000) {
            var r = r0 * kit.randFloat(0.8, 1.2, rand), x = kit.randFloat(CENTER + 24, 392, rand), y = kit.randFloat(24, 270, rand);
            if (inLobe(x, y, r * 1.1) && free(x, y, r)) spots.push({ x: x, y: y, r: r, c: kit.randInt(0, COLORS.length - 1, rand) });
        }
        var kinds = kindsFor(level), kind = kit.pick(kinds, rand), mod;
        if (kind === 'size') mod = { kind: 'size', index: kit.randInt(0, spots.length - 1, rand), delta: sizeDiffFor(level) * (rand() < 0.5 ? 1 : -1) };
        else if (kind === 'color') mod = { kind: 'color', index: kit.randInt(0, spots.length - 1, rand), delta: hueDiffFor(level) * (rand() < 0.5 ? 1 : -1) };
        else mod = { kind: 'angle', index: kit.randInt(0, stripes.length - 1, rand), delta: angleDiffFor(level) * (rand() < 0.5 ? 1 : -1) };
        mod.side = rand() < 0.5 ? 'L' : 'R';
        var tm = tiltMaxFor(level), tilt = tm ? kit.randFloat(-tm, tm, rand) : 0;
        if (tm && Math.abs(tilt) < tm * 0.4) tilt = (tilt < 0 ? -1 : 1) * tm * 0.4;
        return { spots: spots, stripes: stripes, mod: mod, tilt: tilt, timeMs: timeMs(level), level: level };
    }
    /* 一邊翅膀實際要畫的東西（以右翅膀的座標）：mod 只套在被改的那一邊（沒有就傳 null）。回傳 { spots（[{ x, y, r, c, hue }]）, stripes（[{ x, y, len, ang }]）} */
    function wingElements(q, mod) {
        return {
            spots: q.spots.map(function (s, i) { var hit = mod && mod.index === i; return { x: s.x, y: s.y, r: hit && mod.kind === 'size' ? s.r * (1 + mod.delta) : s.r, c: s.c, hue: hit && mod.kind === 'color' ? mod.delta : 0 }; }),
            stripes: q.stripes.map(function (s, i) { var hit = mod && mod.kind === 'angle' && mod.index === i; return { x: s.x, y: s.y, len: s.len, ang: s.ang + (hit ? mod.delta : 0) }; })
        };
    }
    /* 被改的東西的位置（兩邊各一：R 在右、L 是它的鏡像）；回傳 { right: { x, y, r }, left: { x, y, r }, modSide } */
    function modTarget(q) {
        var m = q.mod, e = m.kind === 'angle' ? q.stripes[m.index] : q.spots[m.index], r = m.kind === 'angle' ? e.len / 2 : e.r;
        return { right: { x: e.x, y: e.y, r: r }, left: { x: 2 * CENTER - e.x, y: e.y, r: r } };
    }
    /* 檢視座標（viewBox 單位，已含歪斜）→ 沒歪斜的座標：繞蝴蝶中心 (CENTER, VB.h/2) 轉 −tilt 度 */
    function untilt(x, y, tilt) {
        var a = -tilt * Math.PI / 180, dx = x - CENTER, dy = y - VB.h / 2;
        return { x: CENTER + dx * Math.cos(a) - dy * Math.sin(a), y: VB.h / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
    }
    /* 點在 (x, y)（檢視座標）算不算點中「不對稱的地方」：離被改的東西（或它的鏡像）夠近 */
    function isHit(q, x, y) {
        var p = untilt(x, y, q.tilt), t = modTarget(q);
        return Math.hypot(p.x - t.right.x, p.y - t.right.y) <= t.right.r + HIT_EXTRA || Math.hypot(p.x - t.left.x, p.y - t.left.y) <= t.left.r + HIT_EXTRA;
    }
    /* 差異的文字說明 */
    function describeMod(m) {
        if (m.kind === 'size') return '斑點的大小差了 ' + (Math.abs(m.delta) * 100).toFixed(0) + '%';
        if (m.kind === 'color') return '斑點的顏色差了（色相轉 ' + Math.abs(m.delta).toFixed(0) + '°）';
        return '紋路的方向差了 ' + Math.abs(m.delta).toFixed(0) + '°';
    }
    function rating(n) {
        if (n >= 15) return '火眼金睛！';
        if (n >= 10) return '對稱難不倒你！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '把一邊翅膀在腦中翻過去比一比！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'btf-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 畫一邊翅膀（右邊）：兩片翅膀、斑點、紋路；mods 是要套在這一邊的修改（只有被改的那一邊才有）。回傳畫好的 <g> */
    function drawWing(parent, q, mod) {
        var g = kit.svg('g', {}, parent), el = wingElements(q, mod);
        kit.svg('path', { 'class': 'btf-wing', d: 'M200,140 C232,18 372,18 388,112 C394,152 300,162 200,150 Z' }, g);
        kit.svg('path', { 'class': 'btf-wing btf-wing--low', d: 'M200,150 C300,162 348,192 332,244 C320,288 244,282 200,192 Z' }, g);
        el.stripes.forEach(function (s) {
            var a = s.ang * Math.PI / 180, dx = Math.cos(a) * s.len / 2, dy = Math.sin(a) * s.len / 2;
            kit.svg('line', { 'class': 'btf-stripe', x1: s.x - dx, y1: s.y - dy, x2: s.x + dx, y2: s.y + dy }, g);
        });
        el.spots.forEach(function (s) {
            var c = kit.svg('circle', { 'class': 'btf-spot btf-c--' + COLORS[s.c], cx: s.x, cy: s.y, r: s.r }, g);
            if (s.hue) c.style.filter = 'hue-rotate(' + s.hue + 'deg) brightness(' + (1 + (s.hue > 0 ? 0.12 : -0.12)) + ')';
        });
        return g;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), m = q.mod;
        api.info = q;
        console.log('[蝴蝶不對稱] 第 ' + level + ' 關：斑點 ' + q.spots.length + '、紋路 ' + q.stripes.length + '；差異＝' + describeMod(m) + '（第 ' + m.index + ' 個，改在' + (m.side === 'R' ? '右' : '左') + '邊）；歪斜 ' + q.tilt.toFixed(1) + '°；限時 ' + q.timeMs + ' 毫秒');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, BW = Math.min(W - 16, 460), BH = Math.round(BW * VB.h / VB.w), scale = BW / VB.w;
        var field = h('div', { 'class': 'btf-field' });
        stage.appendChild(field);
        field.appendChild(h('div', { 'class': 'qz-note btf-tip', text: '左右翅膀哪裡不一樣？點那個地方' }));
        var svg = kit.svg('svg', { 'class': 'btf-svg', viewBox: '0 0 ' + VB.w + ' ' + VB.h, width: BW, height: BH }, field);
        svg.style.cssText = 'left:' + Math.round((W - BW) / 2) + 'px;top:80px;';
        var tilt = kit.svg('g', { transform: 'rotate(' + q.tilt.toFixed(2) + ' ' + CENTER + ' ' + VB.h / 2 + ')' }, svg);
        /* 右翅膀（可能被改）、左翅膀（右翅膀左右翻過來；可能被改）、身體和觸角 */
        drawWing(tilt, q, m.side === 'R' ? m : null);
        var gl = kit.svg('g', { transform: 'translate(' + 2 * CENTER + ',0) scale(-1,1)' }, tilt);
        drawWing(gl, q, m.side === 'L' ? m : null);
        kit.svg('ellipse', { 'class': 'btf-body', cx: CENTER, cy: 150, rx: 8, ry: 74 }, tilt);
        kit.svg('path', { 'class': 'btf-antenna', d: 'M196,80 Q184,50 170,40 M204,80 Q216,50 230,40' }, tilt);
        var overlay = kit.svg('g', {}, tilt);
        var info = h('div', { 'class': 'qz-note btf-info', text: '' }); info.style.top = (80 + BH + 12) + 'px'; field.appendChild(info);
        var done = false;
        api.timer(q.timeMs, function () { judge(null); });
        if (level === 1 && kit.once('butterfly.hint')) { var t = modTarget(q), side = m.side === 'R' ? t.right : t.left; kit.hintOn(stage, null, { mode: 'tap', x: Math.round((W - BW) / 2) + side.x * scale, y: 80 + side.y * scale, delay: 1500, text: '請點不對稱的地方' }); }
        kit.onTap(svg, function (e) {
            if (done || api.over) return;
            var p = kit.localPt(e, svg); judge({ x: p.x / scale, y: p.y / scale });
        });
        function judge(pt) {
            if (done || api.over) return;
            done = true;
            var ok = pt != null && isHit(q, pt.x, pt.y), t = modTarget(q);
            /* 揭曉：左翅膀翻過去，半透明地疊在右翅膀上（左翅膀本身留在原地），不一樣的地方會出現「重影」，並閃紅圈 */
            var ghost = drawWing(overlay, q, m.side === 'L' ? m : null); ghost.setAttribute('class', 'btf-ghost');
            [t.right, t.left].forEach(function (s) { kit.svg('circle', { 'class': 'btf-ring', cx: s.x, cy: s.y, r: s.r + 10 }, overlay); });
            if (pt) kit.svg('circle', { 'class': 'btf-tap ' + (ok ? 'btf-tap--ok' : 'btf-tap--bad'), cx: untilt(pt.x, pt.y, q.tilt).x, cy: untilt(pt.x, pt.y, q.tilt).y, r: 14 }, overlay);
            info.textContent = (ok ? '找到了！' : (pt ? '點錯了，' : '時間到！')) + describeMod(m);
            kit.flash(stage, ok, api.my);
            if (ok) { api.pass({ delay: 1800 }); return; }
            api.fail({ delay: 3200, lines: [pt ? '點的地方是對稱的' : '時間到！', describeMod(m) + '（紅圈）'] });
        }
        /* 驗證用：solve＝點被改的那個東西（歪斜後的位置）、wrong＝點蝴蝶身體上一個不相干的地方 */
        function toView(x, y) { var a = q.tilt * Math.PI / 180, dx = x - CENTER, dy = y - VB.h / 2; return { x: CENTER + dx * Math.cos(a) - dy * Math.sin(a), y: VB.h / 2 + dx * Math.sin(a) + dy * Math.cos(a) }; }
        api.solve = function () { var t = modTarget(q), s = m.side === 'R' ? t.right : t.left, p = toView(s.x, s.y); judge(p); };
        api.wrong = function () { judge(toView(CENTER, 8)); };
    }

    var G = {
        id: ID,
        name: '蝴蝶不對稱',
        rule: '一隻蝴蝶，**左右兩邊翅膀應該是鏡射對稱的**，但**有一個地方不對稱**——可能是一個斑點的大小、一個斑點的顏色、或一條紋路的方向。**點那個地方**（點它或它在另一邊的對應位置都算）。要在腦中把一邊翅膀左右翻過來比，比並排找碴難很多。越後面，差異越小、斑點越多，第 10 關起蝴蝶還會**微微歪斜**（對稱軸不是直的）！答錯或來不及就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        test: {
            spotsFor: spotsFor, sizeDiffFor: sizeDiffFor, hueDiffFor: hueDiffFor, angleDiffFor: angleDiffFor, timeMs: timeMs, tiltMaxFor: tiltMaxFor, kindsFor: kindsFor, spotRadius: spotRadius, inLobe: inLobe, makeLevel: makeLevel, wingElements: wingElements, modTarget: modTarget, untilt: untilt, isHit: isHit, describeMod: describeMod, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SPOTS: SPOTS, SIZE_DIFF: SIZE_DIFF, HUE_DIFF: HUE_DIFF, ANGLE_DIFF: ANGLE_DIFF, TIME_S: TIME_S, COLOR_FROM: COLOR_FROM, ANGLE_FROM: ANGLE_FROM, TILT_FROM: TILT_FROM, TILT_MAX: TILT_MAX, HIT_EXTRA: HIT_EXTRA, VB: VB, CENTER: CENTER, COLORS: COLORS, LOBES: LOBES, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
