/* ═══════════════════════════════════════════════════════════════════
   reaction_spot.js — 秒反應・大家來找碴
   4×4 共 16 格，15 格同色、1 格的色相／飽和度／亮度有些微差異，找出那一格。
   答對就進下一關（差異會越來越小）；答錯就結束，分數＝過了幾關。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'spot';
    var h = UI.h;
    var N = 16;

    function fmtBest(v) { return v == null ? '' : '最佳 第 ' + v + ' 關'; }

    /* 難度：每高一關，差異用「固定的量」變小（線性遞減），不是等比例縮小——
       等比例縮小（乘以 0.85 之類）一開始降得快，後面幾十關幾乎不再變化，很快就卡在下限；
       線性遞減才會每一關都確實比上一關更難一點點，難度曲線平穩、可預期。
       三個頻道各自校正 start／step／floor，讓「同一關」不管抽到哪個頻道，難度感受接近：
       · 色相（h）：0～360 度，人眼在中彩度／中亮度下大約 3～5 度就很難分辨，所以 floor＝3。
       · 飽和度／亮度（s／l）：0～100，同樣抓「大約第幾關會摸到人眼分辨極限」來定 step，
         讓三條線在同一個關卡數（約第 20 關）附近一起碰到下限，難度曲線互相對齊。 */
    var DIFF = {
        h: { start: 42, step: 2.0, floor: 3 },
        s: { start: 30, step: 1.5, floor: 3 },
        l: { start: 30, step: 1.5, floor: 3 }
    };
    function diffFor(level, ch) {
        var d = DIFF[ch];
        return Math.max(d.floor, d.start - d.step * (level - 1));
    }

    function oddColor(base, ch, delta) {
        var sign = Math.random() < 0.5 ? 1 : -1;
        if (ch === 'h') return { h: (base.h + sign * delta + 360) % 360, s: base.s, l: base.l };
        var v = base[ch] + sign * delta;
        if (v < 8 || v > 92) v = base[ch] - sign * delta;
        v = Math.max(6, Math.min(94, v));
        var out = { h: base.h, s: base.s, l: base.l };
        out[ch] = v;
        return out;
    }

    function css(c) { return 'hsl(' + Math.round(c.h) + ',' + Math.round(c.s) + '%,' + Math.round(c.l) + '%)'; }

    /* 色相是圓的（0 度＝360 度），345 度跟 23 度中間只差 38 度（繞近路），不是 322 度（繞遠路）；
       直接 |a-b| 在跨過 0／360 的地方會算出這種明顯不合理的超大差異，一定要取繞圈最短的那一段。 */
    function hueDiff(a, b) {
        var d = Math.abs(a - b) % 360;
        return d > 180 ? 360 - d : d;
    }

    function diffRow(level, ch, base, odd) {
        var CH_NAME = { h: '色相 H', s: '飽和度 S', l: '亮度 L' };
        return {
            關卡: level,
            這關抽到的頻道: CH_NAME[ch],
            '正常格 H°': Math.round(base.h), '正常格 S%': Math.round(base.s), '正常格 L%': Math.round(base.l),
            '差異格 H°': Math.round(odd.h), '差異格 S%': Math.round(odd.s), '差異格 L%': Math.round(odd.l),
            'ΔH(度)': Math.round(hueDiff(base.h, odd.h)),
            'ΔS(%)': Math.round(Math.abs(odd.s - base.s)),
            'ΔL(%)': Math.round(Math.abs(odd.l - base.l))
        };
    }

    /* 驗證用（一）：把第 1～21 關「正常格」與「差異格」各自抽一組樣本列在主控台，
       方便直接核對線性遞減的難度曲線，不用真的玩過 21 關——注意這是獨立抽樣，
       跟畫面上實際玩到哪一關用的是不同一次的隨機結果，兩邊的顏色不會對得起來，
       純粹是「曲線長什麼樣子」的參考。真的要核對「畫面上這關」的數值，看下面的「驗證用（二）」。 */
    function logLevelTable() {
        if (!window.console || !console.table) return;
        var rows = [];
        for (var level = 1; level <= 21; level++) {
            var base = { h: Math.random() * 360, s: 52 + Math.random() * 16, l: 44 + Math.random() * 16 };
            var ch = ['h', 's', 'l'][Math.floor(Math.random() * 3)];
            var odd = oddColor(base, ch, diffFor(level, ch));
            rows.push(diffRow(level, ch, base, odd));
        }
        console.log('大家來找碴：第 1～21 關的難度曲線參考樣本（跟實際畫面是各自獨立抽的，顏色不會相同，只看差異量的變化趨勢）');
        console.table(rows);
    }

    function mount(root, ctx) {
        logLevelTable();
        var level = 1;

        function round() {
            root.innerHTML = '';
            var best = fmtBest(Reaction.getBest(ID));
            ctx.setMeta('第 ' + level + ' 關' + (best ? '・' + best : ''));

            /* 飽和度／亮度刻意收在中段（不要太靠近灰、黑、白），三個頻道的差異在任何一輪抽到的
               底色上都一樣看得出來——底色太淡或太暗，色相的差異會變得幾乎看不出來，等於難度失控。 */
            var base = { h: Math.random() * 360, s: 52 + Math.random() * 16, l: 44 + Math.random() * 16 };
            var ch = ['h', 's', 'l'][Math.floor(Math.random() * 3)];
            var delta = diffFor(level, ch);
            var oddIdx = Math.floor(Math.random() * N);
            var odd = oddColor(base, ch, delta);

            /* 驗證用（二）：這一關畫面上實際用的顏色，跟 logLevelTable() 的參考樣本不同，
               這裡印的才是「現在螢幕上看到的」這一組，可以直接拿數值跟畫面截圖核對。 */
            if (window.console && console.table) console.table([diffRow(level, ch, base, odd)]);

            root.appendChild(h('div', { 'class': 'hint', text: '找出顏色不一樣的那一格（第 ' + level + ' 關）' }));
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
                root.innerHTML = '';
                root.appendChild(h('div', { 'class': 'rx-result' }, [
                    h('div', { 'class': 'rx-result__num', text: '第 ' + level + ' 關' }),
                    h('div', { 'class': 'rx-result__label', text: '答錯了，挑戰結束' }),
                    isNew ? h('div', { 'class': 'hint hint--ok', text: '新紀錄！' }) : null,
                    h('button', { 'class': 'btn btn--primary', text: '再挑戰一次', on: { click: function () { level = 1; round(); } } })
                ]));
            });
        }

        round();
    }

    Reaction.register({
        id: ID,
        name: '大家來找碴',
        rule: '4×4 共 16 個方格，其中 15 格顏色完全一樣，只有 1 格的顏色略有不同（色相、飽和度或亮度）。點下你覺得不一樣的那一格；答對就進下一關，差異會越來越小，越後面要越仔細看。答錯就結束，比比看能撐到第幾關。',
        mount: mount
    });
})();
