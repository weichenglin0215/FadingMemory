/* ═══════════════════════════════════════════════════════════════════
   core.js — 3D 引擎核心
   · 畫布解析度＝Stage.rect 的寬高 × dpr（上限 2），相機長寬比固定 500/850
     → 手機與電腦的 3D 構圖一致，而且不會因 CSS 縮放變糊。
   · 玩家：搖桿往上＝前進、往下＝後退、往左右＝轉彎；相機跟在背後。
   · 場景：碰撞方塊、可走區域、觸發區、可互動物件（點它或按互動鍵）。
   · 相機被建築擋住時，擋住的建築會自動變半透明。
   · 效能：畫面太慢時自動降低解析度。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var T = global.THREE;
    var FM = global.FM = global.FM || {};
    if (!T) return;
    var K = FM.kit;

    var Core = FM.core = {};

    var renderer, scene, camera, sky, hemi, sun;
    var ctx = null;
    var last = 0;
    var hooks = [];
    var raycaster = new T.Raycaster();
    var ndc = new T.Vector2();
    var camLook = new T.Vector3();
    var tmpV = new T.Vector3();
    var tmpV2 = new T.Vector3();
    var quality = 1;
    var perf = { acc: 0, n: 0, fps: 60 };

    Core.frozen = false;   /* 劇情演出中：玩家不能動 */
    Core.busy = false;     /* 換場景中 */
    Core.near = null;
    Core.elapsed = 0;

    /* ─── 玩家 ─── */
    var P = Core.player = {
        group: null, person: null, bike: null,
        pos: new T.Vector3(), yaw: 0, speed: 0, phase: 0, mode: 'walk'
    };

    /* ─── 場景內容器 ─── */
    function Ctx(id, params) {
        this.id = id;
        this.params = params || {};
        this.root = new T.Group();
        this.colliders = [];
        this.walk = null;
        this.bounds = null;
        this.zones = [];
        this.items = [];
        this.updaters = [];
        this.occluders = [];
        this.spawn = { x: 0, z: 0, yaw: 0 };
        this.cam = { dist: 6.5, height: 4.6, look: 1.3, ahead: 2.2 };
        this.mode = 'walk';
        this.camScript = null;
        this.place = '';
        this.data = {};
    }
    Ctx.prototype.add = function (o) { this.root.add(o); return o; };
    Ctx.prototype.block = function (x0, x1, z0, z1) {
        this.colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
    };
    Ctx.prototype.blockRect = function (cx, cz, w, d) { this.block(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2); };
    Ctx.prototype.unblock = function (c) {
        var i = this.colliders.indexOf(c);
        if (i >= 0) this.colliders.splice(i, 1);
    };
    Ctx.prototype.lastCollider = function () { return this.colliders[this.colliders.length - 1]; };
    Ctx.prototype.walkable = function (x0, x1, z0, z1, name) {
        (this.walk = this.walk || []).push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), name: name });
    };
    /* 觸發區：走進去時呼叫 enter */
    Ctx.prototype.zone = function (x0, x1, z0, z1, enter, opt) {
        var z = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), enter: enter, inside: false, once: opt && opt.once, done: false, leave: opt && opt.leave };
        this.zones.push(z);
        return z;
    };
    /* 可互動物件：{ label, x, z, y, r, hit:[Object3D], enabled(), use() } */
    Ctx.prototype.item = function (def) {
        def.r = def.r || 2.8;
        def.y = def.y == null ? 2.6 : def.y;
        if (def.marker !== false) {
            def.markerObj = K.marker();
            def.markerObj.position.set(def.x, def.y, def.z);
            def.markerObj.userData.fmItem = def;
            this.root.add(def.markerObj);
        }
        (def.hit || []).forEach(function (o) { o.userData.fmItem = def; });
        this.items.push(def);
        return def;
    };
    Ctx.prototype.tick = function (fn) { this.updaters.push(fn); };
    /* 擋視線時會變半透明的物件；group 是它的附屬裝飾（招牌、店面），擋住時一起隱藏 */
    Ctx.prototype.occluder = function (mesh, group) {
        mesh.userData.fade = 1;
        mesh.userData.group = group || null;
        this.occluders.push(mesh);
    };

    /* ─── 初始化 ─── */
    Core.init = function (worldEl) {
        renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        renderer.setClearColor(0xFFF1D2);
        worldEl.appendChild(renderer.domElement);

        scene = new T.Scene();
        scene.fog = new T.Fog(0xFFF1D2, 70, 210);
        camera = new T.PerspectiveCamera(52, Stage.W / Stage.H, 0.1, 230);

        hemi = new T.HemisphereLight(0xFFF6E3, 0xC9DDB0, 1.85);
        scene.add(hemi);
        sun = new T.DirectionalLight(0xFFF0D6, 1.9);
        sun.position.set(-40, 70, 30);
        scene.add(sun);

        sky = K.skyDome();
        scene.add(sky);

        /* 玩家：上班族＋（騎車時才出現的）UBIKE */
        P.group = new T.Group();
        P.person = K.person({ shirt: 0x7DB3E0, pants: 0x5B6470, tie: K.mat(0xEE8E3A), hair: 0x3E2F24 });
        P.bike = K.bike();
        P.bike.visible = false;
        P.group.add(P.person);
        P.group.add(P.bike);
        scene.add(P.group);

        Stage.onResize(resize);
        bindTap(renderer.domElement);
        HUD.onAction(function () { if (Core.near) Core.use(Core.near); });

        document.addEventListener('visibilitychange', function () { last = performance.now(); });
        requestAnimationFrame(frame);
    };

    function resize(r) {
        if (!renderer) return;
        renderer.setPixelRatio(r.dpr * quality);
        renderer.setSize(r.width, r.height, true);
        camera.aspect = Stage.W / Stage.H;
        camera.updateProjectionMatrix();
    }

    /* ─── 每幀 ─── */
    function update(dt) {
        Core.elapsed += dt;
        if (ctx) {
            updatePlayer(dt);
            if (!Core.busy) updateZones();
            updateItems(dt);
            for (var i = 0; i < ctx.updaters.length; i++) ctx.updaters[i](dt, Core.elapsed);
            updateCamera(dt);
            updateOccluders(dt);
        }
        var hs = hooks.slice();
        for (var j = 0; j < hs.length; j++) hs[j](dt);
        sky.position.copy(camera.position);
    }

    function frame(now) {
        requestAnimationFrame(frame);
        var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
        last = now;
        if (document.hidden) return;
        update(dt);
        renderer.render(scene, camera);
        watchPerf(dt);
    }

    /* 驗證用：用固定時間步長推進遊戲 seconds 秒（不依賴螢幕更新頻率） */
    Core.step = function (seconds, fps) {
        var dt = 1 / (fps || 30);
        var n = Math.max(1, Math.round(seconds / dt));
        for (var i = 0; i < n; i++) update(dt);
        renderer.render(scene, camera);
    };

    function watchPerf(dt) {
        perf.acc += dt;
        perf.n++;
        if (perf.acc >= 2) {
            perf.fps = perf.n / perf.acc;
            /* 門檻 24fps：iPhone 省電模式會把畫面鎖在 30fps，那不算慢，不要降畫質 */
            if (perf.fps < 24 && quality > 0.7) {
                quality = Math.max(0.7, quality - 0.15);
                resize(Stage.rect());
            }
            perf.acc = 0;
            perf.n = 0;
        }
    }

    Core.onFrame = function (fn) { hooks.push(fn); };

    /* 補間：duration 秒內每幀呼叫 fn(t: 0→1) */
    Core.tween = function (duration, fn) {
        return new Promise(function (resolve) {
            var t = 0;
            function step(dt) {
                t = Math.min(1, t + dt / duration);
                fn(t);
                if (t >= 1) {
                    hooks.splice(hooks.indexOf(step), 1);
                    resolve();
                }
            }
            hooks.push(step);
        });
    };
    Core.ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

    /* ─── 玩家移動 ─── */
    var CFG = {
        walk: { speed: 3.4, back: 0.5, turn: 2.3, accel: 9 },
        bike: { speed: 8.0, back: 0.3, turn: 1.7, accel: 3.2 }
    };

    function blocked(x, z) {
        var r = P.mode === 'bike' ? 0.55 : 0.34;
        var b = ctx.bounds;
        if (b && (x < b.x0 + r || x > b.x1 - r || z < b.z0 + r || z > b.z1 - r)) return true;
        if (ctx.walk) {
            var ok = false;
            for (var i = 0; i < ctx.walk.length; i++) {
                var w = ctx.walk[i];
                if (x >= w.x0 + r && x <= w.x1 - r && z >= w.z0 + r && z <= w.z1 - r) { ok = true; break; }
            }
            if (!ok) return true;
        }
        var cs = ctx.colliders;
        for (var j = 0; j < cs.length; j++) {
            var c = cs[j];
            if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
        }
        return false;
    }

    function tryMove(dx, dz) {
        var nx = P.pos.x + dx;
        var nz = P.pos.z + dz;
        if (!blocked(nx, nz)) { P.pos.x = nx; P.pos.z = nz; return; }
        if (!blocked(nx, P.pos.z)) { P.pos.x = nx; return; }
        if (!blocked(P.pos.x, nz)) { P.pos.z = nz; return; }
        P.speed *= 0.4;
    }

    function updatePlayer(dt) {
        var active = ctx.mode !== 'none' && !Core.frozen && !Core.busy;
        var inp = active ? HUD.input() : { x: 0, y: 0 };
        var ix = Math.abs(inp.x) < 0.14 ? 0 : inp.x;
        var iy = Math.abs(inp.y) < 0.14 ? 0 : inp.y;
        var cfg = CFG[P.mode] || CFG.walk;

        var turnScale = P.mode === 'bike' ? 0.45 + 0.55 * Math.min(1, Math.abs(P.speed) / 3) : 1;
        P.yaw -= ix * cfg.turn * turnScale * dt;

        var target = -iy * cfg.speed;
        if (target < 0) target *= cfg.back;
        P.speed += (target - P.speed) * Math.min(1, cfg.accel * dt);
        if (!target && Math.abs(P.speed) < 0.05) P.speed = 0;

        if (P.speed) {
            var fx = -Math.sin(P.yaw);
            var fz = -Math.cos(P.yaw);
            tryMove(fx * P.speed * dt, fz * P.speed * dt);
        }
        P.group.position.set(P.pos.x, 0, P.pos.z);
        P.group.rotation.y = P.yaw;

        var moving = Math.abs(P.speed) > 0.05;
        P.phase += (P.mode === 'bike' ? 1.6 : 3.3) * Math.abs(P.speed) * dt;
        K.animPerson(P.person, P.phase, moving ? Math.min(1, Math.abs(P.speed) / 2.5) : 0, P.mode === 'bike' ? 'bike' : (moving ? 'walk' : 'idle'), Core.elapsed);
    }

    Core.setMode = function (mode) {
        P.mode = mode === 'bike' ? 'bike' : 'walk';
        P.bike.visible = mode === 'bike';
        P.group.visible = mode !== 'none';
        P.speed = 0;
    };

    function updateZones() {
        var x = P.pos.x;
        var z = P.pos.z;
        for (var i = 0; i < ctx.zones.length; i++) {
            var zn = ctx.zones[i];
            var inside = x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1;
            if (inside && !zn.inside) {
                zn.inside = true;
                if (!zn.done) {
                    if (zn.once) zn.done = true;
                    zn.enter();
                    if (ctx === null || Core.busy) return;
                }
            } else if (!inside && zn.inside) {
                zn.inside = false;
                if (zn.leave) zn.leave();
            }
        }
    }

    /* ─── 可互動物件：找最近的、顯示互動鍵、標記浮動 ─── */
    function updateItems(dt) {
        var best = null;
        var bestD = Infinity;
        var t = Core.elapsed;
        var can = ctx.mode !== 'none' && !Core.frozen && !Core.busy && !HUD.isModal();
        var cp = camera.position;
        var camToPlayer = Math.hypot(cp.x - P.pos.x, cp.z - P.pos.z);
        for (var i = 0; i < ctx.items.length; i++) {
            var it = ctx.items[i];
            var en = it.enabled ? it.enabled() : true;
            var d = Math.sqrt((it.x - P.pos.x) * (it.x - P.pos.x) + (it.z - P.pos.z) * (it.z - P.pos.z));
            it.dist = d;
            if (it.markerObj) {
                /* 標記如果比玩家更靠近鏡頭（在玩家背後），就先不顯示，免得擋住畫面 */
                var behind = Math.hypot(cp.x - it.x, cp.z - it.z) < camToPlayer - 0.5;
                /* 已經站在旁邊（互動鍵已出現）就不必再顯示頭上的標記 */
                it.markerObj.visible = en && can && !behind && d > 1.8 && d < (it.markerRange || 16);
                it.markerObj.position.y = it.y + Math.sin(t * 3 + i) * 0.15;
                it.markerObj.rotation.y += dt * 1.6;
                var s = (it === Core.near) ? 1.35 : 1;
                it.markerObj.scale.setScalar(s);
            }
            if (can && en && d <= it.r && d < bestD) { best = it; bestD = d; }
        }
        if (best !== Core.near) {
            Core.near = best;
            HUD.action(best ? best.label : null);
        }
    }

    Core.use = function (it) {
        if (!it || Core.frozen || Core.busy || HUD.isModal()) return;
        if (it.enabled && !it.enabled()) return;
        Core.near = null;
        HUD.action(null);
        it.use();
    };

    /* ─── 點擊 3D 物件 ─── */
    function bindTap(canvas) {
        var start = null;
        canvas.addEventListener('pointerdown', function (e) {
            start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
        });
        canvas.addEventListener('pointerup', function (e) {
            if (!start || e.pointerId !== start.id) return;
            var moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
            var quick = performance.now() - start.t < 700;
            start = null;
            if (moved < 16 && quick) tap(e.clientX, e.clientY);
        });
    }

    function findItem(o) {
        while (o) {
            if (o.userData && o.userData.fmItem) return o.userData.fmItem;
            o = o.parent;
        }
        return null;
    }

    function tap(cx, cy) {
        if (!ctx || Core.frozen || Core.busy || HUD.isModal() || ctx.mode === 'none') return;
        var r = renderer.domElement.getBoundingClientRect();
        ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        var targets = [];
        ctx.items.forEach(function (it) {
            if (it.enabled && !it.enabled()) return;
            (it.hit || []).forEach(function (o) { targets.push(o); });
            if (it.markerObj && it.markerObj.visible) targets.push(it.markerObj);
        });
        var hits = raycaster.intersectObjects(targets, true);
        if (!hits.length) return;
        var it = findItem(hits[0].object);
        if (!it) return;
        if (it.dist > it.r + 0.6) {
            HUD.toast('再走近一點，才能使用「' + it.label + '」');
            return;
        }
        Core.use(it);
    }

    /* ─── 相機 ─── */
    function desiredCam(out, look) {
        var c = ctx.cam;
        var fx = -Math.sin(P.yaw);
        var fz = -Math.cos(P.yaw);
        out.set(P.pos.x - fx * c.dist, c.height, P.pos.z - fz * c.dist);
        look.set(P.pos.x + fx * c.ahead, c.look, P.pos.z + fz * c.ahead);
    }

    Core.snapCamera = function () {
        if (ctx.camScript) return;
        desiredCam(camera.position, camLook);
        camera.lookAt(camLook);
    };

    function updateCamera(dt) {
        if (ctx.camScript) {
            ctx.camScript(dt, camera, camLook);
            return;
        }
        desiredCam(tmpV, tmpV2);
        var k = 1 - Math.exp(-dt * 4.5);
        camera.position.lerp(tmpV, k);
        camLook.lerp(tmpV2, 1 - Math.exp(-dt * 7));
        camera.lookAt(camLook);
    }

    /* 劇情用：把相機平滑移到 pos、看向 look */
    Core.camTo = function (pos, look, speed) {
        var p = pos.clone();
        var l = look.clone();
        ctx.camScript = function (dt, cam, cl) {
            var k = 1 - Math.exp(-dt * (speed || 2.5));
            cam.position.lerp(p, k);
            cl.lerp(l, k);
            cam.lookAt(cl);
        };
    };
    Core.camFollow = function () { if (ctx) ctx.camScript = null; };
    Core.camera = function () { return camera; };

    /* ─── 擋住視線的建築變半透明 ─── */
    function setFade(mesh, v) {
        var mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (var i = 0; i < mats.length; i++) {
            var m = mats[i];
            m.opacity = v;
            var tr = v < 0.99;
            if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
            m.depthWrite = !tr;
        }
    }

    function updateOccluders(dt) {
        if (!ctx.occluders.length) return;
        var from = tmpV.set(P.pos.x, 1.3, P.pos.z);
        if (ctx.camScript) from.copy(camLook);
        var dir = tmpV2.subVectors(camera.position, from);
        var dist = dir.length();
        dir.normalize();
        raycaster.set(from, dir);
        raycaster.far = dist;
        var hits = raycaster.intersectObjects(ctx.occluders, false);
        raycaster.far = Infinity;
        var hitSet = {};
        for (var i = 0; i < hits.length; i++) hitSet[hits[i].object.id] = true;
        for (var j = 0; j < ctx.occluders.length; j++) {
            var m = ctx.occluders[j];
            var target = hitSet[m.id] ? 0.22 : 1;
            var cur = m.userData.fade;
            if (Math.abs(cur - target) > 0.005) {
                cur += (target - cur) * Math.min(1, dt * 8);
                if (Math.abs(cur - target) < 0.01) cur = target;
                m.userData.fade = cur;
                setFade(m, cur);
                var g = m.userData.group;
                if (g) {
                    var show = cur > 0.6;
                    for (var c = 0; c < g.children.length; c++) {
                        if (g.children[c] !== m) g.children[c].visible = show;
                    }
                }
            }
        }
    }

    /* ─── 載入場景 ─── */
    Core.load = function (id, params, api) {
        var def = FM.scenes[id];
        if (!def) throw new Error('沒有這個場景：' + id);
        if (ctx) scene.remove(ctx.root);
        K.disposeOwned();
        ctx = new Ctx(id, params);
        Core.ctx = ctx;
        Core.near = null;
        HUD.action(null);
        def.build(ctx, K, api, params || {});
        scene.add(ctx.root);

        Core.setMode(ctx.mode);
        P.pos.set(ctx.spawn.x, 0, ctx.spawn.z);
        P.yaw = ctx.spawn.yaw;
        P.speed = 0;
        P.group.position.set(P.pos.x, 0, P.pos.z);
        P.group.rotation.y = P.yaw;
        ctx.zones.forEach(function (z) {
            z.inside = P.pos.x >= z.x0 && P.pos.x <= z.x1 && P.pos.z >= z.z0 && P.pos.z <= z.z1;
        });
        Core.snapCamera();
        return ctx;
    };

    Core.teleport = function (x, z, yaw) {
        P.pos.set(x, 0, z);
        if (yaw != null) P.yaw = yaw;
        P.speed = 0;
        Core.snapCamera();
    };

    Core.info = function () {
        return {
            scene: ctx && ctx.id,
            x: +P.pos.x.toFixed(2), z: +P.pos.z.toFixed(2), yaw: +P.yaw.toFixed(2),
            mode: P.mode, near: Core.near && Core.near.label,
            frozen: Core.frozen, busy: Core.busy, modal: HUD.isModal(),
            fps: Math.round(perf.fps), quality: quality,
            calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
            geos: renderer.info.memory.geometries, texs: renderer.info.memory.textures
        };
    };
})(window);
