/* ═══════════════════════════════════════════════════════════════════
   reaction_bridge.js — 秒反應・搭一座橋（原企劃「007 搭一座橋」的復活版）
   上方有一塊寬度隨機的橫板，下方左右各有一塊高度相同的方塊，各自左右來回移動（不會碰在一起）。看準時機按「放下」，橫板會筆直落下，要讓橫板的兩端都穩穩落在兩塊方塊上；
   只有一邊碰到方塊，橫板就會傾斜滑落＝失敗。
   按下「放下」的那一刻，下面兩塊方塊會「立刻停住」（位置固定），橫板才開始落下（不然太難）。
   關卡制：一關一塊橫板，成績＝過了幾關。
   ───────────────────────────────────────────────────────────────────
   【每一關怎麼出（先保證「一定有一個成功的時機」，再讓它越來越難抓）】
   · 橫板：寬度隨機（PLANK_W 範圍），位置故意偏左或偏右（偏移量隨關卡線性變大）。
   · 兩塊方塊都做簡諧運動（正弦來回），但左右的「頻率」「振幅」「中心位置」「相位」都不同：
     V1.31（玩家意見：一開局兩塊同時向內靠近或同時向外，半秒就能抓準時機，太簡單）——兩塊方塊的頻率不一樣（FREQ_RATIO：慢的是快的
     1/2、2/3、3/4…，快的那一塊的頻率就是 OMEGA），而且一開局兩塊都在隨機的位置、各自隨機往左或往右，看不出規律；
     兩塊「同時頂住橫板」的時機仍然保證會出現，而且會規律地重複（每 Tc ＝ 兩塊方塊同時回到同一個姿勢的時間，快的跑了 q 圈、慢的跑了 p 圈），
     但是第一次出現的時間是隨機的（至少 FIRST_MIN_S 秒之後），不能一開局就按。
     V1.30：方塊完全照參數（頻率 OMEGA、振幅 AMP、不對稱 ASYM）動，不再被畫面邊緣限制，可以移出畫面（玩家要求）。
   · 先決定橫板的位置與寬度，再讓兩塊方塊「最靠近中間」的位置各自進入橫板端點內側 OVERLAP px（見下面的難度參數），
     由此反推它們的運動中心與振幅；兩塊方塊最靠近中間的時刻只差一點點（t* 附近），所以 t* 一定成功；
     兩塊方塊在整個週期裡都不會互相碰到、也不會跑出畫面、而且每次往外移動時都會完全離開橫板。
   · 難度（線性）：移動角速度 ω 變快、左右不對稱程度變大、橫板更偏一邊、容許的重疊變少。
   【判定】V1.30（玩家意見）改成「真的物理」：橫板擱在兩塊方塊上，只要
     ① 兩塊方塊的頂面都真的頂住橫板（頂面與橫板的重疊寬度 ≥ END_MARGIN px——方塊整塊進到橫板下面、
        或只有一部分頂住橫板的端點，都算頂住）；
     ② 橫板的重心（橫板的正中央）落在兩個接觸範圍的最外側之間（不然會翻倒）
   就算成功。以前的判定只看「橫板的端點有沒有落在方塊頂面上」，所以方塊整塊移進橫板下面（兩側都在橫板的寬度範圍內）
   反而會被判失敗，不合物理。失敗有三種：兩塊都沒頂住橫板＝掉到地上；只有一塊頂住＝橋沒搭好，橫板傾斜滑落；
   兩塊都頂住、但重心超出範圍＝翻倒。
   【難度參數（V1.30 玩家指定）】BW＝[48, 4]：下方方塊的寬度，第 1 關 48px → 到頂 4px；
     OVERLAP＝[72, 8]：方塊往中間移動時，會進入橫板左右寬度的多少 px（出題時兩塊方塊最靠近中間的那一刻，各自進入橫板端點內側 OVERLAP px；
       數字越大重疊越多＝越容易，數字很小＝只擦到橫板的邊＝難度提高；為了不讓兩塊方塊在橫板下面撞在一起，
       實際進入的深度不會超過 (橫板寬 − MIN_GAP) ÷ 2）；
     INDEXLINE＝[1, 0]：橫板兩端往下垂直虛線的長度比例，第 1 關 100%（一路垂到方塊頂面）→ 到頂 0%（沒有虛線）；
       虛線的上緣一直貼著橫板，只有下緣慢慢縮短。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'bridge';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 90;
    var BW = [64, 4];                           /* 下方方塊的寬度（px）：第 1 關 → 到頂（玩家指定：72 → 4） */
    var BH = 64;                                /* 下方方塊的高（px） */
    var OVERLAP = [32, 4];                      /* 方塊往中間移動時，進入橫板左右寬度的多少 px：第 1 關 → 到頂（數字越大越容易，越小越難） */
    var INDEXLINE = [0.85, 0];                     /* 橫板兩端往下的虛線長度比例：第 1 關 100% → 到頂 0%（上緣貼著橫板，下緣縮短） */
    var AMIN_EXTRA = 40;                        /* 方塊往外移動時，至少要完全離開橫板端點多少 px（振幅的下限 ＝ 進入深度 ÷ 2 ＋ 這個數字） */
    var FREQ_RATIO = [[2, 3], [3, 4], [4, 5], [5, 6]];  /* 慢的方塊頻率 ÷ 快的方塊頻率（p／q，約到最簡分數）：第 1 關只用第一個，越後面越多種（到頂時全部都可能）；
                                                   快的方塊頻率就是 OMEGA。兩塊「同時頂住橫板」的時機每 q 個快塊的週期重複一次（[1, 1] ＝ 頻率一樣，會一起靠攏、一起分開） */
    var FIRST_MIN_S = 1.0;                      /* 一開局最前面這幾秒，保證不會出現「兩塊同時頂住橫板」，不能一開局就按放下 */
    var PHASE_FRAC = 0.9;                       /* 兩塊方塊「最靠近中間」的時刻，最多差到「還能保證 t* 成功」的幾成（越大左右越不同步） */
    var PLANK_H = 18;                           /* 橫板厚度（px） */
    var PLANK_W = [240, 320];                   /* 橫板寬度範圍（px） */
    var OMEGA = [4.0, 10.0];                     /* 方塊來回運動的角速度（rad／秒）：第 1 關 → 到頂；週期＝2π／ω（約 4.2 秒 → 1.6 秒） */
    var AMP = [32, 64];                         /* 方塊來回的振幅（px）：第 1 關 → 到頂；方塊就照這個距離來回，超出畫面也沒關係（V1.30：不再被畫面邊緣限制） */
    var ASYM = [0.22, 0.88];                    /* 左右振幅差的比例（不對稱程度） */
    var OFFSET = [0.02, 0.33];                  /* 橫板中心偏離畫面中央的比例（×畫面寬） */
    var END_MARGIN = 1;                         /* 方塊頂面與橫板的重疊寬度至少多少 px 才算「確實頂住橫板」 */
    var EDGE_X = 52;                            /* 橫板左右端離畫面邊緣至少多遠（橫板一定要完整看得到；方塊則可以移出畫面） */
    var MIN_GAP = 22;                           /* 兩塊方塊最靠近時，中間至少留多寬（px），不會碰在一起 */
    var MARGIN = 6;                             /* 統計用：方塊離畫面邊緣多遠算「在畫面內」（出題不再用它限制方塊的移動，方塊可以移出畫面） */
    var FALL_MS = 420;                          /* 橫板落下的時間 */
    var TRIES = 400;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function bwAt(level) { return kit.ramp(level, BW[0], BW[1], RAMP_LEVELS); }
    function ampAt(level) { return kit.ramp(level, AMP[0], AMP[1], RAMP_LEVELS); }
    function overlapAt(level) { return kit.ramp(level, OVERLAP[0], OVERLAP[1], RAMP_LEVELS); }
    /* 橫板兩端往下的虛線長度比例（0～1） */
    function lineAt(level) { return kit.clamp(kit.ramp(level, INDEXLINE[0], INDEXLINE[1], RAMP_LEVELS), 0, 1); }
    function omegaAt(level) { return kit.ramp(level, OMEGA[0], OMEGA[1], RAMP_LEVELS); }
    function asymAt(level) { return kit.ramp(level, ASYM[0], ASYM[1], RAMP_LEVELS); }
    function offsetAt(level) { return kit.ramp(level, OFFSET[0], OFFSET[1], RAMP_LEVELS); }
    /* 兩個區間 [a0,a1]、[b0,b1] 的重疊部分，沒有重疊回傳 null */
    function overlap(a0, a1, b0, b1) { var s = Math.max(a0, b0), e = Math.min(a1, b1); return e > s ? [s, e] : null; }
    /* 第 t 秒兩塊方塊的中心 x */
    function posAt(cfg, t) {
        return { L: cfg.L.c + cfg.L.A * Math.sin((cfg.L.w || cfg.omega) * t + cfg.L.ph), R: cfg.R.c + cfg.R.A * Math.sin((cfg.R.w || cfg.omega) * t + cfg.R.ph) };
    }
    /* 判定（V1.30：真的物理）：橫板 plank＝{x0, w}（橫板擱在上面），兩塊方塊的中心 L、R，方塊寬 bw（預設第 1 關的寬度）。
       接觸範圍：左邊方塊的頂面 [L−bw/2, L+bw/2] 與橫板 [x0, x0+w] 的重疊 cl；右邊方塊的重疊 cr（沒有重疊＝null）。
       頂住：重疊寬度 ≥ margin（END_MARGIN）。兩塊都頂住 → 還要檢查橫板的重心（正中央）有沒有落在
       「最左的接觸點 ～ 最右的接觸點」之間，沒有就翻倒。
       回傳 { ok, reason:'ok'|'none'|'one'|'tip', okL, okR, ovL, ovR（兩塊方塊與橫板的重疊寬度 px）, com（重心 x）,
              side（沒撐住／翻向的那一邊 'L'／'R'）, pivot（橫板繞著它轉開的那個點的 x）, support（撐住橫板的方塊頂面範圍 [左, 右]，只有 'one' 才有）, hull } */
    function judge(plank, L, R, margin, bw) {
        var m = margin == null ? END_MARGIN : margin, w = bw == null ? BW[0] : bw;
        var p0 = plank.x0, p1 = plank.x0 + plank.w, com = (p0 + p1) / 2;
        var cl = overlap(p0, p1, L - w / 2, L + w / 2), cr = overlap(p0, p1, R - w / 2, R + w / 2);
        var ovL = cl ? cl[1] - cl[0] : 0, ovR = cr ? cr[1] - cr[0] : 0, okL = ovL >= m, okR = ovR >= m;
        var out = { ok: false, okL: okL, okR: okR, ovL: ovL, ovR: ovR, com: com };
        if (okL && okR) {
            out.hull = [cl[0], cr[1]];
            if (com >= cl[0] && com <= cr[1]) { out.ok = true; out.reason = 'ok'; return out; }
            out.reason = 'tip'; out.side = com < cl[0] ? 'L' : 'R'; out.pivot = com < cl[0] ? cl[0] : cr[1];
            return out;
        }
        if (okL || okR) {
            out.reason = 'one'; out.side = okL ? 'R' : 'L';
            out.support = okL ? [L - w / 2, L + w / 2] : [R - w / 2, R + w / 2];
            out.pivot = okL ? cl[1] : cr[0];
            return out;
        }
        out.reason = 'none';
        return out;
    }
    /* 兩塊方塊在一個週期裡最靠近時的間距（px），以及有沒有跑出畫面 */
    function motionStats(cfg, W) {
        var T = cfg.T || 2 * Math.PI / cfg.omega, minGap = Infinity, inside = true, bw = cfg.bw == null ? BW[0] : cfg.bw;
        for (var i = 0; i <= 240; i++) {
            var p = posAt(cfg, T * i / 240), gap = (p.R - bw / 2) - (p.L + bw / 2);
            if (gap < minGap) minGap = gap;
            if (p.L - bw / 2 < MARGIN - 1e-6 || p.R + bw / 2 > W - MARGIN + 1e-6 || p.L > p.R) inside = false;
        }
        return { minGap: minGap, inside: inside, T: T };
    }
    /* 出一關：回傳 { plank:{x0,w}, L:{c,A,ph,w（頻率）}, R:{…}, omega（快的方塊的頻率）, ratio:[p,q], fastLeft, tStar（第一次同時頂住的時刻，秒）, W, bw（方塊寬）, ov（實際進入橫板的深度）, line（虛線長度比例）, T（＝Tc，成功時機重複的週期）}。
       作法（V1.30）：左邊方塊「最靠近中間」時，右邊緣在橫板左端內側 ov px（中心 innerL ＝ x0 ＋ ov − bw/2）；右邊方塊最靠近中間時，
       左邊緣在橫板右端內側 ov px（中心 innerR ＝ x1 − ov ＋ bw/2）。方塊中心 ＝ innerL − A（左）／ innerR ＋ A（右），所以來回的範圍是
       [innerL − 2A, innerL]、[innerR, innerR ＋ 2A]。
       方塊「完全照參數動」：頻率 ω ＝ omegaAt(level)、振幅 A ＝ AMP 的漸變值 × 左右不對稱（ASYM），只有一個下限——A 至少 ov/2 ＋ AMIN_EXTRA
       （往外移動時要完全離開橫板）；沒有上限，也不管畫面邊緣：橫板靠近畫面邊緣、或振幅很大時，方塊會移出畫面，這是允許的（玩家要求：
       不要故意限縮方塊的移動距離、速度、頻率）。
       兩塊方塊最靠近中間的時刻各自離 t* 差一點點（最多讓 t* 時還頂住橫板的 PHASE_FRAC 倍），所以 t* 一定成功。
       唯一還留著的幾何限制：兩塊方塊不能在橫板下面撞在一起——進入深度 ov 不會超過 (橫板寬 − MIN_GAP) ÷ 2（OVERLAP 設得比這個大、
       橫板又很窄的時候才會用到）；橫板本身一定要完整留在畫面內（離邊緣至少 EDGE_X），寬度最多 W − 2×EDGE_X。
       V1.30 修正（玩家回報「PLANK_W 大於 140 畫面一片空白」）：以前出題時會要求方塊來回的範圍不能超出畫面，橫板一寬或靠近邊緣就找不到合格的排法，
       makeLevel 回傳 null、畫面空白。現在方塊不再被畫面限制，每次都排得出來；setup 萬一還是拿到 null 也會退回第 1 關。
       opts（只有測試用）：{ plankW: [最小, 最大], aminExtra, offset, ratios } 可以覆蓋同名的參數。 */
    function makeLevel(level, W, rand, opts) {
        rand = rand || Math.random; opts = opts || {};
        var plankW = opts.plankW || PLANK_W, aminExtra = opts.aminExtra == null ? AMIN_EXTRA : opts.aminExtra;
        var bw = bwAt(level), omega = omegaAt(level), asym = asymAt(level), off = (opts.offset == null ? offsetAt(level) : opts.offset) * W, ovT = overlapAt(level), last = null;
        var pwMax = Math.max(MIN_GAP + 2 * (END_MARGIN + 1), W - 2 * EDGE_X);       /* 橫板最寬只能到這麼寬（要完整留在畫面內） */
        var Amp = ampAt(level);
        var ratios = opts.ratios || FREQ_RATIO.slice(0, Math.min(FREQ_RATIO.length, 1 + Math.floor((level - 1) * (FREQ_RATIO.length - 1) / Math.max(1, RAMP_LEVELS - 1) + 1e-9)));
        for (var tr = 0; tr < TRIES; tr++) {
            /* 頻率：快的那一塊是 omega，慢的是 omega × p／q；哪一邊快是隨機的。Tc ＝ 兩塊同時回到同一個姿勢的時間（快的跑 q 圈、慢的跑 p 圈） */
            var rt = kit.pick(ratios, rand), p = rt[0], q = rt[1], fastLeft = rand() < 0.5;
            var wF = omega, wS = omega * p / q, wL = fastLeft ? wF : wS, wR = fastLeft ? wS : wF;
            var T = 2 * Math.PI / omega * q;                      /* 這個 T ＝ Tc：成功的時機每隔 Tc 重複一次 */
            var pw = Math.min(kit.randInt(plankW[0], plankW[1], rand), pwMax), side = rand() < 0.5 ? -1 : 1;
            var cx = W / 2 + side * off * kit.randFloat(0.7, 1, rand);
            var x0 = Math.round(kit.clamp(cx - pw / 2, EDGE_X, Math.max(EDGE_X, W - pw - EDGE_X))), x1 = x0 + pw;
            var plank = { x0: x0, w: pw };
            var ov = Math.max(END_MARGIN + 1, Math.min(ovT, (pw - MIN_GAP) / 2));      /* 兩塊方塊在橫板下面不能撞在一起 */
            var innerL = x0 + ov - bw / 2, innerR = x1 - ov + bw / 2;
            var Amin = ov / 2 + aminExtra, sgn = rand() < 0.5 ? 1 : -1;
            var AL = Math.max(Amin, Amp * (1 + sgn * asym * kit.randFloat(0.6, 1, rand))), AR = Math.max(Amin, Amp * (1 - sgn * asym * kit.randFloat(0.6, 1, rand)));
            var cL = innerL - AL, cR = innerR + AR;
            /* 左右兩塊「最靠近中間」的時刻各自離 t* 差 dL／dR（弧度）：t* 時它們還要頂住橫板至少 END_MARGIN px */
            function maxPhase(A) { var q = (ov - END_MARGIN - 0.5) / A; return q >= 2 ? Math.PI : Math.acos(1 - q); }
            var dL = PHASE_FRAC * maxPhase(AL) * kit.randFloat(-1, 1, rand), dR = PHASE_FRAC * maxPhase(AR) * kit.randFloat(-1, 1, rand);
            /* 第一次「同時頂住」的時刻：FIRST_MIN_S 秒之後、一個 Tc 之內隨機（所以一開局兩塊在週期裡的哪個位置、往哪個方向都是隨機的） */
            var tStar = FIRST_MIN_S + T * rand();
            var phL = Math.PI / 2 + dL - wL * tStar, phR = -Math.PI / 2 + dR - wR * tStar;       /* 左：sin＝1 是最靠近中間；右：sin＝−1 是最靠近中間 */
            var cfg = { plank: plank, L: { c: cL, A: AL, ph: phL, w: wL }, R: { c: cR, A: AR, ph: phR, w: wR }, omega: omega, ratio: [p, q], fastLeft: fastLeft, tStar: tStar, W: W, T: T, bw: bw, ov: ov, line: lineAt(level) };
            var pos = posAt(cfg, tStar), st = motionStats(cfg, W);
            if (!judge(plank, pos.L, pos.R, END_MARGIN, bw).ok) continue;
            /* 開局的前 FIRST_MIN_S 秒不能有「同時頂住」（頻率不同時，可能碰巧提早對齊）：有就重排。每 5 毫秒檢查一次（以前每 20 毫秒，高關卡成功的時機很窄、會被漏掉，約 2% 的題目一開局就能按） */
            var early = false;
            for (var te = 0; te <= FIRST_MIN_S + 1e-9 && !early; te += 0.005) { var pe = posAt(cfg, te); if (judge(plank, pe.L, pe.R, END_MARGIN, bw).ok) early = true; }
            if (early) continue;
            last = cfg;
            if (st.minGap >= MIN_GAP - 1e-6) return cfg;
        }
        return last;
    }
    /* 這一關「成功時機」佔一個週期的幾成（用細格子掃一遍），越小越難；測試與驗證用 */
    function successShare(cfg) {
        var n = 600, k = 0, T = cfg.T || 2 * Math.PI / cfg.omega;
        for (var i = 0; i < n; i++) { var p = posAt(cfg, T * i / n); if (judge(cfg.plank, p.L, p.R, END_MARGIN, cfg.bw).ok) k++; }
        return k / n;
    }
    function rating(n) {
        if (n >= 20) return '搭橋大師！';
        if (n >= 12) return '眼明手快！';
        if (n >= 7) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '要等兩塊方塊都頂住橫板的時候再按！';
    }
    var FAIL_TEXT = {
        none: '兩塊方塊都沒有頂住橫板，橫板掉到地上了！',
        one: '只有一塊方塊頂住橫板，橋沒有搭好，橫板傾斜滑落了！',
        tip: '兩塊方塊都擠在橫板的同一邊，橫板的重心沒有被撐住，翻倒了！'
    };

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['成功搭起 ' + S.cleared + ' 座橋']; },
            stageClass: 'br-stage',
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeLevel(level, W, api.rand) || makeLevel(1, W, api.rand);       /* 萬一出不了題（不應該發生）：退回第 1 關，不要讓畫面一片空白 */
        api.info = cfg;
        var ST = motionStats(cfg, W);
        console.log('[搭一座橋] 第 ' + level + ' 關：橫板 x ' + cfg.plank.x0 + '～' + (cfg.plank.x0 + cfg.plank.w) + '（寬 ' + cfg.plank.w + '）；快的 ω ' + cfg.omega.toFixed(2) + '、慢的是它的 ' + cfg.ratio.join('/') + '（' + (cfg.fastLeft ? '左快右慢' : '右快左慢') + '），成功時機每 ' + cfg.T.toFixed(2) + ' 秒重複；左 ' + Math.round(cfg.L.c) + '±' + Math.round(cfg.L.A) + '、右 ' +
            Math.round(cfg.R.c) + '±' + Math.round(cfg.R.A) + '；最近間距 ' + ST.minGap.toFixed(1) + 'px；成功時機約佔 ' + (successShare(cfg) * 100).toFixed(1) + '% 的時間（第 ' + cfg.tStar.toFixed(2) + ' 秒一定成功）');

        var BW_L = cfg.bw;                                        /* 這一關方塊的寬度（V1.30：隨關卡 48 → 4） */
        var BTN_H = 84, SVG_H = H - BTN_H - 16;
        var GROUND = SVG_H - 18, BTOP = GROUND - BH;              /* 地面與方塊頂面的 y（SVG 座標，往下為正） */
        var PLANK_Y0 = 92;                                        /* 橫板一開始的上緣 y（上方留給兩行提示文字） */
        var svg = kit.svg('svg', { 'class': 'br-svg', viewBox: '0 0 ' + W + ' ' + SVG_H, width: W, height: SVG_H }, stage);
        kit.svg('rect', { x: 0, y: GROUND, width: W, height: 40, 'class': 'br-ground' }, svg);
        var bl = kit.svg('rect', { x: 0, y: BTOP, width: BW_L, height: BH, rx: Math.min(6, BW_L / 2), 'class': 'br-block br-block--l' }, svg);
        var br = kit.svg('rect', { x: 0, y: BTOP, width: BW_L, height: BH, rx: Math.min(6, BW_L / 2), 'class': 'br-block br-block--r' }, svg);
        var plank = kit.svg('rect', { x: cfg.plank.x0, y: PLANK_Y0, width: cfg.plank.w, height: PLANK_H, rx: 4, 'class': 'br-plank' }, svg);
        /* 橫板兩端往下的虛線：上緣貼著橫板，下緣隨關卡縮短（第 1 關一路垂到方塊頂面，到頂時長度 0） */
        var guideY1 = PLANK_Y0 + PLANK_H, guideY2 = guideY1 + (BTOP - guideY1) * cfg.line;
        var guideL = kit.svg('line', { x1: cfg.plank.x0, x2: cfg.plank.x0, y1: guideY1, y2: guideY2, 'class': 'br-guide' }, svg);
        var guideR = kit.svg('line', { x1: cfg.plank.x0 + cfg.plank.w, x2: cfg.plank.x0 + cfg.plank.w, y1: guideY1, y2: guideY2, 'class': 'br-guide' }, svg);
        if (cfg.line <= 0.001) { guideL.setAttribute('visibility', 'hidden'); guideR.setAttribute('visibility', 'hidden'); }
        var msg = h('div', { 'class': 'br-msg' });
        var okBtn = h('button', { 'class': 'btn btn--go br-ok', text: '放下' });
        stage.appendChild(msg); stage.appendChild(okBtn);
        var tip = h('div', { 'class': 'br-tip', text: '兩塊方塊都頂住橫板（碰到橫板的左右兩端）時，按「放下」' });
        stage.appendChild(tip);

        var t0 = performance.now(), frozen = null, locked = false;
        function paint(t) {
            var p = posAt(cfg, t);
            bl.setAttribute('x', (p.L - BW_L / 2).toFixed(2)); br.setAttribute('x', (p.R - BW_L / 2).toFixed(2));
            return p;
        }
        paint(0);
        var loop = my.loop(function (now) { if (locked) return false; paint((now - t0) / 1000); });
        /* rAF 被暫停（分頁在背景）時每 50 毫秒補畫一次 */
        (function again() { my.after(50, function () { if (!locked && !api.over) { paint((performance.now() - t0) / 1000); again(); } }); })();

        /* 放下：立刻把兩塊方塊固定在目前的位置，再讓橫板落下 */
        function drop(tOverride) {
            if (locked || api.over) return;
            locked = true;
            if (loop) loop.stop();
            Sfx.play('click');
            var t = tOverride != null ? tOverride : (performance.now() - t0) / 1000;
            var p = paint(t), res = judge(cfg.plank, p.L, p.R, END_MARGIN, BW_L);
            tip.style.visibility = 'hidden'; guideL.setAttribute('opacity', 0); guideR.setAttribute('opacity', 0);
            var land = BTOP - PLANK_H, fallTo = res.reason === 'none' ? GROUND - PLANK_H : land;
            my.tween(FALL_MS, function (e) { plank.setAttribute('y', (PLANK_Y0 + (fallTo - PLANK_Y0) * e).toFixed(2)); }, kit.easeInQuad).then(function () {
                if (res.ok) {
                    Sfx.play('ok');
                    msg.textContent = '穩穩的！橋搭好了'; msg.classList.add('br-msg--ok');
                    plank.classList.add('br-plank--ok');
                    api.pass({ gain: 1, delay: 700 });
                    return;
                }
                Sfx.play('bad');
                msg.textContent = FAIL_TEXT[res.reason]; msg.classList.add('br-msg--bad');
                var sign, px, py;
                if (res.reason === 'none') {
                    my.tween(500, function (e) { plank.setAttribute('transform', 'rotate(' + (e * 12).toFixed(1) + ' ' + (cfg.plank.x0 + cfg.plank.w / 2) + ' ' + (GROUND) + ')'); }, kit.easeInQuad).then(function () { api.fail({ delay: 500, lines: [FAIL_TEXT.none] }); });
                    return;
                }
                /* 只有一塊頂住（或重心沒被撐住）：繞著接觸範圍最外側的那個點轉開（沒撐住的那一邊往下掉），再滑掉 */
                var toLeft = res.side === 'L';
                sign = toLeft ? -1 : 1;
                px = res.pivot; py = land;
                my.tween(700, function (e) {
                    plank.setAttribute('transform', 'rotate(' + (sign * 34 * e).toFixed(1) + ' ' + px.toFixed(1) + ' ' + py.toFixed(1) + ') translate(0 ' + (e * 50).toFixed(1) + ')');
                }, kit.easeInQuad).then(function () { api.fail({ delay: 500, lines: [FAIL_TEXT[res.reason]] }); });
            });
        }
        kit.onTap(okBtn, function () { drop(); });

        /* 驗證用：solve 在「成功時刻」放下（往後推幾個週期，等於玩家等到那一刻）；wrong 找一個一定失敗的時刻 */
        api.solve = function () { drop(cfg.tStar + 2 * cfg.T); };
        api.wrong = function () {
            var tw = null;
            for (var i = 0; i < 400 && tw == null; i++) { var tt = cfg.T * i / 400, p = posAt(cfg, tt); if (!judge(cfg.plank, p.L, p.R, END_MARGIN, BW_L).ok) tw = tt; }
            drop(tw == null ? 0 : tw);
        };
    }

    var G = {
        id: ID,
        name: '搭一座橋',
        rule: '上方有一塊橫板，下方有兩塊方塊各自左右來回移動，**兩塊的速度不一樣**，一開始的位置和方向也是隨機的。**看準時機按「放下」**：兩塊方塊會立刻停住，橫板落下，**兩塊方塊都要頂住橫板**（整塊鑽到橫板下面也可以）；只頂住一邊，橫板就會傾斜滑落。每過一關，方塊越來越窄、動得越來越快、碰到橫板的部分越來越少，橫板兩端的虛線也越來越短。',
        mount: mount,
        score: SCORE,
        test: {
            FREQ_RATIO: FREQ_RATIO, FIRST_MIN_S: FIRST_MIN_S, ampAt: ampAt, AMP: AMP, bwAt: bwAt, overlapAt: overlapAt, lineAt: lineAt, OVERLAP: OVERLAP, INDEXLINE: INDEXLINE, RAMP_LEVELS: RAMP_LEVELS, AMIN_EXTRA: AMIN_EXTRA,
            omegaAt: omegaAt, asymAt: asymAt, offsetAt: offsetAt, overlap: overlap, posAt: posAt, judge: judge, motionStats: motionStats,
            makeLevel: makeLevel, successShare: successShare, BW: BW, BH: BH, END_MARGIN: END_MARGIN, EDGE_X: EDGE_X, MIN_GAP: MIN_GAP, PLANK_W: PLANK_W, MARGIN: MARGIN
        }
    };
    Reaction.register(G);
})();
