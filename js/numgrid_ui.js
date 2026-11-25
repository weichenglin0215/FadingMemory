/* ═══════════════════════════════════════════════════════════════════
   numgrid_ui.js — 「數字方格」系列遊戲的共用引擎與介面（連號長龍 numchain、拖曳湊十 sumten 共用；V1.57.4）
   樣式：css/numgrid.css（class 一律以「numgrid-」開頭）。掛在 Reaction.numGrid。
   ───────────────────────────────────────────────────────────────────
   兩款遊戲的介面與操作完全一樣：一個 1～9 的數字方格盤面（第 1 關 5×7，第 20 關起 8×11），手指拖出一串方格，
   一離開就計算：收得走就拿分，收走的格子消失、上面的方格往下掉、最上面掉下新的方格補滿（像 Candy Crush），
   到時間內湊到目標分數就過關。**不一樣的只有規則**：什麼樣的一串算數、怎麼算分、掉下來的新數字怎麼挑——這些由各遊戲檔案
   （js/reaction_numchain.js、js/reaction_sumten.js）用 spec 交給這裡；介面、拖曳、浮窗九宮格、掉落動畫都只在這個檔案寫一份。
   ───────────────────────────────────────────────────────────────────
   · 怎麼選方格（V1.57.5 起只有這一種操作；以前的「確定」按鈕、「快速拖曳」勾選框、點選都拿掉了）：
       手指按在一格上開始一串，拖到相鄰的格子（要不要符合規則由 spec.canStep 決定）就接上去，拖回上一格＝收回一格；
       **手指一離開就直接計算**：收得走就收走拿分，收不走挑選清掉。
   ·「浮窗」勾選框（介面最下方，預設不勾）：勾了之後，手指按在盤面上的時候，在手指上方兩格處（不蓋住手指上面那一格）浮出一個九宮格，
       畫的是手指所在格子和它四周的八格（含目前挑選的狀態），解決手指擋住方格的問題；左右不會超出畫面，上面放不下就改放手指下方。
   · 挑選的格子一律藍底白字（不提示這串對不對）。收不走而且規則說「這串算失敗」（spec.commit 回傳 fail: true，拖曳湊十）：
       那幾格閃紅一下、播答錯的音效。
   · 純函式（gridOf、collapse、fillNew、beginDrag／dragStep、loupeAt、bounce）不碰畫面，t_numchain.js、t_sumten.js 直接測。
   ───────────────────────────────────────────────────────────────────
   spec（各遊戲交給 NG.mount 的規則）：
     id、G（遊戲物件）、maxLevel、rating(n)、logLine(q, level)（出題時印在主控台的一行）
     makePuzzle(level, rand) → q { vals, target, level, gr }；newState(q) → st { gr, vals, sel, score, done, level }；timeMs(level)
     canStep(st, last, k)：手指從 last 拖到相鄰的 k，這一步符合規則嗎（數字的限制；相鄰由這裡檢查）
     commit(st, rand) → 手指離開時收走：{ ok:true, gain, cells, oldVals, moves, fresh } 或 { ok:false, reason, n, fail }（收不走一律清掉挑選；fail＝這串算失敗：另外閃紅＋答錯音效）；沒有挑選回傳 null
     digitColor(v)（可省略）→ 數字 v 的字色；沒給就用「雙數 EVEN_COLOR、單數深色」
     hint(st)（可省略）→ 第 1 關操作提示要指的格子（至少兩格）；沒給就用 best(st, 4)
     failMsg(r)：收不走的時候，標題列右邊暫時顯示的提醒（只拖到 1 格、又不算失敗時不顯示）；best(st, stopAt) → 盤面上目前最好的一串（格子編號陣列，提示／時間到標出來／測試用）
     hintText、failLines(st, q, shown) → 時間到的說明行、links(st) → 挑選的格子之間要連的線 [[a, b], …]
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
    'use strict';
    var h = global.UI.h, kit = global.Reaction.kit;
    var NG = global.Reaction.numGrid = global.Reaction.numGrid || {};

    /* ═══ 可以自己調的參數（兩款遊戲共用）═══ */
    var GRID_W = [5, 8];                        /* 盤面欄數：第 1 關 → 到頂（四捨五入成整數；每格是正方形） */
    var GRID_H = [7, 11];                       /* 盤面列數：第 1 關 → 到頂 */
    var GRID_RAMP_LEVELS = 20;                  /* 盤面大小幾關之後長到最大（玩家指定：第 1 關 5×7，第 20 關 8×11） */
    var CELL_MAX = 90;                          /* 每格最大幾 px（盤面小的時候格子不要大得誇張） */
    var DEFAULT_LOUPE = false;                  /* 「浮窗」勾選框的預設值（玩家指定：不勾；玩家改過之後會記住，下次進來沿用） */
    var LOUPE_CELL_MAX = 64;                    /* 浮窗九宮格裡每一格最大幾 px（盤面的格子比這個小就跟盤面一樣大；盤面格子很大時，浮窗不要大得誇張） */
    var HIT = 0.84;                             /* 手指判定範圍：手指要落在格子中央這麼大的範圍內（佔格子邊長的比例）才算碰到這一格，避免斜著劃過轉角時誤碰旁邊的格子 */
    var DIGIT_H = 0.85;                         /* 數字的高度佔格子高度的比例（玩家指定 85%） */
    var BAR_H = 46;                             /* 介面最下方「浮窗」勾選框那一排的高度（px） */
    var POP_MS = 150;                           /* 收走時，每一格縮小消失的時間（毫秒） */
    var POP_GAP_MS = 12;                        /* 收走時，一串裡相鄰兩格消失的時間差（毫秒，一格接一格） */
    var FALL_DELAY_MS = 150;                    /* 收走之後，等多久上面的方格才開始往下掉（毫秒） */
    var FALL_MS = 380;                          /* 方格往下掉到定位的時間（毫秒，最後有一點彈跳）；掉的時候手指不能拖 */
    var BAD_MS = 650;                           /* 挑的這串算失敗時，那幾格閃紅多久（毫秒） */
    var EVEN_COLOR = 'rgb(180, 0, 0)';          /* 連號長龍盤面上雙數數字（2、4、6、8）的字色（玩家指定：紅色 RGB 180,0,0）；單數維持一般的深色。拖曳湊十用自己的三種顏色（reaction_sumten.js 的 digitColor）。挑選中、失敗閃紅、時間到標出的格子一律白字，不然彩色字落在藍底上看不清楚 */
    var DIAG = false;                           /* 能不能走斜的（true＝八個方向，false＝只能上下左右） */
    var OPT_KEY = 'fm.numgrid.loupe';           /* 「浮窗」的選擇存在手機哪裡（localStorage 的 key；兩款遊戲共用，存 true／false）。舊版的 'fm.numgrid.opts'、'fm.numchain.opts' 不再讀：浮窗預設改成不勾，大家都從不勾開始 */

    /* ═══ 純函式（不碰畫面）═══ */
    /* 棋盤（gr）：{ w 欄數, h 列數, n 全部幾格, nb 每一格的鄰居 }。格子編號 ＝ 列 × w ＋ 欄。鄰居：上下左右（DIAG 開了還有四個斜角）。同樣大小只做一次 */
    var GRIDS = {};
    function gridOf(w, hh) {
        var key = w + 'x' + hh;
        if (GRIDS[key]) return GRIDS[key];
        var nb = [], i;
        for (i = 0; i < w * hh; i++) {
            var r = Math.floor(i / w), c = i % w, list = [];  /* Math.floor：無條件捨去成整數 */
            for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
                if (!dr && !dc) continue;
                if (!DIAG && dr && dc) continue;
                var rr = r + dr, cc = c + dc;
                if (rr >= 0 && rr < hh && cc >= 0 && cc < w) list.push(rr * w + cc);
            }
            nb.push(list);
        }
        GRIDS[key] = { w: w, h: hh, n: w * hh, nb: nb };
        return GRIDS[key];
    }
    function neighbors(gr, i) { return gr.nb[i]; }
    function adjacent(gr, a, b) { return gr.nb[a].indexOf(b) >= 0; }  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 >= 0 代表「在裡面」） */
    /* 第 level 關的各項難度（都是 [第 1 關, 到頂] 線性變化，用共用的 kit.ramp）；maxLevel 是「到頂的關卡」 */
    function ramp(level, pair, maxLevel) { return kit.ramp(level, pair[0], pair[1], maxLevel); }
    function dimsFor(level) { return { w: Math.max(3, Math.round(ramp(level, GRID_W, GRID_RAMP_LEVELS))), h: Math.max(3, Math.round(ramp(level, GRID_H, GRID_RAMP_LEVELS))) }; }  /* Math.round：四捨五入成整數 */
    function gridFor(level) { var d = dimsFor(level); return gridOf(d.w, d.h); }

    /* ── 收走、掉落 ──
       collapse(gr, vals, removed)：把 removed（要收走的格子編號）拿掉，每一欄剩下的方格往下掉到底。
       回傳 { vals（掉完之後的盤面，最上面缺的格子是 null）, moves（剩下的方格怎麼掉：[{ from, to }]）, fresh（缺的格子＝新方格最後停的位置，由上到下、一欄一欄） } */
    function collapse(gr, vals, removed) {
        var rm = {}, out = [], moves = [], fresh = [], i, c, r;
        removed.forEach(function (k) { rm[k] = 1; });
        for (i = 0; i < gr.n; i++) out.push(null);
        for (c = 0; c < gr.w; c++) {
            var keep = [];
            for (r = gr.h - 1; r >= 0; r--) { i = r * gr.w + c; if (vals[i] != null && !rm[i]) keep.push(i); }   /* 由下往上，留下沒被收走的 */
            keep.forEach(function (from, j) { var to = (gr.h - 1 - j) * gr.w + c; out[to] = vals[from]; moves.push({ from: from, to: to }); });
            for (r = 0; r < gr.h - keep.length; r++) fresh.push(r * gr.w + c);
        }
        return { vals: out, moves: moves, fresh: fresh };
    }
    /* 把 fresh（缺的格子＝新方格最後停的位置）都填上數字（直接改 vals）：一次挑「四周已經有數字的格子最多」的那一格先填（同樣多就隨機），
       這樣每個新方格寫數字的時候，四周大多已經知道是什麼了。pick(k)：這一格要寫什麼數字（各遊戲自己的推算法） */
    function fillNew(gr, vals, fresh, pick, rand) {
        rand = rand || Math.random;
        var todo = fresh.slice();
        while (todo.length) {
            var bi = 0, bs = -1;
            for (var j = 0; j < todo.length; j++) {
                var known = 0;
                gr.nb[todo[j]].forEach(function (n) { if (vals[n] != null) known++; });
                var s = known + rand() * 0.5;
                if (s > bs) { bs = s; bi = j; }
            }
            var k = todo.splice(bi, 1)[0];
            vals[k] = pick(k);
        }
        return vals;
    }
    /* 在還空著的格子（free[i] 為 true）裡，隨機找一條長度剛好是 len 的「不重疊的路」；找不到回傳 null（深度優先搜尋，走不下去就退回去換一條） */
    function growWalk(gr, free, len, rand) {
        var starts = [];
        for (var i = 0; i < gr.n; i++) if (free[i]) starts.push(i);
        starts = kit.shuffle(starts, rand);               /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        var budget = { n: 600 };
        for (var s = 0; s < starts.length && s < 40 && budget.n > 0; s++) {
            var path = [starts[s]], mark = {};
            mark[starts[s]] = 1;
            if (walk(path, mark)) return path;
        }
        return null;
        function walk(path, mark) {
            if (path.length === len) return true;
            if (budget.n-- <= 0) return false;
            var last = path[path.length - 1];
            var opts = kit.shuffle(gr.nb[last].filter(function (k) { return free[k] && !mark[k]; }), rand);  /* filter：留下符合條件的元素，回傳新陣列 */
            for (var j = 0; j < opts.length; j++) {
                path.push(opts[j]); mark[opts[j]] = 1;
                if (walk(path, mark)) return true;
                path.pop(); delete mark[opts[j]];
            }
            return false;
        }
    }

    /* ── 挑選方格 ──
       st.sel＝這一次拖曳挑到的格子（依拖的順序）。手指按下開始新的一串，手指離開就拿去計算。
       beginDrag(st, k)：手指按在第 k 格，從這一格開始新的一串 */
    function beginDrag(st, k) { st.sel = [k]; }
    /* 手指拖到第 k 格：回傳 'add'（接上這一格）／'back'（拖回上一格，最後一格收回）／null（不行，什麼都沒發生）。
       規則：要跟這一串的最後一格相鄰、還沒在串裡、而且 canStep(st, last, k) 說可以（數字的限制）。 */
    function dragStep(st, k, canStep) {
        var sel = st.sel, last = sel[sel.length - 1];
        if (!sel.length || k < 0 || k >= st.gr.n || st.vals[k] == null || k === last) return null;
        if (sel.length >= 2 && k === sel[sel.length - 2]) { sel.pop(); return 'back'; }
        if (sel.indexOf(k) >= 0 || !adjacent(st.gr, last, k) || (canStep && !canStep(st, last, k))) return null;
        sel.push(k);
        return 'add';
    }

    /* 「浮窗」的選擇：記在 localStorage（沒有改過就用預設值），這一頁只讀一次 */
    var opts = null;
    function getOpts() {
        if (!opts) {
            var s = null;
            try { s = global.UI.store.get(OPT_KEY, null); } catch (e) { }
            opts = { loupe: typeof s === 'boolean' ? s : DEFAULT_LOUPE };
        }
        return opts;
    }
    function saveOpts() { try { global.UI.store.set(OPT_KEY, opts.loupe); } catch (e) { } }

    /* 浮窗九宮格該放在哪（純函式，測試用）：手指在舞台的位置 px、手指所在格的列 r、盤面左上角 by、每格 cell、浮窗寬高 (pw, ph)、舞台寬高 (W, H)。
       放在手指所在格上面「兩格」處：浮窗的下緣貼著「手指上方那一格」的上緣（不蓋住手指上面那一格）；左右置中在手指上、但不超出舞台兩側；
       上面放不下（浮窗會超出舞台上緣）就改放在手指下方（同樣空一格）；下面也放不下就貼著舞台下緣。回傳 { left, top } */
    function loupeAt(px, r, bx, by, cell, pw, ph, W, H) {
        var left = Math.max(0, Math.min(px - pw / 2, W - pw));
        var top = by + (r - 1) * cell - ph;
        if (top < 0) top = by + (r + 2) * cell;
        if (top + ph > H) top = Math.max(0, H - ph);
        return { left: left, top: top };
    }
    /* 動畫用的緩動：落地時有一點彈跳（easeOutBounce） */
    function bounce(t) {
        if (t >= 1) return 1;
        if (t < 1 / 2.75) return 7.5625 * t * t;
        if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
        if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
        t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;
    }

    /* ═══ 畫面與操作 ═══ */
    /* mount：選單按下這款遊戲時各遊戲檔案會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx, spec) {
        kit.run(root, ctx, {
            id: spec.id, G: spec.G, maxLevel: spec.maxLevel, goodAt: 5, stageClass: 'numgrid-stage',
            numText: function (v) { return v + ' 關'; },
            rating: spec.rating,
            info: function (S) { return S.infoText || ''; },          /* 標題列右邊：得分 X／目標（setup 裡每次得分都更新 S.infoText） */
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: function (api) { setup(api, spec); }
        });
    }

    /* setup(api, spec)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。 */
    function setup(api, spec) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器；level：現在是第幾關 */
        var q = spec.makePuzzle(level, api.rand), st = spec.newState(q), GR = q.gr, over = false, OPT = getOpts();
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        api.game = st;
        console.log(spec.logLine(q, level));

        /* 盤面大小：欄數、列數隨關卡變（第 1 關 5×7、第 20 關起 8×11），每格正方形；寬高都要放得下，取比較小的那個（盡量大）。
           上方不留說明列（得分在標題列右邊），下方留一排給「浮窗」勾選框 */
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, topPad = 4;
        var cell = Math.floor(Math.min((W - 6) / GR.w, (H - topPad - BAR_H - 8) / GR.h, CELL_MAX)), BW = cell * GR.w, BH = cell * GR.h;
        var bx = Math.round((W - BW) / 2), by = topPad;                  /* 盤面貼著上方（寬度通常先放滿，下面會多出一點空白；上面的空間留給盤面） */
        var cv = h('canvas', { 'class': 'numgrid-board' });
        cv.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;width:' + BW + 'px;height:' + BH + 'px;';
        var DPR = Math.min(3, window.devicePixelRatio || 1);
        cv.width = Math.round(BW * DPR); cv.height = Math.round(BH * DPR);
        stage.appendChild(cv);                          /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var g = cv.getContext('2d');

        /* 浮窗九宮格：另一張小畫布，浮在盤面上方（pointer-events:none，不會擋到手指）；每格大小 lc（盤面的格子，但不超過 LOUPE_CELL_MAX） */
        var lc = Math.min(cell, LOUPE_CELL_MAX), LW = 3 * lc, lcv = h('canvas', { 'class': 'numgrid-loupe' }), BORDER = 2;
        lcv.style.cssText = 'width:' + LW + 'px;height:' + LW + 'px;display:none;border-width:' + BORDER + 'px;';
        lcv.width = Math.round(LW * DPR); lcv.height = Math.round(LW * DPR);
        stage.appendChild(lcv);
        var lg = lcv.getContext('2d');

        /* 顏色：從主題變數讀（canvas 不能直接用 var(--xxx)） */
        var cs = getComputedStyle(document.documentElement);
        function cvar(name, fallback) { var v = cs.getPropertyValue(name); return v && v.trim() ? v.trim() : fallback; }
        var COL = {
            ink: cvar('--c-ink', '#4A3B1E'), card: cvar('--c-card', '#FFFDF3'), line: cvar('--bd-c', '#E3D19A'), back: cvar('--c-card-alt', '#FFF6D8'),
            sel: cvar('--c-blue', '#3A7BBF'), on: cvar('--c-on-accent', '#FFFFFF'), tint: cvar('--c-orange', '#E8843A'), even: EVEN_COLOR, bad: cvar('--c-red', '#C93A2E')
        };

        /* 數字的字級：量「8」的筆畫實際高度，算出讓數字高度剛好是格子高度 DIGIT_H 倍的字級；用 kit.drawGlyph 讓每個數字的筆畫外框置中 */
        var FF = getComputedStyle(cv).fontFamily || 'sans-serif', fontPx = 0;
        g.font = '900 100px ' + FF;
        var m8 = g.measureText('8'), hh = m8.actualBoundingBoxAscent + m8.actualBoundingBoxDescent;
        var fontPer = cell * DIGIT_H / (isFinite(hh) && hh > 0 ? hh / 100 : 0.72);   /* 舊瀏覽器量不到時，用數字高度約字級 0.72 倍估 */
        fontPx = Math.round(fontPer * DPR);

        /* 動畫：anim[i]＝第 i 格從第 from 列（可以是小數、負數＝在盤面上方）往下掉；fx＝收走的消失動畫與得分數字；
           busyUntil＝掉完之前手指不能拖；shown＝時間到時標出的最好一串；msgTimer＝標題列右邊暫時換成提醒文字的計時器 */
        var anim = {}, fx = [], looping = false, busyUntil = 0, shown = null, msgTimer = null, badFlash = null;   /* badFlash：{ cells（算失敗的格子）, until } */
        function cx(i) { return (i % GR.w + 0.5) * cell * DPR; }
        function cyRow(r) { return (r + 0.5) * cell * DPR; }
        function rowOf(i) { return Math.floor(i / GR.w); }
        function roundRect(ctx, x, y, w, hgt, r) {
            ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + hgt - r);
            ctx.quadraticCurveTo(x + w, y + hgt, x + w - r, y + hgt); ctx.lineTo(x + r, y + hgt); ctx.quadraticCurveTo(x, y + hgt, x, y + hgt - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        }
        /* 一般格子的數字字色：遊戲自己規定（spec.digitColor，拖曳湊十）；沒規定就是雙數紅字、單數深色（連號長龍） */
        var inkOf = spec.digitColor || function (v) { return v % 2 === 0 ? COL.even : COL.ink; };

        /* 畫一格：ctx 的 (x, y) 是左上角、size 是邊長（畫布像素）、v 是數字、state 是 'sel'（挑選了，藍底）／'bad'（剛剛算失敗，紅底閃一下）／
           'hot'（時間到標出的，橘底）／空字串（一般） */
        function drawCell(ctx, x, y, size, v, state) {
            var pad = Math.max(1, Math.round(size * 0.03));
            ctx.fillStyle = state === 'sel' ? COL.sel : (state === 'bad' ? COL.bad : (state === 'hot' ? COL.tint : COL.card));
            ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(1, DPR * 0.8);
            roundRect(ctx, x + pad, y + pad, size - 2 * pad, size - 2 * pad, size * 0.1); ctx.fill(); if (!state) ctx.stroke();
            ctx.fillStyle = state ? COL.on : inkOf(v); ctx.font = '900 ' + Math.max(1, Math.round(fontPer * size / cell)) + 'px ' + FF;   /* 挑選中／失敗／標出的格子白字，其餘照 inkOf */
            kit.drawGlyph(ctx, String(v), x + size / 2, y + size / 2);
        }
        /* 第 i 格現在要畫成哪一種：挑選中／剛剛算失敗（閃紅）／時間到標出的／一般 */
        function stateMap(t) {
            var m = {};
            if (shown) shown.forEach(function (k) { m[k] = 'hot'; });
            if (badFlash && t < badFlash.until) badFlash.cells.forEach(function (k) { m[k] = 'bad'; });
            st.sel.forEach(function (k) { m[k] = 'sel'; });
            return m;
        }

        /* 重畫整個盤面：底色、每一格（挑選的是藍底白字、掉落中的在半路上）、連線，以及收走的消失動畫（fx） */
        function paint(now) {
            var c = cell * DPR, t = now == null ? performance.now() : now, i;
            g.clearRect(0, 0, cv.width, cv.height);
            g.fillStyle = COL.back; g.fillRect(0, 0, cv.width, cv.height);
            var states = stateMap(t);
            for (i = 0; i < GR.n; i++) {                   /* 每一格：底、數字（掉落中的格子，依動畫進度畫在 from 列到定位列之間） */
                var v = st.vals[i];
                if (v == null) continue;
                var row = rowOf(i), a = anim[i];
                if (a) {
                    var p = (t - a.t0) / a.ms;
                    if (p >= 1) { delete anim[i]; a = null; }
                    else if (p > 0) row = a.from + (row - a.from) * bounce(p);
                    else row = a.from;                       /* 還沒輪到掉：停在原處 */
                }
                drawCell(g, (i % GR.w) * c, row * c, c, v, states[i] || '');
            }
            var links = st.sel.length > 1 ? spec.links(st) : [];
            if (links.length) {                            /* 連線：挑選的格子之間，接得起來的連一條線 */
                g.strokeStyle = COL.on; g.globalAlpha = 0.5; g.lineWidth = c * 0.16; g.lineCap = 'round';
                g.beginPath();
                links.forEach(function (l) { g.moveTo(cx(l[0]), cyRow(rowOf(l[0]))); g.lineTo(cx(l[1]), cyRow(rowOf(l[1]))); });
                g.stroke(); g.globalAlpha = 1;
            }
            /* 收走的動畫：格子縮小並淡出；得分的數字往上飄 */
            fx = fx.filter(function (f) { return t - f.t0 < f.ms; });
            fx.forEach(function (f) {
                var pr = Math.max(0, (t - f.t0) / f.ms);
                if (f.kind === 'pop') {
                    var s = 1 - pr, x0 = cx(f.k), y0 = cyRow(rowOf(f.k));
                    g.globalAlpha = 1 - pr * pr; g.fillStyle = COL.sel;
                    g.fillRect(x0 - c / 2 * s, y0 - c / 2 * s, c * s, c * s);
                    g.fillStyle = COL.on; g.font = '900 ' + Math.max(1, Math.round(fontPx * s)) + 'px ' + FF;
                    kit.drawGlyph(g, String(f.v), x0, y0);
                    g.globalAlpha = 1;
                } else {
                    g.globalAlpha = 1 - pr * pr; g.font = '900 ' + Math.round(c * 0.8) + 'px ' + FF;
                    var gp = kit.glyphAnchor(g, f.text, f.x, f.y - pr * c * 1.6);
                    g.strokeStyle = COL.card; g.lineWidth = c * 0.14; g.lineJoin = 'round'; g.strokeText(f.text, gp.x, gp.y);
                    g.fillStyle = COL.sel; g.fillText(f.text, gp.x, gp.y);
                    g.globalAlpha = 1;
                }
            });
        }
        /* 有動畫要播時，跑一個畫面更新迴圈，播完就停 */
        function kick() {
            if (looping) return;
            looping = true;
            api.my.loop(function (now) {                   /* my.loop(函式)：每個畫面更新就執行一次函式；函式回傳 false 就停止 */
                paint(now);
                if (!fx.length && !Object.keys(anim).length && !(badFlash && now < badFlash.until)) { if (badFlash) { badFlash = null; paint(now); } looping = false; return false; }
            });
        }

        /* ── 浮窗九宮格：手指所在的格子和它四周的八格，畫在手指上方 ── */
        var fingerCell = -1;
        function paintLoupe() {
            var c0 = fingerCell % GR.w, r0 = rowOf(fingerCell), lp = LW * DPR, one = lp / 3, dr, dc;
            lg.clearRect(0, 0, lcv.width, lcv.height);
            lg.fillStyle = COL.back; lg.fillRect(0, 0, lcv.width, lcv.height);
            var states = stateMap(performance.now()), win = {};
            for (dr = -1; dr <= 1; dr++) for (dc = -1; dc <= 1; dc++) {
                var rr = r0 + dr, cc = c0 + dc;
                if (rr < 0 || rr >= GR.h || cc < 0 || cc >= GR.w) continue;      /* 盤面外：留空 */
                var i = rr * GR.w + cc;
                win[i] = [dc + 1, dr + 1];
                if (st.vals[i] != null) drawCell(lg, (dc + 1) * one, (dr + 1) * one, one, st.vals[i], states[i] === 'sel' ? 'sel' : '');
            }
            lg.strokeStyle = COL.on; lg.globalAlpha = 0.5; lg.lineWidth = one * 0.16; lg.lineCap = 'round'; lg.beginPath();   /* 挑選的格子之間的連線（也畫在浮窗裡） */
            if (st.sel.length > 1) spec.links(st).forEach(function (l) { if (win[l[0]] && win[l[1]]) { lg.moveTo((win[l[0]][0] + 0.5) * one, (win[l[0]][1] + 0.5) * one); lg.lineTo((win[l[1]][0] + 0.5) * one, (win[l[1]][1] + 0.5) * one); } });
            lg.stroke(); lg.globalAlpha = 1;
            lg.strokeStyle = COL.tint; lg.lineWidth = Math.max(3, one * 0.07);        /* 中間那格（手指所在）用橘框標出來 */
            lg.strokeRect(one + lg.lineWidth / 2, one + lg.lineWidth / 2, one - lg.lineWidth, one - lg.lineWidth);
        }
        /* 手指在舞台的位置 p：算出手指所在格（超出盤面就算最近的一格）、放好浮窗、重畫 */
        function showLoupe(p) {
            if (!OPT.loupe) { lcv.style.display = 'none'; return; }
            var c = Math.max(0, Math.min(GR.w - 1, Math.floor((p.x - bx) / cell))), r = Math.max(0, Math.min(GR.h - 1, Math.floor((p.y - by) / cell)));
            fingerCell = r * GR.w + c;
            var pos = loupeAt(p.x, r, bx, by, cell, LW + 2 * BORDER, LW + 2 * BORDER, W, H);
            lcv.style.left = Math.round(pos.left) + 'px'; lcv.style.top = Math.round(pos.top) + 'px'; lcv.style.display = 'block';
            paintLoupe();
        }
        function hideLoupe() { lcv.style.display = 'none'; fingerCell = -1; }

        /* 標題列右邊：得分／目標（靠右）。寫進 S.infoText，過關時標題列重畫也不會不見；say 讓它暫時換成一句提醒 */
        function refresh() {
            if (msgTimer != null) { api.my.cancel(msgTimer); msgTimer = null; }
            var text = '得分 ' + st.score + '／' + q.target;
            api.S.infoText = text; api.setInfo(text);
        }
        function say(text) {
            api.setInfo(text);
            if (msgTimer != null) api.my.cancel(msgTimer);
            msgTimer = api.after(1500, function () { msgTimer = null; api.setInfo(api.S.infoText || ''); });
        }

        /* ── 介面最下方：「浮窗」勾選框 ── */
        var chkL = h('input', { attrs: { type: 'checkbox' } });
        chkL.checked = OPT.loupe;
        var bar = h('div', { 'class': 'numgrid-bar' }, [h('label', { 'class': 'numgrid-check' }, [chkL, h('span', { text: '浮窗' })])]);
        bar.style.height = BAR_H + 'px';
        stage.appendChild(bar);
        chkL.addEventListener('change', function () { OPT.loupe = chkL.checked; saveOpts(); if (!OPT.loupe) hideLoupe(); });

        paint(); refresh();
        api.timer(spec.timeMs(level), function () { finish('time'); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once(spec.id + '.hint')) {   /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            var p0 = spec.hint ? spec.hint(st) : spec.best(st, 4);
            if (p0.length >= 2) kit.hintOn(stage, null, { mode: 'drag', x: bx + cx(p0[0]) / DPR, y: by + cyRow(rowOf(p0[0])) / DPR, dx: (cx(p0[1]) - cx(p0[0])) / DPR, dy: (cyRow(rowOf(p0[1])) - cyRow(rowOf(p0[0]))) / DPR, delay: 500, text: spec.hintText });  /* 操作提示（手指圖示指出該怎麼拖） */
        }

        var pid = null, lastPt = null;                  /* pid：正在拖的那根手指的編號（只認一根；null＝沒在拖）；lastPt：手指上一個位置 */
        /* 把舞台座標換算成格子編號（棋盤外、或沒落在格子中央 HIT 範圍內回傳 −1；loose＝true 時整格都算，按下去的那一下用） */
        function cellAt(x, y, loose) {
            var px = x - bx, py = y - by, c = Math.floor(px / cell), r = Math.floor(py / cell);
            if (c < 0 || c >= GR.w || r < 0 || r >= GR.h) return -1;
            if (!loose) {
                var lim = HIT * cell / 2;
                if (Math.abs(px - (c + 0.5) * cell) > lim || Math.abs(py - (r + 0.5) * cell) > lim) return -1;
            }
            return r * GR.w + c;
        }
        /* 手指移動到 p：把「上一個位置到 p」切成小步（每步最多 1/4 格），一步一步呼叫 dragStep，手指移太快也不會跳過格子 */
        function feed(p) {
            if (over || api.over || pid == null) return;
            var from = lastPt || p, dist = kit.dist(from.x, from.y, p.x, p.y), steps = Math.max(1, Math.ceil(dist / (cell / 4)));  /* Math.ceil：無條件進位成整數 */
            var changed = false;
            for (var s = 1; s <= steps; s++) {
                var k = cellAt(from.x + (p.x - from.x) * s / steps, from.y + (p.y - from.y) * s / steps);
                if (k < 0) continue;
                var act = dragStep(st, k, spec.canStep);
                if (act) { Sfx.play(act === 'add' ? 'tick' : 'flip'); changed = true; }  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            }
            lastPt = p;
            if (changed) paint();
            showLoupe(p);
        }
        stage.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (over || api.over || pid != null || performance.now() < busyUntil) return;   /* 方格還在往下掉：先不能拖 */
            var p = kit.localPt(e, stage), k = cellAt(p.x, p.y, true);
            if (k < 0 || st.vals[k] == null) return;
            badFlash = null;                             /* 上一次失敗的紅色閃爍：開始新的一串就收掉 */
            e.preventDefault(); pid = e.pointerId; lastPt = p;  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }  /* setPointerCapture：手指移出元素範圍後，仍然持續收到這個元素的移動事件（拖曳才不會中斷） */
            beginDrag(st, k);
            Sfx.play('tick'); paint(); showLoupe(p);
        });
        stage.addEventListener('pointermove', function (e) { if (pid === e.pointerId) feed(kit.localPt(e, stage)); });
        /* 手指放開：馬上計算 */
        function up(e) {
            if (pid !== e.pointerId) return;
            pid = null; lastPt = null; hideLoupe();
            if (over || api.over) return;
            runCommit();
        }
        stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

        /* 計算：收得走就收走；收不走一律清掉挑選 */
        function runCommit() {
            var n = st.sel.length, r = spec.commit(st, api.rand);
            if (!r) return;
            if (r.ok) { collect(r); return; }
            st.sel = [];
            if (r.fail) {                                 /* 規則說「這串算失敗」（拖曳湊十）：那幾格閃紅一下、播答錯音效 */
                badFlash = { cells: r.cells.slice(), until: performance.now() + BAD_MS };
                Sfx.play('bad'); say(spec.failMsg(r)); paint(); kick();
                return;
            }
            if (n >= 2) say(spec.failMsg(r));             /* 只點一下（1 格）不提醒 */
            paint();
        }
        /* 收走成功：播消失動畫、讓方格往下掉（新方格從盤面上方掉進來），然後判斷過關 */
        function collect(r) {
            var t0 = performance.now();
            r.cells.forEach(function (k, j) { fx.push({ kind: 'pop', k: k, v: r.oldVals[j], t0: t0 + j * POP_GAP_MS, ms: POP_MS }); });   /* 收走：一格接一格縮小消失 */
            var last = r.cells[r.cells.length - 1];
            fx.push({ kind: 'gain', text: '＋' + r.gain, x: cx(last), y: cyRow(rowOf(last)), t0: t0, ms: 900 });
            /* 掉落：剩下的方格從原來的列掉到新的列；新方格從盤面上方（欄裡缺幾格就從幾列以上）掉進來 */
            var fallAt = t0 + FALL_DELAY_MS, colNew = {};
            r.fresh.forEach(function (k) { colNew[k % GR.w] = (colNew[k % GR.w] || 0) + 1; });
            r.moves.forEach(function (mv) { if (rowOf(mv.from) !== rowOf(mv.to)) anim[mv.to] = { from: rowOf(mv.from), t0: fallAt, ms: FALL_MS }; });
            r.fresh.forEach(function (k) { anim[k] = { from: rowOf(k) - colNew[k % GR.w], t0: fallAt, ms: FALL_MS }; });
            busyUntil = fallAt + FALL_MS + 30;
            Sfx.play('ok'); refresh(); paint(t0); kick();
            if (st.score >= q.target) finish('ok');
        }

        /* 結束：kind ＝ 'ok'（達標）／'time'（時間到） */
        function finish(kind) {
            if (over || api.over) return;
            over = true; pid = null; hideLoupe();
            if (kind === 'ok') {
                kit.flash(stage, true, api.my);         /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                api.pass({ delay: 1400 });              /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                return;
            }
            /* 時間到：把盤面上目前最好的一串標出來（讓玩家知道本來還有什麼可以拿） */
            st.sel = []; shown = spec.best(st, 0); busyUntil = 0; paint(); kick();
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3000, lines: spec.failLines(st, q, shown) });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 驗證用：api.solve 每次拿盤面上最好的一串，一直拿到達標；api.wrong 直接當作時間到 */
        api.solve = function () {
            for (var n = 0; n < 300 && !over && !api.over && st.score < q.target; n++) {
                var p = spec.best(st, 0);
                if (p.length < 2) break;
                st.sel = p.slice();
                if (!spec.commit(st, api.rand)) break;
                refresh(); paint();
                if (st.score >= q.target) finish('ok');
            }
        };
        api.wrong = function () { finish('time'); };
        /* 拍縮圖用：先把盤面上最好那串的前 n 格選起來（像手指正拖到一半） */
        api.preview = function (n) { st.sel = spec.best(st, 0).slice(0, n); paint(); };
        /* 驗證／拍縮圖用：直接指定挑選的格子（依序） */
        api.select = function (cells) { st.sel = cells.slice(); paint(); };
    }

    NG.GRID_W = GRID_W; NG.GRID_H = GRID_H; NG.GRID_RAMP_LEVELS = GRID_RAMP_LEVELS; NG.CELL_MAX = CELL_MAX; NG.DEFAULT_LOUPE = DEFAULT_LOUPE;
    NG.EVEN_COLOR = EVEN_COLOR; NG.LOUPE_CELL_MAX = LOUPE_CELL_MAX; NG.HIT = HIT; NG.DIGIT_H = DIGIT_H; NG.BAR_H = BAR_H; NG.DIAG = DIAG;
    NG.gridOf = gridOf; NG.neighbors = neighbors; NG.adjacent = adjacent; NG.ramp = ramp; NG.dimsFor = dimsFor; NG.gridFor = gridFor;
    NG.collapse = collapse; NG.fillNew = fillNew; NG.growWalk = growWalk;
    NG.beginDrag = beginDrag; NG.dragStep = dragStep;
    NG.getOpts = getOpts; NG.loupeAt = loupeAt; NG.bounce = bounce;
    NG.mount = mount;
})(window);
