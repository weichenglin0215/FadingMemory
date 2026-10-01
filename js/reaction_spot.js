/* ═══════════════════════════════════════════════════════════════════
   reaction_spot.js — 秒反應・大家來找碴
   4×4 共 16 格，15 格同色、1 格的色相／彩度／明度有些微差異，找出那一格。
   答對就進下一關（差異會越來越小）；答錯就結束，分數＝過了幾關。
   ───────────────────────────────────────────────────────────────────
   · 顏色用 HSV（不是 HSL）：HSL 在 L=100 時無論 S 多少都會變成白色，等於
     明度的變化會把彩度的差異整個蓋掉；HSV 的 V（明度）不會被 S 這樣牽連。
   · 人眼對這三個頻道的敏感度不一樣：明度(V)最敏感、色相(H)其次、彩度(S)
     最不敏感。下面用同一把「知覺差異」尺，換算成三個頻道各自要改多少「原始
     單位」，而不是三個頻道各自用差不多的原始數字——不然同樣是「差 20」，
     V 差 20 玩家會覺得差很多、S 差 20 卻幾乎看不出來，難度曲線感覺忽難忽易，
     不是平順地變難。
   · 這一局遊戲的底色刻意用純黑（跟整站的宣紙暖色調不同），理由是色彩判斷
     類的遊戲，背景顏色會透過同時對比（simultaneous contrast）影響色塊看起來
     的樣子；黑色是色彩判斷最中性的背景，不會偏向任何一個色相或亮度。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'spot';
    var h = UI.h;
    var N = 16;

    function fmtBest(v) { return v == null ? '' : '最佳 第 ' + v + ' 關'; }

    /* ═══ 難度曲線：全部寫成變數，覺得曲線不對就直接改這裡 ═══
       PERCEPT：單一一條「知覺差異」線性遞減曲線（跟頻道無關），第幾關減到多少。
       WEIGHT：知覺差異換算成各頻道「原始單位」要乘的倍率——換算基準是
       「V 差 10 ≈ H 差 20 ≈ S 差 20，人眼感受到的差異程度接近」，所以 V 的
       倍率是 1.0，H／S 的倍率是 2.0。同一個「知覺差異」數字，套到不同頻道，
       算出來的原始改變量不一樣，但人眼感受到的難度應該接近，不會忽難忽易。
       BASE：底色的 S／V 範圍，刻意收在中段，避免太淡、太暗讓差異看不出來。 */
    var PERCEPT = {
        start: 24,   /* 第 1 關的知覺差異 */
        step: 0.9,   /* 每高一關，知覺差異減少多少 */
        floor: 2.2   /* 知覺差異下限（約第幾關碰到人眼分辨極限，由這個值決定） */
    };
    var WEIGHT = { h: 1.5, s: 2.0, v: 1.0 };
    var BASE = {
        s: { lo: 80, hi: 80 },
        v: { lo: 80, hi: 80 }
    };

    function perceptFor(level) {
        return Math.max(PERCEPT.floor, PERCEPT.start - PERCEPT.step * (level - 1));
    }
    function diffFor(level, ch) {
        return perceptFor(level) * WEIGHT[ch];
    }

    function oddColor(base, ch, delta) {
        var sign = Math.random() < 0.5 ? 1 : -1;
        if (ch === 'h') return { h: (base.h + sign * delta + 360) % 360, s: base.s, v: base.v };
        var val = base[ch] + sign * delta;
        if (val < 8 || val > 92) val = base[ch] - sign * delta;
        val = Math.max(6, Math.min(94, val));
        var out = { h: base.h, s: base.s, v: base.v };
        out[ch] = val;
        return out;
    }

    /* HSV → RGB：CSS 沒有原生 hsv()，顏色要先換算成 rgb() 才能畫上畫面。 */
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
    function css(c) {
        var rgb = hsvToRgb(c.h, c.s, c.v);
        return 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
    }

    /* 色相是圓的（0 度＝360 度），345 度跟 23 度中間只差 38 度（繞近路），不是 322 度（繞遠路）；
       直接 |a-b| 在跨過 0／360 的地方會算出這種明顯不合理的超大差異，一定要取繞圈最短的那一段。 */
    function hueDiff(a, b) {
        var d = Math.abs(a - b) % 360;
        return d > 180 ? 360 - d : d;
    }

    function diffRow(level, ch, base, odd) {
        var CH_NAME = { h: '色相 H', s: '彩度 S', v: '明度 V' };
        return {
            關卡: level,
            這關抽到的頻道: CH_NAME[ch],
            知覺差異: perceptFor(level).toFixed(1),
            '正常格 H°': Math.round(base.h), '正常格 S%': Math.round(base.s), '正常格 V%': Math.round(base.v),
            '差異格 H°': Math.round(odd.h), '差異格 S%': Math.round(odd.s), '差異格 V%': Math.round(odd.v),
            'ΔH(度)': Math.round(hueDiff(base.h, odd.h)),
            'ΔS(%)': Math.round(Math.abs(odd.s - base.s)),
            'ΔV(%)': Math.round(Math.abs(odd.v - base.v))
        };
    }

    function randBase() {
        return {
            h: Math.random() * 360,
            s: BASE.s.lo + Math.random() * (BASE.s.hi - BASE.s.lo),
            v: BASE.v.lo + Math.random() * (BASE.v.hi - BASE.v.lo)
        };
    }

    /* 驗證用（一）：把第 1～21 關「正常格」與「差異格」各自抽一組樣本列在主控台，
       方便直接核對「知覺差異」是不是平順遞減、不管抽到哪個頻道都一樣平順——
       注意這是獨立抽樣，跟畫面上實際玩到哪一關用的是不同一次的隨機結果，
       兩邊的顏色不會對得起來，純粹是「曲線長什麼樣子」的參考。
       真的要核對「畫面上這關」的數值，看下面的「驗證用（二）」。 */
    function logLevelTable() {
        if (!window.console || !console.table) return;
        var rows = [];
        for (var level = 1; level <= 21; level++) {
            var base = randBase();
            var ch = ['h', 's', 'v'][Math.floor(Math.random() * 3)];
            var odd = oddColor(base, ch, diffFor(level, ch));
            rows.push(diffRow(level, ch, base, odd));
        }
        console.log('大家來找碴：第 1～21 關的難度曲線參考樣本（HSV、知覺差異已加權；跟實際畫面是各自獨立抽的，顏色不會相同，只看「知覺差異」那欄是否平順遞減）');
        console.table(rows);
    }

    function mount(root, ctx) {
        root.classList.add('spot-dark-bg');
        logLevelTable();
        var level = 1;

        function round() {
            root.innerHTML = '';
            var best = fmtBest(Reaction.getBest(ID));
            ctx.setMeta('第 ' + level + ' 關' + (best ? '・' + best : ''));

            var base = randBase();
            var ch = ['h', 's', 'v'][Math.floor(Math.random() * 3)];
            var delta = diffFor(level, ch);
            var oddIdx = Math.floor(Math.random() * N);
            var odd = oddColor(base, ch, delta);

            /* 驗證用（二）：這一關畫面上實際用的顏色，跟 logLevelTable() 的參考樣本不同，
               這裡印的才是「現在螢幕上看到的」這一組，可以直接拿數值跟畫面截圖核對。 */
            if (window.console && console.table) console.table([diffRow(level, ch, base, odd)]);

            root.appendChild(h('div', { 'class': 'hint hint--on-dark', text: '找出顏色不一樣的那一格（第 ' + level + ' 關）' }));
            var grid = h('div', { 'class': 'spot-grid' });
            for (var i = 0; i < N; i++) {
                (function (i) {
                    var tile = h('button', { 'class': 'spot-tile' });
                    tile.style.background = css(i === oddIdx ? odd : base);
                    tile.addEventListener('click', function () { answer(i === oddIdx, tile, grid, oddIdx); });
                    grid.appendChild(tile);
                })(i);
            }
            root.appendChild(grid);
        }

        function answer(ok, tile, grid, oddIdx) {
            Array.prototype.forEach.call(grid.children, function (t) { t.disabled = true; });
            if (ok) {
                tile.classList.add('spot-tile--ok');
                level++;
                UI.wait(450).then(round);
                return;
            }
            tile.classList.add('spot-tile--bad');
            grid.children[oddIdx].classList.add('spot-tile--ok');
            var isNew = Reaction.setBest(ID, level, function (v, b) { return v > b; });
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));
            UI.wait(700).then(function () {
                /* 不清空畫面：保留剛剛那一格的提示（哪格答錯了、哪格才是真正不一樣的顏色）
                   留在背景，結算卡片疊一層半透明底蓋在上面——跟「神準落下」結算畫面
                   同一套處理方式、同一組 CSS class（drop-result-overlay/-card 定義在
                   css/reaction.css，是跨遊戲共用的樣式，不是神準落下專屬）。卡片本身
                   是亮色（--c-card），所以卡片裡的文字要用一般（亮底深字）樣式，
                   不能用給純黑底用的 --on-dark 版本，不然字會變成白色、看不清楚。 */
                root.appendChild(h('div', { 'class': 'drop-result-overlay' }, [
                    h('div', { 'class': 'drop-result-card' }, [
                        h('div', { 'class': 'rx-result__num', text: '第 ' + level + ' 關' }),
                        h('div', { 'class': 'rx-result__label', text: '答錯了，挑戰結束' }),
                        isNew ? h('div', { 'class': 'hint hint--ok', text: '新紀錄！' }) : null,
                        h('button', { 'class': 'btn btn--primary', text: '再挑戰一次', on: { click: function () { level = 1; round(); } } })
                    ])
                ]));
            });
        }

        round();
    }

    Reaction.register({
        id: ID,
        name: '大家來找碴',
        rule: '4×4 共 16 個方格，其中 15 格顏色完全一樣，只有 1 格的顏色略有不同（色相、彩度或明度）。點下你覺得不一樣的那一格；答對就進下一關，差異會越來越小，越後面要越仔細看。答錯就結束，比比看能撐到第幾關。',
        mount: mount
    });
})();
