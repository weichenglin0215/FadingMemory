/* ═══════════════════════════════════════════════════════════════════
   reaction_matchcolor.js — 秒反應・色不異空
   畫面左右各一個一模一樣大小的長方形色塊，中間隔著一條 100px 寬的黑色長方形，
   盡量填滿遊戲畫面。左邊的色塊顏色固定不變；右邊的色塊顏色會一直在變。
   玩家用肉眼盯著看，覺得左右兩個色塊「顏色完全相同」的那一刻，點擊畫面任何
   一處——右邊的色塊就定住，兩個色塊互相靠攏、緊緊貼在一起（黑色長方形縮到
   0 寬），畫面下緣顯示兩個色塊實際的「顏色差異度」，越接近 0% 越準。
   ───────────────────────────────────────────────────────────────────
   · 三擇一：每一局隨機從「色相／彩度／亮度」挑一個維度，右邊色塊「只有這一個
     維度」會一直變，另外兩個維度永遠跟左邊一模一樣——也就是說左右兩邊「不同」
     的只有這一個維度，玩家要判斷的就是那個維度什麼時候對上。
   · 變化方式：
     - 色相：沿著色相環一直轉（轉完一圈會回到原點，所以過了頭只要再等一圈）。
     - 彩度／亮度：在上下限之間來回跑（碰到上限就折回去，碰到下限再折回來）。
     起點故意設在離左邊色塊有一段距離的地方、而且一定是朝著左邊的值靠近，所以
     一開始右邊就會先慢慢逼近、穿過左邊的顏色，再往另一邊跑掉。
   · 顏色差異度：用「CIE L*a*b* 色差 ΔE（1976 版）」換算，直接把 ΔE 數字當成
     百分比顯示——黑色跟白色的 ΔE 剛好是 100，所以 100% ＝ 黑白對比那麼大，
     0% ＝ 兩個顏色完全一模一樣，約 1% ＝ 一般人肉眼剛好勉強分辨得出來的差距。
     不直接比較色相／彩度／亮度的數字，是因為三個維度的單位不一樣（度／%／%），
     而且人眼對它們的敏感度也不同，用同一把「感知色差」的尺才公平，三種維度
     的成績才能放在一起比較。比的是畫面上「實際顯示」的顏色（8 位元 RGB 四捨五入
     之後的值），不是計算過程中的小數，所以可以真的剛好 0.00%。
   · 觸發用 pointerdown（手指一碰到螢幕就算），不是 click（要等手指離開才算），
     跟「神準落下」「不可能任務」同一個理由：時機型的遊戲不能把手指按著不放的
     那段時間算進去。凍結的是「畫面上最後一次畫出來的顏色」（玩家眼睛實際看到
     的那一幀），不是點下去那一瞬間才重新算的顏色。
   · 最佳紀錄＝歷來最小的差異度，越小越好。
   ═══════════════════════════════════════════════════════════════════ */

/* （這款是較早寫的遊戲：只玩一局、沒有關卡，所以不用 kit.round，直接在 mount 裡寫；共通結構見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    /* 遊戲代號 */
    var ID = 'matchcolor';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 matchcolor 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'min', decimals: 4, format: '{v}%', label: '差異度', min: 0, max: 300 };
    /* UI.h：建立 HTML 元素的小工具 */
    var h = UI.h;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 兩個色塊中間黑色長方形的寬度 */
    var GAP_PX = 100;           /* 兩個色塊中間黑色長方形的寬度（邏輯 px） */
    var CLOSE_MS = 500;         /* 點擊之後，兩個色塊互相靠攏的時間 */

    /* DIMS：三個維度（色相 h、彩度 s、亮度 v）各自的設定：speed 變化速度、off 起點離左邊多遠、lo／hi 上下限 */
    /* 三個維度各自的設定：
       speed＝右邊色塊每秒變化多少（色相是「度」、彩度／亮度是「%」）；
       off＝起點離左邊色塊多遠（lo～hi 之間隨機）；
       lo／hi＝彩度／亮度的上下限（色相沒有上下限，是繞圈圈，不需要）；
       base＝左邊色塊另外兩個維度、以及自己這個維度的起始值要落在哪個範圍。
       想讓遊戲更簡單／更難，調 speed（越慢越簡單）就好。 */
    var DIMS = {
        h: { name: '色相', speed: 8, off: [40, 70] },
        s: { name: '彩度', speed: 9, off: [28, 45], lo: 8, hi: 100 },
        v: { name: '亮度', speed: 9, off: [28, 45], lo: 18, hi: 100 }
    };
    /* 三個維度的代號 */
    var DIM_KEYS = ['h', 's', 'v'];

    /* 差異度的顯示格式（4 位小數；成績用 Leaderboard.fake4 產生過，見 onDown） */
    function fmtPct(v) { return v.toFixed(4) + '%'; }
    /* 最佳紀錄文字 */
    function fmtBest(v) { return v == null ? '' : '最佳 ' + fmtPct(v); }
    /* 隨機取 lo～hi 之間的小數 */
    function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

    /* 顏色換算 */
    /* ═══ 顏色換算 ═══
       CSS 沒有原生的 hsv() 函式，所以先自己算成 rgb()；顏色差異度要用
       L*a*b* 空間算，所以還要 sRGB → 線性 → XYZ（D65 白點）→ L*a*b*。 */
    /* HSV 轉 RGB：CSS 沒有原生 hsv() 函式，要先換算 */
    function hsvToRgb(hh, ss, vv) {
        var s = ss / 100, v = vv / 100;
        var c = v * s;
        var hp = hh / 60;
        var x = c * (1 - Math.abs(hp % 2 - 1));
        var r1 = 0, g1 = 0, b1 = 0;
        if (hp < 1) { r1 = c; g1 = x; b1 = 0; }
        else if (hp < 2) { r1 = x; g1 = c; b1 = 0; }
        else if (hp < 3) { r1 = 0; g1 = c; b1 = x; }
        else if (hp < 4) { r1 = 0; g1 = x; b1 = c; }
        else if (hp < 5) { r1 = x; g1 = 0; b1 = c; }
        else { r1 = c; g1 = 0; b1 = x; }
        var m = v - c;
        return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
    }
    /* 把顏色轉成 CSS 的 rgb() 字串 */
    function cssRgb(c) { return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')'; }

    /* sRGB → 線性光（去掉 gamma 曲線），色差計算要用 */
    function toLinear(u) {
        var c = u / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    /* L*a*b* 轉換用的輔助函式 */
    function labF(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    /* RGB → L*a*b*：先轉成 XYZ（D65 白點）再轉成 L*a*b*，這個色彩空間的距離接近人眼感受到的色差 */
    function rgbToLab(c) {
        var r = toLinear(c.r), g = toLinear(c.g), b = toLinear(c.b);
        var x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
        var y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
        var z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
        var fx = labF(x), fy = labF(y), fz = labF(z);
        return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
    }
    /* 顏色差異度（%）＝ΔE76：兩個顏色在 L*a*b* 空間裡的直線距離（黑白的 ΔE 剛好是 100） */
    /* 顏色差異度（％）＝ ΔE76：兩個顏色在 L*a*b* 空間裡的直線距離 */
    function diffPercent(c1, c2) {
        var p = rgbToLab(c1), q = rgbToLab(c2);
        return Math.sqrt(Math.pow(p.L - q.L, 2) + Math.pow(p.a - q.a, 2) + Math.pow(p.b - q.b, 2));
    }

    /* 把 u 折回 [lo, hi]：像三角波來回走，讓彩度／亮度一直來回掃，不會衝出範圍 */
    /* 把 u 折回 [lo, hi]：碰到上限就往回走、碰到下限再往回走（像三角波），
       讓彩度／亮度可以一直來回掃，不會衝出範圍。 */
    function fold(u, lo, hi) {
        var span = hi - lo;
        var m = ((u - lo) % (2 * span) + 2 * span) % (2 * span);
        return lo + (m <= span ? m : 2 * span - m);
    }

    /* 開一個新局：決定哪個維度在變、左邊色塊的顏色、右邊色塊從哪開始往哪個方向走 */
    /* 開一個新局：決定哪個維度在變、左邊色塊是什麼顏色、右邊色塊從哪開始往哪個方向走。
       回傳 { dim, left:{h,s,v}, valueAt(秒) → 右邊色塊那個維度在第幾秒的值 }。 */
    function newRound() {
        /* 隨機挑一個維度 */
        var dim = DIM_KEYS[Math.floor(Math.random() * DIM_KEYS.length)];
        var cfg = DIMS[dim];
        /* 左邊色塊：色相整圈隨機；彩度／亮度落在中段，上下留餘裕給右邊色塊來回掃 */
        var left = { h: rand(0, 360), s: rand(55, 85), v: rand(60, 90) };
        if (dim === 's') left.s = rand(40, 75);
        if (dim === 'v') left.v = rand(45, 78);

        /* 起點離左邊的值一段距離，並且朝著左邊靠近 */
        var off = rand(cfg.off[0], cfg.off[1]);
        var dir = Math.random() < 0.5 ? 1 : -1;
        var start;
        if (dim === 'h') {
            start = left.h - dir * off;
        } else {
            start = left[dim] - dir * off;
            /* 起點超出上下限就改成從另一邊往回靠近，保證一開始一定是朝著左邊的值前進 */
            if (start < cfg.lo || start > cfg.hi) { dir = -dir; start = left[dim] - dir * off; }
        }
        /* valueAt(秒)：右邊色塊那個維度在第幾秒的值（時間的函式） */
        function valueAt(sec) {
            var u = start + dir * cfg.speed * sec;
            if (dim === 'h') return ((u % 360) + 360) % 360;
            return fold(u, cfg.lo, cfg.hi);
        }
        return { dim: dim, left: left, valueAt: valueAt };
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* 舊版最佳紀錄只有兩位小數的真實差異度：第一次進來換算成「4 位、第 3／4 位不為 0」 */
        Reaction.migrateBest(ID, function (v) { return Leaderboard.fake4(v); });
        /* 替整個畫面加上黑底 class（樣式在 css/reaction.css 的 .mc-bg） */
        root.classList.add('mc-bg');

        /* round：開一局 */
        function round() {
            root.innerHTML = '';
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            var rd = newRound();
            var leftRgb = hsvToRgb(rd.left.h, rd.left.s, rd.left.v);

            /* 左色塊、中間縫、右色塊 */
            var leftEl = h('div', { 'class': 'mc-block' });
            var gapEl = h('div', { 'class': 'mc-gap' });
            var rightEl = h('div', { 'class': 'mc-block' });
            leftEl.style.background = cssRgb(leftRgb);
            gapEl.style.flexBasis = GAP_PX + 'px';
            root.appendChild(h('div', { 'class': 'mc-field' }, [leftEl, gapEl, rightEl]));

            var foot = h('div', { 'class': 'mc-foot' }, [
                h('div', { 'class': 'mc-hint', text: '當你覺得兩個方塊顏色是完全相同時，\n請點擊畫面確認。' })
            ]);
            root.appendChild(foot);

            /* phase 目前階段；raf 動畫的編號；shownRgb 玩家眼睛實際看到的最後一次畫出來的顏色 */
            var phase = 'running';
            var raf = null;
            var shownRgb = null;     /* 玩家眼睛實際看到的、最後一次畫出來的右邊顏色 */
            var t0 = performance.now();

            /* 畫一個畫面：算出右邊色塊現在的顏色 */
            function paint(now) {
                var v = rd.valueAt((now - t0) / 1000);
                var c = { h: rd.left.h, s: rd.left.s, v: rd.left.v };
                c[rd.dim] = v;
                shownRgb = hsvToRgb(c.h, c.s, c.v);
                rightEl.style.background = cssRgb(shownRgb);
            }
            /* requestAnimationFrame：瀏覽器每次畫面更新時呼叫，持續更新顏色 */
            function frame(now) {
                if (phase !== 'running') return;
                paint(now);
                raf = requestAnimationFrame(frame);
            }
            paint(t0);
            raf = requestAnimationFrame(frame);

            /* 點擊畫面任一處（pointerdown 一碰就算，不是 click）：凍結最後一次畫出來的顏色，算差異度 */
            /* 點擊畫面任一處：整個 root 監聽（不是某顆按鈕）。phase 不是 running 的時候
               （已經結算了），點畫面不做事，只有「再玩一次」按鈕能重來。 */
            root.addEventListener('pointerdown', function onDown(e) {
                if (phase !== 'running') return;
                e.preventDefault();
                phase = 'done';
                cancelAnimationFrame(raf);
                root.removeEventListener('pointerdown', onDown);

                /* 最終成績（顏色差異度 %）：第 3、4 位不為 0，只產生這一次，結算文字、評語、最佳紀錄都用它 */
                var realDiff = diffPercent(leftRgb, shownRgb);
                var diff = Leaderboard.fake4(realDiff);
                console.log('色不異空：實際差異度 ' + realDiff.toFixed(6) + '% → 成績 ' + fmtPct(diff));
                var isNew = Reaction.setBest(ID, diff, function (v, b) { return v < b; });
                ctx.setMeta(fmtBest(Reaction.getBest(ID)));

                /* 兩個色塊靠攏：黑色縫的寬度用 CSS transition 縮到 0 */
                /* 兩個色塊靠攏：黑色長方形的寬度用 CSS transition 縮到 0（見 .mc-gap） */
                gapEl.classList.add('mc-gap--closed');

                foot.innerHTML = '';
                if (window.Sfx) Sfx.play('click');
                foot.appendChild(h('div', { 'class': 'mc-result', text: '顏色差異度 ' + fmtPct(diff), attrs: { 'data-sfx': diff <= 1 ? 'perfect' : (diff <= 5 ? 'win' : 'neutral') } }));
                if (isNew) foot.appendChild(h('div', { 'class': 'mc-newrec', text: '新紀錄！' }));
                foot.appendChild(h('button', { 'class': 'btn btn--primary mc-again', text: '再玩一次', on: { click: round } }));
                /* 送世界排行榜（結算文字已經在畫面上了） */
                Leaderboard.submit(ID, diff);
            });
        }

        round();
    }

    /* Reaction.register：把這款遊戲登記到遊戲清單 */
    Reaction.register({
        id: ID,
        name: '色不異空',
        rule: '畫面左右各有一個色塊，中間隔著一條黑色長方形。左邊的色塊顏色不會變，右邊的色塊顏色會一直在變（每一局只有色相、彩度、亮度其中一種在變）。用眼睛仔細看，覺得兩個色塊的顏色「完全相同」的那一刻，馬上點擊畫面！兩個色塊會靠在一起，並告訴你實際的顏色差異度，越接近 0% 就越準。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE
    });
    /* 讓 CLOSE_MS 同時決定 CSS transition 的時間（用 CSS 變數 --mc-close-ms） */
    /* 讓 CLOSE_MS 這個參數同時決定 CSS transition 的時間（見 mount 之後的 style 設定） */
    document.documentElement.style.setProperty('--mc-close-ms', CLOSE_MS + 'ms');
})();
