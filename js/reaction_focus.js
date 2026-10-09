/* ═══════════════════════════════════════════════════════════════════
   reaction_focus.js — 秒反應・轉到最清楚
   一張模糊的照片（含文字），左右拖曳對焦環，讓照片變得最清楚，按「確定」定案。
   對焦環是一條沒有刻度的軌道，只有一個圓點；過程中可以來回調整無限次、沒有時間限制。只有一次機會。
   ───────────────────────────────────────────────────────────────────
   · 軌道位置 f（0～1）；真正的焦點 f0 在 F0_MIN～F0_MAX 隨機；模糊半徑（CSS blur px）
     ＝ BLUR_BASE ＋ BLUR_K × |f − f0|^BLUR_EXP：兩側對稱，只能靠「找最清楚的那一點」；
     越接近焦點變化越平緩（指數 > 1），所以要來回比較。
   · 起始位置離焦點至少 START_GAP。
   · 成績 ＝ |f − f0| × 100（單位「格」：軌道分成 100 格，越小越好）。
   · 揭曉：照片變成最銳利，軌道上綠點是真焦點、橘點是你的位置。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'focus';
    var SCORE = { better: 'min', decimals: 4, format: '{v} 格', label: '焦點差', min: 0, max: 100 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var F0_MIN = 0.2, F0_MAX = 0.8;             /* 真焦點的位置範圍 */
    var START_GAP = 0.25;                       /* 起始位置離焦點至少多遠 */
    var BLUR_BASE = 0.15, BLUR_K = 18, BLUR_EXP = 1.3;
    var TRACK_W = 380, KNOB = 64;               /* 軌道長度、圓點直徑（px） */
    var SCENES = ['sign', 'medicine', 'postcard'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function blurPx(d) { return BLUR_BASE + BLUR_K * Math.pow(Math.abs(d), BLUR_EXP); }
    function errGrid(f, f0) { return Math.abs(f - f0) * 100; }
    function makeRound(rand) {
        rand = rand || Math.random;
        var f0 = kit.randFloat(F0_MIN, F0_MAX, rand), f;
        do { f = rand(); } while (Math.abs(f - f0) < START_GAP);
        return { f0: f0, f: f, scene: kit.pick(SCENES, rand) };
    }
    function rating(e) {
        if (e < 0.4) return '神準！';
        if (e < 1.5) return '很準！';
        if (e < 4) return '不錯喔！';
        return '再試一次，會更準！';
    }
    /* 三種場景（SVG 字串，440×300）：招牌、藥袋、明信片——都有粗字、細字與細線，才看得出模糊 */
    function sceneSvg(name) {
        var t = function (x, y, s, size, w) { return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="' + (w || 700) + '" fill="#4A3B1E" font-family="Noto Sans TC, sans-serif">' + s + '</text>'; };
        var head = '<svg viewBox="0 0 440 300" width="440" height="300" xmlns="http://www.w3.org/2000/svg">';
        var body = '', i, j;
        if (name === 'sign') {
            body += '<rect width="440" height="300" fill="#FFF6D8"/>';
            for (i = 0; i < 11; i++) body += '<rect x="' + (i * 40) + '" y="0" width="20" height="46" fill="' + (i % 2 ? '#E0AA25' : '#E8822E') + '"/>';
            body += t(56, 130, '新鮮蔬果', 64, 900) + t(60, 176, '中山路 12 號　營業 6:00－20:00', 21, 500);
            body += '<rect x="40" y="198" width="360" height="3" fill="#4A3B1E"/>';
            body += t(60, 232, '高麗菜 番茄 洋蔥 蘋果 香蕉', 19, 500) + t(60, 262, '電話 02-2345-6789', 17, 500);
        } else if (name === 'medicine') {
            body += '<rect width="440" height="300" fill="#FFFDF3"/><rect x="14" y="14" width="412" height="272" fill="none" stroke="#3E86C4" stroke-width="3"/>';
            body += t(40, 78, '每日三次', 52, 900) + t(40, 122, '飯後服用　每次 1 顆', 25, 700);
            body += t(40, 160, '請依醫師指示服用，如有不適請洽詢藥師', 15, 500);
            for (j = 0; j < 26; j++) body += '<rect x="' + (40 + j * 5.5 + (j % 3)) + '" y="190" width="' + (1.5 + (j % 3)) + '" height="64" fill="#4A3B1E"/>';
            body += t(300, 224, '2026/10/09', 20, 700) + t(300, 252, '批號 A0739', 16, 500);
        } else {
            body += '<rect width="440" height="300" fill="#FBF3D9"/><rect x="14" y="14" width="412" height="272" fill="none" stroke="#4A3B1E" stroke-width="2"/>';
            body += '<path d="M14 220 L110 130 L170 190 L250 90 L330 200 L426 150 L426 286 L14 286 Z" fill="#4C9A5B"/><circle cx="352" cy="64" r="26" fill="#E0AA25"/>';
            body += t(34, 52, '台北 郵政', 30, 900) + t(34, 78, 'TAIPEI POST　1996', 15, 500);
            body += '<rect x="330" y="30" width="80" height="52" fill="none" stroke="#4A3B1E" stroke-width="2" stroke-dasharray="4 3"/>';
        }
        return head + body + '</svg>';
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '左右拖曳對焦環，讓照片最清楚（可以來回調整）',
            numText: function (v) { return v.toFixed(4) + ' 格'; },
            rating: rating,
            sfx: function (v) { return v < 1.5 ? 'perfect' : (v < 5 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeRound(), f = cfg.f, locked = false, hint = null;
        console.log('[轉到最清楚] 場景 ' + cfg.scene + '，真焦點 ' + (cfg.f0 * 100).toFixed(2) + ' 格，起始 ' + (cfg.f * 100).toFixed(2) + ' 格');

        var photo = h('div', { 'class': 'fo-photo', html: sceneSvg(cfg.scene) });
        stage.appendChild(photo);
        var trackY = Math.min(H - 190, 470);
        var x0 = (W - TRACK_W) / 2;
        var track = h('div', { 'class': 'fo-track' });
        track.style.left = x0 + 'px'; track.style.top = trackY + 'px'; track.style.width = TRACK_W + 'px';
        var mark = h('div', { 'class': 'fo-mark' }); mark.style.left = (x0 + cfg.f0 * TRACK_W) + 'px'; mark.style.top = (trackY - 12) + 'px';
        var knob = h('div', { 'class': 'fo-knob' });
        knob.style.top = (trackY + 4 - KNOB / 2) + 'px';
        var msg = h('div', { 'class': 'fo-msg' });
        var okBtn = h('button', { 'class': 'btn btn--go fo-ok', text: '確定' });
        [track, mark, knob, msg, okBtn].forEach(function (e) { stage.appendChild(e); });
        function paint() {
            photo.style.filter = 'blur(' + blurPx(f - cfg.f0).toFixed(3) + 'px)';
            knob.style.left = (x0 + f * TRACK_W - KNOB / 2) + 'px';
        }
        paint();

        /* 操作提示：拖曳（手指放在圓點上，沿軌道左右來回） */
        hint = kit.fingerHint(stage, { mode: 'drag', x: x0 + f * TRACK_W, y: trackY + 4, dx: f < 0.5 ? 110 : -110, dy: 0, delay: 400 });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        kit.dragDamp(stage, {
            enabled: function () { return !locked; },
            start: function () { hideHint(); return true; },
            move: function (dx) { f = kit.clamp(f + dx / TRACK_W, 0, 1); paint(); }
        });
        kit.onTap(okBtn, function () { submit(); });

        function submit() {
            if (locked) return;
            locked = true; hideHint();
            okBtn.style.display = 'none';
            Sfx.play('click');
            var real = errGrid(f, cfg.f0);
            photo.style.transition = 'filter 1s ease';
            photo.style.filter = 'blur(' + BLUR_BASE + 'px)';
            mark.classList.add('fo-mark--on'); knob.classList.add('fo-knob--rev');
            msg.textContent = '綠線＝真正的焦點　你差了 ' + real.toFixed(4) + ' 格';
            msg.classList.add('fo-msg--on');
            my.after(2300, function () {
                api.finish(real, { lines: [
                    '真正的焦點在 ' + (cfg.f0 * 100).toFixed(4) + ' 格，你停在 ' + (f * 100).toFixed(4) + ' 格',
                    f < cfg.f0 ? '你的焦點偏左' : (f > cfg.f0 ? '你的焦點偏右' : '剛好對焦'),
                    '只有一次機會，想拚更準就再挑戰一次'
                ] });
            });
        }

        G.debug = {
            state: function () { return { f: f, cfg: cfg, locked: locked, blur: blurPx(f - cfg.f0) }; },
            setF: function (v) { f = kit.clamp(v, 0, 1); paint(); },
            solve: function () { f = cfg.f0; paint(); submit(); },
            wrong: function () { f = kit.clamp(cfg.f0 + (cfg.f0 > 0.5 ? -0.2 : 0.2), 0, 1); paint(); submit(); },
            submit: submit
        };
    }

    var G = {
        id: ID,
        name: '轉到最清楚',
        rule: '畫面上的照片是模糊的。左右拖曳下方的圓點調整對焦，找到最清楚的那一點，可以來回調整，沒有時間限制。滿意就按「確定」，只有一次機會，會告訴你和真正的焦點差幾格。',
        mount: mount,
        score: SCORE,
        test: { blurPx: blurPx, errGrid: errGrid, makeRound: makeRound, rating: rating, sceneSvg: sceneSvg, SCENES: SCENES, F0_MIN: F0_MIN, F0_MAX: F0_MAX, START_GAP: START_GAP, BLUR_BASE: BLUR_BASE }
    };
    Reaction.register(G);
})();
