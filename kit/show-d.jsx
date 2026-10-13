// Морф формы, радиальный веер и жидкие капли: приёмы блока «ПІШІН» витрины.
//
// Жидкость собирается из двух слоёв одного источника: нижний — размытие + сжатие мата
// (капли сливаются с фигурой перемычками), верхний — та же фигура без размытия, чтобы углы
// квадрата и лучи звезды остались острыми. Всё в источнике белое, цвет даёт эффект Fill,
// поэтому капли и фигура всегда одного цвета и меняют его одновременно.

//@include "core.jsx"
//@include "motion.jsx"

/**
 * Замкнутый путь по вершинам, разложенным по кругу: i-я вершина стоит на угле i·360/n.
 * Формы, построенные так с одинаковым n, морфятся ключами: у них совпадают число вершин,
 * порядок обхода и стартовая вершина.
 * @param {{r: number, tangent?: number, corner?: boolean}[]} vertices
 *   r — радиус вершины; corner — угол (касательные идут к соседям долей tangent, по умолчанию 1/3,
 *   сторона остаётся прямой); без corner касательная перпендикулярна радиусу, длина tangent
 *   (по умолчанию 0.2652·r — столько нужно кругу из n=8 точек)
 * @returns {Shape}
 */
function kbMorphPath(vertices) {
  var n = vertices.length;
  /** @type {[number, number][]} */
  var points = [];
  /** @type {[number, number][]} */
  var inTangents = [];
  /** @type {[number, number][]} */
  var outTangents = [];
  var i, angle, vertex;

  for (i = 0; i < n; i++) {
    angle = i * 2 * Math.PI / n;
    points.push([vertices[i].r * Math.cos(angle), vertices[i].r * Math.sin(angle)]);
  }
  for (i = 0; i < n; i++) {
    vertex = vertices[i];
    angle = i * 2 * Math.PI / n;
    if (vertex.corner) {
      var prev = points[(i + n - 1) % n];
      var next = points[(i + 1) % n];
      var k = vertex.tangent === undefined ? 1 / 3 : vertex.tangent;
      inTangents.push([(prev[0] - points[i][0]) * k, (prev[1] - points[i][1]) * k]);
      outTangents.push([(next[0] - points[i][0]) * k, (next[1] - points[i][1]) * k]);
    } else {
      var len = vertex.tangent === undefined ? 0.2652 * vertex.r : vertex.tangent;
      var dx = -Math.sin(angle) * len;
      var dy = Math.cos(angle) * len;
      inTangents.push([-dx, -dy]);
      outTangents.push([dx, dy]);
    }
  }

  var shape = new Shape();
  shape.vertices = points;
  shape.inTangents = inTangents;
  shape.outTangents = outTangents;
  shape.closed = true;
  return shape;
}

/**
 * Круг из 8 вершин — база морфа.
 * @param {number} radius
 * @returns {Shape}
 */
function kbMorphCircle(radius) {
  var vertices = [];
  for (var i = 0; i < 8; i++) vertices.push({ r: radius });
  return kbMorphPath(vertices);
}

/**
 * Квадрат из 8 вершин: 4 угла и 4 середины сторон, стороны прямые.
 * @param {number} half половина стороны
 * @returns {Shape}
 */
function kbMorphSquare(half) {
  var vertices = [];
  for (var i = 0; i < 8; i++) vertices.push({ r: i % 2 === 0 ? half : half * Math.sqrt(2), corner: true });
  return kbMorphPath(vertices);
}

/**
 * Четырёхлучевая звезда-клякса из 8 вершин: лучи на чётных, впадины на нечётных.
 * Касательные мягкие — луч острый, но не иглой, впадина круглая.
 * @param {number[]} tips радиусы четырёх лучей
 * @param {number[]} valleys радиусы четырёх впадин
 * @returns {Shape}
 */
function kbMorphStar(tips, valleys) {
  var vertices = [];
  for (var i = 0; i < 8; i++) {
    if (i % 2 === 0) vertices.push({ r: tips[i / 2], tangent: 0.11 * tips[i / 2] });
    else vertices.push({ r: valleys[(i - 1) / 2], tangent: 0.5 * valleys[(i - 1) / 2] });
  }
  return kbMorphPath(vertices);
}

/**
 * Ключи цвета по расписанию морфа — ступеньками: цвет держится до самой посадки и перекидывается
 * ровно на ударе, одним кадром. Плавный переход цвета здесь запрещён: путь из охры в синий идёт
 * через грязно-серый, и фигура на середине морфа выцветает (видно на листе кадров от 17:19).
 * Скачок не режет глаз, потому что совпадает с ударом — перелётом масштаба и веером.
 *
 * Ступеньку ставим на 0,02 с раньше посадки, в зазор между затворами соседних кадров. Слой идёт
 * со смазом, а смаз — это усреднение по открытому затвору (180°, ±0,0083 с вокруг кадра): ключ,
 * попавший внутрь затвора, даёт ровно один кадр смешанного цвета — охра с синим дают серый,
 * и именно он оказывается на главном кадре удара.
 * @param {Property} prop цветное свойство (заливка формы или параметр эффекта)
 * @param {number[][]} times пары [начало, конец] переходов, как у kbMorph (times[0] не используется)
 * @param {[number, number, number][]} colors цвет каждой формы
 */
function kbKeyColor(prop, times, colors) {
  prop.setValueAtTime(0, [colors[0][0], colors[0][1], colors[0][2], 1]);
  for (var i = 1; i < colors.length; i++) {
    prop.setValueAtTime(times[i][1] - 0.02, [colors[i][0], colors[i][1], colors[i][2], 1]);
  }
  for (var k = 1; k <= prop.numKeys; k++) {
    prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
  }
}

/**
 * Фигура, которая перетекает из формы в форму. Ключи стоят у ОДНОГО пути (ADBE Vector Shape),
 * поэтому AE ведёт вершины, а не подменяет фигуру; формы обязаны быть из kbMorphPath.
 * Между переходами фигура дышит (выражение на масштабе группы), на ударе — перелёт масштаба
 * и доворот, чтобы посадка была упругой.
 * @param {CompItem} comp
 * @param {Shape[]} shapes формы по порядку; shapes[0] стоит с начала композиции
 * @param {number[][]} times пары [начало, конец] перехода в shapes[i] для i ≥ 1
 * @param {[number, number, number][]|null} colors цвет каждой формы; null — белая заливка (источник жидкости)
 * @param {{x: number, y: number, beats?: number[], breath?: number, rate?: number, pop?: number, spin?: number, enter?: number}} opts
 *   breath — размах дыхания в %, rate — его частота; pop — перелёт масштаба на ударе в %,
 *   spin — доворот на ударе в градусах; enter — за сколько секунд фигура набирает размер в начале
 * @returns {ShapeLayer}
 */
function kbMorph(comp, shapes, times, colors, opts) {
  var layer = comp.layers.addShape();
  layer.name = "morph";
  layer.motionBlur = true;

  var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  var contents = kbGroup(group, ["ADBE Vectors Group"]);
  var path = kbAdd(contents, "ADBE Vector Shape - Group");

  var keyTimes = [0];
  var keyValues = [shapes[0]];
  var i;
  for (i = 1; i < shapes.length; i++) {
    keyTimes.push(times[i][0]);
    keyValues.push(shapes[i - 1]); // форма держится до начала перехода
    keyTimes.push(times[i][1]);
    keyValues.push(shapes[i]);
  }
  kbKeys(kbProp(path, ["ADBE Vector Shape"]), keyTimes, keyValues, KB_EASE.snap);

  var fill = kbAdd(contents, "ADBE Vector Graphic - Fill");
  var fillColor = kbProp(fill, ["ADBE Vector Fill Color"]);
  if (colors) kbKeyColor(fillColor, times, colors);
  else fillColor.setValue([1, 1, 1, 1]);

  var breath = opts.breath === undefined ? 2.4 : opts.breath;
  var rate = opts.rate === undefined ? 5.2 : opts.rate;
  if (breath > 0) {
    kbProp(group, ["ADBE Vector Transform Group", "ADBE Vector Scale"]).expression =
      "var a = Math.sin(time * " + rate + ") * " + breath + ";\n[100 + a, 100 - a * 0.6];";
  }

  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([opts.x, opts.y]);

  var scale = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]);
  var rotation = kbProp(layer, ["ADBE Transform Group", "ADBE Rotate Z"]);
  var enter = opts.enter === undefined ? 0.22 : opts.enter;
  if (enter > 0) kbKeys(scale, [0, enter], [[72, 72, 100], [100, 100, 100]], KB_EASE.snap);

  var pop = opts.pop === undefined ? 12 : opts.pop;
  var spin = opts.spin === undefined ? 7 : opts.spin;
  var beats = opts.beats || [];
  for (i = 0; i < beats.length; i++) {
    var b = beats[i];
    kbKeys(scale, [b - 0.08, b + 0.02, b + 0.3], [[100, 100, 100], [100 + pop, 100 + pop, 100], [100, 100, 100]], KB_EASE.snap);
    // Доворот в разные стороны через удар — иначе фигура отбивает такт всегда одинаково.
    var turn = i % 2 === 0 ? spin : -spin;
    kbKeys(rotation, [b - 0.08, b + 0.02, b + 0.34], [0, turn, 0], KB_EASE.snap);
  }
  return layer;
}

/**
 * Жидкие капли вокруг центра: эллипсы уходят от фигуры и возвращаются в неё. Орбита задана
 * выражением, поэтому капли живут и после последнего удара, когда ключи кончились.
 * Слой белый — цвет и слияние ему даёт kbMetaball.
 *
 * Дальность идёт не синусом, а его корнем: капля быстро выходит, подолгу стоит снаружи и
 * быстро возвращается. Синус держал каплю в теле фигуры две трети времени — капель не было
 * видно вовсе, а на выходе они успевали только вспухнуть горбом и утонуть обратно.
 * Перемычка живёт считанные кадры: масса после choke уходит внутрь контура на ~25 px, и
 * размытие 70 сшивает пятна, только пока зазор между исходными краями меньше ~10 px, —
 * поэтому важно, чтобы капли пересекали край часто (период 1,1–1,8 с на семь капель).
 * @param {CompItem} comp
 * @param {{x: number, y: number, drops: {size: number, radius: number, period: number, start: number, phase: number, angle: number, spin: number}[], beats?: number[], kick?: number, cap?: number, ramp?: number, squash?: [number, number], room?: number}} opts
 *   drops: size — диаметр капли; radius — дальность ухода; period — секунды на уход и возврат;
 *   start — когда капля начинает жить; phase — где она в этот момент по циклу (0…1, 0 — в центре
 *   фигуры); angle — начальный угол в радианах; spin — рад/с по орбите.
 *   kick — добавка к радиусу на ударе; cap — потолок радиуса долей от radius; ramp — за сколько
 *   секунд капля набирает полную дальность (иначе капля с ненулевой фазой возникает из воздуха);
 *   squash — растяжка орбиты по осям (сверху и снизу места больше, чем справа, где стоит слово);
 *   room — насколько орбита короче справа
 * @returns {ShapeLayer}
 */
function kbBlobs(comp, opts) {
  var layer = comp.layers.addShape();
  layer.name = "blobs";
  layer.motionBlur = true;

  var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  var contents = kbGroup(group, ["ADBE Vectors Group"]);

  var beats = opts.beats || [];
  var beatList = "";
  for (var b = 0; b < beats.length; b++) beatList += (b ? ", " : "") + beats[b];
  var kick = opts.kick === undefined ? 70 : opts.kick;
  var capFactor = opts.cap === undefined ? 1.08 : opts.cap;
  var ramp = opts.ramp === undefined ? 0.35 : opts.ramp;
  var squash = opts.squash || [0.92, 1];
  var room = opts.room === undefined ? 0.34 : opts.room;

  for (var i = 0; i < opts.drops.length; i++) {
    var drop = opts.drops[i];
    var ellipse = kbAdd(contents, "ADBE Vector Shape - Ellipse");
    var cap = drop.radius * capFactor;

    kbProp(ellipse, ["ADBE Vector Ellipse Position"]).expression =
      "var t = time - " + drop.start + ";\n" +
      "var p = [0, 0];\n" +
      "if (t > 0) {\n" +
      "  var amp = t < " + ramp + " ? t / " + ramp + " : 1;\n" +
      "  var u = 0.5 - 0.5 * Math.cos((t / " + drop.period + " + " + drop.phase + ") * 2 * Math.PI);\n" +
      "  var r = " + drop.radius + " * amp * Math.sqrt(u);\n" +
      "  var b = [" + beatList + "];\n" +
      "  for (var i = 0; i < b.length; i++) if (time > b[i]) r += " + kick + " * Math.exp(-(time - b[i]) * 5);\n" +
      "  if (r > " + cap + ") r = " + cap + ";\n" +
      "  var a = " + drop.angle + " + (" + drop.spin + ") * t;\n" +
      "  r = r * (1 - " + room + " * Math.max(0, Math.cos(a)));\n" +
      "  p = [r * Math.cos(a) * " + squash[0] + ", r * Math.sin(a) * " + squash[1] + "];\n" +
      "}\n" +
      "p;";

    kbProp(ellipse, ["ADBE Vector Ellipse Size"]).expression =
      "var s = " + drop.size + " + Math.sin(time * 2.6 + " + drop.angle + ") * " + (drop.size * 0.07).toFixed(1) + ";\n[s, s];";
  }

  var fill = kbAdd(contents, "ADBE Vector Graphic - Fill");
  kbProp(fill, ["ADBE Vector Fill Color"]).setValue([1, 1, 1, 1]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([opts.x, opts.y]);
  return layer;
}

/**
 * Слияние всего, что есть на слое, в одну жидкую массу: размытие склеивает соседние пятна
 * перемычками, сжатие мата возвращает краю чёткость, Fill красит массу целиком.
 * Слой-источник держать белым: цвет живёт только здесь, значит капли и фигура одного цвета.
 *
 * Связка выбрана по кадру (лаборатория края, три варианта рядом — out/frames/view/shdlab-0050.png):
 * blur 70 + Simple Choker 30 + Fill даёт край в три пикселя, без ореола. Levels по альфе вместо
 * чокера оставляет мыло (канал Alpha у ADBE Easy Levels2 индексом не нащупан), Matte Choker
 * поверх чокера не меняет ничего. Плата за чистый край: масса уходит внутрь контура на ~25 px,
 * и перемычка живёт, только пока зазор между исходными краями меньше ~10 px — «нитка» между
 * каплей и фигурой видна доли секунды, на отрыве и на возврате.
 * @param {AVLayer} layer
 * @param {{blur?: number, choke?: number, wobble?: number, colors?: [number, number, number][], times?: number[][]}} opts
 *   wobble — размах турбулентности до размытия (капли ходят, как ртуть); colors/times — как у kbMorph
 */
function kbMetaball(layer, opts) {
  opts = opts || {};
  var wobble = opts.wobble === undefined ? 18 : opts.wobble;
  if (wobble > 0) {
    var warp = kbEffect(layer, "ADBE Turbulent Displace");
    kbProp(warp, ["ADBE Turbulent Displace-0002"]).setValue(wobble); // Amount
    kbProp(warp, ["ADBE Turbulent Displace-0003"]).setValue(260); // Size — крупные складки, а не рябь
    kbProp(warp, ["ADBE Turbulent Displace-0006"]).expression = "time * 110;"; // Evolution
  }

  var blur = kbEffect(layer, "ADBE Gaussian Blur 2");
  kbProp(blur, ["ADBE Gaussian Blur 2-0001"]).setValue(opts.blur === undefined ? 70 : opts.blur); // Blurriness

  var choke = kbEffect(layer, "ADBE Simple Choker");
  kbProp(choke, ["ADBE Simple Choker-0002"]).setValue(opts.choke === undefined ? 30 : opts.choke); // Choke Matte

  var fill = kbEffect(layer, "ADBE Fill");
  var color = kbProp(fill, ["ADBE Fill-0002"]); // Color
  if (opts.colors && opts.times) kbKeyColor(color, opts.times, opts.colors);
  else if (opts.colors) color.setValue([opts.colors[0][0], opts.colors[0][1], opts.colors[0][2], 1]);
}

/**
 * Радиальный веер: короткие штрихи по кругу выстреливают наружу и гаснут. Одна линия,
 * размноженная Repeater'ом, — поэтому 24 копии стоят ровно и Trim Paths режет их разом.
 * @param {CompItem} comp
 * @param {{x: number, y: number, time: number, color: [number, number, number], radius?: number, length?: number, copies?: number, width?: number, fly?: number, turn?: number}} opts
 *   radius — где штрих начинается; length — его длина; fly — во сколько раз веер разъезжается;
 *   turn — начальный поворот всего веера в градусах
 * @returns {ShapeLayer}
 */
function kbBurst(comp, opts) {
  var layer = comp.layers.addShape();
  layer.name = "burst";
  layer.motionBlur = true;

  var radius = opts.radius === undefined ? 300 : opts.radius;
  var length = opts.length === undefined ? 80 : opts.length;
  var copies = opts.copies === undefined ? 24 : opts.copies;
  var t = opts.time;

  var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  var contents = kbGroup(group, ["ADBE Vectors Group"]);

  var path = kbAdd(contents, "ADBE Vector Shape - Group");
  var line = new Shape();
  line.vertices = [[0, -radius], [0, -(radius + length)]];
  line.closed = false;
  kbProp(path, ["ADBE Vector Shape"]).setValue(line);

  var stroke = kbAdd(contents, "ADBE Vector Graphic - Stroke");
  kbProp(stroke, ["ADBE Vector Stroke Color"]).setValue([opts.color[0], opts.color[1], opts.color[2], 1]);
  kbProp(stroke, ["ADBE Vector Stroke Width"]).setValue(opts.width === undefined ? 5 : opts.width);
  kbProp(stroke, ["ADBE Vector Stroke Line Cap"]).setValue(2); // Round Cap

  // Штрих вылетает: сначала бежит конец, следом догоняет начало — линия уходит наружу и исчезает.
  var trim = kbAdd(contents, "ADBE Vector Filter - Trim");
  kbKeys(kbProp(trim, ["ADBE Vector Trim End"]), [t, t + 0.1], [0, 100], KB_EASE.punch);
  kbKeys(kbProp(trim, ["ADBE Vector Trim Start"]), [t + 0.09, t + 0.3], [0, 100], KB_EASE.soft);

  var repeater = kbAdd(contents, "ADBE Vector Filter - Repeater");
  kbProp(repeater, ["ADBE Vector Repeater Copies"]).setValue(copies);
  var repeat = kbGroup(repeater, ["ADBE Vector Repeater Transform"]);
  kbProp(repeat, ["ADBE Vector Repeater Position"]).setValue([0, 0]); // по умолчанию копии уезжают вправо
  kbProp(repeat, ["ADBE Vector Repeater Rotation"]).setValue(360 / copies);

  var transform = kbGroup(group, ["ADBE Vector Transform Group"]);
  kbProp(transform, ["ADBE Vector Rotation"]).setValue(opts.turn === undefined ? 0 : opts.turn);
  var fly = opts.fly === undefined ? 1.18 : opts.fly;
  kbKeys(kbProp(transform, ["ADBE Vector Scale"]), [t, t + 0.35], [[100, 100], [100 * fly, 100 * fly]], KB_EASE.punch);

  kbKeys(kbProp(layer, ["ADBE Transform Group", "ADBE Opacity"]), [t + 0.16, t + 0.34], [100, 0], KB_EASE.soft);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([opts.x, opts.y]);
  return layer;
}
