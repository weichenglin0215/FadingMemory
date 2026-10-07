/* ═══════════════════════════════════════════════════════════════════
   reaction_same.js — 秒反應・相同嗎？（原「跟前面一樣嗎」）
   畫面分成上下兩格。先在上格亮出一個東西（預設 1 秒），然後上格變成空白（預設 0.5 秒），
   再在下格亮出第二個東西、同時出現最下面兩顆按鈕「不相同」「相同」，判斷兩個是不是一樣。
   答案按鈕永遠只有這兩顆。
   ───────────────────────────────────────────────────────────────────
   · 題型隨題號解鎖（第 UNLOCK 題起加入）：
        水果（是不是同一種水果）→ 圖形（比大小／比形狀／比顏色，每題只比其中一項，題目會寫在最上面）
        → 數字（是不是同一個數字）→ 算式（加減，算出來的答案是不是一樣）→ 算式（加減乘除）。
   · 「一樣」與「不一樣」每 10 題裡各 5 題（洗牌決定哪幾題是一樣），不是每題擲骰子。
   · 「不一樣」的題目越後面越接近：水果換成長得像的、圖形大小差距／色相差距變小、數字只差一位或對調、
     算式答案只差 1～2。「一樣」的題目也不會長得完全一模一樣（圖形的其他屬性會亂換、算式寫法不同），
     所以不能只靠「長得像不像」猜。
   · 難度（第 1 → RAMP_Q 題線性）：上格顯示時間 1.0 → 0.5 秒、空白時間 0.5 → 1.0 秒、
     看到下格後的作答時限 4 → 2 秒、「不一樣」的相似程度 0% → 85%。
   · 有 LIVES 次機會，答錯或超時扣一次。成績＝答對題數（越多越好）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'same';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 same 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '答對題數', min: 1, max: 500 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 難度與題型的設定都集中在這裡，想調難度只改這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 難度從第 1 題線性變到第 RAMP_Q 題，之後維持最難 */
    var RAMP_Q = 30;
    var SHOW_START = 1.0, SHOW_END = 0.5;       /* 上格顯示秒數 */
    var BLANK_START = 0.5, BLANK_END = 1.0;     /* 上格空白秒數 */
    var ASK_START = 4.0, ASK_END = 2.0;         /* 看到下格後的作答時限（秒） */
    var SIM_START = 0, SIM_END = 0.85;          /* 「不一樣」題用相似選項的機率 */
    /* 物件 { 名稱: 數字 }：每種題型從第幾題起解鎖 */
    var UNLOCK = { fruit: 1, shape: 7, number: 13, expr1: 19, expr2: 25 };   /* 第幾題起解鎖 */
    /* LIVES：有幾次機會（答錯或超時扣一次） */
    var LIVES = 3;
    /* 揭曉答案後停多久（毫秒）才出下一題 */
    var REVEAL_MS = 1000;

    /* 候選水果清單（字串是 drawFruit 裡用來判斷畫哪種水果的代號） */
    var FRUITS = ['apple', 'banana', 'orange', 'grape', 'strawberry', 'pear', 'watermelon', 'cherry'];
    /* 代號 → 中文名稱，用在主控台輸出與結算畫面 */
    var FRUIT_NAME = { apple: '蘋果', banana: '香蕉', orange: '橘子', grape: '葡萄', strawberry: '草莓', pear: '梨子', watermelon: '西瓜', cherry: '櫻桃' };
    /* 長得像的水果分成一組：「不相同」的題目越後面越會從同組挑，故意讓人容易看錯 */
    var FRUIT_GROUPS = [['apple', 'strawberry', 'cherry'], ['banana', 'pear', 'orange'], ['grape', 'watermelon']];
    /* 圖形的種類 */
    var SHAPES = ['circle', 'square', 'triangle', 'hexagon', 'star', 'diamond'];
    /* 長得像的圖形對照表（例如正方形和菱形像） */
    var SIM_SHAPE = { circle: ['hexagon'], square: ['diamond'], diamond: ['square', 'triangle'], triangle: ['diamond'], hexagon: ['circle', 'star'], star: ['hexagon'] };
    /* 圖形縮放比例的上下限，避免圖形太小看不到或超出格子 */
    var SCALE_MIN = 0.35, SCALE_MAX = 1.0;

    /* 最佳紀錄顯示文字 */
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 題'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 難度進度 0～1：clamp 把值限制在 0 到 1 之間 */
    function prog(q) { return kit.clamp((q - 1) / (RAMP_Q - 1), 0, 1); }
    /* 上格顯示秒數（隨題號線性變短） */
    function showSec(q) { return kit.ramp(q, SHOW_START, SHOW_END, RAMP_Q); }
    /* 空白秒數（隨題號線性變長，考記憶） */
    function blankSec(q) { return kit.ramp(q, BLANK_START, BLANK_END, RAMP_Q); }
    /* 作答時限（隨題號線性變短） */
    function askSec(q) { return kit.ramp(q, ASK_START, ASK_END, RAMP_Q); }
    /* 「不相同」題使用相似選項的機率（越後面越高） */
    function simP(q) { return kit.ramp(q, SIM_START, SIM_END, RAMP_Q); }
    /* 目前這一題有哪些題型可選（依解鎖題號累加） */
    function unlockedTypes(q) {
        var t = [];
        if (q >= UNLOCK.fruit) t.push('fruit');
        if (q >= UNLOCK.shape) t.push('shape');
        if (q >= UNLOCK.number) t.push('number');
        if (q >= UNLOCK.expr1) t.push('expr');
        return t;
    }
    /* 挑這一題的題型：只有一種就選它；有多種時 50% 選最新解鎖的，其他平均分配（讓新題型更常出現） */
    /* 這一題的題型：只有一種就是它；多種時 50% 挑最新解鎖的，其餘平均 */
    /* rand = rand || Math.random：外面沒有傳亂數函式就用內建的 Math.random。測試時會傳固定種子的亂數，讓結果可重現 */
    function pickType(q, rand) {
        rand = rand || Math.random;
        var t = unlockedTypes(q);
        if (t.length === 1) return t[0];
        return rand() < 0.5 ? t[t.length - 1] : kit.pick(t, rand);
    }
    /* 每 10 題裡 5 題「相同」、5 題「不相同」，洗牌決定順序（不是每題擲骰子，才不會連續出現同一種答案太多次） */
    /* 每 10 題裡 5 題一樣、5 題不一樣（洗牌）。blockIdx＝第幾個 10 題 */
    function sameFlags(rand) {
        var a = [true, true, true, true, true, false, false, false, false, false];
        return kit.shuffle(a, rand);
    }

    /* 出水果題：same 為 true 兩邊相同；否則 B 換成別種（越後面越有機會是長得像的） */
    function makeFruit(q, same, rand) {
        /* a：上格的水果；b 先設成跟 a 一樣 */
        var a = kit.pick(FRUITS, rand), b = a;
        if (!same) {
            /* 找出 a 所屬的相似群組 */
            var grp = FRUIT_GROUPS.filter(function (g) { return g.indexOf(a) >= 0; })[0];
            /* 同組裡「不是 a」的水果＝長得像的候選 */
            var near = grp.filter(function (f) { return f !== a; });
            /* 有長得像的候選，而且亂數小於相似機率時，就選長得像的 */
            if (near.length && rand() < simP(q)) b = kit.pick(near, rand);
            /* 否則一直重抽直到跟 a 不同（do...while 至少會執行一次） */
            else { do { b = kit.pick(FRUITS, rand); } while (b === a); }
        }
        /* 回傳一個題目物件：A、B 是兩格要畫的東西，same 是正確答案 */
        return { type: 'fruit', prompt: '是同一種水果嗎？', A: { kind: 'fruit', fruit: a }, B: { kind: 'fruit', fruit: b }, same: same };
    }

    /* 出圖形題：每題只比較「大小／形狀／顏色」其中一項，題目會告訴玩家比哪一項 */
    function makeShape(q, same, rand) {
        var attr = kit.pick(['size', 'shape', 'color'], rand);
        /* p：難度進度，用在 kit.lerp（線性插值）算出差距，越後面差距越小越難分辨 */
        var p = prog(q);
        /* 隨機產生一個圖形（形狀、色相 hue 0~359、縮放） */
        function randItem() { return { kind: 'shape', shape: kit.pick(SHAPES, rand), hue: kit.randInt(0, 359, rand), scale: kit.randFloat(0.55, 1.0, rand) }; }
        var A = randItem(), B = randItem();
        /* 比大小：不相同時，B 的縮放是 A 的 r 倍（變大或變小）；r 隨難度從 1.7 縮到 1.12 */
        if (attr === 'size') {
            if (same) B.scale = A.scale;
            else {
                var r = kit.lerp(1.7, 1.12, p), up = rand() < 0.5;
                B.scale = up ? A.scale * r : A.scale / r;
                /* 如果超出上下限，就反方向 */
                if (B.scale > SCALE_MAX || B.scale < SCALE_MIN) B.scale = up ? A.scale / r : A.scale * r;
            }
        /* 比形狀 */
        } else if (attr === 'shape') {
            if (same) B.shape = A.shape;
            else {
                var sim = SIM_SHAPE[A.shape];
                if (rand() < simP(q)) B.shape = kit.pick(sim, rand);
                else { do { B.shape = kit.pick(SHAPES, rand); } while (B.shape === A.shape); }
            }
        /* 比顏色：色相差距從 110 度縮到 22 度；加 720 再取 360 的餘數，避免出現負數 */
        } else {
            if (same) B.hue = A.hue;
            else {
                var d = kit.lerp(110, 22, p);
                B.hue = (A.hue + (rand() < 0.5 ? d : -d) + 720) % 360;
            }
        }
        /* 題目文字 */
        var promptMap = { size: '比一比：大小一樣嗎？', shape: '比一比：形狀一樣嗎？', color: '比一比：顏色一樣嗎？' };
        return { type: 'shape', attr: attr, prompt: promptMap[attr], A: A, B: B, same: same };
    }

    /* 製造「只差一點」的數字：對調相鄰兩位，或其中一位 ±1（結果不能和原數相同、不能 0 開頭） */
    /* 兩個數字「只差一點」：對調相鄰兩位，或其中一位 ±1（結果不能等於原數、不能以 0 開頭） */
    function nearNumber(n, rand) {
        var s = String(n);
        /* 最多試 30 次，避免無窮迴圈 */
        for (var tries = 0; tries < 30; tries++) {
            /* split('') 把數字字串拆成一個一個字元的陣列 */
            var arr = s.split('');
            if (rand() < 0.5) {
                var i = kit.randInt(0, arr.length - 2, rand);
                var t = arr[i]; arr[i] = arr[i + 1]; arr[i + 1] = t;
            } else {
                var j = kit.randInt(0, arr.length - 1, rand);
                var v = (+arr[j] + (rand() < 0.5 ? 1 : 9)) % 10;
                arr[j] = String(v);
            }
            /* join('') 再接回字串 */
            var out = arr.join('');
            if (out !== s && out.charAt(0) !== '0') return +out;
        }
        return n + 1;
    }
    /* 出數字題：第 UNLOCK.expr1 題之前 2 位數，之後 3 位數 */
    function makeNumber(q, same, rand) {
        var digits = q < UNLOCK.expr1 ? 2 : 3;
        /* Math.pow(10, 位數-1)＝該位數的最小值（例如 3 位數是 100），hi 是最大值（999） */
        var lo = Math.pow(10, digits - 1), hi = Math.pow(10, digits) - 1;
        var a = kit.randInt(lo, hi, rand), b = a;
        if (!same) {
            if (rand() < simP(q)) b = nearNumber(a, rand);
            else { do { b = kit.randInt(lo, hi, rand); } while (b === a); }
        }
        return { type: 'number', prompt: '是同一個數字嗎？', A: { kind: 'text', text: String(a), value: a }, B: { kind: 'text', text: String(b), value: b }, same: same };
    }

    /* 把數值 v 寫成算式（例如 12 → "7 + 5"）；寫不出來（例如質數沒辦法用乘法）就回傳 null */
    /* 用運算符號把數值 v 寫成算式；寫不出來（例如質數用乘法）回傳 null */
    function exprFor(v, op, rand) {
        if (op === '+') { if (v < 2) return null; var a = kit.randInt(1, v - 1, rand); return a + ' + ' + (v - a); }
        if (op === '-') { var b = kit.randInt(1, 9, rand); return (v + b) + ' − ' + b; }
        /* 乘法：找 v 的因數 */
        if (op === '×') {
            var f = [];
            for (var x = 2; x * x <= v; x++) if (v % x === 0) f.push(x);
            if (!f.length) return null;
            var x1 = kit.pick(f, rand), y1 = v / x1;
            return rand() < 0.5 ? x1 + ' × ' + y1 : y1 + ' × ' + x1;
        }
        /* 除法：v×k ÷ k = v；超過 200 就放棄，避免算式太大 */
        if (op === '÷') { var k = kit.randInt(2, 9, rand); if (v * k > 200) return null; return (v * k) + ' ÷ ' + k; }
        return null;
    }
    /* 最多試 60 次寫出一個和 avoid 不同的算式；實在不行就用 "v + 0" 保底 */
    function makeExprText(v, ops, rand, avoid) {
        for (var tries = 0; tries < 60; tries++) {
            var t = exprFor(v, kit.pick(ops, rand), rand);
            if (t && t !== avoid) return t;
        }
        return v + ' + 0';
    }
    /* 出算式題：兩邊算式不同寫法，算出的答案要不要一樣由 same 決定 */
    function makeExpr(q, same, rand) {
        var ops = q >= UNLOCK.expr2 ? ['+', '−', '×', '÷'] : ['+', '−'];
        /* 顯示用的減號 − 要換成一般的 -（內部計算用） */
        ops = ops.map(function (o) { return o === '−' ? '-' : o; });
        /* 數值上限：加減題小一點，四則題大一點 */
        var vMax = q >= UNLOCK.expr2 ? 60 : 25;
        var va = kit.randInt(6, vMax, rand);
        var vb = va;
        if (!same) {
            /* 不相同時，答案差 d（越後面差越小，最小 1） */
            var d = Math.max(1, Math.round(kit.lerp(3, 1, prog(q))));
            vb = va + (rand() < 0.5 ? d : -d);
            if (vb < 2) vb = va + d;
        }
        var ta = makeExprText(va, ops, rand, null);
        var tb = makeExprText(vb, ops, rand, ta);
        return { type: 'expr', prompt: '算出來的答案一樣嗎？', A: { kind: 'text', text: ta, value: va }, B: { kind: 'text', text: tb, value: vb }, same: same };
    }

    /* 依題型分派到對應的出題函式 */
    function makeQuestion(q, same, rand) {
        rand = rand || Math.random;
        var type = pickType(q, rand);
        if (type === 'fruit') return makeFruit(q, same, rand);
        if (type === 'shape') return makeShape(q, same, rand);
        if (type === 'number') return makeNumber(q, same, rand);
        return makeExpr(q, same, rand);
    }

    /* 畫圖函式：把水果、圖形畫成 SVG 向量圖。座標系固定（水果 200×200、圖形以 0,0 為中心），畫面縮放時永遠銳利 */
    /* ═══ 畫圖 ═══ */
    /* S 是簡寫：建立一個 SVG 元素並放進 svg。每個 S('path', {d: ...}) 畫一條路徑；d 是 SVG 路徑指令（M 移動、C 曲線、Z 封閉） */
    function drawFruit(kind, svg) {
        var S = function (tag, attrs) { return kit.svg(tag, attrs, svg); };
        if (kind === 'apple') {
            S('path', { d: 'M100 62 C 62 40, 22 72, 30 122 C 38 168, 76 186, 100 174 C 124 186, 162 168, 170 122 C 178 72, 138 40, 100 62 Z', fill: 'hsl(4,78%,52%)', stroke: 'hsl(4,60%,32%)', 'stroke-width': 4 });
            S('path', { d: 'M100 62 C 98 44, 104 30, 116 22', stroke: 'hsl(28,50%,28%)', 'stroke-width': 8, fill: 'none', 'stroke-linecap': 'round' });
            S('path', { d: 'M110 42 C 130 22, 154 30, 158 48 C 140 58, 120 56, 110 42 Z', fill: 'hsl(120,45%,42%)' });
        } else if (kind === 'banana') {
            S('path', { d: 'M28 66 C 52 152, 138 176, 178 108 C 170 100, 160 96, 150 96 C 128 134, 82 128, 54 58 Z', fill: 'hsl(50,95%,58%)', stroke: 'hsl(40,70%,34%)', 'stroke-width': 4, 'stroke-linejoin': 'round' });
            S('path', { d: 'M28 66 L 54 58', stroke: 'hsl(30,50%,25%)', 'stroke-width': 9, 'stroke-linecap': 'round' });
        } else if (kind === 'orange') {
            S('circle', { cx: 100, cy: 112, r: 72, fill: 'hsl(28,95%,55%)', stroke: 'hsl(20,70%,34%)', 'stroke-width': 4 });
            S('path', { d: 'M100 40 C 104 24, 124 18, 136 26 C 128 40, 112 46, 100 40 Z', fill: 'hsl(120,45%,40%)' });
            [[70, 96], [118, 90], [92, 132], [132, 128], [66, 138]].forEach(function (p) { S('circle', { cx: p[0], cy: p[1], r: 3, fill: 'hsl(24,80%,40%)' }); });
        } else if (kind === 'grape') {
            [[78, 82], [122, 82], [58, 118], [100, 118], [142, 118], [78, 154], [122, 154], [100, 186]].forEach(function (p) {
                S('circle', { cx: p[0], cy: p[1] - 10, r: 24, fill: 'hsl(282,48%,46%)', stroke: 'hsl(282,45%,28%)', 'stroke-width': 3 });
                S('circle', { cx: p[0] - 7, cy: p[1] - 18, r: 5, fill: 'rgba(255,255,255,0.45)' });
            });
            S('path', { d: 'M100 56 C 100 40, 104 28, 112 20', stroke: 'hsl(28,50%,28%)', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round' });
            S('path', { d: 'M108 34 C 126 16, 150 22, 154 40 C 136 50, 118 48, 108 34 Z', fill: 'hsl(120,45%,42%)' });
        } else if (kind === 'strawberry') {
            S('path', { d: 'M100 186 C 40 152, 30 92, 50 72 C 70 52, 130 52, 150 72 C 170 92, 160 152, 100 186 Z', fill: 'hsl(350,80%,52%)', stroke: 'hsl(350,60%,30%)', 'stroke-width': 4 });
            [[78, 96], [122, 96], [100, 118], [74, 132], [126, 132], [100, 152], [88, 80], [112, 80]].forEach(function (p) { S('ellipse', { cx: p[0], cy: p[1], rx: 3, ry: 5, fill: 'hsl(50,90%,70%)' }); });
            S('path', { d: 'M100 58 L 70 40 L 88 62 L 56 62 L 86 72 L 100 66 L 114 72 L 144 62 L 112 62 L 130 40 Z', fill: 'hsl(120,45%,40%)' });
        } else if (kind === 'pear') {
            S('path', { d: 'M100 36 C 112 36, 118 48, 118 60 C 118 76, 152 90, 152 134 C 152 168, 128 188, 100 188 C 72 188, 48 168, 48 134 C 48 90, 82 76, 82 60 C 82 48, 88 36, 100 36 Z', fill: 'hsl(75,60%,55%)', stroke: 'hsl(75,45%,28%)', 'stroke-width': 4 });
            S('path', { d: 'M100 36 C 100 24, 104 16, 112 10', stroke: 'hsl(28,50%,28%)', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round' });
        } else if (kind === 'watermelon') {
            S('path', { d: 'M16 96 A 84 84 0 0 0 184 96 Z', fill: 'hsl(130,50%,32%)' });
            S('path', { d: 'M28 96 A 72 72 0 0 0 172 96 Z', fill: 'hsl(350,82%,60%)' });
            [[70, 120], [100, 134], [130, 120], [86, 148], [114, 148]].forEach(function (p) { S('ellipse', { cx: p[0], cy: p[1], rx: 4, ry: 7, fill: 'hsl(0,0%,15%)' }); });
        } else {   /* cherry */
            S('path', { d: 'M64 122 C 70 76, 90 40, 108 26 M138 130 C 136 84, 124 50, 108 26', stroke: 'hsl(100,35%,32%)', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' });
            S('circle', { cx: 64, cy: 144, r: 32, fill: 'hsl(350,80%,45%)', stroke: 'hsl(350,60%,25%)', 'stroke-width': 4 });
            S('circle', { cx: 140, cy: 152, r: 32, fill: 'hsl(350,80%,45%)', stroke: 'hsl(350,60%,25%)', 'stroke-width': 4 });
            S('path', { d: 'M108 26 C 126 10, 152 16, 158 32 C 140 42, 120 40, 108 26 Z', fill: 'hsl(120,45%,40%)' });
        }
    }
    /* 正多邊形的頂點座標字串（n 個頂點、半徑 r、起始角 rot）：用三角函式 cos／sin 算出每個頂點 */
    function polyPts(n, r, rot) {
        var pts = [];
        for (var k = 0; k < n; k++) { var a = rot + k * 2 * Math.PI / n; pts.push((r * Math.cos(a)).toFixed(1) + ',' + (r * Math.sin(a)).toFixed(1)); }
        return pts.join(' ');
    }
    /* 畫一個圖形（圓、方、三角、六邊形、菱形、星星）；顏色用 hsl(色相, 飽和度, 亮度) */
    function drawShape(item, svg) {
        var R = 92 * item.scale;
        var fill = 'hsl(' + Math.round(item.hue) + ',72%,56%)', stroke = 'hsl(' + Math.round(item.hue) + ',60%,30%)';
        var common = { fill: fill, stroke: stroke, 'stroke-width': 4, 'stroke-linejoin': 'round' };
        var attrs;
        if (item.shape === 'circle') { attrs = { cx: 0, cy: 0, r: R }; return kit.svg('circle', mix(attrs, common), svg); }
        if (item.shape === 'square') { attrs = { x: -R * 0.9, y: -R * 0.9, width: R * 1.8, height: R * 1.8 }; return kit.svg('rect', mix(attrs, common), svg); }
        if (item.shape === 'triangle') { attrs = { points: polyPts(3, R * 1.1, -Math.PI / 2) }; return kit.svg('polygon', mix(attrs, common), svg); }
        if (item.shape === 'hexagon') { attrs = { points: polyPts(6, R, 0) }; return kit.svg('polygon', mix(attrs, common), svg); }
        if (item.shape === 'diamond') { attrs = { points: (0 + ',' + (-R * 1.1) + ' ' + (R * 0.85) + ',0 0,' + (R * 1.1) + ' ' + (-R * 0.85) + ',0') }; return kit.svg('polygon', mix(attrs, common), svg); }
        var pts = [];
        for (var k = 0; k < 10; k++) { var rr = k % 2 ? R * 0.45 : R * 1.08, a = -Math.PI / 2 + k * Math.PI / 5; pts.push((rr * Math.cos(a)).toFixed(1) + ',' + (rr * Math.sin(a)).toFixed(1)); }
        return kit.svg('polygon', mix({ points: pts.join(' ') }, common), svg);
    }
    /* 合併兩個物件（b 的欄位蓋過 a 的欄位） */
    function mix(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

    /* 把一個東西畫進格子 box：水果／圖形畫 SVG，其他（數字、算式）畫文字 */
    function renderItem(box, item) {
        box.innerHTML = '';
        if (!item) return;
        if (item.kind === 'fruit') {
            var s = kit.svg('svg', { 'class': 'sm-svg', viewBox: '0 0 200 200' }, box);
            drawFruit(item.fruit, s);
        } else if (item.kind === 'shape') {
            var s2 = kit.svg('svg', { 'class': 'sm-svg', viewBox: '-100 -100 200 200' }, box);
            drawShape(item, s2);
        } else {
            box.appendChild(h('div', { 'class': 'sm-text' + (item.text.length > 4 ? ' sm-text--long' : ''), text: item.text }));
        }
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局 */
        function round(startAt) {
            /* 有舊的一局就先清掉（計時器、動畫迴圈都會停） */
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* q 目前題號（從 0 起算，next() 會先 +1）；right 答對數；lives 剩餘機會；state 目前階段（showA/blank/ask/reveal）；cur 目前這題 */
            var q = (startAt || 1) - 1, right = q, lives = LIVES, newRec = false, state = 'idle', cur = null;
            /* flags：這一輪 10 題的「相同／不相同」配額；genId：每出一題 +1，用來讓舊計時器知道自己過期了 */
            var flags = sameFlags(), genId = 0;   /* 從中間某題開始（失敗後繼續）時，這一輪 10 題的「相同／不相同」配額也要有 */

            /* 建立各個畫面元素：標題、提示、上格、下格、時間條、兩顆按鈕 */
            var head = h('div', { 'class': 'sm-head' });
            var prompt = h('div', { 'class': 'sm-prompt' });
            var boxA = h('div', { 'class': 'sm-box' });
            var boxB = h('div', { 'class': 'sm-box' });
            var tb = kit.timebar();
            var bNo = h('button', { 'class': 'btn btn--primary sm-btn', text: '不相同' });
            var bYes = h('button', { 'class': 'btn btn--go sm-btn', text: '相同' });
            var btns = h('div', { 'class': 'sm-btns' }, [bNo, bYes]);
            /* 按鈕一開始先隱藏（style.visibility='hidden' 隱藏但仍佔位置，版面不會跳動） */
            btns.style.visibility = 'hidden';
            /* 把所有元素依序放進畫面 */
            [head, prompt, boxA, boxB, tb.el, btns].forEach(function (n) { root.appendChild(n); });

            function meta() { ctx.setMeta(kit.meta(['答對 ' + right, '機會 ' + lives])); }
            function paintHead() { head.textContent = '第 ' + q + ' 題'; }

            /* next：出下一題 */
            function next() {
                if (my.dead) return;
                q++;
                /* my_id：這題的編號；之後每個計時器回呼都檢查 my_id === genId，確認自己沒過期 */
                var my_id = ++genId;
                /* 每 10 題重新洗一次「相同／不相同」配額 */
                if ((q - 1) % 10 === 0) flags = sameFlags();
                cur = makeQuestion(q, flags[(q - 1) % 10]);
                /* 主控台印出這題的實際內容與時間設定（除錯用） */
                try {
                    console.info('[相同嗎？] 第 ' + q + ' 題（' + cur.type + '）' + cur.prompt + ' 上：' + describe(cur.A) + '／下：' + describe(cur.B) + ' ⇒ ' + (cur.same ? '相同' : '不相同') +
                        '；上格 ' + showSec(q).toFixed(2) + ' 秒、空白 ' + blankSec(q).toFixed(2) + ' 秒、作答 ' + askSec(q).toFixed(2) + ' 秒');
                } catch (e) { }
                paintHead(); meta();
                prompt.textContent = cur.prompt;
                boxA.className = 'sm-box'; boxB.className = 'sm-box';
                boxB.innerHTML = ''; boxA.innerHTML = '';
                btns.style.visibility = 'hidden';
                tb.set(0);
                state = 'showA';
                renderItem(boxA, cur.A);
                Sfx.play('go');
                /* 上格顯示 showSec 秒後清空，進入空白階段；再等 blankSec 秒後顯示下格 */
                my.after(showSec(q) * 1000, function () {
                    if (my_id !== genId) return;
                    boxA.innerHTML = '';
                    state = 'blank';
                    my.after(blankSec(q) * 1000, function () {
                        if (my_id !== genId) return;
                        renderItem(boxB, cur.B);
                        btns.style.visibility = 'visible';
                        state = 'ask';
                        /* 作答階段開始：記錄開始時間 t0 與作答時限 lim（毫秒） */
                        var t0 = performance.now(), lim = askSec(q) * 1000;
                        /* my.loop：每個畫面更新一次，更新時間條；回傳 false 停止 */
                        my.loop(function (now) {
                            if (my_id !== genId || state !== 'ask') return false;
                            tb.set(1 - (now - t0) / lim);
                        });
                        /* 時間到還沒作答，視同答錯（answer(null)） */
                        my.after(lim, function () { if (my_id === genId && state === 'ask') answer(null); });
                    });
                });
            }
            /* 把一格的內容轉成文字（主控台輸出用） */
            function describe(it) { return it.kind === 'fruit' ? FRUIT_NAME[it.fruit] : (it.kind === 'shape' ? it.shape + ' 色相' + Math.round(it.hue) + ' 大小' + it.scale.toFixed(2) : it.text + (it.value != null && String(it.value) !== it.text ? '（=' + it.value + '）' : '')); }

            /* answer：處理作答（isSame 是 true/false，null 代表超時） */
            function answer(isSame) {
                if (state !== 'ask') return;
                state = 'reveal';
                tb.set(0);
                /* isSame === cur.same 就是答對 */
                var ok = isSame === cur.same;
                /* 揭曉：把上格內容重新顯示，兩格都標上對錯顏色 */
                renderItem(boxA, cur.A);       /* 揭曉：上格再亮出來，兩格一起看 */
                boxA.classList.add(ok ? 'sm-box--ok' : 'sm-box--bad');
                boxB.classList.add(ok ? 'sm-box--ok' : 'sm-box--bad');
                if (ok) { right++; Sfx.play('ok'); if (Reaction.setBest(ID, right, function (v, b) { return v > b; })) newRec = true; }
                else { lives--; Sfx.play('bad'); }
                prompt.textContent = (isSame == null ? '時間到！' : (ok ? '答對了！' : '答錯了…')) + '　正確是「' + (cur.same ? '相同' : '不相同') + '」';
                meta();
                /* 沒有機會了 → 結算；否則稍後出下一題 */
                if (lives <= 0) {
                    my.after(REVEAL_MS + 400, function () {
                        /* kit.resumeFrom：失敗後「從失敗題號往前 5 題」可繼續玩 */
                        var back = kit.resumeFrom(q);
                        kit.result(root, {
                            score: right,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                            num: right + ' 題', label: right >= 20 ? '記性真好！' : (right >= 10 ? '很不錯！' : '再試一次，會更準！'),
                            lines: ['一共出了 ' + q + ' 題', '最後一題：' + describe(cur.A) + ' ／ ' + describe(cur.B)],
                            isNew: newRec, sfx: right >= 10 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                } else my.after(REVEAL_MS, next);
            }
            /* 兩顆按鈕：pointerdown 一碰到就作答 */
            bNo.addEventListener('pointerdown', function (e) { e.preventDefault(); answer(false); });
            bYes.addEventListener('pointerdown', function (e) { e.preventDefault(); answer(true); });

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { q: q, state: state, right: right, lives: lives, cur: cur }; },
                answerRight: function () { if (state === 'ask') answer(cur.same); return state; },
                answerWrong: function () { if (state === 'ask') answer(!cur.same); return state; },
                jump: function (n) { q = n - 1; }
            };
            /* 開場等 400 毫秒再出第一題 */
            my.after(400, next);
        }

        round(1);
    }

    /* 遊戲的身分證：id、name、rule、mount、test */
    var G = {
        id: ID,
        name: '相同嗎？',
        rule: '先看上面一格的東西，它消失之後，下面一格會出現第二個東西。判斷兩個是不是一樣，點「相同」或「不相同」。會有水果、圖形、數字和算式，越後面越像、越快！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        test: { makeQuestion: makeQuestion, sameFlags: sameFlags, pickType: pickType, unlockedTypes: unlockedTypes, nearNumber: nearNumber, exprFor: exprFor, showSec: showSec, blankSec: blankSec, askSec: askSec, simP: simP, FRUITS: FRUITS, SHAPES: SHAPES, UNLOCK: UNLOCK, RAMP_Q: RAMP_Q }
    };
    Reaction.register(G);
/* 登記到遊戲清單 */
})();
