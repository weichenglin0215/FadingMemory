/* ═══════════════════════════════════════════════════════════════════
   core.js — 3D 引擎核心
   · 畫布解析度＝Stage.rect 的寬高 × dpr（上限 2），相機長寬比固定 500/850
     → 手機與電腦的 3D 構圖一致，而且不會因 CSS 縮放變糊。
   · 玩家：搖桿往上＝前進、往下＝後退、往左右＝轉彎；相機跟在背後。
   · 場景：碰撞方塊、可走區域、觸發區、可互動物件（點它或按互動鍵）。
   · 相機被建築擋住時，擋住的建築會自動變半透明。
   · 效能：畫面太慢時自動降低解析度。
   ───────────────────────────────────────────────────────────────────
   js/world/ 這六個檔案是「出去走走」3D 模式的全部程式碼，world.html 透過
   js/boot.js 依序載入（見 js/boot.js 的 PAGES.world），彼此的分工：
   · config.js：所有「手感」數字（鏡頭角度、速度、轉彎快慢）集中在這裡，
     要調整操作手感優先改這個檔案，不要在其他檔案裡散落寫死數字。
   · hud.js：畫面上疊在 3D 之上的 2D 介面（搖桿、對話框、提示訊息）。
   · kit.js：蓋場景用的零件庫（牆、路、招牌、樹…常用 3D 物件的共用建造函式）。
   · core.js（本檔）：引擎本身——建相機/渲染器、每影格更新角色位置、碰撞、
     鏡頭跟隨、互動偵測、效能自動調整，不含任何「某個場景長怎樣」的內容。
   · scenes.js：用 kit.js 的零件實際「蓋」出每一個場景（哪裡有牆、哪裡能走、
     哪裡有店家）。
   · story.js：劇情文字、對話流程、任務進度。
   跟遊戲其餘 2D 部分（js/quiz_*.js、js/reaction_*.js）是完全獨立的兩套系統，
   只共用最底層的 js/stage.js／js/ui.js。 */

/* 【新手導讀：3D 的幾個基本名詞】Three.js 是一個 3D 繪圖函式庫（全域變數 THREE）。Scene（場景）放所有 3D 物件；Camera（相機）決定從哪看；Renderer（渲染器）把場景畫成畫面；Mesh（網格）＝形狀＋材質的 3D 物件；Vector3 是 (x,y,z) 三維座標。這個遊戲的地面是 x、z 平面，y 軸是高度。 */
(function (global) {
    'use strict';

    /* T：Three.js */
    var T = global.THREE;
    /* FM：整個 3D 模式共用的命名空間物件（各檔案把自己的東西掛在上面） */
    var FM = global.FM = global.FM || {};
    /* 沒有載入 Three.js 就整個檔案不做事 */
    if (!T) return;
    /* K：kit.js 提供的零件庫 */
    var K = FM.kit;

    var Core = FM.core = {};

    /* 這些是引擎的核心物件：renderer 渲染器、scene 場景、camera 相機、sky 天空球、hemi 與 sun 兩盞燈 */
    var renderer, scene, camera, sky, hemi, sun;
    /* ctx：目前載入的場景資料（牆、可走區域、互動物件…） */
    var ctx = null;
    var last = 0;
    var hooks = [];
    /* raycaster：射線偵測，用來判斷「點到了哪個 3D 物件」 */
    var raycaster = new T.Raycaster();
    var ndc = new T.Vector2();
    var camLook = new T.Vector3();
    /* camLook、tmpV…：暫時用的向量，重複使用以免每個畫面都新建物件（省效能） */
    var tmpV = new T.Vector3();
    var tmpV2 = new T.Vector3();
    /* quality：畫質比例，畫面太慢時自動降低 */
    var quality = 1;
    var perf = { acc: 0, n: 0, fps: 60 };

    /* Core.frozen 等：引擎的狀態旗標 */
    Core.frozen = false;   /* 劇情演出中：玩家不能動 */
    Core.busy = false;     /* 換場景中 */
    Core.paused = false;   /* 暫停中：整個世界停住（移動、路人、公車、補間、等待、時鐘），只繼續畫圖 */
    Core.near = null;
    Core.elapsed = 0;

    /* ─── 玩家 ─── */
    /* P：玩家（位置、朝向 yaw、速度、動畫相位、走路或騎車模式） */
    var P = Core.player = {
        group: null, person: null, bike: null,
        pos: new T.Vector3(), yaw: 0, speed: 0, phase: 0, mode: 'walk'
    };

    /* Ctx：一個場景的資料容器；scenes.js 的場景會呼叫它的方法登記牆、可走區域、互動物件… */
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
        /* 鏡頭：預設值在 config.js（FM.CONFIG.camera），場景可覆寫 distance / pitchDeg / ahead */
        this.cam = {};
        this.mode = 'walk';
        this.camScript = null;
        this.place = '';
        this.data = {};
    }
    Ctx.prototype.add = function (o) { this.root.add(o); return o; };
    /* block：新增一個矩形障礙物（碰撞方塊）；x、z 是地面座標 */
    Ctx.prototype.block = function (x0, x1, z0, z1) {
        this.colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
    };
    Ctx.prototype.blockRect = function (cx, cz, w, d) { this.block(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2); };
    Ctx.prototype.unblock = function (c) {
        var i = this.colliders.indexOf(c);
        if (i >= 0) this.colliders.splice(i, 1);
    };
    Ctx.prototype.lastCollider = function () { return this.colliders[this.colliders.length - 1]; };
    /* walkable：新增一塊「可走區域」 */
    Ctx.prototype.walkable = function (x0, x1, z0, z1, name) {
        (this.walk = this.walk || []).push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), name: name });
    };
    /* 觸發區：玩家走進去時呼叫 enter */
    /* 觸發區：走進去時呼叫 enter */
    Ctx.prototype.zone = function (x0, x1, z0, z1, enter, opt) {
        var z = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), enter: enter, inside: false, once: opt && opt.once, done: false, leave: opt && opt.leave };
        this.zones.push(z);
        return z;
    };
    /* 可互動物件：靠近並面對它時，右下角出現互動鍵 */
    /* 可互動物件：
         label   互動鍵上的字（用動詞，例如「搭電梯」）
         x, z    站在這附近（半徑 r）才能互動
         fx, fz  物件本身的位置（要「面對」這一點，標記也畫在這裡）；省略時 = x, z
         y       橘色標記的「頂端」高度：放在招牌下緣、或人物頭頂上方
         hit     點擊判定用的 3D 物件
         enabled()、use() */
    Ctx.prototype.item = function (def) {
        def.r = def.r || 2.8;
        def.y = def.y == null ? 2.6 : def.y;
        if (def.fx == null) def.fx = def.x;
        if (def.fz == null) def.fz = def.z;
        if (def.marker !== false) {
            def.markerObj = K.marker();
            def.markerObj.position.set(def.fx, def.y, def.fz);
            def.markerObj.userData.fmItem = def;
            def.markerObj.userData.isMarker = true;
            this.root.add(def.markerObj);
        }
        (def.hit || []).forEach(function (o) { o.userData.fmItem = def; });
        this.items.push(def);
        return def;
    };
    /* tick：登記每個畫面都要執行的更新函式（例如公車移動） */
    Ctx.prototype.tick = function (fn) { this.updaters.push(fn); };
    /* 擋視線時會變半透明的物件（occluder） */
    /* 擋視線時會變半透明的物件；group 是它的附屬裝飾（招牌、店面），擋住時一起隱藏 */
    Ctx.prototype.occluder = function (mesh, group) {
        mesh.userData.fade = 1;
        mesh.userData.group = group || null;
        this.occluders.push(mesh);
    };

    /* 初始化：建立渲染器、場景、相機、燈光、天空、玩家，並啟動主迴圈 */
    /* ─── 初始化 ─── */
    Core.init = function (worldEl) {
        renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        renderer.setClearColor(0xFFF1D2);
        worldEl.appendChild(renderer.domElement);

        scene = new T.Scene();
        scene.fog = new T.Fog(0xFFF1D2, 70, 210);
        camera = new T.PerspectiveCamera(FM.CONFIG.camera.fovDeg, Stage.W / Stage.H, 0.1, 230);

        /* 兩盞光：半球光（天空與地面的環境光）＋平行光（太陽） */
        hemi = new T.HemisphereLight(0xFFF6E3, 0xC9DDB0, 1.85);
        scene.add(hemi);
        sun = new T.DirectionalLight(0xFFF0D6, 1.9);
        sun.position.set(-40, 70, 30);
        scene.add(sun);

        sky = K.skyDome();
        scene.add(sky);

        /* 玩家：上班族模型＋（騎車時才出現的）UBIKE */
        /* 玩家：上班族＋（騎車時才出現的）UBIKE */
        P.group = new T.Group();
        P.person = K.person({ shirt: 0x7DB3E0, pants: 0x5B6470, tie: K.mat(0xEE8E3A), hair: 0x3E2F24 });
        P.bike = K.bike();
        P.bike.visible = false;
        P.group.add(P.person);
        P.group.add(P.bike);
        scene.add(P.group);

        /* Stage.onResize：螢幕尺寸改變時重新設定畫布與相機 */
        Stage.onResize(resize);
        bindTap(renderer.domElement);
        HUD.onAction(function () { if (Core.near) Core.use(Core.near); });

        document.addEventListener('visibilitychange', function () { last = performance.now(); });
        requestAnimationFrame(frame);
    };

    /* 重設畫布解析度與相機長寬比 */
    function resize(r) {
        if (!renderer) return;
        renderer.setPixelRatio(r.dpr * quality);
        renderer.setSize(r.width, r.height, true);
        camera.aspect = Stage.W / Stage.H;
        camera.updateProjectionMatrix();
    }

    /* 每幀：依序更新玩家、觸發區、互動物件、場景更新函式、相機、擋視線的建築 */
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

    /* 整個 3D 世界的主迴圈（requestAnimationFrame 遞迴呼叫）：邏輯更新（update）與畫面重繪（render）分開 */
    /* 整個 3D 世界的主迴圈：每一影格都呼叫自己一次（requestAnimationFrame 的
       遞迴呼叫模式），「遊戲邏輯更新」（update，算角色移動、碰撞、鏡頭…）跟
       「畫面重繪」（renderer.render）分開兩步——跟 js/reaction_drop.js 的
       tweenViewBox 用的是同一套 rAF 驅動動畫的概念，只是這裡是整個 3D 世界
       的持續迴圈，不是單一動畫跑完就結束。
       dt（delta time，兩影格之間經過的秒數）用 Math.min(0.05, ...) 夾住上限：
       分頁切到背景、電腦卡頓造成某一影格間隔特別久時，不要讓角色「瞬間移動」
       一大段距離（dt 太大，位移＝速度×dt 就會跟著爆衝）。
       document.hidden 時直接跳過 update（分頁不可見時不用算遊戲邏輯），但
       requestAnimationFrame(frame) 這行要留在最前面，分頁切回來才能繼續跑。 */
    function frame(now) {
        requestAnimationFrame(frame);
        var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
        last = now;
        if (document.hidden) return;
        if (!Core.paused) update(dt);
        renderer.render(scene, camera);
        watchPerf(dt);
    }

    /* 驗證用：用固定時間步長推進遊戲 seconds 秒 */
    /* 驗證用：用固定時間步長推進遊戲 seconds 秒（不依賴螢幕更新頻率；暫停中不會推進） */
    Core.step = function (seconds, fps) {
        var dt = 1 / (fps || 30);
        var n = Math.max(1, Math.round(seconds / dt));
        if (!Core.paused) for (var i = 0; i < n; i++) update(dt);
        renderer.render(scene, camera);
    };

    /* 效能監測：每 2 秒算平均 fps，太慢（低於 24）就降低畫質 */
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

    /* 註冊每幀都要執行的函式 */
    Core.onFrame = function (fn) { hooks.push(fn); };

    /* 補間：duration 秒內每幀呼叫 fn(t: 0→1)；用「遊戲時間」，暫停時會停住；換場景就作廢 */
    /* 補間：duration 秒內每幀呼叫 fn(t: 0→1)
       走「遊戲時間」：暫停、切到背景時會停住。
       換了場景就作廢（不再呼叫、也不會 resolve），原本那一段劇情流程就停在那裡，不會跑到新場景裡。 */
    Core.tween = function (duration, fn) {
        var owner = ctx;
        return new Promise(function (resolve) {
            var t = 0;
            function step(dt) {
                if (ctx !== owner) { hooks.splice(hooks.indexOf(step), 1); return; }
                t = duration > 0 ? Math.min(1, t + dt / duration) : 1;
                fn(t);
                if (t >= 1) {
                    hooks.splice(hooks.indexOf(step), 1);
                    resolve();
                }
            }
            hooks.push(step);
        });
    };
    /* 遊戲時間的等待：劇情演出一律用這個（暫停時才會一起停） */
    /* 遊戲時間的等待：劇情演出一律用這個（不要用 setTimeout / UI.wait，暫停時才會一起停） */
    Core.wait = function (ms) { return Core.tween(ms / 1000, function () { }); };
    /* 緩動函式：先慢後快再慢 */
    Core.ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

    /* 玩家移動 */
    /* ─── 玩家移動 ─── */
    var CTRL = FM.CONFIG.controls;
    /* 走路與騎車各自的速度、倒退比例、轉彎速度、加速度（數值來自 config.js） */
    var CFG = {
        walk: { speed: CTRL.walkSpeed, back: 0.5, turn: CTRL.turnWalk, accel: 9 },
        bike: { speed: CTRL.bikeSpeed, back: 0.3, turn: CTRL.turnBike, accel: 3.2 }
    };

    /* 判斷座標 (x, z) 能不能站：碰撞判定是簡化的矩形範圍檢查（超出邊界、不在可走區域、或碰到障礙物都不行） */
    /* 判斷座標 (x, z) 這個點「能不能站」：3D 世界的碰撞判定不是用真正的物理
       引擎，是簡化成一堆矩形範圍的數學檢查（夠用、夠快，不需要精確的物理模擬）。
       r＝角色半徑（騎車比走路佔的空間大，所以 bike 模式用更大的 r）。
       三層檢查，任一層判定「不能走」就直接回傳 true（擋住）：
       1. 超出整個場景的邊界（ctx.bounds）。
       2. 有「可走區域」清單（ctx.walk）時，必須落在其中至少一塊裡面才算「能走」
          （沒有落在任何一塊可走區域內 = 擋住）；沒有設可走區域清單的場景，
          這一層檢查就跳過不管。
       3. 落在任何一個障礙物（ctx.colliders，牆、建築物等）的範圍內 = 擋住。 */
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

    /* 嘗試移動：先試斜著走，不行再試只動 x、只動 z（這樣貼著牆會「滑行」而不是被卡住） */
    function tryMove(dx, dz) {
        var nx = P.pos.x + dx;
        var nz = P.pos.z + dz;
        if (!blocked(nx, nz)) { P.pos.x = nx; P.pos.z = nz; return; }
        if (!blocked(nx, P.pos.z)) { P.pos.x = nx; return; }
        if (!blocked(P.pos.x, nz)) { P.pos.z = nz; return; }
        P.speed *= 0.4;
    }

    /* 更新玩家：依搖桿方向轉向與加減速，再移動並播放走路／騎車動畫 */
    function updatePlayer(dt) {
        var active = ctx.mode !== 'none' && !Core.frozen && !Core.busy;
        var inp = active ? HUD.input() : { x: 0, y: 0 };
        var ix = Math.abs(inp.x) < 0.14 ? 0 : inp.x;
        var iy = Math.abs(inp.y) < 0.14 ? 0 : inp.y;
        var cfg = CFG[P.mode] || CFG.walk;

        /* 轉彎：yaw（朝向角）依左右輸入增減 */
        P.yaw -= ix * cfg.turn * dt;

        /* 目標速度：往上推＝前進（負號是因為搖桿往上 y 是負） */
        var target = -iy * cfg.speed;
        if (target < 0) target *= cfg.back;
        /* 加速度：速度逐漸趨近目標速度（讓起步停步平順） */
        P.speed += (target - P.speed) * Math.min(1, cfg.accel * dt);
        if (!target && Math.abs(P.speed) < 0.05) P.speed = 0;

        if (P.speed) {
            /* 前進方向向量：yaw 角的 sin／cos */
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

    /* 切換模式：走路或騎車 */
    Core.setMode = function (mode) {
        P.mode = mode === 'bike' ? 'bike' : 'walk';
        P.bike.visible = mode === 'bike';
        P.group.visible = mode !== 'none';
        P.speed = 0;
    };

    /* 觸發區：玩家剛進入時呼叫 enter、剛離開時呼叫 leave */
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

    /* 可互動物件：靠近而且面對才出現互動鍵；標記上下浮動 */
    /* ─── 可互動物件：靠近「而且面對」才出現互動鍵；標記浮動 ─── */
    function updateItems(dt) {
        var best = null;
        var bestD = Infinity;
        var t = Core.elapsed;
        var can = ctx.mode !== 'none' && !Core.frozen && !Core.busy && !HUD.isModal();
        var cp = camera.position;
        var camToPlayer = Math.hypot(cp.x - P.pos.x, cp.z - P.pos.z);
        var fwdX = -Math.sin(P.yaw);
        var fwdZ = -Math.cos(P.yaw);
        var cosFace = Math.cos(FM.CONFIG.faceAngleDeg * Math.PI / 180);
        for (var i = 0; i < ctx.items.length; i++) {
            var it = ctx.items[i];
            var en = it.enabled ? it.enabled() : true;
            var d = Math.sqrt((it.x - P.pos.x) * (it.x - P.pos.x) + (it.z - P.pos.z) * (it.z - P.pos.z));
            it.dist = d;
            /* 面向判斷：角色正前方與「角色→物件」的夾角 */
            var ox = it.fx - P.pos.x;
            var oz = it.fz - P.pos.z;
            var od = Math.sqrt(ox * ox + oz * oz);
            /* 面向判斷：玩家正前方與「玩家→物件」的夾角（用內積 dot product 比較 cos 值） */
            it.facing = od < 0.7 || (ox * fwdX + oz * fwdZ) / od >= cosFace;
            if (it.markerObj) {
                /* 標記如果比玩家更靠近鏡頭（在玩家背後），就先不顯示，免得擋住畫面 */
                var behind = Math.hypot(cp.x - it.fx, cp.z - it.fz) < camToPlayer - 0.5;
                /* 已經站在旁邊、互動鍵已出現，就不必再顯示標記 */
                it.markerObj.visible = en && can && !behind && it !== Core.near && d < (it.markerRange || 16);
                it.markerObj.position.y = it.y + Math.sin(t * 3 + i) * 0.1;
                it.markerObj.rotation.y += dt * 1.6;
            }
            if (can && en && it.facing && d <= it.r && d < bestD) { best = it; bestD = d; }
        }
        if (best !== Core.near) {
            Core.near = best;
            HUD.action(best ? best.label : null);
        }
    }

    /* 使用一個互動物件 */
    Core.use = function (it) {
        if (!it || Core.frozen || Core.busy || HUD.isModal()) return;
        if (it.enabled && !it.enabled()) return;
        Core.near = null;
        HUD.action(null);
        it.use();
    };

    /* 點擊 3D 物件：pointerdown 與 pointerup 之間移動很少、時間很短才算「點一下」 */
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

    /* 射線偵測：把點擊位置換成射線，找出第一個被打到的物件 */
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

    /* 相機：從對準點沿著俯角往後上方拉開 */
    /* ─── 相機：從對準點沿著 pitchDeg 往後上方拉開（pitchDeg 就是實際往下看的角度） ─── */
    function desiredCam(out, look) {
        var CAM = FM.CONFIG.camera;
        var c = ctx.cam;
        var dist = c.distance || CAM.distance;
        var ahead = c.ahead != null ? c.ahead : CAM.ahead;
        var th = c.targetHeight || CAM.targetHeight;
        var pitch = (c.pitchDeg != null ? c.pitchDeg : CAM.pitchDeg) * Math.PI / 180;
        var fx = -Math.sin(P.yaw);
        var fz = -Math.cos(P.yaw);
        look.set(P.pos.x + fx * ahead, th, P.pos.z + fz * ahead);
        var len = dist + ahead;
        var back = len * Math.cos(pitch);
        out.set(look.x - fx * back, th + len * Math.sin(pitch), look.z - fz * back);
    }

    Core.snapCamera = function () {
        if (ctx.camScript) return;
        desiredCam(camera.position, camLook);
        camera.lookAt(camLook);
    };

    /* 更新相機：平滑跟隨玩家（用指數趨近 lerp） */
    function updateCamera(dt) {
        if (ctx.camScript) {
            ctx.camScript(dt, camera, camLook);
            return;
        }
        desiredCam(tmpV, tmpV2);
        var k = 1 - Math.exp(-dt * FM.CONFIG.camera.follow);
        camera.position.lerp(tmpV, k);
        camLook.lerp(tmpV2, 1 - Math.exp(-dt * 7));
        camera.lookAt(camLook);
    }

    /* 劇情用：把相機平滑移到指定位置、看向指定點 */
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

    /* 擋住視線的建築變半透明 */
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

    /* 一條視線要「雙向」各打一次射線：單面牆只能從正面被打到 */
    /* 一條視線要「雙向」各打一次射線：
       單面牆只能被正面打到——鏡頭在牆的正面那側時，要從鏡頭往角色打才打得到；
       建築方塊則相反，鏡頭在方塊裡面時，要從角色往鏡頭打才打得到外牆。 */
    var occRay = new T.Raycaster();
    var occDir = new T.Vector3();
    var occBack = new T.Vector3();
    function castSight(from, to, list, hitSet) {
        if (!list.length) return;
        occDir.subVectors(to, from);
        var dist = occDir.length();
        if (dist < 0.01) return;
        occDir.divideScalar(dist);
        occRay.far = dist;
        occRay.set(from, occDir);
        var hits = occRay.intersectObjects(list, false);
        for (var i = 0; i < hits.length; i++) hitSet[hits[i].object.id] = hits[i].object;
        occRay.set(to, occBack.copy(occDir).negate());
        hits = occRay.intersectObjects(list, false);
        for (var j = 0; j < hits.length; j++) hitSet[hits[j].object.id] = hits[j].object;
    }

    /* 對一組物件檢查「角色 ↔ 鏡頭」的視線，回傳擋到的物件 */
    /* 對一組物件檢查「角色 ↔ 鏡頭」的視線，回傳擋到的物件 */
    function sightHits(list) {
        var hitSet = {};
        if (ctx.camScript) {
            castSight(camLook, camera.position, list, hitSet);
        } else {
            /* 看得到角色的胸口和頭頂，才算沒被擋住 */
            castSight(tmpV.set(P.pos.x, 1.2, P.pos.z), camera.position, list, hitSet);
            castSight(tmpV.set(P.pos.x, 1.95, P.pos.z), camera.position, list, hitSet);
        }
        return hitSet;
    }

    /* 其他任何擋住視線的東西（招牌、門框、路人…）：暫時換成半透明材質 */
    /* ─── 其他任何擋住視線的東西（招牌、門框、櫃子、路人…）：暫時換成半透明材質 ───
       同一個原始材質共用一份半透明複本；擋住時換上，不擋了 0.25 秒後換回來。 */
    var blockCandidates = [];
    var fadedMeshes = [];
    var fadedMats = new Map();

    function isGroundGeo(g) { return g === K.G.ground || g === K.G.circle; }

    function collectBlockCandidates() {
        blockCandidates = [];
        fadedMeshes = [];
        fadedMats = new Map();
        var occ = {};
        ctx.occluders.forEach(function (m) { occ[m.id] = true; });
        ctx.root.traverse(function (o) {
            if (!o.isMesh || o.isInstancedMesh || occ[o.id] || isGroundGeo(o.geometry)) return;
            var a = o.parent;
            while (a && a !== ctx.root) {
                if (a.userData.isMarker) return;        /* 互動標記本身不算 */
                a = a.parent;
            }
            blockCandidates.push(o);
        });
    }

    function fadedOf(mat) {
        var f = fadedMats.get(mat);
        if (!f) {
            f = K.own(mat.clone());
            f.transparent = true;
            f.opacity = 0.25;
            f.depthWrite = false;
            fadedMats.set(mat, f);
        }
        return f;
    }

    /* 人物要整個一起變淡（不然只有被打到的手或頭變淡） */
    /* 人物要整個一起變淡（不然只有被打到的手或頭變淡） */
    function blockUnit(mesh) {
        var a = mesh.parent;
        while (a && a !== ctx.root) {
            if (a.userData.parts) {
                var list = [];
                a.traverse(function (o) { if (o.isMesh && !isGroundGeo(o.geometry)) list.push(o); });
                return list;
            }
            a = a.parent;
        }
        return [mesh];
    }

    function updateBlockers(dt) {
        var hits = sightHits(blockCandidates);
        var now = {};
        Object.keys(hits).forEach(function (id) {
            blockUnit(hits[id]).forEach(function (m) { now[m.id] = m; });
        });
        Object.keys(now).forEach(function (id) {
            var m = now[id];
            if (!m.userData.origMat) {
                if (Array.isArray(m.material)) return;
                m.userData.origMat = m.material;
                m.material = fadedOf(m.material);
                fadedMeshes.push(m);
            }
            m.userData.blockTtl = 0.25;
        });
        for (var i = fadedMeshes.length - 1; i >= 0; i--) {
            var b = fadedMeshes[i];
            if (now[b.id]) continue;
            b.userData.blockTtl -= dt;
            if (b.userData.blockTtl <= 0) {
                b.material = b.userData.origMat;
                b.userData.origMat = null;
                fadedMeshes.splice(i, 1);
            }
        }
    }

    function updateOccluders(dt) {
        updateBlockers(dt);
        if (!ctx.occluders.length) return;
        var hitSet = sightHits(ctx.occluders);
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

    /* 載入場景：清掉舊場景、建新的、放好玩家、對準鏡頭 */
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
        collectBlockCandidates();

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

    /* 傳送玩家到指定位置 */
    Core.teleport = function (x, z, yaw) {
        P.pos.set(x, 0, z);
        if (yaw != null) P.yaw = yaw;
        P.speed = 0;
        Core.snapCamera();
    };

    /* 驗證用：回傳目前的狀態資訊（位置、fps、畫質、繪圖統計…） */
    Core.info = function () {
        return {
            scene: ctx && ctx.id,
            x: +P.pos.x.toFixed(2), z: +P.pos.z.toFixed(2), yaw: +P.yaw.toFixed(2),
            mode: P.mode, near: Core.near && Core.near.label,
            frozen: Core.frozen, busy: Core.busy, paused: Core.paused, modal: HUD.isModal(),
            fps: Math.round(perf.fps), quality: quality,
            calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
            geos: renderer.info.memory.geometries, texs: renderer.info.memory.textures
        };
    };
})(window);
