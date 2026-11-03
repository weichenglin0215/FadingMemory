/* ═══════════════════════════════════════════════════════════════════
   reaction_eyebrow.js — 秒反應・畫眉毛（企劃 408）
   樣式：css/games/reaction_eyebrow.css（這款專屬的 class 一律以「eyebrow-」開頭；共用元件在 css/reaction_common.css）
   化妝台的鏡子前。一張臉，**左邊的眉毛已經畫好了**。**手指在右邊畫出另一條眉毛，要跟左邊的「鏡射對稱」**（眉峰的位置、眉尾的方向都要左右反過來）。
   手指放開，就把左邊的眉毛翻過去（鏡射）疊在右邊，算出「相似度 88.3142%」；**相似度要達到及格線（70% → 93%）才過關**。
   ───────────────────────────────────────────────────────────────────
   · 臉的座標：臉有自己的座標系（u 往右、v 往下，原點在臉的中軸上）；臉可以**微微側一點**（旋轉 θ）、**不在畫面正中間**（中心 F），
     所以對稱軸不是畫面的垂直中線，而是「臉的中軸」（看鼻子和嘴巴的位置）。臉座標 (u, v) → 畫面座標：x ＝ Fx ＋ u·cosθ − v·sinθ；y ＝ Fy ＋ u·sinθ ＋ v·cosθ。
     左邊的眉毛是臉座標裡 u < 0 的一串點；它的鏡射就是把每個點的 u 變成 −u（v 不變）。
   · 相似度（similarity）：兩條曲線都先照弧長取 N 個等距的點（resample）；
       D ＝ 「A 的每個點到 B 最近的距離的平均」和「B 的每個點到 A 最近的距離的平均」，兩個方向再取平均（chamfer 距離，方向、起點終點都沒關係）；
       相似度 ＝ 100 × max(0, 1 − D ÷ (SIM_K × L))，L 是參考眉毛的長度。完全重合＝100%；平均偏 0.05 倍的眉毛長度（約 6px）大約是 90%。
   · 眉毛的形狀（browShape）：彎月眉（moon）、一字眉（flat）、拱形眉（arch）、挑眉（raise，有尖角）、波浪眉（wave，兩個起伏）五種規律的形狀，
     加上 V1.36.0 的四種**奇怪形狀**（玩家意見：眉毛形狀太規律、失去樂趣）：隨機曲線眉（odd，5 個控制點的平滑曲線，忽高忽低）、鋸齒眉（zigzag，幾個尖角折來折去）、
     鉤子眉（hook，眉尾往下勾或往上翹）、雙峰眉（twin，兩座山中間一個凹）。第 WEIRD_FROM 關起，奇怪形狀的機率從 WEIRD_P[0] 線性升到 WEIRD_P[1]。
     每個形狀都是「u 一路往外」的函數（不會折回來），所以手指從內端一筆畫到眉尾就畫得出來；高度夾在眉毛該在的範圍（不會碰到眼睛）。
   · V1.38.0（玩家意見：眉毛形狀變化不夠大）：眉毛加大（BROW_LEN 100 → 140 px，眉尾超出臉的輪廓一點點）、高度範圍放寬到可以高過頭頂（BROW_TOP −190）、
     各種形狀的起伏加大，並新增三種**會打圈的創意眉毛**（LOOPY）：彈簧眉（spring，一圈一圈的線圈）、迴紋針眉（clip，扁長的螺旋）、漩渦眉（swirl，一條線接一個螺旋）。
     打圈的線會折回來（不是「u 一路往外」），玩家一筆畫出來；相似度的 chamfer 距離不在乎方向與起點，所以照樣算得出來。
     眉毛太大、臉又歪又偏的時候可能超出畫面：臉心的偏移範圍會自動縮小（shiftLimit），整條眉毛（連同鏡射的那一條）一定留在畫面裡。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：及格線 70% → 93%；臉歪的角度 0 → ±10°（第 5 關起）；臉偏離正中間 0 → ±40px；眉毛的形狀種類越來越多。
   · 畫的時候看得到自己的線（棕色眉筆）；手指放開才判定；太短（還沒畫完就放開）不算，可以重畫。
   · 揭曉：翻過去的眉毛用淡紅色疊在你畫的上面，寫出「相似度 88.3142%（及格線 83.0000%）」。
     V1.36.0：揭曉時**整張臉（連同你畫的線）會繞著臉心轉回正的**（歪的角度變 0，TURN_MS 毫秒），並淡淡地畫出臉的中軸，對稱的差異一眼就看得出來。
     V1.38.0（玩家意見：評審動畫要先轉正，再顯示紅色的正確眉毛）：順序改成 ① 臉先轉正（TURN_MS）→ ② 停一下（REVEAL_GAP_MS）→ ③ 紅色的正確眉毛淡入（GHOST_MS）→ ④ 才顯示相似度與結算；
     以前是轉的同時就畫出紅色眉毛，看不出「對稱」是怎麼來的。
   · V1.40.0（玩家意見：只有畫眉毛很容易單調）：**增加畫鬍子**。從第 STACHE_FROM 關起，每關有 STACHE_P 的機率不是眉毛，而是鼻子下面、嘴巴上面的**一撇鬍子**
     （臉的左半邊那撇已經畫好，玩家畫右半邊的鏡射，玩法、相似度、揭曉動畫都跟眉毛一樣）。鬍子有各種創意形狀（stacheShape）：
     規律的四種——鉛筆鬍（pencil，細細一條）、海象鬍（walrus，往下垂）、八字翹鬍（handlebar，先垂下再往上翹）、長八字鬍（fumanchu，先橫再往下垂）；
     奇怪的九種——波浪鬍（wave）、梳子鬍（comb，七八根小尖齒）、閃電鬍（zigzag）、雙峰鬍（twin，兩座山或兩個坑）、扇貝鬍（scallop，一個個弧形）、階梯鬍（stairs），
     加上會打圈的彈簧鬍（spring）、迴紋針鬍（clip）、漩渦鬍（swirl）。奇怪形狀的機率跟眉毛一樣用 weirdPFor。鬍子的線條畫得比眉毛粗一點。
     眉毛與鬍子的差別只在「幾何」（geo：長度、內端離中軸多遠、高度範圍、基準高度）與形狀函式，其餘（makeLevel 的重抽、shiftLimit、similarity）共用。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'eyebrow'：選單、成績、存檔都靠它；樣式在 css/games/reaction_eyebrow.css，裡面的 class 名稱一律以 eyebrow- 開頭。 */
    'use strict';

    var ID = 'eyebrow';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var THRESH = [60, 90];                      /* 及格線（相似度 %）：第 1 關 → 到頂（使用者企劃原本是 70% → 93%，目前程式裡是 60% → 90%） */
    var TILT_DEG = [2, 180];                     /* 臉歪的角度上限（度）：第 1 關 → 到頂（但要到第 TILT_FROM 關才開始歪） */
    var TILT_FROM = 2;                          /* 第幾關起臉會歪 */
    var SHIFT_PX = [8, 80];                     /* 臉偏離正中間的最大距離（px）：第 1 關 → 到頂（但要到第 TILT_FROM 關才開始偏） */
    var BROW_LEN = 140;                         /* 眉毛的長度（px，臉座標裡沿著 u 方向的長度）（原本 100，V1.38.0 加大，眉尾超出臉的輪廓） */
    var BROW_PTS = 72;                          /* 一條眉毛取幾個點（打圈的線要夠細才圓） */
    var L_CAP = 1.3;                            /* 相似度的寬容度用的「眉毛長度」最多算 BROW_LEN 的幾倍（打圈、鋸齒的線很長，不封頂的話容許誤差會大到亂畫也過關） */
    var BROW_GAP = 30;                          /* 眉毛的內端離中軸多遠（px） */
    var BROW_V = -66;                           /* 眉毛大約在臉中心上方多少 px（v 是往下為正，所以是負的） */
    var SIM_K = 0.5;                            /* 相似度的寬容度：平均偏差達到 SIM_K × 眉毛長度就是 0% */
    var N_RES = 48;                             /* 比對時每條曲線取幾個點 */
    var MIN_PTS = 8;                            /* 至少要畫幾個點才算一筆 */
    var MIN_LEN_FRAC = 0.4;                     /* 畫的長度至少要有眉毛長度的幾成才算一筆（太短是誤觸，不判定） */
    var SOLVE_JITTER = 1.2;                     /* 驗證用：api.solve 畫的線和標準答案的誤差（px） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var BASE_TYPES = ['moon', 'flat', 'arch', 'raise', 'wave'];     /* 規律的眉毛形狀種類（越後面越多種可能） */
    var LOOPY = ['spring', 'clip', 'swirl'];                        /* 會打圈的創意眉毛（V1.38.0）：彈簧、迴紋針、漩渦 */
    var WEIRD = ['odd', 'zigzag', 'hook', 'twin'].concat(LOOPY);    /* 奇怪的眉毛形狀（V1.36.0 四種，V1.38.0 再加三種會打圈的） */
    var TYPES = BASE_TYPES.concat(WEIRD);           /* 眉毛的形狀種類（一般形狀＋怪形狀） */
    var STACHE_BASE = ['pencil', 'walrus', 'handlebar', 'fumanchu'];                                         /* 規律的鬍子：鉛筆、海象、八字翹、長八字 */
    var STACHE_WEIRD = ['wave', 'comb', 'zigzag', 'twin', 'scallop', 'stairs'].concat(LOOPY);                /* 奇怪的鬍子：波浪、梳子、閃電、雙峰、扇貝、階梯，加上會打圈的三種 */
    var STACHE_TYPES = STACHE_BASE.concat(STACHE_WEIRD);  /* 鬍子的形狀種類（一般形狀＋怪形狀） */
    var WEIRD_FROM = 2;                         /* 第幾關起會出現奇怪形狀的眉毛 */
    var WEIRD_P = [0.35, 0.9];                  /* 奇怪形狀的機率：第 WEIRD_FROM 關 → 到頂 */
    var BROW_TOP = -190, BROW_BOTTOM = -46;     /* 眉毛的高度（臉座標 v）夾在這個範圍：可以高過頭頂（頭頂在 v ＝ −180），但不碰眼睛（眼睛最上緣在 v ＝ −35）（原本 −126，V1.38.0 放寬） */
    var TURN_MS = 900;                          /* 揭曉時，整張臉轉回正的要多久（毫秒） */
    var REVEAL_GAP_MS = 350;                    /* 轉正之後停一下，才畫出紅色的正確眉毛（V1.38.0） */
    var GHOST_MS = 600;                         /* 紅色的正確眉毛淡入要多久（毫秒；css/games/reaction_eyebrow.css 的 .eyebrow-ghost 也是這個值） */
    var EDGE = 8;                               /* 整條眉毛（含鏡射的）離畫面邊緣至少幾 px */
    /* V1.40.0 鬍子：臉座標裡，鬍子在鼻子下面（鼻頭 v≈62）、嘴巴上面（嘴角 v＝100），可以垂到嘴巴下面；頭的半寬在這個高度大約 130（STACHE_GAP + STACHE_LEN 要小於它） */
    var STACHE_FROM = 2;                        /* 第幾關起可能出現鬍子（第 1 關一定是眉毛，先學會玩法） */
    var STACHE_P = [0.4, 0.5];                  /* 一關是畫鬍子（不是眉毛）的機率：第 STACHE_FROM 關 → 到頂 */
    var STACHE_LEN = 112, STACHE_GAP = 5;       /* 鬍子的長度（px，臉座標 u 方向）、內端離中軸多遠 */
    var STACHE_V = 84;                          /* 鬍子大約在臉中心下方多少 px（v 往下為正） */
    var STACHE_TOP = 40, STACHE_BOTTOM = 160;   /* 鬍子的高度（臉座標 v）夾在這個範圍：不跑到眼睛上面、最低垂到下巴附近（下巴在 v＝196） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function threshFor(level) { return Math.round(ramp(level, THRESH) * 10000) / 10000; }  /* Math.round：四捨五入成整數 */
    function tiltFor(level) { return level < TILT_FROM ? 0 : Math.round(ramp(level, TILT_DEG) * 100) / 100; }
    function shiftFor(level) { return level < TILT_FROM ? 0 : Math.round(ramp(level, SHIFT_PX) * 10) / 10; }
    function typesFor(level) { return BASE_TYPES.slice(0, Math.min(BASE_TYPES.length, 2 + Math.floor(level / 4))); }  /* Math.floor：無條件捨去成整數 */
    function weirdPFor(level) { return level < WEIRD_FROM ? 0 : Math.round(ramp(level, WEIRD_P) * 10000) / 10000; }
    /* 這一關是畫鬍子的機率（第 STACHE_FROM 關之前是 0，第 1 關一定是眉毛） */
    function stachePFor(level) { return level < STACHE_FROM ? 0 : Math.round(ramp(level, STACHE_P) * 10000) / 10000; }
    /* 眉毛與鬍子的「幾何」：gap 內端離中軸、len 長度、top／bottom 高度範圍（臉座標 v）、v 基準高度；打圈的形狀（loopShape）照這組算 */
    var BROW_GEO = { gap: BROW_GAP, len: BROW_LEN, top: BROW_TOP, bottom: BROW_BOTTOM, v: BROW_V };
    var STACHE_GEO = { gap: STACHE_GAP, len: STACHE_LEN, top: STACHE_TOP, bottom: STACHE_BOTTOM, v: STACHE_V };
    /* 奇怪形狀要用的隨機參數（makeLevel 挑好、存在 par 裡，browShape 才是純函式）：回傳要併進 par 的欄位 */
    function weirdPar(type, rand) {
        var i, k;
        if (type === 'odd') { var cp = []; for (i = 0; i < 5; i++) cp.push(Math.round(kit.randFloat(-0.42, 0.3, rand) * 1000) / 1000); return { cp: cp }; }  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        if (type === 'zigzag') {
            var m = kit.randInt(3, 5, rand), zt = [0], zv = [kit.randFloat(-0.05, 0.12, rand)];  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            for (k = 1; k < m; k++) { zt.push(k / m + kit.randFloat(-0.06, 0.06, rand)); zv.push((k % 2 ? -1 : 1) * kit.randFloat(0.12, 0.34, rand) - 0.04); }
            zt.push(1); zv.push(kit.randFloat(-0.2, 0.2, rand));
            return { zt: zt.map(function (x) { return Math.round(x * 1000) / 1000; }), zv: zv.map(function (x) { return Math.round(x * 1000) / 1000; }) };  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        }
        if (type === 'hook') return { hs: kit.randFloat(0.5, 0.75, rand), hk: (rand() < 0.65 ? 1 : -1) * kit.randFloat(0.24, 0.46, rand), hh: kit.randFloat(0.12, 0.28, rand) };
        if (type === 'spring') return { loops: kit.randInt(3, 4, rand), r: kit.randFloat(0.085, 0.12, rand), vc: kit.randFloat(-108, -88, rand) };
        if (type === 'clip') return { turns: kit.randFloat(1.4, 1.9, rand), ay: kit.randFloat(0.13, 0.18, rand), phi0: kit.randFloat(0, 2 * Math.PI, rand), vc: kit.randFloat(-112, -92, rand) };
        if (type === 'swirl') return { sr: kit.randFloat(0.19, 0.25, rand), turns: kit.randFloat(1.6, 2.2, rand), dir: rand() < 0.5 ? 1 : -1, vc: kit.randFloat(-112, -92, rand) };
        return { c1: kit.randFloat(0.18, 0.34, rand), c2: kit.randFloat(0.66, 0.82, rand), w: kit.randFloat(0.1, 0.16, rand), h1: kit.randFloat(0.12, 0.34, rand), h2: kit.randFloat(0.12, 0.34, rand) };
    }
    /* Catmull-Rom 平滑曲線：通過控制點陣列 p（等間隔），t 在 0～1，回傳那一點的值 */
    function catmull(p, t) {
        var f = Math.min(p.length - 1 - 1e-9, Math.max(0, t * (p.length - 1))), i = Math.floor(f), s = f - i;
        var p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
        return 0.5 * ((2 * p1) + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s * s * s);
    }
    /* 折線插值：節點 (xs[i], ys[i])，x 由小到大 */
    function piecewise(xs, ys, x) {
        for (var i = 1; i < xs.length; i++) if (x <= xs[i]) { var d = xs[i] - xs[i - 1]; return d <= 0 ? ys[i] : ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / d; }
        return ys[ys.length - 1];
    }
    /* 一條折線的長度 */
    function pathLength(p) { var s = 0; for (var i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return s; }
    /* 照弧長把折線取成 n 個等距的點（含頭尾）；只有一個點或長度 0 時全部都是那個點 */
    function resample(p, n) {
        var L = pathLength(p), out = [];
        if (p.length === 0) return out;
        if (L === 0) { for (var k = 0; k < n; k++) out.push({ x: p[0].x, y: p[0].y }); return out; }
        var step = L / (n - 1), acc = 0, seg = 0, i;
        out.push({ x: p[0].x, y: p[0].y });
        for (i = 1; i < n - 1; i++) {
            var target = step * i;
            while (seg < p.length - 2 && acc + Math.hypot(p[seg + 1].x - p[seg].x, p[seg + 1].y - p[seg].y) < target) { acc += Math.hypot(p[seg + 1].x - p[seg].x, p[seg + 1].y - p[seg].y); seg++; }
            var dl = Math.hypot(p[seg + 1].x - p[seg].x, p[seg + 1].y - p[seg].y), f = dl === 0 ? 0 : (target - acc) / dl;
            out.push({ x: p[seg].x + (p[seg + 1].x - p[seg].x) * f, y: p[seg].y + (p[seg + 1].y - p[seg].y) * f });
        }
        out.push({ x: p[p.length - 1].x, y: p[p.length - 1].y });
        return out;
    }
    /* 點 q 到折線（線段們）的最近距離 */
    function distToPath(q, p) {
        var best = 1e18;
        if (p.length === 1) return Math.hypot(q.x - p[0].x, q.y - p[0].y);
        for (var i = 1; i < p.length; i++) {
            var ax = p[i - 1].x, ay = p[i - 1].y, bx = p[i].x, by = p[i].y, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, s = L2 > 0 ? Math.max(0, Math.min(1, ((q.x - ax) * dx + (q.y - ay) * dy) / L2)) : 0;
            var d = Math.hypot(q.x - (ax + s * dx), q.y - (ay + s * dy)); if (d < best) best = d;
        }
        return best;
    }
    /* chamfer 距離：A 的每個點到 B 的平均最近距離、B 的每個點到 A 的平均最近距離，兩個方向取平均 */
    function chamfer(A, B) {
        var ra = resample(A, N_RES), rb = resample(B, N_RES), s1 = 0, s2 = 0, i;
        for (i = 0; i < ra.length; i++) s1 += distToPath(ra[i], B);
        for (i = 0; i < rb.length; i++) s2 += distToPath(rb[i], A);
        return (s1 / ra.length + s2 / rb.length) / 2;
    }
    /* 相似度（%）：A 和 B 兩條曲線，L ＝ 參考眉毛的長度 */
    function similarity(A, B, L) { return Math.round(100 * Math.max(0, 1 - chamfer(A, B) / (SIM_K * L)) * 10000) / 10000; }
    /* 臉座標 (u, v) → 畫面座標：臉心 F、歪了 theta 弧度 */
    function toScreen(pt, F, theta) { var c = Math.cos(theta), s = Math.sin(theta); return { x: F.x + pt.u * c - pt.v * s, y: F.y + pt.u * s + pt.v * c }; }
    /* 左邊眉毛（臉座標，u < 0）的鏡射（臉座標）：u 變 −u */
    function mirrorLocal(p) { return p.map(function (q) { return { u: -q.u, v: q.v }; }); }
    /* 會打圈的眉毛（臉座標，一筆畫的曲線，n 個點）：線會折回來，所以 u 不是一路往外。
         彈簧 spring：prolate trochoid（x ＝ t·L − A·sin θ、y ＝ −A·cos θ，A·2π·圈數 > L 時就會打圈），像一圈一圈的線圈；
         迴紋針 clip：扁長（超橢圓、指數 3）的螺旋往裡繞 turns 圈、半徑縮到一半，像迴紋針的線；
         漩渦 swirl：先從內端拉一小段直線，接一個阿基米德螺旋（半徑 sr × BROW_LEN）往裡繞 turns 圈。
       高度一樣夾在 BROW_TOP～BROW_BOTTOM。 */
    function loopShape(type, par, n, geo) {
        geo = geo || BROW_GEO;                  /* 不給就是眉毛的幾何；鬍子傳 STACHE_GEO（V1.40.0） */
        var out = [], i, t, u, v, vc = par.vc != null ? par.vc : geo.v - 30, L = geo.len, G = geo.gap;
        function put(uu, vv) { out.push({ u: Math.round(Math.min(-4, uu) * 10) / 10, v: Math.round(Math.max(geo.top, Math.min(geo.bottom, vv)) * 10) / 10 }); }
        for (i = 0; i < n; i++) {
            t = i / (n - 1);
            if (type === 'spring') {
                var A = (par.r || 0.1) * L, th = 2 * Math.PI * (par.loops || 3) * t;
                u = -(G + t * L - A * Math.sin(th)); v = vc - A * Math.cos(th) + (par.slope || 0) * L * t * 0.5;
            } else if (type === 'clip') {
                var phi = (par.phi0 || 0) + 2 * Math.PI * (par.turns || 1.6) * t, rho = 1 - 0.5 * t, c = Math.cos(phi), s = Math.sin(phi);
                var ex = (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / 3), ey = (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 2 / 3);  /* Math.abs：取絕對值（去掉負號） */
                u = -(G + L / 2) + rho * (L / 2) * 0.96 * ex; v = vc + rho * (par.ay || 0.15) * L * ey;
            } else {
                var rr = (par.sr || 0.22) * L, cuS = -(G + L - rr), tail = 0.3;
                if (t < tail) { var f = t / tail; u = -G + (cuS + rr + G) * f; v = vc; }
                else {
                    var q = (t - tail) / (1 - tail), ang = (par.dir || 1) * 2 * Math.PI * (par.turns || 1.8) * q, rad = rr * (1 - 0.85 * q);
                    u = cuS + rad * Math.cos(ang); v = vc + rad * Math.sin(ang);
                }
            }
            put(u, v);
        }
        return out;
    }
    /* 一條眉毛（臉座標）：從內端（靠近中軸）到外端（眉尾），n 個點；形狀 type */
    function browShape(type, par, n) {
        if (LOOPY.indexOf(type) >= 0) return loopShape(type, par, n);  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
        var out = [];
        for (var i = 0; i < n; i++) {
            var t = i / (n - 1), u = -(BROW_GAP + BROW_LEN * t), v;
            if (type === 'flat') v = BROW_V + par.slope * BROW_LEN * t;
            else if (type === 'moon') v = BROW_V - par.h * BROW_LEN * Math.sin(Math.PI * t) + par.slope * BROW_LEN * t;
            else if (type === 'arch') { var p = par.peak; v = t <= p ? BROW_V - par.h * BROW_LEN * Math.pow(t / p, 1.3) : BROW_V - par.h * BROW_LEN * (1 - Math.pow((t - p) / (1 - p), 1.4) * (1 + par.drop)); }
            else if (type === 'raise') { var pk = par.peak; v = t <= pk ? BROW_V - par.h * BROW_LEN * (t / pk) : BROW_V - par.h * BROW_LEN * (1 - (t - pk) / (1 - pk) * 1.5); }
            else if (type === 'odd') { var cp = par.cp || [0, par.h, -par.h, par.slope, 0]; v = BROW_V + catmull(cp, t) * BROW_LEN; }                                  /* 隨機曲線：忽高忽低的平滑曲線 */
            else if (type === 'zigzag') { var zt = par.zt || [0, 0.35, 0.65, 1], zv = par.zv || [0, -par.h, par.h * 0.5, -par.h]; v = BROW_V + piecewise(zt, zv, t) * BROW_LEN; }       /* 鋸齒：幾個尖角 */
            else if (type === 'hook') { var hs = par.hs || par.peak, hk = par.hk == null ? par.drop : par.hk, hh = par.hh || par.h; v = t <= hs ? BROW_V - hh * BROW_LEN * Math.pow(t / hs, 0.9) : BROW_V - hh * BROW_LEN + hk * BROW_LEN * Math.pow((t - hs) / (1 - hs), 1.6); }   /* 鉤子：眉尾往下勾（hk > 0）或往上翹 */
            else if (type === 'twin') { var c1 = par.c1 || 0.25, c2 = par.c2 || 0.75, w = par.w || 0.12, h1 = par.h1 || par.h, h2 = par.h2 || par.h; v = BROW_V - BROW_LEN * (h1 * Math.exp(-Math.pow((t - c1) / w, 2)) + h2 * Math.exp(-Math.pow((t - c2) / w, 2))) + par.slope * BROW_LEN * t; }   /* 雙峰：兩座山中間一個凹 */
            else v = BROW_V - par.h * BROW_LEN * Math.sin(2 * Math.PI * t * par.waves) * 0.6 + par.slope * BROW_LEN * t;         /* wave */
            v = Math.max(BROW_TOP, Math.min(BROW_BOTTOM, v));
            out.push({ u: Math.round(u * 10) / 10, v: Math.round(v * 10) / 10 });
        }
        return out;
    }
    /* 鬍子要用的隨機參數（makeLevel 挑好、存在 par 裡，stacheShape 才是純函式）：回傳要併進 par 的欄位 */
    function stachePar(type, rand) {
        if (LOOPY.indexOf(type) >= 0) {
            var lp = weirdPar(type, rand); lp.vc = kit.randFloat(STACHE_V - 6, STACHE_V + 10, rand);
            if (type === 'swirl') { lp.sr = kit.randFloat(0.27, 0.34, rand); lp.turns = kit.randFloat(1.8, 2.4, rand); }       /* 螺旋大一點，不然一條直線就過關了 */
            return lp;
        }
        if (type === 'pencil') return { sl: kit.randFloat(-0.05, 0.09, rand), bend: kit.randFloat(-0.07, 0.07, rand) };
        if (type === 'walrus') return { hump: kit.randFloat(0.05, 0.13, rand), sag: kit.randFloat(0.2, 0.42, rand) };
        if (type === 'handlebar') return { dip: kit.randFloat(0.17, 0.28, rand), up: kit.randFloat(0.2, 0.33, rand) };
        if (type === 'fumanchu') return { reach: kit.randFloat(0.5, 0.72, rand), sag2: kit.randFloat(0.42, 0.62, rand) };
        if (type === 'wave') return { amp: kit.randFloat(0.16, 0.26, rand), waves: kit.pick([1.5, 2, 2.5, 3], rand) };  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        if (type === 'comb') return { teeth: kit.randInt(5, 6, rand), amp: kit.randFloat(0.15, 0.23, rand), tilt: kit.randFloat(-0.05, 0.08, rand) };
        if (type === 'zigzag') return weirdPar('zigzag', rand);
        if (type === 'twin') { var tw = weirdPar('twin', rand); tw.sgn = rand() < 0.5 ? 1 : -1; return tw; }
        if (type === 'scallop') return { k: kit.randInt(2, 4, rand), amp: kit.randFloat(0.14, 0.24, rand), tilt: kit.randFloat(-0.04, 0.06, rand) };
        return { steps: kit.randInt(2, 3, rand), dh: (rand() < 0.5 ? 1 : -1) * kit.randFloat(0.24, 0.34, rand) };       /* stairs：階梯往上爬再往下走（dh > 0）或往下走再往上爬 */
    }
    /* 一撇鬍子（臉座標）：從內端（靠近中軸、鼻子下面）到外端，n 個點；形狀 type（STACHE_TYPES）。除了會打圈的三種，u 都是一路往外，
       最後一點的 u ＝ −(STACHE_GAP + STACHE_LEN)（長八字鬍例外：它往下垂，外端只到 reach + 0.12 倍長度，才不會垂到臉頰外面）；高度夾在 STACHE_TOP～STACHE_BOTTOM */
    function stacheShape(type, par, n) {
        if (LOOPY.indexOf(type) >= 0) return loopShape(type, par, n, STACHE_GEO);
        var out = [], L = STACHE_LEN, G = STACHE_GAP, V0 = STACHE_V, i, t, u, v, tri = function (x) { return Math.abs((((x % 1) + 1) % 1) * 2 - 1) * 2 - 1; };
        for (i = 0; i < n; i++) {
            t = i / (n - 1); u = -(G + L * t);
            if (type === 'pencil') v = V0 + (par.sl || 0) * L * t + (par.bend || 0) * L * Math.sin(Math.PI * t);                                                    /* 鉛筆鬍：細細一條，微彎 */
            else if (type === 'walrus') v = V0 - (par.hump || 0.08) * L * Math.sin(Math.PI * Math.min(1, t / 0.5)) + (par.sag || 0.35) * L * Math.pow(t, 1.8);       /* 海象鬍：中間隆起，往外越垂越低 */
            else if (type === 'handlebar') v = V0 + (par.dip || 0.22) * L * Math.sin(Math.PI * Math.min(1, t / 0.85)) - (par.up || 0.26) * L * Math.pow(Math.max(0, (t - 0.6) / 0.4), 2.2);   /* 八字翹鬍：先垂下再往上翹 */
            else if (type === 'fumanchu') {                                                                                                                         /* 長八字鬍：先橫著長，再往下垂 */
                var reach = par.reach || 0.6, sag2 = par.sag2 || 0.5, a = 0.4;
                if (t < a) { var f = t / a; u = -(G + reach * L * f); v = V0 + 0.05 * L * f; }
                else { var s = (t - a) / (1 - a); u = -(G + reach * L + 0.12 * L * Math.pow(s, 0.6)); v = V0 + 0.05 * L + (sag2 - 0.05) * L * Math.pow(s, 0.9); }
            }
            else if (type === 'wave') v = V0 + (par.amp || 0.13) * L * Math.sin(2 * Math.PI * (par.waves || 2) * t);                                                 /* 波浪鬍 */
            else if (type === 'comb') v = V0 + (par.amp || 0.13) * L * tri(t * (par.teeth || 8)) + (par.tilt || 0) * L * t;                                        /* 梳子鬍：很多小尖齒 */
            else if (type === 'zigzag') { var zt = par.zt || [0, 0.35, 0.65, 1], zv = par.zv || [0, -0.2, 0.1, -0.2]; v = V0 + piecewise(zt, zv, t) * L; }          /* 閃電鬍：幾個大尖角 */
            else if (type === 'twin') { var c1 = par.c1 || 0.25, c2 = par.c2 || 0.75, w = par.w || 0.12, h1 = par.h1 || 0.2, h2 = par.h2 || 0.2; v = V0 - (par.sgn || 1) * L * (h1 * Math.exp(-Math.pow((t - c1) / w, 2)) + h2 * Math.exp(-Math.pow((t - c2) / w, 2))); }   /* 雙峰鬍：兩座山（或兩個坑） */
            else if (type === 'scallop') v = V0 + (par.amp || 0.18) * L * Math.abs(Math.sin(Math.PI * (par.k || 3) * t)) + (par.tilt || 0) * L * t;                 /* 扇貝鬍：一個個往下垂的弧，弧與弧之間是尖角 */
            else {                                                                                                                                                    /* 階梯鬍：一階一階往上爬到中間，再一階一階走下來（像金字塔；dh < 0 就是倒過來的坑） */
                var k = par.steps || 3, x = 1 - Math.abs(2 * t - 1) /* 0 → 1 → 0 */, sx = x * k, fr = sx - Math.floor(sx), q = (Math.floor(sx) + Math.max(0, Math.min(1, (fr - 0.6) / 0.4))) / k;
                v = V0 - (par.dh || 0.3) * L * Math.min(1, q);
            }
            out.push({ u: Math.round(u * 10) / 10, v: Math.round(Math.max(STACHE_TOP, Math.min(STACHE_BOTTOM, v)) * 10) / 10 });
        }
        return out;
    }
    /* 出一關：{ level, type, par, brow（左眉，臉座標 24 點）, mirror（鏡射後的右眉，臉座標）, F（臉心，畫面座標）, thetaDeg, theta, thresh, len（參考眉毛長度）, L（畫面上的長度）, ref（左眉，畫面座標）, target（鏡射右眉，畫面座標）} */
    /* 臉心離臉最遠的眉毛點有多遠（臉座標的距離）：臉歪多少度它都不變，所以拿它就能算「臉偏到哪裡還放得下」 */
    function browRadius(brow) { var m = 0; brow.forEach(function (p) { m = Math.max(m, Math.hypot(p.u, p.v)); }); return m; }  /* forEach：對陣列的每個元素各做一次 */
    /* 這個半徑的眉毛，臉心最多可以左右偏多少（整條眉毛含鏡射的都留在畫面裡）；放不下回傳 −1 */
    function shiftLimit(radius, W) { return W / 2 - EDGE - radius; }
    /* 出題函式：依關卡難度與亂數產生這一關的資料（純函式，不碰畫面，單元測試直接測它） */
    function makeLevel(level, rand, W, H) {
        rand = rand || Math.random; W = W || 472; H = H || 640;
        var type, par, weird, brow, tries = 0;
        /* V1.40.0：這一關畫眉毛還是畫鬍子（第 1 關不抽籤，一定是眉毛，所以前面的亂數序列跟舊版一樣） */
        var kind = level >= STACHE_FROM && rand() < stachePFor(level) ? 'stache' : 'brow', geo = kind === 'stache' ? STACHE_GEO : BROW_GEO;
        /* 重抽到「整條線放得進畫面」為止（太大、形狀奇怪的時候偶爾放不下）；實在抽不到（不會發生）就用最小的彎月眉（鬍子用鉛筆鬍） */
        do {
            weird = rand() < weirdPFor(level);
            type = kind === 'stache' ? kit.pick(weird ? STACHE_WEIRD : STACHE_BASE, rand) : (weird ? kit.pick(WEIRD, rand) : kit.pick(typesFor(level), rand));
            par = { h: kit.randFloat(0.1, 0.3, rand), slope: kit.randFloat(-0.1, 0.12, rand), peak: kit.randFloat(0.4, 0.72, rand), drop: kit.randFloat(0, 0.6, rand), waves: rand() < 0.5 ? 1 : 1.5 };
            if (kind === 'stache') { var sp = stachePar(type, rand); Object.keys(sp).forEach(function (key) { par[key] = sp[key]; }); brow = stacheShape(type, par, BROW_PTS); continue; }
            if (type === 'flat') par.slope = kit.randFloat(-0.06, 0.08, rand);
            if (type === 'raise') par.h = kit.randFloat(0.12, 0.3, rand);
            if (weird) { var wp = weirdPar(type, rand); Object.keys(wp).forEach(function (key) { par[key] = wp[key]; }); }
            brow = browShape(type, par, BROW_PTS);
        } while (shiftLimit(browRadius(brow), W) < 0 && ++tries < 60);
        if (shiftLimit(browRadius(brow), W) < 0) {
            weird = false;
            if (kind === 'stache') { type = 'pencil'; par = { sl: 0, bend: 0 }; brow = stacheShape(type, par, BROW_PTS); }
            else { type = 'moon'; par = { h: 0.15, slope: 0, peak: 0.5, drop: 0, waves: 1 }; brow = browShape(type, par, BROW_PTS); }
        }
        var mirror = mirrorLocal(brow);
        var tilt = tiltFor(level), thetaDeg = tilt === 0 ? 0 : (rand() < 0.5 ? -1 : 1) * kit.randFloat(tilt * 0.5, tilt, rand);
        var shift = Math.min(shiftFor(level), Math.max(0, shiftLimit(browRadius(brow), W))), dx = shift === 0 ? 0 : kit.randFloat(-shift, shift, rand);
        var F = { x: Math.round((W / 2 + dx) * 10) / 10, y: Math.round(H * 0.46) }, theta = thetaDeg * Math.PI / 180;
        var ref = brow.map(function (q) { return toScreen(q, F, theta); }), target = mirror.map(function (q) { return toScreen(q, F, theta); });
        return { level: level, kind: kind, type: type, par: par, brow: brow, mirror: mirror, F: F, thetaDeg: Math.round(thetaDeg * 100) / 100, theta: theta, thresh: threshFor(level), len: geo.len, L: Math.min(pathLength(ref), L_CAP * geo.len), pathLen: pathLength(ref), ref: ref, target: target };
    }
    function fmt4(v) { return v.toFixed(4); }
    function whyText(sim, thresh) { return sim >= thresh ? '相似度 ' + fmt4(sim) + '%（及格線 ' + fmt4(thresh) + '%）——過關！' : '相似度 ' + fmt4(sim) + '%，沒達到及格線 ' + fmt4(thresh) + '%'; }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 15) return '化妝大師！';
        if (n >= 9) return '手很穩！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '眉峰、眉尾都要反過來！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'eyebrow-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function pts2d(p) { return p.map(function (q) { return q.x.toFixed(1) + ',' + q.y.toFixed(1); }).join(' '); }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var q = makeLevel(level, api.rand, W, H);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        var noun = q.kind === 'stache' ? '鬍子' : '眉毛', sc = q.kind === 'stache' ? ' eyebrow-ref--stache' : '';                      /* 鬍子的線條畫粗一點（css 的 --stache 版本） */
        console.log('[畫眉毛] 第 ' + level + ' 關：' + q.type + (q.kind === 'stache' ? '鬍（左邊那撇長 ' : '眉（左眉長 ') + q.L.toFixed(0) + ' px）；臉心 (' + q.F.x + ', ' + q.F.y + ')、歪 ' + q.thetaDeg + '°；及格線 ' + q.thresh + '%');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var field = h('div', { 'class': 'eyebrow-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip = h('div', { 'class': 'qz-note eyebrow-tip', text: level === 1 ? '照左邊的眉毛，在右邊畫一條左右對稱的！' : '畫出和左邊對稱的右邊' + noun + '（及格線 ' + q.thresh.toFixed(0) + '%）' });
        field.appendChild(tip);
        var svg = kit.svg('svg', { 'class': 'eyebrow-svg', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H }, field);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        /* 臉：整個臉（頭、鼻、嘴、眼睛）畫在臉座標裡，用 transform 轉歪、移位 */
        var turn = kit.svg('g', { 'class': 'eyebrow-turn' }, svg);                     /* 揭曉時整組繞著臉心轉回正的：臉、你畫的線、淡紅色的線都放在裡面 */
        turn.style.transformOrigin = q.F.x + 'px ' + q.F.y + 'px'; turn.style.transitionDuration = TURN_MS + 'ms';
        var face = kit.svg('g', { transform: 'translate(' + q.F.x + ',' + q.F.y + ') rotate(' + q.thetaDeg + ')' }, turn);
        kit.svg('ellipse', { 'class': 'eyebrow-head', cx: 0, cy: 8, rx: 150, ry: 188 }, face);
        kit.svg('ellipse', { 'class': 'eyebrow-ear', cx: -152, cy: 10, rx: 14, ry: 34 }, face); kit.svg('ellipse', { 'class': 'eyebrow-ear', cx: 152, cy: 10, rx: 14, ry: 34 }, face);
        [-1, 1].forEach(function (sg) { kit.svg('ellipse', { 'class': 'eyebrow-eye', cx: sg * 62, cy: -22, rx: 28, ry: 13 }, face); kit.svg('circle', { 'class': 'eyebrow-pupil', cx: sg * 62, cy: -22, r: 9 }, face); });
        kit.svg('path', { 'class': 'eyebrow-nose', d: 'M0,-10 L-8,52 Q0,62 12,52' }, face);
        kit.svg('path', { 'class': 'eyebrow-mouth', d: 'M-44,100 Q0,128 44,100' }, face);
        /* 左邊的眉毛（已經畫好；臉座標，畫在臉的 group 裡所以會跟著臉歪） */
        kit.svg('polyline', { 'class': 'eyebrow-ref' + sc, points: q.brow.map(function (p) { return p.u + ',' + p.v; }).join(' ') }, face);
        var axis = kit.svg('line', { 'class': 'eyebrow-axis', x1: 0, y1: -190, x2: 0, y2: 205 }, face);                    /* 臉的中軸（揭曉時淡淡地顯示） */
        var mine = kit.svg('polyline', { 'class': 'eyebrow-mine' + sc.replace('ref', 'mine'), points: '' }, turn), ghost = kit.svg('polyline', { 'class': 'eyebrow-ghost' + sc.replace('ref', 'ghost'), points: '' }, turn);
        var info = h('div', { 'class': 'qz-note eyebrow-info', text: '' }); info.style.top = Math.round(H * 0.46 + 215) + 'px'; field.appendChild(info);
        if (level === 1 && kit.once('eyebrow.hint')) { var s0 = q.target[0], s1 = q.target[q.target.length - 1]; kit.hintOn(stage, null, { mode: 'drag', x: s0.x, y: s0.y, dx: s1.x - s0.x, dy: s1.y - s0.y, delay: 800, text: '在右邊畫出對稱的眉毛' }); }  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        var phase = 'draw', pts = [], down = null;
        field.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (phase !== 'draw' || api.over || down) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            down = { id: e.pointerId }; var p = kit.localPt(e, field); pts = [{ x: p.x, y: p.y }]; mine.setAttribute('points', pts2d(pts));  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        });
        field.addEventListener('pointermove', function (e) {
            if (!down || e.pointerId !== down.id || phase !== 'draw') return;
            var p = kit.localPt(e, field), last = pts[pts.length - 1]; if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
            pts.push({ x: p.x, y: p.y }); mine.setAttribute('points', pts2d(pts));
        });
        function up(e) {
            if (!down || e.pointerId !== down.id) return;
            down = null; if (phase !== 'draw') return;
            if (pts.length < MIN_PTS || pathLength(pts) < MIN_LEN_FRAC * q.L) { mine.setAttribute('points', ''); pts = []; info.textContent = '畫長一點，再畫一次'; return; }       /* 太短＝誤觸：不判定，可以重畫 */
            judge(pts);
        }
        field.addEventListener('pointerup', up); field.addEventListener('pointercancel', function (e) { if (down && e.pointerId === down.id) { down = null; if (phase === 'draw') { mine.setAttribute('points', ''); pts = []; } } });

        /* 判定：手指放開才算；把鏡射後的左眉（淡紅色）疊在你畫的上面，寫出相似度 */
        function judge(stroke) {
            if (phase !== 'draw' || api.over) return;
            phase = 'end'; mine.setAttribute('points', pts2d(stroke));
            var sim = similarity(stroke, q.target, q.L), ok = sim >= q.thresh, why = whyText(sim, q.thresh);
            /* 評審動畫（V1.38.0 玩家意見）：① 整張臉先轉正（歪的角度變 0）→ ② 停一下 → ③ 紅色的正確眉毛（左眉鏡射過去的）淡入 → ④ 才顯示相似度與結算。
               臉本來就正的（前面的關卡）就不用轉，直接停一下再出紅眉。 */
            var turnMs = q.thetaDeg ? TURN_MS : 0, revealAt = turnMs + REVEAL_GAP_MS;
            tip.textContent = q.thetaDeg ? '先把臉轉正…' : '看看對稱的眉毛…';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (q.thetaDeg) turn.style.transform = 'rotate(' + (-q.thetaDeg) + 'deg)';
            axis.classList.add('eyebrow-axis--on');     /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            api.after(revealAt, function () {           /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                ghost.setAttribute('points', pts2d(q.target)); ghost.classList.add('eyebrow-ghost--on');
                tip.textContent = ok ? '畫得好！' : '紅色是左邊的' + noun + '翻過去的樣子';
                api.after(GHOST_MS, function () {
                    info.textContent = why; info.classList.add(ok ? 'eyebrow-info--ok' : 'eyebrow-info--bad');
                    if (ok) { kit.flash(stage, true, api.my); Sfx.play('ok'); api.pass({ delay: 1800 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                    kit.flash(stage, false, api.my);
                    api.fail({ delay: 3000, lines: [why, '把左邊的' + noun + '左右翻過去（鏡射）就是紅色那條', '臉歪了 ' + q.thetaDeg + '°，對稱軸是臉的中軸（看鼻子），不是畫面的正中間'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                });
            });
        }
        /* 驗證用：畫出標準答案（加一點抖動）送出（solve）；畫一條橫線送出（wrong）；可重複呼叫 */
        api.solve = function () { if (phase !== 'draw') return; var r = api.rand, st = q.target.map(function (p) { return { x: p.x + (r() - 0.5) * 2 * SOLVE_JITTER, y: p.y + (r() - 0.5) * 2 * SOLVE_JITTER }; }); judge(st); };
        api.wrong = function () { if (phase !== 'draw') return; var st = []; for (var i = 0; i < 20; i++) st.push({ x: q.F.x + 30 + i * 6, y: q.F.y + 120 }); judge(st); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '畫眉毛',
        rule: '一張臉，**左邊的眉毛（或鬍子）已經畫好了**。**在右邊畫出另一條，要和左邊的「鏡射對稱」**——眉峰、眉尾都要左右反過來。放手後，左邊的會翻過去疊在右邊，算出相似度，**要達到及格線才過關**。臉有時會歪、不在正中間，**對稱軸是臉的中軸**（看鼻子和嘴巴）。放手後臉先轉正，再出現紅色的正確線條。越後面形狀越奇怪，第 2 關起還有創意鬍子！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            stachePFor: stachePFor, stachePar: stachePar, stacheShape: stacheShape, STACHE_FROM: STACHE_FROM, STACHE_P: STACHE_P, STACHE_LEN: STACHE_LEN, STACHE_GAP: STACHE_GAP, STACHE_V: STACHE_V, STACHE_TOP: STACHE_TOP, STACHE_BOTTOM: STACHE_BOTTOM, STACHE_BASE: STACHE_BASE, STACHE_WEIRD: STACHE_WEIRD, STACHE_TYPES: STACHE_TYPES,
            threshFor: threshFor, tiltFor: tiltFor, shiftFor: shiftFor, typesFor: typesFor, weirdPFor: weirdPFor, weirdPar: weirdPar, catmull: catmull, piecewise: piecewise, loopShape: loopShape, browRadius: browRadius, shiftLimit: shiftLimit, pathLength: pathLength, resample: resample, distToPath: distToPath, chamfer: chamfer, similarity: similarity, toScreen: toScreen, mirrorLocal: mirrorLocal, browShape: browShape, makeLevel: makeLevel, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, THRESH: THRESH, TILT_DEG: TILT_DEG, TILT_FROM: TILT_FROM, SHIFT_PX: SHIFT_PX, BROW_LEN: BROW_LEN, BROW_PTS: BROW_PTS, L_CAP: L_CAP, LOOPY: LOOPY, EDGE: EDGE, REVEAL_GAP_MS: REVEAL_GAP_MS, GHOST_MS: GHOST_MS, BROW_GAP: BROW_GAP, BROW_V: BROW_V, SIM_K: SIM_K, N_RES: N_RES, MIN_PTS: MIN_PTS, MIN_LEN_FRAC: MIN_LEN_FRAC, SOLVE_JITTER: SOLVE_JITTER, TYPES: TYPES, BASE_TYPES: BASE_TYPES, WEIRD: WEIRD, WEIRD_FROM: WEIRD_FROM, WEIRD_P: WEIRD_P, BROW_TOP: BROW_TOP, BROW_BOTTOM: BROW_BOTTOM, TURN_MS: TURN_MS, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
