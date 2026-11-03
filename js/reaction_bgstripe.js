/* ═══════════════════════════════════════════════════════════════════
   reaction_bgstripe.js — 干擾用的「動態條紋背景」共用元件（V1.44.0；掛在 Reaction.kit 底下，要排在 reaction_kit4.js 之後）
   ───────────────────────────────────────────────────────────────────
   【這是做什麼的】
   在遊戲區（stage）的最底下墊一層很淡、會慢慢移動或旋轉的花紋（條紋、圓圈、螺紋、棋盤、六角形…），
   顏色跟底色只差一點點，不會搶走題目的注意力，只是讓眼睛「略為分心」，判斷線條角度、長度、位置時更不容易。
   花紋永遠在最底層，不擋觸控，也不會被遊戲的題目圖形蓋住以外的東西影響（題目圖形照樣畫在上面）。

   【怎麼用（兩步）】
   ① 在遊戲檔的「可以自己調的參數」區放一組設定（每個欄位都有預設值，不想調的可以不寫）：
        var BG = { from: 10, type: 'vstripe', diff: 5, width: 30, move: 'x', speed: 24 };
   ② 在每一關開始（setup）建好舞台之後呼叫一次：
        kit.bgStripe(api.stage, api.my, api.level, BG);
      單回合的遊戲（kit.single）沒有關卡，level 不用傳（等於第 1 關）。
      這個函式會自己判斷「這一關要不要出現」（level 小於 from 就什麼都不做、回傳 null），
      換關或離開遊戲時背景會自動清掉，遊戲檔不用另外收拾。

   【設定欄位】（全部可省略；數字欄位也可以寫成 [第一關的值, 最後一關的值]，中間會線性漸變，見 rampLevels）
     from        第幾關開始出現（含）。預設 1；寫 0／null／false 代表這款遊戲不出現（暫時關掉用）
     to          到第幾關為止（含）。預設不限
     type        花紋的形式：
                   'vstripe' 直條紋　　'hstripe' 橫條紋　　'circles' 圓圈（同心圓）　　'spiral' 螺紋
                   'checker' 棋盤狀　　'hex' 六角形拼盤　　'dots' 圓點
                   'random' 每一關從全部形式裡隨機抽一種；也可以寫陣列，例如 ['vstripe', 'hex']，每一關從裡面隨機抽
     diff        色彩差異度＝兩種顏色的亮度差（%）。越小越淡、越不容易察覺；0＝完全看不到；一般 3～8 就夠干擾了
     hueShift    兩種顏色的色相差（度）。預設 0（只有亮度不同）；加大會讓條紋帶一點色彩變化
     hue         底色的色相（0～359 度）；null＝沿用主題的米黃紙色；'random'＝每一關隨機
     sat, light  底色的飽和度、亮度（%）；預設 80、92，剛好是主題的紙色 #FBF3D9，題目圖形才看得清楚。兩個顏色是以底色為中心，一亮一暗各差 diff 的一半
     width       間隔寬度（px）：條紋每一條的寬、棋盤每格的邊長、螺紋的帶寬、六角形的半徑、圓點的直徑
     angle       花紋整體傾斜的角度（度）。直條紋傾斜 45 度就是斜紋；'random'＝每一關隨機（0～179 度）；
                 'skew'＝每一關隨機，但避開接近水平、垂直的角度（只會是 15～75 度或 105～165 度）——判斷水平、垂直、直角的遊戲用它，
                 不然剛好擺正的條紋會變成提示
     move        移動的方向：'none' 不動　'x' 左右　'y' 上下　'all' 全部（斜著走／來回繞）
                 'both' 是 'all' 的別名（寫哪個都一樣）。圓圈、螺紋沒有重複的週期，所以左右、上下、全部都是「來回擺動」
                 （直條紋配「上下」、橫條紋配「左右」，因為沿著條紋方向移動，眼睛看不出變化）
     path        移動的方式：'scroll' 單方向一直捲動（走完一個週期剛好接上，看起來永遠不停）；
                 'swing' 來回擺動。圓圈和螺紋沒有「重複的週期」，所以不管寫什麼都是 'swing'
     speed       移動速度（px／秒）。擺動時是最快的瞬間速度
     swing       擺動的幅度（px）；0＝自動（寬度的 3 倍，至少 60）
     dir         捲動方向與旋轉方向：1 或 -1；'random'＝每一關隨機
     spin        旋轉速度（度／秒）；正＝順時針、負＝逆時針、0＝不轉。圓圈轉了看不出來。
                 螺紋（spiral）的實際轉速是 spin × 10（見 SPIRAL_SPIN_MUL）：螺紋轉起來的視覺效果比別的花紋弱很多
     rampLevels  數字欄位寫成 [起, 終] 時，從 from 那一關漸變到「from 之後第 rampLevels 關」，之後維持終值（預設 20）
     fade        背景淡入的時間（毫秒），避免一換關就突然閃出一大片花紋（預設 600）

   【回傳值】沒有出現就是 null；有出現是 { el: 背景元素, cfg: 這一關實際用的設定, hide(): 暫時藏起來, show(): 再顯示, stop(): 移除 }。
   【減少動態】使用者在系統設定了「減少動態效果」時，花紋會顯示但不動。
   【給單元測試用】kit.bgStripe.test 匯出純函式（resolve／colors／periodOf／motionPlan／layerSize），不碰畫面，Node 就能測。
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的檔案的同名變數打架。
       'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       檔案由上往下分成：① 預設值；② 純函式（只做計算，不碰畫面）；③ 畫面（用 SVG 畫花紋，用 Web Animations 讓它動）；④ 對外的 kit.bgStripe。 */
    'use strict';
    var kit = Reaction.kit;                             /* kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數（沒寫的欄位就用這裡的預設值）═══ */
    var DEF = {
        from: 1, to: 9999,                              /* 從第 1 關開始出現，一直到最後（9999 關＝沒有上限） */
        type: 'vstripe',                                /* 預設花紋：直條紋 */
        hue: null, sat: 80, light: 92,                  /* 底色：色相沿用主題紙色（null）、飽和度 80%、亮度 92%——三個數字合起來就是主題的紙色 #FBF3D9 */
        diff: 5, hueShift: 0,                           /* 兩色亮度差 5%、色相差 0 度（只差亮度，很淡） */
        width: 30, angle: 0,                            /* 每一條（格）寬 30px、不傾斜 */
        move: 'x', path: 'scroll', speed: 24, swing: 0, /* 左右捲動、每秒 24px；擺動幅度 0＝自動 */
        dir: 'random', spin: 0,                         /* 方向每關隨機、不旋轉 */
        rampLevels: 20,                                 /* [起, 終] 的漸變要花幾關 */
        fade: 600                                       /* 淡入 0.6 秒 */
    };
    var PAPER_HUE = 46;                                 /* 主題紙色（--c-paper #FBF3D9）的色相，預設底色跟它同色系，花紋才不突兀 */
    var TYPES = ['vstripe', 'hstripe', 'circles', 'spiral', 'checker', 'hex', 'dots'];  /* 全部花紋形式；type: 'random' 就是從這裡抽 */
    var MOVES = ['none', 'x', 'y', 'all'];              /* 合法的移動方向 */
    var MOVE_ALIAS = { both: 'all' };                   /* 別名：move 寫 'both'（左右＋上下兩個方向）等於 'all'；不認得的寫法會變成 'none'（不動），所以常見的寫法放在這裡幫它轉 */
    var SPIRAL_SPIN_MUL = 10;                           /* 螺紋的旋轉速度倍率：螺紋轉起來的視覺效果比別的花紋弱很多，所以 spin 寫幾度，實際就轉 spin × 這個倍率 度／秒（只有 type 是 spiral 才乘） */
    var SWING_EASE = 'cubic-bezier(0.37, 0, 0.63, 1)';  /* 擺動用的緩動曲線（easeInOutSine）：來回擺動的速度變化剛好是正弦波，像鐘擺一樣自然 */
    var Y_SLOWER = 1.31;                                /* 「全部」擺動時，上下比左右慢這麼多倍，兩個方向週期不同，軌跡才不會一直走同一條線 */
    var MAX_SIZE = 3000;                                /* 花紋圖層邊長的上限（px），避免設定過頭時吃太多記憶體 */
    var seq = 0;                                        /* 流水號：每個花紋的 SVG pattern 需要獨一無二的 id */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 字串／數字轉成「是否為陣列」的小工具 */
    function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
    /* 數字欄位可以寫 [起, 終]：第 from 關是起、第 from + span - 1 關是終，中間線性漸變；其他情況原樣回傳 */
    function val(v, level, from, span) {
        return isArr(v) ? kit.ramp(level - from + 1, v[0], v[1], span) : v;
    }
    /* 把 'hsl(色相,飽和度%,亮度%)' 組成 CSS 色碼，數字四捨五入到小數 1 位 */
    function hsl(h, s, l) { return 'hsl(' + (Math.round(((h % 360) + 360) % 360 * 10) / 10) + ',' + Math.round(s * 10) / 10 + '%,' + Math.round(l * 10) / 10 + '%)'; }

    /* skewAngle：隨機的傾斜角，但避開水平（0／180 度）與垂直（90 度）附近：只會是 15～75 度或 105～165 度 */
    function skewAngle(rand) { var a = Math.round(kit.randFloat(15, 75, rand)); return rand() < 0.5 ? a : 180 - a; }

    /* resolve：把遊戲給的設定（opts）和預設值（DEF）合併，並「擲骰子」決定這一關的隨機項目（花紋、色相、角度、方向），
       回傳一份全部都是具體數字的設定 c；c.show 是 false 代表這一關不出現 */
    function resolve(opts, level, rand) {
        opts = opts || {}; rand = rand || Math.random; level = level || 1;
        var from = opts.from === undefined ? DEF.from : opts.from;
        var to = opts.to === undefined ? DEF.to : opts.to;
        if (!from || level < from || level > to) return { show: false };
        var c = { show: true, level: level }, k;
        for (k in DEF) c[k] = opts[k] === undefined ? DEF[k] : opts[k];
        c.from = from; c.to = to;
        var span = Math.max(2, c.rampLevels | 0);
        /* 花紋形式：陣列＝從裡面抽；'random'＝從全部抽；寫錯的名字退回直條紋 */
        var t = c.type;
        if (isArr(t)) t = kit.pick(t, rand);
        if (t === 'random') t = kit.pick(TYPES, rand);
        c.type = TYPES.indexOf(t) >= 0 ? t : 'vstripe';
        /* 顏色與尺寸 */
        c.hue = c.hue === 'random' ? kit.randInt(0, 359, rand) : (c.hue == null ? PAPER_HUE : c.hue);
        c.diff = Math.max(0, val(c.diff, level, from, span));
        c.hueShift = val(c.hueShift, level, from, span);
        c.width = Math.max(4, val(c.width, level, from, span));
        c.angle = c.angle === 'random' ? kit.randInt(0, 179, rand) : (c.angle === 'skew' ? skewAngle(rand) : val(c.angle, level, from, span));
        /* 移動與旋轉 */
        c.dir = c.dir === 'random' ? (rand() < 0.5 ? 1 : -1) : (c.dir < 0 ? -1 : 1);
        c.move = MOVE_ALIAS[c.move] || c.move;
        c.move = MOVES.indexOf(c.move) >= 0 ? c.move : 'none';
        c.path = c.path === 'swing' ? 'swing' : 'scroll';
        c.speed = Math.max(0, val(c.speed, level, from, span));
        c.spin = val(c.spin, level, from, span) * (c.type === 'spiral' ? SPIRAL_SPIN_MUL : 1);   /* 螺紋：實際轉速 ＝ spin × SPIRAL_SPIN_MUL */
        c.swingAmp = c.swing > 0 ? c.swing : Math.max(60, 3 * c.width);
        c.colors = colors(c);
        return c;
    }

    /* colors：算出花紋用的三個顏色 [亮色, 暗色, 中間色]。
       亮色＝底色亮度 + diff/2，暗色＝底色亮度 − diff/2（所以兩色的亮度差剛好是 diff）；中間色只有六角形拼盤（三個色調）會用到 */
    function colors(c) {
        var lo = kit.clamp(c.light - c.diff / 2, 3, 99), hi = kit.clamp(c.light + c.diff / 2, 3, 99);
        return [hsl(c.hue, c.sat, hi), hsl(c.hue + c.hueShift, c.sat, lo), hsl(c.hue + c.hueShift / 2, c.sat, (hi + lo) / 2)];
    }

    /* periodOf：這種花紋「每隔多遠會重複一次」（px）。往這個距離捲動一圈，花紋剛好跟原來一模一樣，所以可以無縫接續地一直捲。
       圓圈和螺紋是繞著圓心的，往旁邊移動永遠不會重複，所以回傳 0（沒有週期）。
       六角形拼盤：三個色調要排成不重複的樣子，最小的重複單位是 3√3 × 半徑 寬、3 × 半徑 高 */
    function periodOf(type, w) {
        if (type === 'hex') return { px: 3 * Math.sqrt(3) * w, py: 3 * w };
        if (type === 'circles' || type === 'spiral') return { px: 0, py: 0 };
        return { px: 2 * w, py: 2 * w };                /* 直條紋、橫條紋、棋盤、圓點：一條亮＋一條暗＝2 個寬度 */
    }

    /* motionPlan：把 move／path／speed／spin 轉成「要播哪些動畫」。回傳
         { kind: 'none' | 'scroll' | 'swing',
           x / y: null（這個方向不動）或 { from, to, ms }（從 from 平移到 to，花 ms 毫秒；捲動是跑完一圈就重來，擺動是來回），
           spin: null 或 { deg 一圈轉的角度（±360）, ms 轉一圈要多久 } } */
    function motionPlan(c) {
        var P = periodOf(c.type, c.width), plan = { kind: 'none', x: null, y: null, spin: null };
        var useX = c.move === 'x' || c.move === 'all', useY = c.move === 'y' || c.move === 'all';
        if (c.move !== 'none' && c.speed > 0 && (useX || useY)) {
            if (c.path === 'swing' || P.px <= 0) {
                /* 擺動：位置 = −A…+A 來回；最快的瞬間速度＝ A × π ÷ 半個週期，所以半個週期 ms = π × A ÷ speed */
                var A = c.swingAmp, ms = Math.PI * A / c.speed * 1000;
                plan.kind = 'swing';
                if (useX) plan.x = { from: -A, to: A, ms: ms };
                if (useY) plan.y = { from: -A, to: A, ms: ms * (useX ? Y_SLOWER : 1) };
            } else {
                /* 捲動：每個方向各走一個週期，兩個方向花同樣的時間，合起來就是斜著走；走的距離 ÷ 速度＝時間 */
                var dx = useX ? P.px : 0, dy = useY ? P.py : 0;
                var T = Math.sqrt(dx * dx + dy * dy) / c.speed * 1000;
                plan.kind = 'scroll';
                if (useX) plan.x = { from: 0, to: c.dir * dx, ms: T };
                if (useY) plan.y = { from: 0, to: c.dir * dy, ms: T };
            }
        }
        if (c.spin) plan.spin = { deg: 360 * (c.spin * c.dir >= 0 ? 1 : -1), ms: 360 / Math.abs(c.spin) * 1000 };
        return plan;
    }

    /* layerSize：花紋圖層要畫多大（正方形邊長，px）。
       圖層會移動、旋轉，畫面的每個角落都得一直被蓋住：邊長 ＝ 遊戲區對角線 ＋ 兩倍的最大位移量（再加一點保險）。
       位移量：捲動時是「走一圈的距離」，擺動時是擺幅 */
    function layerSize(c, plan, W, H) {
        var sx = plan.x ? Math.abs(plan.x.to) : 0, sy = plan.y ? Math.abs(plan.y.to) : 0;
        var shift = Math.sqrt(sx * sx + sy * sy);
        return Math.min(MAX_SIZE, Math.ceil(Math.sqrt(W * W + H * H) + 2 * shift) + 4);
    }

    /* ═══ 畫面（用 SVG 畫花紋）═══ */
    /* 畫六角形（尖頂朝上）：中心 (cx, cy)、外圓半徑 r、填色 fill；加一圈同色的細邊，避免相鄰色塊之間露出縫隙 */
    function hexagon(parent, cx, cy, r, fill) {
        var pts = [], i;
        for (i = 0; i < 6; i++) { var a = (30 + 60 * i) * Math.PI / 180; pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2)); }
        kit.svg('polygon', { points: pts.join(' '), fill: fill, stroke: fill, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }, parent);
    }

    /* buildPattern：在 svg（D × D）裡畫出這個花紋。
       會重複的花紋（條紋、棋盤、圓點、六角形）只畫「一個重複單位」放進 <pattern>，再用它把整個圖層填滿——
       畫面再大也只要畫一小塊；圓圈和螺紋不會重複，直接畫在整個圖層上 */
    function buildPattern(svg, c, D) {
        var w = c.width, c1 = c.colors[0], c2 = c.colors[1], c3 = c.colors[2], P = periodOf(c.type, w);
        var t = c.type, ctr = D / 2;
        if (P.px > 0) {
            var id = 'rxbg' + (++seq);
            var defs = kit.svg('defs', {}, svg);
            var pat = kit.svg('pattern', { id: id, patternUnits: 'userSpaceOnUse', width: P.px, height: P.py }, defs);
            kit.svg('rect', { x: 0, y: 0, width: P.px, height: P.py, fill: c1 }, pat);              /* 先鋪亮色當底 */
            if (t === 'vstripe') kit.svg('rect', { x: w, y: 0, width: w, height: P.py, fill: c2 }, pat);      /* 右半邊暗色＝一條直條 */
            else if (t === 'hstripe') kit.svg('rect', { x: 0, y: w, width: P.px, height: w, fill: c2 }, pat);  /* 下半邊暗色＝一條橫條 */
            else if (t === 'checker') {                                                              /* 左上、右下兩格暗色＝棋盤 */
                kit.svg('rect', { x: 0, y: 0, width: w, height: w, fill: c2 }, pat);
                kit.svg('rect', { x: w, y: w, width: w, height: w, fill: c2 }, pat);
            } else if (t === 'dots') {                                                               /* 兩顆斜對角的圓點，直徑 w */
                kit.svg('circle', { cx: w / 2, cy: w / 2, r: w / 2, fill: c2 }, pat);
                kit.svg('circle', { cx: w * 1.5, cy: w * 1.5, r: w / 2, fill: c2 }, pat);
            } else if (t === 'hex') {
                /* 六角形拼盤：格子座標 (q, s)，中心 x ＝ √3·r·(q + s/2)、y ＝ 1.5·r·s；顏色 ＝ (q − s) 除以 3 的餘數（相鄰的格子一定不同色） */
                var s3 = Math.sqrt(3), q, s;
                for (s = -2; s <= 4; s++) for (q = -5; q <= 5; q++) {
                    var cx = s3 * w * (q + s / 2), cy = 1.5 * w * s;
                    if (cx < -2 * w || cx > P.px + 2 * w || cy < -2 * w || cy > P.py + 2 * w) continue;   /* 離重複單位太遠的不用畫 */
                    hexagon(pat, cx, cy, w, [c1, c3, c2][((q - s) % 3 + 3) % 3]);
                }
            }
            kit.svg('rect', { x: 0, y: 0, width: D, height: D, fill: 'url(#' + id + ')' }, svg);   /* 用 pattern 把整個圖層填滿 */
            return;
        }
        kit.svg('rect', { x: 0, y: 0, width: D, height: D, fill: c1 }, svg);
        var reach = D * 0.75;                           /* 要畫到多遠（圖層的角落離圓心約 0.71 倍邊長） */
        if (t === 'circles') {
            /* 同心圓：圓心的實心圓半徑 w，之後每隔 2w 有一圈寬 w 的暗色圓環（用粗線條畫空心圓） */
            for (var r = 1.5 * w; r < reach; r += 2 * w) kit.svg('circle', { cx: ctr, cy: ctr, r: r, fill: 'none', stroke: c2, 'stroke-width': w }, svg);
        } else {
            /* 螺紋：阿基米德螺線 r ＝ k·θ，每轉一圈往外 2w，用寬 w 的暗色粗線畫出來，於是暗帶和亮帶各 w 寬 */
            var k = 2 * w / (2 * Math.PI), d = 'M' + ctr + ' ' + ctr, th;
            for (th = 0.07; k * th < reach; th += 0.07) d += ' L' + (ctr + k * th * Math.cos(th)).toFixed(1) + ' ' + (ctr + k * th * Math.sin(th)).toFixed(1);
            kit.svg('path', { d: d, fill: 'none', stroke: c2, 'stroke-width': w }, svg);
        }
    }

    /* anim：讓元素 el 的 transform 從 from 變到 to，無限重複。
       alt ＝ true 是來回（擺動，用正弦緩動），false 是從頭重來（捲動、旋轉，等速）。
       delay 設成負數，代表「一開始就已經播到途中某處」，這樣每一關的起始位置都不一樣 */
    function anim(el, from, to, ms, alt, rand) {
        if (!el.animate || kit.REDUCED) return null;    /* 瀏覽器太舊（沒有 Web Animations），或使用者要求減少動態：不動 */
        return el.animate([{ transform: from }, { transform: to }], {
            duration: ms, iterations: Infinity, direction: alt ? 'alternate' : 'normal',
            easing: alt ? SWING_EASE : 'linear', delay: -Math.floor(rand() * ms * (alt ? 2 : 1))
        });
    }

    /* ═══ 對外：kit.bgStripe(host, my, level, opts, rand) ═══
       host：要墊在底下的容器（通常是 api.stage）；my：這一局的管家（kit.round，離開時會替我們收拾）；
       level：這是第幾關；opts：這款遊戲的設定；rand：亂數函式（測試用，不傳就是 Math.random） */
    function bgStripe(host, my, level, opts, rand) {
        rand = rand || Math.random;
        var c = resolve(opts, level, rand);
        if (host._rxbg) { host._rxbg.stop(); host._rxbg = null; }   /* 同一個容器已經有背景（例如換題、換關沒有清掉容器）：先收掉舊的，不會越疊越多層 */
        if (!c.show) return null;
        var W = host.clientWidth || 472, H = host.clientHeight || 640;
        var plan = motionPlan(c), D = layerSize(c, plan, W, H);

        /* 圖層：layer（鋪滿遊戲區、裁掉超出的部分）> rot（正方形，負責傾斜與旋轉）> tx（負責左右移動）> svg（負責上下移動、畫花紋） */
        var layer = UI.h('div', { 'class': 'rx-bgstripe' });
        var rot = UI.h('div', { 'class': 'rx-bgstripe__rot' });
        var tx = UI.h('div', { 'class': 'rx-bgstripe__tx' });
        rot.style.width = rot.style.height = D + 'px';
        rot.style.left = ((W - D) / 2) + 'px'; rot.style.top = ((H - D) / 2) + 'px';
        rot.style.transform = 'rotate(' + c.angle + 'deg)';
        var svg = kit.svg('svg', { 'class': 'rx-bgstripe__pat', width: D, height: D, viewBox: '0 0 ' + D + ' ' + D });
        buildPattern(svg, c, D);
        tx.appendChild(svg); rot.appendChild(tx); layer.appendChild(rot);
        /* 放在 host 的第一個子元素；host 要有定位，並自成一個疊放層（isolation），layer 的 z-index: -1 才不會跑到 host 後面去 */
        if (global.getComputedStyle && global.getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.style.isolation = 'isolate';
        host.insertBefore(layer, host.firstChild);

        /* 動畫 */
        var anims = [];
        function add(a) { if (a) anims.push(a); }
        if (plan.spin) add(anim(rot, 'rotate(' + c.angle + 'deg)', 'rotate(' + (c.angle + plan.spin.deg) + 'deg)', plan.spin.ms, false, rand));
        if (plan.x) add(anim(tx, 'translateX(' + plan.x.from + 'px)', 'translateX(' + plan.x.to + 'px)', plan.x.ms, plan.kind === 'swing', rand));
        if (plan.y) add(anim(svg, 'translateY(' + plan.y.from + 'px)', 'translateY(' + plan.y.to + 'px)', plan.y.ms, plan.kind === 'swing', rand));
        if (c.fade > 0 && layer.animate && !kit.REDUCED) layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: c.fade, easing: 'ease-out' });

        var ctl = {
            el: layer, cfg: c, plan: plan,
            hide: function () { layer.style.display = 'none'; },
            show: function () { layer.style.display = ''; },
            stop: function () {
                anims.forEach(function (a) { try { a.cancel(); } catch (e) { } });  /* forEach：對陣列的每個元素各做一次 */
                anims = [];
                if (layer.parentNode) layer.parentNode.removeChild(layer);
            }
        };
        layer.setAttribute('data-bg', c.type);          /* 方便除錯與驗證：用開發者工具一看就知道這一關是什麼花紋 */
        host._rxbg = ctl;
        /* 離開遊戲（這一局作廢）時一起收掉；同一個容器、同一局只掛一次（之後每關換的是 host._rxbg，鉤子收的永遠是最新的那一個） */
        if (my && my.hooks && host._rxbgHook !== my) { host._rxbgHook = my; my.hooks.push(function () { if (host._rxbg) host._rxbg.stop(); }); }
        try { console.info('[背景] ' + c.type + '，亮度差 ' + c.diff.toFixed(1) + '%，寬 ' + Math.round(c.width) + 'px，' + (plan.kind === 'none' ? '不移動' : (plan.kind === 'scroll' ? '捲動' : '擺動') + ' ' + c.move + ' ' + Math.round(c.speed) + 'px/s') + (plan.spin ? '，旋轉 ' + c.spin + '°/s' : '') + (c.angle ? '，傾斜 ' + c.angle + '°' : '')); } catch (e) { }  /* 在瀏覽器主控台（按 F12）印出這一關的背景設定 */
        return ctl;
    }

    bgStripe.TYPES = TYPES;
    bgStripe.test = { skewAngle: skewAngle, resolve: resolve, colors: colors, periodOf: periodOf, motionPlan: motionPlan, layerSize: layerSize, val: val, DEF: DEF };
    kit.bgStripe = bgStripe;
})(window);
