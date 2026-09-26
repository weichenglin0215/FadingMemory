/* ═══════════════════════════════════════════════════════════════════
   waterflow.js — 紙條消失的水流特效（1.7.0 起停用：5→1 倒數引起玩家反彈，已取消；檔案保留備用）
   ★ 目前沒有任何頁面載入這個檔案。要再用：把 'js/waterflow.js' 與 'css/waterflow.css'
     加回 js/boot.js 的 PAGES，再呼叫 WaterNote.play({ stage, note, onTick })。
   參考 flower-moon/waterFlow.js 的 GPU 流體模擬（Stable Fluids）：
   平流 → 散度 → 壓力（Jacobi）→ 梯度修正 → 潑濺 → 顯示。
   ───────────────────────────────────────────────────────────────────
   WaterNote.play({ stage, note, onTick }) → Promise
     stage   舞台元素（#stage），特效蓋在整個舞台上
     note    紙條元素（.note）：會被「複製」進水裡，讓水流直接攪動紙條本身
     onTick  每出現一個數字時呼叫 onTick(5…1)（正式模式拿來念出聲）
   Promise 在畫面開始模糊、切到題目時 resolve（約 6.4 秒），特效層再 0.8 秒後移除。
   ───────────────────────────────────────────────────────────────────
   為什麼要「複製紙條」：
     瀏覽器不讓 WebGL 讀取網頁上的像素，水流只能畫在另一層畫布上。
     所以一開始先照著紙條在畫面上的實際位置，把卡片（底色、邊條、圓角、陰影）
     和每一個字（位置、字型、顏色）一模一樣畫進 GPU，蓋在原本的紙條上（看起來沒有變化），
     之後水流推動的就是紙條本身的像素：字會跟著水被攪動、拉長、捲起來。
   ───────────────────────────────────────────────────────────────────
   時間軸（秒）：
     0.00–0.15  複製紙條（畫面不變）
     0.15–6.40  倒數 5 4 3 2 1，每個數字 1.25 秒：
                  0.00–0.20  數字直接寫在紙條上，浮現成完整、清楚的一個字（這時水流碰不到它）
                  0.45       把數字放進水裡，一支看不見的筆照書寫筆順沿著筆畫推水
                  0.45–1.00  數字和底下的紙條一起被攪動
                  之後       水流平靜下來，墨色自然變淡；下一個數字直接寫在被攪亂的紙條上
     6.40–7.20  畫面模糊、淡出，切到題目
   顏色：css/theme.css 的 --flow-ink-5…1、--flow-stroke。
   不支援半浮點 WebGL 的裝置：數字直接疊在紙條上淡入淡出，節奏相同。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var LW = 500;
    var LH = 850;

    /* ── 時間軸 ── */
    var T_START = 0.15;
    var T_DIGIT = 1.25;
    var T_STAMP = 0.2;              /* 數字浮現 */
    var T_TRACE0 = 0.45;            /* 完整的數字先清楚停留，這時才放進水裡、開始沿筆畫推水 */
    var T_TRACE1 = 1.0;
    var T_LEAVE = 0.8;
    var LEAVE_AT = T_START + 5 * T_DIGIT;

    /* ── 流體參數（沿用 waterFlow.js，改成「在紙條上寫字、攪水」用）── */
    var SIM_RES = 96;               /* 速度／壓力場解析度 */
    var DYE_RES = 512;              /* 墨色場解析度 */
    var PAGE_MAX = 1100;            /* 紙條複本的最大寬度（裝置像素），字才夠清楚 */
    /* 「稀」的水：動量保留得久（VELOCITY_DISSIPATION 小）、壓力解得細（推力會往外擴散）、
       加上渦度強化（CURL，讓漩渦持續捲動、往外帶）。調大 VELOCITY_DISSIPATION、調小 CURL → 越來越「濃稠」 */
    var PRESSURE_ITER = 24;
    var VELOCITY_DISSIPATION = 0.12; /* 水流迴旋多久才停（越小越稀、越持久） */
    var CURL = 9;                   /* 渦度強化：漩渦自己持續捲動 */
    var VELOCITY_CALM = 3.5;        /* 新數字清楚停留的 0.45 秒裡壓住殘留的水流，數字放進水裡時才不會馬上整個被沖歪 */
    var INK_FADE = 0.4;             /* 墨色自然變淡的速度（不刻意洗掉） */
    var SPLAT_RADIUS = 0.0016;      /* 筆刷推水的範圍（寬一點，推動一整帶的水） */
    var STIR_FORCE = 46;            /* 筆刷沿筆畫推水的力道 */
    var STIR_WAVE = 0.7;            /* 左右擺動，攪出漩渦 */
    var BRUSH_DYE = 0.05;           /* 筆刷順便帶一點墨，留下水痕 */
    var STEP = 9;                   /* 每隔幾個邏輯 px 推一次水 */
    var MAX_ALPHA = 0.92;
    var GAIN = 1.25;
    var TONE = 0.8;                 /* 墨色稍微壓深，像水彩畫在宣紙上 */

    /* ── 數字的筆畫（照書寫筆順；座標是 0～1 的方框，y 往下）── */
    var BOX = { x: 60, y: 140, w: 380, h: 580 };
    var STROKES = {
        5: [[[0.74, 0.10], [0.34, 0.10]], [[0.34, 0.10], [0.31, 0.44]],
            [[0.31, 0.44], [0.47, 0.39], [0.64, 0.41], [0.76, 0.52], [0.79, 0.66], [0.73, 0.80], [0.57, 0.89], [0.38, 0.89], [0.23, 0.81]]],
        4: [[[0.64, 0.10], [0.18, 0.64]], [[0.18, 0.64], [0.85, 0.64]], [[0.64, 0.10], [0.64, 0.92]]],
        3: [[[0.25, 0.20], [0.38, 0.12], [0.55, 0.10], [0.70, 0.16], [0.74, 0.29], [0.66, 0.40], [0.46, 0.46]],
            [[0.46, 0.46], [0.66, 0.50], [0.78, 0.62], [0.77, 0.76], [0.64, 0.87], [0.45, 0.90], [0.25, 0.83]]],
        2: [[[0.23, 0.25], [0.32, 0.14], [0.50, 0.09], [0.67, 0.14], [0.76, 0.27], [0.71, 0.42], [0.52, 0.61], [0.23, 0.90]],
            [[0.23, 0.90], [0.81, 0.90]]],
        1: [[[0.30, 0.25], [0.53, 0.10]], [[0.53, 0.10], [0.53, 0.90]], [[0.30, 0.90], [0.76, 0.90]]]
    };

    /* ─── 小工具 ─── */
    function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
    function cssVar(name) {
        try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (e) { return ''; }
    }
    function parseColor(s) {
        s = String(s || '').trim();
        var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
        if (m) {
            var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
            var n = parseInt(h, 16);
            return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
        }
        m = /rgba?\(([^)]+)\)/.exec(s);
        if (m) {
            var p = m[1].split(',').map(parseFloat);
            return [p[0] / 255, p[1] / 255, p[2] / 255];
        }
        return null;
    }
    var FALLBACK_INK = { 5: '#8A6CC8', 4: '#3E86C4', 3: '#4C9A5B', 2: '#E0AA25', 1: '#D9483B' };   /* 紫藍綠黃紅 */
    function inkOf(n) { return parseColor(cssVar('--flow-ink-' + n)) || parseColor(FALLBACK_INK[n]); }
    function cssRgb(c) { return 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')'; }

    /* 筆畫 → 平滑折線（Catmull-Rom），並算出累積長度 */
    function buildPath(n) {
        var strokes = STROKES[n].map(function (raw) {
            var P = raw.map(function (q) { return { x: BOX.x + q[0] * BOX.w, y: BOX.y + q[1] * BOX.h }; });
            var pts = [];
            if (P.length === 2) {
                for (var s = 0; s <= 12; s++) pts.push({ x: P[0].x + (P[1].x - P[0].x) * s / 12, y: P[0].y + (P[1].y - P[0].y) * s / 12 });
            } else {
                for (var i = 0; i < P.length - 1; i++) {
                    var p0 = P[Math.max(0, i - 1)];
                    var p1 = P[i];
                    var p2 = P[i + 1];
                    var p3 = P[Math.min(P.length - 1, i + 2)];
                    for (var k = 0; k < 10; k++) {
                        var t = k / 10;
                        var t2 = t * t;
                        var t3 = t2 * t;
                        pts.push({
                            x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                            y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
                        });
                    }
                }
                pts.push(P[P.length - 1]);
            }
            var cum = [0];
            for (var j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y));
            return { pts: pts, cum: cum, len: cum[cum.length - 1] };
        });
        var total = 0;
        strokes.forEach(function (s) { s.start = total; total += s.len; });
        return { strokes: strokes, total: total };
    }

    /* 沿著筆畫走到距離 d 的位置與方向 */
    function pointAt(path, d) {
        for (var i = 0; i < path.strokes.length; i++) {
            var s = path.strokes[i];
            if (d > s.start + s.len && i < path.strokes.length - 1) continue;
            var l = clamp(d - s.start, 0, s.len);
            var j = 1;
            while (j < s.cum.length - 1 && s.cum[j] < l) j++;
            var a = s.pts[j - 1];
            var b = s.pts[j];
            var seg = s.cum[j] - s.cum[j - 1] || 1;
            var f = (l - s.cum[j - 1]) / seg;
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            var m = Math.hypot(dx, dy) || 1;
            return { x: a.x + dx * f, y: a.y + dy * f, dx: dx / m, dy: dy / m };
        }
        return null;
    }

    /* ─── 複製紙條：照 DOM 的實際位置，把卡片和每一個字畫到畫布上 ─── */
    function parseShadow(s) {
        /* "rgba(80, 50, 20, 0.2) 0px 4px 14px 0px" → 只取第一組 */
        if (!s || s === 'none') return null;
        var col = /(rgba?\([^)]+\)|#[0-9a-f]{3,8})/i.exec(s);
        var nums = s.replace(/(rgba?\([^)]+\)|#[0-9a-f]{3,8})/ig, '').match(/-?[\d.]+px/g) || [];
        if (!col || nums.length < 3) return null;
        return { color: col[1], x: parseFloat(nums[0]), y: parseFloat(nums[1]), blur: parseFloat(nums[2]) };
    }
    function drawNoteReplica(note, stage, W, H) {
        var cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        var g = cv.getContext('2d');
        var sb = stage.getBoundingClientRect();
        var ss = sb.width / LW || 1;            /* 螢幕 px ÷ 邏輯 px */
        var k = W / LW;                          /* 畫布 px ÷ 邏輯 px */
        function X(cx) { return (cx - sb.left) / ss * k; }
        function Y(cy) { return (cy - sb.top) / ss * k; }

        /* 卡片 */
        var cs = getComputedStyle(note);
        var nb = note.getBoundingClientRect();
        var x = X(nb.left);
        var y = Y(nb.top);
        var w = nb.width / ss * k;
        var h = nb.height / ss * k;
        var radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius]
            .map(function (r) { return (parseFloat(r) || 0) * k; });
        function card() {
            g.beginPath();
            if (g.roundRect) g.roundRect(x, y, w, h, radii); else g.rect(x, y, w, h);
        }
        var sh = parseShadow(cs.boxShadow);
        g.save();
        if (sh) {
            g.shadowColor = sh.color;
            g.shadowOffsetX = sh.x * k;
            g.shadowOffsetY = sh.y * k;
            g.shadowBlur = sh.blur * k;
        }
        card();
        g.fillStyle = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '#FFFDF4';
        g.fill();
        g.restore();
        g.save();
        card();
        g.clip();
        var bl = parseFloat(cs.borderLeftWidth) || 0;
        if (bl) { g.fillStyle = cs.borderLeftColor; g.fillRect(x, y, bl * k, h); }
        var bt = parseFloat(cs.borderTopWidth) || 0;
        if (bt && cs.borderTopStyle !== 'none') { g.fillStyle = cs.borderTopColor; g.fillRect(x, y, w, bt * k); }
        g.restore();

        /* 每一個字：用 Range 取得它在畫面上的確切位置，照原本的字型與顏色畫上去 */
        var range = document.createRange();
        var walker = document.createTreeWalker(note, NodeFilter.SHOW_TEXT, null, false);
        var node;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        while ((node = walker.nextNode())) {
            var el = node.parentElement;
            var ecs = getComputedStyle(el);
            if (ecs.visibility === 'hidden' || ecs.display === 'none') continue;
            g.font = ecs.fontStyle + ' ' + ecs.fontWeight + ' ' + (parseFloat(ecs.fontSize) * k) + 'px ' + ecs.fontFamily;
            g.fillStyle = ecs.color;
            var text = node.textContent;
            for (var i = 0; i < text.length; i++) {
                var ch = text[i];
                if (!ch.trim()) continue;
                /* 代理對（罕用字）一次取兩個字元 */
                var len = (ch.charCodeAt(0) >= 0xD800 && ch.charCodeAt(0) <= 0xDBFF) ? 2 : 1;
                range.setStart(node, i);
                range.setEnd(node, Math.min(text.length, i + len));
                var r = range.getBoundingClientRect();
                if (r.width && r.height) g.fillText(text.substr(i, len), X(r.left + r.width / 2), Y(r.top + r.height / 2));
                i += len - 1;
            }
        }
        return cv;
    }

    /* ─── 著色器（與 waterFlow.js 相同的流體管線，多了「蓋章」「複製紙條」「紙條＋墨色合成」）─── */
    var VERT = [
        'precision highp float;',
        'attribute vec2 aPosition;',
        'varying vec2 vUv;',
        'void main(){ vUv = aPosition * 0.5 + 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }'
    ].join('\n');
    var FRAG_ADVECTION = [
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform sampler2D uVelocity;',
        'uniform sampler2D uSource;',
        'uniform vec2 texelSize;',
        'uniform float dt;',
        'uniform float dissipation;',
        'void main(){',
        '  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;',
        '  gl_FragColor = texture2D(uSource, coord) / (1.0 + dissipation * dt);',
        '}'
    ].join('\n');
    /* 渦度：速度場的旋轉量 */
    var FRAG_CURL = [
        'precision mediump float;',
        'varying vec2 vUv;',
        'uniform sampler2D uVelocity;',
        'uniform vec2 texelSize;',
        'void main(){',
        '  float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0.0)).y;',
        '  float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0.0)).y;',
        '  float T = texture2D(uVelocity, vUv + vec2(0.0, texelSize.y)).x;',
        '  float B = texture2D(uVelocity, vUv - vec2(0.0, texelSize.y)).x;',
        '  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);',
        '}'
    ].join('\n');
    /* 渦度強化：把細小的漩渦補回來，稀的水才會一直捲、一直往外帶 */
    var FRAG_VORTICITY = [
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform sampler2D uVelocity;',
        'uniform sampler2D uCurl;',
        'uniform vec2 texelSize;',
        'uniform float curl;',
        'uniform float dt;',
        'void main(){',
        '  float L = texture2D(uCurl, vUv - vec2(texelSize.x, 0.0)).x;',
        '  float R = texture2D(uCurl, vUv + vec2(texelSize.x, 0.0)).x;',
        '  float T = texture2D(uCurl, vUv + vec2(0.0, texelSize.y)).x;',
        '  float B = texture2D(uCurl, vUv - vec2(0.0, texelSize.y)).x;',
        '  float C = texture2D(uCurl, vUv).x;',
        '  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));',
        '  force /= length(force) + 0.0001;',
        '  force *= curl * C;',
        '  force.y *= -1.0;',
        '  vec2 vel = texture2D(uVelocity, vUv).xy + force * dt;',
        '  gl_FragColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);',
        '}'
    ].join('\n');
    var FRAG_DIVERGENCE = [
        'precision mediump float;',
        'varying vec2 vUv;',
        'uniform sampler2D uVelocity;',
        'uniform vec2 texelSize;',
        'void main(){',
        '  float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;',
        '  float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;',
        '  float B = texture2D(uVelocity, vUv - vec2(0.0, texelSize.y)).y;',
        '  float T = texture2D(uVelocity, vUv + vec2(0.0, texelSize.y)).y;',
        '  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);',
        '}'
    ].join('\n');
    var FRAG_PRESSURE = [
        'precision mediump float;',
        'varying vec2 vUv;',
        'uniform sampler2D uPressure;',
        'uniform sampler2D uDivergence;',
        'uniform vec2 texelSize;',
        'void main(){',
        '  float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;',
        '  float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;',
        '  float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;',
        '  float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;',
        '  float div = texture2D(uDivergence, vUv).x;',
        '  gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);',
        '}'
    ].join('\n');
    var FRAG_GRADIENT = [
        'precision mediump float;',
        'varying vec2 vUv;',
        'uniform sampler2D uPressure;',
        'uniform sampler2D uVelocity;',
        'uniform vec2 texelSize;',
        'void main(){',
        '  float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;',
        '  float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;',
        '  float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;',
        '  float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;',
        '  vec2 v = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B) * 0.5;',
        '  gl_FragColor = vec4(v, 0.0, 1.0);',
        '}'
    ].join('\n');
    var FRAG_SPLAT = [
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform sampler2D uTarget;',
        'uniform float aspectRatio;',
        'uniform vec3 color;',
        'uniform vec2 point;',
        'uniform float radius;',
        'void main(){',
        '  vec2 p = vUv - point;',
        '  p.x *= aspectRatio;',
        '  gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + exp(-dot(p, p) / radius) * color, 1.0);',
        '}'
    ].join('\n');
    /* 蓋章：把畫好的數字（alpha）乘上顏色加進墨色場 */
    var FRAG_STAMP = [
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform sampler2D uTarget;',
        'uniform sampler2D uStamp;',
        'uniform vec3 color;',
        'uniform float amount;',
        'void main(){',
        '  gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + texture2D(uStamp, vUv).a * color * amount, 1.0);',
        '}'
    ].join('\n');
    /* 複製：把紙條複本（一般貼圖）搬進可以被水流推動的浮點畫布 */
    var FRAG_COPY = [
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform sampler2D uTexture;',
        'void main(){ gl_FragColor = texture2D(uTexture, vUv); }'
    ].join('\n');
    /* 顯示：墨色（保留色相，濃度轉透明度）疊在被水流攪動的紙條上 */
    var FRAG_DISPLAY = [
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform sampler2D uPage;',
        'uniform sampler2D uInk;',
        'uniform float uMaxAlpha;',
        'uniform float uGain;',
        'uniform float uTone;',
        'uniform sampler2D uStamp;',
        'uniform float uOverlay;',
        'uniform vec3 uOColor;',
        'void main(){',
        '  vec4 page = texture2D(uPage, vUv);',
        '  vec3 c = texture2D(uInk, vUv).rgb;',
        '  float m = max(c.r, max(c.g, c.b));',
        '  float a = clamp(m * uGain, 0.0, 1.0) * uMaxAlpha;',
        '  vec3 ink = c / max(m, 0.0001) * uTone * a;',
        '  vec4 col = vec4(ink + page.rgb * (1.0 - a), a + page.a * (1.0 - a));',
        '  float oa = texture2D(uStamp, vUv).a * uOverlay * uMaxAlpha;',
        '  gl_FragColor = vec4(uOColor * uTone * oa + col.rgb * (1.0 - oa), oa + col.a * (1.0 - oa));',
        '}'
    ].join('\n');

    /* ═══ 流體模擬（一次演出建立一套，演完就釋放）═══ */
    function Fluid(canvas, manual) {
        var opts = { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: !!manual };
        var gl = canvas.getContext('webgl2', opts);
        var isWebGL2 = !!gl;
        if (!gl) gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
        if (!gl) throw new Error('沒有 WebGL');
        var halfFloat;
        var fmt;
        var linear;
        if (isWebGL2) {
            if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('不支援浮點畫布');
            halfFloat = gl.HALF_FLOAT;
            fmt = { internal: gl.RGBA16F, format: gl.RGBA };
            linear = true;
        } else {
            var hf = gl.getExtension('OES_texture_half_float');
            if (!hf) throw new Error('不支援半浮點');
            linear = !!gl.getExtension('OES_texture_half_float_linear');
            halfFloat = hf.HALF_FLOAT_OES;
            fmt = { internal: gl.RGBA, format: gl.RGBA };
        }

        function shader(type, src) {
            var s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        }
        function program(frag) {
            var p = gl.createProgram();
            gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT));
            gl.attachShader(p, shader(gl.FRAGMENT_SHADER, frag));
            gl.bindAttribLocation(p, 0, 'aPosition');
            gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
            var u = {};
            var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
            for (var i = 0; i < n; i++) { var name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
            return { program: p, uniforms: u };
        }
        var textures = [];
        var fbos = [];
        function fbo(w, h) {
            gl.activeTexture(gl.TEXTURE0);
            var tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            var f = linear ? gl.LINEAR : gl.NEAREST;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, halfFloat, null);
            var fb = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            gl.viewport(0, 0, w, h);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            textures.push(tex);
            fbos.push(fb);
            return {
                texture: tex, fbo: fb, width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h,
                attach: function (id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; }
            };
        }
        function doubleFbo(w, h) {
            var a = fbo(w, h);
            var b = fbo(w, h);
            return {
                width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h,
                get read() { return a; }, get write() { return b; },
                swap: function () { var t = a; a = b; b = t; }
            };
        }
        /* 驗證半浮點畫布真的能畫（有些舊手機宣稱支援但其實不行） */
        fbo(4, 4);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('半浮點畫布不能用');

        var P = {
            adv: program(FRAG_ADVECTION), div: program(FRAG_DIVERGENCE), prs: program(FRAG_PRESSURE),
            grd: program(FRAG_GRADIENT), spl: program(FRAG_SPLAT), stm: program(FRAG_STAMP),
            cpy: program(FRAG_COPY), dsp: program(FRAG_DISPLAY), crl: program(FRAG_CURL), vor: program(FRAG_VORTICITY)
        };
        var quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        function res(r) { return { w: r, h: Math.round(r * canvas.height / canvas.width) }; }
        var sim = res(SIM_RES);
        var inkR = res(DYE_RES);
        var velocity = doubleFbo(sim.w, sim.h);
        var ink = doubleFbo(inkR.w, inkR.h);
        var page = doubleFbo(canvas.width, canvas.height);
        var divergence = fbo(sim.w, sim.h);
        var curlF = fbo(sim.w, sim.h);
        var pressure = doubleFbo(sim.w, sim.h);

        function plainTex() {
            var t = gl.createTexture();
            textures.push(t);
            return t;
        }
        function upload(tex, cv) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
        var stampTex = plainTex();
        var pageSrc = plainTex();

        function blit(target) {
            if (target) {
                gl.viewport(0, 0, target.width, target.height);
                gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
            } else {
                gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        this.inkSize = inkR;

        /* 放進紙條複本（之後由水流推動） */
        this.setPage = function (cv) {
            upload(pageSrc, cv);
            gl.useProgram(P.cpy.program);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, pageSrc);
            gl.uniform1i(P.cpy.uniforms.uTexture, 0);
            blit(page.write);
            page.swap();
        };

        /* 在邏輯座標 (x, y) 推水：vx、vy 是速度（y 往下），color 是注入的墨 */
        this.splat = function (x, y, vx, vy, color) {
            gl.useProgram(P.spl.program);
            gl.uniform1i(P.spl.uniforms.uTarget, velocity.read.attach(0));
            gl.uniform1f(P.spl.uniforms.aspectRatio, LW / LH);
            gl.uniform2f(P.spl.uniforms.point, x / LW, 1 - y / LH);
            gl.uniform3f(P.spl.uniforms.color, vx, -vy, 0);
            gl.uniform1f(P.spl.uniforms.radius, SPLAT_RADIUS);
            blit(velocity.write);
            velocity.swap();
            if (color) {
                gl.uniform1i(P.spl.uniforms.uTarget, ink.read.attach(0));
                gl.uniform3f(P.spl.uniforms.color, color[0], color[1], color[2]);
                blit(ink.write);
                ink.swap();
            }
        };

        /* 換一個數字：上傳數字的圖（只用 alpha） */
        this.setStamp = function (cv) { upload(stampTex, cv); };
        /* 把數字寫進墨色場（分幾格加完，就有「墨滴暈開」的浮現感） */
        this.stamp = function (color, amount) {
            gl.useProgram(P.stm.program);
            gl.uniform1i(P.stm.uniforms.uTarget, ink.read.attach(0));
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, stampTex);
            gl.uniform1i(P.stm.uniforms.uStamp, 1);
            gl.uniform3f(P.stm.uniforms.color, color[0], color[1], color[2]);
            gl.uniform1f(P.stm.uniforms.amount, amount);
            blit(ink.write);
            ink.swap();
        };

        function advect(field, dt, dissipation) {
            gl.useProgram(P.adv.program);
            gl.uniform2f(P.adv.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(P.adv.uniforms.uVelocity, velocity.read.attach(0));
            gl.uniform1i(P.adv.uniforms.uSource, field.read.attach(1));
            gl.uniform1f(P.adv.uniforms.dt, dt);
            gl.uniform1f(P.adv.uniforms.dissipation, dissipation);
            blit(field.write);
            field.swap();
        }

        this.step = function (dt, velDissipation) {
            gl.disable(gl.BLEND);
            advect(velocity, dt, velDissipation);
            advect(ink, dt, INK_FADE);
            advect(page, dt, 0);                 /* 紙條本身只被推動，不會變淡 */

            /* 渦度強化 */
            gl.useProgram(P.crl.program);
            gl.uniform2f(P.crl.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(P.crl.uniforms.uVelocity, velocity.read.attach(0));
            blit(curlF);
            gl.useProgram(P.vor.program);
            gl.uniform2f(P.vor.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(P.vor.uniforms.uVelocity, velocity.read.attach(0));
            gl.uniform1i(P.vor.uniforms.uCurl, curlF.attach(1));
            gl.uniform1f(P.vor.uniforms.curl, CURL);
            gl.uniform1f(P.vor.uniforms.dt, dt);
            blit(velocity.write);
            velocity.swap();

            gl.useProgram(P.div.program);
            gl.uniform2f(P.div.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(P.div.uniforms.uVelocity, velocity.read.attach(0));
            blit(divergence);

            gl.useProgram(P.prs.program);
            gl.uniform2f(P.prs.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(P.prs.uniforms.uDivergence, divergence.attach(0));
            for (var i = 0; i < PRESSURE_ITER; i++) {
                gl.uniform1i(P.prs.uniforms.uPressure, pressure.read.attach(1));
                blit(pressure.write);
                pressure.swap();
            }

            gl.useProgram(P.grd.program);
            gl.uniform2f(P.grd.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(P.grd.uniforms.uPressure, pressure.read.attach(0));
            gl.uniform1i(P.grd.uniforms.uVelocity, velocity.read.attach(1));
            blit(velocity.write);
            velocity.swap();
        };

        /* overlay：還沒放進水裡的數字（完整、清楚，不受水流影響）的濃度 0～1 */
        this.render = function (overlay, ocolor) {
            gl.useProgram(P.dsp.program);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, stampTex);
            gl.uniform1i(P.dsp.uniforms.uStamp, 2);
            gl.uniform1f(P.dsp.uniforms.uOverlay, overlay || 0);
            gl.uniform3fv(P.dsp.uniforms.uOColor, ocolor || [0, 0, 0]);
            gl.uniform1i(P.dsp.uniforms.uPage, page.read.attach(0));
            gl.uniform1i(P.dsp.uniforms.uInk, ink.read.attach(1));
            gl.uniform1f(P.dsp.uniforms.uMaxAlpha, MAX_ALPHA);
            gl.uniform1f(P.dsp.uniforms.uGain, GAIN);
            gl.uniform1f(P.dsp.uniforms.uTone, TONE);
            blit(null);
        };

        this.destroy = function () {
            Object.keys(P).forEach(function (key) { gl.deleteProgram(P[key].program); });
            textures.forEach(function (t) { gl.deleteTexture(t); });
            fbos.forEach(function (f) { gl.deleteFramebuffer(f); });
            gl.deleteBuffer(quad);
            var lose = gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
        };
    }

    /* 數字的圖：沿筆畫畫粗線（和推水的路徑完全重合），大小＝墨色場 */
    function drawStamp(cv, path, size) {
        var g = cv.getContext('2d');
        g.clearRect(0, 0, cv.width, cv.height);
        var sx = cv.width / LW;
        var sy = cv.height / LH;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.strokeStyle = '#FFF';
        g.lineWidth = size * sx;
        g.shadowColor = '#FFF';
        g.shadowBlur = size * sx * 0.25;
        path.strokes.forEach(function (s) {
            g.beginPath();
            s.pts.forEach(function (p, i) { if (i) g.lineTo(p.x * sx, p.y * sy); else g.moveTo(p.x * sx, p.y * sy); });
            g.stroke();
        });
    }

    /* ═══ 播放 ═══ */
    var WaterNote = {};
    WaterNote.TOTAL = LEAVE_AT + T_LEAVE;

    WaterNote.play = function (o) {
        o = o || {};
        return new Promise(function (resolve) {
            var stage = o.stage || document.getElementById('stage');
            var note = o.note;
            var root = document.createElement('div');
            root.className = 'wflow hit';
            stage.appendChild(root);

            var resolved = false;
            function leave() {
                if (resolved) return;
                resolved = true;
                root.classList.add('is-leaving');
                resolve();
                setTimeout(function () { root.remove(); }, T_LEAVE * 1000 + 50);
            }

            var ctl = null;
            try { ctl = fluidPlay(o, stage, note, root, leave); } catch (e) {
                if (global.console) console.warn('WaterNote: 無法使用流體特效，改用簡易版', e);
                ctl = null;
            }
            if (!ctl) { simplePlay(o, root, leave); return; }
            WaterNote.last = ctl;
            if (!o.manual) ctl.run();
        });
    };

    /* ─── 備案：數字直接疊在紙條上淡入、模糊淡出（一樣的節奏）─── */
    function simplePlay(o, root, leave) {
        [5, 4, 3, 2, 1].forEach(function (n, i) {
            setTimeout(function () {
                var d = document.createElement('div');
                d.textContent = n;
                d.style.cssText = 'position:absolute;left:0;right:0;top:170px;text-align:center;line-height:1;' +
                    'font:900 460px "Noto Sans TC",sans-serif;color:' + cssRgb(inkOf(n)) + ';opacity:0.85;';
                root.appendChild(d);
                if (o.onTick) try { o.onTick(n); } catch (e) { }
                if (d.animate) {
                    d.animate([
                        { opacity: 0, filter: 'blur(8px)' }, { opacity: 0.85, filter: 'blur(0)', offset: 0.2 },
                        { opacity: 0.85, filter: 'blur(0)', offset: 0.5 }, { opacity: 0, filter: 'blur(18px)' }
                    ], { duration: T_DIGIT * 1000, fill: 'forwards' });
                }
                setTimeout(function () { d.remove(); }, T_DIGIT * 1000);
            }, (T_START + i * T_DIGIT) * 1000);
        });
        setTimeout(leave, LEAVE_AT * 1000);
    }

    /* ─── 流體版 ─── */
    function fluidPlay(o, stage, note, root, leave) {
        var cv = document.createElement('canvas');
        cv.className = 'wflow__water';
        var r = global.Stage && Stage.rect ? Stage.rect() : { scale: 1, dpr: 1 };
        /* 紙條複本要和原本一樣清楚：用裝置像素（上限 PAGE_MAX 寬） */
        var W = Math.min(PAGE_MAX, Math.round(LW * (r.scale || 1) * Math.min(r.dpr || 1, 2)));
        cv.width = Math.max(250, W);
        cv.height = Math.round(cv.width * LH / LW);
        var fluid = new Fluid(cv, o.manual);
        root.appendChild(cv);

        /* 複製紙條，蓋在原本的紙條上（畫面不變），再把原本的藏起來 */
        if (note) {
            fluid.setPage(drawNoteReplica(note, stage, cv.width, cv.height));
            fluid.render();
            note.style.visibility = 'hidden';
        }

        var strokeW = parseFloat(cssVar('--flow-stroke')) || 56;
        var stampCv = document.createElement('canvas');
        stampCv.width = fluid.inkSize.w;
        stampCv.height = fluid.inkSize.h;

        var t = 0;
        var cur = -1;
        var digit = null;
        var ended = false;
        var destroyed = false;
        var ctl = {};

        function update(dt) {
            if (destroyed) return;
            t += dt;
            var k = Math.floor((t - T_START) / T_DIGIT);
            if (t >= T_START && k >= 0 && k < 5 && k !== cur) {
                cur = k;
                var n = 5 - k;
                var path = buildPath(n);
                var ink = inkOf(n);
                var m = Math.max(ink[0], ink[1], ink[2]) || 1;
                drawStamp(stampCv, path, strokeW);
                fluid.setStamp(stampCv);
                digit = { n: n, path: path, color: [ink[0] / m, ink[1] / m, ink[2] / m], start: T_START + k * T_DIGIT, inWater: false, overlay: 0, drawn: 0 };
                if (o.onTick) try { o.onTick(n); } catch (e) { }
            }
            var vdiss = VELOCITY_DISSIPATION;
            if (digit) {
                var lt = t - digit.start;
                /* 1. 數字直接寫在紙條上：先是完整、清楚的一層（水流碰不到），停一下讓玩家看清楚 */
                if (!digit.inWater) {
                    digit.overlay = clamp(lt / T_STAMP, 0, 1);
                    if (lt >= T_TRACE0) {
                        /* 放進水裡：同一格把最上層拿掉、寫進墨色場，畫面不會跳 */
                        fluid.stamp(digit.color, 1);
                        digit.inWater = true;
                        digit.overlay = 0;
                    }
                }
                /* 2. 照筆順沿著筆畫推水：數字和底下的紙條一起被攪動 */
                var prog = clamp((lt - T_TRACE0) / (T_TRACE1 - T_TRACE0), 0, 1);
                var target = prog * digit.path.total;
                while (digit.drawn + STEP <= target) {
                    digit.drawn += STEP;
                    var p = pointAt(digit.path, digit.drawn);
                    if (!p) continue;
                    var wave = Math.sin(digit.drawn * 0.06) * STIR_WAVE;
                    var c = digit.color;
                    fluid.splat(p.x, p.y, (p.dx - p.dy * wave) * STIR_FORCE, (p.dy + p.dx * wave) * STIR_FORCE,
                        [c[0] * BRUSH_DYE, c[1] * BRUSH_DYE, c[2] * BRUSH_DYE]);
                }
                /* 3. 筆走完後水繼續往外擴散；只在下一個數字清楚停留時輕輕壓住水流 */
                if (lt < T_TRACE0) vdiss = VELOCITY_CALM;
            }
            fluid.step(Math.min(dt, 1 / 30), vdiss);

            /* 畫面模糊、露出題目；水在淡出的這段時間裡繼續流動，淡完才釋放 */
            if (t >= LEAVE_AT && !ended) {
                ended = true;
                leave();
                setTimeout(function () { destroyed = true; fluid.destroy(); }, T_LEAVE * 1000);
            }
        }

        function draw() { fluid.render(digit ? digit.overlay : 0, digit ? digit.color : null); }

        var last = 0;
        ctl.run = function () {
            function frame(now) {
                if (destroyed) return;
                var dt = last ? Math.min(0.033, (now - last) / 1000) : 1 / 60;
                last = now;
                if (!document.hidden) {
                    update(dt);
                    if (!destroyed) draw();
                }
                requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        };
        /* 驗證用：固定步長推進 sec 秒並畫出來 */
        ctl.step = function (sec) {
            var n = Math.max(1, Math.round(sec * 60));
            for (var i = 0; i < n && !destroyed; i++) update(1 / 60);
            if (!destroyed) draw();
            return { t: +t.toFixed(2), digit: digit && digit.n, ended: ended };
        };
        return ctl;
    }

    global.WaterNote = WaterNote;
})(window);
