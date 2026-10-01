/* ═══════════════════════════════════════════════════════════════════
   reaction_speed.js — 秒反應・零秒出手
   從 6.000 開始倒數，數字倒數到 3.000 秒就會隱藏，剩下的 3 秒要自己默數，
   算準 0 秒的瞬間按下按鈕；分數＝跟 0 秒差了幾秒（越小越好，畫面一律顯示到小數點後三位）。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'speed';
    var h = UI.h;
    var TOTAL = 6000;    /* 倒數總長（毫秒，內部計時用；畫面一律換算成秒顯示） */
    var HIDE_AT = 3000;  /* 倒數到剩這麼多毫秒時，數字開始隱藏 */

    /* 內部一律用毫秒整數比大小（精準、不會有浮點誤差），只有顯示才換算成 X.XXX 秒 */
    function sec(ms) { return (ms / 1000).toFixed(3); }
    function fmtBest(v) { return v == null ? '' : '最佳差 ' + sec(v) + ' 秒'; }

    function mount(root, ctx) {
        var raf = null;

        function round() {
            root.innerHTML = '';
            var num = h('div', { 'class': 'speed-num', text: sec(TOTAL) });
            var hint = h('div', { 'class': 'hint', text: '默數到 0，算準時間按下面的按鈕' });
            var btn = h('button', { 'class': 'btn btn--primary speed-btn', text: '按這裡！' });
            root.appendChild(h('div', { 'class': 'speed-wrap' }, [num, hint]));
            root.appendChild(btn);
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            var t0 = performance.now();
            var clicked = false;

            /* 每一影格都重新算「現在剩幾毫秒」，不是遞減一個計數器變數——這樣不管
               這一影格跟上一影格之間實際間隔多久（不同裝置的更新頻率不一樣），
               算出來的剩餘時間永遠準確對應真實經過的時間，不會因為掉幀而計時跑掉。
               remain > HIDE_AT - 1：剩餘時間還大於 3000 毫秒（HIDE_AT）才顯示數字，
               一跨過這個門檻，textContent 直接設成空字串，數字瞬間消失。 */
            function tick(now) {
                var el = now - t0;
                var remain = Math.max(0, TOTAL - el);
                num.textContent = remain > HIDE_AT - 1 ? sec(remain) : '';
                if (!clicked) raf = requestAnimationFrame(tick);
            }
            raf = requestAnimationFrame(tick);

            /* 用 pointerdown（手指一碰到螢幕就觸發），不是 click——這是一個計時遊戲，
               click 在觸控裝置上要等手指離開螢幕（touchend）才觸發，等於多算了「手指按著
               不放」的時間，量到的不是玩家實際反應的那一刻，整個計時就不準了。 */
            btn.addEventListener('pointerdown', function (e) {
                if (clicked) return;
                e.preventDefault();
                clicked = true;
                cancelAnimationFrame(raf);
                finish(Math.round(performance.now() - t0 - TOTAL));
            });
        }

        function finish(diffMs) {
            var abs = Math.abs(diffMs);
            var label = diffMs === 0 ? '完美！剛剛好 0 秒' : diffMs > 0 ? '慢了 ' + sec(abs) + ' 秒' : '快了 ' + sec(abs) + ' 秒';
            /* 這款遊戲是「跟 0 秒差越少越好」，所以傳給 setBest 的比較函式是
               v < b（新差值比舊紀錄小才算更好）——跟「神準落下」的分數（越大越好）
               方向相反，這就是 reaction_core.js 的 setBest 要求呼叫端自己傳比較
               函式、而不是寫死「數字越大越好」的原因。 */
            var isNew = Reaction.setBest(ID, abs, function (v, b) { return v < b; });
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            root.innerHTML = '';
            root.appendChild(h('div', { 'class': 'rx-result' }, [
                h('div', { 'class': 'rx-result__num', text: sec(abs) + ' 秒' }),
                h('div', { 'class': 'rx-result__label', text: label }),
                isNew ? h('div', { 'class': 'hint hint--ok', text: '新紀錄！' }) : null,
                h('button', { 'class': 'btn btn--primary', text: '再挑戰一次', on: { click: round } })
            ]));
        }

        round();
    }

    Reaction.register({
        id: ID,
        name: '零秒出手',
        rule: '請在心裡默數至零，快速點擊按鈕，看看你差了幾秒。從 6.000 開始倒數，畫面會顯示 X.XXX 秒；但倒數到 3.000 秒之後，數字就會隱藏起來，不讓你看到，剩下的 3 秒要靠自己在心裡默數。',
        mount: mount
    });
})();
