// Бумажная диорама: лист с вырезанной дырой и перевод фокуса камеры с одной глубины на другую.
//
// Лист сделан слоем-заливкой с маской, а не shape-слоем: эффект на shape-слое обрезается
// по размеру композиции, а листы диорамы крупнее кадра — бумажное волокно срезало бы их до 1920×1080.
// Край дыры неровный по форме самой маски: Wiggle Paths пересчитывается покадрово и дрожит, а здесь
// форма посчитана один раз и стоит намертво.

//@include "core.jsx"
//@include "motion.jsx"
//@include "space.jsx"

/**
 * Повторяемое псевдослучайное число 0…1: одинаковое от запуска к запуску.
 * @param {number} i
 * @param {number} seed
 * @returns {number}
 */
function kbHoleNoise(i, seed) {
  var v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Замкнутый органичный овал: радиус гуляет четырьмя гармониками — край как у рваной бумаги,
 * но без углов и без дрожания во времени.
 * @param {{rx: number, ry: number, cx?: number, cy?: number, points?: number, seed?: number, rough?: number}} opts
 *   rough — размах края в долях радиуса (0.085 ≈ ±48 px на дыре радиусом 560)
 * @returns {Shape}
 */
function kbHolePath(opts) {
  // 64 вершины, а не 24: у передней плоскости дыра проходит в полукадре от камеры, и хорда между
  // соседними вершинами вырастает до сотни пикселей — контур читается многоугольником.
  var n = opts.points || 64;
  var seed = opts.seed === undefined ? 1 : opts.seed;
  var rough = opts.rough === undefined ? 0.085 : opts.rough;
  var cx = opts.cx || 0;
  var cy = opts.cy || 0;
  var i;

  var p1 = kbHoleNoise(1, seed) * Math.PI * 2;
  var p2 = kbHoleNoise(2, seed) * Math.PI * 2;
  var p3 = kbHoleNoise(3, seed) * Math.PI * 2;
  var p4 = kbHoleNoise(4, seed) * Math.PI * 2;

  /** @type {[number, number][]} */
  var pts = [];
  for (i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2;
    var w = 1 + rough * (0.45 * Math.sin(3 * a + p1) + 0.27 * Math.sin(5 * a + p2) +
      0.18 * Math.sin(8 * a + p3) + 0.10 * Math.sin(13 * a + p4));
    pts.push([cx + opts.rx * w * Math.cos(a), cy + opts.ry * w * Math.sin(a)]);
  }

  // Касательные Catmull-Rom с поправкой k: при ровных радиусах кривая садится точно на эллипс.
  // Дуга между соседями стягивает угол 2π/n, длина касательной у окружности = 4/3·tan(π/2n)·r,
  // а хорда через соседей = 2·sin(2π/n)·r. С tan(π/n) касательные вдвое длиннее нужного: контур
  // пухнет между вершинами и на крупном плане идёт волной.
  var k = (4 / 3) * Math.tan(Math.PI / (2 * n)) / (2 * Math.sin(2 * Math.PI / n));
  /** @type {[number, number][]} */
  var inT = [];
  /** @type {[number, number][]} */
  var outT = [];
  for (i = 0; i < n; i++) {
    var prev = pts[(i + n - 1) % n];
    var next = pts[(i + 1) % n];
    var tx = (next[0] - prev[0]) * k;
    var ty = (next[1] - prev[1]) * k;
    inT.push([-tx, -ty]);
    outT.push([tx, ty]);
  }

  var shape = new Shape();
  shape.vertices = pts;
  shape.inTangents = inT;
  shape.outTangents = outT;
  shape.closed = true;
  return shape;
}

/**
 * Лист бумажной диорамы: плоскость поперёк кадра с вырезанной дырой и светлым кантом среза.
 * Отдаёт и принимает тени, волокно — на самом листе (как в kbWall), не экранной фактурой.
 * @param {CompItem} comp
 * @param {{name: string, z: number, color: [number, number, number], width: number, height: number,
 *          hole: [number, number], offset?: [number, number], seed?: number, rough?: number, grain?: boolean,
 *          shadows?: boolean, edge?: boolean, edgeSize?: number, grainScale?: number}} opts
 *   hole — полуоси дыры в пикселях мира, offset — смещение дыры от оси тоннеля, grain: false — без волокна,
 *   grainScale — размер зерна в пространстве листа: задавать пропорционально расстоянию листа до камеры,
 *   тогда в кадре зерно у всех листов одинаковое (по умолчанию 2),
 *   shadows: false — лист не принимает теней и остаётся в своём цвете (для акцентного кольца),
 *   edge: false — без светлого канта среза, edgeSize — толщина канта в пикселях мира (по умолчанию 1.2)
 * @returns {AVLayer}
 */
function kbHolePlane(comp, opts) {
  var w = Math.round(opts.width);
  var h = Math.round(opts.height);
  var seed = opts.seed === undefined ? 1 : opts.seed;
  var layer = comp.layers.addSolid(opts.color, opts.name, w, h, 1, comp.duration);
  layer.threeDLayer = true;
  layer.motionBlur = true;
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([comp.width / 2, comp.height / 2, opts.z]);

  var off = opts.offset || [0, 0];
  var masks = kbGroup(layer, ["ADBE Mask Parade"]);
  var mask = /** @type {MaskPropertyGroup} */ (kbAdd(masks, "ADBE Mask Atom")); // ae-ok: matchname
  kbProp(mask, ["ADBE Mask Shape"]).setValue(kbHolePath({ // ae-ok: matchname
    rx: opts.hole[0], ry: opts.hole[1],
    cx: w / 2 + off[0], cy: h / 2 + off[1],
    seed: seed, rough: opts.rough
  }));
  mask.maskMode = MaskMode.SUBTRACT;

  // Волокно — ровно одна мелкая октава. Contrast 14 / Brightness 47 упирали верх шума в 100 %:
  // половина размаха срезалась в «не темнить» и давала белёсые кляксы. А лишние октавы несут
  // низкую частоту: мелкое зерно блюр съедает, крупная составляющая переживает его и читается
  // пятнами «мокрой бумаги» на расфокусе. Поэтому Complexity 1 (при одной октаве подслоёв нет вовсе)
  // и размах 94–98 % без срезов. Размер зерна задаётся снаружи пропорционально расстоянию листа до камеры —
  // в кадре зерно у всех листов одинаковое.
  if (opts.grain !== false) {
    var noise = kbEffect(layer, "ADBE Fractal Noise");
    kbProp(noise, ["ADBE Fractal Noise-0004"]).setValue(4); // Contrast — размах волокна
    kbProp(noise, ["ADBE Fractal Noise-0005"]).setValue(46); // Brightness — верх диапазона ниже 100 %
    kbProp(noise, ["ADBE Fractal Noise-0010"]).setValue(opts.grainScale === undefined ? 2 : opts.grainScale);
    kbProp(noise, ["ADBE Fractal Noise-0015"]).setValue(1); // Complexity — одна октава, без низкой частоты
    kbProp(noise, ["ADBE Fractal Noise-0027"]).setValue(seed); // Random Seed — у каждого листа своё волокно
    kbProp(noise, ["ADBE Fractal Noise-0030"]).setValue(5); // Blending Mode: Multiply
  }

  kbMaterial(layer, { casts: true, acceptsShadows: opts.shadows !== false });

  // Кант среза: толщина листа. Отдельным shape-слоем на 1 px ближе к камере, а не эффектом Stroke
  // по маске: Stroke считается в 8 битах и квантовал бы бумагу с волокном в полтора десятка ступеней.
  // Эффектов на слое нет, поэтому обрезка shape-слоя по размеру композиции его не касается.
  // Толщина задана в пикселях мира: ближние листы показывают срез шире дальних — так и надо.
  if (opts.edge !== false) {
    var edge = comp.layers.addShape();
    edge.name = opts.name + "-edge";
    edge.threeDLayer = true;
    edge.motionBlur = true;
    var group = kbAdd(kbGroup(edge, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
    var contents = kbGroup(group, ["ADBE Vectors Group"]);
    var path = kbAdd(contents, "ADBE Vector Shape - Group");
    kbProp(path, ["ADBE Vector Shape"]).setValue(kbHolePath({
      rx: opts.hole[0], ry: opts.hole[1],
      cx: off[0], cy: off[1],
      seed: seed, rough: opts.rough
    }));
    var stroke = kbAdd(contents, "ADBE Vector Graphic - Stroke");
    kbProp(stroke, ["ADBE Vector Stroke Color"]).setValue([1, 0.995, 0.975, 1]);
    kbProp(stroke, ["ADBE Vector Stroke Width"]).setValue(opts.edgeSize === undefined ? 1.4 : opts.edgeSize);
    kbProp(edge, ["ADBE Transform Group", "ADBE Position"]).setValue([comp.width / 2, comp.height / 2, opts.z - 1]);
    kbMaterial(edge, {});
  }

  return layer;
}

/**
 * Перевод фокуса с одной глубины на другую. Расстояние считается от самой камеры,
 * поэтому фокус не расходится с пролётом: цели заданы координатой z в мире.
 * @param {CameraLayer} camera
 * @param {number} from z первой цели
 * @param {number} to z второй цели
 * @param {number} t0 начало перевода, с
 * @param {number} t1 конец перевода, с
 */
function kbRackFocus(camera, from, to, t0, t1) {
  kbProp(camera, ["ADBE Camera Options Group", "ADBE Camera Focus Distance"]).expression =
    "var d0 = " + from + " - position[2];\n" +
    "var d1 = " + to + " - position[2];\n" +
    "ease(time, " + t0 + ", " + t1 + ", d0, d1);";
}
