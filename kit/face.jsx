// Векторное лицо поверх растровой позы: рот по 9 формам Rhubarb, глаз с подвижным зрачком и веками, бровь с эмоциями.
// Всё — shape-слои с позицией [0, 0]: координаты точек = координаты композиции. Слои потом делают детьми головы.
// Формы — пути с одинаковым числом вершин (можно и морфить, и ставить hold-ключи). Образец — reels/face-lab (Арлан 3/4).
// Каталог — kit/README.md «Лицо: face.jsx». ES3.

//@include "core.jsx"
//@include "motion.jsx"
//@include "char.jsx"

// ─── пути ───────────────────────────────────────────────────────────────────────────────

/**
 * Путь по точкам с касательными Catmull-Rom (/6); у вершин из sharp касательных нет (угол).
 * @param {number[][]} pts
 * @param {boolean} closed
 * @param {number[]=} sharp индексы угловых вершин
 * @returns {Shape}
 */
function kbFacePath(pts, closed, sharp) {
  var n = pts.length;
  var ins = [];
  var outs = [];
  var isSharp = {};
  for (var s = 0; sharp && s < sharp.length; s++) isSharp[sharp[s]] = true;
  for (var i = 0; i < n; i++) {
    var prev;
    var next;
    if (closed) {
      prev = pts[(i - 1 + n) % n];
      next = pts[(i + 1) % n];
    } else {
      prev = pts[i === 0 ? 0 : i - 1];
      next = pts[i === n - 1 ? i : i + 1];
    }
    var tx = (next[0] - prev[0]) / 6;
    var ty = (next[1] - prev[1]) / 6;
    if (isSharp[i]) {
      tx = 0;
      ty = 0;
    }
    ins.push([-tx, -ty]);
    outs.push([tx, ty]);
  }
  var sh = new Shape();
  sh.vertices = /** @type {any} */ (pts);
  sh.inTangents = /** @type {any} */ (ins);
  sh.outTangents = /** @type {any} */ (outs);
  sh.closed = closed;
  return sh;
}

/**
 * Shape-слой лица: позиция [0, 0], чтобы точки путей были в координатах композиции.
 * @param {CompItem} comp
 * @param {string} name
 * @returns {ShapeLayer}
 */
function kbFaceLayer(comp, name) {
  var L = comp.layers.addShape();
  L.name = name;
  L.motionBlur = false;
  kbTr(L, "anchor").setValue([0, 0]);
  kbTr(L, "pos").setValue([0, 0]);
  return L;
}

/**
 * Группа в корне shape-слоя (добавляется ниже уже созданных — первая созданная рисуется сверху).
 * @param {ShapeLayer} layer
 * @param {string} name
 * @returns {PropertyGroup} содержимое группы
 */
function kbFaceGroup(layer, name) {
  var g = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  g.name = name;
  return kbGroup(g, ["ADBE Vectors Group"]);
}

/**
 * Путь в группе с именем (по имени его потом находит kbFaceShapeProp).
 * @param {PropertyGroup} contents
 * @param {string} name
 * @param {Shape} shape
 */
function kbFaceAddPath(contents, name, shape) {
  var p = kbAdd(contents, "ADBE Vector Shape - Group");
  p.name = name;
  kbProp(p, ["ADBE Vector Shape"]).setValue(shape);
}

/**
 * Обводка: цвет, толщина, круглые концы и стыки; taper — [доля длины в начале, в конце, ширина на концах %].
 * @param {PropertyGroup} contents
 * @param {number[]} color
 * @param {number} width
 * @param {number[]=} taper
 */
function kbFaceStroke(contents, color, width, taper) {
  var st = kbAdd(contents, "ADBE Vector Graphic - Stroke");
  kbProp(st, ["ADBE Vector Stroke Color"]).setValue([color[0], color[1], color[2], 1]);
  kbProp(st, ["ADBE Vector Stroke Width"]).setValue(width);
  kbProp(st, ["ADBE Vector Stroke Line Cap"]).setValue(2);
  kbProp(st, ["ADBE Vector Stroke Line Join"]).setValue(2);
  if (taper) {
    kbProp(st, ["ADBE Vector Stroke Taper", "ADBE Vector Taper Start Length"]).setValue(taper[0] * 100);
    kbProp(st, ["ADBE Vector Stroke Taper", "ADBE Vector Taper End Length"]).setValue(taper[1] * 100);
    kbProp(st, ["ADBE Vector Stroke Taper", "ADBE Vector Taper Start Width"]).setValue(taper[2]);
    kbProp(st, ["ADBE Vector Stroke Taper", "ADBE Vector Taper End Width"]).setValue(taper[2]);
  }
}

/**
 * Заливка цветом.
 * @param {PropertyGroup} contents
 * @param {number[]} color
 */
function kbFaceFill(contents, color) {
  var f = kbAdd(contents, "ADBE Vector Graphic - Fill");
  kbProp(f, ["ADBE Vector Fill Color"]).setValue([color[0], color[1], color[2], 1]);
}

/**
 * Пересечение всех путей группы выше (маска «только внутри полости/глаза» без трек-мата).
 * @param {PropertyGroup} contents
 */
function kbFaceIntersect(contents) {
  var m = kbAdd(contents, "ADBE Vector Filter - Merge");
  kbProp(m, ["ADBE Vector Merge Type"]).setValue(4);
}

/**
 * Свойство пути по имени группы и пути (берётся заново: после addProperty старые ссылки недействительны).
 * @param {ShapeLayer} layer
 * @param {string} group
 * @param {string} path
 * @returns {Property}
 */
function kbFaceShapeProp(layer, group, path) {
  return kbProp(layer, ["ADBE Root Vectors Group", group, "ADBE Vectors Group", path, "ADBE Vector Shape"]);
}

/**
 * Hold-ключи по списку [время, значение]: соседние одинаковые схлопываются, время — на 0,02 с раньше кадра (kbHT).
 * @param {Property} prop
 * @param {any[][]} keys [[t, value], …], по возрастанию t
 * @param {function(any, any): boolean} same
 */
function kbFaceHoldKeys(prop, keys, same) {
  var T = [];
  var V = [];
  for (var i = 0; i < keys.length; i++) {
    if (V.length && same(V[V.length - 1], keys[i][1])) continue;
    var t = kbHT(keys[i][0]);
    if (T.length && t <= T[T.length - 1] + 0.001) {
      V[V.length - 1] = keys[i][1];
      continue;
    }
    T.push(t);
    V.push(keys[i][1]);
  }
  if (T.length > 1) kbHold(prop, T, V);
  else if (T.length === 1) prop.setValue(V[0]);
}

/**
 * Линейная интерполяция по таблице [[u, v], …] (u по возрастанию), за краями — крайние значения.
 * @param {number[][]} table
 * @param {number} u
 * @returns {number}
 */
function kbFaceLerp(table, u) {
  if (u <= table[0][0]) return table[0][1];
  for (var i = 1; i < table.length; i++) {
    if (u <= table[i][0]) {
      var a = table[i - 1];
      var b = table[i];
      return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]);
    }
  }
  return table[table.length - 1][1];
}

/**
 * Горб 0 → 1 → 0 по w ∈ [0, 1] с вершиной в peak; sharp > 1 — уже (округлый рот), < 1 — шире.
 * @param {number} w
 * @param {number} peak
 * @param {number} sharp
 * @returns {number}
 */
function kbFaceBump(w, peak, sharp) {
  if (w <= 0 || w >= 1) return 0;
  var b = w < peak ? Math.sin(Math.PI / 2 * w / peak) : Math.cos(Math.PI / 2 * (w - peak) / (1 - peak));
  return Math.pow(b, sharp);
}

// ─── рот ────────────────────────────────────────────────────────────────────────────────

/**
 * Линия рта Арлана в 3/4 (замер с arlan_talk3q_head.png): [u, v] в долях длины рта L = |угол → кончик|,
 * u — вдоль хорды от угла у щеки к кончику у носа, v — поперёк вниз. Улыбка провисает на 0,144 L.
 */
var KB_FACE_SAG_3Q = [[0, 0], [0.098, 0.049], [0.204, 0.088], [0.339, 0.123], [0.469, 0.143], [0.592, 0.144],
  [0.711, 0.133], [0.823, 0.103], [0.903, 0.069], [0.979, 0.026], [1, 0]];
/** Нарисованная линия нижней челюсти Арлана 3/4 в тех же долях: ниже неё нижняя губа не опускается. */
var KB_FACE_JAW_3Q = [[0, 0.258], [0.115, 0.248], [0.237, 0.246], [0.36, 0.247], [0.484, 0.25], [0.601, 0.236],
  [0.719, 0.222], [0.832, 0.195], [0.932, 0.132], [0.975, 0.083], [1, 0.04]];
/** Галочка у угла рта (щека), точки от дальнего конца к углу, [du, dv] в L. */
var KB_FACE_CREASE_3Q = [[-0.09, 0.016], [-0.055, -0.02], [0, 0]];

/**
 * Формы рта Rhubarb, всё в долях L: uc — угол рта сдвинут к кончику (узкий рот), sag — доля провиса улыбки,
 * up/lo — верхняя губа вверх / нижняя вниз в вершине горба, peak/sharp — где и насколько узок горб раскрытия,
 * crease — галочка у щеки (0…1), teeth — верхние зубы от верхней губы вниз, tongue/tpeak — высота и вершина языка.
 * Нижняя губа не опускается ниже нарисованной челюсти (floor − floorGap): рот открывается внутри морды.
 */
var KB_FACE_MOUTHS = {
  X: { uc: 0, sag: 1, up: 0, lo: 0, peak: 0.55, sharp: 1, crease: 1, teeth: 0, tongue: 0, tpeak: 0.6 },
  A: { uc: 0.06, sag: 0.6, up: 0, lo: 0, peak: 0.55, sharp: 1, crease: 0.4, teeth: 0, tongue: 0, tpeak: 0.6 },
  B: { uc: 0.02, sag: 0.95, up: 0.02, lo: 0.075, peak: 0.6, sharp: 0.7, crease: 0.9, teeth: 0.035, tongue: 0, tpeak: 0.6 },
  C: { uc: 0.02, sag: 0.95, up: 0.04, lo: 0.09, peak: 0.6, sharp: 0.7, crease: 0.9, teeth: 0.025, tongue: 0.035, tpeak: 0.6 },
  D: { uc: 0, sag: 0.9, up: 0.075, lo: 0.14, peak: 0.58, sharp: 0.6, crease: 1, teeth: 0.02, tongue: 0.05, tpeak: 0.6 },
  E: { uc: 0.3, sag: 0.8, up: 0.07, lo: 0.12, peak: 0.5, sharp: 1.2, crease: 0.3, teeth: 0, tongue: 0.03, tpeak: 0.55 },
  F: { uc: 0.55, sag: 0.6, up: 0.05, lo: 0.07, peak: 0.5, sharp: 1.4, crease: 0, teeth: 0, tongue: 0, tpeak: 0.6 },
  G: { uc: 0.06, sag: 0.8, up: 0, lo: 0.055, peak: 0.55, sharp: 0.8, crease: 0.6, teeth: 0.08, tongue: 0, tpeak: 0.6 },
  H: { uc: 0.02, sag: 0.95, up: 0.05, lo: 0.1, peak: 0.6, sharp: 0.7, crease: 0.9, teeth: 0.02, tongue: 0.1, tpeak: 0.85 }
};

/**
 * Геометрия формы рта в координатах композиции: полость (16 вершин), зубы и язык (по 18), галочка у щеки (3).
 * @param {{corner: number[], tip: number[], sag?: number[][], floor?: number[][], floorGap?: number, crease?: number[][]}} o
 * @param {{uc: number, sag: number, up: number, lo: number, peak: number, sharp: number, crease: number, teeth: number, tongue: number, tpeak: number}} f
 * @returns {{cavity: number[][], teeth: number[][], tongue: number[][], crease: number[][]}}
 */
function kbFaceMouthGeo(o, f) {
  var C = o.corner;
  var dx = o.tip[0] - C[0];
  var dy = o.tip[1] - C[1];
  var L = Math.sqrt(dx * dx + dy * dy);
  var e = [dx / L, dy / L];
  var nn = [-e[1], e[0]];
  /** @param {number} u @param {number} v @returns {number[]} */
  function P(u, v) {
    return [C[0] + (u * e[0] + v * nn[0]) * L, C[1] + (u * e[1] + v * nn[1]) * L];
  }
  var sag = o.sag || KB_FACE_SAG_3Q;
  var floor = o.floor || KB_FACE_JAW_3Q;
  var gap = o.floorGap === undefined ? 0.045 : o.floorGap;
  var N = 8;
  var U = [];
  var Lo = [];
  var TeU = [];
  var TeL = [];
  var ToU = [];
  var ToL = [];
  for (var i = 0; i <= N; i++) {
    var w = i / N;
    var u = f.uc + (1 - f.uc) * w;
    var s = kbFaceLerp(sag, u) * f.sag;
    var b = kbFaceBump(w, f.peak, f.sharp);
    var vu = s - f.up * b;
    // нижняя губа — не ниже нарисованной челюсти: между линиями остаётся полоска меха
    var vl = Math.max(s, Math.min(s + f.lo * b, kbFaceLerp(floor, u) - gap));
    U.push(P(u, vu));
    Lo.push(P(u, vl));
    // зубы: полоса от линии чуть выше верхней губы вниз на teeth — лишнее срезает пересечение с полостью
    TeU.push(P(u, vu - 0.03));
    TeL.push(P(u, vu + f.teeth));
    // язык: от нижней губы (с запасом наружу) вверх горбом
    ToU.push(P(u, vl - f.tongue * kbFaceBump(w, f.tpeak, 1)));
    ToL.push(P(u, vl + 0.04));
  }
  var cavity = U.slice(0);
  for (var k = N - 1; k >= 1; k--) cavity.push(Lo[k]);
  /** @param {number[][]} top @param {number[][]} bottom @returns {number[][]} */
  function band(top, bottom) {
    var r = top.slice(0);
    for (var q = bottom.length - 1; q >= 0; q--) r.push(bottom[q]);
    return r;
  }
  var cr = o.crease || KB_FACE_CREASE_3Q;
  var u0 = f.uc;
  var v0 = kbFaceLerp(sag, u0) * f.sag;
  var crease = [];
  for (var c = 0; c < cr.length; c++) crease.push(P(u0 + cr[c][0] * f.crease, v0 + cr[c][1] * f.crease));
  return { cavity: cavity, teeth: band(TeU, TeL), tongue: band(ToU, ToL), crease: crease };
}

/**
 * Рот по формам Rhubarb одним shape-слоем: галочка у щеки, линия губ (обводка по контуру полости), зубы и язык
 * (пересечение с полостью — без трек-мата), полость. Все формы — пути с одинаковым числом вершин; segs → hold-ключи
 * формы (можно заменить на морф). Без segs — одна форма o.form (по умолчанию X).
 * @param {CompItem} comp
 * @param {{name?: string, corner: number[], tip: number[], width: number,
 *   colors: {line: number[], cavity: number[], tongue: number[], teeth: number[]},
 *   sag?: number[][], floor?: number[][], floorGap?: number, crease?: number[][], forms?: Object, form?: string,
 *   segs?: any[][], offset?: number, t0?: number, t1?: number}} o
 *   corner — угол рта у щеки, tip — кончик у носа (координаты композиции); width — толщина линии как у контура позы;
 *   sag / floor / crease — линия рта в покое, нарисованная нижняя челюсть и галочка в долях L (по умолчанию Арлан 3/4),
 *   floorGap — сколько меха оставить между нижней губой и челюстью (0,045 L); segs — KB_VISEME[клип]
 *   ([от, до, "A".."H"|"X"]), offset — старт клипа в композиции
 * @returns {ShapeLayer}
 */
function kbFaceMouth(comp, o) {
  var forms = o.forms || KB_FACE_MOUTHS;
  var c = o.colors;
  var L = kbFaceLayer(comp, o.name || "mouth");
  var geo = {};
  for (var fn in forms) if (forms.hasOwnProperty(fn)) geo[fn] = kbFaceMouthGeo(o, forms[fn]);
  var g0 = geo[o.form || "X"];
  var sharpC = [0, 8];
  var sharpB = [0, 8, 9, 17];
  // сверху вниз: галочка, губы, зубы, язык, полость
  var gc = kbFaceGroup(L, "crease");
  kbFaceAddPath(gc, "p", kbFacePath(g0.crease, false));
  kbFaceStroke(gc, c.line, o.width * 0.9, [0.6, 0, 30]);
  var gl = kbFaceGroup(L, "lip");
  kbFaceAddPath(gl, "p", kbFacePath(g0.cavity, true, sharpC));
  // путь начинается в углу рта: сужение начала и конца даёт тонкий угол, как у нарисованной улыбки
  kbFaceStroke(gl, c.line, o.width, [0.06, 0.06, 55]);
  var gt = kbFaceGroup(L, "teeth");
  kbFaceAddPath(gt, "clip", kbFacePath(g0.cavity, true, sharpC));
  kbFaceAddPath(gt, "p", kbFacePath(g0.teeth, true, sharpB));
  kbFaceIntersect(gt);
  kbFaceFill(gt, c.teeth);
  var gg = kbFaceGroup(L, "tongue");
  kbFaceAddPath(gg, "clip", kbFacePath(g0.cavity, true, sharpC));
  kbFaceAddPath(gg, "p", kbFacePath(g0.tongue, true, sharpB));
  kbFaceIntersect(gg);
  kbFaceFill(gg, c.tongue);
  var gv = kbFaceGroup(L, "cavity");
  kbFaceAddPath(gv, "p", kbFacePath(g0.cavity, true, sharpC));
  kbFaceFill(gv, c.cavity);

  if (o.t0 !== undefined) L.inPoint = o.t0;
  if (o.t1 !== undefined) L.outPoint = o.t1;
  if (!o.segs || !o.segs.length) return L;

  // hold-ключи формы по сегментам Rhubarb; одинаковые соседние формы схлопываются
  var off = o.offset || 0;
  var keys = [];
  for (var i = 0; i < o.segs.length; i++) {
    var sg = o.segs[i];
    if (!geo[sg[2]]) throw new Error("kbFaceMouth: нет формы рта «" + sg[2] + "»");
    if (keys.length && keys[keys.length - 1][1] === sg[2]) continue;
    keys.push([sg[0] + off, sg[2]]);
  }
  /** @param {string} part @param {boolean} closed @param {number[]=} sharp @returns {any[][]} */
  function track(part, closed, sharp) {
    var r = [];
    for (var q = 0; q < keys.length; q++) r.push([keys[q][0], kbFacePath(geo[keys[q][1]][part], closed, sharp)]);
    return r;
  }
  /** @returns {boolean} */
  function never() {
    return false;
  }
  kbFaceHoldKeys(kbFaceShapeProp(L, "crease", "p"), track("crease", false), never);
  kbFaceHoldKeys(kbFaceShapeProp(L, "lip", "p"), track("cavity", true, sharpC), never);
  kbFaceHoldKeys(kbFaceShapeProp(L, "teeth", "clip"), track("cavity", true, sharpC), never);
  kbFaceHoldKeys(kbFaceShapeProp(L, "teeth", "p"), track("teeth", true, sharpB), never);
  kbFaceHoldKeys(kbFaceShapeProp(L, "tongue", "clip"), track("cavity", true, sharpC), never);
  kbFaceHoldKeys(kbFaceShapeProp(L, "tongue", "p"), track("tongue", true, sharpB), never);
  kbFaceHoldKeys(kbFaceShapeProp(L, "cavity", "p"), track("cavity", true, sharpC), never);
  return L;
}

// ─── глаз ───────────────────────────────────────────────────────────────────────────────

/**
 * Край века между верхней (t = 0) и нижней (t = 1) дугой глаза.
 * @param {number[][]} from
 * @param {number[][]} to
 * @param {number} t
 * @returns {number[][]}
 */
function kbFaceMix(from, to, t) {
  var r = [];
  for (var i = 0; i < from.length; i++) r.push([from[i][0] + (to[i][0] - from[i][0]) * t, from[i][1] + (to[i][1] - from[i][1]) * t]);
  return r;
}

/**
 * Замкнутая фигура из дуги и обратного хода второй дуги (общие концы не повторяются).
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number[][]}
 */
function kbFaceLoop(a, b) {
  var r = a.slice(0);
  for (var i = b.length - 2; i >= 1; i--) r.push(b[i]);
  return r;
}

/**
 * Глаз поверх нарисованного: белок по форме глаза, обводка и ресницы цвета нарисованной обводки, радужка + зрачок +
 * блик в группе «look» (позиция — смещение взгляда, выражение держит радужку внутри эллипса свободы), веки верхнее
 * и нижнее (путь между дугами глаза, цвет меха), моргание как sbLid (фазы по кадру 0 → 55 → 100 → 100 → 50 → 0 %).
 * Слои снизу вверх: <name>-white, <name>-iris (радужка, трек-мат по белку), <name>-matte, <name>-lid (веки), <name>-line
 * (ресницы и нижняя линия; закрытый глаз — одна линия ресниц по нижней дуге).
 * @param {CompItem} comp
 * @param {{name: string, upper: number[][], lower: number[][], iris: {c: number[], size: number[]},
 *   pupil: {c: number[], size: number[]}, glint: {c: number[], size: number[]}, free: number[],
 *   colors: {white: number[], line: number[], iris: number[], ring: number[], pupil: number[], glint: number[], lid: number[], lidLow?: number[], lidShade?: number[]},
 *   line: number, lash: number, lidSoft?: number, look?: any[][], lookDur?: number, lids?: number[][], blinks?: number[], t0?: number, t1?: number}} o
 *   upper / lower — по 7 точек дуг глаза слева направо (концы общие), по внешнему краю нарисованной обводки;
 *   free — [rx, ry] эллипс, по которому может ходить центр радужки вокруг центра глаза (в 3/4 — чтобы зрачок касался
 *   верха или низа глаза); look — [[t, [dx, dy]]] смещение взгляда в px от нарисованного положения (ограничит выражение),
 *   lookDur — длительность перевода взгляда (по умолчанию 0,1 с); lids — [[t, верхнее 0…1, нижнее 0…1]] веки по эмоции
 *   (hold); blinks — моргания (секунды); lid / lidLow — мех над и под глазом (замер кольца вокруг нарисованного глаза),
 *   lidShade — тень глазницы на верхнем веке (верхняя половина кольца), lidSoft — размытие края век, px (по умолчанию 7; ресницы в своём слое и остаются чёткими)
 * @returns {{white: ShapeLayer, iris: ShapeLayer, matte: ShapeLayer, lid: ShapeLayer, line: ShapeLayer}}
 */
function kbFaceEye(comp, o) {
  var c = o.colors;
  var U = o.upper;
  var Lo = o.lower;
  var eye = kbFaceLoop(U, Lo);
  // центр глаза — среднее точек контура
  var cx = 0;
  var cy = 0;
  for (var i = 0; i < eye.length; i++) {
    cx += eye[i][0];
    cy += eye[i][1];
  }
  cx /= eye.length;
  cy /= eye.length;

  var white = kbFaceLayer(comp, o.name + "-white");
  var gw = kbFaceGroup(white, "white");
  kbFaceAddPath(gw, "p", kbFacePath(eye, true));
  // тонкий кант по всему белку: у уголков ресницы и нижняя линия сужаются, без канта белок торчит клином
  kbFaceStroke(gw, c.line, o.line * 0.8);
  kbFaceFill(gw, c.white);

  var iris = kbFaceLayer(comp, o.name + "-iris");
  var gk = kbFaceGroup(iris, "look");
  // по подгруппе на эллипс: заливка и кант красят все пути выше себя в группе. Сверху вниз: блик, зрачок, радужка
  var parts = [{ name: "glint", el: o.glint, color: c.glint, ring: false }, { name: "pupil", el: o.pupil, color: c.pupil, ring: false },
    { name: "iris", el: o.iris, color: c.iris, ring: true }];
  for (var p = 0; p < parts.length; p++) {
    var sub = kbAdd(gk, "ADBE Vector Group");
    sub.name = parts[p].name;
    var sc = kbGroup(sub, ["ADBE Vectors Group"]);
    var el = kbAdd(sc, "ADBE Vector Shape - Ellipse");
    kbProp(el, ["ADBE Vector Ellipse Size"]).setValue(parts[p].el.size);
    kbProp(el, ["ADBE Vector Ellipse Position"]).setValue(parts[p].el.c);
    if (parts[p].ring) kbFaceStroke(sc, c.ring, Math.max(1.5, o.iris.size[0] * 0.05));
    kbFaceFill(sc, parts[p].color);
    gk = kbGroup(iris, ["ADBE Root Vectors Group", "look", "ADBE Vectors Group"]);
  }

  var matte = kbFaceLayer(comp, o.name + "-matte");
  var gm = kbFaceGroup(matte, "eye");
  kbFaceAddPath(gm, "p", kbFacePath(eye, true));
  kbFaceFill(gm, [1, 1, 1]);
  matte.moveBefore(iris);
  iris.setTrackMatte(matte, TrackMatteType.ALPHA);

  // веки — свой слой без мата: внешний край отодвинут от глаза на cover, чтобы закрытое веко прятало и нарисованную
  // обводку с ореолом (она шире векторной линии). Пока глаз открыт, эту полоску закрывают ресницы и нижняя линия.
  var lids0 = o.lids && o.lids.length ? o.lids[0] : [0, 0, 0];
  var coverUp = o.lash / 2 + 2;
  var coverLow = o.line / 2 + 4;
  /** @param {number[][]} arc @param {number} d @returns {number[][]} */
  function outward(arc, d) {
    var r = [];
    for (var q = 0; q < arc.length; q++) {
      var vx = arc[q][0] - cx;
      var vy = arc[q][1] - cy;
      var vl = Math.sqrt(vx * vx + vy * vy) || 1;
      r.push([arc[q][0] + vx / vl * d, arc[q][1] + vy / vl * d]);
    }
    return r;
  }
  var Uo = outward(U, coverUp);
  var Loo = outward(Lo, coverLow);
  /** @param {number} t @returns {Shape} */
  function lidUp(t) {
    return kbFacePath(kbFaceLoop(Uo, kbFaceMix(U, Lo, t)), true);
  }
  /** @param {number} t @returns {Shape} */
  function lidLow(t) {
    return kbFacePath(kbFaceLoop(Loo, kbFaceMix(Lo, U, t)), true);
  }
  var lid = kbFaceLayer(comp, o.name + "-lid");
  // верхнее веко — вертикальный переход как на нарисованной морде: тень глазницы сверху (lidShade) → мех (lid) в середине →
  // светлый мех под глазом (lidLow) у ресниц. 7 полос от внешнего края вглубь, каждая пересечена с веком, основа — lidLow;
  // размытие слоя сглаживает ступени
  var shadeN = c.lidShade ? 8 : 0;
  var lowC = c.lidLow || c.lid;
  /** @param {number[]} a @param {number[]} b @param {number} t @returns {number[]} */
  function mixC(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  for (var sh = 0; sh < shadeN - 1; sh++) {
    var gsh = kbFaceGroup(lid, "lidShade" + sh);
    var pos = (sh + 0.5) / shadeN;
    kbFaceAddPath(gsh, "clip", lidUp(lids0[1]));
    kbFaceAddPath(gsh, "p", kbFacePath(kbFaceLoop(Uo, kbFaceMix(U, Lo, (sh + 1) / shadeN)), true));
    kbFaceIntersect(gsh);
    kbFaceFill(gsh, pos < 0.5 ? mixC(c.lidShade, c.lid, pos / 0.5) : mixC(c.lid, lowC, (pos - 0.5) / 0.5));
  }
  var gu = kbFaceGroup(lid, "lidUp");
  kbFaceAddPath(gu, "p", lidUp(lids0[1]));
  kbFaceFill(gu, shadeN ? lowC : c.lid);
  var gd = kbFaceGroup(lid, "lidLow");
  kbFaceAddPath(gd, "p", lidLow(lids0[2]));
  kbFaceFill(gd, c.lidLow || c.lid);
  // мягкий край: плоский мех века не читается заплаткой на градиенте нарисованного меха
  var soft = o.lidSoft === undefined ? 7 : o.lidSoft;
  if (soft > 0) kbProp(kbEffect(lid, "ADBE Gaussian Blur 2"), ["ADBE Gaussian Blur 2-0001"]).setValue(soft);

  // линии: ресницы по краю верхнего века (толстые, сужаются к уголкам) и нижняя линия по краю нижнего века;
  // отдельной обводки нет — закрытый глаз остаётся одной линией ресниц
  var line = kbFaceLayer(comp, o.name + "-line");
  var gs = kbFaceGroup(line, "lash");
  kbFaceAddPath(gs, "p", kbFacePath(kbFaceMix(U, Lo, lids0[1]), false));
  kbFaceStroke(gs, c.line, o.lash, [0.22, 0.22, 55]);
  var gb = kbFaceGroup(line, "lowLine");
  kbFaceAddPath(gb, "p", kbFacePath(kbFaceMix(Lo, U, lids0[2]), false));
  kbFaceStroke(gb, c.line, o.line, [0.15, 0.15, 75]);

  var all = [white, iris, matte, lid, line];
  for (var a = 0; a < all.length; a++) {
    if (o.t0 !== undefined) all[a].inPoint = o.t0;
    if (o.t1 !== undefined) all[a].outPoint = o.t1;
  }

  // взгляд: выражение держит центр радужки внутри эллипса free вокруг центра глаза
  var rest = [o.iris.c[0] - cx, o.iris.c[1] - cy];
  var lookPos = kbProp(iris, ["ADBE Root Vectors Group", "look", "ADBE Vector Transform Group", "ADBE Vector Position"]);
  if (o.look && o.look.length) {
    var T = [];
    var V = [];
    var dur = o.lookDur || 0.1;
    for (var k = 0; k < o.look.length; k++) {
      var t = o.look[k][0];
      if (k > 0 && t - dur > T[T.length - 1] + 0.01) {
        T.push(t - dur);
        V.push(V[V.length - 1]);
      }
      T.push(t);
      V.push(o.look[k][1]);
    }
    if (T.length > 1) kbKeys(lookPos, T, V, KB_EASE.snap);
    else lookPos.setValue(V[0]);
  }
  lookPos.expression = "var r = [" + o.free[0] + ", " + o.free[1] + "];\nvar o = [" + rest[0].toFixed(2) + ", " + rest[1].toFixed(2) + "];\n" +
    "var v = [o[0] + value[0], o[1] + value[1]];\nvar k = Math.sqrt(Math.pow(v[0] / r[0], 2) + Math.pow(v[1] / r[1], 2));\n" +
    "if (k > 1) v = [v[0] / k, v[1] / k];\n[v[0] - o[0], v[1] - o[1]];";

  // веки: эмоция (hold) + моргания поверх
  var base = o.lids && o.lids.length ? o.lids : [[0, 0, 0]];
  /** @param {number} tt @returns {number[]} */
  function baseAt(tt) {
    var r = base[0];
    for (var q = 0; q < base.length; q++) if (base[q][0] <= tt + 0.0001) r = base[q];
    return r;
  }
  var ev = [];
  for (var b = 0; b < base.length; b++) ev.push([base[b][0], base[b][1], base[b][2]]);
  var ph = [0, 0.55, 1, 1, 0.5, 0];
  for (var n = 0; o.blinks && n < o.blinks.length; n++) {
    var b0 = Math.round(o.blinks[n] * 30) / 30;
    for (var f = 0; f < ph.length; f++) {
      var tf = b0 + f * KB_F;
      var bs = baseAt(tf);
      ev.push([tf, Math.max(bs[1], ph[f]), bs[2], 1]);
    }
  }
  ev.sort(function (x, y) {
    return x[0] - y[0];
  });
  /** @param {number} x @param {number} y @returns {boolean} */
  function sameN(x, y) {
    return Math.abs(x - y) < 0.001;
  }
  /** @param {any[][]} list @param {function(number): any} make @returns {any[][]} */
  function shapes(list, make) {
    var r = [];
    var last = -1;
    for (var z = 0; z < list.length; z++) {
      if (last >= 0 && sameN(list[last][1], list[z][1])) continue;
      r.push([list[z][0], make(list[z][1])]);
      last = z;
    }
    return r;
  }
  /** @returns {boolean} */
  function never() {
    return false;
  }
  if (ev.length > 1) {
    var up = [];
    var lo = [];
    for (var m = 0; m < ev.length; m++) {
      up.push([ev[m][0], ev[m][1]]);
      lo.push([ev[m][0], ev[m][2]]);
    }
    kbFaceHoldKeys(kbFaceShapeProp(lid, "lidUp", "p"), shapes(up, lidUp), never);
    for (var sk = 0; sk < shadeN - 1; sk++) kbFaceHoldKeys(kbFaceShapeProp(lid, "lidShade" + sk, "clip"), shapes(up, lidUp), never);
    kbFaceHoldKeys(kbFaceShapeProp(line, "lash", "p"), shapes(up, function (v) {
      return kbFacePath(kbFaceMix(U, Lo, v), false);
    }), never);
    kbFaceHoldKeys(kbFaceShapeProp(lid, "lidLow", "p"), shapes(lo, lidLow), never);
    kbFaceHoldKeys(kbFaceShapeProp(line, "lowLine", "p"), shapes(lo, function (v) {
      return kbFacePath(kbFaceMix(Lo, U, v), false);
    }), never);
  }
  return { white: white, iris: iris, matte: matte, lid: lid, line: line };
}

// ─── бровь ──────────────────────────────────────────────────────────────────────────────

/**
 * Эмоции брови: смещение трёх точек [внешний конец, середина, внутренний конец] в долях толщины брови;
 * x — вдоль брови к носу, y — вниз. Эмоцию дополняют веко и зрачок (kbFaceEye: lids, look).
 */
var KB_FACE_BROWS = {
  neutral: [[0, 0], [0, 0], [0, 0]],
  up: [[0, -0.32], [0, -0.5], [0, -0.55]],
  frown: [[0, -0.2], [0.05, 0.18], [0.15, 0.6]],
  happy: [[0, 0.1], [0, -0.4], [0, -0.1]]
};

/**
 * Бровь: путь из трёх точек толстой обводкой цвета брови с сужением к внешнему концу и тёмным кантом.
 * @param {CompItem} comp
 * @param {{name: string, points: number[][], width: number, taper?: number, edge?: number,
 *   colors: {fill: number[], edge: number[]}, emotions?: Object, emotion?: string, keys?: any[][], t0?: number, t1?: number}} o
 *   points — [внешний конец, середина, внутренний конец] в композиции; width — толщина брови; taper — доля длины,
 *   на которой бровь сужается к внешнему концу (по умолчанию 0,45); edge — толщина канта (по умолчанию 1,5);
 *   keys — [[t, эмоция]] (hold), emotion — эмоция без ключей
 * @returns {ShapeLayer}
 */
function kbFaceBrow(comp, o) {
  var emo = o.emotions || KB_FACE_BROWS;
  var P = o.points;
  var dx = P[2][0] - P[0][0];
  var dy = P[2][1] - P[0][1];
  var len = Math.sqrt(dx * dx + dy * dy);
  var ax = [dx / len, dy / len];
  /** @param {string} name @returns {Shape} */
  function shapeOf(name) {
    var d = emo[name];
    if (!d) throw new Error("kbFaceBrow: нет эмоции «" + name + "»");
    var pts = [];
    for (var i = 0; i < 3; i++) {
      var sx = d[i][0] * o.width;
      var sy = d[i][1] * o.width;
      pts.push([P[i][0] + sx * ax[0], P[i][1] + sx * ax[1] + sy]);
    }
    return kbFacePath(pts, false);
  }
  var taper = o.taper === undefined ? 0.45 : o.taper;
  var edge = o.edge === undefined ? 1.5 : o.edge;
  var L = kbFaceLayer(comp, o.name);
  var g = kbFaceGroup(L, "brow");
  kbFaceAddPath(g, "p", shapeOf(o.emotion || "neutral"));
  // первая обводка рисуется сверху: заливка брови, под ней кант шире на 2 × edge
  kbFaceStroke(g, o.colors.fill, o.width, [taper, 0, 8]);
  kbFaceStroke(g, o.colors.edge, o.width + 2 * edge, [taper, 0, 8]);
  if (o.t0 !== undefined) L.inPoint = o.t0;
  if (o.t1 !== undefined) L.outPoint = o.t1;
  if (o.keys && o.keys.length) {
    var ks = [];
    for (var k = 0; k < o.keys.length; k++) ks.push([o.keys[k][0], shapeOf(o.keys[k][1])]);
    kbFaceHoldKeys(kbFaceShapeProp(L, "brow", "p"), ks, function () {
      return false;
    });
  }
  return L;
}
