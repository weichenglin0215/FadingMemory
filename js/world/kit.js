/* ═══════════════════════════════════════════════════════════════════
   kit.js — 3D 積木工具箱（全部用基本幾何體＋畫布貼圖產生，不需外部模型）
   · 材質、幾何體共用快取（不釋放）；場景專屬的貼圖／材質用 K.own() 登記，
     換場景時 K.disposeOwned() 一次釋放，手機記憶體不會越用越多。
   · 招牌文字用 Canvas 畫成貼圖，網路字型載入後會自動重畫。
   · 色彩：宣紙暖白、黃、綠、藍，少量橘——開朗、健康、樂觀。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var T = global.THREE;
    var FM = global.FM = global.FM || {};
    if (!T) return;

    var K = FM.kit = {};

    /* ─── 色票 ─── */
    var C = K.C = {
        grass: 0xA9DB8C, grassDark: 0x8DCB72,
        road: 0x9C9993, roadLine: 0xFFFFFF, roadYellow: 0xF2C14E,
        sidewalk: 0xEFE2C3, curb: 0xDCCBA3,
        trunk: 0x9B6B43, leafA: 0x6CC35C, leafB: 0x8AD36B, leafC: 0x5DB553,
        white: 0xFFFDF6, cream: 0xFFF1D0, butter: 0xF7DE8A, mint: 0xC4E6C9,
        sky: 0xC5E0F3, peach: 0xF9D6B2, sand: 0xECDDB6, apricot: 0xFFE2B5,
        blue: 0x5A9BD8, green: 0x5BAF6A, orange: 0xEE8E3A, yellow: 0xF2C14E,
        glass: 0xBFE3F5, glassDark: 0x5E8FB8, metal: 0xDAD5C8, champagne: 0xE9D6AE,
        dark: 0x4D4B52, wood: 0xE2BF8E, woodDark: 0xB98A5A,
        skin: 0xF6D2AE, hair: 0x4A3526, roof: 0xE6DCC8
    };
    K.FACADES = [C.cream, C.butter, C.mint, C.sky, C.peach, C.sand, C.apricot, 0xD9EEDC, 0xDDEAF6];

    function css(hex) { return '#' + ('000000' + hex.toString(16)).slice(-6); }
    K.css = css;

    /* ─── 場景專屬資源（換場景時釋放）─── */
    var owned = [];
    var signCache = {};
    K.own = function (r) { owned.push(r); return r; };
    K.disposeOwned = function () {
        owned.forEach(function (r) { try { r.dispose(); } catch (e) { } });
        owned = [];
        signCache = {};
    };

    /* ─── 共用幾何體（原點在底部中心，方便擺放）─── */
    var G = K.G = {
        box: new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
        boxC: new T.BoxGeometry(1, 1, 1),
        cyl: new T.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0),
        cylC: new T.CylinderGeometry(0.5, 0.5, 1, 20),
        cone: new T.ConeGeometry(0.5, 1, 20).translate(0, 0.5, 0),
        sphere: new T.SphereGeometry(0.5, 20, 14),
        sphereLo: new T.SphereGeometry(0.5, 12, 8),
        hemi: new T.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        plane: new T.PlaneGeometry(1, 1),
        ground: new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        circle: new T.CircleGeometry(0.5, 32).rotateX(-Math.PI / 2),
        capsule: new T.CapsuleGeometry(0.5, 1, 6, 12),
        torus: new T.TorusGeometry(0.5, 0.12, 10, 24),
        arc: new T.TorusGeometry(0.5, 0.16, 8, 16, Math.PI),
        ring: new T.TorusGeometry(0.5, 0.06, 8, 32).rotateX(Math.PI / 2)
    };

    /* ─── 共用材質快取 ─── */
    var matCache = {};
    K.mat = function (color, opt) {
        var key = 'L' + color + (opt ? JSON.stringify(opt) : '');
        if (!matCache[key]) {
            var p = { color: color };
            for (var k in opt) p[k] = opt[k];
            matCache[key] = new T.MeshLambertMaterial(p);
        }
        return matCache[key];
    };
    K.basic = function (color, opt) {
        var key = 'B' + color + (opt ? JSON.stringify(opt) : '');
        if (!matCache[key]) {
            var p = { color: color };
            for (var k in opt) p[k] = opt[k];
            matCache[key] = new T.MeshBasicMaterial(p);
        }
        return matCache[key];
    };

    /* ─── 放置小工具 ─── */
    K.mesh = function (parent, geo, mat, x, y, z, sx, sy, sz, ry) {
        var m = new T.Mesh(geo, mat);
        m.position.set(x || 0, y || 0, z || 0);
        m.scale.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
        if (ry) m.rotation.y = ry;
        parent.add(m);
        return m;
    };
    /* 方塊：x,z 是中心，y 是底部 */
    K.box = function (parent, x, y, z, w, h, d, color, ry) {
        return K.mesh(parent, G.box, typeof color === 'number' ? K.mat(color) : color, x, y, z, w, h, d, ry);
    };
    K.cyl = function (parent, x, y, z, r, h, color) {
        return K.mesh(parent, G.cyl, typeof color === 'number' ? K.mat(color) : color, x, y, z, r * 2, h, r * 2);
    };
    K.ball = function (parent, x, y, z, r, color) {
        return K.mesh(parent, G.sphere, typeof color === 'number' ? K.mat(color) : color, x, y, z, r * 2, r * 2, r * 2);
    };

    /* ─── 圓角矩形 ─── */
    function rr(g, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
    }
    K.roundRect = rr;

    var FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

    /* 畫布貼圖：draw(g, w, h) 自訂畫法；網路字型載入後自動重畫 */
    K.canvasTex = function (w, h, draw, fontText, owned) {
        var cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        var g = cv.getContext('2d');
        var tex = new T.CanvasTexture(cv);
        tex.colorSpace = T.SRGBColorSpace;
        tex.anisotropy = 4;
        function redraw() {
            g.clearRect(0, 0, w, h);
            draw(g, w, h);
            tex.needsUpdate = true;
        }
        redraw();
        if (fontText && document.fonts && document.fonts.load) {
            document.fonts.load('900 48px "Noto Sans TC"', fontText).then(redraw, function () { });
        }
        return owned === false ? tex : K.own(tex);
    };

    /* 文字招牌貼圖：自動縮字，支援多行（\n） */
    K.textTex = function (text, o) {
        o = o || {};
        var W = o.w || 512;
        var H = o.h || 128;
        var lines = String(text).split('\n');
        var bw = o.bw == null ? 8 : o.bw;
        return K.canvasTex(W, H, function (g) {
            if (o.bg) {
                g.fillStyle = o.bg;
                rr(g, bw / 2, bw / 2, W - bw, H - bw, o.radius == null ? H * 0.18 : o.radius);
                g.fill();
            }
            if (o.border) {
                g.lineWidth = bw;
                g.strokeStyle = o.border;
                rr(g, bw / 2, bw / 2, W - bw, H - bw, o.radius == null ? H * 0.18 : o.radius);
                g.stroke();
            }
            var pad = o.pad == null ? H * 0.14 : o.pad;
            var gap = o.lineGap || 1.15;
            var size = o.max || Math.floor((H - pad * 2) / (lines.length * gap));
            var weight = o.weight || 900;
            for (; size > 8; size -= 2) {
                g.font = weight + ' ' + size + 'px ' + FONT;
                var widest = 0;
                for (var i = 0; i < lines.length; i++) widest = Math.max(widest, g.measureText(lines[i]).width);
                if (widest <= W - pad * 2 && size * gap * lines.length <= H - pad * 2 + size * 0.2) break;
            }
            g.fillStyle = o.fg || '#FFFFFF';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            var lh = size * gap;
            var y0 = H / 2 - lh * (lines.length - 1) / 2 + size * 0.04;
            lines.forEach(function (l, i) { g.fillText(l, W / 2, y0 + i * lh); });
        }, text);
    };

    /* 招牌：平面（預設朝 +z），ry 轉向；both=true 兩面都有字 */
    K.sign = function (parent, text, o) {
        var sw = o.sw || 2;
        var sh = o.sh || 0.6;
        var ratio = sw / sh;
        var W = ratio >= 1 ? 512 : Math.max(64, Math.round(512 * ratio));
        var H = ratio >= 1 ? Math.max(64, Math.round(512 / ratio)) : 512;
        /* 同一場景裡，同樣的字＋同樣配色＋同樣比例的招牌共用一張貼圖 */
        var key = [text, W, H, o.bg, o.fg, o.border, o.bw].join('|');
        var mat = signCache[key];
        if (!mat) {
            var tex = K.textTex(text, {
                w: W, h: H, bg: o.bg, fg: o.fg, border: o.border, bw: o.bw, radius: o.radius,
                pad: o.pad, weight: o.weight, lineGap: o.lineGap
            });
            mat = signCache[key] = K.own(new T.MeshBasicMaterial({ map: tex, transparent: true }));
        }
        var m = new T.Mesh(G.plane, mat);
        m.scale.set(sw, sh, 1);
        m.position.set(o.x || 0, o.y || 0, o.z || 0);
        m.rotation.y = o.ry || 0;
        parent.add(m);
        if (o.both) {
            var m2 = new T.Mesh(G.plane, mat);
            m2.scale.copy(m.scale);
            m2.position.copy(m.position);
            m2.rotation.y = m.rotation.y + Math.PI;
            parent.add(m2);
        }
        return m;
    };

    /* 任意畫布平面（牆上的時鐘、窗景、菜單板…） */
    K.picture = function (parent, w, h, px, py, draw, o) {
        o = o || {};
        var tex = K.canvasTex(px, py, draw, o.fontText);
        var mat = K.own(o.lit ? new T.MeshLambertMaterial({ map: tex, transparent: !!o.transparent }) :
            new T.MeshBasicMaterial({ map: tex, transparent: !!o.transparent }));
        var m = new T.Mesh(G.plane, mat);
        m.scale.set(w, h, 1);
        m.position.set(o.x || 0, o.y || 0, o.z || 0);
        m.rotation.y = o.ry || 0;
        parent.add(m);
        return m;
    };

    /* ─── 陰影圓（便宜的假陰影）─── */
    var blobTex = null;
    K.blob = function (parent, w, d, opacity) {
        if (!blobTex) {
            blobTex = K.canvasTex(128, 128, function (g) {
                var grd = g.createRadialGradient(64, 64, 8, 64, 64, 62);
                grd.addColorStop(0, 'rgba(60,45,20,0.55)');
                grd.addColorStop(1, 'rgba(60,45,20,0)');
                g.fillStyle = grd;
                g.fillRect(0, 0, 128, 128);
            }, null, false);
        }
        var key = 'blob' + (opacity || 1);
        if (!matCache[key]) {
            matCache[key] = new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: opacity || 1 });
        }
        var m = new T.Mesh(G.ground, matCache[key]);
        m.scale.set(w, 1, d);
        m.position.y = 0.02;
        m.renderOrder = 1;
        parent.add(m);
        return m;
    };

    /* ─── 天空：漸層天球＋雲 ─── */
    function srgb(hex) {
        return new T.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
    }
    K.skyDome = function () {
        var mat = new T.ShaderMaterial({
            uniforms: {
                top: { value: srgb(0x74BDF0) },
                mid: { value: srgb(0xFFF1D2) },
                bottom: { value: srgb(0xE8F2DC) }
            },
            vertexShader:
                'varying vec3 vP;' +
                'void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader:
                'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;' +
                'void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(mid, top, pow(clamp(y*1.25,0.0,1.0), 0.7)) : mix(mid, bottom, clamp(-y*4.0,0.0,1.0));' +
                ' gl_FragColor = vec4(c, 1.0); }',
            side: T.BackSide,
            depthWrite: false,
            fog: false
        });
        /* 半徑要小於相機 far（230），否則天空會被裁掉 */
        var m = new T.Mesh(new T.SphereGeometry(200, 32, 16), mat);
        m.renderOrder = -10;
        m.frustumCulled = false;
        return m;
    };

    K.cloud = function (parent, x, y, z, s) {
        var g = new T.Group();
        var m = K.mat(0xFFFFFF, { emissive: 0x6F6A5E });
        [[0, 0, 0, 1.6], [1.5, -0.2, 0.2, 1.2], [-1.5, -0.3, 0, 1.1], [0.6, 0.6, -0.3, 1.1], [-0.7, 0.5, 0.4, 0.9]].forEach(function (p) {
            K.mesh(g, G.sphere, m, p[0], p[1], p[2], p[3] * 2, p[3] * 1.5, p[3] * 2);
        });
        g.position.set(x, y, z);
        g.scale.setScalar(s || 1);
        parent.add(g);
        return g;
    };

    /* 整片雲用一個 InstancedMesh（1 次繪製），每幀慢慢飄 */
    var PUFFS = [[0, 0, 0, 1.6], [1.5, -0.2, 0.2, 1.2], [-1.5, -0.3, 0, 1.1], [0.6, 0.6, -0.3, 1.1], [-0.7, 0.5, 0.4, 0.9]];
    K.clouds = function (ctx, cx, cz, count, spread) {
        var list = [];
        for (var i = 0; i < count; i++) {
            var a = (i / count) * Math.PI * 2 + i;
            var r = spread * (0.5 + ((i * 37) % 10) / 20);
            list.push({ x: cx + Math.cos(a) * r, y: 34 + (i % 3) * 7, z: cz + Math.sin(a) * r, s: 2.2 + (i % 4) * 0.5, v: 0.6 + (i % 3) * 0.25 });
        }
        var im = new T.InstancedMesh(G.sphereLo, K.mat(0xFFFFFF, { emissive: 0x6F6A5E }), count * PUFFS.length);
        im.frustumCulled = false;
        var m = new T.Matrix4();
        var q = new T.Quaternion();
        var p = new T.Vector3();
        var s = new T.Vector3();
        function write() {
            var k = 0;
            list.forEach(function (c) {
                PUFFS.forEach(function (f) {
                    m.compose(p.set(c.x + f[0] * c.s, c.y + f[1] * c.s, c.z + f[2] * c.s), q, s.set(f[3] * 2 * c.s, f[3] * 1.5 * c.s, f[3] * 2 * c.s));
                    im.setMatrixAt(k++, m);
                });
            });
            im.instanceMatrix.needsUpdate = true;
        }
        write();
        ctx.add(im);
        ctx.tick(function (dt) {
            list.forEach(function (c) {
                c.x += dt * c.v;
                if (c.x > cx + spread * 1.4) c.x = cx - spread * 1.4;
            });
            write();
        });
    };

    /* 路面標線（白色虛線、斑馬線）：全部合成一個 InstancedMesh。list = [[x, z, w, d], ...] */
    K.stripes = function (parent, list, color) {
        if (!list.length) return null;
        var im = new T.InstancedMesh(G.box, K.mat(color || C.roadLine), list.length);
        var m = new T.Matrix4();
        var q = new T.Quaternion();
        var p = new T.Vector3();
        var s = new T.Vector3();
        list.forEach(function (a, i) {
            m.compose(p.set(a[0], 0.016, a[1]), q, s.set(a[2], 0.012, a[3]));
            im.setMatrixAt(i, m);
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.computeBoundingSphere) im.computeBoundingSphere(); else im.frustumCulled = false;
        parent.add(im);
        return im;
    };

    /* ─── 地面／道路 ─── */
    K.ground = function (parent, x, z, w, d, color, y) {
        return K.mesh(parent, G.ground, typeof color === 'number' ? K.mat(color) : color, x, y || 0, z, w, 1, d);
    };

    /* 反覆貼圖（地磚、木地板）：快取基底，平鋪次數由呼叫端決定 */
    var patternCache = {};
    K.pattern = function (key, size, draw, repX, repY) {
        if (!patternCache[key]) patternCache[key] = K.canvasTex(size, size, draw, null, false);
        var t = patternCache[key].clone();
        t.wrapS = t.wrapT = T.RepeatWrapping;
        t.repeat.set(repX, repY);
        t.needsUpdate = true;
        return K.own(t);
    };

    K.tiles = function (c1, c2, repX, repY) {
        return K.pattern('tile' + c1 + c2, 128, function (g) {
            g.fillStyle = css(c1);
            g.fillRect(0, 0, 128, 128);
            g.fillStyle = css(c2);
            g.fillRect(0, 0, 64, 64);
            g.fillRect(64, 64, 64, 64);
            g.strokeStyle = 'rgba(255,255,255,0.55)';
            g.lineWidth = 3;
            g.strokeRect(0, 0, 64, 64);
            g.strokeRect(64, 64, 64, 64);
            g.strokeRect(64, 0, 64, 64);
            g.strokeRect(0, 64, 64, 64);
        }, repX, repY);
    };

    K.planks = function (repX, repY) {
        return K.pattern('planks', 256, function (g) {
            g.fillStyle = '#E9C79A';
            g.fillRect(0, 0, 256, 256);
            for (var i = 0; i < 8; i++) {
                g.fillStyle = i % 2 ? '#E2BC8C' : '#EDCFA6';
                g.fillRect(0, i * 32, 256, 30);
                g.fillStyle = 'rgba(150,100,50,0.25)';
                g.fillRect(((i * 97) % 256), i * 32, 3, 30);
            }
        }, repX, repY);
    };

    K.floor = function (ctx, x, z, w, d, tex, color, y) {
        var mat = K.own(new T.MeshLambertMaterial({ map: tex, color: color || 0xFFFFFF }));
        return K.mesh(ctx.root, G.ground, mat, x, y || 0.01, z, w, 1, d);
    };

    /* 室內牆：單面平面朝房內（相機在牆外時自動看穿，不擋視線） */
    K.wall = function (ctx, x0, z0, x1, z1, h, color, o) {
        o = o || {};
        var dx = x1 - x0;
        var dz = z1 - z0;
        var len = Math.sqrt(dx * dx + dz * dz);
        var m = new T.Mesh(G.plane, o.mat || K.mat(color));
        m.scale.set(len, h, 1);
        m.position.set((x0 + x1) / 2, h / 2 + (o.y || 0), (z0 + z1) / 2);
        /* 平面預設朝 +z；讓它朝向「由 (x0,z0) 走到 (x1,z1) 時的右手邊」。
           房間四面牆請用 K.room()，它會自動讓每面牆都朝向房內。 */
        m.rotation.y = Math.atan2(-dz, dx);
        ctx.root.add(m);
        if (o.collide !== false) {
            var t = 0.12;
            ctx.block(Math.min(x0, x1) - t, Math.max(x0, x1) + t, Math.min(z0, z1) - t, Math.max(z0, z1) + t);
        }
        if (o.skirt !== false) {
            var s = new T.Mesh(G.plane, K.mat(o.skirtColor || C.woodDark));
            s.scale.set(len, 0.14, 1);
            s.position.set(m.position.x, 0.07 + (o.y || 0), m.position.z);
            s.rotation.y = m.rotation.y;
            var n = new T.Vector3(0, 0, 1).applyAxisAngle(new T.Vector3(0, 1, 0), m.rotation.y);
            s.position.addScaledVector(n, 0.01);
            ctx.root.add(s);
        }
        return m;
    };

    /* 房間：四面牆都朝房內；gaps = {n:[[a,b]], s:[...], e:[...], w:[...]} 是門洞（n/s 沿 x，e/w 沿 z） */
    K.room = function (ctx, x0, x1, z0, z1, h, color, gaps, o) {
        gaps = gaps || {};
        o = o || {};
        var doorH = o.doorH || 2.5;
        function segs(a0, a1, list) {
            var out = [];
            var cur = a0;
            (list || []).slice().sort(function (p, q) { return p[0] - q[0]; }).forEach(function (gp) {
                if (gp[0] > cur) out.push([cur, gp[0]]);
                cur = Math.max(cur, gp[1]);
            });
            if (cur < a1) out.push([cur, a1]);
            return out;
        }
        function lintels(list, fn) {
            (list || []).forEach(function (gp) { fn(gp[0], gp[1]); });
        }
        var lo = { collide: false, skirt: false, y: doorH };
        segs(x0, x1, gaps.n).forEach(function (s) { K.wall(ctx, s[0], z0, s[1], z0, h, color, o); });
        lintels(gaps.n, function (a, b) { K.wall(ctx, a, z0, b, z0, h - doorH, color, lo); });
        segs(z0, z1, gaps.e).forEach(function (s) { K.wall(ctx, x1, s[0], x1, s[1], h, color, o); });
        lintels(gaps.e, function (a, b) { K.wall(ctx, x1, a, x1, b, h - doorH, color, lo); });
        segs(x0, x1, gaps.s).forEach(function (s) { K.wall(ctx, s[1], z1, s[0], z1, h, color, o); });
        lintels(gaps.s, function (a, b) { K.wall(ctx, b, z1, a, z1, h - doorH, color, lo); });
        segs(z0, z1, gaps.w).forEach(function (s) { K.wall(ctx, x0, s[1], x0, s[0], h, color, o); });
        lintels(gaps.w, function (a, b) { K.wall(ctx, x0, b, x0, a, h - doorH, color, lo); });
    };

    /* ─── 建築外牆貼圖（每種顏色快取一張）─── */
    var facadeCache = {};
    function facadeBase(wall, shop) {
        var key = wall + (shop ? 's' : '');
        if (facadeCache[key]) return facadeCache[key];
        facadeCache[key] = K.canvasTex(128, 128, function (g) {
            g.fillStyle = css(wall);
            g.fillRect(0, 0, 128, 128);
            g.fillStyle = 'rgba(255,255,255,0.35)';
            g.fillRect(0, 118, 128, 10);
            var grd = g.createLinearGradient(0, 22, 0, 96);
            grd.addColorStop(0, '#D8EEFB');
            grd.addColorStop(1, '#9CCBEB');
            g.fillStyle = '#FFFFFF';
            g.fillRect(16, 18, 96, 82);
            g.fillStyle = grd;
            g.fillRect(22, 24, 84, 70);
            g.fillStyle = 'rgba(255,255,255,0.7)';
            g.fillRect(62, 24, 4, 70);
            g.fillStyle = 'rgba(255,255,255,0.45)';
            g.beginPath();
            g.moveTo(28, 90);
            g.lineTo(48, 30);
            g.lineTo(56, 30);
            g.lineTo(36, 90);
            g.fill();
            g.fillStyle = 'rgba(90,70,40,0.18)';
            g.fillRect(14, 100, 100, 6);
        }, null, false);
        return facadeCache[key];
    }

    /* 建築本體：一個方塊、一個材質（每面的窗戶重複次數直接寫進 UV），只要 1 次繪製 */
    function facadeGeo(w, h, d) {
        var g = new T.BoxGeometry(w, h, d).translate(0, h / 2, 0);
        var uv = g.attributes.uv;
        var rx = Math.max(1, Math.round(d / 3.2));
        var rz = Math.max(1, Math.round(w / 3.2));
        var ry = Math.max(1, Math.round(h / 3.4));
        for (var f = 0; f < 6; f++) {
            for (var v = 0; v < 4; v++) {
                var i = f * 4 + v;
                if (f === 2 || f === 3) uv.setXY(i, 0.03, 0.03);
                else uv.setXY(i, uv.getX(i) * (f < 2 ? rx : rz), uv.getY(i) * ry);
            }
        }
        uv.needsUpdate = true;
        return K.own(g);
    }

    function facadeMat(wall) {
        var base = facadeBase(wall);
        if (base.wrapS !== T.RepeatWrapping) {
            base.wrapS = base.wrapT = T.RepeatWrapping;
            base.needsUpdate = true;
        }
        return K.own(new T.MeshLambertMaterial({ map: base }));
    }

    var FACE = {
        s: { ry: 0 },
        n: { ry: Math.PI },
        e: { ry: Math.PI / 2 },
        w: { ry: -Math.PI / 2 }
    };

    /* 建築：o = { x, z, w, d, h, color, face:'s'|'n'|'e'|'w'（正面朝向）,
                   sign, signBg, signFg, shop:true, awning:色, door:true, occluder, collide, roof } */
    K.building = function (ctx, o) {
        var g = new T.Group();
        g.position.set(o.x, 0, o.z);
        var color = o.color || K.FACADES[0];
        var body = new T.Mesh(facadeGeo(o.w, o.h, o.d), facadeMat(color));
        g.add(body);
        if (o.occluder !== false) ctx.occluder(body, g);

        /* 屋頂小物：水塔、冷氣（台灣街景的味道） */
        if (o.rooftop !== false && o.h < 40) {
            K.cyl(g, o.w * 0.25, o.h, -o.d * 0.2, 0.7, 1.4, C.white);
            K.box(g, -o.w * 0.2, o.h, o.d * 0.15, 1.4, 0.8, 1.0, C.metal);
        }

        /* 正面：一樓店面、遮雨棚、招牌 */
        var f = FACE[o.face || 's'];
        var front = new T.Group();
        var fw = (o.face === 'e' || o.face === 'w') ? o.d : o.w;
        var half = (o.face === 'e' || o.face === 'w') ? o.w / 2 : o.d / 2;
        front.rotation.y = f.ry;
        front.position.set(Math.sin(f.ry) * half, 0, Math.cos(f.ry) * half);
        g.add(front);

        if (o.shop !== false) {
            K.box(front, 0, 0, 0.06, fw - 0.8, 2.9, 0.14, C.white);
            K.box(front, 0, 0.1, 0.1, fw - 1.4, 2.6, 0.12, K.mat(C.glass, { emissive: 0x2A4A5A }));
            K.box(front, o.doorX || 0, 0, 0.16, 1.8, 2.5, 0.1, C.glassDark);
        }
        if (o.awning) {
            var aw = K.box(front, 0, 3.25, 0.45, fw - 1.0, 0.14, 0.9, o.awning);
            aw.rotation.x = 0.28;
        }
        if (o.sign) {
            K.sign(front, o.sign, {
                sw: Math.min(fw - 1.2, o.signW || Math.max(4, o.sign.length * 1.3)),
                sh: o.signH || 1.3,
                x: 0, y: o.signY || (o.awning ? 4.2 : 3.6), z: 0.22,
                bg: o.signBg || '#3E86C4', fg: o.signFg || '#FFFFFF', border: '#FFFFFF', bw: 10
            });
        }
        ctx.add(g);
        if (o.collide !== false) ctx.blockRect(o.x, o.z, o.w, o.d);
        g.userData.front = front;
        return g;
    };

    /* ─── 樹、燈、花台、長椅 ─── */
    K.tree = function (ctx, x, z, s, collide) {
        s = s || 1;
        var g = new T.Group();
        g.position.set(x, 0, z);
        K.cyl(g, 0, 0, 0, 0.18 * s, 1.8 * s, C.trunk);
        var leaf = [C.leafA, C.leafB, C.leafC][Math.abs(Math.round(x * 3 + z * 7)) % 3];
        K.ball(g, 0, 2.5 * s, 0, 1.15 * s, leaf);
        K.ball(g, 0.6 * s, 2.1 * s, 0.3 * s, 0.8 * s, leaf);
        K.ball(g, -0.55 * s, 2.2 * s, -0.25 * s, 0.75 * s, leaf);
        K.blob(g, 2.6 * s, 2.6 * s, 0.8);
        ctx.add(g);
        if (collide !== false) ctx.blockRect(x, z, 0.5, 0.5);
        return g;
    };

    /* 大量樹木用 InstancedMesh：整片樹只要 4 次繪製，手機也跑得動 */
    K.forest = function (ctx, spots) {
        if (!spots.length) return;
        var n = spots.length;
        var trunk = new T.InstancedMesh(G.cyl, K.mat(C.trunk), n);
        var leafA = new T.InstancedMesh(G.sphereLo, K.mat(C.leafA), n);
        var leafB = new T.InstancedMesh(G.sphereLo, K.mat(C.leafB), n);
        var shadow = new T.InstancedMesh(G.ground, K.blob(new T.Group(), 1, 1, 0.8).material, n);
        var m = new T.Matrix4();
        var q = new T.Quaternion();
        var p = new T.Vector3();
        var s = new T.Vector3();
        spots.forEach(function (t, i) {
            var k = t.s || 1;
            m.compose(p.set(t.x, 0, t.z), q, s.set(0.36 * k, 1.8 * k, 0.36 * k));
            trunk.setMatrixAt(i, m);
            m.compose(p.set(t.x, 2.5 * k, t.z), q, s.set(2.3 * k, 2.1 * k, 2.3 * k));
            leafA.setMatrixAt(i, m);
            m.compose(p.set(t.x + 0.6 * k, 2.0 * k, t.z + 0.3 * k), q, s.set(1.5 * k, 1.4 * k, 1.5 * k));
            leafB.setMatrixAt(i, m);
            m.compose(p.set(t.x, 0.02, t.z), q, s.set(2.6 * k, 1, 2.6 * k));
            shadow.setMatrixAt(i, m);
            if (t.collide) ctx.blockRect(t.x, t.z, 0.5, 0.5);
        });
        [trunk, leafA, leafB, shadow].forEach(function (im) {
            im.instanceMatrix.needsUpdate = true;
            if (im.computeBoundingSphere) im.computeBoundingSphere();
            else im.frustumCulled = false;
            ctx.add(im);
        });
        shadow.renderOrder = 1;
    };

    K.lamp = function (ctx, x, z) {
        var g = new T.Group();
        g.position.set(x, 0, z);
        K.cyl(g, 0, 0, 0, 0.07, 3.8, C.dark);
        K.ball(g, 0, 3.9, 0, 0.28, K.basic(0xFFF1C2));
        ctx.add(g);
        ctx.blockRect(x, z, 0.3, 0.3);
        return g;
    };

    K.flowerBed = function (ctx, x, z, w, d) {
        var g = new T.Group();
        g.position.set(x, 0, z);
        K.box(g, 0, 0, 0, w, 0.45, d, C.woodDark);
        K.box(g, 0, 0.45, 0, w - 0.2, 0.05, d - 0.2, 0x7A5A3A);
        var cols = [C.yellow, C.orange, 0xFFFFFF, C.blue, 0xF6A6B2];
        var n = Math.max(3, Math.round(w * d * 1.6));
        for (var i = 0; i < n; i++) {
            var fx = ((i * 0.618) % 1 - 0.5) * (w - 0.5);
            var fz = ((i * 0.371) % 1 - 0.5) * (d - 0.5);
            K.ball(g, fx, 0.62, fz, 0.13, cols[i % cols.length]);
            K.ball(g, fx, 0.5, fz, 0.1, C.leafA);
        }
        ctx.add(g);
        ctx.blockRect(x, z, w, d);
        return g;
    };

    K.bench = function (ctx, x, z, ry) {
        var g = new T.Group();
        g.position.set(x, 0, z);
        g.rotation.y = ry || 0;
        K.box(g, 0, 0.42, 0, 1.8, 0.08, 0.5, C.wood);
        K.box(g, 0, 0.5, 0.22, 1.8, 0.45, 0.06, C.wood);
        K.box(g, -0.75, 0, 0, 0.08, 0.42, 0.45, C.dark);
        K.box(g, 0.75, 0, 0, 0.08, 0.42, 0.45, C.dark);
        ctx.add(g);
        var c = Math.abs(Math.sin(ry || 0)) > 0.7;
        ctx.blockRect(x, z, c ? 0.6 : 1.9, c ? 1.9 : 0.6);
        return g;
    };

    K.plant = function (parent, x, z, s) {
        s = s || 1;
        var g = new T.Group();
        g.position.set(x, 0, z);
        K.cyl(g, 0, 0, 0, 0.3 * s, 0.5 * s, C.orange);
        K.ball(g, 0, 0.85 * s, 0, 0.5 * s, C.leafA);
        K.ball(g, 0.2 * s, 1.15 * s, 0.1 * s, 0.32 * s, C.leafB);
        parent.add(g);
        return g;
    };

    /* ─── 街道元件 ─── */
    K.streetSign = function (ctx, x, z, text, ry) {
        var g = new T.Group();
        g.position.set(x, 0, z);
        K.cyl(g, 0, 0, 0, 0.07, 3.8, C.dark);
        K.sign(g, text, { sw: 2.8, sh: 0.8, x: 0, y: 3.35, z: 0, ry: ry || 0, bg: '#2F6FB0', fg: '#FFFFFF', border: '#FFFFFF', bw: 10, both: true });
        ctx.add(g);
        ctx.blockRect(x, z, 0.3, 0.3);
        return g;
    };

    /* 公車站：站牌＋候車亭。o = {x, z, name, routes, ry（站牌朝向）} */
    K.busStop = function (ctx, o) {
        var g = new T.Group();
        g.position.set(o.x, 0, o.z);
        g.rotation.y = o.ry || 0;
        /* 站牌 */
        K.cyl(g, 0, 0, 0, 0.08, 3.4, C.dark);
        K.sign(g, o.name, { sw: 2.2, sh: 0.75, x: 0, y: 3.2, z: 0.02, bg: '#4C9A5B', fg: '#FFFFFF', border: '#FFFFFF', bw: 10, both: true });
        K.sign(g, o.routes, { sw: 2.2, sh: 0.62, x: 0, y: 2.5, z: 0.02, bg: '#FFFDF6', fg: '#3E86C4', border: '#4C9A5B', bw: 10, both: true });
        /* 候車亭（在站牌後方） */
        var sx = o.shelterX == null ? -2.6 : o.shelterX;
        /* 候車亭屋頂擋到鏡頭時會變半透明 */
        var roof = K.box(g, sx, 2.5, -1.4, 3.6, 0.14, 1.8, K.own(new T.MeshLambertMaterial({ color: C.green })));
        ctx.occluder(roof);
        K.box(g, sx - 1.7, 0, -1.4, 0.1, 2.5, 0.1, C.dark);
        K.box(g, sx + 1.7, 0, -1.4, 0.1, 2.5, 0.1, C.dark);
        K.box(g, sx, 0.3, -2.2, 3.5, 2.1, 0.06, K.mat(C.glass, { transparent: true, opacity: 0.55 }));
        K.box(g, sx, 0.45, -1.85, 2.8, 0.08, 0.45, C.wood);
        ctx.add(g);
        g.updateMatrixWorld(true);
        var p = new T.Vector3(sx, 0, -1.6).applyMatrix4(g.matrixWorld);
        ctx.blockRect(p.x, p.z, Math.abs(Math.cos(o.ry || 0)) > 0.5 ? 3.6 : 1.4, Math.abs(Math.cos(o.ry || 0)) > 0.5 ? 1.4 : 3.6);
        ctx.blockRect(o.x, o.z, 0.3, 0.3);
        return g;
    };

    /* 斑馬線的條紋位置（交給 K.stripes 一次畫完） */
    K.crosswalkStripes = function (list, x, z0, z1, alongZ) {
        var n = Math.floor(Math.abs(z1 - z0) / 1.0);
        for (var i = 0; i < n; i++) {
            var t = z0 + (i + 0.5) * (z1 - z0) / n;
            if (alongZ) list.push([t, x, 0.5, 3]);
            else list.push([x, t, 3, 0.5]);
        }
        return list;
    };

    /* ─── 公車（車頭朝 +x）─── */
    function ledTex(route) {
        return K.canvasTex(256, 64, function (g, w, h) {
            g.fillStyle = '#1D1B20';
            rr(g, 0, 0, w, h, 10);
            g.fill();
            g.fillStyle = '#FFB23F';
            g.font = '900 52px ' + FONT;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(route, w / 2, h / 2 + 3);
        }, route);
    }

    K.bus = function (route, o) {
        o = o || {};
        var g = new T.Group();
        var body = o.body || C.white;
        K.box(g, 0, 0.45, 0, 11, 2.7, 2.6, body);
        K.box(g, 0, 0.55, 0, 11.04, 0.45, 2.64, o.stripe || C.green);
        K.box(g, 0, 2.95, 0, 11.04, 0.2, 2.64, o.stripe2 || C.blue);
        K.box(g, -0.5, 1.45, 0, 9.4, 1.2, 2.66, K.mat(0x5C8DB5, { emissive: 0x1A3346 }));
        K.box(g, 5.46, 1.35, 0, 0.12, 1.45, 2.3, K.mat(0x6F9EC4, { emissive: 0x1A3346 }));
        K.box(g, 0, 3.15, 0, 7, 0.3, 1.8, C.metal);
        /* 車門（+z 側，靠近車頭） */
        K.box(g, 3.6, 0.5, 1.31, 1.2, 2.3, 0.04, K.mat(0x7FA9CC, { emissive: 0x1A3346 }));
        /* 車燈 */
        K.box(g, 5.5, 0.8, 0.9, 0.08, 0.3, 0.45, K.basic(0xFFF4C8));
        K.box(g, 5.5, 0.8, -0.9, 0.08, 0.3, 0.45, K.basic(0xFFF4C8));
        /* 路線號碼：車頭、兩側 */
        var tex = ledTex(route);
        var mat = K.own(new T.MeshBasicMaterial({ map: tex }));
        var front = K.mesh(g, G.plane, mat, 5.53, 2.65, 0, 2.0, 0.5, 1, Math.PI / 2);
        void front;
        K.mesh(g, G.plane, mat, 3.4, 2.65, 1.34, 2.2, 0.55, 1, 0);
        K.mesh(g, G.plane, mat, 3.4, 2.65, -1.34, 2.2, 0.55, 1, Math.PI);
        /* 側面大號碼牌（白底藍字，老人家好認） */
        K.sign(g, route, { sw: 1.5, sh: 0.8, x: -3.6, y: 1.45, z: 1.35, bg: '#FFFFFF', fg: '#2F6FB0', border: '#2F6FB0', bw: 10 });
        K.sign(g, route, { sw: 1.5, sh: 0.8, x: -3.6, y: 1.45, z: -1.35, ry: Math.PI, bg: '#FFFFFF', fg: '#2F6FB0', border: '#2F6FB0', bw: 10 });
        /* 輪子 */
        [[-3.6, 1.2], [-3.6, -1.2], [3.4, 1.2], [3.4, -1.2]].forEach(function (p) {
            var wh = K.mesh(g, G.cylC, K.mat(0x3A3A40), p[0], 0.5, p[1], 1.0, 0.36, 1.0);
            wh.rotation.x = Math.PI / 2;
            var hub = K.mesh(g, G.cylC, K.mat(C.metal), p[0], 0.5, p[1] + Math.sign(p[1]) * 0.19, 0.45, 0.04, 0.45);
            hub.rotation.x = Math.PI / 2;
        });
        K.blob(g, 12.5, 3.6, 0.9);
        g.userData.route = route;
        return g;
    };

    /* ─── 人物（正面朝 -z）─── */
    K.person = function (o) {
        o = o || {};
        var g = new T.Group();
        var body = new T.Group();
        g.add(body);
        var skin = K.mat(o.skin || C.skin);
        var shirt = K.mat(o.shirt || C.blue);
        var pants = K.mat(o.pants || 0x5B6470);
        var hairM = K.mat(o.hair || C.hair);

        function limb(x, y, len, r, mat, handMat) {
            var pivot = new T.Group();
            pivot.position.set(x, y, 0);
            var m = new T.Mesh(G.capsule, mat);
            m.scale.set(r * 2, len / 2, r * 2);
            m.position.y = -len / 2;
            pivot.add(m);
            if (handMat) K.ball(pivot, 0, -len - 0.02, 0, r * 1.25, handMat);
            body.add(pivot);
            return pivot;
        }

        var legL = limb(-0.12, 0.84, 0.84, 0.12, pants, K.mat(0x4A3A2A));
        var legR = limb(0.12, 0.84, 0.84, 0.12, pants, K.mat(0x4A3A2A));
        if (o.dress) K.mesh(body, G.cone, K.mat(o.dress), 0, 0.42, 0, 0.95, 0.8, 0.85);
        var torso = new T.Mesh(G.capsule, shirt);
        torso.scale.set(0.56, 0.3, 0.42);
        torso.position.y = 1.16;
        body.add(torso);
        if (o.tie) K.box(body, 0, 1.0, -0.2, 0.09, 0.38, 0.03, o.tie);
        if (o.apron) K.box(body, 0, 0.72, -0.2, 0.46, 0.72, 0.03, o.apron);
        var armL = limb(-0.34, 1.44, 0.6, 0.085, shirt, skin);
        var armR = limb(0.34, 1.44, 0.6, 0.085, shirt, skin);
        /* 頭 */
        var head = new T.Group();
        head.position.y = 1.74;
        body.add(head);
        K.ball(head, 0, 0, 0, 0.26, skin);
        var hairCap = K.mesh(head, G.sphere, hairM, 0, 0.07, 0.03, 0.56, 0.44, 0.56);
        void hairCap;
        if (o.longHair) K.mesh(head, G.capsule, hairM, 0, -0.18, 0.14, 0.46, 0.25, 0.26);
        if (o.bun) K.ball(head, 0, 0.26, 0.12, 0.13, hairM);
        var eye = K.mat(0x2B2320);
        K.ball(head, -0.09, 0.02, -0.235, 0.035, eye);
        K.ball(head, 0.09, 0.02, -0.235, 0.035, eye);
        var blush = K.mat(0xF5A99A);
        K.ball(head, -0.16, -0.06, -0.2, 0.045, blush);
        K.ball(head, 0.16, -0.06, -0.2, 0.045, blush);
        var smile = K.mesh(head, G.arc, K.mat(0x9A4A3A), 0, -0.07, -0.245, 0.1, 0.08, 0.1);
        smile.rotation.z = Math.PI;
        if (o.glasses) {
            K.mesh(head, G.torus, K.mat(0x3A3A3A), -0.09, 0.02, -0.25, 0.1, 0.1, 0.1);
            K.mesh(head, G.torus, K.mat(0x3A3A3A), 0.09, 0.02, -0.25, 0.1, 0.1, 0.1);
        }
        K.blob(g, 1.1, 1.1, 0.9);

        g.userData.parts = { body: body, legL: legL, legR: legR, armL: armL, armR: armR, head: head };
        if (o.scale) g.scale.setScalar(o.scale);
        return g;
    };

    /* 人物動畫：mode = 'walk' | 'bike' | 'idle' | 'wave' */
    K.animPerson = function (g, phase, amount, mode, t) {
        var p = g.userData.parts;
        if (!p) return;
        if (mode === 'bike') {
            p.body.position.y = 0.42;
            p.legL.rotation.x = 1.25 + Math.sin(phase) * 0.45;
            p.legR.rotation.x = 1.25 - Math.sin(phase) * 0.45;
            p.armL.rotation.x = 0.95;
            p.armR.rotation.x = 0.95;
            p.body.rotation.x = -0.12;
            return;
        }
        p.body.rotation.x = 0;
        if (mode === 'wave') {
            p.armR.rotation.z = 2.5 + Math.sin(t * 8) * 0.35;
            p.armL.rotation.x = 0;
            p.legL.rotation.x = p.legR.rotation.x = 0;
            p.body.position.y = 0;
            return;
        }
        p.armR.rotation.z = 0;
        var s = Math.sin(phase) * 0.65 * amount;
        p.legL.rotation.x = s;
        p.legR.rotation.x = -s;
        p.armL.rotation.x = -s * 0.85;
        p.armR.rotation.x = s * 0.85;
        p.body.position.y = Math.abs(Math.cos(phase)) * 0.045 * amount + (mode === 'idle' ? Math.sin((t || 0) * 2) * 0.01 : 0);
    };

    /* ─── UBIKE（車頭朝 -z，黃色車身）─── */
    K.bike = function () {
        var g = new T.Group();
        var frame = K.mat(0xF2B33D);
        var tire = K.mat(0x3A3A40);
        [-0.62, 0.62].forEach(function (z) {
            var w = K.mesh(g, G.torus, tire, 0, 0.36, z, 0.62, 0.62, 0.62);
            w.rotation.y = Math.PI / 2;
            var hub = K.mesh(g, G.cylC, K.mat(C.metal), 0, 0.36, z, 0.12, 0.1, 0.12);
            hub.rotation.z = Math.PI / 2;
        });
        var bar = K.mesh(g, G.boxC, frame, 0, 0.62, 0, 0.1, 0.1, 1.2);
        bar.rotation.x = 0.35;
        K.box(g, 0, 0.36, 0.1, 0.1, 0.62, 0.1, frame);
        K.box(g, 0, 0.9, 0.18, 0.3, 0.08, 0.38, K.mat(0x3A3A40));
        K.box(g, 0, 0.36, -0.62, 0.08, 0.78, 0.08, frame);
        K.box(g, 0, 1.12, -0.62, 0.7, 0.07, 0.07, K.mat(0x3A3A40));
        K.box(g, 0, 0.82, -0.86, 0.5, 0.32, 0.36, K.mat(0xFFFFFF));
        K.blob(g, 0.9, 2.0, 0.8);
        return g;
    };

    /* ─── 可互動標記：上下浮動的橘色箭頭 ─── */
    var markerMat = null;
    K.marker = function () {
        if (!markerMat) markerMat = new T.MeshBasicMaterial({ color: 0xF08A2E });
        var g = new T.Group();
        var cone = new T.Mesh(G.cone, markerMat);
        cone.scale.set(0.5, 0.6, 0.5);
        cone.rotation.x = Math.PI;
        cone.position.y = 0.6;
        g.add(cone);
        var ring = new T.Mesh(G.ring, K.basic(0xFFFFFF));
        ring.scale.set(0.55, 0.55, 0.55);
        ring.position.y = 0.66;
        g.add(ring);
        return g;
    };

    /* ─── 彩帶（勝利時）─── */
    K.confetti = function (ctx, x, y, z, n) {
        var cols = [C.yellow, C.orange, C.blue, C.green, 0xFFFFFF, 0xF6A6B2];
        var bits = [];
        for (var i = 0; i < n; i++) {
            var m = new T.Mesh(G.plane, K.basic(cols[i % cols.length], { side: T.DoubleSide }));
            m.scale.set(0.18, 0.1, 1);
            m.position.set(x, y, z);
            ctx.add(m);
            bits.push({ m: m, vx: (Math.random() - 0.5) * 6, vy: 4 + Math.random() * 5, vz: (Math.random() - 0.5) * 6, r: Math.random() * 6 });
        }
        ctx.tick(function (dt) {
            bits.forEach(function (b) {
                b.vy -= 6 * dt;
                if (b.m.position.y < 0.05) { b.vy = 0; b.vx *= 0.9; b.vz *= 0.9; }
                b.m.position.x += b.vx * dt;
                b.m.position.y = Math.max(0.03, b.m.position.y + b.vy * dt);
                b.m.position.z += b.vz * dt;
                b.m.rotation.x += b.r * dt;
                b.m.rotation.y += b.r * 0.7 * dt;
            });
        });
    };
})(window);
