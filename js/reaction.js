/* ═══════════════════════════════════════════════════════════════════
   reaction.js — 秒反應（reaction.html）進場控制
   · 每次從主選單點「秒反應」進來，就從 Reaction.list() 隨機挑一個小遊戲。
   · 先彈出說明彈窗，按「開始挑戰」才進遊戲；同一個遊戲可以無限次重玩（見各遊戲檔案）。
   · 左上角「返回」永遠回主選單；右上角「?」可以隨時重看規則。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var h = UI.h;
    var screen, barTitle, barMeta, barBack, barHelp, ruleDlg;
    var game;

    function setMeta(text) { barMeta.textContent = text || ''; }

    function showRule(onClose) {
        ruleDlg.innerHTML = '';
        ruleDlg.appendChild(h('div', { 'class': 'rule-dlg__card' }, [
            h('div', { 'class': 'rule-dlg__title', text: game.name }),
            h('div', { 'class': 'rule-dlg__text', text: game.rule }),
            h('button', {
                'class': 'btn btn--primary', text: '開始挑戰',
                on: { click: function () { ruleDlg.hidden = true; onClose(); } }
            })
        ]));
        ruleDlg.hidden = false;
    }

    UI.ready(function () {
        Stage.init();
        screen = document.getElementById('screen');
        barTitle = document.getElementById('bar-title');
        barMeta = document.getElementById('bar-meta');
        barBack = document.getElementById('bar-back');
        barHelp = document.getElementById('bar-help');
        ruleDlg = document.getElementById('rule-dlg');

        barBack.innerHTML = UI.icon('back') + '<span>返回</span>';
        barBack.addEventListener('click', function () { location.href = 'index.html'; });
        barHelp.addEventListener('click', function () { showRule(function () { }); });

        var list = Reaction.list();
        game = list[Math.floor(Math.random() * list.length)];
        barTitle.textContent = game.name;

        showRule(function () { game.mount(screen, { setMeta: setMeta }); });
    });
})();
