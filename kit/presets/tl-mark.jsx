// Поток 3 (сложные акценты): линия пером по точкам (tlHandPath), незамкнутый овал (tlOvalPoints), слово из частей (tlSplitParts),
// слово с дыркой (tlHoleWord) и пресеты circle-marker, word-swap, hole-letter, syllable-split (stream3/spec.md §4–5).
// Подключать ПОСЛЕ tl-ease, tl-move, tl-accent, tl-hand, tl-type (порядок spec §1): файл сам подключает только кит —
// повторный include lib/*.jsx обнулил бы реестр TL_MOVES. Всё из tl-*.jsx берётся по имени в момент вызова.
// ES3, свойства только по matchName. Подложек нет: акцент несёт линия «как рукой».

//@include "../core.jsx"
//@include "../shape.jsx"
//@include "../show-hand.jsx"

/** Доля кегля: поле антиалиасинга между рамкой sourceRectAtTime и чернилами (то же число, что TL_INK_PAD в tl-hand.jsx). */
var TLM_INK_PAD = 0.004;

// ---------------------------------------------------------------------------------------------------------------------
// Внутренние помощники
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Высота заглавных в долях кегля (из стиля).
 * @returns {number}
 */
function tlmCap() {
  return (TL_S.text && TL_S.text.cap) || 0.72;
}

/**
 * Стили, которые поддержаны пресетами потока 3 (spec §5.5): hand и lesson. Исключение до создания слоёв и ключей.
 * @param {string} name
 */
function tlmGuard(name) {
  if (TL_S.name !== "hand" && TL_S.name !== "lesson") throw new Error("«" + name + "»: стиль " + TL_S.name + " не поддержан");
}

/**
 * Значение свойства трансформа слоя в покое (до выражений).
 * @param {any} layer
 * @param {string} prop matchName
 * @returns {any}
 */
function tlmT(layer, prop) {
  return kbProp(layer, ["ADBE Transform Group", prop]).valueAtTime(0, true);
}

/**
 * Точка из системы слоя в композицию, цепочка родителей в покое (поворот 0, масштаб 100).
 * @param {any} layer
 * @param {number} x
 * @param {number} y
 * @returns {number[]}
 */
function tlmToComp(layer, x, y) {
  var p = [x, y];
  var L = layer;
  while (L) {
    var pos = tlmT(L, "ADBE Position");
    var anc = tlmT(L, "ADBE Anchor Point");
    p = [pos[0] + p[0] - anc[0], pos[1] + p[1] - anc[1]];
    L = L.parent;
  }
  return p;
}

/**
 * Точка композиции → система слоя (то, что вписывается в путь shape-слоя-ребёнка с position/anchor [0, 0]).
 * @param {any} layer
 * @param {number} x
 * @param {number} y
 * @returns {number[]}
 */
function tlmLocal(layer, x, y) {
  var chain = [];
  var L = layer;
  while (L) { chain.push(L); L = L.parent; }
  var p = [x, y];
  for (var i = chain.length - 1; i >= 0; i--) {
    var pos = tlmT(chain[i], "ADBE Position");
    var anc = tlmT(chain[i], "ADBE Anchor Point");
    p = [p[0] - pos[0] + anc[0], p[1] - pos[1] + anc[1]];
  }
  return p;
}

/**
 * Чернила текстового слоя в покое: левый/правый край и базовая линия в координатах композиции (рамка ± TLM_INK_PAD·кегль).
 * @param {any} layer
 * @returns {{l: number, r: number, base: number, rect: any, em: number}}
 */
function tlmInk(layer) {
  var rect = layer.sourceRectAtTime(0, false);
  var em = tlFontSize(layer);
  var pad = TLM_INK_PAD * em;
  var l = tlmToComp(layer, rect.left + pad, 0);
  var r = tlmToComp(layer, rect.left + rect.width - pad, 0);
  return { l: l[0], r: r[0], base: l[1], rect: rect, em: em };
}

/**
 * Путь по точкам как ломаная из кривой Catmull-Rom/6 → кубические Безье (формула kbSmoothPath): по ~400 точкам.
 * @param {number[][]} pts
 * @returns {number[][]}
 */
function tlmCurve(pts) {
  var n = pts.length;
  var out = [];
  var tans = [];
  var i;
  var j;
  for (i = 0; i < n; i++) {
    var p = pts[i === 0 ? 0 : i - 1];
    var q = pts[i === n - 1 ? i : i + 1];
    tans.push([(q[0] - p[0]) / 6, (q[1] - p[1]) / 6]);
  }
  var per = Math.max(1, Math.ceil(400 / Math.max(1, n - 1)));
  for (i = 0; i < n - 1; i++) {
    var P0 = pts[i];
    var P3 = pts[i + 1];
    var P1 = [P0[0] + tans[i][0], P0[1] + tans[i][1]];
    var P2 = [P3[0] - tans[i + 1][0], P3[1] - tans[i + 1][1]];
    for (j = 0; j < per; j++) {
      var t = j / per;
      var u = 1 - t;
      out.push([u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0],
        u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1]]);
    }
  }
  out.push([pts[n - 1][0], pts[n - 1][1]]);
  return out;
}

/**
 * Длина ломаной.
 * @param {number[][]} c
 * @returns {number}
 */
function tlmLen(c) {
  var s = 0;
  for (var i = 0; i < c.length - 1; i++) s += Math.sqrt((c[i + 1][0] - c[i][0]) * (c[i + 1][0] - c[i][0]) + (c[i + 1][1] - c[i][1]) * (c[i + 1][1] - c[i][1]));
  return s;
}

/**
 * Ключи на свойстве, где уже могут быть ключи (в отличие от tlKeysEased, который пишет весь ряд): ставит значения и кривые
 * только на переданные ключи. Скорость 0, влияние из TL_EASE; ключ без имени кривой сохраняет текущее влияние.
 * @param {Property} prop
 * @param {any[][]} keys [время с, значение, кривая отрезка, приходящего в ключ | пусто]
 */
function tlmEaseKeys(prop, keys) {
  var i;
  var d;
  for (i = 0; i < keys.length; i++) prop.setValueAtTime(keys[i][0], keys[i][1]);
  for (i = 0; i < keys.length; i++) {
    var k = prop.nearestKeyIndex(keys[i][0]);
    var curIn = prop.keyInTemporalEase(k);
    var curOut = prop.keyOutTemporalEase(k);
    var arrive = i > 0 && keys[i][2];
    var leave = i < keys.length - 1 && keys[i + 1][2];
    var inf = arrive ? TL_EASE[keys[i][2]].into : curIn[0].influence;
    var spIn = arrive ? 0 : curIn[0].speed;
    var outf = leave ? TL_EASE[keys[i + 1][2]].out : curOut[0].influence;
    var spOut = leave ? 0 : curOut[0].speed;
    var ein = [];
    var eout = [];
    for (d = 0; d < curIn.length; d++) { ein.push(new KeyframeEase(spIn, inf)); eout.push(new KeyframeEase(spOut, outf)); }
    prop.setTemporalEaseAtKey(k, /** @type {any} */ (ein), /** @type {any} */ (eout));
  }
}

/**
 * План пресета без записи и без строк журнала (подмены стиля и опции — как в раннере tlRunMove).
 * @param {any} layer
 * @param {string} name
 * @param {any} opts
 * @returns {any}
 */
function tlmPlanOf(layer, name, opts) {
  var S = TL_S;
  var from = name;
  var o = {};
  var key;
  if (S.swap[name]) name = S.swap[name];
  var def = TL_MOVES[name];
  if (!def) throw new Error("tlmPlanOf: нет пресета «" + name + "»");
  for (key in (def.params || {})) o[key] = def.params[key];
  if (from !== name && S.swapOpts && S.swapOpts[name]) for (key in S.swapOpts[name]) o[key] = S.swapOpts[name][key];
  for (key in (opts || {})) o[key] = opts[key];
  return def.plan(layer, o, S);
}

/**
 * Кадр (дробный, от старта единицы), на котором последняя буква rise на месте: остаток по y ≤ 3 px (позиция 0,56·em·amp → 0, snap).
 * @param {any} layer
 * @param {any} plan план rise
 * @param {number} strength
 * @returns {number} кадры от старта плана
 */
function tlmRiseSettle(layer, plan, strength) {
  var S = TL_S;
  var em = tlFontSize(layer);
  var amp = strength * S.strength;
  var a = Math.max(1, Math.round(2 * S.dur));
  var T = plan.unitFr;
  var span = 0.56 * em * amp;
  var lo = 0;
  var hi = 1;
  var u = 1;
  for (var k = 0; k < 30; k++) {
    u = (lo + hi) / 2;
    if (span * (1 - tlBz(u, "snap")) <= 3) hi = u; else lo = u;
  }
  var offLast = plan.starts.length > 0 ? (plan.starts[plan.starts.length - 1] - plan.start) * 30 : 0;
  return offLast + a + hi * (T - a);
}

// ---------------------------------------------------------------------------------------------------------------------
// Ядро: линия пером, овал, кипение, сдвиг ключами
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Кипение контура на двойках (spec §4.4): второй Turbulent Displace, Evolution = TL_TWOS + «seed·37 + tq·1440».
 * Пары кадров начинаются с чётного кадра той композиции, где стоит выражение. Эффект идёт на двойках TL_TWOS, а не posterizeTime:
 * при затворе 180°/−90 чётный кадр posterizeTime смешивает две фазы (зонд S2: 30 ≡ 31 попиксельно, 30 ≠ 32).
 * @param {any} layer
 * @param {{amount?: number, size?: number, seed?: number}=} o amount 2, size 24, seed 0
 */
function tlBoilTwos(layer, o) {
  o = o || {};
  var fx = kbEffect(layer, "ADBE Turbulent Displace");
  kbProp(fx, ["ADBE Turbulent Displace-0002"]).setValue(o.amount === undefined ? 2 : o.amount); // Amount
  kbProp(fx, ["ADBE Turbulent Displace-0003"]).setValue(o.size === undefined ? 24 : o.size); // Size
  kbProp(fx, ["ADBE Turbulent Displace-0006"]).expression = TL_TWOS + String((o.seed || 0) * 37) + " + tq*1440;"; // Evolution
}

/**
 * Линия пером по точкам (spec §4.1): shape-слой, путь kbSmoothPath (открытый, Catmull-Rom /6), обводка Round Cap/Join,
 * Trim End 0 → 100 % по кривой o.ease (линейная не бывает), сужение концов (taper: от обрезанного конца — зонд S1),
 * неровный край (rough), кипение на двойках (boil). Слой кончается/начинается на первом кадре Trim: круглый торец при Trim 0 % даёт точку.
 * Точки — в системе координат родителя (слой с position/anchor [0, 0], setParentWithJump без пересчёта: зонд S4), иначе композиции.
 * @param {CompItem} comp
 * @param {{name?: string, points: number[][], color: number[], thickness: number, start: number, frames: number, ease?: string,
 *   taper?: boolean, rough?: boolean, boil?: boolean|number, parent?: any, seed?: number}} o start с; frames кадров (дробно); boil: true = Amount 2, число = Amount
 * @returns {ShapeLayer}
 */
function tlHandPath(comp, o) {
  var easeName = o.ease || "snap";
  if (easeName === "linear") throw new Error("tlHandPath: ease linear не бывает — линия пером ускоряется и тормозит");
  if (!TL_EASE[easeName]) throw new Error("tlHandPath: нет кривой «" + easeName + "»");
  if (!o.points || o.points.length < 2) throw new Error("tlHandPath: нужно ≥ 2 точек");
  var seed = o.seed === undefined ? 1 : o.seed;
  var layer = comp.layers.addShape();
  layer.name = o.name || "hand-path";
  layer.motionBlur = true;
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
  if (o.parent) layer.setParentWithJump(o.parent); // значения [0, 0] остаются: точки пути лежат в системе слоя-родителя
  var root = kbGroup(layer, ["ADBE Root Vectors Group"]);
  var group = kbAdd(root, "ADBE Vector Group");
  group.name = "pass-1";
  var contents = kbGroup(group, ["ADBE Vectors Group"]);
  var path = kbAdd(contents, "ADBE Vector Shape - Group");
  kbProp(path, ["ADBE Vector Shape"]).setValue(kbSmoothPath(/** @type {any} */ (o.points)));
  var stroke = kbAdd(contents, "ADBE Vector Graphic - Stroke");
  kbProp(stroke, ["ADBE Vector Stroke Color"]).setValue([o.color[0], o.color[1], o.color[2], 1]);
  kbProp(stroke, ["ADBE Vector Stroke Width"]).setValue(o.thickness);
  kbProp(stroke, ["ADBE Vector Stroke Line Cap"]).setValue(2);
  kbProp(stroke, ["ADBE Vector Stroke Line Join"]).setValue(2);
  if (o.taper) {
    // сужение считается от ОБРЕЗАННОГО конца (зонд S1): кончик пера бежит тонким, пока линия рисуется
    kbProp(stroke, ["ADBE Vector Stroke Taper", "ADBE Vector Taper Start Length"]).setValue(8);
    kbProp(stroke, ["ADBE Vector Stroke Taper", "ADBE Vector Taper End Length"]).setValue(20);
    kbProp(stroke, ["ADBE Vector Stroke Taper", "ADBE Vector Taper Start Width"]).setValue(40);
    kbProp(stroke, ["ADBE Vector Stroke Taper", "ADBE Vector Taper End Width"]).setValue(25);
    kbProp(stroke, ["ADBE Vector Stroke Taper", "ADBE Vector Taper Start Ease"]).setValue(50);
    kbProp(stroke, ["ADBE Vector Stroke Taper", "ADBE Vector Taper End Ease"]).setValue(50);
  }
  kbAdd(contents, "ADBE Vector Filter - Trim"); // после addProperty прежние ссылки недействительны: Trim End берёт tlRetrim по имени группы
  tlRetrim(layer, o.start, o.frames, easeName);
  if (o.rough) {
    var warp = kbEffect(layer, "ADBE Turbulent Displace");
    kbProp(warp, ["ADBE Turbulent Displace-0002"]).setValue(1.5); // Amount
    kbProp(warp, ["ADBE Turbulent Displace-0003"]).setValue(140); // Size
    kbProp(warp, ["ADBE Turbulent Displace-0005"]).setValue(2); // Complexity
    kbProp(warp, ["ADBE Turbulent Displace-0006"]).setValue(seed * 37); // Evolution — статично: край пера, бумага не шевелится
    var edge = kbEffect(layer, "ADBE Roughen Edges"); // ae-ok: bpc
    kbProp(edge, ["ADBE Roughen Edges-0002"]).setValue(1.2); // Border
    kbProp(edge, ["ADBE Roughen Edges-0003"]).setValue(1.4); // Edge Sharpness
    kbProp(edge, ["ADBE Roughen Edges-0005"]).setValue(26); // Scale
    kbProp(edge, ["ADBE Roughen Edges-0008"]).setValue(2); // Complexity
    kbProp(edge, ["ADBE Roughen Edges-0009"]).setValue(seed * 53); // Evolution
  }
  if (o.boil) tlBoilTwos(layer, { amount: o.boil === true ? 2 : o.boil, size: 24, seed: seed });
  layer.inPoint = o.start; // до первого кадра Trim круглый торец дал бы точку
  var len = tlmLen(tlmCurve(o.points));
  kbLog("HANDPATH " + layer.name + " n " + o.points.length + " len " + len.toFixed(2) + " trim " + (o.start * 30).toFixed(2) + "–" + ((o.start * 30) + o.frames).toFixed(2) + " " + easeName +
    " taper " + (o.taper ? "on" : "off") + " parent " + (o.parent ? o.parent.name : "-"));
  return layer;
}

/**
 * Расстояние от точки до прямоугольника {l, t, r, b} (0 внутри).
 * @param {number[]} p
 * @param {{l: number, t: number, r: number, b: number}} box
 * @returns {number}
 */
function tlmBoxDist(p, box) {
  var dx = Math.max(box.l - p[0], 0, p[0] - box.r);
  var dy = Math.max(box.t - p[1], 0, p[1] - box.b);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Зазор линии до букв, px (spec §4.3): минимум расстояния от осевой (кривая по ~400 точкам) до прямоугольников чернил минус t/2.
 * Для журнала проверки, не для сборки. Журнал: CLEAR <имя> <px> at u <…>.
 * @param {number[][]} points
 * @param {number} thickness
 * @param {{l: number, t: number, r: number, b: number}[]} boxes
 * @param {(string|boolean)=} name false — без строки журнала (перебор фаз в проверке)
 * @returns {{min: number, i: number, u: number}}
 */
function tlOvalClear(points, thickness, boxes, name) {
  var c = tlmCurve(points);
  var best = 1e9;
  var bi = 0;
  for (var i = 0; i < c.length; i++) {
    for (var b = 0; b < boxes.length; b++) {
      var d = tlmBoxDist(c[i], boxes[b]) - thickness / 2;
      if (d < best) { best = d; bi = i; }
    }
  }
  var u = bi / Math.max(1, c.length - 1);
  if (name !== false) kbLog("CLEAR " + (name || "oval") + " " + best.toFixed(2) + " at u " + u.toFixed(3));
  return { min: best, i: bi, u: u };
}

/**
 * Незамкнутый овал от руки (spec §4.2): суперэллипс n = 3, рука ставит перо на 18 % снаружи и вписывается за первые 12 % пути,
 * идёт против часовой 1,12 оборота (перехлёст 12 %), хвост уходит на 3 % наружу, радиус гуляет wobble (две гармоники, фазы от seed), наклон 3° по часовой.
 * Журнал: OVAL n … len … ext … start … end … и эталон OVAL ref, посчитанный в JS по тем же точкам (Catmull-Rom → Безье, ~400 точек); при boxes — ещё CLEAR.
 * @param {{cx: number, cy: number, a: number, b: number, n?: number, start?: number, turns?: number, flare?: number, flareSpan?: number,
 *   tail?: number, tailSpan?: number, wobble?: number[], tilt?: number, count?: number, seed?: number, em?: number, thickness?: number,
 *   boxes?: {l: number, t: number, r: number, b: number}[], name?: string, phis?: number[], quiet?: boolean}} o em и thickness — для журнала (em, ext с учётом t/2);
 *   phis — фазы wobble вместо seed и quiet — без журнала (только для перебора в проверке)
 * @returns {{points: number[][], len: number, ext: {L: number, R: number, T: number, B: number}, start: number, end: number, clear: number}}
 */
function tlOvalPoints(o) {
  var n = o.n === undefined ? 3 : o.n;
  var start = o.start === undefined ? 145 : o.start;
  var turns = o.turns === undefined ? 1.12 : o.turns;
  var flare = o.flare === undefined ? 0.18 : o.flare;
  var flareSpan = o.flareSpan === undefined ? 0.12 : o.flareSpan;
  var tail = o.tail === undefined ? 0.03 : o.tail;
  var tailSpan = o.tailSpan === undefined ? 0.14 : o.tailSpan;
  var wob = o.wobble || [0.006, 0.004];
  var tilt = (o.tilt === undefined ? 3 : o.tilt) * Math.PI / 180;
  var count = o.count === undefined ? 72 : o.count;
  var rnd = kbHandNoise(o.seed === undefined ? 11 : o.seed);
  var phi1 = 2 * Math.PI * rnd();
  var phi2 = 2 * Math.PI * rnd();
  if (o.phis) { phi1 = o.phis[0]; phi2 = o.phis[1]; } // перебор фаз в проверке (коридор §4.2); в сборке фазы от seed
  var ss = function (x) {
    var v = Math.max(0, Math.min(1, x));
    return 3 * v * v - 2 * v * v * v;
  };
  var sgn = function (v) { return v > 0 ? 1 : (v < 0 ? -1 : 0); };
  var pts = [];
  for (var i = 0; i < count; i++) {
    var u = i / (count - 1);
    var th = (start + u * 360 * turns) * Math.PI / 180;
    var x0 = o.a * sgn(Math.cos(th)) * Math.pow(Math.abs(Math.cos(th)), 2 / n);
    var y0 = o.b * sgn(Math.sin(th)) * Math.pow(Math.abs(Math.sin(th)), 2 / n);
    var s = 1 + flare * (1 - ss(u / flareSpan)) + tail * ss((u - (1 - tailSpan)) / tailSpan);
    var w = 1 + wob[0] * Math.sin(2 * th + phi1) + wob[1] * Math.sin(3 * th + phi2);
    var X = s * w * x0;
    var Y = s * w * y0;
    // поворот на tilt по часовой на экране = на −tilt в системе «y вверх»
    var xr = X * Math.cos(tilt) + Y * Math.sin(tilt);
    var yr = -X * Math.sin(tilt) + Y * Math.cos(tilt);
    pts.push([o.cx + xr, o.cy - yr]);
  }
  var c = tlmCurve(pts);
  var len = tlmLen(c);
  var t2 = (o.thickness || 0) / 2;
  var minX = 1e9;
  var maxX = -1e9;
  var minY = 1e9;
  var maxY = -1e9;
  for (var j = 0; j < c.length; j++) {
    if (c[j][0] < minX) minX = c[j][0];
    if (c[j][0] > maxX) maxX = c[j][0];
    if (c[j][1] < minY) minY = c[j][1];
    if (c[j][1] > maxY) maxY = c[j][1];
  }
  var ext = { L: minX - t2 - o.cx, R: maxX + t2 - o.cx, T: o.cy - minY + t2, B: maxY + t2 - o.cy };
  var polar = function (p) {
    var ang = Math.atan2(-(p[1] - o.cy), p[0] - o.cx) * 180 / Math.PI;
    return ang < 0 ? ang + 360 : ang;
  };
  var sA = polar(pts[0]);
  var eA = polar(pts[pts.length - 1]);
  var em = o.em || 1;
  var f = function (v) { return (v / em).toFixed(4); };
  var clear = NaN;
  if (o.boxes && o.thickness) clear = tlOvalClear(pts, o.thickness, o.boxes, o.quiet ? false : o.name).min;
  if (o.quiet) return { points: pts, len: len, ext: ext, start: sA, end: eA, clear: clear };
  kbLog("OVAL n " + count + " len " + len.toFixed(2) + " px " + f(len) + " em ext L " + f(ext.L) + " R " + f(ext.R) + " T " + f(ext.T) + " B " + f(ext.B) +
    " start " + sA.toFixed(2) + " end " + eA.toFixed(2) + " (em " + em + ")");
  kbLog("OVAL ref ext L " + f(ext.L) + " R " + f(ext.R) + " T " + f(ext.T) + " B " + f(ext.B) + " start " + sA.toFixed(2) + " end " + eA.toFixed(2) +
    " clear " + (isNaN(clear) ? "-" : f(clear)) + " len " + f(len) + " | px L " + ext.L.toFixed(2) + " R " + ext.R.toFixed(2) + " T " + ext.T.toFixed(2) + " B " + ext.B.toFixed(2) +
    " clear " + (isNaN(clear) ? "-" : clear.toFixed(2)));
  return { points: pts, len: len, ext: ext, start: sA, end: eA, clear: clear };
}

/**
 * Сдвинуть слой по x/y двумя ключами позиции (spec §4.5): текущее значение на t0 → (+dx, +dy) на t0 + frames/30, скорость 0, влияние по TL_EASE[ease].
 * Если на слое уже есть ключи — ключ t0 берёт valueAtTime(t0, true), новые ключи дописываются, старые не трогаются.
 * @param {any} layer
 * @param {number} dx
 * @param {number} dy
 * @param {number} t0 с
 * @param {number} frames кадров (дробно)
 * @param {string} ease
 */
function tlShiftKeys(layer, dx, dy, t0, frames, ease) {
  var pos = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]);
  var v0 = pos.numKeys > 0 ? pos.valueAtTime(t0, true) : pos.value;
  var t1 = t0 + frames / 30;
  var v1 = v0.length > 2 ? [v0[0] + dx, v0[1] + dy, v0[2]] : [v0[0] + dx, v0[1] + dy];
  tlmEaseKeys(pos, [[t0, v0], [t1, v1, ease]]);
  kbLog("SHIFT " + layer.name + " " + dx.toFixed(2) + " " + dy.toFixed(2) + " f " + (t0 * 30).toFixed(2) + "–" + (t1 * 30).toFixed(2) + " " + ease);
}

// ---------------------------------------------------------------------------------------------------------------------
// Слова из частей
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Слово из N частей (spec §4.6): замеры kbTextMeasure — всё слово W, части Wk, пары Wk,k+1; зазор стыка gk = Wk,k+1 − Wk − Wk+1.
 * Левый край части k = левый край k−1 + Wk−1 + gk−1; все части на общей базовой, дети пустышки root (якорь [0, 0], позиция (x, baseline)).
 * Журнал: PARTS <name> W … parts … gaps … err …; |err| ≤ 2 px (иначе исключение).
 * @param {CompItem} comp
 * @param {{text: string, cuts: number[], font: string, size: number, x: number, baseline: number, colors: number[][], name?: string}} o
 * @returns {{root: any, parts: any[], W: number, Wk: number[], gaps: number[], err: number, lefts: number[]}}
 */
function tlSplitParts(comp, o) {
  var name = o.name || o.text;
  var bounds = [0].concat(o.cuts).concat([o.text.length]);
  var strs = [];
  var k;
  for (k = 0; k < bounds.length - 1; k++) {
    if (!(bounds[k + 1] > bounds[k])) throw new Error("tlSplitParts «" + name + "»: пустая часть " + k + " (cuts " + o.cuts.join(",") + ")");
    strs.push(o.text.substring(bounds[k], bounds[k + 1]));
  }
  var m = strs.length;
  var meas = function (s) { return kbTextMeasure(comp, { text: s, font: o.font, size: o.size }).width; };
  var W = meas(o.text);
  var Wk = [];
  var gaps = [];
  for (k = 0; k < m; k++) Wk.push(meas(strs[k]));
  for (k = 0; k < m - 1; k++) gaps.push(meas(strs[k] + strs[k + 1]) - Wk[k] - Wk[k + 1]);
  var lefts = [o.x - W / 2];
  for (k = 1; k < m; k++) lefts.push(lefts[k - 1] + Wk[k - 1] + gaps[k - 1]);
  var parts = [];
  for (k = 0; k < m; k++) {
    parts.push(tlTextAt(comp, { text: strs[k], font: o.font, size: o.size, color: /** @type {any} */ (o.colors[k]), x: lefts[k] + Wk[k] / 2, baseline: o.baseline,
      name: name + " p" + k + " " + strs[k] }));
  }
  var firstPos = kbProp(parts[0], ["ADBE Transform Group", "ADBE Position"]).value;
  var lastPos = kbProp(parts[m - 1], ["ADBE Transform Group", "ADBE Position"]).value;
  var left = firstPos[0] - parts[0].sourceRectAtTime(0, false).width / 2;
  var right = lastPos[0] + parts[m - 1].sourceRectAtTime(0, false).width / 2;
  var err = (right - left) - W;
  var root = comp.layers.addNull();
  root.name = name;
  kbProp(root, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
  kbProp(root, ["ADBE Transform Group", "ADBE Position"]).setValue([o.x, o.baseline]);
  for (k = 0; k < m; k++) {
    var pp = kbProp(parts[k], ["ADBE Transform Group", "ADBE Position"]);
    var pv = pp.value;
    parts[k].setParentWithJump(root); // значения остаются: пересчитываем в систему пустышки (якорь [0, 0], поворот 0, масштаб 100)
    pp.setValue([pv[0] - o.x, pv[1] - o.baseline]);
  }
  var wTxt = [];
  var gTxt = [];
  for (k = 0; k < m; k++) wTxt.push(Wk[k].toFixed(2));
  for (k = 0; k < m - 1; k++) gTxt.push(gaps[k].toFixed(2));
  kbLog("PARTS " + name + " W " + W.toFixed(2) + " parts " + wTxt.join(",") + " gaps " + gTxt.join(",") + " err " + err.toFixed(2));
  if (Math.abs(err) > 2) throw new Error("tlSplitParts «" + name + "»: err " + err.toFixed(2) + " px > 2");
  return { root: root, parts: parts, W: W, Wk: Wk, gaps: gaps, err: err, lefts: lefts };
}

/**
 * Где встаёт слово после префикса «на том же стыке» (spec §4.7): левый край слова = left + W(prefix + " " + word) − W(word).
 * Для «WE AM» и «WE ARE» стык одинаков. Журнал AFTER <prefix> <word> left <…>.
 * @param {CompItem} comp
 * @param {{prefix: string, words: string[], font: string, size: number, left: number, baseline?: number}} o
 * @returns {{left: number, center: number, W: number}[]}
 */
function tlAfter(comp, o) {
  var out = [];
  for (var i = 0; i < o.words.length; i++) {
    var w = kbTextMeasure(comp, { text: o.words[i], font: o.font, size: o.size }).width;
    var wp = kbTextMeasure(comp, { text: o.prefix + " " + o.words[i], font: o.font, size: o.size }).width;
    var left = o.left + wp - w;
    kbLog("AFTER " + o.prefix + " " + o.words[i] + " left " + left.toFixed(2) + " W " + w.toFixed(2));
    out.push({ left: left, center: left + w / 2, W: w });
  }
  return out;
}

/**
 * Слово с дыркой (spec §4.8): tlSplitParts с cuts [index, index + 1] — левая часть, буква, правая часть; «?» — markFont, кегль так, что высота чернил
 * = markScale·cap. Дырка D_hole = max(D + 0,10 em, wq + 0,16 em), раздвижка e = D_hole − D: левая часть −e/2, правая +e/2 (статично). «?» низом чернил на базовой,
 * в середине дырки, ребёнок root, имя <name>-q. Буква и «?» до своих движений невидимы (аниматоры держат 0 % до старта).
 * Журнал: HOLE <name> D … e … wq … hq … hole <L>–<R>.
 * @param {CompItem} comp
 * @param {{text: string, index: number, font: string, size: number, x: number, baseline: number, colors: {word: number[], letter: number[], mark: number[]},
 *   markFont: string, markScale?: number, name?: string}} o
 * @returns {{root: any, left: any, letter: any, right: any, mark: any, D: number, e: number, wq: number, hq: number, holeL: number, holeR: number, W: number, Wk: number[]}}
 */
function tlHoleWord(comp, o) {
  var name = o.name || o.text;
  var markScale = o.markScale === undefined ? 0.85 : o.markScale;
  var sp = tlSplitParts(comp, { text: o.text, cuts: [o.index, o.index + 1], font: o.font, size: o.size, x: o.x, baseline: o.baseline,
    colors: [o.colors.word, o.colors.letter, o.colors.word], name: name });
  var cap = tlmCap() * o.size;
  var hq100 = kbTextMeasure(comp, { text: "?", font: o.markFont, size: 100 }).height;
  var qSize = Math.round(100 * markScale * cap / hq100);
  var mq = kbTextMeasure(comp, { text: "?", font: o.markFont, size: qSize });
  var wq = mq.width;
  var D = sp.lefts[2] - (sp.lefts[0] + sp.Wk[0]);
  var Dhole = Math.max(D + 0.10 * o.size, wq + 0.16 * o.size);
  var e = Dhole - D;
  var holeL = sp.lefts[0] + sp.Wk[0] - e / 2;
  var holeR = sp.lefts[2] + e / 2;
  var centerX = (holeL + holeR) / 2;
  var shifts = [-e / 2, 0, e / 2];
  for (var k = 0; k < 3; k += 2) {
    var pp = kbProp(sp.parts[k], ["ADBE Transform Group", "ADBE Position"]);
    var pv = pp.value;
    pp.setValue([pv[0] + shifts[k], pv[1]]);
  }
  var mark = tlTextAt(comp, { text: "?", font: o.markFont, size: qSize, color: /** @type {any} */ (o.colors.mark), x: centerX, baseline: o.baseline - (mq.top + mq.height), name: name + "-q" });
  var mp = kbProp(mark, ["ADBE Transform Group", "ADBE Position"]);
  var mv = mp.value;
  mark.setParentWithJump(sp.root);
  mp.setValue([mv[0] - o.x, mv[1] - o.baseline]);
  kbLog("HOLE " + name + " D " + D.toFixed(2) + " e " + e.toFixed(2) + " wq " + wq.toFixed(2) + " hq " + mq.height.toFixed(2) + " hole " + holeL.toFixed(2) + "–" + holeR.toFixed(2) + " qSize " + qSize);
  return { root: sp.root, left: sp.parts[0], letter: sp.parts[1], right: sp.parts[2], mark: mark, D: D, e: e, wq: wq, hq: mq.height, holeL: holeL, holeR: holeR, W: sp.W, Wk: sp.Wk };
}

// ---------------------------------------------------------------------------------------------------------------------
// Пресеты
// ---------------------------------------------------------------------------------------------------------------------

/**
 * №14 circle-marker — окончание обводится незамкнутым овалом от руки (spec §5.1).
 * Цель — слой окончания (tlSplitWord), stem — слой основы. Кадры от start: раздвижка 0 → 6 (soft, основа −d/2, окончание +d/2, d = max(0, gap·em − g0)),
 * овал 6 → 16 (tlOvalPoints вокруг чернил окончания → tlHandPath толщиной 0,12·cap, taper/rough/boil, ребёнок окончания, Trim snap 10 к.),
 * выход (out, с): непрозрачность линии 100 → 0 за 6 к. soft, outPoint = out + 7 к. start = первый кадр раздвижки, hit = старт линии + 10 к.;
 * при at: hit = at − lead. sfx marker (сила 0,8) на первом кадре линии. Без stem раздвижки нет (WARN). Стиль lesson: recolor-swipe(step) вместо линии.
 * Параметры: stem, gap (0,38 em), color, seed (11), out, thickness (0,12 cap), rejoin (true).
 * rejoin (решение владельца 15.10): после того как линия погасла (out + 6 к.), основа и окончание смыкаются обратно в слово за 6 к. soft
 * (основа +d/2, окончание −d/2; основа + окончание = слово); end = out + 12 к. Нужны stem и out.
 */
TL_MOVES["circle-marker"] = {
  group: "text-accent", slot: "accent", units: [], unit: "word",
  frames: { join: 6, draw: 10, fade: 6 }, stagger: {}, over: 0, lead: 2, sfx: null,
  params: { stem: null, gap: 0.38, color: null, seed: 11, out: undefined, thickness: undefined, strength: 1, rejoin: true },
  plan: function (layer, o, S) {
    tlmGuard("circle-marker");
    var off = (6 + 10) * S.dur;
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - TL_MOVES["circle-marker"].lead / 30 - off / 30;
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    var hit = start + off / 30;
    var end = typeof o.out === "number" ? o.out + (o.rejoin && o.stem && S.name !== "lesson" ? 12 : 6) * S.dur / 30 : hit;
    return { n: 0, unit: "", starts: [], start: start, hit: hit, end: end, total: off, unitFr: off, staggerFr: 0 };
  },
  run: function (layer, o, S, plan) {
    tlmGuard("circle-marker");
    var pal = S.palette || {};
    var color = o.color || pal.en || KB_COLOR.blue;
    var comp = layer.containingComp;
    if (S.name === "lesson") { // рисующиеся линии запрещены: без раздвижки и линии, окончание перекрашивается ступенькой на hit
      kbLog("SWAP circle-marker→recolor-swipe(step) (lesson, в run)");
      var nch = String(kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).value.text).length;
      kbMove(layer, "recolor-swipe", { range: [0, nch], color: color, mode: "step", at: plan.hit });
      return;
    }
    var em = tlFontSize(layer);
    var cap = tlmCap() * em;
    var t = o.thickness !== undefined ? o.thickness : 0.12 * cap;
    var join = 6 * S.dur;
    var draw = 10 * S.dur;
    var ink = tlmInk(layer);
    var rect = ink.rect;
    var cxc = (ink.l + ink.r) / 2;
    var cyc = ink.base - cap / 2;
    var center = tlmLocal(layer, cxc, cyc); // в системе слоя окончания, до ключей раздвижки
    var g0 = NaN;
    var d = 0;
    if (o.stem) {
      var inkStem = tlmInk(o.stem);
      g0 = ink.l - inkStem.r;
      d = Math.max(0, o.gap * em - g0);
      tlShiftKeys(o.stem, -d / 2, 0, plan.start, join, "soft");
      tlShiftKeys(layer, d / 2, 0, plan.start, join, "soft");
    } else {
      kbLog("WARN circle-marker: без раздвижки линия заденет соседнюю букву");
    }
    var pad = TLM_INK_PAD * em;
    var half = (ink.r - ink.l) / 2;
    var box = { l: rect.left + pad, t: rect.top, r: rect.left + rect.width - pad, b: rect.top + rect.height };
    var a = half + 0.18 * em;
    var b = cap / 2 + 0.26 * em;
    var oval = tlOvalPoints({ cx: center[0], cy: center[1], a: a, b: b, seed: o.seed, em: em, thickness: t, boxes: [box], name: layer.name });
    if (o.stem) { // зазор овала до основы после раздвижки: система слоя окончания, основа сдвинута на −d/2 при окончании на +d/2
      var inkS = tlmInk(o.stem);
      var sr = o.stem.sourceRectAtTime(0, false);
      var yTop = inkS.base + sr.top;
      var sb = { l: tlmLocal(layer, inkS.l - d, 0)[0], r: tlmLocal(layer, inkS.r - d, 0)[0], t: tlmLocal(layer, 0, yTop)[1], b: tlmLocal(layer, 0, yTop + sr.height)[1] };
      tlOvalClear(oval.points, t, [sb], layer.name + " stem");
    }
    var lineStart = plan.start + join / 30;
    var ring = tlHandPath(comp, { name: layer.name + " ring", points: oval.points, color: color, thickness: t, start: lineStart, frames: draw, ease: "snap",
      taper: true, rough: true, boil: true, parent: layer, seed: o.seed });
    // дорисован: остаток хвоста ≤ 3 px по кривой Trim snap
    var lo = 0;
    var hi = 1;
    for (var q = 0; q < 30; q++) {
      var mid = (lo + hi) / 2;
      if (oval.len * (1 - tlBz(mid, "snap")) <= 3) hi = mid; else lo = mid;
    }
    if (typeof o.out === "number") {
      var fr = 6 * S.dur;
      tlKeysEased(kbProp(ring, ["ADBE Transform Group", "ADBE Opacity"]), [[o.out, 100], [o.out + fr / 30, 0, "soft"]]);
      ring.outPoint = o.out + 7 * S.dur / 30;
      if (o.rejoin && o.stem && d > 0) { // линия погасла — части смыкаются обратно в слово (решение владельца 15.10)
        tlShiftKeys(o.stem, d / 2, 0, o.out + fr / 30, join, "soft");
        tlShiftKeys(layer, -d / 2, 0, o.out + fr / 30, join, "soft");
      }
    }
    tlSfxMarker(layer, tlCeilFrame(lineStart), "marker", 0.8 * (o.strength !== undefined ? o.strength : 1));
    kbLog("CIRCLE " + layer.name + " JOIN before " + (isNaN(g0) ? "-" : g0.toFixed(2)) + " after " + (isNaN(g0) ? "-" : (g0 + d).toFixed(2)) + " d " + d.toFixed(2) +
      " a " + a.toFixed(2) + " b " + b.toFixed(2) + " t " + t.toFixed(2) + " len " + oval.len.toFixed(2) + " drawn ≤3px +" + (hi * draw).toFixed(2) +
      " comp " + cxc.toFixed(2) + " " + cyc.toFixed(2) + " center " + center[0].toFixed(2) + " " + center[1].toFixed(2));
  }
};

/**
 * Появление буквы аниматора непрозрачности (land-op и т. п.) за frames кадров равными долями контраста по L* (tlPerceptOpacity):
 * переписывает таблицу ключей K выражения селектора — 0 → c 1/n … → 100, затем держит 100. Решение владельца 15.10 (word-swap).
 * @param {any} layer
 * @param {string} animName имя аниматора
 * @param {number} frames
 */
function tlmLetterFadeIn(layer, animName, frames) {
  var anims = kbGroup(layer, ["ADBE Text Properties", "ADBE Text Animators"]);
  var an = null;
  for (var i = 1; i <= anims.numProperties; i++) if (anims.property(i).name === animName) an = anims.property(i);
  if (!an) throw new Error("tlmLetterFadeIn: на «" + layer.name + "» нет аниматора " + animName);
  var amt = kbProp(an, ["ADBE Text Selectors", "ADBE Text Expressible Selector", "ADBE Text Expressible Amount"]); // ae-ok: matchname
  var k = [];
  for (var f = 0; f <= frames; f++) k.push("[" + f + "," + (f === 0 ? 0 : (f === frames ? 100 : tlPerceptOpacity(f / frames))).toFixed(4) + ",2,0,0]");
  var expr = String(amt.expression);
  var re = /var K=\[[^\n]*\];/;
  if (!re.test(expr)) throw new Error("tlmLetterFadeIn: в выражении " + animName + " нет таблицы K");
  amt.expression = expr.replace(re, "var K=[" + k.join(",") + "];");
  kbLog("FADEIN " + layer.name + " " + animName + " " + frames + " к. op " + k.join(" "));
}

/**
 * №16 word-swap — меняется только слово-переменная, контекст стоит (spec §5.2).
 * old и next — отдельные слои на одном левом стыке (tlAfter); контекст пресет не трогает. Правило направления: in land → старое sink-out (char, вниз),
 * in rise → старое rise(out). error: strike-out (shake: false) → 6 к. выдержки → уход старого (штрих гаснет на тех же кадрах); пауза gap к. бумаги в слоте; вход нового.
 * Параметры: next, error (false), in ("land"), strength (0,8), gap (2), hold (6), drop (1,0 em — вершина прыжка land; решение владельца 15.10, было 1,30),
 * fadeIn (4 к. — проявление каждой буквы land равными долями контраста; 0 — прежний «впрыск» за 1 к.). start = старт ошибки (или ухода), hit = касание последней буквы нового
 * (у rise — первый кадр, где она на месте ≤ 3 px), end = hit + оседание. Стиль lesson: land → rise, strike-out без штриха, звука thud нет.
 */
TL_MOVES["word-swap"] = {
  group: "text-accent", slot: "accent", units: [], unit: "word",
  frames: { hold: 6, gap: 2 }, stagger: {}, over: 0.06, lead: 2, sfx: null,
  params: { next: null, error: false, "in": "land", strength: 0.8, gap: 2, hold: 6, drop: 1.0, fadeIn: 4 },
  plan: function (layer, o, S) {
    tlmGuard("word-swap");
    if (!o.next) throw new Error("word-swap: нужен next — слой нового слова");
    var inName = S.swap[o["in"]] || o["in"];
    var exitName;
    if (inName === "land") exitName = "sink-out";
    else if (inName === "rise") exitName = "rise";
    else throw new Error("word-swap: in «" + o["in"] + "» — нужен land или rise");
    var errEnd = 0;
    if (o.error) errEnd = tlmPlanOf(layer, "strike-out", { shake: false, start: 0 }).total;
    var exitStart = o.error ? errEnd + Math.round(o.hold * S.dur) : 0;
    var exitPlan = tlmPlanOf(layer, exitName, { start: 0, unit: "char", out: true });
    var exitFr = (exitPlan.hit - exitPlan.start) * 30;
    var exitEnd = exitStart + exitFr;
    var newStart = Math.ceil(exitEnd - 1e-6) + o.gap;
    var np = tlmPlanOf(o.next, inName, { start: 0, unit: "char", strength: o.strength });
    var hitFr = inName === "rise" ? Math.ceil(tlmRiseSettle(o.next, np, o.strength) - 1e-6) : (np.hit - np.start) * 30;
    var endFr = (np.end - np.start) * 30;
    var hitOff = newStart + hitFr;
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - TL_MOVES["word-swap"].lead / 30 - hitOff / 30;
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    return { n: 0, unit: "", starts: [], start: start, hit: start + hitOff / 30, end: start + (newStart + Math.max(hitFr, endFr)) / 30, total: newStart + endFr, unitFr: newStart + endFr,
      staggerFr: 0, inName: inName, exitName: exitName, exitStart: exitStart, exitFr: exitFr, newStart: newStart, hitFr: hitFr };
  },
  run: function (layer, o, S, plan) {
    tlmGuard("word-swap");
    var comp = layer.containingComp;
    var t0 = plan.start;
    var inkOld = tlmInk(layer);
    if (o.error) kbMove(layer, "strike-out", { shake: false, start: t0 });
    var exitT = t0 + plan.exitStart / 30;
    var ex = kbMove(layer, plan.exitName, { start: exitT, unit: "char", out: true });
    layer.outPoint = ex.end + 1 / 30;
    var i;
    for (i = 1; i <= comp.numLayers; i++) { // штрих — ребёнок old; в lesson его нет, шаг пропускается
      var band = comp.layer(i);
      if (band instanceof ShapeLayer && band.parent === layer) {
        tlKeysEased(kbProp(band, ["ADBE Transform Group", "ADBE Opacity"]), [[exitT, 100], [ex.end, 0, "release"]]);
        band.outPoint = ex.end + 1 / 30;
      }
    }
    var nextT = t0 + plan.newStart / 30;
    var inkNext = tlmInk(o.next);
    // решение владельца 15.10: land падает с вершины −drop·em (1,0, а не 1,30: ARE пролетал сквозь строку подсказки) и проявляется
    // по букве за fadeIn кадров равными долями контраста (tlPerceptOpacity), а не «впрыском» 0 → 100 за 1 к.
    var inOpts = { start: nextT, unit: "char", strength: o.strength };
    var landIn = plan.inName === "land";
    if (landIn) inOpts.from = o.drop - 0.1;
    var nm = kbMove(o.next, o["in"], inOpts);
    if (landIn && o.fadeIn > 0) tlmLetterFadeIn(o.next, "land-op", o.fadeIn);
    var dInk = inkNext.l - inkOld.l;
    var txtOld = String(kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).value.text);
    var txtNew = String(kbProp(o.next, ["ADBE Text Properties", "ADBE Text Document"]).value.text);
    kbLog("WSWAP old «" + txtOld + "» new «" + txtNew + "» error " + (o.error ? 1 : 0) + " in " + plan.inName + " exit " + plan.exitName + " f " + plan.exitStart.toFixed(2) + "–" +
      (plan.exitStart + plan.exitFr).toFixed(2) + " next start " + plan.newStart.toFixed(2) + " hit " + (plan.newStart + plan.hitFr).toFixed(2) + " (" + nm.hit.toFixed(4) + " с) inkL old " + inkOld.l.toFixed(2) +
      " new " + inkNext.l.toFixed(2) + " d " + dInk.toFixed(2) + (landIn ? " drop " + o.drop.toFixed(2) + " fadeIn " + o.fadeIn : ""));
    if (Math.abs(dInk) > 2) kbLog("WARN word-swap: левые края чернил old и new расходятся на " + dInk.toFixed(2) + " px > 2");
  }
};

/**
 * №17 hole-letter — пропущенная буква врывается в слово (spec §5.3).
 * hole — результат tlHoleWord. «?» входит rise от markStart (если задан; не успевает встать за 6 к. до старта — исключение), гаснет paper-fade за 4 к. от старта,
 * буква падает land (strength 1,2): касание на старт + 8, смыкание слова (snap 4 к.) со старт + 7 (у lesson — с hit). hit = касание, end = старт + 18.
 * Стиль lesson: land → rise, касания нет, hit = первый кадр, где буква на месте ≤ 3 px, звука thud нет.
 */
TL_MOVES["hole-letter"] = {
  group: "text-accent", slot: "accent", units: [], unit: "char",
  frames: { fade: 4, land: 8, close: 4 }, stagger: {}, over: 0.06, lead: 2, sfx: null,
  params: { hole: null, markStart: undefined, strength: 1.2 },
  plan: function (layer, o, S) {
    tlmGuard("hole-letter");
    var lesson = S.name === "lesson";
    var np = tlmPlanOf(layer, "land", { start: 0, unit: "char", strength: o.strength });
    var hitFr = (S.swap["land"] || "land") === "rise" ? Math.ceil(tlmRiseSettle(layer, np, o.strength) - 1e-6) : (np.hit - np.start) * 30;
    var endFr = (np.end - np.start) * 30;
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - TL_MOVES["hole-letter"].lead / 30 - hitFr / 30;
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    var closeFr = lesson ? hitFr : hitFr - 1;
    var closeLen = 4 * S.dur;
    var end = lesson ? start + (hitFr + closeLen) / 30 : start + endFr / 30;
    return { n: 0, unit: "", starts: [], start: start, hit: start + hitFr / 30, end: end, total: endFr, unitFr: endFr, staggerFr: 0, hitFr: hitFr, closeFr: closeFr, closeLen: closeLen };
  },
  run: function (layer, o, S, plan) {
    tlmGuard("hole-letter");
    var hole = o.hole;
    if (!hole) throw new Error("hole-letter: нужен hole — результат tlHoleWord");
    var t0 = plan.start;
    var qHit = NaN;
    if (o.markStart !== undefined) {
      var rp = tlmPlanOf(hole.mark, "rise", { start: o.markStart });
      qHit = rp.hit;
      if (rp.hit > t0 - 6 / 30 + 1e-6) throw new Error("hole-letter: «?» не успевает встать (hit " + (rp.hit * 30).toFixed(2) + " > старт − 6 к. = " + ((t0 - 6 / 30) * 30).toFixed(2) + ")");
      kbMove(hole.mark, "rise", { start: o.markStart });
    }
    kbMove(hole.mark, "paper-fade", { start: t0, rest: 0, duration: 4, out: true });
    kbMove(layer, "land", { start: t0, unit: "char", strength: o.strength });
    var tClose = t0 + plan.closeFr / 30;
    tlShiftKeys(hole.left, hole.e / 2, 0, tClose, plan.closeLen, "snap");
    tlShiftKeys(hole.right, -hole.e / 2, 0, tClose, plan.closeLen, "snap");
    var tEnd = tClose + plan.closeLen / 30;
    var li = tlmInk(hole.left);
    var ri = tlmInk(hole.right);
    var lpos = kbProp(hole.left, ["ADBE Transform Group", "ADBE Position"]).valueAtTime(tEnd, true)[0] - tlmT(hole.left, "ADBE Position")[0];
    var rpos = kbProp(hole.right, ["ADBE Transform Group", "ADBE Position"]).valueAtTime(tEnd, true)[0] - tlmT(hole.right, "ADBE Position")[0];
    var width = (ri.r + rpos) - (li.l + lpos);
    var txt = String(kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).value.text);
    kbLog("HOLEIN " + hole.root.name + " letter «" + txt + "» start " + (t0 * 30).toFixed(2) + " hit " + (plan.hit * 30).toFixed(2) + " close " + (tClose * 30).toFixed(2) + "–" + (tEnd * 30).toFixed(2) +
      " width " + width.toFixed(2) + " err " + (width - hole.W).toFixed(2) + (isNaN(qHit) ? "" : " qhit " + (qHit * 30).toFixed(2)));
    if (Math.abs(width - hole.W) > 2) kbLog("WARN hole-letter: ширина слова после смыкания отличается от W на " + (width - hole.W).toFixed(2) + " px > 2");
  }
};

/**
 * №18 syllable-split — слоги раздвигаются, между ними чёрточки, ударный слог крупнее (spec §5.4).
 * Цель — пустышка root слова из tlSplitParts, parts — её слои. Кадры от start: раздвижка 0 → 6 (soft, часть k на (k − (m−1)/2)·g, g = gap·em),
 * чёрточки (tlHandPath: длина 0,9·cap, наклон 8°, толщина 0,08·cap, прогиб 0,03 длины от ударного слога, soft, taper/rough/boil 1) со старт + 6 и + 8, snap 3 к.,
 * ударение 12 → 18 (якорь tlSetAnchor в центре чернил x по базовой, масштаб 100 → 115 % snap 6 к.), back (с): чёрточки гаснут 4 к. (release), затем раздвижка → 0
 * и масштаб → 100 % за 8 к. hit = старт + 18, end = back + 12 к. (без back — hit). sfx: marker 0,6 на первом кадре первой чёрточки, tick 0,8 на кадре, где рост ≤ 3 px.
 * Стиль lesson: punch(soft) на ударном слоге вместо раздвижки и чёрточек. Параметры: parts, stress (индекс), gap (0,40), back.
 */
TL_MOVES["syllable-split"] = {
  group: "text-accent", slot: "accent", units: [], unit: "word",
  frames: { split: 6, slash: 3, stress: 6, back: 12 }, stagger: {}, over: 0, lead: 2, sfx: null,
  params: { parts: null, stress: 1, gap: 0.4, back: undefined, strength: 1 },
  plan: function (layer, o, S) {
    tlmGuard("syllable-split");
    var hitFr = 18 * S.dur;
    var start;
    if (o.at !== undefined && o.start === undefined) start = o.at - TL_MOVES["syllable-split"].lead / 30 - hitFr / 30;
    else if (o.start !== undefined && o.at === undefined) start = o.start;
    else throw new Error("нужно ровно одно из at | start");
    start = Math.round(start * 30) / 30;
    var hit = start + hitFr / 30;
    var end = typeof o.back === "number" ? o.back + 12 * S.dur / 30 : hit;
    return { n: 0, unit: "", starts: [], start: start, hit: hit, end: end, total: hitFr, unitFr: hitFr, staggerFr: 0 };
  },
  run: function (layer, o, S, plan) {
    tlmGuard("syllable-split");
    var parts = o.parts;
    if (!parts || parts.length < 2) throw new Error("syllable-split: нужен parts (≥ 2 слоёв tlSplitParts)");
    var m = parts.length;
    if (!(o.stress >= 0 && o.stress < m)) throw new Error("syllable-split: stress " + o.stress + " вне 0…" + (m - 1));
    var comp = layer.containingComp;
    var pal = S.palette || {};
    var t0 = plan.start;
    var dur = S.dur;
    if (S.name === "lesson") { // рисующиеся линии запрещены: без раздвижки и чёрточек
      kbLog("SWAP syllable-split→punch(soft) (lesson, в run)");
      kbMove(parts[o.stress], "punch", { amount: "soft", anchor: "center", start: t0 + 12 * dur / 30 });
      return;
    }
    var em = tlFontSize(parts[0]);
    var cap = tlmCap() * em;
    var g = o.gap * em;
    var inks = [];
    var shifts = [];
    var k;
    for (k = 0; k < m; k++) {
      inks.push(tlmInk(parts[k]));
      shifts.push((k - (m - 1) / 2) * g);
    }
    var base = inks[0].base;
    // чёрточки: геометрия до любых ключей (центр x — середина зазора чернил после раздвижки)
    var L = 0.9 * cap;
    var th = 8 * Math.PI / 180;
    var slashes = [];
    var sx = [];
    for (k = 0; k < m - 1; k++) {
      var gl = inks[k].r + shifts[k];
      var gr = inks[k + 1].l + shifts[k + 1];
      var cx = (gl + gr) / 2;
      var cy = base - 0.5 * cap;
      var bow = (k < o.stress ? -1 : 1) * 0.03 * L; // прогиб от ударного слога: слева от него — влево, справа — вправо
      var top = tlmLocal(layer, cx + (L / 2) * Math.sin(th), cy - (L / 2) * Math.cos(th));
      var mid = tlmLocal(layer, cx + bow * Math.cos(th), cy + bow * Math.sin(th));
      var bot = tlmLocal(layer, cx - (L / 2) * Math.sin(th), cy + (L / 2) * Math.cos(th));
      slashes.push([top, mid, bot]);
      sx.push(cx.toFixed(2));
    }
    // ударение: якорь первым делом (tlSetAnchor не терпит ключей позиции)
    var sp = parts[o.stress];
    var srect = sp.sourceRectAtTime(0, false);
    tlSetAnchor(sp, [srect.left + srect.width / 2, 0]);
    // раздвижка
    for (k = 0; k < m; k++) if (Math.abs(shifts[k]) > 1e-9) tlShiftKeys(parts[k], shifts[k], 0, t0, 6 * dur, "soft");
    // чёрточки
    var colorSoft = pal.soft || KB_COLOR.inkSoft;
    var made = [];
    for (k = 0; k < m - 1; k++) {
      var ts = t0 + (6 + 2 * k) * dur / 30;
      made.push(tlHandPath(comp, { name: layer.name + " slash " + (k + 1), points: slashes[k], color: colorSoft, thickness: 0.08 * cap, start: ts, frames: 3 * dur, ease: "snap",
        taper: true, rough: true, boil: 1, parent: layer, seed: 31 + 7 * k }));
    }
    // ударение: масштаб слога
    var mult = (o.strength !== undefined ? o.strength : 1) * S.strength;
    var peak = 100 + 15 * mult;
    var sc = kbProp(sp, ["ADBE Transform Group", "ADBE Scale"]);
    var z = sc.value.length > 2;
    var v1 = z ? [100, 100, 100] : [100, 100];
    var v2 = z ? [peak, peak, 100] : [peak, peak];
    tlmEaseKeys(sc, [[t0 + 12 * dur / 30, v1], [t0 + 18 * dur / 30, v2, "snap"]]);
    // кадр, где рост на глаз закончен: остаток по высоте ≤ 3 px
    var lo = 0;
    var hi = 1;
    for (var q = 0; q < 30; q++) {
      var mid2 = (lo + hi) / 2;
      if ((peak - 100) / 100 * srect.height * (1 - tlBz(mid2, "snap")) <= 3) hi = mid2; else lo = mid2;
    }
    var tickT = tlCeilFrame(t0 + (12 * dur + hi * 6 * dur) / 30);
    tlSfxMarker(layer, tlCeilFrame(t0 + 6 * dur / 30), "marker", 0.6 * (o.strength !== undefined ? o.strength : 1));
    tlSfxMarker(layer, tickT, "tick", 0.8 * (o.strength !== undefined ? o.strength : 1));
    // обратно
    if (typeof o.back === "number") {
      var tb = o.back;
      for (k = 0; k < made.length; k++) {
        tlKeysEased(kbProp(made[k], ["ADBE Transform Group", "ADBE Opacity"]), [[tb, 100], [tb + 4 * dur / 30, 0, "release"]]);
        made[k].outPoint = tb + 5 * dur / 30;
      }
      var tr = tb + 4 * dur / 30;
      for (k = 0; k < m; k++) if (Math.abs(shifts[k]) > 1e-9) tlShiftKeys(parts[k], -shifts[k], 0, tr, 8 * dur, "release");
      tlmEaseKeys(sc, [[tr, v2], [tr + 8 * dur / 30, v1, "release"]]);
    }
    kbLog("SYLL " + layer.name + " m " + m + " g " + g.toFixed(2) + " slashes " + sx.join(",") + " stress " + o.stress + " peak " + peak.toFixed(2) + " tick f " + (tickT * 30).toFixed(2) +
      " grow≤3px +" + (hi * 6 * dur).toFixed(2));
  }
};
