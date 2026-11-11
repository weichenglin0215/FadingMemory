/* ═══════════════════════════════════════════════════════════════════
   reaction_bubblespray.js — 秒反應・泡泡掃射（V1.53 起改成 Ball Blast 玩法）
   樣式：css/games/reaction_bubblespray.css（這款專屬的 class 一律以「bubblespray-」開頭；共用元件在 css/reaction_common.css）
   **手指左右拖曳，砲塔就跟著手指的位置移動**，砲塔一直自動往正上方連射。畫面最下面 TOUCH_ZONE（約 1/5）是留給手指的空間，手指不會擋到砲塔。
   球受「重力加速度」往下掉，碰到地板會彈起來，彈起的力道剛好讓每一顆都回到遊戲區的最上緣；越重的球（顏色越後面）重力加速度越大、掉得越快、彈得越快。
   **球碰到砲塔就失敗**（砲管、車身、輪子都算），要一邊閃球一邊打：撞到的那一刻畫面立刻定格（整個畫面壓暗、撞到的那顆球圈起來標示），
   砲塔在淺灰與粉紅之間快速閃爍 CRASH_PAUSE_S 秒，讓玩家看清楚是哪一顆撞上來，才進結算。砲塔用鮮豔的多種顏色（青、黃、橘、紫、綠）加白色外框，深色背景上一眼就找得到。
   一層一個顏色：紅 → 橘 → 黃 → 綠 → 藍 → 靛 → 紫（LAYERS 層）；每顆球上有白色數字＝「還要被打中幾次才會破」（HITS：紅 32、橘 16、黃 8、綠 4、藍 2、靛 1、紫 1）。
   球被打破會分成兩顆下一層的球；最小的紫球被打中就直接消失。限時 TIME_S 秒，成績＝打破幾顆。
   ───────────────────────────────────────────────────────────────────
   · 這款求的是「追著球跑、連射的爽感」：球碰到砲塔就結束，成績＝結束前打破幾顆（撐滿 TIME_S 秒也結束）。
   · 第 0 秒出現第 1 顆紅色大球，之後每 SPAWN_EVERY（5）秒再多一顆。一顆紅球全部打完是 2^LAYERS − 1 顆（7 層＝127 顆）、
     要 hitsPerRed() 發砲彈；60 秒共 12 顆紅球＝理論滿分 maxScore()＝1524 顆（SCORE.max 要比它大）。
   · 球之間可以互相重疊、不會碰撞；碰到左右牆壁會反彈；落地會彈回最上緣。
   · 砲彈每次從砲口正上方射出（每秒 FIRE_RATE 發）；**每顆砲彈打中一顆球就消失**，球上的數字少 1，數字變 0 球就破掉。
   · 每擊破一顆紅色大球，連射每秒多 RED_FIRE_BONUS 發、砲彈快 RED_SPEED_BONUS px／秒（上限 FIRE_RATE_MAX、BULLET_V_MAX）；
     擊破第 2、4、6 顆紅球（MULTI_AT）時，每次同時射出 2、3、4 發並排的砲彈（左右間隙 BULLET_GAP）。
     碰撞用「這一小格砲彈走過的線段」對每顆球算交點（掃掠），砲彈很快也不會穿過小球；同一格碰到好幾顆，取最先碰到的那顆。
   · 破掉時有「分子」特效：一圈水珠往外噴、慢慢變小變淡，再加一圈擴散的光環。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'bubblespray'：選單、成績、存檔都靠它；樣式在 css/games/reaction_bubblespray.css，裡面的 class 名稱一律以 bubblespray- 開頭。 */
    'use strict';

    var ID = 'bubblespray';                             /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 顆', label: '打破幾顆', min: 1, max: 2000 };  /* 成績規格：better（max＝越大越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var TIME_S = 60;                                    /* 限時幾秒 */
    var SPAWN_EVERY = 5;                               /* 每隔幾秒多一顆紅色大球（第 0 秒就有第 1 顆） */
    /* 每一層的顏色（由大到小）：紅、橘、黃、綠、藍、靛、紫；有幾個顏色就有幾層 */
    var COLORS = ['hsla(3, 79%, 57%, 1.00)', 'hsla(28, 91%, 56%, 1.00)', '#F7C934', '#5CBF4A', '#3FA9E8', '#4A5FD1', '#9B57D3'];
    var LAYERS = COLORS.length;                         /* 幾層（最後一層打中就直接破掉，不再分裂） */
    /* 每一層的球要被打中幾次才會破（由大到小，跟 COLORS 一一對應；球上的白色數字就是「還剩幾次」）：紅 32、橘 16、黃 8、綠 4、藍 2、靛 1、紫 1 */
    var HITS = [32, 16, 8, 4, 2, 1, 1];
    /* ─ 球的大小（原本就有的參數）─ */
    var R0 = 40;                                       /* 紅色大球的半徑（px） */
    var R_SHRINK = 0.7;                                /* 每往下一層，半徑乘幾倍（20 → 18 → 16.2 → 14.6 → 13.1 → 11.8 → 10.6） */
    var BALL_BORDER = 1;                                /* 球的白色外框粗細（px） */
    /* ─ 球的移動：越重（顏色越後面）彈得越快 ─ */
    var GRAVITY = [50, 100];                          /* 重力（px／秒²）：最輕的紅球 → 最重的紫球（中間線性）。重力越大，掉得越快、彈得越快（彈起來的高度都一樣，都是回到最上緣） */
    var SPEED = [50, 100];                              /* 左右飄移速度（px／秒）：最大的紅球 → 最小的紫球（中間線性） */
    var KICK = [80, 120];                              /* 分裂時兩顆小球往左右兩邊彈開的速度（px／秒）：第 2 層 → 最後一層（之後慢慢回到這一層的飄移速度） */
    var POP_UP = 100;                                   /* 分裂時兩顆小球同時往上蹦起的速度（px／秒） */
    /* ─ 砲塔與砲彈 ─ */
    var TURRET_SCALE = 0.66;                               /* 砲塔的整體尺寸比例（1＝原本大小，0.8＝縮小兩成，1.5＝放大五成；砲管、輪子、車身一起放大縮小，砲彈與球不受影響） */
    var TOUCH_ZONE = 0.2;                               /* 畫面最下面留給手指拖曳的高度比例（0.2＝1/5）；砲塔站在這一塊的正上方、球也是在這條線落地 */
    var FIRE_RATE = 4;                                 /* 每秒射幾次（一次可能同時射好幾發） */
    var BULLET_V = 700;                                 /* 砲彈速度（px／秒） */
    var BULLET_R = 3;                                   /* 砲彈半徑（px） */
    var BULLET_GAP = 6;                                 /* 同時射出好幾發時，相鄰兩發砲彈左右之間的間隙（px，邊到邊；0＝緊貼，數字越大兩發離越遠） */
    /* 擊破紅色大球的獎勵：每擊破一顆紅球，連射變快、砲彈變快（越早擊破紅球越有利） */
    var RED_FIRE_BONUS = 2.0;                           /* 每擊破一顆紅球，每秒多射幾次（FIRE_RATE 加上這個數） */
    var RED_SPEED_BONUS = 50;                          /* 每擊破一顆紅球，砲彈速度多幾 px／秒（BULLET_V 加上這個數） */
    var FIRE_RATE_MAX = 30;                             /* 連射最快每秒幾次（加到這裡就不再加） */
    var BULLET_V_MAX = 1200;                            /* 砲彈最快幾 px／秒（加到這裡就不再加） */
    var MULTI_AT = [2, 4, 6];                           /* 擊破第幾顆紅球時，每次多射一發：[2, 4, 6]＝第 2 顆起雙發、第 4 顆起三發、第 6 顆起四發 */
    var TURRET_COLORS = { barrel: '#19E6FF', muzzle: '#FFE81A', body: '#FF7A00', stripe: '#B84DFF', wheel: '#2BEA6A', hub: '#FFFFFF', edge: '#FFFFFF' };   /* 砲塔各部位的顏色（鮮豔的青、黃、橘、紫、綠）：砲管、砲口、車身、車身上的條紋、輪子、輪軸、一圈外框 */
    /* ─ 球撞到砲塔：畫面定格、砲塔閃爍 ─ */
    var CRASH_PAUSE_S = 2.5;                            /* 球撞到砲塔後，畫面定格幾秒才進結算（讓玩家看清楚是哪一顆撞上來） */
    var CRASH_FLASH_S = 0.1;                            /* 定格時，砲塔每隔幾秒換一次顏色（越小閃得越快） */
    var CRASH_COLORS = ['#D9D9D9', '#FF8CC6'];          /* 定格時砲塔輪流閃的兩種顏色：淺灰、粉紅 */
    /* ─ 其他 ─ */
    var HIT_FLASH = 0.1;                                /* 球被打中時，閃一下（變大一點）持續幾秒 */
    var SUBSTEP = 1 / 120;                              /* 物理計算的最小時間格（秒）：每個畫面會切成幾小格去算，球與砲彈很快也不會穿過彼此 */
    var SOLVE_CAP = 60;                                 /* 驗證用：api.solve 最多幫你打破幾顆 */
    var MAX_LEVEL = 1;                                  /* 只有一局（成績用 scoreOf＝打破幾顆） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 第 layer 層（0＝紅色大球）的半徑、顏色、左右飄移速度、重力、要被打中幾次才會破 */
    function radiusOf(layer) { return R0 * Math.pow(R_SHRINK, layer); }
    function colorOf(layer) { return COLORS[Math.max(0, Math.min(LAYERS - 1, layer))]; }
    function speedOf(layer) { return SPEED[0] + (SPEED[1] - SPEED[0]) * layer / Math.max(1, LAYERS - 1); }
    function gravityOf(layer) { return GRAVITY[0] + (GRAVITY[1] - GRAVITY[0]) * layer / Math.max(1, LAYERS - 1); }
    function hitsOf(layer) { var v = HITS[layer]; return v == null ? 1 : Math.max(1, Math.round(v)); }   /* HITS 沒寫到的層，當作 1 次 */
    /* 砲塔的尺寸：w＝車身寬度、h＝從地板到砲口頂端的高度（都乘上 TURRET_SCALE） */
    function turretSize(scale) { var s = scale == null ? TURRET_SCALE : scale; return { w: 56 * s, h: 64 * s }; }
    /* 砲口（最上面那條橫桿）的寬度：至少 24 px（乘上比例），同時射出好幾發時要比整排砲彈再寬一點 */
    function muzzleWidth(shots, scale) { var s = scale == null ? TURRET_SCALE : scale; return Math.max(24 * s, (shots - 1) * (2 * BULLET_R + BULLET_GAP) + 2 * BULLET_R + 10); }
    /* 砲塔由哪幾塊組成（砲管、砲口、車身是長方形，兩個輪子是圓）：x＝砲塔中心，y0＝地板的高度；畫面與「球碰到砲塔」的判斷都用這一份，所以看到重疊就是撞到 */
    function turretShapes(x, y0, scale, shots) {
        var s = scale == null ? TURRET_SCALE : scale, mw = muzzleWidth(shots || 1, s);
        return {
            rects: [
                { l: x - 9 * s, r: x + 9 * s, t: y0 - 64 * s, b: y0 - 26 * s },          /* 砲管 */
                { l: x - mw / 2, r: x + mw / 2, t: y0 - 64 * s, b: y0 - 56 * s },        /* 砲口 */
                { l: x - 28 * s, r: x + 28 * s, t: y0 - 30 * s, b: y0 - 10 * s }         /* 車身 */
            ],
            circles: [{ x: x - 20 * s, y: y0 - 10 * s, r: 10 * s }, { x: x + 20 * s, y: y0 - 10 * s, r: 10 * s }]   /* 兩個輪子 */
        };
    }
    /* 球 b（x, y, r）有沒有碰到砲塔：圓對長方形（找長方形上離球心最近的點）、圓對圓，只要有一塊重疊就算撞到 */
    function turretHit(b, x, y0, scale, shots) {
        var t = turretShapes(x, y0, scale, shots), i;
        for (i = 0; i < t.rects.length; i++) {
            var q = t.rects[i], nx = Math.max(q.l, Math.min(b.x, q.r)), ny = Math.max(q.t, Math.min(b.y, q.b));
            if ((b.x - nx) * (b.x - nx) + (b.y - ny) * (b.y - ny) < b.r * b.r) return true;
        }
        for (i = 0; i < t.circles.length; i++) {
            var c = t.circles[i], rr = b.r + c.r;
            if ((b.x - c.x) * (b.x - c.x) + (b.y - c.y) * (b.y - c.y) < rr * rr) return true;
        }
        return false;
    }
    /* 定格後第 t 秒，砲塔該是哪一種顏色：每 CRASH_FLASH_S 秒在 CRASH_COLORS（淺灰、粉紅）之間換一次 */
    function crashColorAt(t) { return CRASH_COLORS[Math.floor(Math.max(0, t) / CRASH_FLASH_S) % CRASH_COLORS.length]; }
    /* 擊破 reds 顆紅球之後，每次同時射出幾發 */
    function shotsAfter(reds) { var n = 1; for (var i = 0; i < MULTI_AT.length; i++) if (reds >= MULTI_AT[i]) n++; return n; }
    /* 已經擊破 reds 顆紅球時的連射速度（每秒幾次）、砲彈速度（px／秒）、每次幾發 */
    function gunAfter(reds) { return { rate: Math.min(FIRE_RATE_MAX, FIRE_RATE + reds * RED_FIRE_BONUS), v: Math.min(BULLET_V_MAX, BULLET_V + reds * RED_SPEED_BONUS), shots: shotsAfter(reds) }; }
    /* 一次射 n 發並排的砲彈：回傳每一發的 x（以砲口中心 x 為中心，左右對稱；相鄰兩發邊到邊相隔 BULLET_GAP） */
    function volley(x, n) { var step = 2 * BULLET_R + BULLET_GAP, out = []; for (var i = 0; i < n; i++) out.push(x + (i - (n - 1) / 2) * step); return out; }
    /* 一顆紅球全部打完一共幾顆（1 + 2 + 4 + … ＝ 2^LAYERS − 1），以及一共要幾發砲彈（每一層 2^層 顆 × 每顆要打幾次） */
    function perRed() { return Math.pow(2, LAYERS) - 1; }
    function hitsPerRed() { var n = 0; for (var L = 0; L < LAYERS; L++) n += Math.pow(2, L) * hitsOf(L); return n; }
    /* 這一局哪幾秒會出現紅色大球（0、5、10…，在 TIME_S 之前） */
    function spawnTimes(total) { var out = []; for (var t = 0; t < (total == null ? TIME_S : total); t += SPAWN_EVERY) out.push(t); return out; }
    /* 滿分：每一顆紅球都打完 */
    function maxScore() { return spawnTimes().length * perRed(); }
    /* 做一顆第 layer 層的球（x, y＝中心位置；vx, vy＝速度；hp＝還要被打中幾次） */
    function makeBall(layer, x, y, vx, vy) { return { layer: layer, r: radiusOf(layer), hp: hitsOf(layer), x: x, y: y, vx: vx || 0, vy: vy || 0, flash: 0, ph: 0 }; }
    /* 一顆球被打中一次：剩餘次數 −1、閃一下；回傳 true＝這一下把它打破了（剩 0） */
    function strike(b) { b.hp--; b.flash = HIT_FLASH; return b.hp <= 0; }
    /* 線段 (x0,y0)→(x1,y1) 第一次碰到圓 (cx,cy,r) 的位置（0～1，線段上的比例）；碰不到回傳 −1（起點已經在圓裡面算 0） */
    function segHit(x0, y0, x1, y1, cx, cy, r) {
        var dx = x1 - x0, dy = y1 - y0, fx = x0 - cx, fy = y0 - cy;
        var a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
        if (c <= 0) return 0;
        if (a === 0) return -1;
        var disc = b * b - 4 * a * c;
        if (disc < 0) return -1;
        var t = (-b - Math.sqrt(disc)) / (2 * a);
        return t >= 0 && t <= 1 ? t : -1;
    }
    /* 砲彈這一格會打中哪一顆：bubbles 是 [{ x, y, r }]；回傳最先碰到的編號，沒有回傳 −1 */
    function firstHit(x0, y0, x1, y1, bubbles, br) {
        var best = -1, bt = 2;
        for (var i = 0; i < bubbles.length; i++) {
            var b = bubbles[i], t = segHit(x0, y0, x1, y1, b.x, b.y, b.r + (br == null ? BULLET_R : br));
            if (t >= 0 && t < bt) { bt = t; best = i; }
        }
        return best;
    }
    /* 一顆球被打破，分裂成兩顆下一層的球（最後一層回傳空陣列）：往左右兩邊彈開，同時往上蹦一下 */
    function split(b, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        if (b.layer >= LAYERS - 1) return [];
        var L = b.layer + 1, r = radiusOf(L), k = KICK[0] + (KICK[1] - KICK[0]) * (L - 1) / Math.max(1, LAYERS - 2), out = [];
        for (var s = -1; s <= 1; s += 2) {
            var c = makeBall(L, b.x + s * r * 0.8, b.y, s * k * (0.9 + rand() * 0.2), Math.min(0, (b.vy || 0) * 0.3) - POP_UP * (0.8 + rand() * 0.4));
            c.ph = rand() * 6.28;
            out.push(c);
        }
        return out;
    }
    /* 球往前走 dt 秒：左右等速飄；上下用「等加速度運動」算——位置 y += v·dt + ½·g·dt²、速度 v += g·dt（g＝這一層的重力加速度，往下為正）。
       範圍是 [0, W]×[0, floor]（floor＝地板的高度）。碰到左右牆反彈；
       落到地板就彈起來：彈起的速度 v ＝ √(2·g·h)（h＝球心從地板高度升到最上緣的距離），所以不管輕重，每次都剛好彈回最上緣（球頂碰到遊戲區的最上面）；
       越重（g 越大）掉得越快、彈得越快、一來一回的時間越短。分裂時被踢開的球，左右速度會慢慢回到「這一層的飄移速度」。 */
    function fall(b, W, floor, dt) {
        var g = gravityOf(b.layer), want = speedOf(b.layer), sp = Math.abs(b.vx) || want, ns = sp + (want - sp) * Math.min(1, dt * 1.2);
        b.vx = (b.vx < 0 ? -1 : 1) * ns;
        b.x += b.vx * dt;
        b.y += b.vy * dt + 0.5 * g * dt * dt;
        b.vy += g * dt;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
        if (b.y > floor - b.r) {
            b.y = floor - b.r;
            if (b.vy > 0) b.vy = -Math.sqrt(2 * g * Math.max(0, floor - 2 * b.r));   /* 彈起來：高度剛好從地板到最上緣（v² ＝ 2·g·高度） */
        }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }                         /* 碰到最上緣：往下 */
        return b;
    }
    /* 結算評語（球碰到砲塔就結束，要閃球又要追球打，分數比單純追球低很多） */
    function rating(n) {
        if (n >= 1000) return '泡泡終結者！';
        if (n >= 500) return '火力全開！';
        if (n >= 250) return '掃得好爽！';
        if (n >= 100) return '追著球跑！';
        return '小心別被球撞到！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把流程（結算、最佳紀錄）交給共用骨架 kit.run；只有一局，成績用 scoreOf（S.score＝打破幾顆）。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 60, stageClass: 'bubblespray-stage', resume: false,
            head: function () { return '泡泡掃射'; },
            info: function (S) { return '打破 ' + S.score + ' 顆'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 顆'; },
            rating: rating,
            lines: function (S) { return ['打破 ' + S.score + ' 顆球（滿分 ' + maxScore() + ' 顆）']; },
            setup: setup
        });
    }

    /* setup(api)：遊戲開始時呼叫一次，把畫面建出來、開始動畫迴圈並處理手指拖曳。 */
    function setup(api) {
        var stage = api.stage, S = api.S, rand = api.rand, root = api.root;
        root.classList.add('bubblespray-screen');       /* 加一個 class，讓上方標題與時間條的上下空隙縮小、把高度讓給遊戲區（樣式在 css/games/reaction_bubblespray.css）；離開遊戲時拿掉 */
        api.my.onDispose(function () { root.classList.remove('bubblespray-screen'); });
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var GROUND = Math.round(H * (1 - TOUCH_ZONE));  /* 地板的高度：球在這裡落地彈起、砲塔站在這裡；再往下就是留給手指的空間 */
        var TS = turretSize(), HALF = TS.w / 2;         /* 砲塔的尺寸；HALF＝車身寬度的一半（砲塔中心離左右邊至少這麼遠） */
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var cv = h('canvas', { 'class': 'bubblespray-canvas' });
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);    /* Math.round：四捨五入成整數 */
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
        stage.appendChild(cv);                          /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var g = cv.getContext('2d'); g.scale(dpr, dpr);

        var bubbles = [], bullets = [], parts = [], spawns = spawnTimes(), spawned = 0, clock = 0, over = false, fireAcc = 0, auto = false;
        var reds = 0, gun = gunAfter(0);                /* reds：擊破幾顆紅球了；gun：目前的連射速度、砲彈速度、每次幾發 */
        var tx = W / 2, down = null, crashed = false, god = false;   /* tx：砲塔中心的 x；down：目前按著的那根手指；crashed：球撞到砲塔了（畫面定格中）；god：驗證用的無敵模式 */
        var hitBallRef = null, crashT = 0;               /* hitBallRef：撞到砲塔的那顆球；crashT：定格之後過了幾秒（砲塔閃爍用） */
        S.score = 0; showInfo();
        api.info = { get bubbles() { return bubbles; }, get bullets() { return bullets; }, get clock() { return clock; }, get score() { return S.score; }, get gun() { return gun; }, get reds() { return reds; }, get turretX() { return tx; }, get ground() { return GROUND; } };
        console.log('[泡泡掃射] ' + LAYERS + ' 層，一顆紅球 ' + perRed() + ' 顆、要打 ' + hitsPerRed() + ' 發；紅球出現在第 ' + spawns.join('、') + ' 秒，滿分 ' + maxScore());  /* 在瀏覽器主控台（按 F12）印出設定，方便除錯 */
        if (kit.once('bubblespray.hint')) kit.hintOn(stage, null, { mode: 'drag', x: W * 0.5 - 70, y: GROUND + 2, dx: 140, dy: 0, delay: 500, text: '左右拖曳，移動砲塔' });  /* 操作提示（手指圖示）：玩家第一次按下就消失 */
        api.timer(TIME_S * 1000, timeUp);               /* 開始倒數（畫面上方的時間條）：時間到就呼叫 timeUp */

        /* 手指按下、移動：砲塔的位置就是手指的位置（左右不超出牆壁） */
        function follow(p) { tx = Math.max(HALF, Math.min(W - HALF, p.x)); }
        cv.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (err) { }  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            down = { id: e.pointerId }; follow(kit.localPt(e, cv));
        });
        cv.addEventListener('pointermove', function (e) { if (down && e.pointerId === down.id) follow(kit.localPt(e, cv)); });
        function up(e) { if (down && e.pointerId === down.id) down = null; }
        cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

        api.my.loop(function (now, dt) {                /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (!cv.isConnected) return false;
            var d = Math.min(dt, 50) / 1000;
            if (!over) { clock += d; update(d); }
            else if (crashed) crashT += d;               /* 球撞到砲塔：整個畫面定格（球、砲彈、特效都不動），只有砲塔的閃爍在走 */
            else updateParts(d);
            draw();
        });

        function addRed() {                              /* 新的紅球從左邊或右邊的牆邊、最上緣掉下來 */
            var r = radiusOf(0), fromLeft = rand() < 0.5, b = makeBall(0, fromLeft ? r : W - r, r, (fromLeft ? 1 : -1) * speedOf(0), 0);
            b.ph = rand() * 6.28; bubbles.push(b);
        }
        function update(d) {
            while (spawned < spawns.length && clock >= spawns[spawned]) { addRed(); spawned++; }
            if (auto && bubbles.length) follow(auto === 'low' ? bubbles.reduce(function (a, b) { return b.y > a.y ? b : a; }) : bubbles[0]);   /* 驗證用：砲塔自己跟著球跑（auto＝'low' 時追最低的那顆，一定會撞上去） */
            /* 連射：一直自動發射（不用按住） */
            fireAcc += d * gun.rate;
            while (fireAcc >= 1) { fireAcc -= 1; shoot(); }
            /* 切成小格去算：球與砲彈都很快，一格太大會穿過去 */
            var n = Math.max(1, Math.ceil(d / SUBSTEP)), sd = d / n;
            for (var s = 0; s < n; s++) stepOnce(sd);
            updateParts(d);
        }
        function stepOnce(sd) {
            bubbles.forEach(function (b) { fall(b, W, GROUND, sd); if (b.flash > 0) b.flash -= sd; });  /* forEach：對陣列的每個元素各做一次 */
            /* 球碰到砲塔：失敗（驗證用的無敵模式例外） */
            if (!god) for (var j = 0; j < bubbles.length; j++) if (turretHit(bubbles[j], tx, GROUND, TURRET_SCALE, gun.shots)) { crash(bubbles[j]); return; }
            /* 砲彈：筆直往上，掃掠碰撞，打中就消失 */
            for (var i = bullets.length - 1; i >= 0; i--) {
                var u = bullets[i], y1 = u.y - u.v * sd;
                var k = firstHit(u.x, u.y, u.x, y1, bubbles, BULLET_R);
                if (k >= 0) { bullets.splice(i, 1); hitBall(k, u.x, u.y); continue; }  /* splice：從陣列中刪掉元素 */
                u.y = y1;
                if (u.y < -20) bullets.splice(i, 1);
            }
        }
        function updateParts(d) {
            for (var j = parts.length - 1; j >= 0; j--) {
                var q = parts[j]; q.t += d;
                if (q.t >= q.life) { parts.splice(j, 1); continue; }
                var drag = Math.exp(-3 * d); q.vx *= drag; q.vy *= drag; if (q.kind !== 'txt') q.vy += 60 * d;
                q.x += q.vx * d; q.y += q.vy * d; q.r += (q.grow || 0) * d;
            }
        }
        /* 砲口的位置（砲塔中心正上方）；一次射出 gun.shots 發並排的砲彈 */
        function shoot() {
            var xs = volley(tx, gun.shots), muzzleY = GROUND - TS.h;
            xs.forEach(function (x) { bullets.push({ x: x, y: muzzleY, v: gun.v }); });
        }
        /* 第 k 顆球被打中一次：數字少 1，小火花；打到 0 就破掉 */
        function hitBall(k, x, y) {
            var b = bubbles[k];
            parts.push({ x: x, y: y, vx: (rand() - 0.5) * 120, vy: -40 - rand() * 80, r: 1.5, t: 0, life: 0.25, kind: 'dot', c: '#FFFFFF' });
            if (strike(b)) pop(k);
        }
        /* 打破第 k 顆：+1、分子特效、分裂成兩顆下一層的 */
        function pop(k) {
            var b = bubbles[k];
            bubbles.splice(k, 1);
            S.score++; Sfx.play('pop');  /* Sfx.play(名稱)：播放音效（音效是程式即時合成的） */
            molecules(b);
            if (b.layer === 0) {                         /* 擊破紅色大球：連射與砲彈都變快，球的位置跳出「射速 ↑」；發數變多時再跳出「N 發！」 */
                var was = gun.shots;
                reds++; gun = gunAfter(reds);
                parts.push({ x: b.x, y: b.y, vx: 0, vy: -50, r: 0, t: 0, life: 1.1, kind: 'txt', c: '#FFF3B0', text: '射速 ↑' });
                if (gun.shots > was) parts.push({ x: b.x, y: b.y + 26, vx: 0, vy: -50, r: 0, t: 0, life: 1.4, kind: 'txt', c: '#9BE7FF', text: gun.shots + ' 發齊射！' });
                console.log('[泡泡掃射] 擊破第 ' + reds + ' 顆紅球：每秒 ' + gun.rate + ' 次、每次 ' + gun.shots + ' 發、砲彈 ' + gun.v + ' px／秒');
            }
            showInfo();
            Array.prototype.push.apply(bubbles, split(b, rand));
        }
        /* 上方資訊列：打破幾顆＋目前每秒幾發（同時射好幾發時，後面加上「×幾」） */
        function showInfo() { api.setInfo('打破 ' + S.score + ' 顆・每秒 ' + (Math.round(gun.rate * 10) / 10) + ' 發' + (gun.shots > 1 ? '×' + gun.shots : '')); }
        /* 分子特效：一圈水珠往外噴（顏色跟球一樣，還有幾顆白色亮點），加一圈擴散的光環 */
        function molecules(b) {
            var n = 10 + Math.round(b.r / 6), col = colorOf(b.layer);
            parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, r: b.r, grow: b.r * 2.2, t: 0, life: 0.28, kind: 'ring', c: col });
            for (var i = 0; i < n; i++) {
                var a = i / n * Math.PI * 2 + rand() * 0.4, v = (90 + rand() * 160) * (0.6 + b.r / R0);
                parts.push({ x: b.x + Math.cos(a) * b.r * 0.8, y: b.y + Math.sin(a) * b.r * 0.8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + rand() * (2 + b.r / 18), t: 0, life: 0.45 + rand() * 0.35, kind: 'dot', c: rand() < 0.25 ? '#FFFFFF' : col });
            }
        }
        /* 球 b 撞上砲塔：畫面立刻定格（loop 不再更新球與砲彈，draw 把撞到的那顆圈起來、砲塔閃爍），CRASH_PAUSE_S 秒後進結算 */
        function crash(b) {
            if (over) return;
            over = true; crashed = true; down = null; hitBallRef = b; crashT = 0;
            Sfx.play('boom');
            console.log('[泡泡掃射] 第 ' + (b.layer + 1) + ' 層的球撞到砲塔（' + Math.round(b.x) + ', ' + Math.round(b.y) + '）：' + S.score + ' 顆');
            api.fail({ delay: CRASH_PAUSE_S * 1000, lines: ['球撞到砲塔了！'] });
        }
        function timeUp() {
            if (over) return;
            over = true; down = null;
            console.log('[泡泡掃射] 時間到：' + S.score + ' 顆');
            api.fail({ delay: 1500, lines: ['撐滿 ' + TIME_S + ' 秒！'] });  /* api.fail({ delay, lines })：這局結束，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }

        /* ═══ 畫面 ═══ */
        function draw() {
            var sky = g.createLinearGradient(0, 0, 0, GROUND);
            sky.addColorStop(0, '#1C2A4A'); sky.addColorStop(1, '#3B5B8C');
            g.fillStyle = sky; g.fillRect(0, 0, W, GROUND);
            drawZone();
            drawTurret(crashed ? crashColorAt(crashT) : null);
            g.fillStyle = '#FFF3B0';
            bullets.forEach(function (u) { g.beginPath(); g.arc(u.x, u.y, BULLET_R, 0, Math.PI * 2); g.fill(); });
            bubbles.forEach(drawBubble);
            parts.forEach(drawPart);
            if (crashed) drawCrash();
        }
        /* 定格時：整個畫面壓暗，再把砲塔（閃爍中）和撞到的那顆球重畫在最上面，球外面圈一個一閃一閃的白圈、旁邊寫「撞到了！」 */
        function drawCrash() {
            g.save();
            g.fillStyle = 'rgba(6, 10, 24, 0.45)'; g.fillRect(0, 0, W, H);
            g.restore();
            drawTurret(crashColorAt(crashT));
            var b = hitBallRef;
            if (!b) return;
            drawBubble(b);
            var pulse = 0.5 + 0.5 * Math.sin(crashT * 14);
            g.save();
            g.strokeStyle = 'rgba(255,255,255,' + (0.55 + 0.45 * pulse).toFixed(2) + ')'; g.lineWidth = 4;
            g.beginPath(); g.arc(b.x, b.y, b.r + 7 + 3 * pulse, 0, Math.PI * 2); g.stroke();
            g.font = 'bold 24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
            var ty = b.y - b.r - 28 > 24 ? b.y - b.r - 28 : b.y + b.r + 28;        /* 球上面放不下就放下面 */
            g.lineWidth = 5; g.strokeStyle = 'rgba(20,30,50,0.9)'; g.strokeText('撞到了！', Math.max(48, Math.min(W - 48, b.x)), ty);
            g.fillStyle = '#FFF3B0'; g.fillText('撞到了！', Math.max(48, Math.min(W - 48, b.x)), ty);
            g.restore();
        }
        /* 最下面留給手指的區域：深色底、一條亮線當地板、左右箭頭提示可以左右拖曳 */
        function drawZone() {
            g.fillStyle = '#26354F'; g.fillRect(0, GROUND, W, H - GROUND);
            g.fillStyle = '#5E6B7D'; g.fillRect(0, GROUND, W, 3);
            g.save();
            g.fillStyle = 'rgba(255,255,255,0.28)'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText('◀   左右拖曳   ▶', W / 2, GROUND + (H - GROUND) / 2 + 2);
            g.restore();
        }
        /* 一顆球：不透明的純色圓、1px 白框、中間的白色數字＝還要被打中幾次 */
        function drawBubble(b) {
            var col = colorOf(b.layer), r = b.r * (1 + 0.15 * Math.max(0, b.flash || 0) / HIT_FLASH);
            g.save();
            g.fillStyle = col; g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI * 2); g.fill();
            g.strokeStyle = '#FFFFFF'; g.lineWidth = BALL_BORDER; g.stroke();
            if (b.layer >= LAYERS - 1) { g.restore(); return; }                  /* 最後一層（紫球）打一發就消失，不寫數字 */
            var fs = Math.max(11, Math.round(b.r * 0.95));
            g.font = 'bold ' + fs + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
            g.lineWidth = 2.5; g.strokeStyle = 'rgba(20,30,50,0.55)'; g.strokeText(String(b.hp), b.x, b.y + 1);
            g.fillStyle = '#FFFFFF'; g.fillText(String(b.hp), b.x, b.y + 1);
            g.restore();
        }
        function drawPart(q) {
            var k = q.t / q.life;
            g.save();
            if (q.kind === 'txt') { g.globalAlpha = Math.min(1, 2.5 * (1 - k)); g.fillStyle = q.c; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 4; g.strokeStyle = 'rgba(28,42,74,0.9)'; g.strokeText(q.text, q.x, q.y); g.fillText(q.text, q.x, q.y); }
            else if (q.kind === 'ring') { g.globalAlpha = 0.7 * (1 - k); g.strokeStyle = q.c; g.lineWidth = 4 * (1 - k) + 1; g.beginPath(); g.arc(q.x, q.y, q.r, 0, Math.PI * 2); g.stroke(); }
            else { g.globalAlpha = 1 - k; g.fillStyle = q.c; g.beginPath(); g.arc(q.x, q.y, Math.max(0.5, q.r * (1 - k * 0.7)), 0, Math.PI * 2); g.fill(); }
            g.restore();
        }
        /* 砲塔：兩個輪子、車身、筆直朝上的砲管（形狀來自 turretShapes，全部乘上 TURRET_SCALE，輪子底部貼在地板上；砲口寬度會跟著同時射出的發數變寬）。
           平常是 TURRET_COLORS 的多種鮮豔顏色＋白色外框；flash 有給顏色時（撞到砲塔、定格中）整座砲塔改成那一種顏色（淺灰／粉紅輪流） */
        function drawTurret(flash) {
            var t = turretShapes(tx, GROUND, TURRET_SCALE, gun.shots), s = TURRET_SCALE, C = TURRET_COLORS;
            function box(q, col) {
                g.fillStyle = flash || col; g.fillRect(q.l, q.t, q.r - q.l, q.b - q.t);
                g.strokeRect(q.l, q.t, q.r - q.l, q.b - q.t);
            }
            g.save();
            g.lineWidth = 1.5; g.strokeStyle = C.edge; g.lineJoin = 'round';
            box(t.rects[0], C.barrel);                                                                                      /* 砲管 */
            box(t.rects[1], C.muzzle);                                                                                      /* 砲口 */
            box(t.rects[2], C.body);                                                                                        /* 車身 */
            if (!flash) {                                                                                                   /* 車身中間一條紫色條紋 */
                var q = t.rects[2], sh = (q.b - q.t) * 0.34;
                g.fillStyle = C.stripe; g.fillRect(q.l + 1, q.t + ((q.b - q.t) - sh) / 2, q.r - q.l - 2, sh);
            }
            t.circles.forEach(function (c) {                                                                                /* 輪子（外框＋輪軸） */
                g.fillStyle = flash || C.wheel; g.beginPath(); g.arc(c.x, c.y, c.r, 0, Math.PI * 2); g.fill(); g.stroke();
                g.fillStyle = flash ? '#FFFFFF' : C.hub; g.beginPath(); g.arc(c.x, c.y, 4 * s, 0, Math.PI * 2); g.fill();
            });
            g.restore();
        }

        /* 驗證用（會被重複呼叫，要冪等）：solve＝直接打破畫面上的球（最多 SOLVE_CAP 顆）；wrong＝砲塔跑去接最低的那顆球（撞上去，這一局失敗）；
           autopilot＝無敵的自動掃射（砲塔跟著第一顆球跑、不會被撞毀，截圖與長時間測試用） */
        api.solve = function () { if (over) return; while (S.score < SOLVE_CAP && bubbles.length) pop(0); };
        api.wrong = function () { auto = 'low'; };
        api.autopilot = function () { auto = true; god = true; };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '泡泡掃射',
        rule: '**手指左右拖曳，砲塔就跟著手指移動**，一直自動往正上方連射。球受重力往下掉，碰到地板會彈回最上面，越重（顏色越後面）的球掉得越快。球上的白色數字是還要打幾發才會破：紅球 ' + hitsOf(0) + ' 發破成兩顆橘球，橘球 ' + hitsOf(1) + ' 發破成黃球，依此類推；紫球沒有數字，打 ' + hitsOf(LAYERS - 1) + ' 發就消失。**球碰到砲塔就失敗**，要一邊閃球一邊打。第 0 秒出現第一顆紅球，之後每 ' + SPAWN_EVERY + ' 秒再多一顆。**擊破第 ' + MULTI_AT.join('、') + ' 顆紅球，砲彈會變成同時 ' + MULTI_AT.map(function (n, i) { return i + 2; }).join('、') + ' 發並排齊射**。限時 ' + TIME_S + ' 秒，看你能打破幾顆！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            radiusOf: radiusOf, colorOf: colorOf, speedOf: speedOf, gravityOf: gravityOf, hitsOf: hitsOf, turretSize: turretSize, muzzleWidth: muzzleWidth, turretShapes: turretShapes, turretHit: turretHit, crashColorAt: crashColorAt, shotsAfter: shotsAfter, gunAfter: gunAfter, volley: volley, perRed: perRed, hitsPerRed: hitsPerRed, spawnTimes: spawnTimes, maxScore: maxScore, makeBall: makeBall, strike: strike, segHit: segHit, firstHit: firstHit, split: split, fall: fall, rating: rating,
            TIME_S: TIME_S, SPAWN_EVERY: SPAWN_EVERY, COLORS: COLORS, LAYERS: LAYERS, HITS: HITS, R0: R0, R_SHRINK: R_SHRINK, BALL_BORDER: BALL_BORDER, GRAVITY: GRAVITY, SPEED: SPEED, KICK: KICK, POP_UP: POP_UP,
            TURRET_SCALE: TURRET_SCALE, TOUCH_ZONE: TOUCH_ZONE, FIRE_RATE: FIRE_RATE, BULLET_V: BULLET_V, BULLET_R: BULLET_R, BULLET_GAP: BULLET_GAP, RED_FIRE_BONUS: RED_FIRE_BONUS, RED_SPEED_BONUS: RED_SPEED_BONUS, FIRE_RATE_MAX: FIRE_RATE_MAX, BULLET_V_MAX: BULLET_V_MAX, MULTI_AT: MULTI_AT, TURRET_COLORS: TURRET_COLORS, CRASH_PAUSE_S: CRASH_PAUSE_S, CRASH_FLASH_S: CRASH_FLASH_S, CRASH_COLORS: CRASH_COLORS, HIT_FLASH: HIT_FLASH, SUBSTEP: SUBSTEP, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
