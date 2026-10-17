// Паспорта героев кита (kit/heroes) — ДАННЫЕ: всё про героя (файлы, якоря, позы по ролям, масштаб листа, наклон) живёт здесь.
// В presets/tl-actor.jsx нет ни имени, ни числа героя. Подмена героя = hero: "arlan" в kbActor (или KB_CONFIG.hero в kit.config.jsx).
// Пути files.dir — от KB_CONFIG.heroRoot (по умолчанию папка над ae/ проекта). Перенесено из kemel-bilim type-lab-15/stream7 (замер — stream7/measure-hero.py).
// Единицы: px исходника позы (Айдос 896×1200, Арлан 1024²); углы — градусы; направления dir — вектор «основание кисти → кончик».
// Подключать после heroes.measured.jsx (незаполненные null поля берутся из замера measure-hero.py); kit/move.jsx подключает оба.

/** @type {any} */
var TL_HEROES = {
  aidos: {
    id: "aidos", name: "Айдос",
    render: "doodle",                         // doodle: PNG без альфы, на бумагу умножением; char: PNG с альфой, Normal
    files: { prefix: "taqiya-", dir: null, w: 896, h: 1200 },   // dir null → kbDoodlePath (assets/doodle, потом studio/public/reels/doodle)
    blend: "multiply",
    sheet: { w: 1652, h: 1660, dx: 378, dy: 527, fill: "white", pad: 120 },  // лист фигуры: поля под изгиб и кивок; белый — под маски разреза; pad — поле ТОЛЬКО под подошвами для CC Bend It (Bezier Warp его не видит: подошвы стоят при сквоше); pad и bend.start подобраны исполнителем, при них сделан замер Q2b
    ground: 1114, top: 102, axis: 448,        // подошвы, верх тақии, ось фигуры (px исходника); H = 1012
    bend: { start: 1200, end: -147 },         // ось CC Bend It (px исходника): 86 ниже подошв, 249 выше макушки. Было 1131 (17 ниже): CC Bend It рвёт низ подошв у своего Start (Q2b: n 686, max 97); при 86 и поле pad 120 — n 432, max 19, срезов нет. Q2b — решение оркестратора 17.10, ред. 2: допуск --diff ≤ 24/255 на всех позах и условие «срезов подошв нет» — нижние 3 ряда подошв ≥ 0,96 эталона на всех позах и контур подошв целый на кропе 3× (CC Bend It меняет сглаживание кромки); замер 17.10: base 19/255, позы max 21/255, подошвы min 0,970 (celebrate) → ok
    neck: { x: 447, y: 421, overlap: 5, feather: 2, maxAngle: 7, col: [320, 580] },  // feather 2 (было 8) — решение оркестратора 17.10 (Q6): при 2 дифф 0° против неразрезанной 0/255 у всех семи поз, швы ±7° gaps 0 (замеры: 8 — n 387 max 24/255; 4 — max 2/255 > 1/255). Код берёт feather из паспорта как есть, без зажима
    head: { c: [451.5, 300], r: 142, crown: [458, 102], hat: [336, 103, 576, 206] },  // одинаковы во всех позах
    life: { breath: { amount: 0.022, period: 2.6, fps: 15 }, boil: { amount: 6, size: 26, fps: 15 }, twos: 15, blur: false },
    rig: { split: true, bend: true, squash: true, scale: true, blink: false, lids: false, brows: false, mouth: false, ears: false, tail: false },
    calib: { bendK: 0.7343, warp: "coons" }, // bendK — k_θ зонда Q3: θ — угол хорды от точки начала изгиба (bend Start) до макушки, k_θ — МНК по этой хорде (решение оркестратора 17.10); подгонка 12 точек × 7 значений Bend, φ = 1,8018°/ед., невязка 0,44 px ≤ 1,5 (spec §13). Хорда подошвы→макушка (k 0,7919) даёт невязку 12,77 px: подошвы едут вместе с изгибом вокруг Start
    poses: {
      base:       { split: true },
      speaking:   { split: true,  tip: [168, 507], dir: [-162, -33] },
      pointing:   { split: false, tip: [747, 280], dir: [187, -190] },
      holding:    { split: true,  palm: [122, 494], palmEnd: [91, 507] },
      aha:        { split: false, tip: [630, 170] },                 // ≈
      celebrate:  { split: false, ground: 1104, hands: [[201, 230], [687, 230]] },
      confused:   { split: false },
      listening:  { split: false, hand: [600, 290], ear: [600, 300] },// ≈
      wave:       { split: false, hand: [686, 203], dir: [126, -267] },
      thinking:   { split: true }, shrug: { split: true, palms: [[140, 484], [740, 483]] },
      phone:      { split: true }, headphones: { split: true }
    },
    roles: { idle: "base", talk: "speaking", point: ["pointing", "speaking"], hold: "holding", take: "aha",
             cheer: "celebrate", doubt: "confused", listen: "listening", wave: "wave", think: "thinking", release: null }
  },
  arlan: {                                    // ЗАГОТОВКА: что есть в библиотеке — заполнено, что нужно замерить — null
    id: "arlan", name: "Арлан",
    render: "char",
    files: { prefix: "arlan_", dir: "design/mascot-tazy/library/arlan/", w: 1024, h: 1024, rig: "design/mascot-tazy/library/rig.json" }, // ae-ok: asset — путь от KB_CONFIG.heroRoot проекта (kemel-bilim), в ae-plugin файла нет
    blend: "normal",
    sheet: null,                              // measure-hero.py --hero arlan: dx = 0,37·H, dy = 0,40·H, pad = 0,12·H (поле под подошвами для CC Bend It; к h не прибавлено — комп рисунка = h + pad), низ листа = подошвы + 0,02·H, fill "none"
    ground: 982, top: null, axis: 503,        // axis = head_x 503 (одинаков во всех позах; ступни скользят по рисунку); top паспорта — по idle; у поз — свой top
    bend: null,                               // правило measure-hero.py: start = ground + 0,085·H (подошвы + pad), end = top − 0,246·H
    neck: null,                               // линии шеи нет: разрез по канту худи под наушниками — замер и «ок» владельца (§14); до тех пор nod/tilt → изгиб корпуса
    head: { c: null, r: null, crown: null, hat: null },
    life: { breath: { amount: 0.022, period: 2.6, fps: 15 }, boil: null, twos: 15, blur: false },   // кипения нет: гладкая иллюстрация
    rig: { split: false, bend: true, squash: true, scale: true, blink: true, lids: false, brows: false, mouth: false, ears: false, tail: false },
    face: { blinkOn: ["idle", "talk", "talk3q", "listen"] },        // накладки eyes_half / eyes_closed по rig.json (face_patches_ok)
    calib: { bendK: 0.7350, warp: "coons" }, // зонд Q3A (17.10): θ — хорда bend Start → макушка, k_θ — МНК по ней (решение оркестратора 17.10); подгонка по настоящим кадрам Арлана 12 точек × 7 значений Bend, φ = 1,8025°/ед., невязка 0,60 px
    poses: { idle: {}, talk: {}, talk3q: {}, listen: {}, "point-side": { tip: null, dir: [1, 0] }, "point-down": {}, hold: { palm: null },
             "hold-both": {}, surprised: {}, aha: { tip: null }, happy: { hands: null }, shrug: {}, think: {}, wave: { hand: null } },
    roles: { idle: "idle", talk: "talk", point: ["point-side"], hold: "hold", take: "surprised", cheer: "happy",
             doubt: "shrug", listen: "listen", wave: "wave", think: "think", release: null }
  }
};

/**
 * Дополнить null-поля паспорта замером (рекурсивно, объекты сливаются, массивы заменяются целиком только если в паспорте null).
 * @param {any} target
 * @param {any} src
 */
function tlhFill(target, src) {
  for (var k in src) {
    if (typeof src[k] === "object" && src[k] !== null && !(src[k] instanceof Array)) {
      if (target[k] === null || target[k] === undefined) target[k] = {};
      if (typeof target[k] === "object") tlhFill(target[k], src[k]);
    } else if (target[k] === null || target[k] === undefined) {
      target[k] = src[k];
    }
  }
}

if (typeof TL_HEROES_MEASURED !== "undefined") {
  // Айдос заполнен руками (spec §4.2) — замер его только сверяет (HEROCHK); Арлан берёт замер в null-поля.
  tlhFill(TL_HEROES.arlan, TL_HEROES_MEASURED.arlan || {});
}
