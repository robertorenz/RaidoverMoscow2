/* Raid Over Moscow II — low-poly 3D models (local axes: +x forward, +y left, +z up) */
'use strict';
(function () {
  const ROM = window.ROM;
  const M = ROM.Mesh;
  const P = (ROM.Models = {});

  /* Player stealth bomber */
  P.bomber = (function () {
    const m = M();
    const hull = '#5b6b7c', wing = '#6f8296', dark = '#3a4652';
    M.loft(m, [[-15, 2.2, 0.5], [-4, 4.2, 1], [8, 3.6, 1], [16, 1.2, 0.6], [20, 0.1, 0.4]], 6, hull);
    // delta wings
    M.poly(m, [[9, 2, 0], [-12, 22, -0.5], [-15, 18, -0.5], [-13, 2, 0]], wing);
    M.poly(m, [[9, -2, 0], [-13, -2, 0], [-15, -18, -0.5], [-12, -22, -0.5]], wing);
    // canards
    M.poly(m, [[12, 2, 1], [6, 8, 1], [5, 2, 1]], dark);
    M.poly(m, [[12, -2, 1], [5, -2, 1], [6, -8, 1]], dark);
    // twin tails
    M.poly(m, [[-8, 4, 2], [-14, 6, 2], [-16, 8, 11], [-12, 7, 11]], dark);
    M.poly(m, [[-8, -4, 2], [-12, -7, 11], [-16, -8, 11], [-14, -6, 2]], dark);
    // canopy
    M.box(m, 6, -1.6, 3, 12, 1.6, 5, '#8fd6ff', { glow: false });
    // engine glow
    M.box(m, -16.5, -1.5, -0.5, -15, 1.5, 2, '#ffb347', { glow: true, keep: true });
    return m;
  })();

  /* Enemy MiG fighter */
  P.mig = (function () {
    const m = M();
    const hull = '#7d8a7a', dark = '#4c5a4c', red = '#c23b2e';
    M.loft(m, [[-14, 2.5, 0.5], [0, 3.4, 1], [12, 2.4, 1], [19, 0.2, 0.6]], 6, hull);
    M.poly(m, [[4, 2, 0.5], [-9, 16, 0], [-12, 16, 0], [-10, 2, 0.5]], dark);
    M.poly(m, [[4, -2, 0.5], [-10, -2, 0.5], [-12, -16, 0], [-9, -16, 0]], dark);
    M.poly(m, [[-6, 0, 3], [-14, 0, 3], [-16, 0, 13], [-12, 0, 13]], red);
    M.poly(m, [[-10, 2, 1], [-15, 8, 1], [-16, 2, 1]], dark);
    M.poly(m, [[-10, -2, 1], [-16, -2, 1], [-15, -8, 1]], dark);
    M.box(m, 5, -1.4, 3, 10, 1.4, 4.6, '#d8f0ff');
    return m;
  })();

  /* Attack helicopter (rotor drawn separately) */
  P.heli = (function () {
    const m = M();
    const hull = '#6a7550', dark = '#3f4630';
    M.loft(m, [[-6, 4, 6], [4, 6, 6], [10, 4, 5], [13, 1, 5]], 6, hull);
    M.box(m, -26, -1.2, 5, -6, 1.2, 8, dark);
    M.poly(m, [[-22, 0, 8], [-27, 0, 8], [-28, 0, 16], [-24, 0, 15]], dark);
    M.box(m, 6, -3, 7, 11, 3, 10, '#a8d8e8');
    M.box(m, -4, -9, 4, 4, -6, 6, dark); // stub wings
    M.box(m, -4, 6, 4, 4, 9, 6, dark);
    M.box(m, -8, -5, -1, 10, -4, 0, '#2c2f26');
    M.box(m, -8, 4, -1, 10, 5, 0, '#2c2f26');
    M.box(m, -1, -1, 11, 1, 1, 14, dark);
    return m;
  })();

  P.tankHull = (function () {
    const m = M();
    M.box(m, -16, -9, 0, 16, 9, 7, '#5f6b3c');
    M.box(m, -17, -11, 0, 17, -8, 5, '#2f3322');
    M.box(m, -17, 8, 0, 17, 11, 5, '#2f3322');
    return m;
  })();
  P.tankTurret = (function () {
    const m = M();
    M.box(m, -8, -6, 7, 6, 6, 13, '#6c7a45');
    M.box(m, 6, -1, 9, 26, 1, 11, '#3a4128');
    return m;
  })();

  P.boat = (function () {
    const m = M();
    M.loft(m, [[-18, 6, 2], [6, 7, 2], [18, 1, 3]], 4, '#59646e');
    M.box(m, -8, -4, 5, 4, 4, 13, '#7b8792');
    M.box(m, 6, -1, 9, 14, 1, 11, '#2e353b');
    return m;
  })();

  P.truck = (function () {
    const m = M();
    M.box(m, -14, -6, 2, 6, 6, 14, '#56603a');
    M.box(m, 6, -6, 2, 15, 6, 11, '#4a5232');
    M.box(m, 12, -5, 7, 15.2, 5, 10, '#9fc7d8');
    return m;
  })();

  P.icbm = (function () {
    const m = M();
    M.loft(m, [[0, 7, 0], [70, 7, 0], [88, 4, 0], [96, 0.1, 0]], 8, '#e6e8ea');
    M.loft(m, [[50, 7.3, 0], [56, 7.3, 0]], 8, '#c23b2e', { keep: true });
    return m;
  })();

  P.missile = (function () {
    const m = M();
    M.loft(m, [[-8, 1.6, 0], [6, 1.6, 0], [10, 0.1, 0]], 5, '#d9dde0');
    M.poly(m, [[-8, 0, 0], [-4, 0, 0], [-8, 0, 4]], '#c23b2e');
    M.poly(m, [[-8, 0, 0], [-4, 0, 0], [-8, 4, 0]], '#c23b2e');
    return m;
  })();

  /* Soldier (simple blocky figure). frame drives leg swing */
  P.soldier = function (color, helmet) {
    const m = M();
    M.box(m, -2, -3.5, 7, 2, 3.5, 16, color);
    M.box(m, -2.3, -2.3, 16, 2.3, 2.3, 21, '#d9b38c');
    M.box(m, -2.6, -2.6, 20, 2.6, 2.6, 22.5, helmet);
    return m;
  };
  P.soldierLegs = function (color) {
    const m = M();
    M.box(m, -1.5, -3, 0, 1.5, -0.5, 7, color);
    M.box(m, -1.5, 0.5, 0, 1.5, 3, 7, color);
    return m;
  };

  /* Reactor defence robot */
  P.robotBody = (function () {
    const m = M();
    M.box(m, -18, -26, 0, 18, 26, 14, '#3b434b'); // treads
    M.box(m, -14, -18, 14, 14, 18, 52, '#8a959f');
    M.box(m, -12, -14, 52, 12, 14, 70, '#a7b2bc');
    M.box(m, 11.5, -10, 58, 13, 10, 63, '#ff5a3c', { glow: true, keep: true }); // visor
    M.box(m, -10, -20, 36, 10, -18, 48, '#c9a227'); // chest stripes
    M.box(m, -10, 18, 36, 10, 20, 48, '#c9a227');
    return m;
  })();
})();
