// Поток 5 — плашки (stream5/spec.md): часть A (§4) — шесть предметов в покое: ярлык, место под ответ, штамп, выноска, карточка, подпись без плашки;
// часть B (§5) — их движения: пресеты №23–28 и №32 в TL_MOVES (plate-in, plate-out, stamp-in, tag-peel, arc-fly, suffix-dock, word-to-card) и общие
// помощники (tlPlateRepivot, tlpToComp, tlPlateOpacity, tlPlatePalm). Подключать ПОСЛЕ tl-ease, tl-move, tl-accent, tl-hand, tl-type,
// tl-voice, tl-mark, tl-caption (порядок spec §1): файл сам подключает только кит без состояния — повторный include lib/*.jsx обнулил бы реестр TL_MOVES.
// Всё из tl-*.jsx (tlTextAt, tlStrokeFit, tlRetrim, tlBoilTwos, tlHandPath, tlSplitWord, kbMove) берётся по имени в момент вызова.
// ES3, свойства только по matchName. Плашка — предмет из той же бумаги, не подложка (решение владельца 23.09): у букв нет ни контура, ни тени.
// Решения владельца 16.10 (стоп-кадры части A) — умолчания: край всех плашек A (мягкий кант тушью); штамп A — рамка для правил, B — круглый мөр для
// «САҚТАП ҚОЙ»/«SAVE IT» (role "save"), шрифт штампа InterKB-Bold, пробел перед «Ғ» +0,15 em; выноска A (бумажная наклейка с хвостиком); место под ответ —
// A черта (ниша B не по умолчанию — только явным variant "B", для сравнения); карточка слова со строкой транскрипции кириллицей строчными; тень 12 % + 18 %.
// Точки героя (ладонь, голова) сюда не зашиваются — приходят данными ролика (сегодня Айдос, дальше Арлан).
// ГРАБЛИ wiggle (16.10): seed у wiggle в выражениях hold-alive зависит от НОМЕРА слоя, и любой слой, добавленный в композицию после word-to-card (подпись, слово, сцена
// рилса), сдвигает индексы и меняет шум дышащей карточки — цель подмены, посчитанная на t_s, промахивается (было −2,206° вместо −2,432°, строка уезжала на 1–3 px).
// seedRandom на wiggle не действует, так что явный seed «по имени слоя» в выражение не поставить без замены wiggle на свой шум (это сдвинет все замеры потоков 1–4).
// Правило: слои композиции с карточкой создавать ДО word-to-card (подписи, слова, пары), а после сборки вызывать tlPlateW2cGuard(card) — он пересчитывает цель на t_s
// и возвращает расхождение (px и °); допуск 0,5 px / 0,02°. При сборке рилса: сначала все слои сцены, последним kbMove(..., "word-to-card"), затем guard.
// Размытие: у частей слова и строки в word-to-card motionBlur выключается (слово летит 30 px за кадр в окне затвора и на подмене давало скачок резкости).

//@include "../core.jsx"
//@include "../project.jsx"
//@include "../motion.jsx"
//@include "../text.jsx"
//@include "../shape.jsx"
//@include "../look.jsx"
//@include "../show-hand.jsx"
//@include "../show-e.jsx"
//@include "../show-final.jsx"

/**
 * Общая система предмета (spec §4.1): одна бумага, одна тень, один кант, одно волокно. Числа посчитаны в линейном свете.
 * @type {any}
 */
var TL_PLATE_LOOK = {
  cast: { opacity: 12, dx: 6, dy: 10, blur: 12 },
  contact: { opacity: 18, dx: 0, dy: 2, blur: 2 },
  grain: { contrast: 4, brightness: 46, scale: 2, complexity: 1, seed: 1 },
  edgeA: { width: 3, holeWidth: 1.5, boil: 1, boilSize: 24 },
  edgeB: { width: 1.4, color: [1, 0.995, 0.975] },
  rough: 1.5, step: 28, minN: 64,
  rim: [1, 0.995, 0.975],
  tape: [0.914, 0.882, 0.8],
  stampWide: { chars: "Ғ", em: 0.15 },
  stampInner: 2.5, // внутренняя рамка штампа/мөра (spec §4.3.3: 1,5; 17.10 — 2,5: под Roughen она рвалась в пунктир)
  stampBorder: 2, // Roughen Border оттиска после посадки (spec §4.3.3, §5.4: 3; 17.10 — 2: при 3 внутреннее кольцо и тонкие выносные Қ/Ғ рвались)
  persp: { zoom: 6000, z: -2 }, // камера 3D-ярлыков tl-cam (tlPlateCamera, 17.10): zoom 6000 вместо штатных 1500 — ребро ярлыка в перспективе ≤ 6 px, ширина на повороте по cos (spec §2, §8 H); текст стороны на z −2
  eps: 1 / 600 // парный hold-ключ смены опоры и подмены: t − eps (старое) и t (новое)
};

/**
 * Слово начинается с буквы из набора (пробел перед ним в штампе шире). Без Array/String.indexOf по набору — перебор.
 * @param {string} word
 * @param {string} set
 * @returns {boolean}
 */
function tlpWideWord(word, set) {
  if (!word || !set) return false;
  var c = word.charAt(0);
  for (var i = 0; i < set.length; i++) if (set.charAt(i) === c) return true;
  return false;
}

/**
 * Шесть типов (spec §4.3): радиус угла, заливка, шрифт-роль. Одна функция tlPlate строит все.
 * @type {any}
 */
var TL_PLATES = {
  tag: { r: 18, fill: true },
  slot: { r: 10, fill: false },
  badge: { r: 12, fill: false },
  callout: { r: 22, fill: true },
  card: { r: 14, fill: true },
  bare: { r: 0, fill: false }
};

// ---------------------------------------------------------------------------------------------------------------------
// Внутренние помощники
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Повторяемое число 0…1 (копия kbHoleNoise: служебные функции кита снаружи не вызываются).
 * @param {number} i
 * @param {number} seed
 * @returns {number}
 */
function tlpNoise(i, seed) {
  var v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Стили hand и lesson — дальше; brisk, magazine → исключение до первого слоя (spec §6).
 * @param {string} name
 */
function tlPlateGuardStyle(name) {
  var st = TL_S.name;
  if (st !== "hand" && st !== "lesson") throw new Error("«plate " + name + "»: стиль " + st + " не поддержан");
}

/**
 * @returns {any}
 */
function tlpPal() {
  return TL_S.palette;
}

/**
 * @returns {any}
 */
function tlpFonts() {
  return TL_S.fonts;
}

/**
 * Цвет бумаги, умноженный на k (не выше 1).
 * @param {number} k
 * @returns {number[]}
 */
function tlpPaperK(k) {
  var p = tlpPal().paper;
  return [Math.min(1, p[0] * k), Math.min(1, p[1] * k), Math.min(1, p[2] * k)];
}

/**
 * Сдвиг контура (вершины; касательные те же).
 * @param {Shape} shape
 * @param {number} dx
 * @param {number} dy
 * @returns {Shape}
 */
function tlpShift(shape, dx, dy) {
  var s = new Shape();
  var v = shape.vertices;
  var out = [];
  for (var i = 0; i < v.length; i++) out.push([v[i][0] + dx, v[i][1] + dy]);
  s.vertices = /** @type {any} */ (out);
  s.inTangents = shape.inTangents;
  s.outTangents = shape.outTangents;
  s.closed = shape.closed;
  return s;
}

/**
 * Замер строки: ширина чернил, высота над базой (top), низ под базой (bot, может быть < 0). Чернила = sourceRectAtTime до аниматоров.
 * @param {CompItem} comp
 * @param {string} text
 * @param {string} font
 * @param {number} size
 * @returns {{w: number, top: number, bot: number}}
 */
function tlpLine(comp, text, font, size) {
  var m = kbTextMeasure(comp, { text: text, font: font, size: size });
  return { w: m.width, top: -m.top, bot: m.top + m.height };
}

/** @type {any} */
var TLP_METRICS = {};

/**
 * Метрики шрифта при 100 px (зонд Q6): капитель «Н», выносной «Қ», бреве «Й» — в долях кегля. Кэш по шрифту.
 * @param {CompItem} comp
 * @param {string} font
 * @returns {{cap: number, desc: number, breve: number}}
 */
function tlpMetrics(comp, font) {
  if (TLP_METRICS[font]) return TLP_METRICS[font];
  var h = tlpLine(comp, "Н", font, 100);
  var q = tlpLine(comp, "Қ", font, 100);
  var y = tlpLine(comp, "Й", font, 100);
  var m = { cap: h.top / 100, desc: Math.max(0, q.bot) / 100, breve: Math.max(0, y.top - h.top) / 100 };
  TLP_METRICS[font] = m;
  kbLog("PROBE Q6 " + font + " cap " + m.cap.toFixed(4) + " desc " + m.desc.toFixed(4) + " breve " + m.breve.toFixed(4));
  return m;
}

/**
 * Фон кадра: Solid paper и то же волокно, что на плашках (seed 1) — критерий «волокно как у фона».
 * @param {CompItem} comp
 * @returns {AVLayer}
 */
function tlPlatePaper(comp) {
  var layer = comp.layers.addSolid(/** @type {any} */ (tlpPal().paper), "paper", comp.width, comp.height, 1, comp.duration);
  tlpGrain(layer, 1);
  return layer;
}

/**
 * Волокно листа (набор kbHolePlane): Fractal Noise Multiply.
 * @param {AVLayer} layer
 * @param {number} seed
 */
function tlpGrain(layer, seed) {
  var G = TL_PLATE_LOOK.grain;
  var noise = kbEffect(layer, "ADBE Fractal Noise");
  kbProp(noise, ["ADBE Fractal Noise-0004"]).setValue(G.contrast);
  kbProp(noise, ["ADBE Fractal Noise-0005"]).setValue(G.brightness);
  kbProp(noise, ["ADBE Fractal Noise-0010"]).setValue(G.scale);
  kbProp(noise, ["ADBE Fractal Noise-0015"]).setValue(G.complexity);
  kbProp(noise, ["ADBE Fractal Noise-0027"]).setValue(seed);
  kbProp(noise, ["ADBE Fractal Noise-0030"]).setValue(5); // Blending Mode: Multiply
}

/**
 * Детей — под пустышку: значения слоя остаются (setParentWithJump), позиция пересчитывается на (−rx, −ry) — пустышка без поворота и масштаба.
 * @param {Layer} layer
 * @param {Layer} root
 * @param {number} rx
 * @param {number} ry
 * @param {boolean=} keep true — позиция слоя уже в системе пустышки
 */
function tlpAdopt(layer, root, rx, ry, keep) {
  layer.setParentWithJump(root);
  if (keep) return;
  var pos = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]);
  var v = pos.value;
  pos.setValue(v.length > 2 ? [v[0] - rx, v[1] - ry, v[2]] : [v[0] - rx, v[1] - ry]);
}

/**
 * Пустышка 2D с якорем [0, 0].
 * @param {CompItem} comp
 * @param {string} name
 * @param {number} x
 * @param {number} y
 * @returns {Layer}
 */
function tlpNull(comp, name, x, y) {
  var n = comp.layers.addNull();
  n.name = name;
  kbProp(n, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
  kbProp(n, ["ADBE Transform Group", "ADBE Position"]).setValue([x, y]);
  return n;
}

// ---------------------------------------------------------------------------------------------------------------------
// Контур (spec §4.1): скруглённый прямоугольник, неровный край, касательные /3, хвост выноски
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Обход контура по часовой от начала верхней стороны: [{p, sharp}]. 7 вершин на каждом углу (0…90° через 15°), на прямых шаг ≤ step,
 * хвост выноски — тремя острыми вершинами (основание, кончик, основание) по формулам kbBubblePath.
 * @param {{w: number, h: number, r: number, step: number, tail?: any}} o tail {target, half?, max?, min?}
 * @returns {{pts: {p: number[], sharp: boolean}[], tip: number[]|null, base: number[]|null, tailIdx: number}}
 */
function tlpWalk(o) {
  var x0 = -o.w / 2, y0 = -o.h / 2, x1 = o.w / 2, y1 = o.h / 2, r = o.r;
  var edges = [
    { n: "top", s: [x0 + r, y0], e: [x1 - r, y0], d: [1, 0] },
    { n: "right", s: [x1, y0 + r], e: [x1, y1 - r], d: [0, 1] },
    { n: "bottom", s: [x1 - r, y1], e: [x0 + r, y1], d: [-1, 0] },
    { n: "left", s: [x0, y1 - r], e: [x0, y0 + r], d: [0, -1] }
  ];
  var corners = [{ c: [x1 - r, y0 + r], a0: -90 }, { c: [x1 - r, y1 - r], a0: 0 }, { c: [x0 + r, y1 - r], a0: 90 }, { c: [x0 + r, y0 + r], a0: 180 }];
  var pts = [];
  var side = "";
  var half = 20, tmax = 60, tmin = 30, tx = 0, ty = 0;
  if (o.tail) {
    half = o.tail.half === undefined ? 20 : o.tail.half;
    tmax = o.tail.max === undefined ? 60 : o.tail.max;
    tmin = o.tail.min === undefined ? 30 : o.tail.min;
    tx = o.tail.target[0];
    ty = o.tail.target[1];
    side = "bottom";
    if (ty <= y1) side = tx < x0 ? "left" : (tx > x1 ? "right" : "top");
    if (ty > y1 && (tx < x0 - (ty - y1) * 1.5)) side = "left";
    if (ty > y1 && (tx > x1 + (ty - y1) * 1.5)) side = "right";
  }
  var tip = null, base = null, tailIdx = -1;
  function push(p, sharp) {
    pts.push({ p: [p[0], p[1]], sharp: !!sharp });
  }
  function run(a, b, aSharp) {
    var len = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
    var m = Math.max(1, Math.ceil(len / o.step - 1e-9));
    push(a, aSharp);
    for (var k = 1; k < m; k++) push([a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m], false);
  }
  for (var i = 0; i < 4; i++) {
    var g = edges[i];
    if (o.tail && g.n === side) {
      var horiz = g.d[1] === 0;
      var lo = (horiz ? Math.min(g.s[0], g.e[0]) : Math.min(g.s[1], g.e[1])) + half + 10;
      var hi = (horiz ? Math.max(g.s[0], g.e[0]) : Math.max(g.s[1], g.e[1])) - half - 10;
      var c = Math.max(lo, Math.min(hi, horiz ? tx : ty));
      base = horiz ? [c, g.s[1]] : [g.s[0], c];
      var dx = tx - base[0], dy = ty - base[1];
      var len = Math.sqrt(dx * dx + dy * dy);
      var l = Math.min(tmax, Math.max(tmin, len - 12));
      tip = [base[0] + dx / len * l, base[1] + dy / len * l];
      var b1 = [base[0] - g.d[0] * half, base[1] - g.d[1] * half];
      var b2 = [base[0] + g.d[0] * half, base[1] + g.d[1] * half];
      run(g.s, b1, false);
      push(b1, true);
      tailIdx = pts.length;
      push(tip, true);
      run(b2, g.e, true);
    } else {
      run(g.s, g.e, false);
    }
    push(g.e, false);
    for (var k = 1; k <= 5; k++) {
      var a = (corners[i].a0 + 15 * k) * Math.PI / 180;
      push([corners[i].c[0] + r * Math.cos(a), corners[i].c[1] + r * Math.sin(a)], false);
    }
  }
  return { pts: pts, tip: tip, base: base, tailIdx: tailIdx };
}

/**
 * Неровный край и касательные по списку вершин (spec §4.1): d(s) = rough·(0,5·sin(2πs/410 + φ1) + 0,3·sin(2πs/170 + φ2) + 0,2·sin(2πs/97 + φ3)) по нормали,
 * считается один раз; t_i = норм(p_{i+1} − p_{i−1})·min(|p_i − p_{i−1}|, |p_{i+1} − p_i|)/3, у острых вершин 0.
 * @param {{p: number[], sharp: boolean}[]} pts
 * @param {number} rough px
 * @param {number} seed
 * @returns {{shape: Shape, verts: number[][], tang: number[][], dmax: number}}
 */
function tlpFinish(pts, rough, seed) {
  var n = pts.length;
  var s = [0];
  var i;
  for (i = 1; i < n; i++) s.push(s[i - 1] + Math.sqrt(Math.pow(pts[i].p[0] - pts[i - 1].p[0], 2) + Math.pow(pts[i].p[1] - pts[i - 1].p[1], 2)));
  var f1 = 2 * Math.PI * tlpNoise(1, seed), f2 = 2 * Math.PI * tlpNoise(2, seed), f3 = 2 * Math.PI * tlpNoise(3, seed);
  var P = [];
  var dmax = 0;
  for (i = 0; i < n; i++) {
    var cur = pts[i];
    if (cur.sharp || rough === 0) {
      P.push([cur.p[0], cur.p[1]]);
      continue;
    }
    var pr = pts[(i + n - 1) % n].p, nx = pts[(i + 1) % n].p;
    var ux = nx[0] - pr[0], uy = nx[1] - pr[1];
    var ul = Math.sqrt(ux * ux + uy * uy);
    ux /= ul; uy /= ul;
    var d = rough * (0.5 * Math.sin(2 * Math.PI * s[i] / 410 + f1) + 0.3 * Math.sin(2 * Math.PI * s[i] / 170 + f2) + 0.2 * Math.sin(2 * Math.PI * s[i] / 97 + f3));
    if (Math.abs(d) > dmax) dmax = Math.abs(d);
    P.push([cur.p[0] + uy * d, cur.p[1] - ux * d]);
  }
  var tg = [], ins = [], outs = [];
  for (i = 0; i < n; i++) {
    if (pts[i].sharp) {
      tg.push([0, 0]);
    } else {
      var a = P[(i + n - 1) % n], b = P[(i + 1) % n], c = P[i];
      var vx = b[0] - a[0], vy = b[1] - a[1];
      var vl = Math.sqrt(vx * vx + vy * vy);
      var la = Math.sqrt(Math.pow(c[0] - a[0], 2) + Math.pow(c[1] - a[1], 2));
      var lb = Math.sqrt(Math.pow(b[0] - c[0], 2) + Math.pow(b[1] - c[1], 2));
      var L = Math.min(la, lb) / 3;
      tg.push([vx / vl * L, vy / vl * L]);
    }
    ins.push([-tg[i][0], -tg[i][1]]);
    outs.push([tg[i][0], tg[i][1]]);
  }
  var shape = new Shape();
  shape.vertices = /** @type {any} */ (P);
  shape.inTangents = /** @type {any} */ (ins);
  shape.outTangents = /** @type {any} */ (outs);
  shape.closed = true;
  return { shape: shape, verts: P, tang: tg, dmax: dmax };
}

/**
 * Контур плашки (spec §4.1): n ≥ 64 вершин (шаг на прямых уменьшается, пока не хватает), неровность ±rough по seed, хвост выноски.
 * Журнал PLATEPATH <имя> n dmax r.
 * @param {{w: number, h: number, r: number, seed?: number, rough?: number, step?: number, tail?: any, name?: string}} o
 * @returns {{shape: Shape, n: number, dmax: number, verts: number[][], tang: number[][], tip: number[]|null, base: number[]|null, tailIdx: number}}
 */
function tlPlatePath(o) {
  var L = TL_PLATE_LOOK;
  var step = o.step || L.step;
  var wk;
  for (;;) {
    wk = tlpWalk({ w: o.w, h: o.h, r: o.r, step: step, tail: o.tail });
    if (wk.pts.length >= L.minN || step <= 4) break;
    step -= 1;
  }
  var rough = o.rough === undefined ? L.rough : o.rough;
  var fin = tlpFinish(wk.pts, rough, o.seed === undefined ? 1 : o.seed);
  kbLog("PLATEPATH " + (o.name || "path") + " n " + wk.pts.length + " dmax " + fin.dmax.toFixed(3) + " r " + o.r + " step " + step + (wk.tip ? " tip " + fin.verts[wk.tailIdx][0].toFixed(1) + "," + fin.verts[wk.tailIdx][1].toFixed(1) : ""));
  return { shape: fin.shape, n: wk.pts.length, dmax: fin.dmax, verts: fin.verts, tang: fin.tang, tip: wk.tip, base: wk.base, tailIdx: wk.tailIdx };
}

/**
 * Окружность из 4 вершин, касательная 0,5523·r (своя функция, не служебная kbCircleShape).
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @returns {Shape}
 */
function tlpCircle(cx, cy, r) {
  var k = 0.5523 * r;
  var s = new Shape();
  s.vertices = /** @type {any} */ ([[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]]);
  s.inTangents = /** @type {any} */ ([[-k, 0], [0, -k], [k, 0], [0, k]]);
  s.outTangents = /** @type {any} */ ([[k, 0], [0, k], [-k, 0], [0, -k]]);
  s.closed = true;
  return s;
}

/**
 * Кольцо оттиска: 64 вершины, неровность ±rough (резина).
 * @param {number} r
 * @param {number} rough
 * @param {number} seed
 * @returns {Shape}
 */
function tlpRing(r, rough, seed) {
  var n = 64;
  var pts = [];
  for (var i = 0; i < n; i++) {
    var a = (i / n) * 2 * Math.PI;
    pts.push({ p: [r * Math.cos(a), r * Math.sin(a)], sharp: false });
  }
  return tlpFinish(pts, rough, seed).shape;
}

/**
 * Многоугольник с острыми углами (рваный торец скотча).
 * @param {number[][]} v
 * @returns {Shape}
 */
function tlpPoly(v) {
  var s = new Shape();
  var z = [];
  for (var i = 0; i < v.length; i++) z.push([0, 0]);
  s.vertices = /** @type {any} */ (v);
  s.inTangents = /** @type {any} */ (z);
  s.outTangents = /** @type {any} */ (z);
  s.closed = true;
  return s;
}

// ---------------------------------------------------------------------------------------------------------------------
// Слои предмета: тело, кант, тень
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Слой-контур shape: заливка и/или обводка по списку путей.
 * @param {CompItem} comp
 * @param {string} name
 * @param {Shape[]} paths
 * @param {{fill?: number[], evenodd?: boolean, stroke?: number[], width?: number}} o
 * @returns {ShapeLayer}
 */
function tlpShapeLayer(comp, name, paths, o) {
  var layer = comp.layers.addShape();
  layer.name = name;
  var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  var contents = kbGroup(group, ["ADBE Vectors Group"]);
  for (var i = 0; i < paths.length; i++) {
    var pg = kbAdd(contents, "ADBE Vector Shape - Group");
    kbProp(pg, ["ADBE Vector Shape"]).setValue(paths[i]);
  }
  if (o.stroke) {
    var stroke = kbAdd(contents, "ADBE Vector Graphic - Stroke");
    kbProp(stroke, ["ADBE Vector Stroke Color"]).setValue([o.stroke[0], o.stroke[1], o.stroke[2], 1]);
    kbProp(stroke, ["ADBE Vector Stroke Width"]).setValue(o.width || 1);
    kbProp(stroke, ["ADBE Vector Stroke Line Join"]).setValue(2);
    kbProp(stroke, ["ADBE Vector Stroke Line Cap"]).setValue(2);
  }
  if (o.fill) {
    var fill = kbAdd(contents, "ADBE Vector Graphic - Fill");
    kbProp(fill, ["ADBE Vector Fill Color"]).setValue([o.fill[0], o.fill[1], o.fill[2], 1]);
    if (o.evenodd) kbProp(fill, ["ADBE Vector Fill Rule"]).setValue(2);
  }
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0]);
  return layer;
}

/**
 * Тело плашки: Solid цвета с маской-путём (Add) и вырезом (Subtract) + волокно Fractal Noise Multiply; размер Solid с запасом на выпуклости края.
 * Слой помечен комментарием tl-plate-fill (tlPlateFills).
 * @param {CompItem} comp
 * @param {{name: string, w: number, h: number, color: number[], path: Shape, hole?: Shape|null, margin?: number, seed?: number}} o
 * @returns {AVLayer}
 */
function tlPlateBody(comp, o) {
  var m = o.margin === undefined ? 6 : o.margin;
  var sw = Math.ceil(o.w + 2 * m);
  var sh = Math.ceil(o.h + 2 * m);
  var layer = comp.layers.addSolid(/** @type {any} */ (o.color), o.name, sw, sh, 1, comp.duration);
  layer.comment = "tl-plate-fill";
  var masks = kbGroup(layer, ["ADBE Mask Parade"]);
  var add = /** @type {MaskPropertyGroup} */ (kbAdd(masks, "ADBE Mask Atom")); // ae-ok: matchname
  add.maskMode = MaskMode.ADD;
  kbProp(add, ["ADBE Mask Shape"]).setValue(tlpShift(o.path, sw / 2, sh / 2)); // ae-ok: matchname
  if (o.hole) {
    var sub = /** @type {MaskPropertyGroup} */ (kbAdd(masks, "ADBE Mask Atom")); // ae-ok: matchname
    sub.maskMode = MaskMode.SUBTRACT;
    kbProp(sub, ["ADBE Mask Shape"]).setValue(tlpShift(o.hole, sw / 2, sh / 2)); // ae-ok: matchname
  }
  tlpGrain(layer, o.seed === undefined ? TL_PLATE_LOOK.grain.seed : o.seed);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0]);
  return layer;
}

/**
 * Кант: A — мягкая обводка soft 3 px, кипение на двойках (amount 1); B — светлый резаный край 1,4 px.
 * @param {CompItem} comp
 * @param {string} name
 * @param {Shape[]} paths
 * @param {string} edge "A" | "B"
 * @param {number} seed
 * @param {boolean=} thin A: тонкая (отверстие, 1,5 px)
 * @returns {ShapeLayer}
 */
function tlPlateEdge(comp, name, paths, edge, seed, thin) {
  var L = TL_PLATE_LOOK;
  var layer;
  if (edge === "B") {
    layer = tlpShapeLayer(comp, name, paths, { stroke: L.edgeB.color, width: L.edgeB.width });
  } else {
    layer = tlpShapeLayer(comp, name, paths, { stroke: tlpPal().soft, width: thin ? L.edgeA.holeWidth : L.edgeA.width });
    tlBoilTwos(layer, { amount: L.edgeA.boil, size: L.edgeA.boilSize, seed: seed });
  }
  return layer;
}

/**
 * Две тени: cast (ink 12 %, смещение (6, 10), Gaussian 12) и contact (ink 18 %, (0, 2), Gaussian 2). Форма та же, у ярлыка — с отверстием (even-odd).
 * @param {CompItem} comp
 * @param {string} name
 * @param {Shape[]} paths
 * @returns {{cast: ShapeLayer, contact: ShapeLayer}}
 */
function tlPlateShadow(comp, name, paths) {
  var L = TL_PLATE_LOOK;
  var ink = tlpPal().ink;
  var specs = [["cast", L.cast], ["contact", L.contact]];
  var res = { cast: null, contact: null };
  for (var i = 0; i < 2; i++) {
    var sp = specs[i][1];
    var layer = tlpShapeLayer(comp, name + "-shadow-" + specs[i][0], paths, { fill: ink, evenodd: paths.length > 1 });
    var fx = kbEffect(layer, "ADBE Gaussian Blur 2");
    kbProp(fx, ["ADBE Gaussian Blur 2-0001"]).setValue(sp.blur);
    kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([sp.dx, sp.dy]);
    kbProp(layer, ["ADBE Transform Group", "ADBE Opacity"]).setValue(sp.opacity);
    res[specs[i][0]] = layer;
  }
  kbLog("SHADOW " + name + " cast " + L.cast.opacity + " (" + L.cast.dx + "," + L.cast.dy + ") " + L.cast.blur + " contact " + L.contact.opacity + " (" + L.contact.dx + "," + L.contact.dy + ") " + L.contact.blur);
  return res;
}

/**
 * Текст — ребёнок пустышки: tlTextAt в координатах кадра (пустышка без поворота), затем под пустышку.
 * @param {CompItem} comp
 * @param {any} p плашка (root, rx, ry)
 * @param {{text: string, font: string, size: number, color: number[], lx: number, lbase: number, name: string}} o lx — центр чернил по x, lbase — базовая линия, в системе пустышки
 * @returns {TextLayer}
 */
function tlpText(comp, p, o) {
  var l = tlTextAt(comp, { text: o.text, font: o.font, size: o.size, color: /** @type {any} */ (o.color), x: p.rx + o.lx, baseline: p.ry + o.lbase, name: o.name });
  if (p.threeD) l.threeDLayer = true; // сторона ярлыка: 3D до смены родителя (2D-слой под 3D-родителем не следует за его поворотом)
  tlpAdopt(l, p.host || p.root, p.rx, p.ry);
  p.text.push(l);
  p.layers.push(l);
  return l;
}

/**
 * Общая часть тела предмета: тень → тело → кант (и отверстие у ярлыка), всё детьми пустышки.
 * @param {CompItem} comp
 * @param {any} p
 * @param {{path: any, hole?: Shape|null, color: number[], edge: string, seed: number, shadow?: boolean, margin?: number}} o
 */
function tlpObject(comp, p, o) {
  var name = p.name;
  var host = p.host || p.root;
  var kids = [];
  var paths = [o.path.shape];
  if (o.hole) paths.push(o.hole);
  if (o.shadow !== false) {
    var sh = tlPlateShadow(comp, name, paths);
    p.shadow = sh;
    if (p.threeD) { sh.cast.threeDLayer = true; sh.contact.threeDLayer = true; }
    tlpAdopt(sh.cast, host, p.rx, p.ry, true);
    tlpAdopt(sh.contact, host, p.rx, p.ry, true);
    p.layers.push(sh.cast, sh.contact);
    kids.push(sh.cast, sh.contact);
  }
  // размер Solid — по границам контура (хвост выноски выступает за рамку плашки), симметрично относительно центра плашки
  var bw = p.W, bh = p.H;
  for (var vi = 0; vi < o.path.verts.length; vi++) {
    bw = Math.max(bw, 2 * Math.abs(o.path.verts[vi][0]));
    bh = Math.max(bh, 2 * Math.abs(o.path.verts[vi][1]));
  }
  var body = tlPlateBody(comp, { name: name + "-body", w: bw, h: bh, color: o.color, path: o.path.shape, hole: o.hole, margin: (o.margin === undefined ? 6 : o.margin) + o.path.dmax, seed: TL_PLATE_LOOK.grain.seed });
  if (p.threeD) body.threeDLayer = true;
  tlpAdopt(body, host, p.rx, p.ry, true);
  p.body = body;
  p.layers.push(body);
  kids.push(body);
  var edge = tlPlateEdge(comp, name + "-edge", [o.path.shape], o.edge, o.seed, false);
  if (p.threeD) edge.threeDLayer = true;
  tlpAdopt(edge, host, p.rx, p.ry, true);
  p.edge = edge;
  p.layers.push(edge);
  kids.push(edge);
  if (o.hole) {
    var he = tlPlateEdge(comp, name + "-hole", [o.hole], o.edge, o.seed + 1, true);
    if (p.threeD) he.threeDLayer = true;
    tlpAdopt(he, host, p.rx, p.ry, true);
    p.extra.hole = he;
    p.layers.push(he);
    kids.push(he);
  }
  p.kids = kids;
  if (!p.host) tlpPlateNull(comp, p, kids); // сторона ярлыка (host) — под общей пустышкой plate ярлыка
}

/**
 * Пустышка plate (spec §4.1): ребёнок root в его нуле; под ней тени, тело, кант и дырка — масштаб grow/out считается от неё, текст в неё не входит.
 * Значения слоёв остаются (setParentWithJump), пустышка в нуле root: кадр не меняется.
 * @param {CompItem} comp
 * @param {any} p
 * @param {Layer[]} kids
 */
function tlpPlateNull(comp, p, kids) {
  var pl = tlpNull(comp, p.name + "-plate", 0, 0);
  pl.setParentWithJump(p.root);
  for (var i = 0; i < kids.length; i++) kids[i].setParentWithJump(pl);
  p.plate = pl;
  p.layers.push(pl);
}

/**
 * Начальный объект плашки.
 * @param {CompItem} comp
 * @param {any} o
 * @param {number} W
 * @param {number} H
 * @param {number} x
 * @param {number} y
 * @returns {any}
 */
function tlpNew(comp, o, W, H, x, y) {
  var root = tlpNull(comp, o.name, x, y);
  return { name: o.name, kind: o.kind, root: root, rx: x, ry: y, W: W, H: H, text: [], extra: {}, layers: [root], fill: false, shadow: null, body: null, edge: null, plate: null };
}

/**
 * Поворот пустышки в конце сборки (дети уже под ней).
 * @param {any} p
 * @param {number} tilt
 */
function tlpTilt(p, tilt) {
  kbProp(p.root, ["ADBE Transform Group", "ADBE Rotate Z"]).setValue(tilt || 0);
}

/**
 * Журнал PLATE.
 * @param {any} p
 * @param {any} o
 * @param {string} variant
 * @param {string} edge
 */
function tlpLog(p, o, variant, edge) {
  kbLog("PLATE " + p.name + " kind " + o.kind + " variant " + variant + " edge " + edge + " at (" + p.rx.toFixed(1) + ", " + p.ry.toFixed(1) + ") tilt " + (o.tilt || 0) +
    " W " + p.W.toFixed(1) + " H " + p.H.toFixed(1) + " fill " + (p.fill ? 1 : 0));
  kbLog("LOOK " + p.name + " grain " + TL_PLATE_LOOK.grain.contrast + "/" + TL_PLATE_LOOK.grain.brightness + "/" + TL_PLATE_LOOK.grain.scale + "/" + TL_PLATE_LOOK.grain.complexity +
    " seed " + TL_PLATE_LOOK.grain.seed + " edge " + edge);
}

// ---------------------------------------------------------------------------------------------------------------------
// Подгон под текст (spec §4.2)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Подгон плашки под строки (мерить до аниматоров): W = max ширин чернил + поля; H = Σ(cap) + межстрочные + padTop + padBot, где padTop = max(padY, бреве + 0,06·S),
 * padBot = max(padY, выносной + 0,06·S); межстрочный = max(заданный, desc_i + top_{i+1} + 0,08·S). Длинное слово: кегль снижается до maxW,
 * ниже minSize — перенос на 2 строки (если есть пробел), иначе исключение «plate <kind>: «<слово>» не влезает».
 * @param {CompItem} comp
 * @param {{kind: string, font: string, size: number, lines: string[], maxW?: number, minSize?: number, padL: number, padR: number, padY: number, lead?: number, extraW?: number}} o
 *   padL, padR, padY — в em; extraW — ширина сверх (отверстие ярлыка), px
 * @returns {{S: number, lines: string[], ink: any[], W: number, H: number, padTop: number, padBot: number, gaps: number[], cap: number, textW: number}}
 */
function tlPlateFit(comp, o) {
  var maxW = o.maxW === undefined ? 840 : o.maxW;
  var minSize = o.minSize === undefined ? 0 : o.minSize;
  var S = o.size;
  var lines = o.lines;
  var met = tlpMetrics(comp, o.font);
  var ink, i, textW;
  var tryFit = function (ls, size) {
    var res = [];
    var wmax = 0;
    for (var k = 0; k < ls.length; k++) {
      var li = tlpLine(comp, ls[k], o.font, size);
      res.push(li);
      if (li.w > wmax) wmax = li.w;
    }
    return { ink: res, w: wmax };
  };
  var f = tryFit(lines, S);
  var fixed = function (size) {
    return (o.padL + o.padR) * size + (o.extraW || 0);
  };
  if (f.w + fixed(S) > maxW) {
    var S2 = Math.floor(S * (maxW - fixed(S)) / f.w);
    kbLog("INFO plate fit «" + lines.join(" / ") + "» S→" + S2);
    if (S2 < minSize && lines.length === 1 && lines[0].indexOf(" ") > 0) {
      // перенос на 2 строки по минимуму более длинной
      var words = lines[0].split(" ");
      var best = null, bestW = 1e9;
      for (i = 1; i < words.length; i++) {
        var a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
        var fa = tryFit([a, b], S);
        if (fa.w < bestW) { bestW = fa.w; best = [a, b]; }
      }
      lines = best;
      f = tryFit(lines, S);
      if (f.w + fixed(S) > maxW) {
        S = Math.floor(S * (maxW - fixed(S)) / f.w);
        f = tryFit(lines, S);
      }
    } else {
      S = S2;
      if (S < minSize) throw new Error("plate " + o.kind + ": «" + lines[0] + "» не влезает (" + Math.round(f.w + fixed(o.size)) + " > " + maxW + ")");
      f = tryFit(lines, S);
    }
  }
  ink = f.ink;
  textW = f.w;
  var cap = met.cap * S;
  var breve = Math.max(0, ink[0].top - cap);
  var desc = Math.max(0, ink[ink.length - 1].bot);
  var padTop = Math.max(o.padY * S, breve + 0.06 * S);
  var padBot = Math.max(o.padY * S, desc + 0.06 * S);
  var gaps = [];
  var H = padTop + cap + padBot;
  for (i = 0; i + 1 < ink.length; i++) {
    var dist = Math.max(o.lead === undefined ? 0 : o.lead * S, Math.max(0, ink[i].bot) + ink[i + 1].top + 0.08 * S);
    gaps.push(dist);
    H += dist;
  }
  var W = f.w + fixed(S);
  kbLog("PLATEFIT " + o.kind + " S " + S + " lines «" + lines.join(" / ") + "» W " + W.toFixed(1) + " H " + H.toFixed(1) + " pads L/R/T/B " +
    (o.padL * S).toFixed(1) + "/" + (o.padR * S).toFixed(1) + "/" + padTop.toFixed(1) + "/" + padBot.toFixed(1));
  return { S: S, lines: lines, ink: ink, W: W, H: H, padTop: padTop, padBot: padBot, gaps: gaps, cap: cap, textW: textW };
}

// ---------------------------------------------------------------------------------------------------------------------
// Построители типов
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Камера 3D-ярлыков (решение 17.10, spec §2): слой-камера `tl-cam` с zoom TL_PLATE_LOOK.persp.zoom, позиция (центр кадра, −zoom), цель в центре кадра.
 * Штатная камера (zoom 1500) на x ≈ 440 (99 px от оси) давала ребро ярлыка 21 px и ширину 0,823·W вместо 0,871·W; длинное фокусное снимает перспективу.
 * Слой уходит в самый низ (индексы остальных слоёв прежние). Идемпотентна: если в композиции уже есть камера — ничего не делает (поправки tlpPersp/tlpInk считаются по TL_PLATE_LOOK.persp.zoom).
 * @param {CompItem} comp
 * @returns {CameraLayer}
 */
function tlPlateCamera(comp) {
  for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i) instanceof CameraLayer) return /** @type {CameraLayer} */ (comp.layer(i));
  var z = TL_PLATE_LOOK.persp.zoom;
  var cam = comp.layers.addCamera("tl-cam", [comp.width / 2, comp.height / 2]);
  kbProp(cam, ["ADBE Camera Options Group", "ADBE Camera Zoom"]).setValue(z);
  kbProp(cam, ["ADBE Transform Group", "ADBE Position"]).setValue([comp.width / 2, comp.height / 2, -z]);
  cam.moveToEnd(); // в самый низ: индексы остальных слоёв не меняются, а wiggle в hold-alive зависит от индекса слоя (иначе дыхание слов уходит на 0,1–0,2 px)
  kbLog("CAMERA " + comp.name + " zoom " + z);
  return cam;
}

/**
 * Ярлык «поверх слова»: текст, кегль и положение чернил берутся из слоя окончания (spec §5.5): ярлык стоит точно на глифах, текст = глифам ± 0,5 px.
 * Слой — текстовый, без поворота и масштаба (замер до аниматоров); o.text не задан — берётся текст слоя.
 * @param {any} o {over: TextLayer, text?, size?, x?, y?} — дописываются text, size, x, y, at
 */
function tlpOver(o) {
  var l = o.over;
  var ink = tlpInk(l, 0);
  if (o.text === undefined && !o.sides) o.text = kbProp(l, ["ADBE Text Properties", "ADBE Text Document"]).value.text;
  if (o.size === undefined && !o.sides) o.size = tlFontSize(l);
  o.x = ink.cx;
  o.y = ink.base;
  o.at = "text";
}

/**
 * Два слоя ярлыка (spec §4.3.1, §5.6): сторона KK (охра) и сторона EN (синяя) — пустышки side-kk, side-en в 3D под общей plate; их дети 3D по z:
 * тень +2, тело 0, кант −1, дырка −1,5, текст −2. Начало каждой стороны — центр ярлыка (одна вертикальная ось rotationY для обеих), сторона EN
 * в покое ребром (rotationY −90) и прозрачна. o: {sides: {kk, en}, sizes: {kk, en}, x, y (центр стороны KK; при at "text" — центр чернил и база KK), tilt, edge}
 * @param {CompItem} comp
 * @param {any} o
 * @returns {any}
 */
function tlpTagSides(comp, o) {
  var P = tlpPal();
  var F = tlpFonts();
  var edge = o.edge || "A";
  var keys = ["kk", "en"];
  var geo = {};
  tlPlateCamera(comp);
  var ki, key;
  for (ki = 0; ki < 2; ki++) {
    key = keys[ki];
    var fit = tlPlateFit(comp, { kind: "tag", font: F.word, size: o.sizes[key], lines: [o.sides[key]], padL: 0.06, padR: 0.42, padY: 0.20, extraW: 14, maxW: 840, minSize: o.sizes[key] });
    geo[key] = { fit: fit, W: fit.W, H: fit.H, textCx: -fit.W / 2 + 0.06 * fit.S + fit.ink[0].w / 2, base: -fit.H / 2 + fit.padTop + fit.cap };
  }
  var x = o.x, y = o.y;
  if (o.at === "text") { x = o.x - geo.kk.textCx; y = o.y - geo.kk.base; }
  var p = tlpNew(comp, o, geo.kk.W, geo.kk.H, x, y);
  var pl = tlpNull(comp, o.name + "-plate", 0, 0);
  pl.setParentWithJump(p.root);
  p.plate = pl;
  p.layers.push(pl);
  p.fill = true;
  p.sides = {};
  p.active = "kk";
  p.ops = [];
  p.sideGeo = geo;
  for (ki = 0; ki < 2; ki++) {
    key = keys[ki];
    var g = geo[key];
    var sn = comp.layers.addNull();
    sn.name = o.name + "-side-" + key;
    sn.threeDLayer = true;
    kbProp(sn, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0, 0]);
    kbProp(sn, ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0, 0]);
    sn.setParentWithJump(pl);
    var sp = { name: o.name + "-" + key, kind: "tag", root: p.root, rx: x, ry: y, W: g.W, H: g.H, text: [], extra: {}, layers: [sn], fill: true, shadow: null, body: null, edge: null, plate: null,
      threeD: true, host: sn };
    var path = tlPlatePath({ w: g.W, h: g.H, r: TL_PLATES.tag.r, seed: o.seed ? o.seed + ki : 3 + ki, name: sp.name });
    var hole = tlpCircle(g.W / 2 - (0.12 * g.fit.S + 7), 0, 7);
    var color = key === "en" ? P.en : P.kk;
    tlpObject(comp, sp, { path: path, hole: hole, color: color, edge: edge, seed: o.seed ? o.seed + ki : 3 + ki });
    kbLog("TAGHOLE " + sp.name + " d 14 centre fromRight " + (0.12 * g.fit.S + 7).toFixed(2) + " y 0 textInk " + (g.textCx - g.fit.ink[0].w / 2).toFixed(2) + ".." + (g.textCx + g.fit.ink[0].w / 2).toFixed(2));
    tlpText(comp, sp, { text: o.sides[key], font: F.word, size: g.fit.S, color: P.paper, lx: g.textCx, lbase: g.base, name: sp.name + "-text" });
    // z по слоям (отрицательный Z — к камере): тень +2, тело 0, кант −1, дырка −1,5, текст −2
    tlpZ(sp.shadow.cast, 2);
    tlpZ(sp.shadow.contact, 2);
    tlpZ(sp.body, 0);
    tlpZ(sp.edge, -1);
    tlpZ(sp.extra.hole, -1.5);
    tlpZ(sp.text[0], -2);
    sp.path = path;
    sp.S = g.fit.S;
    sp.inkW = g.fit.ink[0].w;
    sp.textCx = g.textCx;
    sp.base = g.base;
    sp.pads = { L: 0.06 * g.fit.S, R: 0.30 * g.fit.S, T: g.fit.padTop, B: g.fit.padBot };
    p.sides[key] = sp;
    for (var li = 0; li < sp.layers.length; li++) p.layers.push(sp.layers[li]);
    tlpOpsAdd(p, sp, key);
  }
  // сторона EN в покое — ребром и прозрачна (флип пишет ключи)
  kbProp(p.sides.en.layers[0], ["ADBE Transform Group", "ADBE Rotate Y"]).setValue(-90);
  for (var oi = 0; oi < p.ops.length; oi++) if (p.ops[oi].side === "en") kbProp(p.ops[oi].l, ["ADBE Transform Group", "ADBE Opacity"]).setValue(0);
  kbLog("SIDES axis kk (" + kbProp(p.sides.kk.layers[0], ["ADBE Transform Group", "ADBE Position"]).value[0].toFixed(1) + "," + kbProp(p.sides.kk.layers[0], ["ADBE Transform Group", "ADBE Position"]).value[1].toFixed(1) +
    ") en (" + kbProp(p.sides.en.layers[0], ["ADBE Transform Group", "ADBE Position"]).value[0].toFixed(1) + "," + kbProp(p.sides.en.layers[0], ["ADBE Transform Group", "ADBE Position"]).value[1].toFixed(1) + ")");
  p.S = geo.kk.fit.S;
  p.textCx = geo.kk.textCx;
  p.base = geo.kk.base;
  p.pads = p.sides.kk.pads;
  p.path = p.sides.kk.path;
  p.tip = null;
  tlpTilt(p, o.tilt);
  if (o.at === "text" && o.persp !== false) tlpPersp(p, "kk", 0);
  tlpLog(p, o, "kk+en", edge);
  return p;
}

/**
 * tag — бумажный ярлык окончания (spec §4.3.1): цветной картон, дырка Ø 14 справа, текст цветом бумаги по глифам окончания.
 * o: {text, side "kk"|"en", size, x, y, at? "center" | "text" (x, y — центр чернил текста и его база), tilt, edge}
 * @param {CompItem} comp
 * @param {any} o
 * @returns {any}
 */
function tlpTag(comp, o) {
  if (o.over) tlpOver(o);
  if (o.sides) return tlpTagSides(comp, o);
  var P = tlpPal();
  var F = tlpFonts();
  var S = o.size;
  var edge = o.edge || "A";
  var fit = tlPlateFit(comp, { kind: "tag", font: F.word, size: S, lines: [o.text], padL: 0.06, padR: 0.30 + 0.12, padY: 0.20, extraW: 14, maxW: 840, minSize: S }); // ярлык не сжимается: текст = глифам окончания (spec §4.10)
  var W = fit.W, H = fit.H;
  var textCx = -W / 2 + 0.06 * fit.S + fit.ink[0].w / 2;
  var base = -H / 2 + fit.padTop + fit.cap;
  var x = o.x, y = o.y;
  if (o.at === "text") { x = o.x - textCx; y = o.y - base; }
  var p = tlpNew(comp, o, W, H, x, y);
  var path = tlPlatePath({ w: W, h: H, r: TL_PLATES.tag.r, seed: o.seed || 3, name: o.name });
  var hole = tlpCircle(W / 2 - (0.12 * fit.S + 7), 0, 7);
  var color = o.side === "en" ? P.en : P.kk;
  p.fill = true;
  p.pads = { L: 0.06 * fit.S, R: 0.30 * fit.S, T: fit.padTop, B: fit.padBot };
  p.S = fit.S;
  p.textCx = textCx;
  p.base = base;
  p.inkW = fit.ink[0].w;
  tlpObject(comp, p, { path: path, hole: hole, color: color, edge: edge, seed: o.seed || 3 });
  kbLog("TAGHOLE " + o.name + " d 14 centre fromRight " + (0.12 * fit.S + 7).toFixed(2) + " y 0 textInk " + (textCx - fit.ink[0].w / 2).toFixed(2) + ".." + (textCx + fit.ink[0].w / 2).toFixed(2));
  tlpText(comp, p, { text: o.text, font: F.word, size: fit.S, color: P.paper, lx: textCx, lbase: base, name: o.name + "-text" });
  p.tip = null;
  p.path = path;
  tlpTilt(p, o.tilt);
  tlpLog(p, o, o.side, edge);
  return p;
}

/**
 * Roughen Edges на каждом слое внутри прекомпозиции оттиска (кольца/рамки, строки текста): эффект считается до размытия в движении и до трансформации внешнего слоя.
 * Border у всех слоёв общий (tlpInkBorder ключует их разом).
 * @param {CompItem} pre
 * @returns {any[]} слои с эффектом
 */
function tlpInkLayers(pre) {
  var out = [];
  for (var i = 1; i <= pre.numLayers; i++) {
    var l = /** @type {any} */ (pre.layer(i));
    kbInkEdge(l, TL_PLATE_LOOK.stampBorder);
    out.push(l);
  }
  return out;
}

/**
 * Свойства Roughen Border всех слоёв оттиска.
 * @param {any} p плашка-штамп
 * @returns {any[]}
 */
function tlpInkBorders(p) {
  var out = [];
  for (var i = 0; i < p.ink.length; i++) out.push(kbProp(kbGroup(p.ink[i], ["ADBE Effect Parade", "ADBE Roughen Edges"]), ["ADBE Roughen Edges-0002"])); // ae-ok: bpc
  return out;
}

/**
 * badge — штамп-оттиск без заливки (spec §4.3.3): прекомпозиция с рамками и текстом, Roughen Edges 3, Multiply 92 %, Collapse Transformations.
 * Решения владельца 16.10: A — прямоугольная рамка для правил («ҚЫСҚА / СӨЗДЕ ҒАНА», «SHORT WORDS / ONLY»), B — круглый мөр для «САҚТАП ҚОЙ» / «SAVE IT»
 * (role "save" → B, иначе A; явный variant сильнее); шрифт — печатный InterKB-Bold (в Caveat у Ғ нет перекладины, читается как F); пробел перед словом
 * на «Ғ» шире на 0,15 em (иначе «СӨЗДЕ ҒАНА» читается слитно).
 * o: {lines[], size, variant? "A"|"B", role? "rule"|"save", x, y, tilt, color?, font? (по умолчанию fonts.stamp || fonts.card = InterKB-Bold),
 *     wideBefore? (буквы, перед которыми пробел шире; по умолчанию TL_PLATE_LOOK.stampWide.chars), wideEm? (0,15)}
 * @param {CompItem} comp
 * @param {any} o
 * @returns {any}
 */
function tlpBadge(comp, o) {
  var P = tlpPal();
  var F = tlpFonts();
  var S = o.size;
  var variant = o.variant || (o.role === "save" ? "B" : "A");
  var color = o.color || P.ink;
  var font = o.font || F.stamp || F.card;
  var lines = o.lines;
  var wideSet = o.wideBefore === undefined ? TL_PLATE_LOOK.stampWide.chars : o.wideBefore;
  var wideEm = o.wideEm === undefined ? TL_PLATE_LOOK.stampWide.em : o.wideEm;
  var ink = [], wide = [];
  var i, w = 0;
  for (i = 0; i < lines.length; i++) {
    var li = tlpLine(comp, lines[i], font, S);
    ink.push(li);
    var words = lines[i].split(" ");
    var extra = 0;
    for (var wj = 1; wj < words.length; wj++) if (tlpWideWord(words[wj], wideSet)) extra += wideEm * S;
    wide.push({ words: words, extra: extra });
    if (extra) kbLog("BADGE " + o.name + " line " + i + " wide space before «" + wideSet + "» +" + extra.toFixed(1) + " px (" + wideEm + " em)");
    if (li.w + extra > w) w = li.w + extra;
  }
  var gaps = [];
  var h = ink[0].top + ink[ink.length - 1].bot;
  for (i = 0; i + 1 < ink.length; i++) {
    var dist = Math.max(0.95 * S, Math.max(0, ink[i].bot) + ink[i + 1].top + 0.08 * S);
    gaps.push(dist);
    h += dist;
  }
  // h: от верха чернил первой строки до низа чернил последней (top1 + Σdist + bot_last)
  var wOut = 4, wIn = TL_PLATE_LOOK.stampInner;
  var shift = 8.75; // осевая внешней дальше осевой внутренней: 6 + (4 + 1,5) / 2 по спеке; константа, чтобы габарит штампа (Ø 228,8, geom5.py) не зависел от толщины внутренней линии
  var gap = shift - (wOut + wIn) / 2; // осевая внешней рамки дальше осевой внутренней
  var innerW, innerH, outW, outH, D;
  if (variant === "B") {
    D = Math.sqrt(w * w + h * h) + 2 * 0.25 * S;
    innerW = D; innerH = D;
    outW = D + 2 * shift; outH = outW;
  } else {
    innerW = w + 2 * 0.35 * S;
    innerH = h + 2 * 0.35 * S;
    outW = innerW + 2 * shift;
    outH = innerH + 2 * shift;
  }
  var pad = 22 + 7 + 3 + 4;
  var cw = Math.ceil(outW + 2 * pad);
  var ch = Math.ceil(outH + 2 * pad);
  var pre = app.project.items.addComp("badge-" + o.name, cw, ch, 1, comp.duration, 30); // длительность = композиции: слой не обрывается через секунду
  pre.bgColor = [0, 0, 0];
  pre.motionBlur = false;
  var cx = cw / 2, cy = ch / 2;
  var seed = o.seed || 5;
  var layers = [];
  if (variant === "B") {
    layers.push(tlpShapeLayer(pre, "ring-out", [tlpRing(outW / 2, 1, seed)], { stroke: color, width: wOut }));
    layers.push(tlpShapeLayer(pre, "ring-in", [tlpRing(innerW / 2, 1, seed + 1)], { stroke: color, width: wIn }));
  } else {
    layers.push(tlpShapeLayer(pre, "frame-out", [tlPlatePath({ w: outW, h: outH, r: TL_PLATES.badge.r, seed: seed, rough: 1, name: o.name + "-out" }).shape], { stroke: color, width: wOut }));
    layers.push(tlpShapeLayer(pre, "frame-in", [tlPlatePath({ w: innerW, h: innerH, r: 6, seed: seed + 1, rough: 1, name: o.name + "-in" }).shape], { stroke: color, width: wIn }));
  }
  for (i = 0; i < layers.length; i++) kbProp(layers[i], ["ADBE Transform Group", "ADBE Position"]).setValue([cx, cy]);
  var top0 = cy - h / 2;
  var base = top0 + ink[0].top;
  for (i = 0; i < lines.length; i++) {
    var wl = wide[i];
    if (!wl.extra) {
      tlTextAt(pre, { text: lines[i], font: font, size: S, color: /** @type {any} */ (color), x: cx, baseline: base, name: "line" + i });
    } else {
      // слова строки отдельными слоями: чернила по замеру префиксов (кернинг как в целой строке) + расширенный пробел перед словом на «Ғ»
      var left = cx - (ink[i].w + wl.extra) / 2;
      var pref = "", acc = 0;
      for (var wi = 0; wi < wl.words.length; wi++) {
        pref += (wi > 0 ? " " : "") + wl.words[wi];
        if (wi > 0 && tlpWideWord(wl.words[wi], wideSet)) acc += wideEm * S;
        var wp = tlpLine(comp, wl.words[wi], font, S).w;
        var wc = tlpLine(comp, pref, font, S).w;
        tlTextAt(pre, { text: wl.words[wi], font: font, size: S, color: /** @type {any} */ (color), x: left + wc - wp / 2 + acc, baseline: base, name: "line" + i + "w" + wi });
      }
    }
    if (i < gaps.length) base += gaps[i];
  }
  // слой в кадре
  var p = tlpNew(comp, o, outW, outH, o.x, o.y);
  var lay = comp.layers.add(pre);
  lay.name = o.name + "-print";
  lay.collapseTransformation = false;
  // Roughen Edges — на слоях внутри прекомпозиции (до размытия в движении внешнего слоя): на самом слое оттиска с Collapse он порогом съедал
  // размытые края и рвал тонкие выносные элементы (хвост Қ) на подъёме peel — master ячейки F, к. 47 и 54 (17.10)
  p.ink = tlpInkLayers(pre);
  lay.blendingMode = BlendingMode.MULTIPLY;
  kbProp(lay, ["ADBE Transform Group", "ADBE Opacity"]).setValue(92);
  kbProp(lay, ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0]);
  tlpAdopt(lay, p.root, p.rx, p.ry, true);
  p.layers.push(lay);
  p.body = lay;
  p.extra.badge = pre;
  p.fill = false;
  p.S = S;
  p.inner = [innerW, innerH];
  p.block = [w, h];
  p.variant = variant;
  p.seed = seed;
  p.pre = pre;
  p.preC = [cx, cy];
  p.print = lay;
  kbLog("PLATEFIT badge S " + S + " lines «" + lines.join(" / ") + "» block " + w.toFixed(1) + "×" + h.toFixed(1) + " " + variant + " inner " + innerW.toFixed(1) + "×" + innerH.toFixed(1) +
    " outer " + outW.toFixed(1) + "×" + outH.toFixed(1) + " gaps " + gaps.join(","));
  tlpTilt(p, o.tilt);
  tlpLog(p, o, variant, "-");
  return p;
}

/**
 * callout — выноска персонажа, ≤ 3 слов (spec §4.3.4). A — бумажная наклейка с хвостом (заливка, тень); B — контур от руки без заливки (tlHandPath).
 * В lesson вариант B строится как A (INFO). o: {text, size, variant, x, y, tilt, target [x, y] (в кадре), edge}
 * @param {CompItem} comp
 * @param {any} o
 * @returns {any}
 */
function tlpCallout(comp, o) {
  var P = tlpPal();
  var F = tlpFonts();
  var S = o.size;
  var variant = o.variant || "A";
  var edge = o.edge || "A";
  var words = o.text.split(" ");
  if (words.length > 3) throw new Error("callout: ≤ 3 слов («" + o.text + "»)");
  if (variant === "B" && TL_S.name === "lesson") {
    kbLog("INFO plate callout B→A (lesson: рисующиеся линии запрещены)");
    variant = "A";
  }
  var ln = tlpLine(comp, o.text, F.hand, S);
  var pad = 0.40 * S;
  var W = ln.w + 2 * pad;
  var H = ln.top + ln.bot + 2 * pad;
  var r = variant === "B" ? 34 : TL_PLATES.callout.r;
  var p = tlpNew(comp, o, W, H, o.x, o.y);
  // цель в системе плашки (до поворота пустышки; поворот −2° у A хвост не сдвигает заметно, но цель считаем с его учётом)
  var tilt = o.tilt || 0;
  var ang = -tilt * Math.PI / 180;
  var dx0 = o.target[0] - o.x, dy0 = o.target[1] - o.y;
  var tgt = [dx0 * Math.cos(ang) - dy0 * Math.sin(ang), dx0 * Math.sin(ang) + dy0 * Math.cos(ang)];
  var textCx = 0;
  var base = -(ln.top + ln.bot) / 2 + ln.top;
  p.S = S;
  if (variant === "A") {
    var path = tlPlatePath({ w: W, h: H, r: r, seed: o.seed || 4, tail: { target: tgt }, name: o.name });
    p.fill = true;
    p.tip = path.tip;
    p.path = path;
    tlpObject(comp, p, { path: path, color: tlpPaperK(1.02), edge: edge, seed: o.seed || 4 });
    tlpText(comp, p, { text: o.text, font: F.hand, size: S, color: P.ink, lx: textCx, lbase: base, name: o.name + "-text" });
  } else {
    var wk = tlpWalk({ w: W, h: H, r: r, step: 9, tail: { target: tgt } });
    // начать у кончика, замкнуть за 6 px до него; острые вершины хвоста — дублированными точками (tlHandPath сглаживает точки сам)
    var n = wk.pts.length;
    var f1 = 2 * Math.PI * tlpNoise(1, o.seed || 4), f2 = 2 * Math.PI * tlpNoise(2, o.seed || 4), f3 = 2 * Math.PI * tlpNoise(3, o.seed || 4);
    var sacc = 0, i;
    var prevP = wk.pts[0].p;
    var pts = [];
    for (i = 0; i < n; i++) {
      var q = wk.pts[(wk.tailIdx + i) % n];
      if (i > 0) sacc += Math.sqrt(Math.pow(q.p[0] - prevP[0], 2) + Math.pow(q.p[1] - prevP[1], 2));
      prevP = q.p;
      var pp = q.p;
      if (!q.sharp) {
        var nb = wk.pts[(wk.tailIdx + i + 1) % n].p, pb = wk.pts[(wk.tailIdx + i + n - 1) % n].p;
        var ux = nb[0] - pb[0], uy = nb[1] - pb[1];
        var ul = Math.sqrt(ux * ux + uy * uy);
        var d = 3 * (0.5 * Math.sin(2 * Math.PI * sacc / 410 + f1) + 0.3 * Math.sin(2 * Math.PI * sacc / 170 + f2) + 0.2 * Math.sin(2 * Math.PI * sacc / 97 + f3));
        pp = [q.p[0] + uy / ul * d, q.p[1] - ux / ul * d];
      }
      pts.push(pp);
      if (q.sharp) pts.push([pp[0], pp[1]]);
    }
    // конец: за 6 px до кончика на последнем отрезке (основание → кончик)
    var tipP = wk.tip;
    var lastB = pts[pts.length - 1];
    var vx = tipP[0] - lastB[0], vy = tipP[1] - lastB[1];
    var vl = Math.sqrt(vx * vx + vy * vy);
    pts.push([tipP[0] - vx / vl * 6, tipP[1] - vy / vl * 6]);
    p.fill = false;
    p.tip = wk.tip;
    var hp = tlHandPath(comp, { name: o.name + "-line", points: /** @type {any} */ (pts), color: /** @type {any} */ (P.ink), thickness: 6, start: 0, frames: 9, ease: "snap", taper: true, rough: true, boil: true, parent: p.root, seed: o.seed || 4 });
    p.layers.push(hp);
    p.extra.line = hp;
    p.path = { n: pts.length, tip: wk.tip, dmax: 3 };
    kbLog("PLATEPATH " + o.name + " n " + pts.length + " dmax 3.000 r " + r + " step 9 B");
    tlpText(comp, p, { text: o.text, font: F.hand, size: S, color: P.ink, lx: textCx, lbase: base, name: o.name + "-text" });
  }
  tlpTilt(p, tilt);
  kbLog("PLATEFIT callout S " + S + " «" + o.text + "» ink " + ln.w.toFixed(1) + "×" + (ln.top + ln.bot).toFixed(1) + " box " + W.toFixed(1) + "×" + H.toFixed(1) + " pad " + pad.toFixed(1) + " tip " +
    (p.tip ? p.tip[0].toFixed(1) + "," + p.tip[1].toFixed(1) : "-"));
  tlpLog(p, o, variant, variant === "A" ? edge : "-");
  return p;
}

/**
 * Две строки-слов карточки: части (стебель + окончание) со своими цветами; кернинг по замеру префиксов, как tlAfter.
 * @param {CompItem} comp
 * @param {any} p
 * @param {{parts: {text: string, color: number[], sp?: boolean}[], font: string, size: number, left: number, lbase: number, name: string}} o left — левый край чернил, система плашки
 * @returns {{w: number}}
 */
function tlpRowParts(comp, p, o) {
  var i;
  var whole = "";
  for (i = 0; i < o.parts.length; i++) whole += (i > 0 && o.parts[i].sp ? " " : "") + o.parts[i].text;
  var W = kbTextMeasure(comp, { text: whole, font: o.font, size: o.size }).width;
  var pref = "";
  for (i = 0; i < o.parts.length; i++) {
    pref += (i > 0 && o.parts[i].sp ? " " : "") + o.parts[i].text;
    var wp = kbTextMeasure(comp, { text: o.parts[i].text, font: o.font, size: o.size }).width;
    var wc = kbTextMeasure(comp, { text: pref, font: o.font, size: o.size }).width;
    var left = o.left + wc - wp;
    tlpText(comp, p, { text: o.parts[i].text, font: o.font, size: o.size, color: o.parts[i].color, lx: left + wp / 2, lbase: o.lbase, name: o.name + " p" + i });
  }
  return { w: W };
}

/**
 * card — карточка (spec §4.3.5): бумага ×0,97, тень, край системы, скотч сверху. Режимы:
 * word — EN (основа ink + окончание en), транскрипция (необязательна), KK (основа ink + окончание kk), три строки по центру;
 * sheet — шпаргалка, окончания столбцами (EN-основа | EN-окончание · KK-основа | KK-окончание).
 * o word: {rows: {en: [stem, suf], ipa?: string, kk: [stem, suf], sizes: [en, ipa, kk]}, maxW}; o sheet: {rows: [{en: [stem, suf], kk: [stem, suf]}], size, room?}
 * room (sheet, px, по умолчанию 0) — пустое поле под строками (место под мөр на карточке, spec stream5 §8.4 F, 17.10): H += room, строки остаются у верха.
 * @param {CompItem} comp
 * @param {any} o
 * @returns {any}
 */
function tlpCard(comp, o) {
  var P = tlpPal();
  var F = tlpFonts();
  var edge = o.edge || "A";
  var mode = o.mode || "word";
  var MET = tlpMetrics(comp, F.word);
  var maxW = o.maxW === undefined ? 840 : o.maxW;
  /** @type {any} */
  var plan = null;
  var W, H, i;
  var cols = null;
  if (mode === "word") {
    var R = o.rows;
    var sz = [R.sizes[0], R.sizes[1], R.sizes[2]];
    var enText = R.en[0] + (R.enSp ? " " : "") + R.en[1];
    var kkText = R.kk[0] + (R.kkSp ? " " : "") + R.kk[1];
    var wEn = tlpLine(comp, enText, F.word, sz[0]);
    // длинное слово: подгон кегля EN-строки под maxW (поля 56)
    if (wEn.w > maxW - 112) {
      var s2 = Math.floor(sz[0] * (maxW - 112) / wEn.w);
      kbLog("INFO plate fit «" + enText + "» S→" + s2);
      if (s2 < 64) throw new Error("plate card: «" + enText + "» не влезает (" + Math.round(wEn.w + 112) + " > " + maxW + ")");
      sz[0] = s2;
      wEn = tlpLine(comp, enText, F.word, sz[0]);
    }
    var wKk = tlpLine(comp, kkText, F.card, sz[2]);
    if (wKk.w > maxW - 112) {
      var s3 = Math.floor(sz[2] * (maxW - 112) / wKk.w);
      kbLog("INFO plate fit «" + kkText + "» S→" + s3);
      if (s3 < 56) throw new Error("plate card: «" + kkText + "» не влезает (" + Math.round(wKk.w + 112) + " > " + maxW + ")");
      sz[2] = s3;
      wKk = tlpLine(comp, kkText, F.card, sz[2]);
    }
    var wIp = R.ipa ? tlpLine(comp, R.ipa, F.handLight, sz[1]) : null;
    var wmax = Math.max(wEn.w, wKk.w, wIp ? wIp.w : 0);
    W = wmax + 2 * 56;
    var gapA = 0.30 * sz[0];
    var gapB = 0.25 * sz[2];
    // вертикаль: верх чернил EN → низ чернил EN → зазор → [IPA] → зазор → KK
    H = 48 + wEn.top + Math.max(0, wEn.bot);
    var yBaseEn = -1, yBaseIp = -1, yBaseKk = -1;
    var cur = 48 + wEn.top; // база EN от верха карточки
    yBaseEn = cur;
    cur += Math.max(0, wEn.bot);
    if (wIp) {
      cur += gapA + wIp.top;
      yBaseIp = cur;
      cur += Math.max(0, wIp.bot) + gapB;
    } else {
      cur += gapA;
    }
    cur += wKk.top;
    yBaseKk = cur;
    cur += Math.max(0, wKk.bot) + 48;
    H = cur;
    plan = { sz: sz, wEn: wEn, wKk: wKk, wIp: wIp, yEn: yBaseEn, yIp: yBaseIp, yKk: yBaseKk, R: R };
  } else {
    var rows = o.rows;
    var S = o.size;
    var s0 = S / 58.5 < 1 ? S / 58.5 : 1; // поля и шаг строк пропорциональны кеглю шпаргалки меньше рилсовского (≈ 58,5 при 840)
    var enStem = 0, enSuf = 0, kkStem = 0, kkSuf = 0;
    var meas = [];
    for (i = 0; i < rows.length; i++) {
      var a = {};
      var ws = tlpLine(comp, rows[i].en[0], F.word, S).w, wf = tlpLine(comp, rows[i].en[1], F.word, S).w, wa = tlpLine(comp, rows[i].en[0] + rows[i].en[1], F.word, S).w;
      a.enGap = wa - ws - wf;
      a.enWs = ws; a.enWf = wf;
      enStem = Math.max(enStem, ws + a.enGap / 2); enSuf = Math.max(enSuf, wf + a.enGap / 2);
      ws = tlpLine(comp, rows[i].kk[0], F.word, S).w; wf = tlpLine(comp, rows[i].kk[1], F.word, S).w; wa = tlpLine(comp, rows[i].kk[0] + rows[i].kk[1], F.word, S).w;
      a.kkGap = wa - ws - wf;
      a.kkWs = ws; a.kkWf = wf;
      kkStem = Math.max(kkStem, ws + a.kkGap / 2); kkSuf = Math.max(kkSuf, wf + a.kkGap / 2);
      meas.push(a);
    }
    var gapDot = 0.9 * S;
    var padX = 56 * s0, padY = 48 * s0, pitch = 96 * s0;
    var inner = enStem + enSuf + gapDot + kkStem + kkSuf;
    W = inner + 2 * padX;
    if (W > maxW) {
      throw new Error("plate card: шпаргалка " + Math.round(W) + " > " + maxW);
    }
    H = rows.length * pitch + 2 * padY + (o.room || 0);
    cols = { x0: -W / 2 + padX, j1: -W / 2 + padX + enStem, j2: -W / 2 + padX + enStem + enSuf + gapDot + kkStem, dot: -W / 2 + padX + enStem + enSuf + gapDot / 2, padY: padY, pitch: pitch, meas: meas };
    plan = { S: S, rows: rows, cols: cols };
  }
  var x = o.x, y = o.y;
  var p = tlpNew(comp, o, W, H, x, y);
  p.fill = true;
  var path = tlPlatePath({ w: W, h: H, r: TL_PLATES.card.r, seed: o.seed || 6, name: o.name });
  p.path = path;
  tlpObject(comp, p, { path: path, color: tlpPaperK(0.97), edge: edge, seed: o.seed || 6 });
  var top = -H / 2;
  if (mode === "word") {
    var Pn = plan;
    var cx = 0;
    var cname = { ink: P.ink, en: P.en, kk: P.kk, soft: P.soft };
    var parts = function (arr, c, cols, sp) {
      var c0 = cols ? cname[cols[0]] : P.ink, c1 = cols ? cname[cols[1]] : c;
      return [{ text: arr[0], color: c0 }, { text: arr[1], color: c1, sp: !!sp }];
    };
    tlpRowParts(comp, p, { parts: parts(Pn.R.en, P.en, Pn.R.enColors, Pn.R.enSp), font: F.word, size: Pn.sz[0], left: cx - Pn.wEn.w / 2, lbase: top + Pn.yEn, name: o.name + "-en" });
    if (Pn.wIp) tlpText(comp, p, { text: Pn.R.ipa, font: F.handLight, size: Pn.sz[1], color: P.soft, lx: cx, lbase: top + Pn.yIp, name: o.name + "-ipa" });
    tlpRowParts(comp, p, { parts: parts(Pn.R.kk, P.kk, Pn.R.kkColors, Pn.R.kkSp), font: F.card, size: Pn.sz[2], left: cx - Pn.wKk.w / 2, lbase: top + Pn.yKk, name: o.name + "-kk" });
    p.S = Pn.sz[0];
    p.sizes = Pn.sz;
  } else {
    var Cn = plan.cols;
    for (i = 0; i < plan.rows.length; i++) {
      var m = Cn.meas[i];
      var lb = top + Cn.padY + i * Cn.pitch + (Cn.pitch + MET.cap * plan.S) / 2;
      // EN: основа правым краем к стыку j1, окончание левым; KK так же
      tlpText(comp, p, { text: plan.rows[i].en[0], font: F.word, size: plan.S, color: P.ink, lx: Cn.j1 - m.enGap / 2 - m.enWs / 2, lbase: lb, name: o.name + " r" + i + " en stem" });
      tlpText(comp, p, { text: plan.rows[i].en[1], font: F.word, size: plan.S, color: P.en, lx: Cn.j1 + m.enGap / 2 + m.enWf / 2, lbase: lb, name: o.name + " r" + i + " en suf" });
      tlpText(comp, p, { text: "·", font: F.word, size: plan.S, color: P.soft, lx: Cn.dot, lbase: lb, name: o.name + " r" + i + " dot" });
      tlpText(comp, p, { text: plan.rows[i].kk[0], font: F.word, size: plan.S, color: P.ink, lx: Cn.j2 - m.kkGap / 2 - m.kkWs / 2, lbase: lb, name: o.name + " r" + i + " kk stem" });
      tlpText(comp, p, { text: plan.rows[i].kk[1], font: F.word, size: plan.S, color: P.kk, lx: Cn.j2 + m.kkGap / 2 + m.kkWf / 2, lbase: lb, name: o.name + " r" + i + " kk suf" });
      kbLog("CARDROW " + o.name + " r" + i + " enLeft " + (Cn.j1 + m.enGap / 2).toFixed(2) + " kkLeft " + (Cn.j2 + m.kkGap / 2).toFixed(2) + " base " + lb.toFixed(2));
    }
    p.S = plan.S;
    p.cols = Cn;
  }
  // скотч: 160×46, +4°, центр на верхнем крае, рваные торцы (зигзаг ±3 px шагом 7), только контактная тень
  var tw = 160, th = 46;
  var seed = o.seed || 6;
  var left = [], right = [];
  var k;
  for (k = 0; k <= 6; k++) {
    var yy = -th / 2 + k * (th / 6);
    var jl = (tlpNoise(10 + k, seed) * 2 - 1) * 3, jr = (tlpNoise(30 + k, seed) * 2 - 1) * 3;
    left.push([-tw / 2 + jl, yy]);
    right.push([tw / 2 + jr, yy]);
  }
  var poly = [];
  for (k = 0; k < left.length; k++) poly.push(left[k]);
  for (k = right.length - 1; k >= 0; k--) poly.push(right[k]);
  // порядок обхода: левый торец сверху вниз, затем правый снизу вверх — замкнуть через верхнюю кромку
  var tapeShape = tlpPoly(poly);
  var tape = tlPlateBody(comp, { name: o.name + "-tape", w: tw, h: th, color: TL_PLATE_LOOK.tape, path: tapeShape, margin: 8, seed: seed + 2 });
  tape.comment = "tl-plate-tape";
  kbProp(tape, ["ADBE Transform Group", "ADBE Opacity"]).setValue(80);
  var tcon = tlpShapeLayer(comp, o.name + "-tape-shadow", [tapeShape], { fill: tlpPal().ink });
  var tfx = kbEffect(tcon, "ADBE Gaussian Blur 2");
  kbProp(tfx, ["ADBE Gaussian Blur 2-0001"]).setValue(TL_PLATE_LOOK.contact.blur);
  kbProp(tcon, ["ADBE Transform Group", "ADBE Opacity"]).setValue(TL_PLATE_LOOK.contact.opacity);
  tcon.moveAfter(tape);
  var tgroup = [tcon, tape];
  var te2 = null;
  if (edge === "B") {
    var te = tlpShapeLayer(comp, o.name + "-tape-edge", [tapeShape], { stroke: TL_PLATE_LOOK.edgeB.color, width: TL_PLATE_LOOK.edgeB.width });
    tgroup.push(te);
    te2 = te;
  }
  var tn = tlpNull(comp, o.name + "-tape-root", p.rx, p.ry - H / 2);
  tn.setParentWithJump(p.plate); // скотч — часть plate (grow/out/peel), значения позиции ставятся ниже в системе plate = системе root
  kbProp(tn, ["ADBE Transform Group", "ADBE Position"]).setValue([0, -H / 2]);
  kbProp(tn, ["ADBE Transform Group", "ADBE Rotate Z"]).setValue(4);
  for (k = 0; k < tgroup.length; k++) {
    tgroup[k].setParentWithJump(tn);
    kbProp(tgroup[k], ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0]);
    p.layers.push(tgroup[k]);
  }
  p.layers.push(tn);
  p.extra.tape = tape;
  p.extra.tapeShadow = tcon;
  p.extra.tapeEdge = te2;
  p.W = W; p.H = H;
  tlpTilt(p, o.tilt);
  kbLog("PLATEFIT card " + mode + " S " + p.S + " W " + W.toFixed(1) + " H " + H.toFixed(1) + " tape 160x46 +4");
  tlpLog(p, o, mode, edge);
  return p;
}

/**
 * slot — место под ответ (spec §4.3.2). A — черта-место (kbHandUnderline по чернилам ответа) и маленький «?» без заливки; B — ниша, вдавленная в бумагу.
 * Слой ответа создаётся заранее (для замера) и скрывается; o: {answer: TextLayer, variant, color "en"|"kk", column x_c, side "left"|"right" (ответ слева/справа от столбца), edge}
 * @param {CompItem} comp
 * @param {any} o
 * @returns {any}
 */
function tlpSlot(comp, o) {
  var P = tlpPal();
  var F = tlpFonts();
  var variant = o.variant || "A";
  var ans = o.answer;
  var color = o.color === "kk" ? P.kk : P.en;
  var em = tlFontSize(ans);
  var cap = tlpMetrics(comp, F.word).cap * em;
  var fit = tlStrokeFit(ans, { kind: "thin" });
  var BASE = fit.base;
  var qH = 0.8 * cap;
  var qSize = Math.round(qH / 0.73748);
  var qBase = BASE - 0.55 * cap + qH / 2;
  var p;
  var seed = o.seed || 23;
  if (variant === "A") {
    var lineW = (fit.inkR - fit.inkL) - 2 * 0.055 * fit.thickness;
    var top = qBase - qH;
    var bottom = fit.y + fit.thickness / 2;
    p = tlpNew(comp, { name: o.name, kind: "slot" }, fit.inkR - fit.inkL, bottom - top, fit.x, (top + bottom) / 2);
    var line = kbHandUnderline(comp, { x: fit.x, y: fit.y, width: lineW, thickness: fit.thickness, color: /** @type {any} */ (color), start: 0, duration: 0.3,
      seed: seed, tilt: fit.tilt, cut: fit.cut, head: 0, fade: 0, name: o.name + "-line" });
    tlRetrim(line, -12 / 30, 10, "snap");
    line.inPoint = 0;
    var q = tlTextAt(comp, { text: "?", font: F.hand, size: qSize, color: /** @type {any} */ (color), x: fit.x, baseline: qBase, name: o.name + "-q" });
    var rq = q.sourceRectAtTime(0, false);
    var pq = kbProp(q, ["ADBE Transform Group", "ADBE Position"]);
    var aq = kbProp(q, ["ADBE Transform Group", "ADBE Anchor Point"]).value;
    pq.setValue([fit.x + (aq[0] - (rq.left + rq.width / 2)), pq.value[1]]);
    // root → slot (в центре черты; на нём slot-pulse) → { plate (масштаб grow, якорь в центре черты) → черта; «?» }
    var slotN = tlpNull(comp, o.name + "-slot", fit.x, fit.y);
    tlpAdopt(slotN, p.root, p.rx, p.ry);
    var plate = tlpNull(comp, o.name + "-plate", fit.x, fit.y);
    tlpAdopt(plate, slotN, fit.x, fit.y);
    tlpAdopt(line, plate, fit.x, fit.y);
    tlpAdopt(q, slotN, fit.x, fit.y);
    p.slot = slotN;
    p.plate = plate;
    p.extra.line = line;
    p.extra.q = q;
    p.layers.push(slotN, plate, line, q);
    p.fill = false;
    kbLog("SLOT " + o.name + " A line x " + fit.x.toFixed(1) + " y " + fit.y.toFixed(1) + " w " + lineW.toFixed(1) + " t " + fit.thickness.toFixed(1) + " | ? size " + qSize + " h " + qH.toFixed(1) + " base " + qBase.toFixed(1));
  } else {
    // ниша: левый/правый край — по правилу §4.3.2 (не заходит на соседнюю часть слова)
    kbLog("INFO slot " + o.name + " B niche: не по умолчанию (владелец 16.10 — берём черту A; ниша только для сравнения)");
    var xl, xr;
    if (o.side === "left") { xl = fit.inkL - 0.10 * em; xr = o.column - 0.02 * em; } else { xl = o.column + 0.02 * em; xr = fit.inkR + 0.10 * em; }
    var yt = BASE - cap - 0.15 * em, yb = BASE + 0.15 * em;
    var nW = xr - xl, nH = yb - yt;
    var ncx = (xl + xr) / 2, ncy = (yt + yb) / 2;
    p = tlpNew(comp, { name: o.name, kind: "slot" }, nW, nH, ncx, ncy);
    var path = tlPlatePath({ w: nW, h: nH, r: TL_PLATES.slot.r, seed: seed, rough: 1, name: o.name });
    var body = tlPlateBody(comp, { name: o.name + "-body", w: nW, h: nH, color: tlpPaperK(0.93), path: path.shape, margin: 6 + path.dmax, seed: 1 });
    tlpAdopt(body, p.root, p.rx, p.ry, true);
    var plate2 = tlpNull(comp, o.name + "-plate", ncx, ncy);
    tlpAdopt(plate2, p.root, p.rx, p.ry);
    kbProp(plate2, ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0]);
    var inner = tlpShapeLayer(comp, o.name + "-inner-shadow", [path.shape], { stroke: P.ink, width: 6 });
    var ifx = kbEffect(inner, "ADBE Gaussian Blur 2");
    kbProp(ifx, ["ADBE Gaussian Blur 2-0001"]).setValue(3);
    kbProp(inner, ["ADBE Transform Group", "ADBE Position"]).setValue([3, 4]);
    kbProp(inner, ["ADBE Transform Group", "ADBE Opacity"]).setValue(20); // 16.10: было 10 % (2, 3) — тонуло в зерне, ниша читалась плоской пилюлей
    var rim = tlpShapeLayer(comp, o.name + "-rim", [path.shape], { stroke: TL_PLATE_LOOK.rim, width: 1.4 });
    kbProp(rim, ["ADBE Transform Group", "ADBE Position"]).setValue([1, 1]);
    var matte = tlpShapeLayer(comp, o.name + "-niche-matte", [path.shape], { fill: [1, 1, 1] });
    inner.setTrackMatte(matte, TrackMatteType.ALPHA);
    rim.setTrackMatte(matte, TrackMatteType.ALPHA);
    matte.enabled = false;
    var q2 = tlTextAt(comp, { text: "?", font: F.hand, size: qSize, color: /** @type {any} */ (color), x: (fit.inkL + fit.inkR) / 2, baseline: qBase, name: o.name + "-q" });
    var rq2 = q2.sourceRectAtTime(0, false);
    var pq2 = kbProp(q2, ["ADBE Transform Group", "ADBE Position"]);
    var aq2 = kbProp(q2, ["ADBE Transform Group", "ADBE Anchor Point"]).value;
    pq2.setValue([(fit.inkL + fit.inkR) / 2 + (aq2[0] - (rq2.left + rq2.width / 2)), pq2.value[1]]);
    var kids = [inner, rim, matte];
    for (var ki = 0; ki < kids.length; ki++) {
      kids[ki].setParentWithJump(plate2);
      p.layers.push(kids[ki]);
    }
    tlpAdopt(q2, p.root, p.rx, p.ry);
    p.body = body;
    p.plate = plate2;
    p.extra.q = q2;
    p.layers.push(body, plate2, q2);
    p.fill = true;
    kbLog("SLOT " + o.name + " B niche " + xl.toFixed(1) + ".." + xr.toFixed(1) + " × " + yt.toFixed(1) + ".." + yb.toFixed(1) + " (" + nW.toFixed(1) + "×" + nH.toFixed(1) + ")");
  }
  ans.enabled = false; // ответ виден только после plate-out
  tlpLog(p, { kind: "slot", name: o.name, tilt: 0 }, variant, variant === "B" ? "-" : "-");
  return p;
}

/**
 * bare — подпись без плашки (spec §4.3.6): голый текст Black ink + принятый мазок marker-swipe под одним ключевым словом. Плашки нет: fill/edge → исключение.
 * o: {lines: [[{text, key?}…], …] (слова строки по порядку), size, x (центр), bases [..], gap? (пробел, em), name}
 * @param {CompItem} comp
 * @param {any} o
 * @returns {any}
 */
function tlpBare(comp, o) {
  if (o.fill || o.edge) throw new Error("plate bare: подложка запрещена (владелец 23.09)");
  var P = tlpPal();
  var F = tlpFonts();
  var S = o.size;
  var p = tlpNew(comp, o, 0, 0, o.x, 0);
  var keyLayers = [];
  for (var li = 0; li < o.lines.length; li++) {
    var parts = o.lines[li];
    var whole = "";
    var wk;
    for (wk = 0; wk < parts.length; wk++) whole += (wk > 0 && parts[wk].sp !== false ? " " : "") + parts[wk].text;
    var W = kbTextMeasure(comp, { text: whole, font: F.word, size: S }).width;
    var left = o.x - W / 2;
    var pref = "";
    for (wk = 0; wk < parts.length; wk++) {
      var piece = (wk > 0 && parts[wk].sp !== false ? " " : "") + parts[wk].text;
      pref += piece;
      var wp = kbTextMeasure(comp, { text: parts[wk].text, font: F.word, size: S }).width;
      var wc = kbTextMeasure(comp, { text: pref, font: F.word, size: S }).width;
      var l = left + wc - wp;
      var layer = tlTextAt(comp, { text: parts[wk].text, font: F.word, size: S, color: /** @type {any} */ (P.ink), x: l + wp / 2, baseline: o.bases[li], name: o.name + " l" + li + " " + parts[wk].text });
      p.text.push(layer);
      p.layers.push(layer);
      if (parts[wk].key) keyLayers.push(layer);
    }
  }
  for (var k = 0; k < keyLayers.length; k++) {
    kbMove(keyLayers[k], "marker-swipe", { start: 0 });
  }
  p.fill = false;
  kbLog("PLATE " + o.name + " kind bare variant - edge - at (" + o.x.toFixed(1) + ", -) tilt 0 W 0 H 0 fill 0");
  return p;
}

// ---------------------------------------------------------------------------------------------------------------------
// Вход
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Построить плашку по типу (spec §4.4). Первая строка — проверка стиля (hand | lesson), ни одного слоя до неё.
 * @param {CompItem} comp
 * @param {any} o {kind, name, …} — поля по типам см. tlpTag, tlpSlot, tlpBadge, tlpCallout, tlpCard, tlpBare
 * @returns {any} {root, body, edge, shadow, text[], extra, W, H, fill, layers[]}
 */
function tlPlate(comp, o) {
  tlPlateGuardStyle(o.name || o.kind);
  if (!TL_PLATES[o.kind]) throw new Error("tlPlate: нет типа «" + o.kind + "» (tag, slot, badge, callout, card, bare)");
  var p;
  if (o.kind === "tag") p = tlpTag(comp, o);
  else if (o.kind === "slot") p = tlpSlot(comp, o);
  else if (o.kind === "badge") p = tlpBadge(comp, o);
  else if (o.kind === "callout") p = tlpCallout(comp, o);
  else if (o.kind === "card") p = tlpCard(comp, o);
  else return tlpBare(comp, o);
  tlpBlur(p);
  return p;
}

/**
 * Размытие в движении на слоях плашки (переключатель слоя; сама композиция решает, считать ли его: в проверках motionBlur композиции выключен).
 * @param {any} p
 */
function tlpBlur(p) {
  for (var i = 0; i < p.layers.length; i++) {
    try { if (!p.layers[i].nullLayer) p.layers[i].motionBlur = true; } catch (e) { /* слой без переключателя */ }
  }
}

/**
 * Кегль шпаргалки под maxW (spec §4.3.5): наибольший целый S ≤ maxS, при котором ширина ≤ maxW. Поля 56 и шаг строк 96 пропорциональны S/58,5 при S < 58,5.
 * Кернинг масштабируется линейно — замер при 100 px.
 * @param {CompItem} comp
 * @param {{en: string[], kk: string[]}[]} rows
 * @param {number} maxW
 * @param {number} maxS
 * @returns {number}
 */
function tlPlateSheetFit(comp, rows, maxW, maxS) {
  var F = tlpFonts();
  var enStem = 0, enSuf = 0, kkStem = 0, kkSuf = 0;
  for (var i = 0; i < rows.length; i++) {
    var e0 = tlpLine(comp, rows[i].en[0], F.word, 100).w, e1 = tlpLine(comp, rows[i].en[1], F.word, 100).w, ea = tlpLine(comp, rows[i].en[0] + rows[i].en[1], F.word, 100).w;
    var k0 = tlpLine(comp, rows[i].kk[0], F.word, 100).w, k1 = tlpLine(comp, rows[i].kk[1], F.word, 100).w, ka = tlpLine(comp, rows[i].kk[0] + rows[i].kk[1], F.word, 100).w;
    enStem = Math.max(enStem, e0 + (ea - e0 - e1) / 2); enSuf = Math.max(enSuf, e1 + (ea - e0 - e1) / 2);
    kkStem = Math.max(kkStem, k0 + (ka - k0 - k1) / 2); kkSuf = Math.max(kkSuf, k1 + (ka - k0 - k1) / 2);
  }
  var inner100 = enStem + enSuf + 90 + kkStem + kkSuf;
  for (var S = maxS; S > 10; S--) {
    var W = inner100 * S / 100 + 112 * Math.min(1, S / 58.5);
    if (W <= maxW) {
      kbLog("INFO plate fit sheet S " + S + " W " + W.toFixed(1) + " (100 px: " + inner100.toFixed(1) + ")");
      return S;
    }
  }
  throw new Error("plate card: шпаргалка не влезает в " + maxW);
}

/**
 * Сколько плашек с заливкой видно в момент t: слои tl-plate-fill с непрозрачностью > 0 (штамп, черта-место, выноска-контур не считаются; скотч — нет).
 * @param {CompItem} comp
 * @param {number} t
 * @returns {number}
 */
function tlPlateFills(comp, t) {
  var n = 0;
  for (var i = 1; i <= comp.numLayers; i++) {
    var l = comp.layer(i);
    if (String(l.comment) !== "tl-plate-fill" || !l.enabled) continue;
    if (t < l.inPoint || t > l.outPoint) continue;
    if (kbProp(l, ["ADBE Transform Group", "ADBE Opacity"]).valueAtTime(t, false) > 0) n++;
  }
  return n;
}

// =====================================================================================================================
// Часть B — общие помощники движений (spec §5.1)
// =====================================================================================================================

/**
 * Значение преобразования слоя на время t (с учётом ключей и выражений).
 * @param {Layer} layer
 * @param {string} m matchName внутри ADBE Transform Group
 * @param {number} t
 * @returns {any}
 */
function tlpT(layer, m, t) {
  return kbProp(layer, ["ADBE Transform Group", m]).valueAtTime(t, false);
}

/**
 * Точка слоя в кадре через цепочку родителей с масштабом и поворотом Z (spec §5.1; toComp в ExtendScript нет, tlmToComp потока 3 поворот не учитывает).
 * Только 2D-преобразования: rotationY сторон ярлыка не учитывается.
 * @param {Layer} layer
 * @param {number} x в системе слоя (до якоря)
 * @param {number} y
 * @param {number} t секунды
 * @returns {number[]}
 */
function tlpToComp(layer, x, y, t) {
  var p = [x, y];
  var L = layer;
  while (L) {
    var anc = tlpT(L, "ADBE Anchor Point", t), pos = tlpT(L, "ADBE Position", t), sc = tlpT(L, "ADBE Scale", t), rot = tlpT(L, "ADBE Rotate Z", t);
    var dx = (p[0] - anc[0]) * sc[0] / 100, dy = (p[1] - anc[1]) * sc[1] / 100;
    var a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    p = [pos[0] + dx * c - dy * s, pos[1] + dx * s + dy * c];
    L = L.parent;
  }
  return p;
}

/**
 * Обратное к tlpToComp: точка кадра в системе слоя (цепочка слоя и его родителей).
 * @param {Layer|null} layer null — точка остаётся как есть (система кадра)
 * @param {number} x
 * @param {number} y
 * @param {number} t
 * @returns {number[]}
 */
function tlpFromComp(layer, x, y, t) {
  var chain = [];
  var L = layer;
  while (L) { chain.push(L); L = L.parent; }
  var p = [x, y];
  for (var i = chain.length - 1; i >= 0; i--) {
    var anc = tlpT(chain[i], "ADBE Anchor Point", t), pos = tlpT(chain[i], "ADBE Position", t), sc = tlpT(chain[i], "ADBE Scale", t), rot = tlpT(chain[i], "ADBE Rotate Z", t);
    var dx = p[0] - pos[0], dy = p[1] - pos[1];
    var a = -rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    var ux = dx * c - dy * s, uy = dx * s + dy * c;
    var kx = sc[0] === 0 ? 1e-9 : sc[0], ky = sc[1] === 0 ? 1e-9 : sc[1];
    p = [anc[0] + ux * 100 / kx, anc[1] + uy * 100 / ky];
  }
  return p;
}

/**
 * Ключи с кривой на каждый отрезок (как tlKeysEased: кривая приходит в ключ слева), но с поиском индекса по времени —
 * можно дописывать ключи на свойство, где уже есть ключи других пресетов. ease отрезка: имя TL_EASE | "hold" (ступень: ключ слева держит значение) |
 * "linear" (линейный отрезок) | пусто (как есть).
 * @param {Property} prop
 * @param {any[][]} keys [время с, значение, ease отрезка к этому ключу]
 */
function tlpKeys(prop, keys) {
  var n = keys.length;
  var i;
  for (i = 0; i < n; i++) prop.setValueAtTime(keys[i][0], keys[i][1]);
  var idx = [];
  for (i = 0; i < n; i++) idx.push(prop.nearestKeyIndex(keys[i][0]));
  var named = function (e) { return e && e !== "hold" && e !== "linear" && !!TL_EASE[e]; };
  for (i = 0; i < n; i++) {
    var arr = keys[i][2];
    var leave = i < n - 1 ? keys[i + 1][2] : undefined;
    if (!named(arr) && !named(leave)) continue;
    // сторона, которую этот набор ключей не задаёт, остаётся как была (ключ мог остаться от прошлого пресета)
    var ein = prop.keyInTemporalEase(idx[i]);
    var eout = prop.keyOutTemporalEase(idx[i]);
    for (var d = 0; d < ein.length; d++) {
      if (named(arr)) ein[d] = new KeyframeEase(0, TL_EASE[arr].into);
      if (named(leave)) eout[d] = new KeyframeEase(0, TL_EASE[leave].out);
    }
    prop.setTemporalEaseAtKey(idx[i], /** @type {any} */ (ein), /** @type {any} */ (eout));
  }
  for (i = 0; i < n - 1; i++) {
    var e = keys[i + 1][2];
    if (e === "hold") {
      prop.setInterpolationTypeAtKey(idx[i], prop.keyInInterpolationType(idx[i]), KeyframeInterpolationType.HOLD);
    } else if (e === "linear") {
      prop.setInterpolationTypeAtKey(idx[i], prop.keyInInterpolationType(idx[i]), KeyframeInterpolationType.LINEAR);
      prop.setInterpolationTypeAtKey(idx[i + 1], KeyframeInterpolationType.LINEAR, prop.keyOutInterpolationType(idx[i + 1]));
    }
  }
}

/**
 * Значение 2D/3D-вектора для Scale: [v, v] → [v, v, 100], если свойство трёхмерное.
 * @param {Property} sc
 * @param {number} sx
 * @param {number=} sy
 * @returns {number[]}
 */
function tlpScaleVal(sc, sx, sy) {
  var y = sy === undefined ? sx : sy;
  return sc.value.length > 2 ? [sx, y, 100] : [sx, y];
}

/**
 * Z у 3D-слоя.
 * @param {Layer|null} layer
 * @param {number} z
 */
function tlpZ(layer, z) {
  if (!layer) return;
  var pos = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]);
  var v = pos.value;
  pos.setValue([v[0], v[1], z]);
}

/**
 * Реестр слоёв плашки с базовой непрозрачностью и ролью (для tlPlateOpacity): {l, base, kind, side}. kind: cast, contact, body, edge, hole, print, text, line,
 * tape, tapeShadow, tapeEdge. Строится при первом обращении (у ярлыка с двумя сторонами — при сборке, до того как сторона EN станет прозрачной).
 * @param {any} p плашка
 * @param {any} o объект, чьи слои учитываем (p или сторона)
 * @param {string} side "" | "kk" | "en"
 */
function tlpOpsAdd(p, o, side) {
  var add = function (l, kind) {
    if (!l) return;
    p.ops.push({ l: l, base: kbProp(l, ["ADBE Transform Group", "ADBE Opacity"]).value, kind: kind, side: side });
  };
  if (o.shadow) { add(o.shadow.cast, "cast"); add(o.shadow.contact, "contact"); }
  add(o.body, o.kind === "badge" ? "print" : "body");
  add(o.edge, "edge");
  if (o.extra) {
    add(o.extra.hole, "hole");
    add(o.extra.tape, "tape");
    add(o.extra.tapeShadow, "tapeShadow");
    add(o.extra.tapeEdge, "tapeEdge");
    add(o.extra.line, "line");
    add(o.extra.q, "text");
  }
  for (var i = 0; i < o.text.length; i++) add(o.text[i], "text");
}

/**
 * @param {any} p
 * @returns {any[]}
 */
function tlpOps(p) {
  if (!p.ops) {
    p.ops = [];
    tlpOpsAdd(p, p, "");
  }
  return p.ops;
}

/**
 * Подходит ли слой под выбор sel: all (активная сторона; без выбора — всё), nocast (всё, кроме двух теней), text, shape (не текст), shadow (cast + contact),
 * solid (тело, кант, дырка, оттиск, скотч, черта), side-kk / side-en (все слои стороны), иначе — вид слоя (cast, contact, body, edge, hole …).
 * @param {any} p
 * @param {any} op
 * @param {string=} sel
 * @returns {boolean}
 */
function tlpSel(p, op, sel) {
  var s = sel || "all";
  if (p.sides) {
    if (s === "side-kk") return op.side === "kk";
    if (s === "side-en") return op.side === "en";
    if (op.side !== p.active) return false;
  }
  if (s === "all") return true;
  if (s === "nocast") return op.kind !== "cast" && op.kind !== "contact";
  if (s === "text") return op.kind === "text";
  if (s === "shape") return op.kind !== "text";
  if (s === "shadow") return op.kind === "cast" || op.kind === "contact";
  if (s === "solid") return op.kind !== "text" && op.kind !== "cast" && op.kind !== "contact";
  return op.kind === s;
}

/**
 * Непрозрачность выбранных слоёв плашки: ключи на КАЖДОМ слое (через родителя не наследуется; spec §4.1). values — доля базовой непрозрачности слоя, %
 * (тень cast 12 %, оттиск 92 % и т. д.), ease — кривая отрезков или "hold".
 * @param {any} p
 * @param {number[]} times секунды
 * @param {number[]} values 0…100 (доля базы)
 * @param {string=} ease
 * @param {string=} sel см. tlpSel
 * @returns {number} сколько слоёв получили ключи
 */
function tlPlateOpacity(p, times, values, ease, sel) {
  var ops = tlpOps(p);
  var n = 0;
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    if (!tlpSel(p, op, sel)) continue;
    var keys = [];
    for (var j = 0; j < times.length; j++) keys.push([times[j], op.base * values[j] / 100, j > 0 ? ease : undefined]);
    tlpKeys(kbProp(op.l, ["ADBE Transform Group", "ADBE Opacity"]), keys);
    n++;
  }
  return n;
}

/**
 * Ступенька: значение a держится до t − eps, с t — b (hold). Две пары ключей на свойстве.
 * @param {Property} prop
 * @param {number} t
 * @param {any} a
 * @param {any} b
 */
function tlpHold(prop, t, a, b) {
  tlpKeys(prop, [[t - TL_PLATE_LOOK.eps, a], [t, b, "hold"]]);
}

/**
 * Смена опоры без скачка (spec §5.1): Position_new = Position_old + R(rot)·S(scale)·(anchor_new − anchor_old) по значениям на t.
 * t = null — до всех ключей (статично, ключи на Anchor/Position не пишутся); иначе парой ключей на Anchor и на Position: t − 1/600 с (старое значение, out = HOLD)
 * и t (новое значение; out — интерполяция следующего сегмента, у ключа не трогается: один hold-ключ в t при соседних ключах движения превратил бы в hold и
 * сегмент t → t + 2 к.). Журнал REPIVOT <имя> t f<…> before (<x>,<y>) after (<x>,<y>) out <тип>: точка новой опоры в кадре до (t − eps/2) и после (t).
 * @param {Layer} root
 * @param {number|null} t
 * @param {number[]} a новая опора, система слоя
 */
function tlPlateRepivot(root, t, a) {
  var ancP = kbProp(root, ["ADBE Transform Group", "ADBE Anchor Point"]);
  var posP = kbProp(root, ["ADBE Transform Group", "ADBE Position"]);
  var tt = t === null ? 0 : t;
  var oldA = ancP.valueAtTime(tt, false), oldP = posP.valueAtTime(tt, false);
  var sc = tlpT(root, "ADBE Scale", tt), rot = tlpT(root, "ADBE Rotate Z", tt);
  var dx = (a[0] - oldA[0]) * sc[0] / 100, dy = (a[1] - oldA[1]) * sc[1] / 100;
  var th = rot * Math.PI / 180;
  var newP = [oldP[0] + dx * Math.cos(th) - dy * Math.sin(th), oldP[1] + dx * Math.sin(th) + dy * Math.cos(th)];
  var e = TL_PLATE_LOOK.eps;
  var before, after, outType = "-";
  if (t === null) {
    if (ancP.numKeys > 0 || posP.numKeys > 0) throw new Error("tlPlateRepivot: на «" + root.name + "» уже есть ключи опоры/позиции — нужен момент t");
    before = tlpToComp(root, a[0], a[1], 0);
    ancP.setValue(a);
    posP.setValue(newP);
    after = tlpToComp(root, a[0], a[1], 0);
    kbLog("REPIVOT " + root.name + " static before (" + before[0].toFixed(2) + "," + before[1].toFixed(2) + ") after (" + after[0].toFixed(2) + "," + after[1].toFixed(2) + ") out -");
    return;
  }
  var posOld = [oldP[0], oldP[1]];
  tlpKeys(ancP, [[t - e, oldA], [t, a, "hold"]]);
  tlpKeys(posP, [[t - e, posOld], [t, newP, "hold"]]);
  var ia = ancP.nearestKeyIndex(t), ip = posP.nearestKeyIndex(t);
  // ключ в t: вход — ступенька, выход — как у следующего сегмента (по умолчанию интерполяция ключа; hold на выходе мы не ставили)
  outType = String(posP.keyOutInterpolationType(ip) === KeyframeInterpolationType.HOLD ? "HOLD" : (posP.keyOutInterpolationType(ip) === KeyframeInterpolationType.LINEAR ? "LINEAR" : "BEZIER"));
  before = tlpToComp(root, a[0], a[1], t - e / 2);
  after = tlpToComp(root, a[0], a[1], t);
  // реальное движение за eps/2 (до смены опоры) отделено от ошибки смены: drift — сдвиг точки за соседний отрезок eps/2 до t − eps/2, err = |(after − before) − drift|
  var atE = tlpToComp(root, a[0], a[1], t - e);
  var drift = [before[0] - atE[0], before[1] - atE[1]];
  var errR = Math.sqrt(Math.pow(after[0] - before[0] - drift[0], 2) + Math.pow(after[1] - before[1] - drift[1], 2));
  kbLog("REPIVOT " + root.name + " t f" + (t * 30).toFixed(2) + " before (" + before[0].toFixed(2) + "," + before[1].toFixed(2) + ") after (" + after[0].toFixed(2) + "," + after[1].toFixed(2) + ") out " + outType + " keys a" + ia + "/p" + ip +
    " drift (" + drift[0].toFixed(3) + "," + drift[1].toFixed(3) + ") err " + errR.toFixed(3));
}

/**
 * Чернила текстового слоя в кадре: центр по x, базовая линия, левый и правый края (слой без поворота; цепочка родителей — через tlpToComp).
 * Замер sourceRectAtTime до аниматоров.
 * @param {TextLayer} layer
 * @param {number} t
 * @returns {{cx: number, base: number, rbase: number, left: number, right: number, top: number, bottom: number, w: number}} base — база у левого края чернил, rbase — у правого
 */
function tlpInk(layer, t) {
  var rect = layer.sourceRectAtTime(0, false);
  var l = tlpToComp(layer, rect.left, 0, t);
  var r = tlpToComp(layer, rect.left + rect.width, 0, t);
  var tp = tlpToComp(layer, rect.left, rect.top, t);
  var bt = tlpToComp(layer, rect.left, rect.top + rect.height, t);
  if (layer.threeDLayer) { // слой на z ≠ 0 (текст стороны ярлыка): камера tl-cam масштабирует его от центра кадра
    var comp = layer.containingComp;
    var L = TL_PLATE_LOOK.persp;
    var k = L.zoom / (L.zoom + kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).valueAtTime(t, false)[2]);
    var cxx = comp.width / 2, cyy = comp.height / 2;
    l = [cxx + (l[0] - cxx) * k, cyy + (l[1] - cyy) * k];
    r = [cxx + (r[0] - cxx) * k, cyy + (r[1] - cyy) * k];
    tp = [cxx + (tp[0] - cxx) * k, cyy + (tp[1] - cyy) * k];
    bt = [cxx + (bt[0] - cxx) * k, cyy + (bt[1] - cyy) * k];
  }
  return { cx: (l[0] + r[0]) / 2, base: l[1], rbase: r[1], left: l[0], right: r[0], top: tp[1], bottom: bt[1], w: r[0] - l[0] };
}

/**
 * Поправка на перспективу камеры tl-cam (spec §4.1, Q3): текст стороны на z −2 ближе к камере и масштабируется на zoom/(zoom + z) от центра кадра;
 * чтобы он встал на цель в кадре, позиция в системе стороны сдвигается на (точка − центр)·((zoom + z)/zoom − 1). Корень без поворота и масштаба.
 * @param {any} p ярлык с сторонами
 * @param {string} side
 * @param {number} t
 * @param {number[]=} at точка в кадре, где текст должен встать (по умолчанию — где он сейчас)
 */
function tlpPersp(p, side, t, at) {
  var sp = p.sides[side];
  var tx = sp.text[0];
  var comp = p.root.containingComp;
  var L = TL_PLATE_LOOK.persp;
  var k = (L.zoom + L.z) / L.zoom - 1;
  var rect = tx.sourceRectAtTime(0, false);
  var pt = at ? at : tlpToComp(tx, rect.left + rect.width / 2, rect.top + rect.height / 2, t);
  var dx = (pt[0] - comp.width / 2) * k, dy = (pt[1] - comp.height / 2) * k;
  var pos = kbProp(tx, ["ADBE Transform Group", "ADBE Position"]);
  var v = pos.value;
  pos.setValue([v[0] + dx, v[1] + dy, v[2]]);
  kbLog("PERSP " + tx.name + " shift (" + dx.toFixed(3) + "," + dy.toFixed(3) + ") px at (" + pt[0].toFixed(1) + "," + pt[1].toFixed(1) + ")");
}

/**
 * Куда поставить корень ярлыка, чтобы текст стороны side лёг на чернила слоя under (глифы совпадают ± 0,5 px): центр стороны EN = P1 (spec §5.6, §5.7).
 * Поправка перспективы применяется к тексту стороны. Корень без поворота и масштаба на момент посадки.
 * @param {any} p
 * @param {string} side "kk" | "en" (у ярлыка без сторон — игнорируется)
 * @param {TextLayer} under слой окончания (ER) — чернила в кадре
 * @returns {number[]} позиция корня (центр ярлыка) в кадре
 */
function tlPlateLand(p, side, under) {
  var sp = p.sides ? p.sides[side] : p;
  var ink = tlpInk(under, 0);
  var P1 = [ink.cx - sp.textCx, ink.base - sp.base];
  if (p.sides) tlpPersp(p, side, 0, [ink.cx, ink.base - 0.36 * sp.S]);
  kbLog("LAND " + p.name + " " + side + " P1 (" + P1[0].toFixed(2) + "," + P1[1].toFixed(2) + ") ink " + ink.cx.toFixed(2) + " base " + ink.base.toFixed(2));
  return P1;
}

/**
 * Выражение положения точки героя с дыханием (kbBreath: масштаб Y растёт на k, X сжимается на 0,45·k от подошв): для привязки предмета к ладони.
 * Пустышка стоит в точке point (кадр, k = 0) и повторяет её смещение от дыхания героя: смещение = (точка − подошвы)·(масштаб/покой − 1) по осям.
 * dir "on" — повторяет с момента step (до него стоит неподвижно), "off" — до момента step (после стоит). Точку героя берут данными (ладонь, голова), не из кода.
 * @param {CompItem} comp
 * @param {{name: string, hero: AVLayer, point: number[], step: number, dir?: string, rest?: number[]}} o
 * @returns {Layer}
 */
function tlPlatePalm(comp, o) {
  var sc = kbProp(o.hero, ["ADBE Transform Group", "ADBE Scale"]);
  var rest = o.rest;
  if (!rest) {
    var had = sc.expressionEnabled;
    if (sc.expression !== "") sc.expressionEnabled = false;
    var v = sc.value;
    rest = [v[0], v[1]];
    if (sc.expression !== "") sc.expressionEnabled = had;
  }
  var n = tlpNull(comp, o.name, o.point[0], o.point[1]);
  var on = o.dir === "off" ? 0 : 1;
  kbProp(n, ["ADBE Transform Group", "ADBE Position"]).expression =
    "var h=thisComp.layer(\"" + o.hero.name + "\");var s=h.transform.scale;var hp=h.transform.position;\n" +
    "var f=(time>=" + o.step.toFixed(5) + ")?" + on + ":" + (1 - on) + ";\n" +
    "[" + o.point[0] + "+f*(" + o.point[0] + "-hp[0])*(s[0]/" + rest[0] + "-1)," + o.point[1] + "+f*(" + o.point[1] + "-hp[1])*(s[1]/" + rest[1] + "-1)];";
  kbLog("PALM " + o.name + " point (" + o.point[0].toFixed(1) + "," + o.point[1].toFixed(1) + ") step f" + (o.step * 30).toFixed(2) + " dir " + (o.dir || "on") + " rest " + rest[0].toFixed(3) + "," + rest[1].toFixed(3));
  return n;
}

/**
 * Фаза дыхания героя (kbBreath phase), при которой k = 0 на кадре ступени: posterizeTime(15) округляет время вниз до 1/15 с — фаза от этого округления.
 * @param {number} stepT секунды
 * @returns {number}
 */
function tlPlateBreathPhase(stepT) {
  return -Math.floor(stepT * 15 + 1e-6) / 15;
}

/**
 * Маркер sfx на ближайшем кадре не раньше картинки; сила — на стиль (lesson × 0,6).
 * @param {Layer} layer
 * @param {number} t
 * @param {string} kind
 * @param {number} strength
 */
function tlpSfx(layer, t, kind, strength) {
  tlSfxMarker(layer, tlCeilFrame(t), kind, strength);
}

/**
 * Начало и конец по опорам at | start (spec §5.1): ровно одно из двух.
 * @param {any} o
 * @param {number} hitFr кадр удара от старта
 * @returns {number} start секунды (кратно кадру)
 */
function tlpStart(o, hitFr) {
  var start;
  if (o.at !== undefined && o.start === undefined) start = o.at - hitFr / 30;
  else if (o.start !== undefined && o.at === undefined) start = o.start;
  else throw new Error("нужно ровно одно из at | start");
  return Math.round(start * 30) / 30;
}

/**
 * Точка по умолчанию, откуда растёт плашка: кончик хвоста выноски, иначе центр.
 * @param {any} p
 * @returns {number[]}
 */
function tlpDefaultFrom(p) {
  if (p.tip) return [p.tip[0], p.tip[1]];
  return [0, 0];
}

/**
 * Сторона (у ярлыка с двумя сторонами — активная) или сама плашка.
 * @param {any} p
 * @returns {any}
 */
function tlpSide(p) {
  return p.sides ? p.sides[p.active] : p;
}

// =====================================================================================================================
// Часть B — пресеты №23–28, №32 (spec §5.2–5.8). Для стилей brisk, magazine — исключение до первого слоя/ключа (§6).
// Маркеры sfx у plate-in, stamp-in, suffix-dock ставит их run (def.sfx = null): вид по режиму, сила по стилю.
// =====================================================================================================================

/**
 * Обязательная плашка в опциях.
 * @param {string} name
 * @param {any} o
 * @returns {any}
 */
function tlpNeed(name, o) {
  if (!o.plate) throw new Error(name + ": нужна плашка (опция plate)");
  return o.plate;
}

/**
 * №23 plate-in — вход плашки (spec §5.2). grow: из точки-источника from (масштаб plate 0 → 104 → 100, текст не масштабируется — появляется прозрачностью);
 * drop: сверху (карточка), касание читается по контактной тени. draw (контур от руки) снят 16.10: в hand — исключение, в lesson — SWAP на grow.
 * Перелёт grow = min(0,04 × strength × S.strength, 0,04); в lesson 0 (12 к. snap). sfx pop (сила × стиль) ставит run на tlCeilFrame(hit).
 */
TL_MOVES["plate-in"] = {
  group: "plate-in", slot: "in", units: [], unit: "word",
  frames: { grow: 9, drop: 9 }, stagger: {}, over: 0.04, lead: 0, sfx: null,
  params: { mode: "grow", strength: 1 },
  plan: function (layer, o, S) {
    tlPlateGuardStyle("plate-in");
    var mode = o.mode;
    if (mode === "draw") {
      if (S.name === "lesson") { kbLog("SWAP plate-in draw→grow (lesson, в run)"); mode = "grow"; }
      else throw new Error("plate-in: режим draw только для выноски B");
    }
    if (mode !== "grow" && mode !== "drop") throw new Error("plate-in: режим «" + o.mode + "» — нужен grow или drop");
    tlpNeed("plate-in", o);
    var lesson = S.name === "lesson";
    var hitFr = mode === "grow" ? (lesson ? 12 : 6) : (lesson ? 12 : 9);
    var endFr = mode === "grow" ? (lesson ? 12 : 9) : (lesson ? 15 : 11);
    var start = tlpStart(o, hitFr);
    return { n: 0, unit: "", starts: [], start: start, hit: start + hitFr / 30, end: start + endFr / 30, total: endFr, unitFr: endFr, staggerFr: 0, mode: mode, hitFr: hitFr, endFr: endFr };
  },
  run: function (layer, o, S, plan) {
    var p = o.plate;
    var lesson = S.name === "lesson";
    var str = o.strength * S.strength;
    var t0 = plan.start;
    var f = function (n) { return t0 + n / 30; };
    if (plan.mode === "grow") {
      var from = o.from ? o.from : tlpDefaultFrom(p);
      tlPlateRepivot(p.plate, null, from);
      var sc = kbProp(p.plate, ["ADBE Transform Group", "ADBE Scale"]);
      var over = lesson ? 0 : Math.min(0.04 * str, 0.04);
      var peak = 100 + over * 100;
      var keys = lesson
        ? [[f(0), tlpScaleVal(sc, 0)], [f(12), tlpScaleVal(sc, 100), "snap"]]
        : [[f(0), tlpScaleVal(sc, 0)], [f(6), tlpScaleVal(sc, peak), "snap"], [f(9), tlpScaleVal(sc, 100), "soft"]];
      tlpKeys(sc, keys);
      var ts = lesson ? 4 : 3, te = lesson ? 9 : 7;
      tlPlateOpacity(p, [f(ts), f(te)], [0, 100], "soft", "text");
      kbLog("PLATEIN " + p.name + " grow start f" + Math.round(t0 * 30) + " peak f" + Math.round((t0 + (lesson ? 12 : 6) / 30) * 30) + " settle f" + Math.round((t0 + (lesson ? 12 : 9) / 30) * 30) +
        " from (" + from[0].toFixed(1) + "," + from[1].toFixed(1) + ") max " + peak.toFixed(2));
    } else {
      var pos = kbProp(p.root, ["ADBE Transform Group", "ADBE Position"]);
      var rot = kbProp(p.root, ["ADBE Transform Group", "ADBE Rotate Z"]);
      var px = pos.value[0], py = pos.value[1], rz = rot.value;
      var dy = lesson ? 72 : 120, dr = lesson ? 1.8 : 3;
      var T = lesson ? 12 : 9;
      tlpKeys(pos, [[f(0), [px, py - dy]], [f(T), [px, py], "snap"]]);
      tlpKeys(rot, [[f(0), rz - dr], [f(T), rz, "snap"]]);
      var fadeEnd = lesson ? 4 : 3;
      tlPlateOpacity(p, [f(0), f(fadeEnd)], [0, 100], "soft", "nocast");
      // тень cast: смещение (18, 30) → (6, 10) (lesson (13,2; 22) → (6, 10)), размытие 30 → 12 (22,8 → 12), непрозрачность 7 → 12 %; во время падения ещё и общее появление
      var L = TL_PLATE_LOOK;
      var cdx = lesson ? 13.2 : 18, cdy = lesson ? 22 : 30, cbl = lesson ? 22.8 : 30;
      tlpKeys(kbProp(p.shadow.cast, ["ADBE Transform Group", "ADBE Position"]), [[f(0), [cdx, cdy]], [f(T), [L.cast.dx, L.cast.dy], "snap"]]);
      tlpKeys(kbProp(p.shadow.cast, ["ADBE Effect Parade", "ADBE Gaussian Blur 2", "ADBE Gaussian Blur 2-0001"]), [[f(0), cbl], [f(T), L.cast.blur, "snap"]]);
      var ck = [];
      for (var i = 0; i <= T; i++) {
        var fade = i >= fadeEnd ? 1 : tlBz(i / fadeEnd, "soft");
        var sh = 7 + (L.cast.opacity - 7) * tlBz(i / T, "snap");
        ck.push([f(i), fade * sh, i > 0 ? "linear" : undefined]);
      }
      tlpKeys(kbProp(p.shadow.cast, ["ADBE Transform Group", "ADBE Opacity"]), ck);
      // контактная тень: 0 до касания, затем 0 → 18 % за 2 к. (lesson за 3)
      var cw = lesson ? 3 : 2;
      tlpKeys(kbProp(p.shadow.contact, ["ADBE Transform Group", "ADBE Opacity"]), [[f(0), 0], [f(T), 0, "hold"], [f(T + cw), L.contact.opacity, "soft"]]);
      kbLog("PLATEIN " + p.name + " drop start f" + Math.round(t0 * 30) + " touch f" + Math.round((t0 + T / 30) * 30) + " contact f" + Math.round((t0 + (T + cw) / 30) * 30) + " y " + (-dy));
    }
    tlpSfx(layer, plan.hit, "pop", str);
  }
};

/**
 * №24 plate-out — выход (spec §5.3). melt: бумага тает (ярлык на слове: тени 4 к. soft, затем тело/кант/дырка 6 к. release, текст гаснет hold-ключом на старте тела;
 * черта-место A: черта 6 к. release, «?» 4 к. soft); out: plate схлопывается к to (6 к. release, текст 4 к.); peel: карточка отрывается вверх (подъём 6 к. + вылет 8 к.).
 * Опции: plate, mode, at (конец) | start, to, under (слой строки под тающим ярлыком: inPoint = старт). lesson: длительности × 1,3.
 */
TL_MOVES["plate-out"] = {
  group: "plate-out", slot: "out", units: [], unit: "word",
  frames: { melt: 10, out: 6, peel: 14 }, stagger: {}, over: 0, lead: 0, sfx: null,
  params: { mode: "out", strength: 1 },
  plan: function (layer, o, S) {
    tlPlateGuardStyle("plate-out");
    var mode = o.mode;
    if (mode !== "melt" && mode !== "out" && mode !== "peel") throw new Error("plate-out: режим «" + mode + "» — нужен melt, out или peel");
    var p = tlpNeed("plate-out", o);
    var d = S.dur;
    var r = function (n) { return Math.max(1, Math.round(n * d)); };
    var total, parts;
    if (mode === "melt") {
      if (p.kind === "slot") { parts = { line: r(6), text: r(4) }; total = parts.line; }
      else { parts = { shadow: r(4), body: r(6) }; total = parts.shadow + parts.body; }
    } else if (mode === "out") {
      parts = { scale: r(6), text: r(4) };
      total = parts.scale;
    } else {
      parts = { lift: r(6), fly: r(8) };
      total = parts.lift + parts.fly;
    }
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - total / 30; // at — момент, когда плашки уже нет
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    return { n: 0, unit: "", starts: [], start: start, hit: start + total / 30, end: start + total / 30, total: total, unitFr: total, staggerFr: 0, mode: mode, parts: parts };
  },
  run: function (layer, o, S, plan) {
    var p = o.plate;
    var t0 = plan.start;
    var f = function (n) { return t0 + n / 30; };
    var m = plan.mode;
    var pt = plan.parts;
    var L = TL_PLATE_LOOK;
    var str = o.strength * S.strength;
    if (m === "melt") {
      if (p.kind === "slot") {
        tlPlateOpacity(p, [f(0), f(pt.line)], [100, 0], "release", "solid");
        tlPlateOpacity(p, [f(0), f(pt.text)], [100, 0], "soft", "text");
      } else {
        tlPlateOpacity(p, [f(0), f(pt.shadow)], [100, 0], "soft", "shadow");
        var tb = f(pt.shadow) - 0.02;
        var ops = tlpOps(p);
        for (var oi = 0; oi < ops.length; oi++) {
          if (tlpSel(p, ops[oi], "text")) tlpHold(kbProp(ops[oi].l, ["ADBE Transform Group", "ADBE Opacity"]), tb, ops[oi].base, 0);
        }
        tlPlateOpacity(p, [f(pt.shadow), f(pt.shadow + pt.body)], [100, 0], "release", "solid");
      }
      if (o.under) {
        o.under.enabled = true;
        o.under.inPoint = t0;
      }
    } else if (m === "out") {
      if (o.to) {
        var anc = kbProp(p.plate, ["ADBE Transform Group", "ADBE Anchor Point"]).valueAtTime(t0, false);
        if (Math.abs(anc[0] - o.to[0]) > 0.01 || Math.abs(anc[1] - o.to[1]) > 0.01) {
          if (kbProp(p.plate, ["ADBE Transform Group", "ADBE Anchor Point"]).numKeys === 0 && kbProp(p.plate, ["ADBE Transform Group", "ADBE Scale"]).numKeys === 0) tlPlateRepivot(p.plate, null, o.to);
          else tlPlateRepivot(p.plate, t0, o.to);
        }
      }
      var sc = kbProp(p.plate, ["ADBE Transform Group", "ADBE Scale"]);
      tlpKeys(sc, [[f(0), tlpScaleVal(sc, 100)], [f(pt.scale), tlpScaleVal(sc, 0), "release"]]);
      tlPlateOpacity(p, [f(0), f(pt.text)], [100, 0], "soft", "text");
    } else {
      var pos = kbProp(p.root, ["ADBE Transform Group", "ADBE Position"]);
      var rot = kbProp(p.root, ["ADBE Transform Group", "ADBE Rotate Z"]);
      var rsc = kbProp(p.root, ["ADBE Transform Group", "ADBE Scale"]);
      var px = pos.valueAtTime(t0, false)[0], py = pos.valueAtTime(t0, false)[1];
      var rz = rot.valueAtTime(t0, false);
      var s0 = rsc.valueAtTime(t0, false);
      var lesson = S.name === "lesson";
      var up = lesson ? 103.6 : 106, spin = lesson ? 1.8 : 3, fly = lesson ? -156 : -260, dxx = lesson ? 24 : 40;
      var T6 = pt.lift, T14 = pt.lift + pt.fly;
      tlpKeys(rsc, [[f(0), tlpScaleVal(rsc, s0[0])], [f(T6), tlpScaleVal(rsc, s0[0] * up / 100), "soft"]]);
      tlpKeys(rot, [[f(0), rz], [f(T6), rz + spin, "soft"]]);
      tlpKeys(pos, [[f(T6), [px, py]], [f(T14), [px + dxx, py + fly], "release"]]);
      var cast = p.shadow.cast, contact = p.shadow.contact;
      tlpKeys(kbProp(cast, ["ADBE Transform Group", "ADBE Position"]), [[f(0), [L.cast.dx, L.cast.dy]], [f(T6), [18, 30], "soft"]]);
      tlpKeys(kbProp(cast, ["ADBE Effect Parade", "ADBE Gaussian Blur 2", "ADBE Gaussian Blur 2-0001"]), [[f(0), L.cast.blur], [f(T6), 26, "soft"]]);
      // непрозрачность: все слои гаснут за последние 3 к. вылета (11 → 14 при hand); cast заодно 12 → 8 % за подъём
      var fadeLen = lesson ? 4 : 3;
      var fadeStart = T14 - fadeLen;
      tlPlateOpacity(p, [f(fadeStart), f(T14)], [100, 0], "soft", "nocast");
      // унесённые вместе (o.carry: плашка или массив плашек — штамп на карточке): корень — ребёнок root, трансформ наследует, непрозрачность — нет, гасим теми же ключами
      var carry = o.carry ? (o.carry.length !== undefined && o.carry.root === undefined ? o.carry : [o.carry]) : [];
      for (var ci = 0; ci < carry.length; ci++) tlPlateOpacity(carry[ci], [f(fadeStart), f(T14)], [100, 0], "soft", "all");
      tlpKeys(kbProp(cast, ["ADBE Transform Group", "ADBE Opacity"]), [[f(0), L.cast.opacity], [f(T6), 8, "soft"], [f(fadeStart), 8, "soft"], [f(T14), 0, "soft"]]);
      tlpKeys(kbProp(contact, ["ADBE Transform Group", "ADBE Opacity"]), [[f(0), L.contact.opacity], [f(lesson ? 3 : 2), 0, "soft"]]);
      // contact уже 0 к концу вылета; общая непрозрачность на нём не нужна, но слой гаснет в нуле
    }
    kbLog("PLATEOUT " + p.name + " " + m + " start f" + Math.round(t0 * 30) + " end f" + Math.round(plan.end * 30) + " str " + str.toFixed(2));
  }
};

/**
 * Дрожь оттиска и удар штампа: позиция корня на двойках (kbHandNoise от seed), амплитуда 2 px, к. 4 → 7.
 * @param {Layer} root
 * @param {number} t0 старт
 * @param {number} seed
 * @param {any} base позиция
 */
function tlpStampTremor(root, t0, seed, base) {
  var pos = kbProp(root, ["ADBE Transform Group", "ADBE Position"]);
  var rnd = kbHandNoise(seed * 7 + 3);
  var keys = [];
  var amp = [2, 1, 0];
  for (var i = 0; i < 3; i++) {
    var a = rnd() * 2 * Math.PI;
    keys.push([t0 + (4 + 2 * i) / 30, [base[0] + amp[i] * Math.cos(a), base[1] + amp[i] * Math.sin(a)], i > 0 ? "hold" : undefined]);
  }
  tlpKeys(pos, keys);
}

/**
 * №25 stamp-in — штамп с размаху, первый из двух ударов ролика (spec §5.4): масштаб 160 → 94 (удар, провал ≤ hitCap) → 100 за 8 к., поворот tilt − 6 → tilt,
 * непрозрачность 0 → 100 за 2 к.; на ударе дрожь 2 px, Roughen Border 1 → 3, кляксы (3 точки тушью снаружи внешней рамки, hold на hit − 0,02 с) и вздрагивание плашки
 * on (+3 px вниз за 1 к., обратно за 3 к.); после к. 8 — кипение края. Опции: plate (штамп), at (удар) | start, on (плашка-подложка: штамп становится её ребёнком
 * с самого начала), blots (3; 0 выключает), seed. lesson: 130 → 100 за 10 к. без провала, без дрожи, клякс и вздрагивания, Roughen 3 постоянно, thud × 0,6.
 */
TL_MOVES["stamp-in"] = {
  group: "plate-in", slot: "in", units: [], unit: "word",
  frames: { hit: 4, settle: 8 }, stagger: {}, over: 0.06, lead: 0, sfx: null,
  params: { blots: 3, strength: 1 },
  plan: function (layer, o, S) {
    tlPlateGuardStyle("stamp-in");
    var p = tlpNeed("stamp-in", o);
    if (p.kind !== "badge") throw new Error("stamp-in: нужен штамп (kind badge), а не " + p.kind);
    var lesson = S.name === "lesson";
    var hitFr = lesson ? 10 : 4;
    var endFr = lesson ? 10 : 8;
    var start = tlpStart(o, hitFr);
    return { n: 0, unit: "", starts: [], start: start, hit: start + hitFr / 30, end: start + endFr / 30, total: endFr, unitFr: endFr, staggerFr: 0, hitFr: hitFr, endFr: endFr };
  },
  run: function (layer, o, S, plan) {
    var p = o.plate;
    var lesson = S.name === "lesson";
    var str = o.strength * S.strength;
    var t0 = plan.start;
    var f = function (n) { return t0 + n / 30; };
    var on = o.on || null;
    var root = p.root;
    var pos = kbProp(root, ["ADBE Transform Group", "ADBE Position"]);
    var rot = kbProp(root, ["ADBE Transform Group", "ADBE Rotate Z"]);
    var sc = kbProp(root, ["ADBE Transform Group", "ADBE Scale"]);
    var lay = p.print;
    // подложка: штамп с самого начала ребёнок её root, ключи — в её системе (parent в AE не анимируется)
    if (on) {
      var th = plan.hit;
      var pc = pos.value;
      var rc = rot.value;
      var lp = tlpFromComp(on.root, pc[0], pc[1], th);
      var cardRot = tlpT(on.root, "ADBE Rotate Z", th);
      root.setParentWithJump(on.root);
      pos.setValue([lp[0], lp[1]]);
      rot.setValue(rc - cardRot);
    }
    var base = pos.value;
    var rz = rot.value;
    var dip = Math.min(0.06 * str, S.hitCap > 0 ? S.hitCap : 0.06);
    var low = 100 - dip * 100;
    if (lesson) {
      tlpKeys(sc, [[f(0), tlpScaleVal(sc, 130)], [f(10), tlpScaleVal(sc, 100), "snap"]]);
      tlpKeys(rot, [[f(0), rz - 3.6], [f(10), rz, "snap"]]);
      tlPlateOpacity(p, [f(0), f(3)], [0, 100], "soft", "all");
    } else {
      tlpKeys(sc, [[f(0), tlpScaleVal(sc, 160)], [f(4), tlpScaleVal(sc, low), "release"], [f(8), tlpScaleVal(sc, 100), "snap"]]);
      tlpKeys(rot, [[f(0), rz - 6], [f(4), rz, "release"]]);
      tlPlateOpacity(p, [f(0), f(2)], [0, 100], "soft", "all");
      tlpStampTremor(root, t0, p.seed || 5, [base[0], base[1]]);
      // Roughen Edges Border 1 → 3 (чернила впитываются)
      var inkB = tlpInkBorders(p);
      for (var ib = 0; ib < inkB.length; ib++) tlpKeys(inkB[ib], [[f(4), 1], [f(8), TL_PLATE_LOOK.stampBorder, "snap"]]);
      if (on) {
        var opos = kbProp(on.root, ["ADBE Transform Group", "ADBE Position"]);
        var ov = opos.valueAtTime(plan.hit, false);
        tlpKeys(opos, [[f(4), [ov[0], ov[1]]], [f(5), [ov[0], ov[1] + 3], "snap"], [f(8), [ov[0], ov[1]], "soft"]]);
      }
    }
    // кипение края после посадки: Amount 0 → 1 ступенькой на к. 8 (холд без движения запрещён)
    tlBoilTwos(lay, { amount: 1, size: 24, seed: p.seed || 5 });
    var amt = kbProp(kbGroup(lay, ["ADBE Effect Parade", "ADBE Turbulent Displace"]), ["ADBE Turbulent Displace-0002"]);
    tlpKeys(amt, [[0, 0], [f(lesson ? 10 : 8), 1, "hold"]]);
    if (lesson) {
      var inkL = tlpInkBorders(p);
      for (var il = 0; il < inkL.length; il++) inkL[il].setValue(TL_PLATE_LOOK.stampBorder);
    }
    // кляксы: точки Ø 4–7 px на 8–22 px снаружи внешней рамки внутри прекомпозиции оттиска, hold 0 → 100 на hit − 0,02 с
    var nb = lesson ? 0 : o.blots;
    var seed = o.seed || p.seed || 5;
    if (nb > 0) {
      var rnd = kbHandNoise(seed * 11 + 5);
      var pre = p.pre;
      var cx = p.preC[0], cy = p.preC[1];
      var halfW = p.W / 2, halfH = p.H / 2;
      for (var b = 0; b < nb; b++) {
        var ang = ((b + rnd() * 0.8) / nb) * 2 * Math.PI;
        var dia = 4 + rnd() * 3;
        var gap = 8 + rnd() * 14;
        var rb;
        if (p.variant === "B") rb = halfW;
        else {
          var ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang));
          rb = Math.min(ca < 1e-6 ? 1e9 : halfW / ca, sa < 1e-6 ? 1e9 : halfH / sa);
        }
        var rr = rb + gap + dia / 2;
        var blot = tlpShapeLayer(pre, p.name + "-blot" + b, [tlpCircle(0, 0, dia / 2)], { fill: tlpPal().ink });
        kbInkEdge(blot, 2);
        kbProp(blot, ["ADBE Transform Group", "ADBE Position"]).setValue([cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]);
        tlpHold(kbProp(blot, ["ADBE Transform Group", "ADBE Opacity"]), plan.hit - 0.02, 0, 100);
        kbLog("BLOT " + p.name + " " + b + " angle " + (ang * 180 / Math.PI).toFixed(1) + " dia " + dia.toFixed(1) + " gap " + gap.toFixed(1));
      }
    }
    // STAMPBOX: рамка (повёрнутая, с масштабом) на каждом кадре разгона — для записанного исключения сейф-зоны
    var nbox = lesson ? 0 : 4;
    p.boxes = [];
    for (var k = 0; k < nbox; k++) {
      var tk = f(k);
      var hw = p.W / 2, hh = p.H / 2;
      var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      if (p.variant === "B") { // круглый мөр: габарит окружности, не описанного квадрата
        var cc = tlpToComp(root, 0, 0, tk);
        var rs = tlpT(root, "ADBE Scale", tk)[0] / 100;
        bx0 = cc[0] - hw * rs; bx1 = cc[0] + hw * rs; by0 = cc[1] - hw * rs; by1 = cc[1] + hw * rs;
      } else {
        var cs = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
        for (var ci = 0; ci < 4; ci++) {
          var q = tlpToComp(root, cs[ci][0], cs[ci][1], tk);
          if (q[0] < bx0) bx0 = q[0];
          if (q[1] < by0) by0 = q[1];
          if (q[0] > bx1) bx1 = q[0];
          if (q[1] > by1) by1 = q[1];
        }
      }
      p.boxes.push([bx0, by0, bx1, by1]);
      kbLog("STAMPBOX " + p.name + " f" + k + " (" + bx0.toFixed(0) + "," + by0.toFixed(0) + "," + bx1.toFixed(0) + "," + by1.toFixed(0) + ")");
    }
    tlpSfx(layer, plan.hit, "thud", str);
    kbLog("STAMP " + p.name + " start f" + Math.round(t0 * 30) + " hit f" + Math.round(plan.hit * 30) + " dip " + (lesson ? "-" : low.toFixed(0)) + " blots " + nb + " on " + (on ? on.name : "-"));
  }
};

/**
 * №26 tag-peel — с окончания отклеивается ярлык-копия (spec §5.5). До старта ярлык стоит точно на окончании (текст = глифам ± 0,5 px, все слои прозрачны), опора root —
 * левый нижний угол. 0 → 3 к.: проявление; 3 → 9 к. snap: масштаб 100 → 110, поворот 0 → −6°, cast: смещение y 4 → 18, размытие 6 → 22; contact 18 → 0 за 3 → 5 к.
 * Слово остаётся целым. lesson: 4 + 8 к., 106 %, −3,6° (сила × 0,6). sfx нет. Журнал PEEL.
 */
TL_MOVES["tag-peel"] = {
  group: "plate-in", slot: "in", units: [], unit: "word",
  frames: { show: 3, lift: 6 }, stagger: {}, over: 0, lead: 0, sfx: null,
  params: { strength: 1 },
  plan: function (layer, o, S) {
    tlPlateGuardStyle("tag-peel");
    var p = tlpNeed("tag-peel", o);
    if (p.kind !== "tag") throw new Error("tag-peel: нужен ярлык (kind tag)");
    var lesson = S.name === "lesson";
    var showFr = lesson ? 4 : 3, liftFr = lesson ? 8 : 6;
    var start;
    if (o.start !== undefined && o.at === undefined) start = o.start;
    else if (o.at !== undefined && o.start === undefined) start = o.at - (showFr + liftFr) / 30;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    return { n: 0, unit: "", starts: [], start: start, hit: start + (showFr + liftFr) / 30, end: start + (showFr + liftFr) / 30, total: showFr + liftFr, unitFr: showFr + liftFr, staggerFr: 0, showFr: showFr, liftFr: liftFr };
  },
  run: function (layer, o, S, plan) {
    var p = o.plate;
    var lesson = S.name === "lesson";
    var str = o.strength * S.strength;
    var t0 = plan.start;
    var f = function (n) { return t0 + n / 30; };
    var sp = tlpSide(p);
    var L = TL_PLATE_LOOK;
    // опора — левый нижний угол ярлыка (до ключей)
    tlPlateRepivot(p.root, null, [-sp.W / 2, sp.H / 2]);
    var sc = kbProp(p.root, ["ADBE Transform Group", "ADBE Scale"]);
    var rot = kbProp(p.root, ["ADBE Transform Group", "ADBE Rotate Z"]);
    var r0 = rot.value;
    var a = plan.showFr, b = plan.showFr + plan.liftFr;
    var up = 100 + (lesson ? 10 * str : 10);
    var turn = lesson ? -6 * str : -6;
    // проявление под буквами: все слои 0 → 100 % своей базы (тени растут до 12 / 18 %)
    tlPlateOpacity(p, [f(0), f(a)], [0, 100], "soft", "all");
    tlpKeys(sc, [[f(a), tlpScaleVal(sc, 100)], [f(b), tlpScaleVal(sc, up), "snap"]]);
    tlpKeys(rot, [[f(a), r0], [f(b), r0 + turn, "snap"]]);
    var cast = sp.shadow.cast, contact = sp.shadow.contact;
    tlpKeys(kbProp(cast, ["ADBE Transform Group", "ADBE Position"]), [[f(a), [L.cast.dx, 4]], [f(b), [L.cast.dx, 18], "snap"]]);
    tlpKeys(kbProp(cast, ["ADBE Effect Parade", "ADBE Gaussian Blur 2", "ADBE Gaussian Blur 2-0001"]), [[f(a), 6], [f(b), 22, "snap"]]);
    tlPlateOpacity(p, [f(a), f(a + 2)], [100, 0], "soft", "contact");
    // совпадение глифов: текст ярлыка против слоя окончания (если он задан)
    var align = -1;
    if (o.over || p.over) {
      var under = o.over || p.over;
      var ik = tlpInk(under, t0);
      var tk = sp.text[0];
      var tt = tlpInk(tk, t0 - 1);
      align = Math.max(Math.abs(ik.left - tt.left), Math.abs(ik.right - tt.right), Math.abs(ik.base - tt.base));
    }
    p.peel = { align: align, up: up, turn: turn };
    kbLog("PEEL " + p.name + " start f" + Math.round(t0 * 30) + " lift f" + Math.round((t0 + a / 30) * 30) + " end f" + Math.round(plan.end * 30) + " align " + (align < 0 ? "-" : align.toFixed(2)) + " scale " + up.toFixed(2) + " rot " + (r0 + turn).toFixed(2));
  }
};

/**
 * Расстояние от точки до отрезка.
 * @param {number[]} p
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function tlpSegDist(p, a, b) {
  var vx = b[0] - a[0], vy = b[1] - a[1];
  var l2 = vx * vx + vy * vy;
  var t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2));
  var dx = p[0] - (a[0] + vx * t), dy = p[1] - (a[1] + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Зазор между выпуклым четырёхугольником (ярлык в кадре) и кругом {c, r} (отрицательный — пересечение) или прямоугольником {x0, y0, x1, y1}.
 * @param {number[][]} poly 4 угла
 * @param {any} a {c, r} | {x0, y0, x1, y1}
 * @returns {number}
 */
function tlpClearOf(poly, a) {
  var i;
  if (a.c) {
    var d = 1e9;
    for (i = 0; i < 4; i++) d = Math.min(d, tlpSegDist(a.c, poly[i], poly[(i + 1) % 4]));
    // центр внутри четырёхугольника?
    var inside = true;
    for (i = 0; i < 4; i++) {
      var p0 = poly[i], p1 = poly[(i + 1) % 4];
      var cr = (p1[0] - p0[0]) * (a.c[1] - p0[1]) - (p1[1] - p0[1]) * (a.c[0] - p0[0]);
      if (cr < 0) inside = false;
    }
    if (!inside) {
      var inside2 = true;
      for (i = 0; i < 4; i++) {
        var q0 = poly[i], q1 = poly[(i + 1) % 4];
        var cr2 = (q1[0] - q0[0]) * (a.c[1] - q0[1]) - (q1[1] - q0[1]) * (a.c[0] - q0[0]);
        if (cr2 > 0) inside2 = false;
      }
      inside = inside2;
    }
    return (inside ? -d : d) - a.r;
  }
  // прямоугольник: минимум по точкам рёбер многоугольника до прямоугольника и по углам прямоугольника до многоугольника
  var best = 1e9;
  for (i = 0; i < 4; i++) {
    var s0 = poly[i], s1 = poly[(i + 1) % 4];
    for (var k = 0; k <= 40; k++) {
      var px = s0[0] + (s1[0] - s0[0]) * k / 40, py = s0[1] + (s1[1] - s0[1]) * k / 40;
      var dx = Math.max(a.x0 - px, 0, px - a.x1), dy = Math.max(a.y0 - py, 0, py - a.y1);
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
    }
  }
  var corners = [[a.x0, a.y0], [a.x1, a.y0], [a.x1, a.y1], [a.x0, a.y1]];
  for (i = 0; i < 4; i++) for (var j = 0; j < 4; j++) best = Math.min(best, tlpSegDist(corners[i], poly[j], poly[(j + 1) % 4]));
  return best;
}

/**
 * №27 arc-fly — полёт ярлыка по дуге (spec §5.6). Квадратичная Безье P(u) = (1−u)²·P0 + 2u(1−u)·C + u²·P1, C = 2·apex − (P0 + P1)/2; ключ позиции на каждый кадр
 * (N = 9 к., lesson 12): ballistic — u = f/N равными шагами (бросок), иначе u = tlBz(f/N, soft) (подлёт к руке). Поворот rot0 + (rotTo − rot0)·u + spin·sin(πu)
 * (spin: подлёт +6°, бросок −8°; lesson × 0,6), масштаб scale0 → scaleTo линейно по u. flip — окно переворота по середине полёта: лицевая rotationY 0 → 90° за 3 к.
 * (release), обратная −90 → 0° за 3 к. (snap), подмена сторон hold-ключами непрозрачности всех слоёв сторон на k − 0,02 с (нет кадра с двумя сторонами).
 * Опции: plate, to (центр в кадре), apex, from (по умолчанию — текущий центр), ballistic, flip, spin, rotTo, scaleTo, at (прибытие) | start, avoid (зазоры: список
 * {name, c, r, dy: function(t), min} | {name, x0, y0, x1, y1, min}). Опора root — центр ярлыка (смена опоры без скачка). sfx whoosh 0,5 на старте.
 */
TL_MOVES["arc-fly"] = {
  group: "plate-accent", slot: "accent", units: [], unit: "word",
  frames: { fly: 9 }, stagger: {}, over: 0, lead: 0, sfx: { kind: "whoosh", strength: 0.5, at: "start" },
  params: { ballistic: false, flip: false, strength: 1 },
  plan: function (layer, o, S) {
    tlPlateGuardStyle("arc-fly");
    var p = tlpNeed("arc-fly", o);
    if (p.kind !== "tag") throw new Error("arc-fly: нужен ярлык (kind tag)");
    if (!o.to || !o.apex) throw new Error("arc-fly: нужны to и apex");
    if (o.flip && !p.sides) throw new Error("arc-fly: переворот — только у ярлыка с двумя сторонами (sides)");
    var N = S.name === "lesson" ? 12 : 9;
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - N / 30;
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    return { n: 0, unit: "", starts: [], start: start, hit: start + N / 30, end: start + N / 30, total: N, unitFr: N, staggerFr: 0, N: N };
  },
  run: function (layer, o, S, plan) {
    var p = o.plate;
    var root = p.root;
    var lesson = S.name === "lesson";
    var N = plan.N;
    var t0 = plan.start;
    var f = function (n) { return t0 + n / 30; };
    var ancP = kbProp(root, ["ADBE Transform Group", "ADBE Anchor Point"]);
    var posP = kbProp(root, ["ADBE Transform Group", "ADBE Position"]);
    var rotP = kbProp(root, ["ADBE Transform Group", "ADBE Rotate Z"]);
    var scP = kbProp(root, ["ADBE Transform Group", "ADBE Scale"]);
    // опора в центр ярлыка
    var anc = ancP.valueAtTime(t0, false);
    if (Math.abs(anc[0]) > 0.01 || Math.abs(anc[1]) > 0.01) {
      var moving = ancP.numKeys > 0 || posP.numKeys > 0 || rotP.numKeys > 0 || scP.numKeys > 0;
      tlPlateRepivot(root, moving ? t0 : null, [0, 0]);
    }
    var P0 = o.from ? o.from : tlpToComp(root, 0, 0, t0);
    var P1 = o.to;
    var A = o.apex;
    var C = [2 * A[0] - (P0[0] + P1[0]) / 2, 2 * A[1] - (P0[1] + P1[1]) / 2];
    var rot0 = rotP.valueAtTime(t0, false);
    var rotTo = o.rotTo !== undefined ? o.rotTo : rot0;
    var spin = (o.spin !== undefined ? o.spin : (o.ballistic ? -8 : 6)) * (lesson ? 0.6 : 1);
    var s0 = scP.valueAtTime(t0, false)[0];
    var sTo = o.scaleTo !== undefined ? o.scaleTo : s0;
    var kp = [], kr = [], ks = [];
    var us = [];
    var i;
    for (i = 0; i <= N; i++) {
      var u = o.ballistic ? i / N : tlBz(i / N, "soft");
      us.push(u);
      var x = (1 - u) * (1 - u) * P0[0] + 2 * u * (1 - u) * C[0] + u * u * P1[0];
      var y = (1 - u) * (1 - u) * P0[1] + 2 * u * (1 - u) * C[1] + u * u * P1[1];
      var pp = root.parent ? tlpFromComp(root.parent, x, y, f(i)) : [x, y];
      kp.push([f(i), pp, i > 0 ? "linear" : undefined]);
      kr.push([f(i), rot0 + (rotTo - rot0) * u + spin * Math.sin(Math.PI * u), i > 0 ? "linear" : undefined]);
      var sv = s0 + (sTo - s0) * u;
      ks.push([f(i), tlpScaleVal(scP, sv), i > 0 ? "linear" : undefined]);
    }
    tlpKeys(posP, kp);
    tlpKeys(rotP, kr);
    tlpKeys(scP, ks);
    // переворот
    var k = Math.round(N / 2);
    if (o.flip) {
      var w = lesson ? 4 : 3;
      var kkSide = p.sides.kk.layers[0], enSide = p.sides.en.layers[0];
      tlpKeys(kbProp(kkSide, ["ADBE Transform Group", "ADBE Rotate Y"]), [[f(k - w), 0], [f(k), 90, "release"]]);
      tlpKeys(kbProp(enSide, ["ADBE Transform Group", "ADBE Rotate Y"]), [[f(k), -90], [f(k + w), 0, "snap"]]);
      var tsw = f(k) - 0.02;
      var ops = tlpOps(p);
      for (i = 0; i < ops.length; i++) {
        var pr = kbProp(ops[i].l, ["ADBE Transform Group", "ADBE Opacity"]);
        if (ops[i].side === "kk") tlpHold(pr, tsw, ops[i].base, 0);
        else if (ops[i].side === "en") tlpHold(pr, tsw, 0, ops[i].base);
      }
      p.active = "en";
      p.W = p.sides.en.W;
      p.H = p.sides.en.H;
      kbLog("FLIP " + p.name + " front 0→90 f" + Math.round(f(k - w) * 30) + "–f" + Math.round(f(k) * 30) + " back f" + Math.round(f(k) * 30) + "–f" + Math.round(f(k + w) * 30) +
        " switch t " + tsw.toFixed(4));
    }
    // зазоры на каждом кадре полёта
    var clear = {};
    var av = o.avoid || [];
    for (var ai = 0; ai < av.length; ai++) {
      var a = av[ai];
      var minD = 1e9, minF = -1;
      var overF = [];
      for (i = 0; i <= N; i++) {
        var tk = f(i);
        var sd = (o.flip && i >= k) ? p.sides.en : tlpSide(p);
        var hw = sd.W / 2, hh = sd.H / 2;
        var poly = [tlpToComp(root, -hw, -hh, tk), tlpToComp(root, hw, -hh, tk), tlpToComp(root, hw, hh, tk), tlpToComp(root, -hw, hh, tk)];
        var shape = a;
        if (a.c) {
          var dyb = a.dy ? a.dy(tk) : 0;
          shape = { c: [a.c[0], a.c[1] + dyb], r: a.r };
        } else if (a.dy) {
          var dyr = a.dy(tk);
          shape = { x0: a.x0, y0: a.y0 + dyr, x1: a.x1, y1: a.y1 + dyr };
        }
        var d = tlpClearOf(poly, shape);
        if (d < minD) { minD = d; minF = i; }
        if (d <= 0) overF.push(i);
      }
      clear[a.name] = { min: minD, f: minF, need: a.min === undefined ? 0 : a.min, over: overF };
      kbLog("CLEAR " + p.name + " " + a.name + " min " + minD.toFixed(2) + " f" + minF + " need " + (a.min === undefined ? 0 : a.min) + " overlap frames [" + overF.join(",") + "]");
    }
    p.arc = { N: N, k: k, P0: P0, P1: P1, C: C, apex: A, us: us, clear: clear, spin: spin, rot0: rot0, rotTo: rotTo, s0: s0, sTo: sTo, ballistic: !!o.ballistic };
    kbLog("ARC " + p.name + " N " + N + " ballistic " + (o.ballistic ? 1 : 0) + " apex (" + A[0].toFixed(1) + "," + A[1].toFixed(1) + ") C (" + C[0].toFixed(1) + "," + C[1].toFixed(1) + ") flip k " + (o.flip ? "f" + Math.round(f(k) * 30) : "-"));
  }
};

/**
 * №28 suffix-dock — ярлык прилипает к основе, второй удар ролика (spec §5.7). Касание c = at − 2 к. (конец arc-fly). В c смена опоры в стык на базе (левый край чернил
 * текста стороны, база); перелёт вниз 0,08·H за c → c+2 (snap) и обратно за 6 к. (soft); сжатие 108/92 и обратно; основа вздрагивает на +6 px; кадр вздрагивает
 * (kbShake на пустышке shake, амплитуда 6, звать до назначения детей); sfx tick (сила 1) + pop (0,6), в lesson — только tick 0,6. После c+8 — plate-out melt.
 * Опции: plate, stem (слой основы), under (слой строки ER под ярлыком), shake (пустышка кадра), at | start (= c).
 */
TL_MOVES["suffix-dock"] = {
  group: "plate-accent", slot: "accent", units: [], unit: "word",
  frames: { contact: 2, settle: 8 }, stagger: {}, over: 0.08, lead: 2, sfx: null,
  params: { strength: 1 },
  plan: function (layer, o, S) {
    tlPlateGuardStyle("suffix-dock");
    var p = tlpNeed("suffix-dock", o);
    if (p.kind !== "tag") throw new Error("suffix-dock: нужен ярлык (kind tag)");
    var c;
    if (o.at !== undefined && o.start === undefined) c = o.at - 2 / 30;
    else if (o.start !== undefined && o.at === undefined) c = o.start;
    else throw new Error("нужно ровно одно из at | start");
    c = Math.round(c * 30) / 30;
    return { n: 0, unit: "", starts: [], start: c, hit: c + 2 / 30, end: c + 8 / 30, total: 8, unitFr: 8, staggerFr: 0, c: c };
  },
  run: function (layer, o, S, plan) {
    var p = o.plate;
    var root = p.root;
    var lesson = S.name === "lesson";
    var str = o.strength * S.strength;
    var c = plan.c;
    var f = function (n) { return c + n / 30; };
    var sp = tlpSide(p);
    var posP = kbProp(root, ["ADBE Transform Group", "ADBE Position"]);
    var scP = kbProp(root, ["ADBE Transform Group", "ADBE Scale"]);
    // совпадение глифов в момент касания (до перелёта): текст ярлыка против слоя строки
    var align = -1;
    if (o.under) {
      var ik = tlpInk(o.under, c);
      var tk = tlpInk(sp.text[0], c);
      align = Math.max(Math.abs(ik.left - tk.left), Math.abs(ik.right - tk.right), Math.abs(ik.base - tk.base));
    }
    // опора — стык на базе: левый край чернил текста стороны, база
    var jx = sp.textCx - sp.inkW / 2;
    tlPlateRepivot(root, c, [jx, sp.base]);
    var Pc = posP.valueAtTime(c, false);
    var over = Math.min(0.08 * str, S.hitCap > 0 ? S.hitCap : 0);
    var dy = over * sp.H;
    var sq = over > 0 ? 8 * (over / 0.08) : 0;
    if (over > 0) {
      tlpKeys(posP, [[f(0), [Pc[0], Pc[1]]], [f(2), [Pc[0], Pc[1] + dy], "snap"], [f(8), [Pc[0], Pc[1]], "soft"]]);
      tlpKeys(scP, [[f(0), tlpScaleVal(scP, 100, 100)], [f(2), tlpScaleVal(scP, 100 + sq, 100 - sq), "snap"], [f(8), tlpScaleVal(scP, 100, 100), "snap"]]);
    }
    var stemPx = 0;
    if (o.stem && over > 0) {
      var sPos = kbProp(o.stem, ["ADBE Transform Group", "ADBE Position"]);
      var sv = sPos.valueAtTime(c, false);
      stemPx = 6;
      tlpKeys(sPos, [[f(0), [sv[0], sv[1]]], [f(3), [sv[0], sv[1] + stemPx], "snap"], [f(9), [sv[0], sv[1]], "soft"]]);
    }
    if (o.shake && over > 0) kbShake(o.shake, [c], { amount: 6, freq: 22, attack: 0.06, decay: 0.25 });
    if (lesson) {
      tlpSfx(layer, c, "tick", 0.6);
    } else {
      tlpSfx(layer, c, "tick", str);
      tlpSfx(layer, c, "pop", 0.6 * o.strength);
    }
    kbLog("DOCK " + p.name + " contact f" + Math.round(c * 30) + " over " + dy.toFixed(2) + " squash " + (100 + sq) + "/" + (100 - sq) + " stem " + stemPx + " align " + (align < 0 ? "-" : align.toFixed(2)));
  }
};

/**
 * Спрятать слои плашки до нужного момента (строка карточки, на которую встанет слово): слои выходят из tlPlateOpacity и держат непрозрачность 0;
 * word-to-card вернёт их в учёт при подмене.
 * @param {any} p
 * @param {Layer[]} layers
 */
function tlPlateHide(p, layers) {
  var ops = tlpOps(p);
  p.hidden = p.hidden || [];
  for (var i = 0; i < layers.length; i++) {
    for (var j = ops.length - 1; j >= 0; j--) {
      if (ops[j].l === layers[i]) {
        p.hidden.push({ l: layers[i], base: ops[j].base, kind: ops[j].kind, side: ops[j].side });
        ops.splice(j, 1);
        break;
      }
    }
    kbProp(layers[i], ["ADBE Transform Group", "ADBE Opacity"]).setValue(0);
  }
}

/**
 * Самый верхний предок слоя (или он сам).
 * @param {Layer} l
 * @returns {Layer}
 */
function tlpTop(l) {
  var t = l;
  while (t.parent) t = t.parent;
  return t;
}

/**
 * №32 word-to-card — слово уезжает строкой в карточку (spec §5.8). Части слова становятся детьми пустышки w2c в стыке слова; 10 к. soft по параметру u:
 * масштаб 100 → S_row/S_word × масштаб root карточки на t_s, поворот 0 → поворот карточки, позиция по квадратичной дуге с вершиной на 30 % длины НИЖЕ прямой.
 * Цель берётся на момент подмены t_s = конец − 0,02 с (карточка дышит hold-alive): позиция — стык строки в кадре, масштаб и поворот — root карточки на t_s.
 * Подмена hold-ключами на t_s: части слова 100 → 0, части строки 0 → 100 (слово над карточкой). lesson 13 к. Опции: parts [основа, окончание], target [основа, окончание строки],
 * card (плашка), at (конец) | start.
 */
TL_MOVES["word-to-card"] = {
  group: "plate-out", slot: "out", units: [], unit: "word",
  frames: { move: 10 }, stagger: {}, over: 0, lead: 0, sfx: null,
  params: { strength: 1 },
  plan: function (layer, o, S) {
    tlPlateGuardStyle("word-to-card");
    if (!o.parts || o.parts.length !== 2 || !o.target || o.target.length !== 2 || !o.card) throw new Error("word-to-card: нужны parts [основа, окончание], target [основа, окончание] и card");
    var T = S.name === "lesson" ? 13 : 10;
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - T / 30;
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    return { n: 0, unit: "", starts: [], start: start, hit: start + T / 30, end: start + T / 30, total: T, unitFr: T, staggerFr: 0, T: T };
  },
  run: function (layer, o, S, plan) {
    var T = plan.T;
    var t0 = plan.start;
    var f = function (n) { return t0 + n / 30; };
    var tS = t0 + T / 30 - 0.02;
    var card = o.card;
    var comp = layer.containingComp;
    var stem = o.parts[0], suf = o.parts[1];
    var rs = o.target[0], rf = o.target[1];
    var w0 = tlpInk(stem, t0), w1 = tlpInk(suf, t0);
    var J = [(w0.right + w1.left) / 2, (w0.rbase + w1.base) / 2];
    // слово летит и подменяется строкой карточки в одном кадре: размытие в движении на частях слова давало смаз 18–50 px на к. 27–29 и скачок резкости на подмене
    // (16.10, решение «вариант 1»); у частей слова и строки переключатель motionBlur выключен всегда, как у char-in SMALL в ячейке D
    var blurOff = [stem, suf, rs, rf];
    for (var bi = 0; bi < blurOff.length; bi++) { try { blurOff[bi].motionBlur = false; } catch (eb) { /* слой без переключателя */ } }
    var n = tlpNull(comp, stem.name + " w2c", J[0], J[1]);
    var top = tlpTop(stem);
    var topS = tlpTop(suf);
    top.setParentWithJump(n);
    if (!top.parent || top.parent !== n) throw new Error("word-to-card: не удалось привязать слово к w2c");
    var tp = kbProp(top, ["ADBE Transform Group", "ADBE Position"]);
    var v = tp.value;
    if (!tp.numKeys) tp.setValue(v.length > 2 ? [v[0] - J[0], v[1] - J[1], v[2]] : [v[0] - J[0], v[1] - J[1]]);
    if (topS !== top) {
      topS.setParentWithJump(n);
      var sp2 = kbProp(topS, ["ADBE Transform Group", "ADBE Position"]);
      var v2 = sp2.value;
      if (!sp2.numKeys) sp2.setValue(v2.length > 2 ? [v2[0] - J[0], v2[1] - J[1], v2[2]] : [v2[0] - J[0], v2[1] - J[1]]);
    }
    // цель на t_s
    var r0 = tlpInk(rs, tS), r1 = tlpInk(rf, tS);
    var R = [(r0.right + r1.left) / 2, (r0.rbase + r1.base) / 2];
    var Sw = tlFontSize(stem), Sr = tlFontSize(rs);
    var cardScale = tlpT(card.root, "ADBE Scale", tS)[0] / 100;
    var cardRot = tlpT(card.root, "ADBE Rotate Z", tS);
    var sEnd = 100 * (Sr / Sw) * cardScale;
    var rEnd = cardRot;
    // дуга: вершина (u = 0,5) на 30 % длины ниже прямой
    var dx = R[0] - J[0], dy = R[1] - J[1];
    var Ld = Math.sqrt(dx * dx + dy * dy);
    var nx = -dy / Ld, ny = dx / Ld;
    if (ny < 0) { nx = -nx; ny = -ny; }
    var apex = [(J[0] + R[0]) / 2 + 0.30 * Ld * nx, (J[1] + R[1]) / 2 + 0.30 * Ld * ny];
    var C = [2 * apex[0] - (J[0] + R[0]) / 2, 2 * apex[1] - (J[1] + R[1]) / 2];
    var posP = kbProp(n, ["ADBE Transform Group", "ADBE Position"]);
    var rotP = kbProp(n, ["ADBE Transform Group", "ADBE Rotate Z"]);
    var scP = kbProp(n, ["ADBE Transform Group", "ADBE Scale"]);
    var kp = [], kr = [], ks = [];
    var us = [];
    var i;
    for (i = 0; i <= T; i++) {
      var tt = i < T ? f(i) : tS;
      var uu = i < T ? tlBz(i / T, "soft") : 1;
      if (i === T - 1) { /* кадр T − 1: u из таблицы */ }
      us.push(uu);
      var x = (1 - uu) * (1 - uu) * J[0] + 2 * uu * (1 - uu) * C[0] + uu * uu * R[0];
      var y = (1 - uu) * (1 - uu) * J[1] + 2 * uu * (1 - uu) * C[1] + uu * uu * R[1];
      kp.push([tt, [x, y], i > 0 ? "linear" : undefined]);
      kr.push([tt, rEnd * uu, i > 0 ? "linear" : undefined]);
      ks.push([tt, tlpScaleVal(scP, 100 + (sEnd - 100) * uu), i > 0 ? "linear" : undefined]);
    }
    // последний ключ — на t_s (u = 1); держится до конца окна
    kp.push([f(T), [R[0], R[1]], "linear"]);
    kr.push([f(T), rEnd, "linear"]);
    ks.push([f(T), tlpScaleVal(scP, sEnd), "linear"]);
    tlpKeys(posP, kp);
    tlpKeys(rotP, kr);
    tlpKeys(scP, ks);
    // подмена: части слова 100 → 0, части строки 0 → 100 на t_s
    var wordParts = [stem, suf], rowParts = [rs, rf];
    for (i = 0; i < 2; i++) {
      var pw = kbProp(wordParts[i], ["ADBE Transform Group", "ADBE Opacity"]);
      tlpHold(pw, tS, pw.value, 0);
      var base = 100;
      if (card.hidden) for (var hi = 0; hi < card.hidden.length; hi++) if (card.hidden[hi].l === rowParts[i]) base = card.hidden[hi].base;
      var pr = kbProp(rowParts[i], ["ADBE Transform Group", "ADBE Opacity"]);
      tlpHold(pr, tS, 0, base);
      tlpOps(card).push({ l: rowParts[i], base: base, kind: "text", side: "" });
    }
    // совпадение чернил слова и строки на t_s
    var m0 = tlpInk(stem, tS), m1 = tlpInk(suf, tS);
    var q0 = tlpInk(rs, tS), q1 = tlpInk(rf, tS);
    var match = Math.max(Math.abs(m0.left - q0.left), Math.abs(m0.right - q0.right), Math.abs(m0.base - q0.base), Math.abs(m1.left - q1.left), Math.abs(m1.right - q1.right), Math.abs(m1.base - q1.base));
    kbLog("W2C diff stem l " + (m0.left - q0.left).toFixed(2) + " r " + (m0.right - q0.right).toFixed(2) + " b " + (m0.base - q0.base).toFixed(2) + " | suf l " + (m1.left - q1.left).toFixed(2) + " r " + (m1.right - q1.right).toFixed(2) + " b " + (m1.base - q1.base).toFixed(2) +
      " | word widths " + (m0.right - m0.left).toFixed(2) + "/" + (m1.right - m1.left).toFixed(2) + " row " + (q0.right - q0.left).toFixed(2) + "/" + (q1.right - q1.left).toFixed(2));
    card.w2c = { node: n, rs: rs, rf: rf, J: J, R: R, apex: apex, C: C, sEnd: sEnd, rEnd: rEnd, us: us, tS: tS, match: match, Sw: Sw, Sr: Sr, cardScale: cardScale };
    kbLog("W2C " + stem.name + " start f" + Math.round(t0 * 30) + " end f" + Math.round((t0 + T / 30) * 30) + " scale " + sEnd.toFixed(3) + " rot " + rEnd.toFixed(3) + " match " + match.toFixed(2) + " from (" +
      J[0].toFixed(1) + "," + J[1].toFixed(1) + ") to (" + R[0].toFixed(1) + "," + R[1].toFixed(1) + ")");
  }
};

/**
 * Проверка цели word-to-card после сборки (грабли wiggle: номер слоя меняет шум карточки): пересчитывает стык строки R и поворот root на t_s и сравнивает с запомненными.
 * Вызывать после того, как в композиции появились все слои. Возвращает {px, deg, ok}: px — смещение стыка, deg — поворота; ok = px ≤ 0,5 и deg ≤ 0,02.
 * @param {any} card плашка с card.w2c
 * @returns {{px: number, deg: number, ok: boolean}}
 */
function tlPlateW2cGuard(card) {
  var w = card.w2c;
  if (!w) throw new Error("tlPlateW2cGuard: у карточки нет word-to-card");
  var r0 = tlpInk(w.rs, w.tS), r1 = tlpInk(w.rf, w.tS);
  var R = [(r0.right + r1.left) / 2, (r0.rbase + r1.base) / 2];
  var rot = tlpT(card.root, "ADBE Rotate Z", w.tS);
  var px = Math.max(Math.abs(R[0] - w.R[0]), Math.abs(R[1] - w.R[1]));
  var deg = Math.abs(rot - w.rEnd);
  return { px: px, deg: deg, ok: px <= 0.5 && deg <= 0.02 };
}
