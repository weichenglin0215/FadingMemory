/* ═══════════════════════════════════════════════════════════════════
   leaderboard_ui.js — 秒反應「世界排行榜」的畫面（彈窗、慣性捲動、煙火）
   ───────────────────────────────────────────────────────────────────
   資料與網路的部分在 js/leaderboard.js，這個檔案只負責畫面，載入後把功能掛在
   Leaderboard.ui 底下，核心那邊要彈窗時就呼叫它：
     Leaderboard.showBoard(遊戲, {startText, onClose})  世界前 30 名彈窗（reaction.js 在玩法說明之後呼叫）
     Leaderboard.ui.askNickname(opts)                    「輸入暱稱」彈窗，回傳 Promise<暱稱或 ''>
     Leaderboard.ui.celebrate(info)                      進榜慶祝：恭喜彈窗＋煙火＋歡呼音樂
     Leaderboard.ui.toast(文字)                          畫面下方短暫的小提示（就是 Dlg.toast）
   四個彈窗的外框與卡片都是「彈窗公版」（js/dialog.js 的 Dlg.open、css/dialog.css）：
   位置、暗底、寬度、圓角、陰影、按鈕尺寸與顏色跟玩法說明、結算彈窗完全一致；這個檔案只決定卡片裡放什麼。
   榜單內容的樣式在 css/leaderboard.css，顏色／尺寸變數在 css/theme.css 的 :root（「世界排行榜」那一段）。

   【手指拖曳＋慣性捲動】
   榜單可以用手指或滑鼠拖曳、放手後帶慣性滑行、滑到頭尾有橡皮筋、也支援滑鼠滾輪與鍵盤；
   這套捲動已抽成共用元件 js/scroller.js（做法與物理公式的說明都在那個檔案開頭），
   「選一個想玩的遊戲」的遊戲列表（js/menu.js）用的是同一份，手感一致。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var h = global.UI.h;
    var LB = global.Leaderboard;
    /* 使用者在系統設定了「減少動態效果」就不放煙火、不播動畫（跟 reaction_kit.js 的 REDUCED 同一個規則） */
    var REDUCED = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* ═══════════════════════════════════════════════════════════════
       一、慣性捲動（共用元件 js/scroller.js）
       物理（PHYS 摩擦力、橡皮筋、放手速度）與捲動元件已經抽到 js/scroller.js，選單的遊戲列表也用同一份，手感一致。
       這裡只留別名，讓下面的程式與 LB.test.scroll（Node 測試）照舊使用。
       ═══════════════════════════════════════════════════════════════ */
    var Scroller = global.Scroller;
    var PHYS = Scroller.PHYS, rubber = Scroller.rubber, releaseVelocity = Scroller.releaseVelocity, flingStep = Scroller.flingStep;

    /* ═══════════════════════════════════════════════════════════════
       二、小工具
       ═══════════════════════════════════════════════════════════════ */
    function stageEl() { return document.getElementById('stage') || document.body; }

    /* 舞台目前的縮放倍率（手機上通常小於 1）。手指移動的螢幕像素要除以它，才是舞台裡的像素 */
    function stageScale() {
        var r = global.Stage && global.Stage.rect && global.Stage.rect();
        return (r && r.scale) || 1;
    }

    /* 讀 CSS 變數的文字值（例如 '#E0AA25'）；煙火的顏色從主題變數拿，不在 JS 裡寫死 */
    function cssVar(name, fallback) {
        var v = global.getComputedStyle(document.documentElement).getPropertyValue(name);
        return (v && v.trim()) || fallback;
    }

    function sfx(name) { if (global.Sfx) { global.Sfx.unlock(); global.Sfx.play(name); } }

    function removeEl(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

    /* ═══════════════════════════════════════════════════════════════
       三、慣性捲動的元件
       viewport：固定高度、overflow hidden 的視窗；content：裡面真正很長的內容；thumb：右側的小滑桿
       （實作在 js/scroller.js 的 Scroller.make）
       ═══════════════════════════════════════════════════════════════ */
    function makeScroller(viewport, content, thumb) { return Scroller.make(viewport, content, thumb); }

    /* ═══════════════════════════════════════════════════════════════
       四、世界前 30 名彈窗
       ═══════════════════════════════════════════════════════════════ */

    /* 畫出一列：名次徽章（前三名是金銀銅牌）、暱稱、成績 */
    function rowEl(row, spec) {
        var top = row.rank <= 3;
        var cls = 'lb-row' + (top ? ' lb-row--top lb-row--r' + row.rank : (row.rank % 2 ? '' : ' lb-row--alt')) + (row.mine ? ' lb-row--mine' : '');
        var rank = top
            ? h('div', { 'class': 'lb-rank' }, [
                row.rank === 1 ? h('span', { 'class': 'lb-crown', html: global.UI.icon('crown') }) : null,
                h('span', { 'class': 'lb-medal', text: String(row.rank) })
            ])
            : h('div', { 'class': 'lb-rank lb-rank--n', text: String(row.rank) });
        var nick = h('div', { 'class': 'lb-nick' }, [
            h('span', { 'class': 'lb-nick__t', text: row.nick }),
            row.mine ? h('span', { 'class': 'lb-you', text: '你' }) : null
        ]);
        return h('div', { 'class': cls }, [rank, nick, h('div', { 'class': 'lb-score', text: LB.fmt(spec, row.score) })]);
    }

    /* 榜單底下的提示文字：進榜門檻、空位、連線狀態 */
    function noteText(board, spec) {
        if (!board) return '';
        if (board.stale) return '目前連不上網路，顯示的是先前看到的榜單';
        var n = board.top.length, limit = board.limit;
        if (n === 0) return '還沒有人上榜，第一名等你來拿！';
        if (n < limit) return '榜上還有 ' + (limit - n) + ' 個空位，現在挑戰一定能進榜';
        return '進榜門檻（第 ' + limit + ' 名）：' + LB.fmt(spec, board.top[n - 1].score);
    }

    /* 彈出世界排行榜。
       ref：遊戲物件（Reaction.register 登記的那個，要有 score 設定）；
       opts.startText：主按鈕文字，例如 '開始挑戰'（進場時）；不給就是 '關閉'；
       opts.onClose：玩家按下主按鈕、彈窗關掉之後要做的事（進場時＝開始遊戲）。 */
    function showBoard(ref, opts) {
        opts = opts || {};
        var g = (ref && typeof ref === 'object') ? ref : null;
        if (!g || !g.score) { if (opts.onClose) opts.onClose(); return; }
        var spec = g.score, closed = false;

        var nickLine = h('div', { 'class': 'lb-nickline' });
        var note = h('div', { 'class': 'lb-note' });
        var list = h('div', { 'class': 'lb-list' });
        var thumb = h('div', { 'class': 'lb-thumb' });
        var viewport = h('div', { 'class': 'lb-viewport' }, [list, thumb]);
        var scroller = makeScroller(viewport, list, thumb);

        function paintNick() {
            nickLine.innerHTML = '';
            var n = LB.getNick();
            if (!n) { nickLine.hidden = true; return; }
            nickLine.hidden = false;
            nickLine.appendChild(h('span', { 'class': 'lb-nickline__t', text: '暱稱：' + n }));
            nickLine.appendChild(h('button', {
                'class': 'pill pill--blue lb-nickline__btn', text: '修改',
                on: { click: function () {
                    sfx('click');
                    askNickname({ title: '修改暱稱', initial: n, okText: '儲存', skipText: '取消' }).then(function (name) {
                        if (name) LB.setNick(name);
                        paintNick();
                    });
                } }
            }));
        }

        var lastKey = '';
        function render(board, mode) {
            var key = mode + '|' + (board ? JSON.stringify(board.top) + board.stale : '');
            if (key === lastKey) return;                      /* 資料沒變就不重畫，避免玩家正在看的時候畫面跳一下 */
            lastKey = key;
            list.innerHTML = '';
            if (mode === 'loading') {
                list.appendChild(h('div', { 'class': 'lb-msg' }, [h('div', { 'class': 'lb-spin' }), h('div', { text: '載入世界排行榜中…' })]));
                note.textContent = '';
            } else if (!board) {
                list.appendChild(h('div', { 'class': 'lb-msg', text: '暫時連不上排行榜，沒有網路也可以照常玩。' }));
                note.textContent = '';
            } else if (!board.top.length) {
                list.appendChild(h('div', { 'class': 'lb-msg lb-msg--first' }, [
                    h('span', { html: global.UI.icon('trophy', 'lb-msg__icon') }),
                    h('div', { text: '還沒有人上榜' }),
                    h('div', { 'class': 'lb-msg__sub', text: '第一名等你來拿！' })
                ]));
                note.textContent = '';
            } else {
                board.top.forEach(function (row) { list.appendChild(rowEl(row, spec)); });
                note.textContent = noteText(board, spec);
            }
            scroller.refresh();
        }

        /* 公版彈窗（卡片拉到整個高度）：榜單視窗吃掉剩下的高度，主按鈕在最底下。
           彈窗關掉時（不管怎麼關）onClose 會把捲動元件收掉、並讓背景更新的結果不再重畫。 */
        var ctl = Dlg.open({
            tall: true, cls: 'dlg--board',
            onClose: function () { closed = true; scroller.destroy(); },
            children: [
                h('div', { 'class': 'lb-head' }, [
                    h('div', { 'class': 'lb-head__icon', html: global.UI.icon('trophy') }),
                    h('div', { 'class': 'lb-head__txt' }, [
                        h('div', { 'class': 'lb-title', text: '世界前 ' + ((LB.cached(g.id) || {}).limit || LB.CFG.LIMIT_DEFAULT) + ' 名' }),
                        h('div', { 'class': 'lb-sub', text: g.name })
                    ])
                ]),
                nickLine,
                h('div', { 'class': 'lb-cols' }, [h('span', { text: '名次' }), h('span', { text: '暱稱' }), h('span', { text: spec.label || '成績' })]),
                viewport,
                note
            ],
            buttons: [{
                text: opts.startText || '關閉', kind: opts.startText ? 'primary' : 'sky', sfx: opts.startText ? 'go' : 'click',
                onClick: function () { if (opts.onClose) opts.onClose(); }
            }]
        });
        paintNick();

        /* 有舊榜單（記憶體或上次存的）就先畫出來，再背景更新；完全沒有才顯示「載入中」 */
        var first = LB.cached(g.id);
        render(first, first ? 'ok' : 'loading');
        LB.load(g).then(function (b) {
            if (closed) return;
            render(b, 'ok');
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       五、「輸入暱稱」彈窗
       opts：title／initial（預設文字）／okText／skipText；回傳 Promise<暱稱>，按「先不要」回傳 ''
       ═══════════════════════════════════════════════════════════════ */
    function askNickname(opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var input = h('input', {
                'class': 'dlg-input',
                attrs: {
                    type: 'text', maxlength: String(LB.CFG.NICK_MAX), autocomplete: 'off', autocapitalize: 'off',
                    spellcheck: 'false', enterkeyhint: 'done', placeholder: '例如：快樂阿嬤', 'aria-label': '暱稱'
                }
            });
            input.value = opts.initial || '';
            var done = false;
            function value() { return LB.cleanNick(input.value); }
            function finish(v) {
                if (done) return;
                done = true;
                ctl.close();
                resolve(v);
            }
            /* 公版彈窗：標題、說明、輸入框、兩顆按鈕。按鈕都設 keep（不自動關），由 finish 統一關閉 */
            var ctl = Dlg.open({
                cls: 'dlg--nick',
                title: opts.title || '請輸入暱稱',
                sub: '排行榜上會顯示這個名字（最多 ' + LB.CFG.NICK_MAX + ' 個字）。',
                children: [input],
                buttons: [
                    { text: opts.okText || '確定', kind: 'primary', keep: true, sfx: 'ok', onClick: function () { if (value()) finish(value()); } },
                    { text: opts.skipText || '先不要', kind: 'line', keep: true, onClick: function () { finish(''); } }
                ]
            });
            var ok = ctl.buttons[0];
            function sync() { ok.disabled = !value(); }
            input.addEventListener('input', sync);
            input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && value()) { sfx('ok'); finish(value()); } });
            sync();
            try { input.focus(); } catch (e) { }
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       六、煙火（canvas 粒子）
       每一發：從一個點爆開 N 顆火花，受重力往下掉、慢慢變暗；
       每個畫面先用半透明把上一格擦淡一點（destination-out），就會留下拖尾。
       畫布疊在恭喜卡片上方（卡片幾乎佔滿畫面，放後面會被遮住），所以用一般混色
       （不用 lighter 加亮混色：在淺色卡片上加亮會變白色看不見）。
       ═══════════════════════════════════════════════════════════════ */
    var FW = {
        bursts: [0, 280, 650, 1000, 1400, 1850, 2300, 2800, 3300],   /* 每一發爆開的時間（毫秒，從彈出恭喜算起） */
        sparks: 54,         /* 每一發幾顆火花 */
        speedMin: 90, speedMax: 270,    /* 火花初速（像素／秒） */
        gravity: 170,       /* 重力（像素／秒²） */
        lifeMin: 0.9, lifeMax: 1.7,     /* 火花壽命（秒） */
        fade: 0.26,         /* 每格把上一格擦淡的力道（0～1，越大拖尾越短） */
        hardStopMs: 6500    /* 保底：分頁在背景時動畫會暫停，時間到一定收掉 */
    };

    function fireworks(host) {
        if (REDUCED || !global.document.createElement('canvas').getContext) return { stop: function () { } };
        var W = 500, H = 850;
        var k = Math.min(2, stageScale() * (global.devicePixelRatio || 1));      /* 畫布解析度倍率：夠銳利、又不會太吃效能 */
        var cv = h('canvas', { 'class': 'lb-fw' });
        cv.width = Math.round(W * k);
        cv.height = Math.round(H * k);
        host.insertBefore(cv, host.firstChild);
        var c2 = cv.getContext('2d');
        if (!c2) { removeEl(cv); return { stop: function () { } }; }
        var palette = [
            cssVar('--c-yellow', '#E0AA25'), cssVar('--c-orange', '#E8822E'), cssVar('--c-green', '#4C9A5B'),
            cssVar('--c-blue', '#3E86C4'), cssVar('--c-bad-light', '#E8524A')
        ];
        var parts = [], next = 0, stopped = false, raf = 0;
        var t0 = global.performance.now(), last = t0;

        function burst() {
            var cx = 90 + Math.random() * 320, cy = 110 + Math.random() * 300;
            var col = palette[Math.floor(Math.random() * palette.length)];
            for (var i = 0; i < FW.sparks; i++) {
                var a = Math.PI * 2 * i / FW.sparks + Math.random() * 0.2;
                var sp = FW.speedMin + Math.random() * (FW.speedMax - FW.speedMin);
                var life = FW.lifeMin + Math.random() * (FW.lifeMax - FW.lifeMin);
                parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life, age: 0, col: col });
            }
            sfx('boom');
        }
        function stop() {
            if (stopped) return;
            stopped = true;
            if (raf) global.cancelAnimationFrame(raf);
            removeEl(cv);
        }
        function frame(now) {
            if (stopped) return;
            var dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            var el = now - t0;
            while (next < FW.bursts.length && el >= FW.bursts[next]) { burst(); next++; }
            c2.setTransform(k, 0, 0, k, 0, 0);
            c2.globalCompositeOperation = 'destination-out';
            c2.fillStyle = 'rgba(0,0,0,' + FW.fade + ')';
            c2.fillRect(0, 0, W, H);
            c2.globalCompositeOperation = 'source-over';
            for (var i = parts.length - 1; i >= 0; i--) {
                var p = parts[i];
                p.age += dt;
                if (p.age >= p.life) { parts.splice(i, 1); continue; }
                p.vy += FW.gravity * dt;
                p.vx *= Math.pow(0.5, dt * 1.4);       /* 空氣阻力：水平速度慢慢變小 */
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                var f = 1 - p.age / p.life;
                c2.globalAlpha = Math.min(1, f * 1.4);
                c2.fillStyle = p.col;
                c2.beginPath();
                c2.arc(p.x, p.y, 1.6 + 2.4 * f, 0, Math.PI * 2);
                c2.fill();
            }
            c2.globalAlpha = 1;
            if (next >= FW.bursts.length && !parts.length) { stop(); return; }
            raf = global.requestAnimationFrame(frame);
        }
        raf = global.requestAnimationFrame(frame);
        global.setTimeout(stop, FW.hardStopMs);
        return { stop: stop };
    }

    /* ═══════════════════════════════════════════════════════════════
       七、進榜慶祝：恭喜彈窗＋煙火＋歡呼音樂
       info：{game, spec, score, rank, board}
       ═══════════════════════════════════════════════════════════════ */
    function celebrate(info) {
        var rank = info.rank, limit = (info.board && info.board.limit) || LB.CFG.LIMIT_DEFAULT;
        var fw = null;
        var top = rank <= 3;
        var title = rank === 1 ? '世界第一名！' : (rank <= 3 ? '前三名！' : (rank <= 10 ? '前十名！' : '恭喜進榜！'));
        var badge = top
            ? h('div', { 'class': 'lb-cg__badge lb-cg__badge--r' + rank }, [
                rank === 1 ? h('span', { 'class': 'lb-crown lb-crown--big', html: global.UI.icon('crown') }) : null,
                h('span', { text: String(rank) })
            ])
            : h('div', { 'class': 'lb-cg__badge lb-cg__badge--n', html: global.UI.icon('trophy') });

        /* 公版彈窗：徽章、標題、名次、說明、成績，底下兩顆並排的按鈕；煙火畫布疊在整個彈窗上（關掉時停掉） */
        var ctl = Dlg.open({
            cls: 'dlg--congrats', btnRow: true,
            onClose: function () { if (fw) fw.stop(); },
            children: [
                badge,
                h('div', { 'class': 'lb-cg__title', text: title }),
                h('div', { 'class': 'lb-cg__rank', text: '第 ' + rank + ' 名' }),
                h('div', { 'class': 'lb-cg__sub', text: '進入世界前 ' + limit + ' 名' }),
                h('div', { 'class': 'lb-cg__score', text: info.game.name + '　' + LB.fmt(info.spec, info.score) })
            ],
            buttons: [
                { text: '看排行榜', kind: 'sky', onClick: function () { showBoard(info.game, {}); } },
                { text: '太棒了', kind: 'primary' }
            ]
        });
        fw = fireworks(ctl.el);

        /* 音樂：先把結算背景音樂停掉，讓歡呼號角聽得清楚；號角播完（約 3 秒）如果結算畫面還在，再把背景音樂接回去 */
        if (global.Sfx) {
            global.Sfx.stopBgm();
            sfx('fanfare');
            global.setTimeout(function () {
                var showing = global.Reaction && global.Reaction.resultShowing ? global.Reaction.resultShowing() : false;
                if (showing && global.Sfx) global.Sfx.bgm('result');
            }, 3000);
        }
    }

    /* ═══════════════════════════════════════════════════════════════
       八、小提示（toast）：畫面下方浮出一行字，幾秒後自己消失
       ═══════════════════════════════════════════════════════════════ */
    function toast(text) { Dlg.toast(text); }

    /* ═══ 對外介面 ═══ */
    LB.ui = { askNickname: askNickname, celebrate: celebrate, toast: toast, showBoard: showBoard, fireworks: fireworks };
    LB.showBoard = showBoard;
    LB.test.scroll = { PHYS: PHYS, rubber: rubber, releaseVelocity: releaseVelocity, flingStep: flingStep, noteText: noteText };
})(window);
