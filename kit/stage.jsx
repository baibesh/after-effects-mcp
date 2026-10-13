// Сцена урока 16:9 (2,5D-мир под камерой и 2D-интерфейс над ним): посадка картинок по экранным координатам на глубине,
// камера мира без ГРИП и наезд вокруг точки, смена мира под стоящим героем, облако реплики, ряд слов, переход-наезд между сценами.
// Каталог — kit/README.md «Урок: сцена». ES3. Времена — секунды композиции. Образец — reels/a2-01-pilot.

//@include "core.jsx"
//@include "motion.jsx"
//@include "project.jsx"
//@include "footage.jsx"
//@include "text.jsx"
//@include "char.jsx"

/** Дистанция камеры мира = штатный зум кадра 1920 (ширина × 50/36): плоскость z = 0 видна 1:1. */
var KB_STAGE_D = 2666.67;

/** Цвет облака реплики (cream) и его канта. */
var KB_BUBBLE_FILL = [1, 0.984, 0.953];

/**
 * Множитель глубины: слой на z (> 0 — дальше камеры) виден в D / (D + z) раз мельче.
 * @param {number} z
 * @returns {number}
 */
function kbDepthK(z) {
  return (KB_STAGE_D + z) / KB_STAGE_D;
}

/**
 * Посадить 3D-слой так, чтобы при камере 1,0 его якорь стоял в экранной точке (x, y), а масштаб на экране был scale %.
 * @param {AVLayer} layer
 * @param {{x: number, y: number, z: number, scale: number}} o
 */
function kbDepthPlace(layer, o) {
  var k = kbDepthK(o.z);
  layer.threeDLayer = true;
  kbTr(layer, "pos").setValue([960 + (o.x - 960) * k, 540 + (o.y - 540) * k, o.z]);
  kbTr(layer, "scale").setValue([o.scale * k, o.scale * k, o.scale * k]);
}

/**
 * Картинка мира (фон, мебель, предмет) на глубине: ширина на экране и угол-якорь в экранных координатах камеры 1,0.
 * @param {CompItem} comp
 * @param {string} path абсолютный путь к PNG
 * @param {{name: string, x: number, y: number, z: number, width: number, anchor?: string}} o
 *   anchor — "top" (x, y — середина верхнего края), "bottom" (середина нижнего; по умолчанию), "tl" (левый верхний угол)
 * @returns {AVLayer}
 */
function kbStageImage(comp, path, o) {
  var item = kbImport(path);
  var layer = comp.layers.add(item);
  layer.name = o.name;
  layer.motionBlur = true;
  var a = o.anchor || "bottom";
  var ax = a === "tl" ? 0 : item.width / 2;
  var ay = a === "bottom" ? item.height : 0;
  layer.threeDLayer = true;
  kbTr(layer, "anchor").setValue([ax, ay, 0]);
  kbDepthPlace(layer, { x: o.x, y: o.y, z: o.z, scale: (o.width / item.width) * 100 });
  return layer;
}

/**
 * Плоская заливка-прямоугольник мира (пол, полоса стены) на глубине, в экранных координатах камеры 1,0.
 * @param {CompItem} comp
 * @param {{name: string, rect: number[], z: number, color: number[]}} o rect — [x0, y0, x1, y1]
 * @returns {AVLayer}
 */
function kbStageRect(comp, o) {
  var w = o.rect[2] - o.rect[0];
  var h = o.rect[3] - o.rect[1];
  var layer = comp.layers.addSolid([o.color[0], o.color[1], o.color[2]], o.name, Math.ceil(w), Math.ceil(h), 1, comp.duration);
  layer.motionBlur = true;
  layer.threeDLayer = true;
  kbTr(layer, "anchor").setValue([0, 0, 0]);
  kbDepthPlace(layer, { x: o.rect[0], y: o.rect[1], z: o.z, scale: 100 });
  return layer;
}

/**
 * Камера мира: штатный зум, без ГРИП (уроки), смотрит в центр кадра.
 * @param {CompItem} comp
 * @returns {CameraLayer}
 */
function kbWorldCamera(comp) {
  var camera = comp.layers.addCamera("camera", [960, 540]);
  var options = kbGroup(camera, ["ADBE Camera Options Group"]);
  kbProp(options, ["ADBE Camera Zoom"]).setValue(KB_STAGE_D);
  kbProp(options, ["ADBE Camera Depth of Field"]).setValue(0);
  kbProp(camera, ["ADBE Transform Group", "ADBE Position"]).setValue([960, 540, -KB_STAGE_D]);
  kbProp(camera, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([960, 540, 0]);
  return camera;
}

/**
 * Положение камеры для увеличения k вокруг экранной точки focus (точка остаётся на месте, остальное расходится от неё).
 * @param {number[]} focus [x, y] на плоскости z = 0
 * @param {number} k 1 — общий план
 * @returns {number[][]} [позиция, точка интереса]
 */
function kbCamAt(focus, k) {
  var cx = focus[0] + (960 - focus[0]) / k;
  var cy = focus[1] + (540 - focus[1]) / k;
  return [[cx, cy, -KB_STAGE_D / k], [cx, cy, 0]];
}

/**
 * Наезд/отъезд камеры мира вокруг точки: плоскость героя растёт от focus, дальние слои — меньше (параллакс сам).
 * @param {CameraLayer} camera
 * @param {{t0: number, dur: number, from: {focus: number[], k: number}, to: {focus: number[], k: number}, ease?: {out: number, into: number}}} o
 */
function kbCamPush(camera, o) {
  var a = kbCamAt(o.from.focus, o.from.k);
  var b = kbCamAt(o.to.focus, o.to.k);
  var e = o.ease || KB_EASE.soft;
  kbKeys(kbProp(camera, ["ADBE Transform Group", "ADBE Position"]), [o.t0, o.t0 + o.dur], [a[0], b[0]], e);
  kbKeys(kbProp(camera, ["ADBE Transform Group", "ADBE Anchor Point"]), [o.t0, o.t0 + o.dur], [a[1], b[1]], e);
}

/**
 * Уход набора мира вниз за кадр (не растворение): ease-in со смазом.
 * @param {AVLayer[]} layers 3D-слои набора (текущая позиция — покой)
 * @param {number} t начало
 * @param {{dist?: number, dur?: number}=} o dist — px мира (по умолчанию 900), dur — с (0,40)
 */
function kbSetLeave(layers, t, o) {
  var p = o || {};
  var dist = p.dist === undefined ? 900 : p.dist;
  var dur = p.dur === undefined ? 0.4 : p.dur;
  for (var i = 0; i < layers.length; i++) {
    var pos = kbTr(layers[i], "pos");
    var v = pos.numKeys ? pos.valueAtTime(t, false) : pos.value; // покой к моменту ухода, а не значение на 0 с
    var k = kbDepthK(v[2]);
    kbKeys(pos, [t, t + dur], [v, [v[0], v[1] + dist * k, v[2]]], { out: 70, into: 5 });
    layers[i].outPoint = t + dur + 0.1;
  }
}

/**
 * Смена мира под стоящим героем: набор A уезжает вниз (kbSetLeave), набор B со сдвигом встаёт снизу на своё место
 * с перелётом и оседанием. Возвращает время кадра, где верх опорного слоя B проходит линию crossY (лапы героя) —
 * туда ставится hold-смена позы.
 * @param {AVLayer[]} outLayers набор A
 * @param {AVLayer[]} inLayers набор B (стоит на месте покоя)
 * @param {{t: number, dist?: number, outDur?: number, inDelay?: number, inDur?: number, over?: number,
 *   ref?: {layer: AVLayer, top: number}, crossY?: number}} o ref.top — экранный y верха опорного слоя в покое
 * @returns {number}
 */
function kbSetSwap(outLayers, inLayers, o) {
  var dist = o.dist === undefined ? 900 : o.dist;
  var inDelay = o.inDelay === undefined ? 0.1 : o.inDelay;
  var inDur = o.inDur === undefined ? 0.45 : o.inDur;
  var over = o.over === undefined ? 0.02 : o.over;
  kbSetLeave(outLayers, o.t, { dist: dist, dur: o.outDur });
  var t1 = o.t + inDelay;
  var i;
  for (i = 0; i < inLayers.length; i++) {
    var pos = kbTr(inLayers[i], "pos");
    var v = pos.value;
    var k = kbDepthK(v[2]);
    kbKeys(pos, [t1, t1 + inDur, t1 + inDur + 0.2],
      [[v[0], v[1] + dist * k, v[2]], [v[0], v[1] - dist * over * k, v[2]], v], KB_EASE.snap);
    inLayers[i].inPoint = t1 - 0.04;
  }
  if (!o.ref) return t1 + inDur * 0.5;
  var rp = kbTr(o.ref.layer, "pos");
  var rest = rp.valueAtTime(t1 + inDur + 0.3, false);
  var kr = kbDepthK(rest[2]);
  for (var f = Math.ceil(t1 * 30); f < (t1 + inDur) * 30; f++) {
    var y = rp.valueAtTime(f / 30, false)[1];
    if (o.ref.top + (y - rest[1]) / kr <= o.crossY) return f / 30;
  }
  return t1 + inDur * 0.5;
}

/**
 * Путь облака: скруглённый прямоугольник [x0, y0, x1, y1] с хвостом на той стороне, где цель; хвост — один контур с телом
 * (кант не перечёркивает основание), длина хвоста не больше tailMax, вершина смотрит на цель.
 * @param {number[]} box
 * @param {number[]} target
 * @param {{r?: number, half?: number, tailMax?: number}=} o
 * @returns {{shape: Shape, tip: number[]}}
 */
function kbBubblePath(box, target, o) {
  var p = o || {};
  var r = p.r === undefined ? 28 : p.r;
  var half = p.half === undefined ? 18 : p.half;
  var tailMax = p.tailMax === undefined ? 70 : p.tailMax;
  var x0 = box[0];
  var y0 = box[1];
  var x1 = box[2];
  var y1 = box[3];
  var k = 0.5523 * r;
  var tx = target[0];
  var ty = target[1];
  var side = "bottom";
  if (ty <= y1) side = tx < x0 ? "left" : (tx > x1 ? "right" : "top");
  if (ty > y1 && (tx < x0 - (ty - y1) * 1.5)) side = "left";
  if (ty > y1 && (tx > x1 + (ty - y1) * 1.5)) side = "right";
  var edges = [
    { n: "top", s: [x0 + r, y0], e: [x1 - r, y0], d: [1, 0] },
    { n: "right", s: [x1, y0 + r], e: [x1, y1 - r], d: [0, 1] },
    { n: "bottom", s: [x1 - r, y1], e: [x0 + r, y1], d: [-1, 0] },
    { n: "left", s: [x0, y1 - r], e: [x0, y0 + r], d: [0, -1] }
  ];
  var vs = [];
  var ins = [];
  var outs = [];
  var tip = [tx, ty];
  function push(v, a, b) {
    vs.push(v);
    ins.push(a);
    outs.push(b);
  }
  for (var i = 0; i < edges.length; i++) {
    var g = edges[i];
    push(g.s, [-g.d[0] * k, -g.d[1] * k], [0, 0]);
    if (g.n === side) {
      var horiz = g.d[1] === 0;
      var lo = horiz ? Math.min(g.s[0], g.e[0]) + half + 10 : Math.min(g.s[1], g.e[1]) + half + 10;
      var hi = horiz ? Math.max(g.s[0], g.e[0]) - half - 10 : Math.max(g.s[1], g.e[1]) - half - 10;
      var c = Math.max(lo, Math.min(hi, horiz ? tx : ty));
      var base = horiz ? [c, g.s[1]] : [g.s[0], c];
      var dx = tx - base[0];
      var dy = ty - base[1];
      var len = Math.sqrt(dx * dx + dy * dy);
      var l = Math.min(tailMax, Math.max(30, len - 12));
      tip = [base[0] + dx / len * l, base[1] + dy / len * l];
      push([base[0] - g.d[0] * half, base[1] - g.d[1] * half], [0, 0], [0, 0]);
      push(tip, [0, 0], [0, 0]);
      push([base[0] + g.d[0] * half, base[1] + g.d[1] * half], [0, 0], [0, 0]);
    }
    push(g.e, [0, 0], [g.d[0] * k, g.d[1] * k]);
  }
  var sh = new Shape();
  sh.vertices = vs;
  sh.inTangents = ins;
  sh.outTangents = outs;
  sh.closed = true;
  return { shape: sh, tip: tip };
}

/**
 * Облако реплики (2D, над миром): тело cream с кантом ink-soft 3 px одним контуром с хвостом, текст внутри.
 * Появляется целиком от кончика хвоста (масштаб 90 → 100 % и непрозрачность за 9 к.), уходит за 6 к.; пустым не бывает —
 * текст и тело на одних ключах. Ширина — по тексту (поля 44 × 26).
 * @param {CompItem} comp
 * @param {{name: string, text: string, x: number, y: number, target: number[], t0: number, t1: number, size?: number, font?: string, color?: number[]}} o
 *   text — строки через "\r" · x, y — центр тела · target — куда смотрит хвост (рот, трубка, край кадра) · t0 — начало входа, t1 — начало ухода
 * @returns {{body: ShapeLayer, text: TextLayer}}
 */
function kbBubble(comp, o) {
  var size = o.size || 56;
  var txt = kbText(comp, { text: o.text, font: o.font || KB_FONT.bold, size: size, color: /** @type {any} */ (o.color || KB_COLOR.ink), x: o.x, y: o.y, leading: Math.round(size * 1.22) });
  txt.name = o.name + "-text";
  txt.motionBlur = false;
  var rect = txt.sourceRectAtTime(0, false);
  var w = rect.width + 88;
  var h = rect.height + 52;
  var box = [o.x - w / 2, o.y - h / 2, o.x + w / 2, o.y + h / 2];
  var bp = kbBubblePath(box, o.target);
  var body = comp.layers.addShape();
  body.name = o.name;
  body.motionBlur = false;
  var group = kbAdd(kbGroup(body, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  var contents = kbGroup(group, ["ADBE Vectors Group"]);
  var path = kbAdd(contents, "ADBE Vector Shape - Group");
  kbProp(path, ["ADBE Vector Shape"]).setValue(bp.shape);
  var stroke = kbAdd(contents, "ADBE Vector Graphic - Stroke");
  kbProp(stroke, ["ADBE Vector Stroke Color"]).setValue([KB_COLOR.inkSoft[0], KB_COLOR.inkSoft[1], KB_COLOR.inkSoft[2], 1]);
  kbProp(stroke, ["ADBE Vector Stroke Width"]).setValue(3);
  var fill = kbAdd(contents, "ADBE Vector Graphic - Fill");
  kbProp(fill, ["ADBE Vector Fill Color"]).setValue([KB_BUBBLE_FILL[0], KB_BUBBLE_FILL[1], KB_BUBBLE_FILL[2], 1]);
  kbTr(body, "anchor").setValue(bp.tip);
  kbTr(body, "pos").setValue(bp.tip);
  txt.moveBefore(body);
  txt.parent = body;
  var t0 = o.t0;
  var t1 = o.t1;
  var inEnd = t0 + 9 * KB_F;
  var outEnd = t1 + 6 * KB_F;
  kbKeys(kbTr(body, "scale"), [t0, inEnd, t1, outEnd], [[90, 90, 100], [100, 100, 100], [100, 100, 100], [96, 96, 100]], KB_EASE.snap);
  var layers = [body, txt];
  for (var i = 0; i < layers.length; i++) {
    kbKeys(kbTr(layers[i], "op"), [t0, inEnd, t1, outEnd], [0, 100, 100, 0], KB_EASE.snap);
    layers[i].inPoint = t0;
    layers[i].outPoint = outEnd + KB_F;
  }
  return { body: body, text: txt };
}

/**
 * Ряд слов слоями (каждое слово — свой слой, раскладка по замеру): основа для строк, где слова потом меняют цвет и начертание.
 * @param {CompItem} comp
 * @param {{name: string, words: string[], x: number, y: number, size: number, font?: string, color?: number[], space?: number, glue?: number[]}} o
 *   x — левый край ряда, y — базовая линия строки (слова с выносными «y», «g» не прыгают); space — пробел в долях кегля (0,26); glue — номера слов, которые касаются
 *   предыдущего без пробела (знак «?», окончание `work|s`)
 * @returns {TextLayer[]}
 */
function kbWordRow(comp, o) {
  var out = [];
  var cursor = o.x;
  var sp = (o.space === undefined ? 0.26 : o.space) * o.size;
  for (var i = 0; i < o.words.length; i++) {
    var l = kbText(comp, { text: o.words[i], font: o.font || KB_FONT.bold, size: o.size, color: /** @type {any} */ (o.color || KB_COLOR.ink), x: 0, y: o.y });
    l.name = o.name + "-" + i + "-" + o.words[i];
    var rc = l.sourceRectAtTime(0, false);
    var w = rc.width;
    kbTr(l, "anchor").setValue([rc.left + w / 2, 0]);
    var glued = false;
    for (var g = 0; o.glue && g < o.glue.length; g++) if (o.glue[g] === i) glued = true;
    if (glued && i > 0) cursor -= sp;
    kbTr(l, "pos").setValue([cursor + w / 2, o.y]);
    cursor += w + sp;
    out.push(l);
  }
  return out;
}

/**
 * Вход ряда целиком: подъём на dy и непрозрачность за frames кадров (ease-out). Все слова на одних ключах.
 * @param {TextLayer[]} layers
 * @param {number} t
 * @param {{dy?: number, frames?: number}=} o по умолчанию 12 px и 10 к.
 */
function kbRowIn(layers, t, o) {
  var p = o || {};
  var dy = p.dy === undefined ? 12 : p.dy;
  var d = (p.frames === undefined ? 10 : p.frames) * KB_F;
  for (var i = 0; i < layers.length; i++) {
    var pos = kbTr(layers[i], "pos");
    var v = pos.value;
    kbKeys(pos, [t, t + d], [[v[0], v[1] + dy], v], KB_EASE.snap);
    kbKeys(kbTr(layers[i], "op"), [t, t + d], [0, 100], KB_EASE.snap);
    layers[i].inPoint = t;
  }
}

/**
 * Ступенька стиля слова: в кадре t слово сменяется двойником другого цвета и начертания на том же центре и базовой линии
 * (без смешивания цветов, без кадра «два глифа»).
 * @param {TextLayer} layer слово из kbWordRow
 * @param {number} t
 * @param {{color: number[], font?: string}} o
 * @returns {TextLayer} двойник
 */
function kbWordRestyle(layer, t, o) {
  var tf = Math.round(t * 30) / 30;
  var dup = /** @type {TextLayer} */ (layer.duplicate());
  dup.name = layer.name + "-b";
  var src = kbProp(dup, ["ADBE Text Properties", "ADBE Text Document"]);
  /** @type {TextDocument} */
  var doc = src.value;
  if (o.font) doc.font = o.font;
  doc.fillColor = /** @type {any} */ (o.color);
  src.setValue(doc);
  var r = dup.sourceRectAtTime(tf, false);
  kbTr(dup, "anchor").setValue([r.left + r.width / 2, 0]);
  dup.inPoint = tf;
  layer.outPoint = tf;
  return dup;
}

/**
 * Переход-наезд между сценами (T1): уходящая едет на камеру вокруг своего фокуса, входящая садится из крупного вокруг своего
 * и проявляется на 30–80 % хода; смаз — motion blur композиции.
 * cut: true — без проявления (двойной экспозиции нет): уходящая наезжает первую половину хода, на середине склейка
 * через общий элемент в фокусах (лицо героя), входящая садится вторую половину.
 * @param {AVLayer} outLayer
 * @param {AVLayer} inLayer слой выше уходящего
 * @param {{t0: number, dur?: number, outScale?: number, inScale?: number, focusOut: number[], focusIn: number[], cut?: boolean}} o
 */
function kbPush(outLayer, inLayer, o) {
  var dur = o.dur === undefined ? 0.4 : o.dur;
  var t1 = o.t0 + dur;
  var so = o.outScale === undefined ? 140 : o.outScale;
  var si = o.inScale === undefined ? 130 : o.inScale;
  kbTr(outLayer, "anchor").setValue(o.focusOut);
  kbTr(outLayer, "pos").setValue(o.focusOut);
  kbTr(inLayer, "anchor").setValue(o.focusIn);
  kbTr(inLayer, "pos").setValue(o.focusIn);
  outLayer.motionBlur = true;
  inLayer.motionBlur = true;
  if (o.cut) {
    var tm = Math.round((o.t0 + dur / 2) * 30) / 30;
    kbKeys(kbTr(outLayer, "scale"), [o.t0, tm], [[100, 100, 100], [so, so, 100]], { out: 60, into: 10 });
    kbKeys(kbTr(inLayer, "scale"), [tm, t1], [[si, si, 100], [100, 100, 100]], { out: 10, into: 60 });
    outLayer.outPoint = tm;
    inLayer.inPoint = tm;
    return;
  }
  kbKeys(kbTr(outLayer, "scale"), [o.t0, t1], [[100, 100, 100], [so, so, 100]], KB_EASE.soft);
  kbKeys(kbTr(inLayer, "scale"), [o.t0, t1], [[si, si, 100], [100, 100, 100]], KB_EASE.soft);
  kbKeys(kbTr(inLayer, "op"), [o.t0 + dur * 0.3, o.t0 + dur * 0.8], [0, 100], KB_EASE.soft);
  outLayer.motionBlur = true;
  inLayer.motionBlur = true;
  outLayer.outPoint = t1;
  inLayer.inPoint = o.t0;
}

/**
 * Контактная тень героя: мягкий эллипс ink под подошвами (3D, на плоскости героя чуть дальше него).
 * @param {CompItem} comp
 * @param {{x: number, y: number, w: number, h?: number, opacity?: number}} o
 * @returns {ShapeLayer}
 */
function kbContactShadow(comp, o) {
  var layer = comp.layers.addShape();
  layer.name = "contact-shadow";
  var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  var contents = kbGroup(group, ["ADBE Vectors Group"]);
  var el = kbAdd(contents, "ADBE Vector Shape - Ellipse");
  kbProp(el, ["ADBE Vector Ellipse Size"]).setValue([o.w, o.h || o.w * 0.12]);
  var fill = kbAdd(contents, "ADBE Vector Graphic - Fill");
  kbProp(fill, ["ADBE Vector Fill Color"]).setValue([KB_COLOR.ink[0], KB_COLOR.ink[1], KB_COLOR.ink[2], 1]);
  var blur = kbEffect(layer, "ADBE Gaussian Blur 2");
  kbProp(blur, ["ADBE Gaussian Blur 2-0001"]).setValue(14);
  layer.threeDLayer = true;
  kbTr(layer, "pos").setValue([o.x, o.y, 1]);
  kbTr(layer, "op").setValue(o.opacity === undefined ? 14 : o.opacity);
  return layer;
}
