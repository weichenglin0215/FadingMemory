/* ═══════════════════════════════════════════════════════════════════
   reaction_ordercut.js — 秒反應・照號切水果（企劃 377）
   樣式：css/games/reaction_ordercut.css（這款專屬的 class 一律以「ordercut-」開頭；共用元件在 css/reaction_common.css）
   一堆水果拋上來，每顆上面寫一個數字（1、2、3…）。**照號碼順序一顆一顆切**（用手指在畫面上劃過去）：先切 1、再切 2……
   **切錯順序就結束**，水果掉到畫面下面還沒被切到也結束。
   ───────────────────────────────────────────────────────────────────
   · 水果在空中的軌跡（fruitPos）：像煙火——每顆水果從畫面下方「噴」上去（很快，越爬越慢），到頂點之後慢慢往下飄（很慢，慢慢加速），飛行時間 T（秒）；
     上升占 RISE_FRAC、起始衝勁 RISE_EASE、下降的加速 FALL_EASE（曲線見 lift）；水平方向慢慢飄、整顆水果一直旋轉（所以 6 和 9 轉一轉會分不清——
     數字下面有一條底線，底線在下面的才是正的）。位置只由「時間」決定（不是一格一格累加），畫面和判定用同一個函式。
   · 一波一波發射（VOLLEY）：每一波有好幾顆「號碼連續」的水果，幾乎同時（差不到 VOLLEY_SPREAD_S 秒）從畫面下方不同位置噴出，
     畫面上常常同時有好幾顆，玩家要判斷號碼順序、依序切；每波顆數隨關卡增加，放不下時自動減少。
   · 保證切得完（makeLevel）：先排好一張「計畫切的時間表」c₁ < c₂ < … < c_N（相鄰間隔 GAP_CUT 秒左右），再決定每一波什麼時候噴：
     第 k 號水果在計畫切它的那一刻，飛到整段飛行的 u 位置（u 一定在 [max(U_MIN, RISE_FRAC), U_MAX] 之內＝已經過了頂點、離落下還有餘裕）。
     所以每一顆在被計畫切的時間點一定在畫面上。混亂度越高，一波的第一次切落在飛行的哪裡越分散。
   · 號碼一定從 1 開始、連續不跳號：數字關是 1～N；算式關每顆水果寫一個算式（2＋3、12÷4、6×7…），算式的答案剛好是 1～N（makeExprs），
     **照答案由小到大的順序切**。算式關卡的水果數從 5 顆開始往 15 顆增加；第 20 關起加入乘法和除法（除法一定整除）。
   · 切的判定（sliceSegment）：手指從上一點到這一點畫出一小段線；這一段線穿過（離線段 ≤ 水果半徑＋HIT_PAD）的水果，依「沿著線的順序」一顆一顆切。
     第一顆被切到的必須剛好是「下一號」，不是就失敗；一刀穿過兩顆（下一號、再下一號）是可以的。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：飛行時間 2.8 → 1.8 秒、計畫切的間隔 0.8 → 0.4 秒、混亂度 0.1 → 1、旋轉速度 80 → 280 度／秒；水果數見上。
   · 揭曉：所有水果停在空中，每顆標上「第幾個要切」，切錯的那顆標紅、本來該切的那顆標綠（算式的也標出答案）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'ordercut'：選單、成績、存檔都靠它；樣式在 css/games/reaction_ordercut.css，裡面的 class 名稱一律以 ordercut- 開頭。 */
    'use strict';

    var ID = 'ordercut';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var NUM_COUNT = [4, 15], NUM_RAMP = 14;     /* 數字關：水果數 4 → 15，在第 14 關到頂（之後維持 15；第 15 關起改成算式） */
    var EXPR_FROM = 1;                         /* 第幾關起改成算式 */
    var EXPR_COUNT = [5, 15], EXPR_RAMP = 15;   /* 算式關：水果數 5 → 15，從 EXPR_FROM 起算 15 關到頂 */
    var MULDIV_FROM = 20;                       /* 第幾關起算式加入 × 和 ÷ */
    var FLIGHT_S = [2.8, 1.8];                  /* 一顆水果從拋出到掉出畫面的時間（秒）：第 1 關 → 到頂 */
    var GAP_CUT = [0.8, 0.4];                   /* 計畫切的時間間隔（秒）：第 1 關 → 到頂 */
    var CHAOS = [0.1, 1];                       /* 混亂度（0～1）：第 1 關 → 到頂 */
    var OMEGA_DEG = [80, 280];                  /* 旋轉速度（度／秒）：第 1 關 → 到頂 */
    var U_MIN = 0.15, U_MAX = 0.85, U_SPREAD = 0.35;   /* 計畫切的時刻在飛行的哪個位置（比例）：最早 U_MIN（實際還會取 RISE_FRAC 以上，要等水果過了頂點）、最晚 U_MAX；U_SPREAD 是舊的「一顆一顆拋」才用的偏移量，改成一波一波發射後不再使用（混亂度改成決定一波的第一次切落在 [最早, 最晚] 的哪裡） */
    var APEX = [0.6, 0.90];                    /* 水果飛到最高點的高度（占畫面高度的比例，從畫面底算起） */
    var VOLLEY = [2, 4];                        /* 同時發射幾顆水果（一「波」）：第 1 關 → 到頂（RAMP_LEVELS 關）。同一波的水果幾乎同時從畫面下方不同位置噴出，號碼是連續的（例如 1、2、3 同一波），玩家得在空中判斷號碼順序再依序切；1＝一顆一顆拋。一波放得下的顆數受「切的間隔、飛行時間」限制，放不下時會自動減少 */
    var VOLLEY_SPREAD_S = 0.15;                 /* 同一波的水果，發射時間最多相差幾秒（0＝完全同時發射） */
    var RISE_FRAC = 0.22;                       /* 煙火式飛行：上升（噴上去）占整段飛行時間的比例。越小＝噴得越快、在空中慢慢落下的時間越長（0.22＝22% 的時間往上衝、78% 的時間慢慢掉） */
    var RISE_EASE = 2.2;                        /* 上升的減速率：1＝等速衝到頂點；2＝像丟石頭一樣越爬越慢（到頂點時速度剛好是 0）；越大＝一開始噴得越猛、接近頂點時越慢 */
    var FALL_EASE = 1.5;                        /* 下降的加速率：1＝等速慢慢掉；2＝像自由落體越掉越快；小於 1＝像降落傘越掉越慢；越小越方便觀察、計算數字 */
    var VX = 70;                                /* 水平飄移速度的最大值（px／秒） */
    var R_NUM = 36, R_EXPR = 56;                /* 水果半徑（px）：數字關／算式關（算式字比較多，水果比較大） */
    var HIT_PAD = 8;                            /* 手指劃過去離水果邊緣這麼近也算切到（px） */
    var LEAD_S = 0.8;                           /* 開場等多久才拋第一顆（秒） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var FRUITS = 6;                             /* 水果的顏色種數（CSS 的 ordercut-f0～5） */
    /* 干擾用的動態條紋背景（共用元件 js/reaction_bgstripe.js，各欄位的意思見該檔開頭）：from 是從第幾關開始出現（想關掉改成 0，想晚一點出現就調大）；數字寫成 [起, 終] 會從第 from 關起漸漸變強 */
    var BG = { from: 8, type: 'spiral', diff: [4, 8], width: 36, move: 'none', spin: 6, hue: 24, sat: 26, light: 22 };  /* 第 8 關起出現：螺紋、亮度差 4% → 8%、帶寬 36px、不平移、每秒轉 6 度；色調同深色木板（--ocf-board） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair, maxLevel) { return kit.ramp(level, pair[0], pair[1], maxLevel == null ? RAMP_LEVELS : maxLevel); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function isExpr(level) { return level >= EXPR_FROM; }
    function countFor(level) { return isExpr(level) ? Math.round(ramp(level - EXPR_FROM + 1, EXPR_COUNT, EXPR_RAMP)) : Math.round(ramp(level, NUM_COUNT, NUM_RAMP)); }  /* Math.round：四捨五入成整數 */
    function flightFor(level) { return Math.round(ramp(level, FLIGHT_S) * 1000) / 1000; }
    function gapFor(level) { return Math.round(ramp(level, GAP_CUT) * 1000) / 1000; }
    function chaosFor(level) { return Math.round(ramp(level, CHAOS) * 1000) / 1000; }
    function omegaFor(level) { return Math.round(ramp(level, OMEGA_DEG)); }
    function volleyFor(level) { return Math.max(1, Math.round(ramp(level, VOLLEY))); }
    function radiusFor(level, W) { return Math.round((isExpr(level) ? R_EXPR : R_NUM) * Math.min(1, (W || 472) / 472)); }
    /* 乘法能不能湊出 v：回傳所有「a × b ＝ v，而且 a、b 都在 2～12」的 [a, b]（質數、太大的數湊不出來就是空陣列） */
    function mulPairs(v) {
        var out = [];
        for (var a = 2; a <= 12; a++) if (v % a === 0 && v / a >= 2 && v / a <= 12) out.push([a, v / a]);  /* % 是除法的餘數：整除才會是 0 */
        return out;
    }
    /* 一個「答案剛好是 v」的算式：{ text, value }。ops＝可用的運算（'+'、'-'、'*'、'/'）；除法保證整除、減法不會是負數、算式裡的數字都在 99 以內。
       先挑出「湊得出 v」的運算（例如 v＝1 湊不出加法、質數湊不出乘法），再從裡面隨機挑一種；減法一定湊得出來，所以不會挑不到 */
    function makeExprFor(v, ops, rand) {
        var cand = ops.filter(function (op) { return op === '+' ? v >= 2 : (op === '-' ? v <= 98 : (op === '*' ? mulPairs(v).length > 0 : (op === '/' && v <= 49))); });  /* filter：留下符合條件的元素，回傳新陣列 */
        if (!cand.length) cand = ['-'];
        var op = kit.pick(cand, rand), a, b;            /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        if (op === '+') { a = kit.randInt(1, v - 1, rand); return { text: a + '＋' + (v - a), value: v }; }  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        if (op === '-') { b = kit.randInt(1, Math.min(60, 99 - v), rand); return { text: (v + b) + '－' + b, value: v }; }
        if (op === '*') { var pr = kit.pick(mulPairs(v), rand); return { text: pr[0] + '×' + pr[1], value: v }; }
        b = kit.randInt(2, Math.min(12, Math.floor(99 / v)), rand); return { text: (v * b) + '÷' + b, value: v };  /* Math.floor：無條件捨去成整數 */
    }
    /* n 個算式，答案剛好是 1、2、3…、n（一個都不能少、不能跳號，玩家才抓得到「從 1 開始、依序往上」的訣竅；順序是亂的由出題時再排） */
    function makeExprs(n, ops, rand) {
        var out = [];
        for (var v = 1; v <= n; v++) out.push(makeExprFor(v, ops, rand));
        return out;
    }
    /* 出一關：{
         level, expr（是不是算式關）, N, flight（飛行時間）, plan（計畫切的時間 c₁…c_N，秒）,
         fruits（依「要切的順序」排好；每顆 { rank（1～N，要切的順序）, label（寫在水果上的字）, value（數字或算式的答案）, color, x0（0～1，占畫面寬）, vx（占畫面寬／秒）, A（拋物線高度，占畫面高）, t（拋出時間）, T（飛行時間）, u（計畫切的時刻在飛行的位置）, a0（起始角度）, w（旋轉速度，度／秒）}）} */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var expr = isExpr(level), N = countFor(level), T = flightFor(level), gap = gapFor(level), chaos = chaosFor(level), om = omegaFor(level), size = volleyFor(level), labels, values;
        if (expr) { var ops = level >= MULDIV_FROM ? ['+', '-', '*', '/'] : ['+', '-'], es = makeExprs(N, ops, rand); labels = es.map(function (e) { return e.text; }); values = es.map(function (e) { return e.value; }); }  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        else { values = []; for (var i = 1; i <= N; i++) values.push(i); labels = values.map(String); }
        /* 照答案由小到大排：第 k 個要切的是第 k 小的 */
        var idx = values.map(function (v, i) { return i; }).sort(function (a, b) { return values[a] - values[b]; });  /* sort：排序；比較函式回傳負數代表 a 排前面、回傳正數代表 b 排前面 */
        /* 分成一波一波發射：每一波有 n 顆「號碼連續」的水果，幾乎同時（相差不到 VOLLEY_SPREAD_S 秒）從畫面下方不同位置噴出；
           切的時間表照號碼往下排（相鄰間隔 gap 秒左右，不管是不是同一波）。
           一波的第一次切，落在「噴出之後 u1 倍飛行時間」；最後一次切落在 u1 ＋ 這一波切的時間跨度。
           u 一定在 [lo, hi]（lo ＝ 頂點之後：max(U_MIN, RISE_FRAC) 再加上發射時間差的餘裕；hi ＝ U_MAX），所以切的那一刻每顆水果都在畫面上、而且已經過了快速上衝的階段。
           一波放不下（跨度超過 hi − lo）就減少這一波的顆數；最後如果只剩 1 顆，併進前一波，不讓單獨一顆孤零零地飛 */
        var S = VOLLEY_SPREAD_S, lo = Math.max(U_MIN, RISE_FRAC) + S / T, hi = U_MAX;
        var plan = [], fruits = [], volleys = [], k = 0, lastCut = 0, i;
        while (k < N) {
            var n = Math.min(size, N - k), d;
            if (N - k - n === 1) n++;
            for (; ; n--) {                                 /* 排出這一波每次切的時間（相對第一次切），放不下就少一顆再試 */
                d = [0]; for (i = 1; i < n; i++) d.push(d[i - 1] + gap * kit.randFloat(0.85, 1.2, rand));  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
                if (n === 1 || d[n - 1] / T <= hi - lo) break;
            }
            var span = d[n - 1] / T, room = Math.max(0, hi - lo - span);
            var u1 = lo + room * kit.clamp(0.5 + (rand() * 2 - 1) * chaos * 0.5, 0, 1);  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大）；混亂度越高，第一次切落在飛行的哪裡越分散 */
            var L, cFirst;                                  /* L：這一波的發射時間；cFirst：這一波第一次切的時間 */
            if (k === 0) { L = 0.2; cFirst = L + u1 * T; }
            else { cFirst = lastCut + gap * kit.randFloat(0.85, 1.2, rand); L = cFirst - u1 * T; if (L < 0.2) { cFirst += 0.2 - L; L = 0.2; } }  /* 不會比開場早發射 */
            var slots = []; for (i = 0; i < n; i++) slots.push(i);
            for (i = n - 1; i > 0; i--) { var jj = Math.floor(rand() * (i + 1)), tmp = slots[i]; slots[i] = slots[jj]; slots[jj] = tmp; }  /* 洗牌：同一波的水果各佔畫面寬度的一格，左右分開，不會疊在一起 */
            volleys.push(n);
            for (i = 0; i < n; i++, k++) {
                var c = Math.round((cFirst + d[i]) * 1000) / 1000; plan.push(c);
                var j = idx[k], s = rand() * S, t = L + s, u = (c - t) / T;
                var sg = rand() < 0.5 ? -1 : 1, x0 = 0.18 + 0.64 / n * (slots[i] + kit.randFloat(0.15, 0.85, rand));
                fruits.push({
                    rank: k + 1, label: labels[j], value: values[j], color: kit.randInt(0, FRUITS - 1, rand), x0: Math.round(x0 * 1000) / 1000, vx: Math.round(sg * kit.randFloat(0.02, VX / 472, rand) * 1000) / 1000,
                    A: Math.round(kit.randFloat(APEX[0], APEX[1], rand) * 1000) / 1000, t: Math.round(t * 1000) / 1000, T: T, u: Math.round(u * 1000) / 1000, a0: Math.round(kit.randFloat(0, 360, rand)), w: Math.round((rand() < 0.5 ? -1 : 1) * kit.randFloat(om * 0.6, om, rand)), volley: volleys.length - 1
                });
            }
            lastCut = plan[k - 1];
        }
        return { level: level, expr: expr, N: N, flight: T, plan: plan, fruits: fruits, volleys: volleys };
    }
    /* 煙火式的高度曲線：飛行進度 u（0～1）→ 高度比例 h（0＝在畫面下方、1＝頂點）。
       前 RISE_FRAC 的時間往上衝：h ＝ 1 − (1 − p)^RISE_EASE（p 是這一段的進度；一開始最快、越爬越慢）；
       之後慢慢落下：h ＝ 1 − p^FALL_EASE（p 是下降這一段的進度；從頂點開始越掉越快，FALL_EASE 越小掉得越平緩） */
    function lift(u) {
        if (u <= 0 || u >= 1) return 0;
        if (u < RISE_FRAC) return 1 - Math.pow(1 - u / RISE_FRAC, RISE_EASE);  /* Math.pow(x, y)：x 的 y 次方 */
        return 1 - Math.pow((u - RISE_FRAC) / (1 - RISE_FRAC), FALL_EASE);
    }
    /* 水果 f 在時間 t 的位置：geom ＝ { W, H, R }；飛行之外（還沒拋、已經掉出去）回傳 null。
       飛行進度 u ＝ (t − 拋出時間) ÷ 飛行時間（0～1）。
       x：W·x0 ＋ W·vx·(t − 拋出時間)，限制在 R～W−R 之內（不會飄出左右邊界）；
       y（水果中心）：從畫面底下 yb ＝ H ＋ R 噴出、再掉回 yb；高度照煙火式曲線 lift(u)：y ＝ yb − (A·H)·lift(u)，頂點（u＝RISE_FRAC）在 yb − A·H。 */
    function fruitPos(f, t, geom) {
        var tau = t - f.t; if (tau < 0 || tau > f.T) return null;
        var u = tau / f.T, yb = geom.H + geom.R, y = yb - (f.A * geom.H) * lift(u);
        var x = geom.W * f.x0 + geom.W * f.vx * tau; x = Math.max(geom.R, Math.min(geom.W - geom.R, x));
        return { x: x, y: y, ang: f.a0 + f.w * tau, u: u };
    }
    /* 這個位置的水果有沒有在畫面上（至少有一半露出來） */
    function onScreen(p, geom) { return p && p.y <= geom.H + geom.R * 0.2 && p.y >= -geom.R; }
    /* 點到線段的距離 */
    function distToSeg(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, s = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
        return { d: Math.hypot(px - (ax + s * dx), py - (ay + s * dy)), s: s };
    }
    /* 手指這一段線（a→b）切到的水果：依沿著線的順序（s 由小到大）；cand＝[{ id, x, y }]，R＝水果半徑 */
    function sliceSegment(cand, ax, ay, bx, by, R) {
        var hits = [];
        cand.forEach(function (c) { var r = distToSeg(c.x, c.y, ax, ay, bx, by); if (r.d <= R + HIT_PAD) hits.push({ id: c.id, s: r.s, d: r.d }); });  /* forEach：對陣列的每個元素各做一次 */
        hits.sort(function (p, q) { return p.s - q.s || p.d - q.d; });
        return hits.map(function (x) { return x.id; });
    }
    /* 切到 hitIds（依順序）而「下一號」是 next：回傳 { ok（有沒有照順序）, cut（切成功的顆數）, wrong（切錯的那一顆，沒有就 null）} */
    function judgeCuts(hitIds, next, rankOf) {
        var cut = 0, n = next;
        for (var i = 0; i < hitIds.length; i++) { if (rankOf(hitIds[i]) !== n) return { ok: false, cut: cut, wrong: hitIds[i] }; cut++; n++; }
        return { ok: true, cut: cut, wrong: null };
    }
    function whyText(kind, q, expected, got) {
        if (kind === 'wrong') return '切錯順序了！先要切「' + expected.label + '」' + (q.expr ? '（答案 ' + expected.value + '）' : '') + '，你切了「' + got.label + '」' + (q.expr ? '（答案 ' + got.value + '）' : '');
        return '「' + expected.label + '」' + (q.expr ? '（答案 ' + expected.value + '）' : '') + '掉下去了，還沒被切到';
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 20) return '切水果大師！';
        if (n >= 12) return '眼明手快！';
        if (n >= 6) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '照號碼順序一顆一顆切！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'ordercut-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[照號切水果] 第 ' + level + ' 關：' + (q.expr ? '算式' : '數字') + '、' + q.N + ' 顆；飛行 ' + q.flight + ' 秒；計畫切的時間 ' + q.plan.map(function (v) { return v.toFixed(1); }).join('、') + '；混亂度 ' + chaosFor(level));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, R = radiusFor(level, W), geom = { W: W, H: H, R: R };
        var field = h('div', { 'class': 'ordercut-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        kit.bgStripe(field, api.my, level, BG);        /* 在木板上墊一層淡淡的旋轉螺紋（BG.from 關之後才出現），水果畫在它上面 */
        var tip = h('div', { 'class': 'qz-note ordercut-tip', text: q.expr ? '照答案由小到大，一顆一顆切！' : (level === 1 ? '照號碼 1、2、3… 的順序，用手指劃過去切！' : '照號碼順序切（6 和 9 看底線）') });
        field.appendChild(tip);
        var next = h('div', { 'class': 'ordercut-next', text: '下一個：' + (q.expr ? '最小的' : '1') }); field.appendChild(next);
        var svg = kit.svg('svg', { 'class': 'ordercut-trail', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H }, field), trail = kit.svg('polyline', { 'class': 'ordercut-trail__l', points: '' }, svg);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        var els = q.fruits.map(function (f, i) {
            var el = h('div', { 'class': 'ordercut-fruit ordercut-f' + f.color + (q.expr ? ' ordercut-fruit--expr' : '') });
            el.style.cssText = 'width:' + 2 * R + 'px;height:' + 2 * R + 'px;display:none;';
            el.appendChild(h('div', { 'class': 'ordercut-leaf' }));
            el.appendChild(h('div', { 'class': 'ordercut-label', text: f.label }));
            field.appendChild(el); return el;
        });
        var state = q.fruits.map(function () { return 'wait'; });       /* 'wait'（還沒拋）｜'fly'（在空中）｜'cut'（已切）｜'gone'（掉出去了） */
        var nextRank = 1, phase = 'play', t0 = performance.now() + LEAD_S * 1000, pts = [], down = null, tFreeze = 0, posOf = [];  /* performance.now()：高精度的時間（毫秒），計時用 */
        function nowT() { return (performance.now() - t0) / 1000; }
        function rankOf(id) { return q.fruits[id].rank; }
        function expectedFruit() { return q.fruits[nextRank - 1]; }
        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint(t) {
            q.fruits.forEach(function (f, i) {
                if (state[i] === 'cut' || state[i] === 'gone') return;
                var p = fruitPos(f, t, geom); posOf[i] = p;
                if (!p) { els[i].style.display = 'none'; return; }
                els[i].style.display = 'block'; els[i].style.transform = 'translate3d(' + (p.x - R).toFixed(1) + 'px,' + (p.y - R).toFixed(1) + 'px,0) rotate(' + p.ang.toFixed(1) + 'deg)';
                state[i] = 'fly';
            });
        }
        /* api.over：這一關已經結束（例如測試用 debug.goto 跳關）就不要再動作——kit 的 api.fail／api.pass 是對「目前這一關」生效，舊關卡的迴圈如果還在跑會誤殺新的一關 */
        api.my.loop(function (now) {                    /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (phase !== 'play' || api.over || !stage.isConnected) return false;
            var t = nowT(); paint(t);
            /* 掉出畫面還沒被切：失敗 */
            for (var i = 0; i < q.fruits.length; i++) if (state[i] === 'fly' && t > q.fruits[i].t + q.fruits[i].T - 0.02) { state[i] = 'gone'; els[i].style.display = 'none'; lost(i); return; }
        });
        /* 保底：rAF 被暫停時，用計時器檢查有沒有水果掉出去 */
        (function guard() { api.after(300, function () { if (phase !== 'play' || api.over) return; var t = nowT(); for (var i = 0; i < q.fruits.length; i++) if (state[i] !== 'cut' && state[i] !== 'gone' && t > q.fruits[i].t + q.fruits[i].T + 0.05) { state[i] = 'gone'; lost(i); return; } guard(); }); })();  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        if (level === 1 && kit.once('ordercut.hint')) api.after(Math.round((LEAD_S + q.plan[0] - 0.9) * 1000), function () {  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            if (phase !== 'play') return; var f = q.fruits[0], p = fruitPos(f, q.plan[0] - 0.4, geom) || { x: W / 2, y: H / 2 };
            kit.hintOn(stage, null, { mode: 'drag', x: Math.max(40, p.x - 90), y: p.y, dx: 180, dy: 0, delay: 100, text: '劃過 1 號水果' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        });

        /* 手指劃過畫面：每一小段線檢查切到哪些水果 */
        field.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (phase !== 'play' || api.over || down) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            var p = kit.localPt(e, field); down = { id: e.pointerId, x: p.x, y: p.y }; pts = [[p.x, p.y]]; drawTrail();
        });
        field.addEventListener('pointermove', function (e) {
            if (!down || e.pointerId !== down.id || phase !== 'play') return;
            var p = kit.localPt(e, field); slice(down.x, down.y, p.x, p.y); down.x = p.x; down.y = p.y; pts.push([p.x, p.y]); if (pts.length > 10) pts.shift(); drawTrail();
        });
        function up(e) { if (down && e.pointerId === down.id) { down = null; api.after(160, function () { pts = []; drawTrail(); }); } }
        field.addEventListener('pointerup', up); field.addEventListener('pointercancel', up);
        function drawTrail() { trail.setAttribute('points', pts.map(function (p) { return p[0].toFixed(0) + ',' + p[1].toFixed(0); }).join(' ')); }  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        function slice(ax, ay, bx, by) {
            var t = nowT(), cand = [];
            q.fruits.forEach(function (f, i) { if (state[i] !== 'fly') return; var p = fruitPos(f, t, geom); if (onScreen(p, geom)) cand.push({ id: i, x: p.x, y: p.y }); });
            var hits = sliceSegment(cand, ax, ay, bx, by, R); if (!hits.length) return;
            var r = judgeCuts(hits, nextRank, rankOf);
            for (var k = 0; k < r.cut; k++) cutFruit(hits[k]);
            if (!r.ok) wrongCut(r.wrong);
            else if (nextRank > q.N) win();
        }
        function cutFruit(i) {
            state[i] = 'cut'; nextRank++; Sfx.play('click');  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            var p = posOf[i] || fruitPos(q.fruits[i], nowT(), geom); els[i].style.display = 'none';
            if (p) [-1, 1].forEach(function (s) { var half = h('div', { 'class': 'ordercut-half ordercut-f' + q.fruits[i].color + (s < 0 ? ' ordercut-half--l' : ' ordercut-half--r') }); half.style.cssText = 'width:' + R + 'px;height:' + 2 * R + 'px;left:' + (p.x - (s < 0 ? R : 0)).toFixed(1) + 'px;top:' + (p.y - R).toFixed(1) + 'px;'; field.appendChild(half); api.after(30, function () { half.style.transform = 'translate(' + (s * 40) + 'px,60px) rotate(' + (s * 40) + 'deg)'; half.style.opacity = '0'; }); api.after(700, function () { if (half.parentNode) half.parentNode.removeChild(half); }); });
            next.textContent = nextRank > q.N ? '全部切完！' : '下一個：' + (q.expr ? '第 ' + nextRank + ' 小的' : q.fruits[nextRank - 1].label);  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
        }
        /* 過關：鎖住畫面、顯示成功效果，並呼叫 api.pass 進下一關（或結算） */
        function win() {
            if (phase !== 'play' || api.over) return; phase = 'end'; info('全部照順序切完了！', true);
            kit.flash(stage, true, api.my); Sfx.play('ok'); api.pass({ delay: 1500 });  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
        }
        function wrongCut(id) { fail('wrong', q.fruits[id], id); }
        function lost(i) { fail('lost', q.fruits[i], i); }
        function info(text, ok) { var el = h('div', { 'class': 'qz-note ordercut-info ' + (ok ? 'ordercut-info--ok' : 'ordercut-info--bad'), text: text }); field.appendChild(el); }
        /* 結束：所有水果停在空中，每顆標上「第幾個要切」，切錯的標紅、本來該切的標綠 */
        function fail(kind, got, gotId) {
            if (phase !== 'play' || api.over) return; phase = 'end'; tFreeze = nowT();
            var exp = expectedFruit(), why = whyText(kind, q, kind === 'lost' ? got : exp, got);
            q.fruits.forEach(function (f, i) {
                if (state[i] === 'cut' || state[i] === 'gone') return;                    /* 已經切掉的、掉出去的不畫 */
                var p = fruitPos(f, tFreeze, geom); if (!p || !onScreen(p, geom)) return;
                els[i].style.display = 'block'; els[i].style.transform = 'translate3d(' + (p.x - R).toFixed(1) + 'px,' + (p.y - R).toFixed(1) + 'px,0) rotate(0deg)';
                var b = h('div', { 'class': 'ordercut-badge' + (i === gotId && kind === 'wrong' ? ' ordercut-badge--bad' : (f.rank === nextRank ? ' ordercut-badge--ok' : '')), text: '第 ' + f.rank + (q.expr ? '＝' + f.value : '') }); b.style.cssText = 'left:' + (p.x - 36).toFixed(1) + 'px;top:' + (p.y + R * 0.4).toFixed(1) + 'px;'; field.appendChild(b);
                if (i === gotId && kind === 'wrong') els[i].classList.add('ordercut-fruit--bad'); else if (f.rank === nextRank) els[i].classList.add('ordercut-fruit--ok');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            });
            if (kind === 'lost') { els[gotId].style.display = 'none'; }
            info(why, false); kit.flash(stage, false, api.my);
            api.fail({ delay: 4000, lines: [why, '已經照順序切了 ' + (nextRank - 1) + ' 顆（一共 ' + q.N + ' 顆）', q.expr ? '答案由小到大：' + q.fruits.map(function (f) { return f.value; }).join('、') : '順序：1 到 ' + q.N] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 驗證用：在計畫的時間依序切（solve，直接呼叫切水果）；故意先切第 2 號（wrong）；只排一次 */
        var armed = false;
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () {
            if (armed || phase !== 'play') return; armed = true;
            q.fruits.forEach(function (f, k) { api.after(Math.max(0, Math.round((q.plan[k] - nowT()) * 1000)), function () { if (phase !== 'play') return; var i = f.rank - 1; if (state[i] !== 'fly') { paint(nowT()); } if (nextRank === f.rank && state[i] === 'fly') { cutFruit(i); if (nextRank > q.N) win(); } }); });
        };
        api.wrong = function () {
            if (armed || phase !== 'play') return; armed = true;
            api.after(Math.max(0, Math.round((q.plan[0] - nowT()) * 1000)), function () { if (phase !== 'play') return; paint(nowT()); var i = Math.min(1, q.N - 1); if (q.fruits[i].rank !== nextRank && state[i] === 'fly') wrongCut(i); else if (state[i] !== 'fly') { state[i] = 'fly'; wrongCut(i); } });
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '照號切水果',
        rule: '水果像煙火一樣噴上來（常常好幾顆同時），每顆上面寫一個數字。**照號碼 1、2、3… 的順序**，用手指在畫面上劃過去切它。**切錯順序就結束**，水果掉到畫面下面還沒切到也結束。水果會在空中旋轉，**6 和 9 看底線**（底線在下面才是正的）。**第 15 關起**，水果上面改成算式（像「2＋3」「12÷4」），要照答案由小到大的順序切！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            isExpr: isExpr, countFor: countFor, flightFor: flightFor, gapFor: gapFor, chaosFor: chaosFor, omegaFor: omegaFor, radiusFor: radiusFor, makeExprFor: makeExprFor, mulPairs: mulPairs, makeExprs: makeExprs, volleyFor: volleyFor, lift: lift, makeLevel: makeLevel, fruitPos: fruitPos, onScreen: onScreen, distToSeg: distToSeg, sliceSegment: sliceSegment, judgeCuts: judgeCuts, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, NUM_COUNT: NUM_COUNT, NUM_RAMP: NUM_RAMP, EXPR_FROM: EXPR_FROM, EXPR_COUNT: EXPR_COUNT, EXPR_RAMP: EXPR_RAMP, MULDIV_FROM: MULDIV_FROM, FLIGHT_S: FLIGHT_S, GAP_CUT: GAP_CUT, CHAOS: CHAOS, OMEGA_DEG: OMEGA_DEG, U_MIN: U_MIN, U_MAX: U_MAX, U_SPREAD: U_SPREAD, APEX: APEX, VOLLEY: VOLLEY, VOLLEY_SPREAD_S: VOLLEY_SPREAD_S, RISE_FRAC: RISE_FRAC, RISE_EASE: RISE_EASE, FALL_EASE: FALL_EASE, VX: VX, R_NUM: R_NUM, R_EXPR: R_EXPR, HIT_PAD: HIT_PAD, LEAD_S: LEAD_S, MAX_LEVEL: MAX_LEVEL, FRUITS: FRUITS
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
