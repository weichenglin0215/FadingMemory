/* ═══ menu.js — 入口畫面（index.html） ═══ */

(function () {
    'use strict';

    UI.ready(function () {
        Stage.init();
        document.getElementById('menu-logo').innerHTML = UI.art('home', 'menu__art');
        document.getElementById('icon-test').innerHTML = UI.icon('list');
        document.getElementById('icon-world').innerHTML = UI.icon('cube');

        /* 從這裡進測試模式＝新的一局：題目在 quiz.html 一進去就全部重新產生（見 js/quiz_gen.js） */
        document.querySelector('.mode--test').addEventListener('click', function () {
            UI.store.set('fm.quiz.fresh', true);
        });

        var v = window.FM_VERSION;
        var el = document.getElementById('menu-version');
        if (v && el) {
            var shown = /^local-/.test(v.version) ? '本機版' : '版本 ' + v.version;
            el.textContent = v.updated ? '已更新到最新 ' + shown : shown;
        }
    });
})();
