/* ═══════════════════════════════════════════════════════════════════
   reaction_menuslice.js — 秒反應・切菜單上的（企劃 314）
   樣式：css/games/reaction_menuslice.css（這款專屬的 class 一律以「menuslice-」開頭；共用元件在 css/reaction_common.css）
   關卡一開始，黑板上的菜單亮出今天要用的 2 → 6 種水果（3 秒），然後收起來。接著水果一顆一顆拋上來，**只切菜單上有的**，其他的不要切。
   切錯一顆、或漏掉一顆菜單上的，就結束。結束時把菜單再亮出來，你切錯（或漏掉）的那顆和菜單上的那顆並排。
   ───────────────────────────────────────────────────────────────────
   · 水果與「長得像」的誘餌：四組長得像的 ——柳丁／橘子、檸檬／萊姆、蘋果／番茄、葡萄／藍莓；再加四種單獨的（香蕉、西瓜、梨子、草莓）。
     菜單（menuFor）先從每一組各挑一個（至多 4 種，其中的夥伴就成了誘餌），5～6 種時再加單獨的水果。
   · 拋水果（makeLevel）：總共 F 顆，其中約 55% 是菜單上的（每種至少一顆）、45% 是誘餌（七成是菜單水果的「長得像的夥伴」）；
     依序拋出，間隔 SPAWN_MS 毫秒（隨關卡越來越密）；每顆從畫面下方拋出，走拋物線（flightPos：高度、飛行時間、橫向速度都不同），落到畫面下方就算「落地」。
   · 切：手指在畫面上拖過水果（手指走過的線段碰到水果的圓就算切到，segHitsCircle）。切到菜單外的 → 馬上結束；
     菜單上的水果落地還沒切 → 結束；所有水果都處理完（切了或落地了）就過關。
   · 難度（線性）：菜單 2 → 6 種（MENU_N）、水果總數 8 → 30 顆（TOTAL）、拋出間隔 1100 → 450 毫秒（SPAWN_MS）；看菜單的時間 3 秒（VIEW_S）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'menuslice'：選單、成績、存檔都靠它；樣式在 css/games/reaction_menuslice.css，裡面的 class 名稱一律以 menuslice- 開頭。 */
    'use strict';

    var ID = 'menuslice';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var MENU_N = [2, 6];                        /* 菜單上有幾種水果：第 1 關 → 到頂 */
    var TOTAL = [8, 30];                        /* 這一關拋出的水果總數：第 1 關 → 到頂 */
    var SPAWN_MS = [1100, 450];                 /* 每顆水果拋出的間隔（毫秒）：第 1 關 → 到頂 */
    var VIEW_S = 3;                             /* 看菜單的時間（秒） */
    var MENU_FRAC = 0.55;                       /* 拋出的水果裡，菜單上的佔幾成 */
    var PARTNER_FRAC = 0.7;                     /* 誘餌裡，「菜單水果的夥伴（長得像）」佔幾成 */
    var LEAD_MS = 900;                          /* 菜單收起之後，多久拋第一顆 */
    var BOTTOM = 1.1, EXIT = 1.14;              /* 拋出的起點（畫面高度的倍數，1＝畫面下緣）、掉到這裡算落地 */
    var APEX = [0.2, 0.5];                      /* 最高點（畫面高度的倍數，0＝畫面上緣） */
    var T_APEX = [0.8, 1.0];                    /* 從拋出到最高點的時間（秒） */
    var X_RANGE = [0.14, 0.86];                 /* 水果的橫向位置（畫面寬度的倍數） */
    var FRUIT_PX = 66;                          /* 水果的大小（px） */
    var HIT_EXTRA = 8;                          /* 切到的判定半徑比水果多幾 px（比較好切） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var FRUITS = [                                  /* 水果清單：id 給程式用、name 是中文名稱、pair 是容易看錯的另一種水果（沒有就是 null） */
        { id: 'orange', name: '柳丁', pair: 'tangerine' }, { id: 'tangerine', name: '橘子', pair: 'orange' },
        { id: 'lemon', name: '檸檬', pair: 'lime' }, { id: 'lime', name: '萊姆', pair: 'lemon' },
        { id: 'apple', name: '蘋果', pair: 'tomato' }, { id: 'tomato', name: '番茄', pair: 'apple' },
        { id: 'grape', name: '葡萄', pair: 'blueberry' }, { id: 'blueberry', name: '藍莓', pair: 'grape' },
        { id: 'banana', name: '香蕉', pair: null }, { id: 'watermelon', name: '西瓜', pair: null }, { id: 'pear', name: '梨子', pair: null }, { id: 'strawberry', name: '草莓', pair: null }
    ];
    var PAIRS = [['orange', 'tangerine'], ['lemon', 'lime'], ['apple', 'tomato'], ['grape', 'blueberry']], SINGLES = ['banana', 'watermelon', 'pear', 'strawberry'];  /* PAIRS：容易看錯的成對水果（柳丁／橘子、檸檬／萊姆、蘋果／番茄、葡萄／藍莓）；SINGLES：沒有配對的水果 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 小工具：讓 [第 1 關的值, 到頂的值] 這種成對的設定，依關卡線性變化 */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 這一關的菜單上有幾種水果（越後面越多） */
    function menuCountFor(level) { return Math.round(ramp(level, MENU_N)); }  /* Math.round：四捨五入成整數 */
    /* 這一關總共拋出幾顆水果 */
    function totalFor(level) { return Math.round(ramp(level, TOTAL)); }
    /* 這一關水果拋出的間隔（毫秒），越後面越短（拋得越密） */
    function spawnMsFor(level) { return Math.round(ramp(level, SPAWN_MS)); }
    /* 用水果代號找出水果的資料（名字、長得像的夥伴 pair）；找不到回傳 null */
    function fruitOf(id) { for (var i = 0; i < FRUITS.length; i++) if (FRUITS[i].id === id) return FRUITS[i]; return null; }
    /* 用水果代號取得中文名字（找不到就直接回傳代號） */
    function nameOf(id) { var f = fruitOf(id); return f ? f.name : id; }
    /* 菜單：m 種水果；先每組長得像的各挑一個（最多 4 種），不夠再加單獨的 */
    /* 決定菜單：先從每一組「長得像」的水果各挑一種（最多 4 種），不夠 m 種再從沒有夥伴的水果補 */
    function menuFor(m, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var menu = [];
        kit.shuffle(PAIRS.slice(), rand).forEach(function (p) { if (menu.length < m) menu.push(kit.pick(p, rand)); });  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        kit.shuffle(SINGLES.slice(), rand).forEach(function (s) { if (menu.length < m) menu.push(s); });  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        return menu;
    }
    /* 誘餌池：不在菜單上的水果；{ partners（菜單水果的夥伴）, others（其他）} */
    /* 誘餌池：不在菜單上的水果分成兩種——partners（菜單水果的夥伴，長得像、最容易切錯）和 others（其他水果） */
    function decoyPools(menu) {
        var partners = [], others = [];
        FRUITS.forEach(function (f) { if (menu.indexOf(f.id) >= 0) return; if (f.pair && menu.indexOf(f.pair) >= 0) partners.push(f.id); else others.push(f.id); });  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
        return { partners: partners, others: others };
    }
    /* 一顆水果的飛行：toss = { x0, vx, ya, ta }（x0、vx 以畫面寬度計；ya＝最高點的高度；ta＝到最高點的秒數）；t 秒時的位置（x、y 都是畫面寬高的倍數）*/
    /* 一顆水果飛行 t 秒時的位置：拋物線運動（先算重力加速度 g 與初速 vy0，再算 y；水平方向等速） */
    function flightPos(tz, t) {
        var g = 2 * (BOTTOM - tz.ya) / (tz.ta * tz.ta), vy0 = -g * tz.ta;
        return { x: tz.x0 + tz.vx * t, y: BOTTOM + vy0 * t + g * t * t / 2 };
    }
    /* 這顆水果落地（掉回 EXIT 這條線以下）的時間（秒）：解二次方程式，取下降的那一根 */
    /* 水果落地（掉到 EXIT 線以下）的時間：解一元二次方程式，取「下降」的那個解 */
    function landTime(tz) {
        var g = 2 * (BOTTOM - tz.ya) / (tz.ta * tz.ta), vy0 = -g * tz.ta, c = BOTTOM - EXIT;
        return (-vy0 + Math.sqrt(vy0 * vy0 - 2 * g * c)) / g;  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
    }
    /* 線段 (ax, ay)→(bx, by) 有沒有碰到圓（圓心 cx, cy、半徑 r）：點到線段的最短距離 ≤ r */
    /* 手指劃過的線段有沒有碰到水果（圓）：找線段上離圓心最近的點，再看距離是否 ≤ 半徑 r（Math.hypot＝勾股定理算距離） */
    function segHitsCircle(ax, ay, bx, by, cx, cy, r) {
        var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 < 1e-12 ? 0 : kit.clamp(((cx - ax) * dx + (cy - ay) * dy) / l2, 0, 1);  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
        return Math.hypot(ax + t * dx - cx, ay + t * dy - cy) <= r;
    }
    /* 出一關：{ menu, pools, total, tosses（[{ t, fruit, onMenu, x0, vx, ya, ta, spin }]）, spawnMs, viewMs, level } */
    /* 出一關：決定菜單，再排出「要拋哪些水果」——每種菜單水果至少一顆、菜單上的水果佔 MENU_FRAC 的比例，
       其餘是誘餌（有機率挑菜單水果的夥伴）；洗牌後依序決定每顆從哪裡、什麼時候、用什麼拋物線拋出（相鄰兩顆的起點不要太近）。 */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var m = menuCountFor(level), F = totalFor(level), spawn = spawnMsFor(level), menu = menuFor(m, rand), pools = decoyPools(menu);
        var nMenu = Math.max(m, Math.round(F * MENU_FRAC)), list = [], i;
        menu.forEach(function (f) { list.push({ fruit: f, onMenu: true }); });                              /* 每種菜單水果至少一顆 */
        for (i = menu.length; i < nMenu; i++) list.push({ fruit: kit.pick(menu, rand), onMenu: true });  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        for (i = nMenu; i < F; i++) {
            var usePartner = pools.partners.length && (rand() < PARTNER_FRAC || !pools.others.length);
            list.push({ fruit: kit.pick(usePartner ? pools.partners : pools.others.concat(pools.partners), rand), onMenu: false });
        }
        list = kit.shuffle(list, rand);
        var t = LEAD_MS, lastX = 0.5;
        var tosses = list.map(function (it) {           /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var x0 = kit.randFloat(X_RANGE[0], X_RANGE[1], rand), guard = 0;  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
            while (Math.abs(x0 - lastX) < 0.18 && guard++ < 20) x0 = kit.randFloat(X_RANGE[0], X_RANGE[1], rand);  /* Math.abs：取絕對值（去掉負號） */
            lastX = x0;
            var tz = { t: Math.round(t), fruit: it.fruit, onMenu: it.onMenu, x0: x0, vx: (0.5 - x0) * kit.randFloat(0.05, 0.3, rand), ya: kit.randFloat(APEX[0], APEX[1], rand), ta: kit.randFloat(T_APEX[0], T_APEX[1], rand), spin: kit.randFloat(-220, 220, rand) };
            t += spawn * kit.randFloat(0.85, 1.15, rand);
            return tz;
        });
        return { menu: menu, pools: pools, total: F, tosses: tosses, spawnMs: spawn, viewMs: VIEW_S * 1000, level: level };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 15) return '水果忍者！';
        if (n >= 10) return '記性和手速都很棒！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先記住菜單，只切菜單上的！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'menuslice-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 水果的畫法（SVG path／圖形，viewBox 0 0 64 64）：每種一組圖形，顏色由 CSS 的 .menuslice-f--id 決定 */
    /* 每種水果的畫法：一個水果由幾個 SVG 圖形組成，格式是 [圖形種類, 屬性, 部位名稱]；顏色由 CSS 的 .menuslice-f--水果id 決定。座標在 64×64 的畫布裡 */
    var SHAPES = {
        orange: [['circle', { cx: 32, cy: 35, r: 24 }, 'body'], ['circle', { cx: 24, cy: 28, r: 1.6 }, 'dot'], ['circle', { cx: 38, cy: 26, r: 1.6 }, 'dot'], ['circle', { cx: 30, cy: 42, r: 1.6 }, 'dot'], ['circle', { cx: 42, cy: 38, r: 1.6 }, 'dot'], ['path', { d: 'M32 12 Q40 4 48 8 Q42 16 32 12 Z' }, 'leaf']],
        tangerine: [['ellipse', { cx: 32, cy: 38, rx: 26, ry: 21 }, 'body'], ['circle', { cx: 32, cy: 19, r: 3.2 }, 'dark'], ['path', { d: 'M32 16 Q36 6 44 8 Q40 14 32 16 Z' }, 'leaf']],
        lemon: [['path', { d: 'M3 32 L10 28 Q20 14 32 14 Q44 14 54 28 L61 32 L54 36 Q44 50 32 50 Q20 50 10 36 Z' }, 'body'], ['ellipse', { cx: 26, cy: 26, rx: 7, ry: 3 }, 'shine']],
        lime: [['path', { d: 'M8 32 Q10 17 32 15 Q54 17 56 32 Q54 49 32 51 Q10 49 8 32 Z' }, 'body'], ['ellipse', { cx: 26, cy: 26, rx: 7, ry: 3 }, 'shine'], ['circle', { cx: 32, cy: 33, r: 2.4 }, 'dark']],
        apple: [['path', { d: 'M32 20 C40 10 58 16 56 36 C54 52 42 58 32 54 C22 58 10 52 8 36 C6 16 24 10 32 20 Z' }, 'body'], ['path', { d: 'M32 20 Q32 12 36 6' }, 'stem'], ['path', { d: 'M36 12 Q44 4 52 10 Q44 18 36 12 Z' }, 'leaf'], ['ellipse', { cx: 21, cy: 30, rx: 4, ry: 7 }, 'shine']],
        tomato: [['ellipse', { cx: 32, cy: 37, rx: 26, ry: 22 }, 'body'], ['path', { d: 'M32 14 L36 22 L46 18 L40 26 L50 28 L40 31 L32 34 L24 31 L14 28 L24 26 L18 18 L28 22 Z' }, 'leaf'], ['ellipse', { cx: 20, cy: 34, rx: 4, ry: 6 }, 'shine']],
        grape: [['circle', { cx: 32, cy: 18, r: 9 }, 'body'], ['circle', { cx: 20, cy: 28, r: 9 }, 'body'], ['circle', { cx: 44, cy: 28, r: 9 }, 'body'], ['circle', { cx: 14, cy: 41, r: 9 }, 'body'], ['circle', { cx: 32, cy: 38, r: 9 }, 'body'], ['circle', { cx: 50, cy: 41, r: 9 }, 'body'], ['circle', { cx: 32, cy: 54, r: 8 }, 'body'], ['path', { d: 'M32 10 Q34 4 40 3' }, 'stem']],
        blueberry: [['circle', { cx: 32, cy: 36, r: 23 }, 'body'], ['path', { d: 'M32 21 L36 27 L43 26 L39 32 L43 38 L36 37 L32 43 L28 37 L21 38 L25 32 L21 26 L28 27 Z' }, 'dark'], ['ellipse', { cx: 22, cy: 28, rx: 4, ry: 6 }, 'shine']],
        banana: [['path', { d: 'M8 18 Q10 56 52 52 Q58 50 54 44 Q24 48 22 18 Z' }, 'body'], ['path', { d: 'M8 18 L22 18' }, 'stem'], ['circle', { cx: 53, cy: 47, r: 3.2 }, 'dark']],
        watermelon: [['circle', { cx: 32, cy: 34, r: 26 }, 'body'], ['path', { d: 'M20 12 Q12 34 22 56 M32 8 Q26 34 32 60 M44 12 Q52 34 42 56' }, 'stripe']],
        pear: [['path', { d: 'M32 8 C26 8 26 18 22 26 C14 34 12 52 32 58 C52 52 50 34 42 26 C38 18 38 8 32 8 Z' }, 'body'], ['path', { d: 'M32 8 Q32 4 36 2' }, 'stem'], ['ellipse', { cx: 24, cy: 40, rx: 4, ry: 8 }, 'shine']],
        strawberry: [['path', { d: 'M32 58 C8 46 6 22 22 18 C28 16 32 20 32 20 C32 20 36 16 42 18 C58 22 56 46 32 58 Z' }, 'body'], ['circle', { cx: 24, cy: 30, r: 1.5 }, 'dot'], ['circle', { cx: 38, cy: 28, r: 1.5 }, 'dot'], ['circle', { cx: 31, cy: 38, r: 1.5 }, 'dot'], ['circle', { cx: 24, cy: 44, r: 1.5 }, 'dot'], ['circle', { cx: 40, cy: 42, r: 1.5 }, 'dot'], ['path', { d: 'M32 18 L24 10 L30 14 L32 6 L34 14 L40 10 Z' }, 'leaf']]
    };
    /* 依 SHAPES 畫出一個水果（SVG 向量圖），size 是顯示大小（px） */
    function fruitSvg(id, size) {
        var s = kit.svg('svg', { 'class': 'menuslice-f menuslice-f--' + id, viewBox: '0 0 64 64', width: size, height: size });  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        (SHAPES[id] || []).forEach(function (sp) { var a = Object.assign({}, sp[1]); a['class'] = 'menuslice-' + sp[2]; kit.svg(sp[0], a, s); });  /* forEach：對陣列的每個元素各做一次 */
        return s;
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand), F = q.total;
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[切菜單上的] 第 ' + level + ' 關：菜單 ' + q.menu.map(nameOf).join('、') + '；拋 ' + F + ' 顆（菜單上的 ' + q.tosses.filter(function (t) { return t.onMenu; }).length + ' 顆），間隔約 ' + q.spawnMs + ' 毫秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'menuslice-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip = h('div', { 'class': 'qz-note menuslice-tip', text: '記住菜單，等一下只切菜單上的' });
        field.appendChild(tip);
        /* 黑板菜單 */
        var board = h('div', { 'class': 'menuslice-board' }, [h('div', { 'class': 'menuslice-board__title', text: '今日菜單' })]);  /* 黑板菜單：標題「今日菜單」加上每種水果的圖與名字（items 放那一排）；看完時間到就收起來 */
        var items = h('div', { 'class': 'menuslice-board__items' });
        q.menu.forEach(function (id) { var it = h('div', { 'class': 'menuslice-item' }); it.appendChild(fruitSvg(id, 52)); it.appendChild(h('div', { 'class': 'menuslice-item__name', text: nameOf(id) })); items.appendChild(it); });
        board.appendChild(items); field.appendChild(board);
        var counter = h('div', { 'class': 'menuslice-counter', text: '' }); field.appendChild(counter);
        var info = h('div', { 'class': 'qz-note menuslice-info', text: '' }); field.appendChild(info);
        var arena = h('div', { 'class': 'menuslice-arena' }); field.appendChild(arena);          /* 水果飛的範圍（整個畫面） */

        var phase = 'view', resolved = 0, flying = [], halted = false, lastP = null, down = false, over = false, t0 = 0;  /* phase：目前階段（view 看菜單／play 切水果／end 結束）；resolved 已處理幾顆；flying 在空中的水果；halted 畫面已停住；lastP 手指上一個位置；down 手指按著；over 這一關結束；t0 開始切的時間 */
        info.textContent = '看 ' + VIEW_S + ' 秒';        /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
        api.timer(q.viewMs, begin);                     /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        /* 看菜單的時間到：菜單收起來，開始依排好的時間拋水果（每顆用 api.after 排程） */
        function begin() {
            if (api.over) return;
            phase = 'play'; board.classList.add('menuslice-board--gone'); tip.textContent = '用手指切過水果：只切菜單上的！'; info.textContent = ''; counter.textContent = '0／' + F;  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            t0 = performance.now();                     /* performance.now()：高精度的時間（毫秒），計時用 */
            q.tosses.forEach(function (tz) { api.after(tz.t, function () { launch(tz); }); });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        }
        if (level === 1 && kit.once('menuslice.hint')) api.after(q.viewMs + LEAD_MS + 600, function () { if (!over) kit.hintOn(stage, null, { mode: 'drag', x: W * 0.3, y: H * 0.55, dx: W * 0.4, dy: -40, text: '用手指切過水果' }); });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        /* 發射一顆：建立元素，丟進 flying 清單，由迴圈每個畫格更新位置 */
        /* 拋出一顆水果：建立畫面元素放進 arena，並登記到 flying（之後每一幀由下面的 loop 更新位置） */
        function launch(tz) {
            if (halted || api.over) return;
            var el = h('div', { 'class': 'menuslice-fruit' }); el.style.width = el.style.height = FRUIT_PX + 'px';
            var sv = fruitSvg(tz.fruit, FRUIT_PX); el.appendChild(sv); arena.appendChild(el);
            flying.push({ tz: tz, el: el, t: 0, cut: false, done: false, lt: landTime(tz) });
        }
        api.my.loop(function (now, dt) {                /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (!arena.isConnected) return false;
            if (halted) return;
            var d = Math.min(dt, 50) / 1000;
            for (var i = flying.length - 1; i >= 0; i--) {
                var f = flying[i]; if (f.cut) continue;
                f.t += d;
                var p = flightPos(f.tz, f.t);
                f.px = p.x * W; f.py = p.y * H;
                f.el.style.transform = 'translate(' + (f.px - FRUIT_PX / 2).toFixed(1) + 'px,' + (f.py - FRUIT_PX / 2).toFixed(1) + 'px) rotate(' + (f.tz.spin * f.t).toFixed(1) + 'deg)';
                if (f.t >= f.lt) {                                                       /* 落地 */
                    flying.splice(i, 1); f.el.remove();
                    if (f.tz.onMenu) { missed(f); return; }
                    resolve();
                }
            }
        });
        /* 處理完一顆（切掉了菜單上的水果，或菜單外的水果安全落地）：計數加一，全部處理完就過關 */
        function resolve() {
            resolved++; counter.textContent = resolved + '／' + F;
            if (resolved >= F && !over) { over = true; phase = 'end'; info.textContent = '全部處理完了！'; kit.flash(stage, true, api.my); api.pass({ delay: 1100 }); }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
        }
        /* 手指：按下時記下位置；移動時，走過的線段碰到水果就切 */
        arena.addEventListener('pointerdown', function (e) { if (phase !== 'play' || over) return; e.preventDefault(); try { arena.setPointerCapture(e.pointerId); } catch (err) { } var p = kit.localPt(e, arena); lastP = p; down = true; sliceSeg(p, p); });  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
        arena.addEventListener('pointermove', function (e) { if (!down || phase !== 'play' || over) return; var p = kit.localPt(e, arena); sliceSeg(lastP, p); lastP = p; });  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
        /* 手指放開：結束這一次劃動 */
        function end(e) { down = false; lastP = null; }
        arena.addEventListener('pointerup', end); arena.addEventListener('pointercancel', end);
        /* 手指從 a 移到 b 這一小段：檢查有沒有切到空中的任何一顆水果（判定半徑比水果多 HIT_EXTRA px，比較好切） */
        function sliceSeg(a, b) {
            for (var i = flying.length - 1; i >= 0 && !over; i--) {
                var f = flying[i]; if (f.cut || f.px == null) continue;
                if (segHitsCircle(a.x, a.y, b.x, b.y, f.px, f.py, FRUIT_PX / 2 + HIT_EXTRA)) cut(f, i, a, b);
            }
        }
        /* 切開：兩半飛開、果汁噴出；菜單外的 → 結束 */
        /* 切開一顆水果：水果裂成兩半飛開、噴出 8 滴果汁（用 CSS 動畫）；切到菜單外的就失敗，切到菜單上的算處理完一顆 */
        function cut(f, idx, a, b) {
            f.cut = true; flying.splice(idx, 1);
            var el = f.el, ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
            [['left', -1], ['right', 1]].forEach(function (half) {
                var c = el.cloneNode(true); c.className = 'menuslice-half menuslice-half--' + half[0]; c.style.transform = el.style.transform; c.style.setProperty('--dir', half[1]); c.style.setProperty('--ang', ang + 'deg');  /* style.setProperty('--名稱', 值)：用 JS 設定 CSS 變數，CSS 裡用 var(--名稱) 取用（把算好的尺寸交給樣式） */
                arena.appendChild(c); api.after(650, function () { c.remove(); });
            });
            el.remove();
            for (var k = 0; k < 8; k++) { var j = h('div', { 'class': 'menuslice-juice menuslice-f--' + f.tz.fruit }); j.style.left = f.px + 'px'; j.style.top = f.py + 'px'; j.style.setProperty('--dx', (Math.cos(k * 0.785 + Math.random()) * (30 + Math.random() * 30)).toFixed(0) + 'px'); j.style.setProperty('--dy', (Math.sin(k * 0.785 + Math.random()) * (30 + Math.random() * 30)).toFixed(0) + 'px'); arena.appendChild(j); api.after(550, function () { j.remove(); }); }
            Sfx.play('pop');                            /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            if (!f.tz.onMenu) { wrong(f); return; }
            resolve();
        }
        /* 失敗：停住畫面，把菜單再亮出來，你切錯（漏掉）的那顆和菜單上的那顆並排 */
        /* 失敗時的對照畫面：停住畫面，把黑板菜單再亮出來，你切錯（或漏掉）的水果和菜單上對應的水果並排，並在菜單上標記出來 */
        function showMenuAgain(badId, partnerId, missedFlag) {
            halted = true; over = true; phase = 'end';
            board.classList.remove('menuslice-board--gone'); board.classList.add('menuslice-board--again'); tip.textContent = '菜單在這裡';
            var cmp = h('div', { 'class': 'menuslice-cmp' });
            /* 對照畫面裡的一小格：水果圖加上「你切了：某某」之類的文字 */
            function box(id, label, cls) { var b = h('div', { 'class': 'menuslice-cmp__box ' + (cls || '') }); b.appendChild(fruitSvg(id, 72)); b.appendChild(h('div', { 'class': 'menuslice-cmp__name', text: label + nameOf(id) })); return b; }
            if (missedFlag) cmp.appendChild(box(badId, '漏掉：', 'menuslice-cmp__box--bad'));
            else { cmp.appendChild(box(badId, '你切了：', 'menuslice-cmp__box--bad')); if (partnerId) cmp.appendChild(box(partnerId, '菜單上是：', 'menuslice-cmp__box--ok')); }
            field.appendChild(cmp);
            /* 菜單上對應的那一項標起來 */
            [].forEach.call(items.children, function (it, k) { var id = q.menu[k]; if (id === partnerId || (missedFlag && id === badId)) it.classList.add('menuslice-item--mark'); });
        }
        /* 切到菜單外的水果：顯示原因、畫對照圖、閃紅光並結束 */
        function wrong(f) {
            var id = f.tz.fruit, partner = fruitOf(id).pair && q.menu.indexOf(fruitOf(id).pair) >= 0 ? fruitOf(id).pair : null;
            info.textContent = nameOf(id) + '不在菜單上！';
            showMenuAgain(id, partner, false);
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3600, lines: ['你切了 ' + nameOf(id) + '（不在菜單上）' + (partner ? '，菜單上是 ' + nameOf(partner) : ''), '菜單：' + q.menu.map(nameOf).join('、')] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 漏掉菜單上的水果（它落地了）：顯示原因、畫對照圖、閃紅光並結束 */
        function missed(f) {
            var id = f.tz.fruit;
            info.textContent = '漏掉了' + nameOf(id) + '（在菜單上）！';
            showMenuAgain(id, null, true);
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3600, lines: ['漏掉了 ' + nameOf(id) + '（它在菜單上）', '菜單：' + q.menu.map(nameOf).join('、')] });
        }
        /* 驗證用：solve＝每顆菜單上的水果一出現就切、wrong＝切第一顆菜單外的（沒有就漏掉一顆菜單上的）；兩者都會被重複呼叫，要冪等 */
        api.solve = function () {
            if (phase !== 'play' || over) return;
            for (var i = flying.length - 1; i >= 0; i--) { var f = flying[i]; if (f.tz.onMenu && !f.cut && f.px != null) cut(f, i, { x: f.px - 20, y: f.py }, { x: f.px + 20, y: f.py }); }
        };
        api.wrong = function () {
            if (phase !== 'play' || over) return;
            for (var i = flying.length - 1; i >= 0; i--) { var f = flying[i]; if (!f.tz.onMenu && !f.cut && f.px != null) { cut(f, i, { x: f.px - 20, y: f.py }, { x: f.px + 20, y: f.py }); return; } }
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '切菜單上的',
        rule: '關卡一開始，黑板菜單會亮出今天要用的幾種水果（3 秒），然後收起來。接著水果一顆一顆拋上來，**用手指切過去，只切菜單上有的**，其他的不要切。**切錯一顆**、或**漏掉一顆菜單上的**，就結束。小心：菜單外的水果故意挑長得像的（柳丁和橘子、檸檬和萊姆、蘋果和番茄、葡萄和藍莓）。越後面，菜單種類越多、水果拋得越密！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            menuCountFor: menuCountFor, totalFor: totalFor, spawnMsFor: spawnMsFor, fruitOf: fruitOf, nameOf: nameOf, menuFor: menuFor, decoyPools: decoyPools, flightPos: flightPos, landTime: landTime, segHitsCircle: segHitsCircle, makeLevel: makeLevel, fruitSvg: fruitSvg, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, MENU_N: MENU_N, TOTAL: TOTAL, SPAWN_MS: SPAWN_MS, VIEW_S: VIEW_S, MENU_FRAC: MENU_FRAC, PARTNER_FRAC: PARTNER_FRAC, LEAD_MS: LEAD_MS, BOTTOM: BOTTOM, EXIT: EXIT, APEX: APEX, T_APEX: T_APEX, X_RANGE: X_RANGE, FRUIT_PX: FRUIT_PX, FRUITS: FRUITS, PAIRS: PAIRS, SINGLES: SINGLES, SHAPES: SHAPES, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
