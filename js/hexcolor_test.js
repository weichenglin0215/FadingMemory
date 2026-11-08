/* ═══════════════════════════════════════════════════════════════════
   hexcolor_test.js — 六角著色（參數測試版）的畫面與操作
   ───────────────────────────────────────────────────────────────────
   盤面怎麼長、解怎麼找都在 js/hexcolor_core.js；這支只管：
     1. 參數面板：色數／格數／預填／緊密度／每色格數 的滑桿，彼此連動；
     2. 「重新產生」：呼叫 HexColorCore.generate，把結果畫成 SVG 盤面；
     3. 玩法：先點下方顏色、再點盤面的格子；相鄰同色會標「✕」；全部填滿且沒有同色相鄰就過關；
     4. 狀態列：顯示「解數」「純推理能不能解完」「鄰居數」，幫你判斷這組參數難不難。
   【各色格數與格數總數的連動規則】
     · 格數總數 ＝ 各色格數的總和（每色至少 1 格）。
     · 拉「格數」滑桿：各色依目前比例放大／縮小（保留你調出來的不平均）。
     · 拉某一色的小滑桿：只有那一色變，格數總數跟著變。
     · 改「色數」：格數總數不變，重新平均分給各色。
   【為什麼拉滑桿不會立刻換盤面】規格是「重新產生盤面」按鈕才套用；
     參數和目前盤面不同時，按鈕會變橘色提醒你。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var Core = window.HexColorCore;

    /* ───────── 可以調的常數（集中放這裡） ───────── */
    var K_MIN = 2, K_MAX = 8;          /* 色數範圍 */
    var N_MAX = 90;                    /* 格數總數上限 */
    var BOARD_MAX_HEX = 60;            /* 盤面上單一六角格最大半徑（邏輯 px），格數少時才不會大得誇張 */
    var GEN_OPTS = { maxMs: 1800 };    /* 產生盤面時最多花幾毫秒找解（找不到就回報無解） */
    var HINT_MS = 1600;                /* 提示文字停留多久 */
    var SVG_NS = 'http://www.w3.org/2000/svg';   /* 建立 SVG 元素要用這個「命名空間」，不然瀏覽器不認得 */
    var SQRT3 = Math.sqrt(3);

    /* 尖頂六角形的 6 個頂點（外接圓半徑 1）：角度 30°、90°、150°… */
    var HEX_POINTS = (function () {
        var pts = [];
        for (var i = 0; i < 6; i++) {
            var a = Math.PI / 180 * (60 * i + 30);
            pts.push([Math.cos(a), Math.sin(a)]);
        }
        return pts;
    })();
    /* 把頂點座標乘上比例後，轉成 SVG polygon 的 points 字串（"x,y x,y …"） */
    function hexPointsStr(scale) {
        return HEX_POINTS.map(function (p) {
            return (p[0] * scale).toFixed(4) + ',' + (p[1] * scale).toFixed(4);
        }).join(' ');
    }

    function $(id) { return document.getElementById(id); }

    var el = {
        ctlK: $('ctl-k'), outK: $('out-k'),
        ctlN: $('ctl-n'), outN: $('out-n'),
        ctlP: $('ctl-p'), outP: $('out-p'),
        ctlC: $('ctl-c'), outC: $('out-c'),
        colors: $('hx-colors'),
        btnGen: $('btn-gen'), btnSol: $('btn-sol'), btnHardA: $('btn-hard-a'), btnHardB: $('btn-hard-b'),
        status: $('hx-status'), board: $('hx-board'), palette: $('hx-palette')
    };

    /* ───────── 狀態 ───────── */
    var params = { counts: [6, 6, 6, 6], prefill: 4, compact: 2 };   /* 面板上的參數（尚未套用到盤面） */
    var applied = '';           /* 目前盤面是用哪組參數產生的（JSON 字串，用來判斷「參數有沒有改過」） */
    var game = null;            /* 目前的盤面（見 startGame） */
    var selected = -1;          /* 目前選的顏色編號（-1＝還沒選） */
    var showSol = false;        /* 是否正在顯示解答 */
    var baseStatus = '';        /* 狀態列的基本文字（產生結果的說明） */
    var hintText = '';          /* 暫時的提示文字（優先顯示） */
    var hintTimer = 0;
    var isWin = false;

    /* ═══════════════ 一、參數面板 ═══════════════ */

    function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
    function total() { return sum(params.counts); }

    /* 把 N 格平均分給 k 種顏色（多出來的從第一色開始每色多 1 格） */
    function evenSplit(N, k) {
        var base = Math.floor(N / k), extra = N - base * k, out = [];
        for (var i = 0; i < k; i++) out.push(base + (i < extra ? 1 : 0));
        return out;
    }

    /* 把各色格數依比例縮放成總數 newN（每色至少 1 格）。
       做法：每色先給 1 格，其餘的格數依「原本多出 1 的部分」按比例分，
       小數用「最大餘數法」補（小數部分大的優先多拿 1 格），這樣總和剛好等於 newN。 */
    function scaleCounts(counts, newN) {
        var k = counts.length, oldSpare = sum(counts) - k, spare = newN - k;
        var raw = counts.map(function (c) { return oldSpare > 0 ? (c - 1) * spare / oldSpare : spare / k; });
        var out = raw.map(function (x) { return 1 + Math.floor(x); });
        var left = newN - sum(out);
        var order = raw.map(function (x, i) { return i; }).sort(function (a, b) {
            return (raw[b] - Math.floor(raw[b])) - (raw[a] - Math.floor(raw[a]));
        });
        for (var j = 0; j < left; j++) out[order[j % k]]++;
        return out;
    }

    /* 依 params 重建「每色格數」的小滑桿（色數改變時才需要重建） */
    function buildColorSliders() {
        el.colors.textContent = '';
        for (var i = 0; i < params.counts.length; i++) {
            var item = document.createElement('div');
            item.className = 'hx-cc';
            var dot = document.createElement('i');
            dot.className = 'hx-dot hx-bg-' + i;
            var input = document.createElement('input');
            input.type = 'range';
            input.min = 1; input.step = 1;
            input.setAttribute('data-i', i);              /* 記下這是第幾種顏色的滑桿，事件裡要用 */
            var out = document.createElement('output');
            item.appendChild(dot); item.appendChild(input); item.appendChild(out);
            el.colors.appendChild(item);
        }
    }

    /* 把 params 的數字同步到所有滑桿與數字顯示（任何參數變動後呼叫） */
    function syncControls() {
        var k = params.counts.length, N = total();
        params.prefill = Math.min(params.prefill, N);
        el.ctlK.value = k; el.outK.textContent = k;
        el.ctlN.min = k; el.ctlN.max = N_MAX; el.ctlN.value = N; el.outN.textContent = N;
        el.ctlP.min = 0; el.ctlP.max = N; el.ctlP.value = params.prefill; el.outP.textContent = params.prefill;
        el.ctlC.value = params.compact; el.outC.textContent = params.compact;
        var inputs = el.colors.querySelectorAll('input');
        var outs = el.colors.querySelectorAll('output');
        for (var i = 0; i < k; i++) {
            /* 這一色最多能拉到：總數上限 − 其他各色的總和 */
            inputs[i].max = N_MAX - (N - params.counts[i]);
            inputs[i].value = params.counts[i];
            outs[i].textContent = params.counts[i];
        }
        updateDirty();
    }

    /* 參數和目前盤面不同 → 「重新產生」變橘色 */
    function updateDirty() {
        el.btnGen.classList.toggle('is-dirty', JSON.stringify(params) !== applied);
    }

    function bindControls() {
        /* 「input」事件：滑桿拖曳的每一刻都會觸發 */
        el.ctlK.addEventListener('input', function () {
            var k = +el.ctlK.value;                           /* 前面的 + 把文字轉成數字 */
            params.counts = evenSplit(Math.max(total(), k), k);
            buildColorSliders();
            syncControls();
        });
        el.ctlN.addEventListener('input', function () {
            params.counts = scaleCounts(params.counts, +el.ctlN.value);
            syncControls();
        });
        el.ctlP.addEventListener('input', function () {
            params.prefill = +el.ctlP.value;
            syncControls();
        });
        el.ctlC.addEventListener('input', function () {
            params.compact = +el.ctlC.value;
            syncControls();
        });
        /* 事件委派：每色的小滑桿是動態產生的，所以把監聽放在外層容器，再看是哪支滑桿觸發的 */
        el.colors.addEventListener('input', function (e) {
            var i = +e.target.getAttribute('data-i');
            params.counts[i] = +e.target.value;
            syncControls();
        });
        el.btnGen.addEventListener('click', regenerate);
        el.btnSol.addEventListener('click', toggleSolution);
        el.btnHardA.addEventListener('click', function () { loadHard('A'); });
        el.btnHardB.addEventListener('click', function () { loadHard('B'); });
    }

    /* 叫出事先搜尋好的極難盤面（資料在 js/hexcolor_hard.js，唯一解由 test/hexcolor/hard_check.cjs 驗證）。
       把滑桿也同步成這個盤面的參數，所以按鈕不會變橘色；之後按「重新產生」就回到隨機盤面。 */
    function loadHard(which) {
        var b = window.HexColorHard[which];
        var G = Core.buildGraph(b.cells);
        var clues = 0;
        for (var i = 0; i < b.givens.length; i++) if (b.givens[i] >= 0) clues++;
        params.counts = b.counts.slice();
        params.prefill = clues;
        buildColorSliders();
        syncControls();
        var snapshot = { counts: params.counts.slice(), prefill: params.prefill, compact: params.compact };
        startGame({
            ok: true, hardNote: b.note, cells: b.cells, nbrs: G.nbrs,
            solution: Int8Array.from(b.solution), givens: Int8Array.from(b.givens)
        }, snapshot);
    }

    /* ═══════════════ 二、產生盤面 ═══════════════ */

    function regenerate() {
        el.btnGen.disabled = true;
        baseStatus = '產生中…'; hintText = ''; renderStatus();
        /* 先讓瀏覽器把「產生中…」畫出來，30 毫秒後再開始找解（找解會暫時卡住畫面） */
        window.setTimeout(function () {
            var snapshot = { counts: params.counts.slice(), prefill: params.prefill, compact: params.compact };
            var res = Core.generate(snapshot, GEN_OPTS);
            startGame(res, snapshot);
            el.btnGen.disabled = false;
        }, 30);
    }

    /* 狀態列說明文字：把「難度指標」用短句列出來 */
    function describe(res) {
        if (res.hardNote) return res.hardNote;      /* 極難盤面：直接顯示盤面附的說明 */
        var sh = res.shape;
        var nb = '鄰居 最少' + sh.minDeg + '／平均' + sh.avgDeg.toFixed(1) + (sh.below > 0 ? '（緊密' + sh.target + '未全達）' : '');
        if (!res.ok) {
            return '⚠ 找不到解（可能無解）：' + res.reason + '（試了' + res.attempts + '個形狀）・' + nb;
        }
        var sc = res.solCountCapped ? res.solCount + '+' : (res.solCountAborted ? res.solCount + '+?' : String(res.solCount));
        var uniq = (!res.solCountCapped && !res.solCountAborted && res.solCount === 1) ? '唯一解' : '解數 ' + sc;
        return uniq + '・純推理' + (res.propSolvable ? '可解' : '不可') + '・' + nb + (res.attempts > 1 ? '・換了' + res.attempts + '形狀' : '');
    }

    /* 收到產生結果：重置遊戲狀態並重畫 */
    function startGame(res, snapshot) {
        var n = res.cells.length;
        var locked = new Uint8Array(n);
        for (var i = 0; i < n; i++) locked[i] = res.givens[i] >= 0 ? 1 : 0;
        game = {
            ok: res.ok, cells: res.cells, nbrs: res.nbrs, solution: res.solution,
            counts: snapshot.counts, locked: locked, paint: Int8Array.from(res.givens),
            els: [], svg: null, vb: null
        };
        applied = JSON.stringify(snapshot);
        selected = -1; showSol = false; hintText = '';
        baseStatus = describe(res);
        el.status.classList.toggle('is-bad', !res.ok);
        buildBoard();
        buildPalette();
        render();
        updateDirty();
    }

    /* ═══════════════ 三、畫盤面（SVG） ═══════════════ */

    /* 建立一個 SVG 元素並指定 class */
    function svgEl(tag, cls) {
        var e = document.createElementNS(SVG_NS, tag);
        if (cls) e.setAttribute('class', cls);
        return e;
    }

    function buildBoard() {
        el.board.textContent = '';
        var cells = game.cells, n = cells.length;
        /* 每格的中心：x = √3 × (q + r/2)，y = 1.5 × r（單位＝六角形的外接圓半徑） */
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        var cx = [], cy = [];
        for (var i = 0; i < n; i++) {
            var x = SQRT3 * (cells[i][0] + cells[i][1] / 2), y = 1.5 * cells[i][1];
            cx.push(x); cy.push(y);
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        /* viewBox＝「SVG 內部座標」要顯示哪一塊；四周各留半個六角形 */
        game.vb = { x: minX - SQRT3 / 2, y: minY - 1, w: (maxX - minX) + SQRT3, h: (maxY - minY) + 2 };
        var svg = svgEl('svg');
        svg.setAttribute('viewBox', game.vb.x + ' ' + game.vb.y + ' ' + game.vb.w + ' ' + game.vb.h);
        game.svg = svg;
        game.els = [];
        var mainPts = hexPointsStr(1), ringPts = hexPointsStr(0.58);
        for (var j = 0; j < n; j++) {
            var g = svgEl('g', 'hx-cell');
            g.setAttribute('transform', 'translate(' + cx[j].toFixed(4) + ' ' + cy[j].toFixed(4) + ')');
            var poly = svgEl('polygon', 'hx-poly');
            poly.setAttribute('points', mainPts);
            var ring = svgEl('polygon', 'hx-ring');
            ring.setAttribute('points', ringPts);
            var xbg = svgEl('path', 'hx-x-bg'), xfg = svgEl('path', 'hx-x-fg');
            var cross = 'M-0.3 -0.3 L0.3 0.3 M0.3 -0.3 L-0.3 0.3';
            xbg.setAttribute('d', cross); xfg.setAttribute('d', cross);
            g.appendChild(poly); g.appendChild(ring); g.appendChild(xbg); g.appendChild(xfg);
            bindCell(g, j);
            svg.appendChild(g);
            game.els.push(g);
        }
        el.board.appendChild(svg);
        fitBoard();
    }

    /* 幫第 i 格綁上點擊事件。
       為什麼要包成函式？迴圈裡直接寫 function(){ onCell(j) } 會讓所有格子共用「同一個 j」
       （迴圈跑完 j 就是最後一個值）；包進函式後，每次呼叫都有自己獨立的 i，這叫「閉包」。 */
    function bindCell(g, i) {
        /* pointerdown：手指或滑鼠「按下去」的瞬間就反應，比 click 更快 */
        g.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            onCell(i);
        });
    }

    /* 依盤面容器的大小，算出六角格的實際大小並設定 SVG 的寬高 */
    function fitBoard() {
        if (!game || !game.svg) return;
        var cs = window.getComputedStyle(el.board);
        var availW = el.board.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        var availH = el.board.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        var s = Math.min(availW / game.vb.w, availH / game.vb.h, BOARD_MAX_HEX);
        if (!(s > 0)) return;
        game.svg.setAttribute('width', (game.vb.w * s).toFixed(2));
        game.svg.setAttribute('height', (game.vb.h * s).toFixed(2));
    }

    /* ═══════════════ 四、顏色選擇列 ═══════════════ */

    function buildPalette() {
        el.palette.textContent = '';
        var k = game.counts.length;
        for (var i = 0; i < k; i++) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'hx-pal-btn hx-col-' + i;
            btn.setAttribute('data-i', i);
            /* 用 SVG 畫六角形＋中間的數字（尖頂六角形，半徑 57.735 → 寬 100、高 115.47） */
            var svg = svgEl('svg');
            svg.setAttribute('viewBox', '-50 -57.735 100 115.47');
            var poly = svgEl('polygon', 'hx-pal-poly');
            poly.setAttribute('points', '0,-57.735 50,-28.8675 50,28.8675 0,57.735 -50,28.8675 -50,-28.8675');
            var text = svgEl('text', 'hx-pal-num');
            text.setAttribute('x', 0); text.setAttribute('y', 0);
            text.setAttribute('text-anchor', 'middle');           /* 水平置中 */
            text.setAttribute('dominant-baseline', 'central');    /* 垂直置中 */
            svg.appendChild(poly); svg.appendChild(text);
            btn.appendChild(svg);
            bindPalette(btn, i);
            el.palette.appendChild(btn);
        }
    }

    function bindPalette(btn, i) {
        btn.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            if (!game) return;
            selected = (selected === i) ? -1 : i;                 /* 再點一次同色＝取消選取 */
            render();
        });
    }

    /* ═══════════════ 五、玩法 ═══════════════ */

    /* 每種顏色目前已經放了幾格（含預填） */
    function usedCounts() {
        var used = game.counts.map(function () { return 0; });
        for (var i = 0; i < game.paint.length; i++) if (game.paint[i] >= 0) used[game.paint[i]]++;
        return used;
    }

    /* 暫時提示（顯示在狀態列，一下子就消失） */
    function hint(text) {
        hintText = text;
        renderStatus();
        window.clearTimeout(hintTimer);
        hintTimer = window.setTimeout(function () { hintText = ''; renderStatus(); }, HINT_MS);
    }

    function shakePalette(i) {
        var btn = el.palette.children[i];
        if (!btn) return;
        btn.classList.remove('is-shake');
        void btn.offsetWidth;                                     /* 讀一下尺寸，強迫瀏覽器重算，動畫才能重播 */
        btn.classList.add('is-shake');
    }

    /* 點了盤面的第 i 格 */
    function onCell(i) {
        if (!game) return;
        if (showSol) { hint('解答顯示中，再按一次「解答」關閉'); return; }
        if (game.locked[i]) { hint('這格是預填的，不能改'); return; }
        if (selected < 0) { hint('請先在下方選一個顏色'); return; }
        if (game.paint[i] === selected) {
            game.paint[i] = -1;                                   /* 點同色的格子＝擦掉 */
        } else if (usedCounts()[selected] < game.counts[selected]) {
            game.paint[i] = selected;                             /* 塗上（原本是別的顏色就直接換掉） */
        } else {
            hint('這個顏色已經用完了');
            shakePalette(selected);
            return;
        }
        render();
    }

    function toggleSolution() {
        if (!game) return;
        if (!game.solution) { hint('這組參數找不到解，沒有解答可看'); return; }
        showSol = !showSol;
        render();
    }

    /* 哪些格子「跟相鄰的格子同色」 */
    function findConflicts() {
        var n = game.paint.length, bad = new Uint8Array(n);
        for (var i = 0; i < n; i++) {
            if (game.paint[i] < 0) continue;
            for (var t = 0; t < game.nbrs[i].length; t++) {
                if (game.paint[game.nbrs[i][t]] === game.paint[i]) bad[i] = 1;
            }
        }
        return bad;
    }

    /* ═══════════════ 六、重畫 ═══════════════ */

    function render() {
        if (!game) return;
        var n = game.paint.length, bad = findConflicts(), filled = 0, anyBad = false;
        for (var i = 0; i < n; i++) {
            var cls = 'hx-cell', c = game.paint[i];
            if (showSol && game.solution) {
                cls += ' hx-col-' + game.solution[i] + (game.locked[i] ? '' : ' hx-ghost');
            } else if (c >= 0) {
                cls += ' hx-col-' + c;
            } else {
                cls += ' hx-empty';
            }
            if (game.locked[i]) cls += ' hx-locked';
            if (!showSol && bad[i]) cls += ' hx-conflict';
            game.els[i].setAttribute('class', cls);                /* SVG 元素要用 setAttribute 改 class */
            if (c >= 0) filled++;
            if (bad[i]) anyBad = true;
        }
        isWin = (filled === n && !anyBad);
        el.board.classList.toggle('is-win', isWin);
        /* 顏色列：剩餘數量、選取、用完 */
        var used = usedCounts();
        for (var k = 0; k < game.counts.length; k++) {
            var btn = el.palette.children[k];
            var left = game.counts[k] - used[k];
            btn.querySelector('text').textContent = left;
            btn.classList.toggle('is-selected', selected === k);
            btn.classList.toggle('is-zero', left <= 0);
        }
        el.btnSol.classList.toggle('is-on', showSol);
        el.btnSol.setAttribute('aria-pressed', showSol ? 'true' : 'false');
        renderStatus();
    }

    function renderStatus() {
        var text = hintText || baseStatus;
        if (isWin && !hintText) text = '★ 過關！ ' + text;
        el.status.textContent = text;
        el.status.classList.toggle('is-win', isWin && !hintText);
    }

    /* ═══════════════ 啟動 ═══════════════ */

    function init() {
        window.Stage.init();                    /* 啟動 500×850 舞台的縮放（js/stage.js） */
        buildColorSliders();
        syncControls();
        bindControls();
        /* 盤面容器大小改變（例如色數變多、面板多一排）時，重新計算六角格大小 */
        if (window.ResizeObserver) new ResizeObserver(fitBoard).observe(el.board);
        regenerate();                           /* 一開頁面就先產生一個盤面 */
    }

    /* 給自動測試用的後門（可以不管它） */
    window.HexTest = {
        params: params,
        state: function () { return { game: game, selected: selected, showSol: showSol, isWin: isWin, status: el.status.textContent }; },
        regenerate: regenerate
    };

    init();
})();
