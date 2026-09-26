/* ═══════════════════════════════════════════════════════════════════
   scenes.js — 「回家的路」各個 3D 場景（依紙條上的路線）
   辦公室 → 公司門口公車站 → 236 公車 → 衡陽路 → 遠東百貨 1F → 3F 玉器店
   → 衡陽路 → 758 公車 → 蘭陽蛋糕店 → UBIKE（開封街右轉、漢口街左轉）
   → 博愛路 52 公車 → 西藏路（第三個巷子右轉、過兩個巷子左轉）→ 右手第三間 12 號
   每個場景：build(ctx, K, api, params) 蓋場景；enter(ctx, api, params) 進場後的演出。
   api 由 story.js 提供：ask / say / toast / go / fail / win / give / has / freeze / sfx / speak
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var T = global.THREE;
    var FM = global.FM = global.FM || {};
    if (!T) return;
    var K = FM.kit;
    var C = K.C;
    var SC = FM.scenes = {};

    /* ─── 路線設定 ─── */
    var ROUTES = FM.ROUTES = {
        r236: { route: '236', stops: ['館前路', '衡陽路', '南門市場'], target: '衡陽路', next: 'street_hengyang', nextParams: { from: 'bus' } },
        r758: { route: '758', stops: ['西門町', '蘭陽蛋糕店', '龍山寺'], target: '蘭陽蛋糕店', next: 'street_cake', nextParams: { from: 'bus' } },
        r52: { route: '52', stops: ['南海路', '植物園', '西藏路', '萬大路'], target: '西藏路', next: 'xizang', nextParams: {} }
    };

    /* ─── 小工具 ─── */
    function v3(a) { return new T.Vector3(a[0], a[1], a[2]); }
    /* 劇情用的等待走遊戲時間：暫停時會停住、換場景就作廢（不要用 setTimeout） */
    function wait(ms) { return FM.core.wait(ms); }
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
    function shuffle(a) {
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }
    function near(x, list, d) {
        return (list || []).some(function (v) { return Math.abs(v - x) < (d || 4); });
    }
    function hash(n) { var x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }

    /* 等公車：三輛公車依序進站，再讓玩家選。o = {stopX, laneZ, dir, routes, cam:{pos,look}} */
    async function busSequence(ctx, api, o) {
        api.freeze(true);
        var far = o.far || 95;
        var buses = o.routes.map(function (r, i) {
            var b = K.bus(r, { stripe: [C.green, C.blue, C.orange][i % 3], stripe2: [C.blue, C.yellow, C.green][i % 3] });
            b.rotation.y = o.dir > 0 ? 0 : Math.PI;
            b.position.set(o.stopX - o.dir * (far + i * 16), 0, o.laneZ);
            ctx.add(b);
            return b;
        });
        FM.core.camTo(v3(o.cam.pos), v3(o.cam.look), 2.2);
        api.toast('公車來了！');
        api.sfx('bus');
        await Promise.all(buses.map(function (b, i) {
            var from = b.position.x;
            var to = o.stopX - o.dir * (i * 13);
            return wait(i * 650).then(function () {
                return FM.core.tween(3.3, function (t) { b.position.x = from + (to - from) * easeOut(t); });
            });
        }));
        api.sfx('ding');
        var pick = await api.ask({
            title: '公車來了！', text: '要搭幾號公車？', cols: 3, big: true, speak: '要搭幾號公車？',
            choices: shuffle(o.routes.slice()).map(function (r) { return { label: r, value: r, kind: 'sky' }; })
        });
        var bus = buses[o.routes.indexOf(pick)];
        await FM.core.tween(0.45, function (t) { bus.position.y = Math.sin(t * Math.PI) * 0.35; });
        return pick;
    }

    function askWait(api) {
        return api.ask({
            title: '公車站', text: '要在這裡等公車嗎？',
            choices: [{ label: '等公車', value: true, kind: 'go' }, { label: '先不要', value: false, kind: 'line' }]
        });
    }

    /* 街道（道路沿 x 軸，z = -5..5；人行道 z = ±5..±9；兩側建築） */
    function street(ctx, o) {
        var R = ctx.root;
        var L = o.L || 44;
        var span = L * 2 + 70;
        K.ground(R, 0, 0, 600, 600, C.grass, -0.05);
        K.ground(R, 0, 0, span, 10, C.road, 0.01);
        var lines = [];
        for (var x = -L - 30; x < L + 30; x += 7) lines.push([x, 0, 3.2, 0.2]);
        if (o.crosswalk != null) K.crosswalkStripes(lines, o.crosswalk, -4.8, 4.8);
        K.stripes(R, lines);
        K.box(R, 0, 0, -7, span, 0.08, 4, C.sidewalk);
        K.box(R, 0, 0, 7, span, 0.08, 4, C.sidewalk);
        K.box(R, 0, 0, -5.05, span, 0.14, 0.2, C.curb);
        K.box(R, 0, 0, 5.05, span, 0.14, 0.2, C.curb);

        (o.north || []).forEach(function (b) {
            var d = b.d || 14;
            var spec = {};
            for (var k in b) spec[k] = b[k];
            spec.x = (b.x0 + b.x1) / 2; spec.z = -9 - d / 2; spec.w = b.x1 - b.x0; spec.d = d; spec.face = 's';
            b.obj = K.building(ctx, spec);
        });
        (o.south || []).forEach(function (b) {
            var d = b.d || 14;
            var spec = {};
            for (var k in b) spec[k] = b[k];
            spec.x = (b.x0 + b.x1) / 2; spec.z = 9 + d / 2; spec.w = b.x1 - b.x0; spec.d = d; spec.face = 'n';
            b.obj = K.building(ctx, spec);
        });

        var trees = [];
        for (x = -L + 5; x < L; x += 12) {
            if (!near(x, o.skipN)) trees.push({ x: x, z: -8.3, collide: true });
            if (!o.park && !near(x + 6, o.skipS)) trees.push({ x: x + 6, z: 8.3, collide: true });
        }
        if (o.park) {
            for (x = -L + 3; x < L; x += 9) trees.push({ x: x, z: 14 + hash(x) * 10, s: 1.1 + hash(x + 3) * 0.4 });
            for (x = -L + 8; x < L; x += 16) {
                K.flowerBed(ctx, x, 10.8, 3, 1.2);
                K.bench(ctx, x + 6, 10.4, Math.PI);
            }
            /* 噴水池 */
            K.cyl(R, 0, 0, 22, 3.2, 0.6, C.white);
            K.cyl(R, 0, 0.6, 22, 2.9, 0.02, K.mat(0x9FD4F2, { emissive: 0x335566 }));
            K.cyl(R, 0, 0, 22, 0.35, 2.2, C.white);
            K.ball(R, 0, 2.3, 22, 0.55, K.mat(0xBFE6FA, { emissive: 0x335566 }));
            K.box(R, 0, 0, 9.4, span, 0.7, 0.6, C.leafC);
        }
        K.forest(ctx, trees);
        for (x = -L + 11; x < L; x += 24) {
            if (!near(x, o.skipN)) K.lamp(ctx, x, -5.7);
        }
        K.clouds(ctx, 0, -60, 9, 90);
        ctx.bounds = { x0: -L, x1: L, z0: -8.9, z1: o.park ? 9 : 8.9 };
    }

    /* 沿著一組街道（可走區）的兩側自動蓋房子；回傳佔用的地塊 */
    function fillBuildings(ctx, streets, o) {
        var occupied = (o.occupied || []).slice();
        var sw = o.sidewalk == null ? 3 : o.sidewalk;
        var clear = streets.map(function (r) { return { x0: r.x0 - sw, x1: r.x1 + sw, z0: r.z0 - sw, z1: r.z1 + sw }; });
        function hit(a, b) { return a.x0 < b.x1 - 0.01 && a.x1 > b.x0 + 0.01 && a.z0 < b.z1 - 0.01 && a.z1 > b.z0 + 0.01; }
        var signs = o.signs || [];
        var count = 0;
        streets.forEach(function (r, ri) {
            if (o.only && o.only.indexOf(ri) < 0) return;
            var alongX = (r.x1 - r.x0) >= (r.z1 - r.z0);
            var a0 = alongX ? r.x0 - sw : r.z0 - sw;
            var a1 = alongX ? r.x1 + sw : r.z1 + sw;
            [-1, 1].forEach(function (side) {
                var pos = a0;
                var i = 0;
                while (pos < a1 - 3) {
                    var seed = ri * 31 + i * 7 + (side > 0 ? 3 : 0);
                    var w = o.minW + Math.floor(hash(seed) * 4) * ((o.maxW - o.minW) / 3);
                    var d = o.depth;
                    var fp;
                    if (alongX) {
                        var ze = side < 0 ? r.z0 - sw : r.z1 + sw;
                        fp = { x0: pos, x1: pos + w, z0: side < 0 ? ze - d : ze, z1: side < 0 ? ze : ze + d };
                    } else {
                        var xe = side < 0 ? r.x0 - sw : r.x1 + sw;
                        fp = { x0: side < 0 ? xe - d : xe, x1: side < 0 ? xe : xe + d, z0: pos, z1: pos + w };
                    }
                    var ok = !clear.some(function (c) { return hit(fp, c); }) && !occupied.some(function (c) { return hit(fp, c); });
                    if (ok) {
                        occupied.push(fp);
                        var face = alongX ? (side < 0 ? 's' : 'n') : (side < 0 ? 'e' : 'w');
                        var hasSign = signs.length && hash(seed + 11) < (o.signRate || 0.3);
                        var sign = hasSign ? signs[count % signs.length] : null;
                        K.building(ctx, {
                            x: (fp.x0 + fp.x1) / 2, z: (fp.z0 + fp.z1) / 2, w: fp.x1 - fp.x0, d: fp.z1 - fp.z0,
                            h: o.minH + Math.floor(hash(seed + 5) * 4) * ((o.maxH - o.minH) / 3),
                            color: K.FACADES[(seed + ri) % K.FACADES.length], face: face,
                            shop: !!sign, sign: sign && sign.t, signBg: sign && sign.bg,
                            awning: sign ? [C.orange, C.green, C.blue, C.yellow][count % 4] : null,
                            rooftop: o.rooftop !== false && hash(seed + 9) < 0.35,
                            collide: o.collide !== false
                        });
                        count++;
                    }
                    pos += w + 0.3;
                    i++;
                }
            });
        });
        return occupied;
    }

    /* 道路外觀：給一組可走區畫柏油＋人行道＋分隔線 */
    function drawRoads(ctx, streets, o) {
        var R = ctx.root;
        o = o || {};
        var sw = o.sidewalk == null ? 3 : o.sidewalk;
        var y = o.y == null ? 0.004 : o.y;
        streets.forEach(function (r) {
            K.ground(R, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0 + sw * 2, r.z1 - r.z0 + sw * 2, o.side || C.sidewalk, y);
        });
        streets.forEach(function (r) {
            K.ground(R, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0, o.road || C.road, y + 0.008);
        });
        if (o.lines === false) return;
        var list = o.extraStripes || [];
        streets.forEach(function (r) {
            var alongX = (r.x1 - r.x0) >= (r.z1 - r.z0);
            var a0 = alongX ? r.x0 : r.z0;
            var a1 = alongX ? r.x1 : r.z1;
            var mid = alongX ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
            for (var a = a0 + 2; a < a1 - 2; a += 7) {
                var px = alongX ? a : mid;
                var pz = alongX ? mid : a;
                var inCross = streets.some(function (s) {
                    return s !== r && px > s.x0 - 1 && px < s.x1 + 1 && pz > s.z0 - 1 && pz < s.z1 + 1;
                });
                if (inCross) continue;
                list.push(alongX ? [px, pz, 3, 0.2] : [px, pz, 0.2, 3]);
            }
        });
        K.stripes(R, list);
    }

    /* 路口的路名牌（台北式：一根柱子兩塊互相垂直的藍牌） */
    function cornerSign(ctx, x, z, nameNS, nameEW) {
        var g = new T.Group();
        g.position.set(x, 0, z);
        /* 桿子只到下面那塊路名牌的下緣（2.25），不穿過招牌 */
        K.cyl(g, 0, 0, 0, 0.08, 2.25, C.dark);
        if (nameEW) K.sign(g, nameEW, { sw: 3.2, sh: 0.9, x: 0, y: 3.7, z: 0, bg: '#2F6FB0', fg: '#FFFFFF', border: '#FFFFFF', bw: 10, both: true });
        if (nameNS) K.sign(g, nameNS, { sw: 3.2, sh: 0.9, x: 0, y: 2.7, z: 0, ry: Math.PI / 2, bg: '#2F6FB0', fg: '#FFFFFF', border: '#FFFFFF', bw: 10, both: true });
        ctx.add(g);
        return g;
    }

    /* 路口前的懸臂式路名牌（掛在路中間上方，騎車時一眼就看得到）
       pole：柱子位置；plate：牌子中心；ry：牌子朝向（面對駛來的方向） */
    function gantry(ctx, px, pz, cx, cz, text, ry) {
        var R = ctx.root;
        K.cyl(R, px, 0, pz, 0.12, 5.6, C.dark);
        var len = Math.hypot(cx - px, cz - pz);
        var arm = K.box(R, (px + cx) / 2, 5.2, (pz + cz) / 2, len, 0.14, 0.14, C.dark);
        arm.rotation.y = Math.atan2(-(cz - pz), cx - px);
        K.sign(R, text, { sw: 4.2, sh: 1.15, x: cx, y: 4.5, z: cz, ry: ry, bg: '#2F6FB0', fg: '#FFFFFF', border: '#FFFFFF', bw: 12, both: true });
    }

    /* ═══════════════════════════════════════════════════════════════
       ① 辦公室（12 樓）：找出口 → 走廊 → 電梯下樓
       ═══════════════════════════════════════════════════════════════ */
    function desk(ctx, x, z) {
        var g = new T.Group();
        g.position.set(x, 0, z);
        K.box(g, 0, 0.72, 0, 1.4, 0.06, 0.75, C.wood);
        K.box(g, -0.66, 0, 0, 0.06, 0.72, 0.7, C.white);
        K.box(g, 0.66, 0, 0, 0.06, 0.72, 0.7, C.white);
        K.box(g, 0, 0.8, -0.25, 0.64, 0.44, 0.05, K.mat(0x3F4B5E));
        K.box(g, 0, 0.84, -0.22, 0.56, 0.36, 0.01, K.basic(0xA8D8F5));
        K.box(g, 0, 0.75, 0.08, 0.5, 0.025, 0.16, C.white);
        K.box(g, 0, 0.42, 0.72, 0.52, 0.08, 0.5, C.blue);
        K.box(g, 0, 0.5, 0.96, 0.52, 0.62, 0.07, C.blue);
        K.cyl(g, 0, 0, 0.72, 0.05, 0.42, C.dark);
        ctx.add(g);
        ctx.blockRect(x, z, 1.5, 0.85);
        return g;
    }

    function drawOfficeWindows(g, w, h) {
        g.fillStyle = '#FFF6E4';
        g.fillRect(0, 0, w, h);
        var n = 3;
        var gap = 44;
        var ww = (w - gap * (n + 1)) / n;
        for (var i = 0; i < n; i++) {
            var x = gap + i * (ww + gap);
            var grd = g.createLinearGradient(0, 12, 0, h - 12);
            grd.addColorStop(0, '#7FC2F0');
            grd.addColorStop(1, '#E6F4FB');
            g.fillStyle = grd;
            g.fillRect(x, 12, ww, h - 24);
            g.fillStyle = 'rgba(255,255,255,0.95)';
            [[0.25, 0.3, 40], [0.7, 0.22, 30], [0.5, 0.45, 26]].forEach(function (c) {
                g.beginPath();
                g.ellipse(x + ww * c[0], 12 + (h - 24) * c[1], c[2], c[2] * 0.45, 0, 0, Math.PI * 2);
                g.ellipse(x + ww * c[0] + c[2] * 0.6, 12 + (h - 24) * c[1] + 4, c[2] * 0.7, c[2] * 0.35, 0, 0, Math.PI * 2);
                g.fill();
            });
            for (var b = 0; b < 9; b++) {
                var bw = 16 + ((b * 37 + i * 11) % 26);
                var bh = 22 + ((b * 53 + i * 7) % 50);
                g.fillStyle = b % 2 ? '#B7D3E7' : '#C9DFEE';
                g.fillRect(x + b * (ww / 9), h - 12 - bh, bw, bh);
            }
            g.strokeStyle = '#FFFFFF';
            g.lineWidth = 8;
            g.strokeRect(x, 12, ww, h - 24);
            g.beginPath();
            g.moveTo(x + ww / 2, 12);
            g.lineTo(x + ww / 2, h - 12);
            g.stroke();
        }
    }

    function drawClock(g, w, h) {
        var cx = w / 2;
        var cy = h / 2;
        var r = w / 2 - 8;
        g.fillStyle = '#FFFFFF';
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
        g.lineWidth = 14; g.strokeStyle = '#EE8E3A'; g.stroke();
        g.fillStyle = '#4A3B1E';
        g.font = '900 34px "Noto Sans TC", sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        [['12', 0], ['3', 90], ['6', 180], ['9', 270]].forEach(function (p) {
            var a = (p[1] - 90) * Math.PI / 180;
            g.fillText(p[0], cx + Math.cos(a) * (r - 34), cy + Math.sin(a) * (r - 34));
        });
        g.lineCap = 'round';
        g.lineWidth = 12; g.strokeStyle = '#4A3B1E';
        var ha = (150 - 90) * Math.PI / 180;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ha) * r * 0.45, cy + Math.sin(ha) * r * 0.45); g.stroke();
        g.lineWidth = 8;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - r * 0.7); g.stroke();
        g.fillStyle = '#EE8E3A';
        g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
    }

    SC.office = {
        place: '辦公室 12F',
        build: function (ctx, K, api) {
            var R = ctx.root;
            ctx.place = '辦公室 12F';
            ctx.bounds = { x0: -8, x1: 17, z0: -6, z1: 6 };
            ctx.cam = { distance: 5.2 };
            ctx.spawn = { x: -5.4, z: 3.75, yaw: 0 };

            K.ground(R, 4, 0, 120, 90, 0xE9E3D2, -0.03);
            K.floor(ctx, 0, 0, 16, 12, K.planks(4, 3));
            K.floor(ctx, 12.5, 1.5, 9, 5, K.tiles(0xF5EEDC, 0xEAE1C9, 4, 2));

            K.room(ctx, -8, 8, -6, 6, 3.2, 0xFFF6E4, { e: [[0.5, 2.5]] });
            K.wall(ctx, 8, -1, 17, -1, 3.2, 0xF6EDD8);
            K.wall(ctx, 17, 4, 8, 4, 3.2, 0xF6EDD8);
            K.wall(ctx, 17, -1, 17, 4, 3.2, 0xF6EDD8);

            /* 北牆的大窗：藍天白雲、城市天際線 */
            K.picture(R, 15.6, 2.3, 1040, 154, drawOfficeWindows, { x: 0, y: 1.75, z: -5.97 });
            /* 西牆：白板、時鐘 */
            K.picture(R, 2.4, 1.3, 480, 260, function (g, w, h) {
                g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
                g.lineWidth = 12; g.strokeStyle = '#B9B2A2'; g.strokeRect(0, 0, w, h);
                g.textAlign = 'left'; g.textBaseline = 'middle';
                g.fillStyle = '#3E86C4'; g.font = '900 48px "Noto Sans TC", sans-serif'; g.fillText('本週目標', 30, 60);
                g.fillStyle = '#E8822E'; g.font = '900 56px "Noto Sans TC", sans-serif'; g.fillText('準時下班！', 30, 135);
                g.fillStyle = '#4C9A5B'; g.font = '700 38px "Noto Sans TC", sans-serif'; g.fillText('多走路・身體好', 30, 205);
            }, { x: -7.96, y: 1.7, z: 2.2, ry: Math.PI / 2, fontText: '本週目標準時下班！多走路・身體好' });
            K.picture(R, 0.9, 0.9, 256, 256, drawClock, { x: -7.96, y: 2.3, z: -1.5, ry: Math.PI / 2, transparent: true, fontText: '12369' });

            /* 辦公桌 */
            [-3.2, -0.4, 2.4].forEach(function (z) {
                desk(ctx, -5.4, z);
                desk(ctx, -3.8, z);
                desk(ctx, 2.0, z);
                desk(ctx, 3.6, z);
            });
            /* 書櫃、飲水機、盆栽 */
            K.box(R, -7.55, 0, -3.7, 0.7, 2.0, 2.6, C.woodDark);
            ctx.blockRect(-7.55, -3.7, 0.7, 2.6);
            for (var i = 0; i < 4; i++) K.box(R, -7.2, 0.35 + i * 0.45, -3.7 + (i % 2 ? 0.4 : -0.4), 0.05, 0.35, 1.2, [C.orange, C.blue, C.green, C.yellow][i]);
            K.cyl(R, 6.9, 0, -5.2, 0.3, 1.1, C.white);
            K.cyl(R, 6.9, 1.1, -5.2, 0.24, 0.5, K.mat(0xBFE3F5, { transparent: true, opacity: 0.8 }));
            ctx.blockRect(6.9, -5.2, 0.7, 0.7);
            [[-7.3, -5.3], [7.3, 5.3], [-7.3, 5.3], [0, -5.4]].forEach(function (p) {
                K.plant(R, p[0], p[1], 1.1);
                ctx.blockRect(p[0], p[1], 0.8, 0.8);
            });

            /* 同事 */
            var c1 = K.person({ shirt: C.green, pants: 0x5A5048, hair: 0x2E2520, longHair: true });
            c1.position.set(-1.0, 0, -4.9);
            c1.rotation.y = -0.4;
            ctx.add(c1);
            ctx.blockRect(-1.0, -4.9, 0.7, 0.7);
            var c2 = K.person({ shirt: C.yellow, pants: 0x4E5A66, glasses: true });
            c2.position.set(5.9, 0, -0.4);
            c2.rotation.y = -Math.PI / 2;
            ctx.add(c2);
            ctx.blockRect(5.9, -0.4, 0.7, 0.7);
            ctx.tick(function (dt, t) {
                K.animPerson(c1, 0, 0, 'wave', t);
                K.animPerson(c2, 0, 0, 'idle', t);
            });
            ctx.item({ label: '說話', x: -1.0, z: -4.9, y: 2.75, r: 2.4, hit: [c1], use: function () { api.toast('同事：辛苦了，明天見！'); } });
            ctx.item({ label: '說話', x: 5.9, z: -0.4, y: 2.75, r: 2.4, hit: [c2], use: function () { api.toast('同事：今天準時下班喔！路上小心。'); } });

            /* 南牆：茶水間、會議室（不是出口） */
            [[-4, '茶水間', '這是茶水間，不是出口。'], [3, '會議室', '會議室裡沒人，大家都下班了。']].forEach(function (d) {
                var door = K.box(R, d[0], 0, 5.93, 1.2, 2.3, 0.08, C.woodDark);
                K.sign(R, d[1], { sw: 1.3, sh: 0.4, x: d[0], y: 2.6, z: 5.9, ry: Math.PI, bg: '#FFFDF6', fg: '#4A3B1E', border: '#B98A5A', bw: 8 });
                ctx.item({ label: '開門', x: d[0], z: 5.2, fx: d[0], fz: 5.93, y: 2.35, r: 2.2, hit: [door], use: function () { api.toast(d[2]); } });
            });

            /* 東牆：出口（要先開門） */
            var door = K.box(R, 8.08, 0, 1.5, 0.1, 2.45, 2.0, K.own(new T.MeshLambertMaterial({ color: 0xE9CFA6 })));
            ctx.occluder(door);
            K.box(R, 8.0, 2.45, 1.5, 0.3, 0.14, 2.3, C.white);
            K.sign(R, '出口 EXIT', { sw: 1.5, sh: 0.45, x: 7.94, y: 2.85, z: 1.5, ry: -Math.PI / 2, bg: '#3C9A55', fg: '#FFFFFF', border: '#FFFFFF', bw: 8 });
            ctx.block(7.9, 8.2, 0.5, 2.5);
            var doorCol = ctx.lastCollider();
            ctx.data.doorOpen = false;
            ctx.item({
                label: '開門', x: 7.2, z: 1.5, fx: 8.0, fz: 1.5, y: 2.4, r: 2.4, hit: [door],
                enabled: function () { return !ctx.data.doorOpen; },
                use: function () {
                    ctx.data.doorOpen = true;
                    api.sfx('door');
                    FM.core.tween(0.8, function (t) { door.position.z = 1.5 + 2.1 * t; });
                    ctx.unblock(doorCol);
                    api.toast('門開了！外面是走廊。');
                }
            });

            /* 走廊：洗手間、海報、電梯 */
            var wc = K.box(R, 12, 0, -0.93, 1.1, 2.3, 0.08, C.sky);
            K.sign(R, '洗手間', { sw: 1.2, sh: 0.4, x: 12, y: 2.6, z: -0.9, bg: '#FFFDF6', fg: '#3E86C4', border: '#3E86C4', bw: 8 });
            ctx.item({ label: '開門', x: 12, z: -0.2, fx: 12, fz: -0.93, y: 2.35, r: 2.0, hit: [wc], use: function () { api.toast('這是洗手間。'); } });
            K.sign(R, '健康步行・快樂回家', { sw: 2.6, sh: 0.7, x: 12.5, y: 1.8, z: 3.93, ry: Math.PI, bg: '#FFF1D0', fg: '#4C9A5B', border: '#E0AA25', bw: 8 });
            K.plant(R, 9.2, 3.4, 1);
            ctx.blockRect(9.2, 3.4, 0.8, 0.8);

            var frame = K.box(R, 16.95, 0, 1.5, 0.12, 2.8, 2.5, C.champagne);
            void frame;
            var dl = K.box(R, 16.86, 0, 1.0, 0.08, 2.4, 0.98, C.metal);
            var dr = K.box(R, 16.86, 0, 2.0, 0.08, 2.4, 0.98, C.metal);
            K.sign(R, '電梯 12F', { sw: 1.6, sh: 0.45, x: 16.9, y: 2.95, z: 1.5, ry: -Math.PI / 2, bg: '#1D1B20', fg: '#FFB23F', bw: 0 });
            K.box(R, 16.9, 1.0, 3.1, 0.06, 0.4, 0.22, C.champagne);
            ctx.item({
                label: '搭電梯', x: 15.9, z: 1.5, fx: 16.9, fz: 1.5, y: 2.65, r: 2.6, hit: [dl, dr],
                use: async function () {
                    var a = await api.ask({
                        title: '電梯', text: '要搭電梯下樓嗎？',
                        choices: [{ label: '下樓到 1 樓', value: true, kind: 'go' }, { label: '先不要', value: false, kind: 'line' }]
                    });
                    if (!a) return;
                    api.freeze(true);
                    api.sfx('ding');
                    await FM.core.tween(0.8, function (t) { dl.position.z = 1.0 - 0.9 * t; dr.position.z = 2.0 + 0.9 * t; });
                    api.go('street_company', {}, { text: '電梯往下…' });
                }
            });
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       ② 公司門口：公車站（236）
       ═══════════════════════════════════════════════════════════════ */
    SC.street_company = {
        build: function (ctx, K, api) {
            ctx.place = '公司門口';
            street(ctx, {
                L: 42, park: true, skipN: [-3, 7, 18],
                north: [
                    { x0: -42, x1: -24, h: 8, color: C.mint, sign: '花店', signBg: '#4C9A5B', awning: C.green, d: 12 },
                    { x0: -22, x1: 14, h: 34, color: C.sky, sign: '晴空大樓', signBg: '#3E86C4', signW: 9, signH: 1.6, doorX: 1, d: 20 },
                    { x0: 16, x1: 42, h: 9, color: C.cream, sign: '便利商店', signBg: '#E8822E', awning: C.green, d: 12 }
                ]
            });
            ctx.spawn = { x: -3, z: -8.2, yaw: Math.PI };

            var stop = K.busStop(ctx, { x: 7, z: -5.9, name: '公司前站', routes: '236・263・326', ry: 0, shelterX: 2.8 });
            ctx.item({
                label: '等公車', x: 7, z: -6.6, fx: 7, fz: -5.9, y: 2.15, r: 3, hit: [stop],
                use: async function () {
                    if (!(await askWait(api))) return;
                    var pick = await busSequence(ctx, api, {
                        stopX: 7, laneZ: -2.6, dir: -1, routes: ['263', '236', '326'],
                        cam: { pos: [-3, 6.5, 6.5], look: [24, 1.2, -2.6] }
                    });
                    if (pick === '236') api.go('bus', ROUTES.r236, { text: '搭上 236 號公車' });
                    else api.fail('搭錯車了！這是 ' + pick + ' 號公車。');
                }
            });
            ctx.item({ label: '進公司', x: -3, z: -8.6, fx: -3, fz: -9, y: 2.75, r: 2.6, use: function () { api.toast('已經下班了，回家吧！'); } });
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       ③ 公車上：依序廣播到站，選對站下車
       ═══════════════════════════════════════════════════════════════ */
    SC.bus = {
        build: function (ctx, K, api, p) {
            var R = ctx.root;
            ctx.mode = 'none';
            ctx.place = p.route + ' 號公車';
            var gap = 72;
            var n = p.stops.length;
            var len = gap * (n + 1) + 80;
            K.ground(R, len / 2, 0, len + 400, 400, C.grass, -0.05);
            K.ground(R, len / 2, 0, len + 200, 10, C.road, 0.01);
            var dash = [];
            for (var x = -40; x < len + 60; x += 7) dash.push([x, 0, 3.2, 0.2]);
            K.stripes(R, dash);
            K.box(R, len / 2, 0, -7, len + 200, 0.08, 4, C.sidewalk);
            K.box(R, len / 2, 0, 7, len + 200, 0.08, 4, C.sidewalk);
            var road = [{ x0: -60, x1: len + 60, z0: -5, z1: 5 }];
            fillBuildings(ctx, road, {
                sidewalk: 4, minW: 9, maxW: 15, depth: 12, minH: 8, maxH: 20, collide: false, rooftop: false,
                signs: [{ t: '水果行', bg: '#4C9A5B' }, { t: '早餐店', bg: '#E8822E' }, { t: '藥局', bg: '#3E86C4' }, { t: '書局', bg: '#E0AA25' }, { t: '診所', bg: '#4C9A5B' }, { t: '麵店', bg: '#E8822E' }]
            });
            var trees = [];
            for (x = -30; x < len + 40; x += 14) { trees.push({ x: x, z: -8.4 }); trees.push({ x: x + 7, z: 8.4 }); }
            K.forest(ctx, trees);
            K.clouds(ctx, len / 2, -40, 12, 160);

            /* 各站：南側人行道上的站牌（朝向駛來的公車）＋沿路邊的候車亭 */
            ctx.data.stopX = [];
            p.stops.forEach(function (name, i) {
                var sx = gap * (i + 1);
                ctx.data.stopX.push(sx);
                K.cyl(R, sx, 0, 5.8, 0.08, 2.8, C.dark);
                K.sign(R, name, { sw: 3.2, sh: 1.0, x: sx, y: 3.3, z: 5.8, ry: -Math.PI / 2, bg: '#4C9A5B', fg: '#FFFFFF', border: '#FFFFFF', bw: 10, both: true });
                K.box(R, sx + 4, 2.5, 7.6, 4.4, 0.14, 1.8, C.green);
                K.box(R, sx + 2, 0, 7.6, 0.1, 2.5, 0.1, C.dark);
                K.box(R, sx + 6, 0, 7.6, 0.1, 2.5, 0.1, C.dark);
                K.box(R, sx + 4, 0.3, 8.45, 4.2, 2.1, 0.06, K.mat(C.glass, { transparent: true, opacity: 0.55 }));
                K.box(R, sx + 4, 0.45, 8.1, 3.4, 0.08, 0.45, C.wood);
                K.sign(R, name + '站', { sw: 3.6, sh: 0.8, x: sx + 4, y: 3.1, z: 6.72, ry: 0, bg: '#FFFDF6', fg: '#3E86C4', border: '#4C9A5B', bw: 8 });
            });

            var bus = K.bus(p.route);
            bus.position.set(0, 0, 2.6);
            ctx.add(bus);
            ctx.data.bus = bus;
            var camPos = new T.Vector3();
            var look = new T.Vector3();
            ctx.data.camMode = 'chase';
            ctx.camScript = function (dt, cam, cl) {
                var bx = bus.position.x;
                if (ctx.data.camMode === 'chase') {
                    camPos.set(bx - 15, 7.5, 5.8);
                    look.set(bx + 12, 1.2, 3.2);
                } else {
                    var sx = ctx.data.focusX;
                    camPos.set(sx - 11, 4.4, 8.2);
                    look.set(sx + 2, 2.4, 5.2);
                }
                var k = 1 - Math.exp(-dt * 3);
                cam.position.lerp(camPos, k);
                cl.lerp(look, k);
                cam.lookAt(cl);
            };
            camPos.set(-15, 7.5, 5.8);
            look.set(12, 1.2, 3.2);
            FM.core.camera().position.copy(camPos);
        },

        enter: async function (ctx, api, p) {
            var bus = ctx.data.bus;
            var passed = false;
            api.freeze(true);
            /* 不念：把時間留給到站廣播 */
            api.toast(p.route + ' 號公車出發了！注意聽廣播。', 3000, { silent: true });
            for (var i = 0; i < p.stops.length; i++) {
                var name = p.stops[i];
                var from = bus.position.x;
                var to = ctx.data.stopX[i] - 4.5;
                api.banner('下一站：' + name);
                api.speak('下一站，' + name);
                ctx.data.camMode = 'chase';
                await FM.core.tween(Math.max(3.5, (to - from) / 13), function (t) {
                    bus.position.x = from + (to - from) * FM.core.ease(t);
                });
                if (FM.core.ctx !== ctx) return;
                if (passed) {
                    api.banner(null);
                    api.fail('坐過站了！應該在「' + p.target + '」下車。');
                    return;
                }
                ctx.data.focusX = ctx.data.stopX[i];
                ctx.data.camMode = 'stop';
                api.banner(name + ' 到了');
                api.sfx('ding');
                api.speak(name + '，到了');
                await wait(700);
                var a = await api.ask({
                    title: name + ' 到了', text: '要在這一站下車嗎？', speak: '要在這一站下車嗎？',
                    choices: [{ label: '下車', value: 'off', kind: 'go' }, { label: '繼續坐', value: 'stay', kind: 'line' }]
                });
                api.banner(null);
                if (a === 'off') {
                    if (name === p.target) api.go(p.next, p.nextParams, { text: '在' + name + '下車' });
                    else api.fail('下錯站了！這裡是「' + name + '」。');
                    return;
                }
                if (name === p.target) passed = true;
            }
            api.fail('坐到終點站了！應該在「' + p.target + '」下車。');
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       ④ 衡陽路：遠東百貨、公車站（758）
       ═══════════════════════════════════════════════════════════════ */
    SC.street_hengyang = {
        build: function (ctx, K, api, p) {
            var R = ctx.root;
            ctx.place = '衡陽路';
            var north = [
                { x0: -42, x1: -26, h: 16, color: C.sand, sign: '銀行', signBg: '#2F6FB0', d: 14 },
                { x0: -24, x1: -8, h: 11, color: C.butter, sign: '書店', signBg: '#4C9A5B', awning: C.green, d: 12 },
                { x0: -6, x1: 30, h: 26, color: C.cream, sign: '遠東百貨', signBg: '#E8822E', signW: 13, signH: 2.4, signY: 5.2, awning: C.orange, d: 22, doorX: 0 },
                { x0: 32, x1: 42, h: 9, color: C.mint, sign: '咖啡館', signBg: '#3E86C4', awning: C.blue, d: 12 }
            ];
            street(ctx, {
                L: 42, skipN: [-34, -14, 12], skipS: [],
                north: north,
                south: [
                    { x0: -42, x1: -24, h: 10, color: C.sky, sign: '藥局', signBg: '#4C9A5B', d: 12 },
                    { x0: -22, x1: -2, h: 12, color: C.peach, sign: '眼鏡行', signBg: '#3E86C4', d: 12 },
                    { x0: 0, x1: 20, h: 13, color: C.mint, sign: '服飾店', signBg: '#E0AA25', awning: C.yellow, d: 12 },
                    { x0: 22, x1: 42, h: 9, color: C.butter, sign: '文具店', signBg: '#E8822E', d: 12 }
                ]
            });
            /* 百貨公司：週年慶直式布條、大門地墊 */
            K.sign(R, '週年慶', { sw: 1.4, sh: 4.2, x: 2, y: 9.5, z: -8.85, bg: '#E8822E', fg: '#FFFFFF', border: '#FFFFFF', bw: 10 });
            K.sign(R, '歡迎光臨', { sw: 1.4, sh: 4.2, x: 22, y: 9.5, z: -8.85, bg: '#4C9A5B', fg: '#FFFFFF', border: '#FFFFFF', bw: 10 });
            K.box(R, 12, 0.02, -8.6, 4, 0.03, 1.2, C.orange);

            var stop = K.busStop(ctx, { x: -14, z: -5.9, name: '衡陽路站', routes: '236・758・578', ry: 0, shelterX: -4 });
            if (p.from === 'dept') ctx.spawn = { x: 12, z: -8.1, yaw: Math.PI };
            else ctx.spawn = { x: -10, z: -7.4, yaw: -Math.PI / 2 };

            ctx.item({
                label: '進百貨', x: 12, z: -8.6, fx: 12, fz: -9, y: 3.1, r: 3, hit: [north[2].obj],
                use: function () {
                    if (api.has('gift')) { api.toast('禮物已經買好了！'); return; }
                    api.go('dept1f', {}, { text: '走進遠東百貨' });
                }
            });
            ctx.item({ label: '進銀行', x: -34, z: -8.6, fx: -34, fz: -9, y: 2.9, r: 2.6, use: function () { api.toast('銀行已經下班關門了。'); } });
            ctx.item({ label: '進書店', x: -16, z: -8.6, fx: -16, fz: -9, y: 3.1, r: 2.6, use: function () { api.toast('書店：歡迎參觀！'); } });
            ctx.item({
                label: '等公車', x: -14, z: -6.6, fx: -14, fz: -5.9, y: 2.15, r: 3, hit: [stop],
                use: async function () {
                    if (!(await askWait(api))) return;
                    var pick = await busSequence(ctx, api, {
                        stopX: -14, laneZ: -2.6, dir: -1, routes: ['578', '758', '785'],
                        cam: { pos: [-24, 6.5, 6.5], look: [3, 1.2, -2.6] }
                    });
                    if (!api.has('gift')) api.fail('禮物還沒買，就先搭車離開了！');
                    else if (pick !== '758') api.fail('搭錯車了！這是 ' + pick + ' 號公車。');
                    else api.go('bus', ROUTES.r758, { text: '搭上 758 號公車' });
                }
            });
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       ⑤ 遠東百貨 1F：電梯選樓層
       ═══════════════════════════════════════════════════════════════ */
    /* 電梯門：用單面平板（像室內牆一樣），鏡頭在牆後時自動看穿，不會擋住玩家 */
    function elevatorDoors(ctx, R, x, z, ry, label) {
        var g = new T.Group();
        g.position.set(x, 0, z);
        g.rotation.y = ry;
        K.mesh(g, K.G.plane, K.mat(C.champagne), 0, 1.5, 0.02, 2.6, 3.0, 1);
        var l = K.mesh(g, K.G.plane, K.mat(C.metal), -0.5, 1.25, 0.05, 0.98, 2.5, 1);
        var r = K.mesh(g, K.G.plane, K.mat(C.metal), 0.5, 1.25, 0.05, 0.98, 2.5, 1);
        K.mesh(g, K.G.plane, K.mat(0xB9B3A5), 0, 1.25, 0.06, 0.03, 2.5, 1);
        K.sign(g, label, { sw: 1.3, sh: 0.4, x: 0, y: 2.75, z: 0.08, bg: '#1D1B20', fg: '#FFB23F', bw: 0 });
        R.add(g);
        g.userData.open = function (api) {
            api.sfx('ding');
            return FM.core.tween(0.7, function (t) { l.position.x = -0.5 - 0.9 * t; r.position.x = 0.5 + 0.9 * t; });
        };
        return g;
    }

    function shopper(ctx, pts, look) {
        var p = K.person(look);
        ctx.add(p);
        var i = 0;
        var pos = new T.Vector3(pts[0][0], 0, pts[0][1]);
        p.position.copy(pos);
        var phase = Math.random() * 6;
        ctx.tick(function (dt, t) {
            var tgt = pts[(i + 1) % pts.length];
            var dx = tgt[0] - p.position.x;
            var dz = tgt[1] - p.position.z;
            var d = Math.sqrt(dx * dx + dz * dz);
            if (d < 0.2) { i = (i + 1) % pts.length; return; }
            var speed = FM.CONFIG.npcSpeed;
            var s = Math.min(d, speed * dt);
            p.position.x += dx / d * s;
            p.position.z += dz / d * s;
            p.rotation.y = Math.atan2(-dx, -dz);
            phase += dt * 3.3 * speed;
            K.animPerson(p, phase, 0.8, 'walk', t);
        });
        return p;
    }

    SC.dept1f = {
        build: function (ctx, K, api, p) {
            var R = ctx.root;
            ctx.place = '遠東百貨 1F';
            ctx.bounds = { x0: -12, x1: 12, z0: -10, z1: 10 };
            ctx.cam = { distance: 5.4 };
            K.ground(R, 0, 0, 120, 120, 0xE8E0CC, -0.03);
            K.floor(ctx, 0, 0, 24, 20, K.tiles(0xFFF8E6, 0xF6EACB, 8, 7));
            K.room(ctx, -12, 12, -10, 10, 5, 0xFFF8EA, { s: [[-2.5, 2.5]] });
            /* 大門玻璃 */
            K.box(R, -3.2, 0, 10, 1.4, 3.2, 0.1, K.mat(C.glass, { transparent: true, opacity: 0.5 }));
            K.box(R, 3.2, 0, 10, 1.4, 3.2, 0.1, K.mat(C.glass, { transparent: true, opacity: 0.5 }));
            K.box(R, 0, 0.02, 9.2, 4, 0.03, 1.4, C.orange);

            /* 電梯（北牆） */
            var e1 = elevatorDoors(ctx, R, 6, -9.9, 0, '▲ 1F');
            var e2 = elevatorDoors(ctx, R, 9.4, -9.9, 0, '▲ 1F');
            K.sign(R, '電梯 ELEVATOR', { sw: 4, sh: 0.7, x: 7.7, y: 3.8, z: -9.85, bg: '#3E86C4', fg: '#FFFFFF', border: '#FFFFFF', bw: 8 });
            ctx.block(4.5, 11, -10, -9.6);

            /* 手扶梯（裝飾） */
            var esc = K.box(R, -9.5, 0, -4, 2, 0.4, 7, C.metal);
            esc.rotation.x = -0.35;
            esc.position.y = 1.2;
            K.box(R, -10.6, 0, -4, 0.15, 2.4, 7, K.mat(C.glass, { transparent: true, opacity: 0.6 }));
            K.box(R, -8.4, 0, -4, 0.15, 2.4, 7, K.mat(C.glass, { transparent: true, opacity: 0.6 }));
            ctx.block(-10.8, -8.2, -7.6, -0.4);

            /* 化妝品櫃、柱子、中央花台 */
            [[-5.5, -3.5], [-5.5, 3], [4, 3.5]].forEach(function (q, i) {
                K.box(R, q[0], 0, q[1], 3.2, 1.0, 1.4, C.white);
                K.box(R, q[0], 0.98, q[1], 3.3, 0.08, 1.5, [C.orange, C.green, C.yellow][i]);
                for (var k = 0; k < 5; k++) K.cyl(R, q[0] - 1.2 + k * 0.6, 1.06, q[1], 0.09, 0.3, [C.blue, C.orange, C.green, 0xF6A6B2, C.yellow][k]);
                ctx.blockRect(q[0], q[1], 3.3, 1.5);
            });
            [[-2.5, -6], [2.5, -6], [-2.5, 5.5], [8, 5.5]].forEach(function (q) {
                K.cyl(R, q[0], 0, q[1], 0.45, 5, C.cream);
                K.cyl(R, q[0], 0, q[1], 0.55, 0.3, C.champagne);
                ctx.blockRect(q[0], q[1], 1, 1);
            });
            K.cyl(R, 0, 0, 0.5, 1.5, 0.6, C.white);
            K.flowerBed(ctx, 0, 0.5, 2.2, 2.2);

            /* 服務台 */
            K.box(R, -7, 0, 7.2, 3, 1.05, 1.1, C.white);
            K.box(R, -7, 1.03, 7.2, 3.1, 0.08, 1.2, C.blue);
            K.sign(R, '服務台', { sw: 1.8, sh: 0.5, x: -7, y: 1.5, z: 7.8, bg: '#3E86C4', fg: '#FFFFFF', bw: 0 });
            ctx.blockRect(-7, 7.2, 3.1, 1.2);
            var clerk = K.person({ shirt: C.white, pants: C.blue, hair: 0x3A2A20, bun: true, dress: C.blue });
            clerk.position.set(-7, 0, 6.2);
            clerk.rotation.y = Math.PI;
            ctx.add(clerk);
            ctx.tick(function (dt, t) { K.animPerson(clerk, 0, 0, 'idle', t); });

            shopper(ctx, [[-1, 7], [-1, -7], [7, -6], [7, 7]], { shirt: C.orange, pants: 0x5B6470, longHair: true, dress: C.yellow });
            shopper(ctx, [[9, -3], [-2, -8], [-4, 0]], { shirt: C.green, pants: 0x4E5A66, glasses: true });

            if (p.from === 'elevator') ctx.spawn = { x: 7.7, z: -7.4, yaw: Math.PI };
            else ctx.spawn = { x: 0, z: 8.3, yaw: 0 };

            ctx.item({
                label: '搭電梯', x: 7.7, z: -8.7, fx: 7.7, fz: -9.9, y: 3.4, r: 3, hit: [e1, e2],
                use: async function () {
                    var f = await api.ask({
                        title: '電梯', text: '要去幾樓？', cols: 3, big: true,
                        choices: ['1F', '2F', '3F', '4F', '5F', '6F'].map(function (x) { return { label: x, value: x, kind: 'sky' }; })
                    });
                    if (f === '1F') { api.toast('這裡就是 1 樓。'); return; }
                    if (api.has('gift')) { api.toast('禮物已經買好了，從大門出去吧！'); return; }
                    api.freeze(true);
                    await e1.userData.open(api);
                    if (f === '3F') api.go('dept3f', {}, { text: '電梯往上…' });
                    else api.fail('走錯樓層了！' + f + ' 沒有要買的東西。');
                }
            });
            ctx.item({ label: '出去', x: 0, z: 9.3, fx: 0, fz: 10, y: 2.4, r: 2.6, use: function () { api.go('street_hengyang', { from: 'dept' }, { text: '走出百貨公司' }); } });
            ctx.item({ label: '詢問', x: -7, z: 6.2, y: 2.75, r: 2.4, hit: [clerk], use: function () { api.toast('服務台：歡迎光臨遠東百貨！'); } });
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       ⑥ 遠東百貨 3F：找到玉器珠寶店，買翡翠手鐲
       ═══════════════════════════════════════════════════════════════ */
    function shopUnit(ctx, R, o) {
        /* o: {x0,x1,z0,z1, open:[a,b] 開口（沿正面）, front:'s'|'n'|'e'|'w', color, sign, signBg} */
        var h = 2.8;
        var mat = K.own(new T.MeshLambertMaterial({ color: o.color }));
        function part(x0, x1, z0, z1) {
            var m = K.box(R, (x0 + x1) / 2, 0, (z0 + z1) / 2, Math.max(0.2, x1 - x0), h, Math.max(0.2, z1 - z0), mat);
            ctx.occluder(m);
            ctx.block(x0, x1, z0, z1);
            return m;
        }
        var t = 0.1;
        if (o.front === 's') {
            part(o.x0, o.open[0], o.z1 - t, o.z1 + t);
            part(o.open[1], o.x1, o.z1 - t, o.z1 + t);
            if (o.sideL !== false) part(o.x0 - t, o.x0 + t, o.z0, o.z1);
            if (o.sideR !== false) part(o.x1 - t, o.x1 + t, o.z0, o.z1);
            K.sign(R, o.sign, { sw: Math.min(4.6, o.open[1] - o.open[0] + 1.8), sh: 0.8, x: (o.open[0] + o.open[1]) / 2, y: 3.35, z: o.z1 + 0.16, bg: o.signBg, fg: '#FFFFFF', border: '#FFFFFF', bw: 8 });
        } else if (o.front === 'e') {
            part(o.x1 - t, o.x1 + t, o.z0, o.open[0]);
            part(o.x1 - t, o.x1 + t, o.open[1], o.z1);
            part(o.x0, o.x1, o.z0 - t, o.z0 + t);
            part(o.x0, o.x1, o.z1 - t, o.z1 + t);
            K.sign(R, o.sign, { sw: Math.min(4.6, o.open[1] - o.open[0] + 1.8), sh: 0.8, x: o.x1 + 0.16, y: 3.35, z: (o.open[0] + o.open[1]) / 2, ry: Math.PI / 2, bg: o.signBg, fg: '#FFFFFF', border: '#FFFFFF', bw: 8 });
        } else if (o.front === 'w') {
            part(o.x0 - t, o.x0 + t, o.z0, o.open[0]);
            part(o.x0 - t, o.x0 + t, o.open[1], o.z1);
            part(o.x0, o.x1, o.z0 - t, o.z0 + t);
            part(o.x0, o.x1, o.z1 - t, o.z1 + t);
            K.sign(R, o.sign, { sw: Math.min(4.6, o.open[1] - o.open[0] + 1.8), sh: 0.8, x: o.x0 - 0.16, y: 3.35, z: (o.open[0] + o.open[1]) / 2, ry: -Math.PI / 2, bg: o.signBg, fg: '#FFFFFF', border: '#FFFFFF', bw: 8 });
        }
        K.floor(ctx, (o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2, o.x1 - o.x0, o.z1 - o.z0, K.tiles(o.floor || 0xFFFDF4, o.floor2 || 0xF3EBD6, 3, 3), null, 0.015);
    }

    function counter(ctx, R, x, z, w, d, color) {
        K.box(R, x, 0, z, w, 0.95, d, C.white);
        K.box(R, x, 0.2, z + d / 2 + 0.01, w - 0.2, 0.5, 0.02, color);
        K.box(R, x, 0.95, z, w, 0.45, d, K.mat(0xDDF2FB, { transparent: true, opacity: 0.45 }));
        ctx.blockRect(x, z, w, d);
    }

    SC.dept3f = {
        build: function (ctx, K, api) {
            var R = ctx.root;
            ctx.place = '遠東百貨 3F';
            ctx.bounds = { x0: -14, x1: 14, z0: -12, z1: 12 };
            ctx.cam = { distance: 5.4 };
            ctx.spawn = { x: 0, z: 9.4, yaw: 0 };
            K.ground(R, 0, 0, 120, 120, 0xE8E0CC, -0.03);
            K.floor(ctx, 0, 0, 28, 24, K.tiles(0xF9F4E2, 0xEEE6CD, 9, 8));
            K.room(ctx, -14, 14, -12, 12, 5, 0xFFF8EA);

            /* 玉器珠寶（北側左） */
            shopUnit(ctx, R, { x0: -13.9, x1: -4, z0: -11.9, z1: -5, open: [-10.2, -6.8], front: 's', sideL: false, color: 0xDDEFE0, sign: '玉器珠寶', signBg: '#3C8C5A', floor: 0xF1F8EE, floor2: 0xE2EFDD });
            counter(ctx, R, -8.5, -9.4, 4.4, 0.9, 0x3C8C5A);
            var jade = K.mat(0x3E9E6A, { emissive: 0x0F3A22 });
            for (var j = 0; j < 5; j++) {
                var bangle = K.mesh(R, K.G.torus, jade, -10.2 + j * 0.85, 1.12, -9.4, 0.36, 0.36, 0.36);
                bangle.rotation.x = Math.PI / 2;
            }
            K.box(R, -8.5, 0, -11.6, 6, 2.2, 0.5, C.woodDark);
            for (j = 0; j < 6; j++) K.ball(R, -11 + j, 1.5, -11.3, 0.15, jade);
            var jClerk = K.person({ shirt: C.white, pants: 0x3C8C5A, hair: 0x2E2520, bun: true, dress: 0x3C8C5A });
            jClerk.position.set(-8.5, 0, -10.6);
            jClerk.rotation.y = Math.PI;
            ctx.add(jClerk);

            /* 名錶精品（北側右） */
            shopUnit(ctx, R, { x0: 4, x1: 13.9, z0: -11.9, z1: -5, open: [6.8, 10.2], front: 's', sideR: false, color: 0xDDE8F4, sign: '名錶精品', signBg: '#2F6FB0' });
            counter(ctx, R, 8.5, -9.4, 4.4, 0.9, 0x2F6FB0);
            for (j = 0; j < 5; j++) K.cyl(R, 6.7 + j * 0.9, 1.0, -9.4, 0.14, 0.06, C.champagne);
            var wClerk = K.person({ shirt: C.white, pants: 0x2F4F7A, hair: 0x2E2520, glasses: true, tie: K.mat(C.blue) });
            wClerk.position.set(8.5, 0, -10.6);
            wClerk.rotation.y = Math.PI;
            ctx.add(wClerk);

            /* 皮件（西側）、女裝（東側） */
            shopUnit(ctx, R, { x0: -13.9, x1: -8, z0: -2, z1: 8, open: [1.5, 4.5], front: 'e', color: 0xF8E4CC, sign: '皮件精品', signBg: '#E8822E' });
            counter(ctx, R, -11.8, 3, 0.9, 3.6, 0xE8822E);
            for (j = 0; j < 3; j++) K.box(R, -11.8, 1.0, 1.8 + j * 1.2, 0.5, 0.35, 0.7, [0xB9804A, 0x8A5A34, 0xD8A26A][j]);
            shopUnit(ctx, R, { x0: 8, x1: 13.9, z0: -2, z1: 8, open: [1.5, 4.5], front: 'w', color: 0xFBF0CC, sign: '女裝服飾', signBg: '#E0AA25' });
            counter(ctx, R, 11.8, 3, 0.9, 3.6, 0xE0AA25);
            for (j = 0; j < 3; j++) K.box(R, 12.8, 0, 0.5 + j * 2.2, 0.7, 1.6, 0.5, [C.mint, C.sky, C.peach][j]);

            /* 中央休息區 */
            K.box(R, -2.5, 0, 0, 2.4, 0.5, 0.9, C.blue);
            K.box(R, 2.5, 0, 0, 2.4, 0.5, 0.9, C.green);
            ctx.blockRect(-2.5, 0, 2.4, 0.9);
            ctx.blockRect(2.5, 0, 2.4, 0.9);
            K.cyl(R, 0, 0, 0, 0.6, 0.45, C.wood);
            ctx.blockRect(0, 0, 1.2, 1.2);
            K.plant(R, -5.5, 9, 1.2);
            K.plant(R, 5.5, 9, 1.2);
            ctx.blockRect(-5.5, 9, 0.9, 0.9);
            ctx.blockRect(5.5, 9, 0.9, 0.9);
            K.sign(R, '3F 精品・珠寶・服飾', { sw: 5, sh: 0.8, x: 0, y: 3.6, z: 11.9, ry: Math.PI, bg: '#FFFDF6', fg: '#4A3B1E', border: '#E0AA25', bw: 8 });
            shopper(ctx, [[-3, 4], [3, 4], [3, -3], [-3, -3]], { shirt: C.peach, pants: 0x5B6470, longHair: true, dress: C.blue });

            /* 電梯（南牆） */
            var el = elevatorDoors(ctx, R, 0, 11.9, Math.PI, '3F');
            ctx.block(-1.4, 1.4, 11.5, 12);

            ctx.tick(function (dt, t) {
                K.animPerson(jClerk, 0, 0, 'idle', t);
                K.animPerson(wClerk, 0, 0, 'idle', t);
            });

            ctx.item({
                label: '買東西', x: -8.5, z: -8.4, fx: -8.5, fz: -10.6, y: 2.75, r: 2.6, hit: [jClerk],
                use: async function () {
                    if (api.has('gift')) { api.toast('禮物已經買好了！'); return; }
                    var v = await api.ask({
                        title: '玉器珠寶', text: '店員：歡迎光臨！請問要買什麼？', cols: 2,
                        choices: shuffle(['翡翠手鐲', '珍珠項鍊', '黃金戒指', '白玉玉珮']).map(function (x) { return { label: x, value: x, kind: 'sky' }; })
                    });
                    if (v !== '翡翠手鐲') { api.fail('買錯禮物了！買成了「' + v + '」。'); return; }
                    api.give('gift');
                    api.sfx('good');
                    await api.say({ title: '買好了！', text: '店員：翡翠手鐲幫您包裝好了，祝夫人生日快樂！', ok: '謝謝', kind: 'go' });
                }
            });
            ctx.item({ label: '逛逛', x: 8.5, z: -8.4, fx: 8.5, fz: -10.6, y: 2.75, r: 2.6, hit: [wClerk], use: function () { api.toast('名錶店：歡迎參觀！'); } });
            ctx.item({ label: '逛逛', x: -10.6, z: 3, fx: -11.8, fz: 3, y: 2.2, r: 2.4, use: function () { api.toast('皮件精品：歡迎參觀！'); } });
            ctx.item({ label: '逛逛', x: 10.6, z: 3, fx: 11.8, fz: 3, y: 2.2, r: 2.4, use: function () { api.toast('女裝服飾：歡迎參觀！'); } });
            ctx.item({
                label: '搭電梯', x: 0, z: 10.6, fx: 0, fz: 11.9, y: 2.5, r: 2.8, hit: [el],
                use: async function () {
                    var f = await api.ask({
                        title: '電梯', text: '要去幾樓？', cols: 3, big: true,
                        choices: ['1F', '2F', '3F', '4F', '5F', '6F'].map(function (x) { return { label: x, value: x, kind: 'sky' }; })
                    });
                    if (f === '3F') { api.toast('這裡就是 3 樓。'); return; }
                    if (f !== '1F') { api.toast('這層沒有要辦的事。'); return; }
                    api.freeze(true);
                    await el.userData.open(api);
                    api.go('dept1f', { from: 'elevator' }, { text: '電梯往下…' });
                }
            });
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       ⑦ 蘭陽蛋糕店門口：拿蛋糕、租 UBIKE
       ═══════════════════════════════════════════════════════════════ */
    SC.street_cake = {
        build: function (ctx, K, api, p) {
            var R = ctx.root;
            ctx.place = '蘭陽蛋糕店';
            var north = [
                { x0: -42, x1: -28, h: 8, color: C.mint, sign: '茶飲店', signBg: '#4C9A5B', awning: C.green, d: 12 },
                { x0: -26, x1: -12, h: 9, color: C.butter, sign: '阿美麵包坊', signBg: '#E0AA25', awning: C.yellow, d: 12, doorX: 0 },
                { x0: -10, x1: 6, h: 10, color: C.cream, sign: '蘭陽蛋糕店', signBg: '#E8822E', awning: C.orange, d: 12, doorX: 0 },
                { x0: 8, x1: 22, h: 8, color: C.peach, sign: '花店', signBg: '#4C9A5B', awning: C.green, d: 12 },
                { x0: 24, x1: 42, h: 12, color: C.sky, sign: '郵局', signBg: '#4C9A5B', d: 14 }
            ];
            street(ctx, {
                L: 42, skipN: [-19, -2, 13, -18], north: north,
                south: [
                    { x0: -42, x1: -20, h: 11, color: C.sand, d: 12, shop: false },
                    { x0: -18, x1: 4, h: 14, color: C.apricot, d: 12, shop: false },
                    { x0: 6, x1: 42, h: 10, color: C.mint, sign: '公園管理處', signBg: '#4C9A5B', d: 12 }
                ]
            });
            var stop = K.busStop(ctx, { x: -18, z: -5.9, name: '蘭陽蛋糕店站', routes: '758・12', ry: 0, shelterX: -3.4 });

            /* UBIKE 租借站 */
            var ub = new T.Group();
            ub.position.set(13, 0, -6.4);
            K.box(ub, -2.6, 0, 0, 0.8, 1.7, 0.6, 0xF2B33D);
            K.sign(ub, 'UBIKE', { sw: 0.75, sh: 0.4, x: -2.6, y: 1.35, z: 0.31, bg: '#FFFFFF', fg: '#E8822E', bw: 0 });
            for (var b = 0; b < 4; b++) {
                var bk = K.bike();
                bk.position.set(-1.3 + b * 1.1, 0, 0);
                bk.rotation.y = Math.PI;
                ub.add(bk);
                K.box(ub, -1.3 + b * 1.1, 0, -0.9, 0.12, 0.9, 0.12, C.dark);
            }
            K.sign(ub, 'UBIKE 租借站', { sw: 3.2, sh: 0.7, x: 0.3, y: 2.6, z: -0.9, bg: '#F2B33D', fg: '#FFFFFF', border: '#FFFFFF', bw: 8, both: true });
            K.cyl(ub, 0.3, 0, -0.9, 0.06, 2.25, C.dark);
            ctx.add(ub);
            ctx.block(9.9, 17, -7.5, -5.6);

            if (p.from === 'shop') ctx.spawn = { x: -2, z: -8.1, yaw: Math.PI };
            else ctx.spawn = { x: -14, z: -7.4, yaw: -Math.PI / 2 };

            ctx.item({
                label: '進店', x: -2, z: -8.6, fx: -2, fz: -9, y: 3.1, r: 3, hit: [north[2].obj],
                use: function () {
                    if (api.has('cake')) { api.toast('蛋糕已經拿好了！'); return; }
                    api.go('cakeshop', {}, { text: '走進蘭陽蛋糕店' });
                }
            });
            ctx.item({ label: '進店', x: -19, z: -8.6, fx: -19, fz: -9, y: 3.1, r: 2.8, hit: [north[1].obj], use: function () { api.toast('阿美麵包坊：今天的麵包賣完囉！'); } });
            ctx.item({ label: '進店', x: 15, z: -8.6, fx: 15, fz: -9, y: 3.1, r: 2.6, use: function () { api.toast('花店：今天的花很新鮮喔！'); } });
            ctx.item({
                label: '租單車', x: 13, z: -5.4, fx: 13.3, fz: -7.3, y: 2.2, r: 3.2, hit: [ub],
                use: async function () {
                    var a = await api.ask({
                        title: 'UBIKE 租借站', text: '要租一台 UBIKE 出發嗎？',
                        choices: [{ label: '租車出發', value: true, kind: 'go', icon: 'bike' }, { label: '先不要', value: false, kind: 'line' }]
                    });
                    if (!a) return;
                    if (!api.has('cake')) { api.fail('蛋糕還沒拿，就先騎車離開了！'); return; }
                    api.go('ubike', {}, { text: '騎上 UBIKE 出發！' });
                }
            });
            ctx.item({
                label: '等公車', x: -18, z: -6.6, fx: -18, fz: -5.9, y: 2.15, r: 3, hit: [stop],
                use: async function () {
                    if (!(await askWait(api))) return;
                    api.fail('這一段不是搭公車，要改騎 UBIKE！');
                }
            });
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       ⑧ 蘭陽蛋糕店：拿巧克力蛋糕
       ═══════════════════════════════════════════════════════════════ */
    SC.cakeshop = {
        build: function (ctx, K, api) {
            var R = ctx.root;
            ctx.place = '蘭陽蛋糕店';
            ctx.bounds = { x0: -6, x1: 6, z0: -5, z1: 5 };
            ctx.cam = { distance: 4.6 };
            ctx.spawn = { x: 0, z: 3.9, yaw: 0 };
            K.ground(R, 0, 0, 80, 80, 0xE9DCC4, -0.03);
            K.floor(ctx, 0, 0, 12, 10, K.tiles(0xFFF4E2, 0xF7E2C6, 5, 4));
            K.room(ctx, -6, 6, -5, 5, 3.4, 0xFFF3E0, { s: [[-1, 1]] });

            /* 櫃台＋蛋糕櫃 */
            K.box(R, 0, 0, -2.9, 8, 1.0, 0.8, C.white);
            K.box(R, 0, 0.25, -2.49, 7.8, 0.5, 0.02, C.orange);
            K.box(R, 0, 1.0, -2.9, 7.4, 0.55, 0.7, K.mat(0xDDF2FB, { transparent: true, opacity: 0.4 }));
            ctx.block(-4, 4, -3.3, -2.5);
            var cakes = [['巧克力', 0x6B4226, 0x4A2C17], ['草莓', 0xF6B8C2, 0xE85D75], ['起司', 0xF6DC8C, 0xF1C75B], ['抹茶', 0x9CC47A, 0x6FA350]];
            cakes.forEach(function (c, i) {
                var x = -2.7 + i * 1.8;
                K.cyl(R, x, 1.02, -2.9, 0.34, 0.26, c[1]);
                K.cyl(R, x, 1.28, -2.9, 0.34, 0.06, c[2]);
                K.ball(R, x, 1.38, -2.9, 0.07, 0xE8454F);
                K.sign(R, c[0], { sw: 0.9, sh: 0.32, x: x, y: 0.72, z: -2.47, bg: '#FFFDF6', fg: '#4A3B1E', border: '#E8822E', bw: 6 });
            });
            /* 後方：正方形蛋糕盒 */
            K.box(R, 0, 0, -4.6, 7, 1.2, 0.6, C.woodDark);
            ctx.block(-3.5, 3.5, -5, -4.3);
            for (var i = 0; i < 4; i++) {
                K.box(R, -2.2 + i * 1.5, 1.2, -4.6, 0.55, 0.55, 0.55, C.white);
                K.box(R, -2.2 + i * 1.5, 1.2, -4.6, 0.08, 0.57, 0.57, C.orange);
            }
            K.picture(R, 3.2, 1.2, 480, 180, function (g, w, h) {
                g.fillStyle = '#FFFDF6'; K.roundRect(g, 4, 4, w - 8, h - 8, 20); g.fill();
                g.lineWidth = 8; g.strokeStyle = '#E8822E'; g.stroke();
                g.fillStyle = '#E8822E'; g.font = '900 56px "Noto Sans TC", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
                g.fillText('蘭陽蛋糕店', w / 2, 62);
                g.fillStyle = '#4C9A5B'; g.font = '700 36px "Noto Sans TC", sans-serif';
                g.fillText('手作蛋糕・當日新鮮', w / 2, 130);
            }, { x: 0, y: 2.55, z: -4.97, fontText: '蘭陽蛋糕店手作蛋糕・當日新鮮' });

            var clerk = K.person({ shirt: C.white, pants: 0x6B4A2E, hair: 0x3A2A20, bun: true, apron: K.mat(C.orange) });
            clerk.position.set(0, 0, -3.75);
            clerk.rotation.y = Math.PI;
            ctx.add(clerk);
            ctx.tick(function (dt, t) { K.animPerson(clerk, 0, 0, 'idle', t); });

            /* 桌椅、吊燈 */
            [[-4, 2.2], [4, 2.2]].forEach(function (q) {
                K.cyl(R, q[0], 0, q[1], 0.6, 0.75, C.white);
                K.cyl(R, q[0] - 0.9, 0, q[1], 0.25, 0.45, C.yellow);
                K.cyl(R, q[0] + 0.9, 0, q[1], 0.25, 0.45, C.green);
                ctx.blockRect(q[0], q[1], 2.4, 1.2);
            });
            for (i = -1; i <= 1; i++) {
                K.cyl(R, i * 2.6, 2.4, -1, 0.02, 1.0, C.dark);
                K.ball(R, i * 2.6, 2.35, -1, 0.22, K.basic(0xFFE7A8));
            }

            ctx.item({
                label: '取蛋糕', x: 0, z: -2.1, fx: 0, fz: -3.75, y: 2.75, r: 2.6, hit: [clerk],
                use: async function () {
                    if (api.has('cake')) { api.toast('蛋糕已經拿好了！'); return; }
                    var v = await api.ask({
                        title: '蘭陽蛋糕店', text: '店員：您好！來拿預訂的蛋糕嗎？是哪一種？', cols: 2,
                        choices: shuffle(['巧克力蛋糕', '草莓蛋糕', '起司蛋糕', '抹茶蛋糕']).map(function (x) { return { label: x, value: x, kind: 'sky' }; })
                    });
                    if (v !== '巧克力蛋糕') { api.fail('拿錯蛋糕了！拿成了「' + v + '」。'); return; }
                    api.give('cake');
                    api.sfx('good');
                    await api.say({ title: '拿到了！', text: '店員：這是您的巧克力蛋糕，用正方形盒子裝好了，路上小心！', ok: '謝謝', kind: 'go' });
                }
            });
            ctx.item({ label: '出去', x: 0, z: 4.6, fx: 0, fz: 5, y: 2.4, r: 2.2, use: function () { api.go('street_cake', { from: 'shop' }, { text: '走出蛋糕店' }); } });
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       ⑨ 騎 UBIKE：開封街右轉、漢口街左轉 → 博愛路公車站（52）
       ═══════════════════════════════════════════════════════════════ */
    var GRID = [
        { x0: -5, x1: 5, z0: -132, z1: 14, name: '中華路' },
        { x0: -62, x1: 62, z0: -35, z1: -25, name: '武昌街' },
        { x0: -62, x1: 132, z0: -75, z1: -65, name: '開封街' },
        { x0: 35, x1: 45, z0: -112, z1: -28, name: '重慶南路' },
        { x0: 75, x1: 85, z0: -132, z1: -40, name: '漢口街' },
        { x0: 40, x1: 132, z0: -127, z1: -113, name: '博愛路' }
    ];

    SC.ubike = {
        build: function (ctx, K, api) {
            var R = ctx.root;
            ctx.mode = 'bike';
            ctx.place = '中華路';
            ctx.spawn = { x: 0, z: 8, yaw: 0 };
            ctx.cam = { distance: 7.0, ahead: 3.0 };
            K.ground(R, 30, -60, 700, 700, C.grass, -0.05);
            GRID.forEach(function (s) { ctx.walkable(s.x0, s.x1, s.z0, s.z1, s.name); });
            var cross = [
                [0, -30, '中華路', '武昌街'], [0, -70, '中華路', '開封街'],
                [40, -30, '重慶南路', '武昌街'], [40, -70, '重慶南路', '開封街'],
                [80, -70, '漢口街', '開封街'], [80, -120, '漢口街', '博愛路']
            ];
            var zebra = [];
            cross.forEach(function (c) {
                K.crosswalkStripes(zebra, c[1] + 6.6, c[0] - 4.8, c[0] + 4.8, true);
                K.crosswalkStripes(zebra, c[1] - 6.6, c[0] - 4.8, c[0] + 4.8, true);
            });
            drawRoads(ctx, GRID, { sidewalk: 3, extraStripes: zebra });

            /* 起點旁：蘭陽蛋糕店（接續上一個場景） */
            var start = K.building(ctx, { x: 14, z: 6, w: 12, d: 10, h: 10, color: C.cream, face: 'w', sign: '蘭陽蛋糕店', signBg: '#E8822E', awning: C.orange });
            /* 起點的蛋糕店、終點公車站前的小廣場，不蓋房子 */
            var occupied = [{ x0: 8, x1: 20, z0: 1, z1: 11 }, { x0: 84, x1: 102, z0: -111, z1: -98 }];
            fillBuildings(ctx, GRID, {
                occupied: occupied, sidewalk: 3, minW: 9, maxW: 15, depth: 11, minH: 8, maxH: 22, rooftop: false, collide: false,
                signs: [{ t: '便當店', bg: '#E8822E' }, { t: '文具行', bg: '#3E86C4' }, { t: '水果行', bg: '#4C9A5B' }, { t: '眼鏡行', bg: '#E0AA25' }, { t: '豆花', bg: '#E8822E' }, { t: '藥局', bg: '#4C9A5B' }]
            });
            void start;

            /* 行道樹 */
            var trees = [];
            GRID.forEach(function (s, si) {
                var alongX = (s.x1 - s.x0) >= (s.z1 - s.z0);
                var a0 = alongX ? s.x0 : s.z0;
                var a1 = alongX ? s.x1 : s.z1;
                for (var a = a0 + 6; a < a1 - 4; a += 16) {
                    [-1, 1].forEach(function (side) {
                        var tx = alongX ? a + (side > 0 ? 8 : 0) : (side < 0 ? s.x0 - 1.6 : s.x1 + 1.6);
                        var tz = alongX ? (side < 0 ? s.z0 - 1.6 : s.z1 + 1.6) : a + (side > 0 ? 8 : 0);
                        var inRoad = GRID.some(function (o) { return tx > o.x0 - 2 && tx < o.x1 + 2 && tz > o.z0 - 2 && tz < o.z1 + 2; });
                        if (!inRoad) trees.push({ x: tx, z: tz, s: 0.9 + ((si + a) % 3) * 0.1 });
                    });
                }
            });
            K.forest(ctx, trees);
            K.clouds(ctx, 30, -60, 12, 150);

            /* 路口路名牌（每個路口兩個角） */
            cross.forEach(function (c) {
                cornerSign(ctx, c[0] + 6.6, c[1] + 6.6, c[2], c[3]);
                cornerSign(ctx, c[0] - 6.6, c[1] - 6.6, c[2], c[3]);
            });
            /* 中華路起點的路名牌 */
            cornerSign(ctx, 6.6, 12, '中華路', null);
            /* 路口前的懸臂路名牌（朝向騎過來的方向） */
            gantry(ctx, 6.2, -19, 0, -19, '武昌街', 0);
            gantry(ctx, 6.2, -59, 0, -59, '開封街', 0);
            gantry(ctx, 29, -63.8, 29, -70, '重慶南路', -Math.PI / 2);
            gantry(ctx, 69, -63.8, 69, -70, '漢口街', -Math.PI / 2);
            gantry(ctx, 86.2, -102, 80, -102, '博愛路', 0);

            /* 博愛路公車站（終點） */
            var stop = K.busStop(ctx, { x: 92, z: -111.3, name: '博愛路站', routes: '52・25・502', ry: Math.PI, shelterX: 3 });
            void stop;

            /* HUD 顯示目前所在的路 */
            ctx.tick(function () {
                var P = FM.core.player;
                var names = GRID.filter(function (s) { return P.pos.x >= s.x0 && P.pos.x <= s.x1 && P.pos.z >= s.z0 && P.pos.z <= s.z1; }).map(function (s) { return s.name; });
                if (!names.length) return;
                var label = names.join('・');
                if (label !== ctx.data.lastPlace) { ctx.data.lastPlace = label; api.place(label); }
            });

            /* 走錯路就失敗（騎進錯的街超過一段距離） */
            function wrong(x0, x1, z0, z1, msg) {
                ctx.zone(x0, x1, z0, z1, function () { api.fail(msg); }, { once: true });
            }
            wrong(14, 62, -35, -25, '騎錯路了！這是武昌街。');
            wrong(-62, -14, -35, -25, '騎錯路了！這是武昌街。');
            wrong(-5, 5, -132, -88, '騎過頭了！錯過了開封街。');
            wrong(-62, -14, -75, -65, '轉錯方向了！開封街要右轉。');
            wrong(35, 45, -112, -88, '騎錯路了！這是重慶南路。');
            wrong(35, 45, -52, -36, '騎錯路了！這是重慶南路。');
            wrong(98, 132, -75, -65, '騎過頭了！錯過了漢口街。');
            wrong(75, 85, -54, -40, '轉錯方向了！漢口街要左轉。');

            /* 到了博愛路 → 還車、等 52 號公車 */
            ctx.zone(75, 100, -127, -109, async function () {
                api.freeze(true);
                api.sfx('good');
                await api.say({ title: '到博愛路了！', text: '把 UBIKE 還車，到公車站等車。', ok: '好', kind: 'go' });
                FM.core.setMode('walk');
                FM.core.teleport(90, -111.6, Math.PI);
                var pick = await busSequence(ctx, api, {
                    stopX: 92, laneZ: -115.4, dir: 1, routes: ['25', '52', '502'], far: 60,
                    cam: { pos: [102, 6.5, -106.5], look: [75, 1.2, -115.4] }
                });
                if (pick === '52') api.go('bus', ROUTES.r52, { text: '搭上 52 號公車' });
                else api.fail('搭錯車了！這是 ' + pick + ' 號公車。');
            }, { once: true });
        }
    };

    /* ═══════════════════════════════════════════════════════════════
       ⑩ 西藏路：第三個巷子右轉，過兩個巷子左轉，右手第三間 12 號
       ═══════════════════════════════════════════════════════════════ */
    /* 巷子的可走區要和西藏路重疊一段，才走得進去 */
    var ALLEYS = [
        { x0: -6, x1: 8, z0: -80, z1: 14, name: '西藏路' },
        { x0: 4, x1: 40, z0: -14, z1: -10, name: '巷子' },
        { x0: 4, x1: 40, z0: -30, z1: -26, name: '巷子' },
        { x0: 4, x1: 54, z0: -46, z1: -42, name: '巷子' },
        { x0: 20, x1: 24, z0: -58, z1: -31, name: '巷子' },
        { x0: 34, x1: 38, z0: -58, z1: -31, name: '巷子' },
        { x0: 50, x1: 54, z0: -82, z1: -31, name: '巷子' }
    ];

    function house(ctx, R, o) {
        /* o: {x, z, w, d, h, face, color, num, door:true} */
        var g = K.building(ctx, { x: o.x, z: o.z, w: o.w, d: o.d, h: o.h, color: o.color, face: o.face, shop: false, rooftop: true, collide: false });
        var f = g.userData.front;
        /* 門後面的暖色室內（門滑開時看得到） */
        K.box(f, 0, 0, 0.02, 1.3, 2.3, 0.02, K.basic(0xF3C98B));
        var door = K.box(f, 0, 0, 0.06, 1.3, 2.3, 0.1, o.doorColor || [C.green, C.blue, C.orange, C.woodDark][o.num % 4]);
        /* 門把掛在門上一起滑動；門被縮放過，所以門把要反向補償縮放 */
        var knob = K.ball(door, 0.35, 0.5, 0.7, 0.05, C.champagne);
        knob.scale.set(0.1 / 1.3, 0.1 / 2.3, 0.1 / 0.1);
        K.box(f, 0, 2.3, 0.25, 1.8, 0.1, 0.5, C.white);
        if (o.num) {
            K.sign(f, o.num + '號', { sw: 1.4, sh: 0.7, x: -1.55, y: 1.7, z: 0.12, bg: '#2F6FB0', fg: '#FFFFFF', border: '#FFFFFF', bw: 10 });
            /* 凸出牆面的門牌（沿著巷子走的時候也看得到） */
            K.box(f, 1.1, 3.2, 0.3, 0.06, 0.06, 0.6, C.dark);
            K.sign(f, o.num + '號', { sw: 1.0, sh: 0.55, x: 1.1, y: 2.85, z: 0.62, ry: Math.PI / 2, bg: '#2F6FB0', fg: '#FFFFFF', border: '#FFFFFF', bw: 10, both: true });
        }
        K.plant(f, 1.6, 0.45, 0.7);
        g.userData.door = door;
        return g;
    }

    SC.xizang = {
        build: function (ctx, K, api) {
            var R = ctx.root;
            ctx.place = '西藏路';
            ctx.spawn = { x: 6, z: 8, yaw: 0 };
            ctx.cam = { distance: 5.6 };
            K.ground(R, 25, -35, 500, 500, C.grass, -0.05);
            ALLEYS.forEach(function (s) { ctx.walkable(s.x0, s.x1, s.z0, s.z1, s.name); });
            drawRoads(ctx, [ALLEYS[0]], { sidewalk: 2, y: 0.006 });
            drawRoads(ctx, ALLEYS.slice(1), { sidewalk: 0.6, road: 0xDDD2BC, side: 0xCFC2A6, lines: false, y: 0.0 });
            K.busStop(ctx, { x: 7.6, z: 11, name: '西藏路站', routes: '52', ry: -Math.PI / 2, shelterX: 0 });

            /* 最後一條巷子：右手邊 8、10、12、14 號，左手邊 7、9、11、13 號 */
            var occupied = [];
            var doors = [];
            [8, 10, 12, 14].forEach(function (num, i) {
                var zc = -51 - i * 8;
                var hh = house(ctx, R, { x: 54 + 4.2, z: zc, w: 8, d: 7.6, h: 7 + (i % 2) * 2, face: 'w', color: K.FACADES[i + 2], num: num });
                occupied.push({ x0: 54, x1: 62.4, z0: zc - 4, z1: zc + 4 });
                doors.push({ num: num, obj: hh, x: 53.2, z: zc, fx: 54.2 });
            });
            [7, 9, 11, 13].forEach(function (num, i) {
                var zc = -51 - i * 8;
                var hh = house(ctx, R, { x: 50 - 4.2, z: zc, w: 8, d: 7.6, h: 7 + ((i + 1) % 2) * 2, face: 'e', color: K.FACADES[i + 5], num: num });
                occupied.push({ x0: 41.6, x1: 50, z0: zc - 4, z1: zc + 4 });
                doors.push({ num: num, obj: hh, x: 50.8, z: zc, fx: 49.8 });
            });
            var occ = fillBuildings(ctx, ALLEYS, {
                only: [1, 2, 3, 4, 5, 6], occupied: occupied, sidewalk: 0.6, minW: 6, maxW: 9, depth: 8, minH: 6, maxH: 11, rooftop: true, collide: false,
                signs: [{ t: '雜貨店', bg: '#E8822E' }, { t: '洗衣店', bg: '#3E86C4' }, { t: '豆漿店', bg: '#4C9A5B' }], signRate: 0.12
            });
            /* 西藏路兩側：較高的樓（騎樓店面） */
            fillBuildings(ctx, ALLEYS, {
                only: [0], occupied: occ, sidewalk: 2, minW: 8, maxW: 12, depth: 11, minH: 10, maxH: 20, rooftop: false, collide: false,
                signs: [{ t: '銀行', bg: '#2F6FB0' }, { t: '超市', bg: '#4C9A5B' }, { t: '早餐店', bg: '#E8822E' }], signRate: 0.4
            });

            /* 巷口牌子（只寫「巷」，不寫第幾條） */
            [[-12, '125巷'], [-28, '131巷'], [-44, '137巷']].forEach(function (a) {
                K.sign(R, a[1], { sw: 1.8, sh: 0.55, x: 8.6, y: 3.0, z: a[0] + 2.6, ry: -Math.PI / 2, bg: '#2F6FB0', fg: '#FFFFFF', border: '#FFFFFF', bw: 8, both: true });
                K.cyl(R, 8.6, 0, a[0] + 2.6, 0.06, 2.7, C.dark);
            });
            /* 小花盆、機車（巷弄的生活感） */
            var trees = [];
            for (var z = 6; z > -76; z -= 14) trees.push({ x: -7.2, z: z, s: 0.9 });
            K.forest(ctx, trees);
            [[15, -15.4], [30, -24.6], [46, -40.6], [26, -47.4], [52, -44.6]].forEach(function (q, i) {
                var s = new T.Group();
                s.position.set(q[0], 0, q[1]);
                s.rotation.y = i % 2 ? 0 : Math.PI / 2;
                K.box(s, 0, 0.3, 0, 0.45, 0.5, 1.5, [C.blue, C.orange, C.green, C.yellow, 0xF6A6B2][i]);
                K.cyl(s, 0, 0, 0.6, 0.28, 0.1, 0x3A3A40);
                K.cyl(s, 0, 0, -0.6, 0.28, 0.1, 0x3A3A40);
                ctx.add(s);
            });
            K.clouds(ctx, 25, -35, 10, 120);

            /* 老婆（勝利時才出現） */
            var wife = K.person({ shirt: C.peach, pants: 0x5B6470, hair: 0x3A2A20, longHair: true, dress: C.yellow });
            wife.position.set(53.75, 0, -66.3);
            wife.rotation.y = Math.PI / 2;
            wife.visible = false;
            ctx.add(wife);
            ctx.data.wife = wife;

            /* 走錯就失敗 */
            function wrong(x0, x1, z0, z1, msg) {
                ctx.zone(x0, x1, z0, z1, function () { api.fail(msg); }, { once: true });
            }
            wrong(18, 40, -14, -10, '走錯巷子了！');
            wrong(18, 40, -30, -26, '走錯巷子了！');
            wrong(-6, 8, -80, -58, '走過頭了！');
            wrong(20, 24, -58, -53, '轉錯巷子了！');
            wrong(20, 24, -36, -31, '轉錯巷子了！');
            wrong(34, 38, -58, -53, '轉錯巷子了！');
            wrong(34, 38, -36, -31, '轉錯巷子了！');
            wrong(50, 54, -36, -31, '轉錯方向了！');

            /* 門 */
            doors.forEach(function (d) {
                if (d.num === 12) ctx.data.homeDoor = d.obj.userData.door;
                ctx.item({
                    label: '按門鈴', x: d.x, z: d.z, fx: d.fx, fz: d.z, y: 2.2, r: 2.2, hit: [d.obj.userData.door],
                    use: function () {
                        if (d.num === 12) api.win();
                        else api.fail('這是 ' + d.num + ' 號，不是我家！');
                    }
                });
            });
        }
    };
})(window);
