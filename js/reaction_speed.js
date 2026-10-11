/* ═══════════════════════════════════════════════════════════════════
   reaction_speed.js — 秒反應・零秒出手
   從 7.0000 開始倒數；倒數到 4.0000 秒時數字開始慢慢變透明，到 3.0000 秒完全看不見，
   剩下的 3 秒要自己默數，算準 0 秒的瞬間按下按鈕；分數＝跟 0 秒差了幾秒（越小越好）。
   （V1.22.0：原本是 6 秒開始、數字到 3 秒突然消失；第一次玩的人常以為是 BUG，
     所以多給一段「慢慢變透明」的預告，讓人有心理準備。）
   （V1.23.0：倒數低於 4.0000 秒的那一刻，數字下方再浮出一行明顯的大字「請在心中默數至 0」，
     明確告訴玩家：從這裡開始要靠自己默數。）
   · 倒數的數字（即時畫面）顯示到小數點後 4 位 X.XXXX 秒：那是「真實的剩餘時間」，不偽造
     （偽造尾數會讓倒數的數字忽大忽小，不能用在連續跳動的數字上）；
   · 「成績」（結算畫面、最佳紀錄、世界排行榜）一律是秒、小數點後 4 位，
     而且第 3、4 位不會是 0（Leaderboard.fake4，結算時只產生一次，之後到處都用同一個數字）。
   · 有接世界排行榜：score 設定在檔案最下面的 Reaction.register，結算時呼叫 Leaderboard.submit。
   ═══════════════════════════════════════════════════════════════════ */

/* （這是最簡單的一款遊戲，適合當入門範例：沒有關卡，只有 mount → round → finish 三個函式；共通結構見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    /* 遊戲代號 */
    var ID = 'speed';
    /* UI.h：建立 HTML 元素的小工具 */
    var h = UI.h;
    var TOTAL = 7000;       /* 倒數總長（毫秒，內部計時用；畫面一律換算成秒顯示） */
    var FADE_AT = 4000;     /* 倒數到剩這麼多毫秒時，數字開始慢慢變透明 */
    var HIDE_AT = 3000;     /* 倒數到剩這麼多毫秒時，數字完全透明（看不見了） */
    var COUNT_AT = FADE_AT; /* 剩餘時間「低於」這麼多毫秒，數字下方就浮出「請在心中默數至 0」 */
    var COUNT_TEXT = '請在心中默數至 0';

    /* 數字的不透明度（純函式，也給 Node 測試用）：剩餘時間 ≥ FADE_AT → 1（完全看得見）；
       FADE_AT → HIDE_AT 之間線性從 1 變到 0；≤ HIDE_AT → 0（完全透明） */
    function opacityAt(remainMs) {
        if (remainMs >= FADE_AT) return 1;
        if (remainMs <= HIDE_AT) return 0;
        return (remainMs - HIDE_AT) / (FADE_AT - HIDE_AT);
    }

    /* 「請在心中默數至 0」該不該顯示（純函式，也給 Node 測試用）：剩餘時間低於 4.0000 秒（嚴格小於）才顯示 */
    function countVisible(remainMs) { return remainMs < COUNT_AT; }

    /* 倒數畫面用：毫秒 → X.XXXX 秒（即時顯示的是真實的剩餘時間，4 位小數，不偽造） */
    function sec(ms) { return (ms / 1000).toFixed(4); }
    /* 成績規格：結算畫面、最佳紀錄、世界排行榜共用（欄位說明見 js/leaderboard.js 開頭）。
       成績單位是「秒」、小數 4 位；比大小直接比這個數字，畫面上看到的就是存起來的那個數字。
       min／max 要跟資料庫 MF_games 的 speed 那一列一致（supabase/MF_leaderboard.sql）。 */
    var SCORE = { better: 'min', decimals: 4, format: '{v} 秒', label: '與 0 秒的差', min: 0, max: 60 };
    function fmtBest(v) { return v == null ? '' : '最佳差 ' + Leaderboard.fmt(SCORE, v); }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* 舊版把最佳紀錄存成「毫秒整數」（例如 123），這一版改存「秒、小數 4 位」（0.1237）：
           第一次進來把舊紀錄換算一次（只換一次，見 reaction_core.js 的 migrateBest） */
        Reaction.migrateBest(ID, function (ms) { return Leaderboard.fake4(ms / 1000); });
        /* raf：保存 requestAnimationFrame 的編號，之後才能取消 */
        var raf = null;

        /* round：開一局 */
        function round() {
            root.innerHTML = '';
            /* 建立畫面元素：大數字、提示、按鈕 */
            var num = h('div', { 'class': 'speed-num', text: sec(TOTAL) });
            /* 低於 4.0000 秒才會亮起（一開始透明，但先占好位置，亮起來時畫面不會跳動） */
            var count = h('div', { 'class': 'speed-count', text: COUNT_TEXT });
            var hint = h('div', { 'class': 'hint', text: '默數到 0，算準時間按下面的按鈕' });
            var btn = h('button', { 'class': 'btn btn--primary speed-btn', text: '按這裡！' });
            root.appendChild(h('div', { 'class': 'speed-wrap' }, [num, count, hint]));
            root.appendChild(btn);
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            /* t0：這局開始的時間；clicked：玩家按了沒 */
            var t0 = performance.now();
            var clicked = false;

            /* 每一影格都重新算「現在剩幾毫秒」，不是遞減一個計數器變數——這樣不管
               這一影格跟上一影格之間實際間隔多久（不同裝置的更新頻率不一樣），
               算出來的剩餘時間永遠準確對應真實經過的時間，不會因為掉幀而計時跑掉。
               remain >= HIDE_AT：剩餘時間還有 3000 毫秒（HIDE_AT）以上才顯示數字；
               opacityAt() 讓數字在 4.0000 秒～3.0000 秒之間慢慢變透明，跨過 3.0000 秒就完全透明
               （textContent 也清成空字串，數字不再佔著畫面）。 */
            /* tick：每個畫面更新時呼叫，更新倒數數字 */
            function tick(now) {
                var el = now - t0;
                var remain = Math.max(0, TOTAL - el);
                var op = opacityAt(remain);
                num.textContent = op > 0 ? sec(remain) : '';
                num.style.opacity = op.toFixed(3);
                if (countVisible(remain)) count.classList.add('is-on');
                /* requestAnimationFrame(tick)：請瀏覽器在下一個畫面更新時再呼叫 tick，形成持續更新的迴圈 */
                if (!clicked) raf = requestAnimationFrame(tick);
            }
            raf = requestAnimationFrame(tick);

            /* 用 pointerdown（手指一碰到螢幕就觸發），不是 click——這是一個計時遊戲，
               click 在觸控裝置上要等手指離開螢幕（touchend）才觸發，等於多算了「手指按著
               不放」的時間，量到的不是玩家實際反應的那一刻，整個計時就不準了。 */
            /* pointerdown：手指一碰到就觸發 */
            btn.addEventListener('pointerdown', function (e) {
                if (clicked) return;
                e.preventDefault();
                /* e.preventDefault()：阻止瀏覽器預設行為 */
                clicked = true;
                if (window.Sfx) Sfx.play('click');
                cancelAnimationFrame(raf);
                /* 算出差了幾毫秒：現在時間 − 開始時間 − 總長度（正＝慢了，負＝快了）。
                   不再四捨五入成整數毫秒——保留到 0.1 毫秒，成績才有 4 位小數（秒）可以用 */
                finish(performance.now() - t0 - TOTAL);
            });
        }

        /* finish：結算畫面。diffMs 是跟 0 秒差的毫秒數（可以有小數） */
        function finish(diffMs) {
            var abs = Math.abs(diffMs);
            /* 最終成績（秒、小數 4 位、第 3／4 位不為 0）：在這裡只產生「一次」，
               後面的畫面、最佳紀錄、排行榜全部用這同一個數字，不會出現同一局顯示不同尾數 */
            var score = Leaderboard.fake4(abs / 1000);
            var label = score === 0 ? '完美！剛剛好 0 秒' : diffMs > 0 ? '慢了 ' + Leaderboard.fmtNum(score, 4) + ' 秒' : '快了 ' + Leaderboard.fmtNum(score, 4) + ' 秒';
            console.log('零秒出手：實際差 ' + abs.toFixed(3) + ' 毫秒（' + (abs / 1000).toFixed(6) + ' 秒）→ 成績 ' + Leaderboard.fmtNum(score, 4) + ' 秒');
            /* 這款遊戲是「跟 0 秒差越少越好」，所以傳給 setBest 的比較函式是
               v < b（新差值比舊紀錄小才算更好）——跟「神準落下」的分數（越大越好）
               方向相反，這就是 reaction_core.js 的 setBest 要求呼叫端自己傳比較
               函式、而不是寫死「數字越大越好」的原因。 */
            var isNew = Reaction.setBest(ID, score, function (v, b) { return v < b; });
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            /* 結算彈窗（公版 kit.result）：帶 score 會在彈窗出現之後自動送世界排行榜（非同步，進榜了會自己跳出恭喜）。
               評語與結算音效的門檻用「實際差了幾毫秒」判斷（≤30 毫秒＝超級好、≤150 毫秒＝過關） */
            Reaction.kit.result(root, {
                num: Leaderboard.fmt(SCORE, score), label: label, isNew: isNew, score: score,
                sfx: abs <= 30 ? 'perfect' : (abs <= 150 ? 'win' : 'neutral'), onAgain: round
            });
        }

        round();
    }

    /* Reaction.register：把這款遊戲登記到遊戲清單（id、名稱、規則說明、進場函式） */
    Reaction.register({
        id: ID,
        name: '零秒出手',
        rule: '請在**心裡默數至零**，快速點擊按鈕，看看你差了幾秒。從 7.0000 開始倒數，畫面會顯示 X.XXXX 秒；倒數到 4.0000 秒時，數字會慢慢變透明，到 3.0000 秒就完全看不見，**剩下的 3 秒要靠自己在心裡默數**。',
        mount: mount,
        test: { TOTAL: TOTAL, FADE_AT: FADE_AT, HIDE_AT: HIDE_AT, COUNT_AT: COUNT_AT, COUNT_TEXT: COUNT_TEXT, opacityAt: opacityAt, countVisible: countVisible },
        /* 世界排行榜的成績規格（資料庫 MF_games 裡 speed 那一列要一致） */
        score: SCORE
    });
})();
