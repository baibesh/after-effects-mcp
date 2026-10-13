// Shape-слои: гладкий путь по точкам и черта текстовыделителем.

//@include "core.jsx"
//@include "motion.jsx"

/**
 * Открытый путь по точкам с плавными касательными (Catmull-Rom → Безье).
 * @param {[number, number][]} points
 * @returns {Shape}
 */
function kbSmoothPath(points) {
  /** @type {[number, number][]} */
  var inTangents = [];
  /** @type {[number, number][]} */
  var outTangents = [];
  for (var i = 0; i < points.length; i++) {
    var prev = points[i === 0 ? 0 : i - 1];
    var next = points[i === points.length - 1 ? i : i + 1];
    var tx = (next[0] - prev[0]) / 6;
    var ty = (next[1] - prev[1]) / 6;
    inTangents.push([-tx, -ty]);
    outTangents.push([tx, ty]);
  }
  var shape = new Shape();
  shape.vertices = points;
  shape.inTangents = inTangents;
  shape.outTangents = outTangents;
  shape.closed = false;
  return shape;
}

/**
 * Черта текстовыделителем. У настоящего маркера наконечник скошен: полоса ровная, постоянной ширины,
 * а начало и конец срезаны наискось. Поэтому путь прямой, концы без скругления, срез даёт перекос группы;
 * «живость» — только лёгкий наклон и продольные разводы чернил (kbInkStreaks).
 * Ложится умножением — краска на бумаге, буквы поверх.
 * @param {CompItem} comp
 * @param {{x: number, y: number, width: number, thickness: number, color: [number, number, number], start: number, duration: number, tilt?: number, cut?: number}} opts
 *   tilt — наклон полосы в градусах (по умолчанию −1.2), cut — угол среза концов (по умолчанию −16)
 * @returns {ShapeLayer}
 */
function kbMarkerStroke(comp, opts) {
  var layer = comp.layers.addShape();
  layer.name = "marker";
  layer.blendingMode = BlendingMode.MULTIPLY;
  layer.motionBlur = true;

  var half = opts.width / 2;
  var line = new Shape();
  line.vertices = [[-half, 0], [half, 0]];
  line.closed = false;

  var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  var contents = kbGroup(group, ["ADBE Vectors Group"]);

  var path = kbAdd(contents, "ADBE Vector Shape - Group");
  kbProp(path, ["ADBE Vector Shape"]).setValue(line);

  var stroke = kbAdd(contents, "ADBE Vector Graphic - Stroke");
  kbProp(stroke, ["ADBE Vector Stroke Color"]).setValue([opts.color[0], opts.color[1], opts.color[2], 1]);
  kbProp(stroke, ["ADBE Vector Stroke Width"]).setValue(opts.thickness);
  kbProp(stroke, ["ADBE Vector Stroke Line Cap"]).setValue(1); // Butt Cap — срез, а не скругление

  var trim = kbAdd(contents, "ADBE Vector Filter - Trim");
  kbKeys(kbProp(trim, ["ADBE Vector Trim End"]), [opts.start, opts.start + opts.duration], [0, 100], KB_EASE.punch);

  // Перекос вдоль полосы (ось 0°) превращает прямые торцы в косые срезы — и у начала, и у бегущего конца.
  // Ось 90° перекашивает саму полосу в диагональ — проверено на живом AE.
  var transform = kbGroup(group, ["ADBE Vector Transform Group"]);
  kbProp(transform, ["ADBE Vector Skew"]).setValue(opts.cut === undefined ? -16 : opts.cut);
  kbProp(transform, ["ADBE Vector Skew Axis"]).setValue(0);

  kbProp(layer, ["ADBE Transform Group", "ADBE Rotate Z"]).setValue(opts.tilt === undefined ? -1.2 : opts.tilt);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([opts.x, opts.y]);
  return layer;
}

/**
 * Подчёркивание маркером: та же полоса, но тонкая и под строкой.
 * @param {CompItem} comp
 * @param {{x: number, y: number, width: number, color: [number, number, number], start: number, duration?: number, thickness?: number}} opts
 * @returns {ShapeLayer}
 */
function kbUnderline(comp, opts) {
  return kbMarkerStroke(comp, {
    x: opts.x, y: opts.y, width: opts.width, thickness: opts.thickness || 30, color: opts.color,
    start: opts.start, duration: opts.duration || 0.3, tilt: -1.5, cut: -24
  });
}

/**
 * Рисунок проявляется так, будто его закрашивают маркером: по слою зигзагом идёт толстый штрих-мат.
 * Строки зигзага перекрываются, поэтому к концу рисунок открыт целиком.
 * @param {CompItem} comp
 * @param {AVLayer} layer слой, который проявляем
 * @param {{x: number, y: number, width: number, height: number, start: number, duration: number, rows?: number}} box
 *   прямоугольник рисунка в кадре (x, y — левый верхний угол)
 * @returns {ShapeLayer} слой-мат
 */
function kbScribbleReveal(comp, layer, box) {
  var rows = box.rows || 7;
  var rowHeight = box.height / rows;
  /** @type {[number, number][]} */
  var points = [];
  for (var r = 0; r <= rows; r++) {
    var y = box.y + r * rowHeight;
    var left = box.x - 40;
    var right = box.x + box.width + 40;
    // Штрих идёт наискось, как рука: справа налево с подъёмом.
    points.push(r % 2 === 0 ? [left, y + rowHeight * 0.35] : [right, y - rowHeight * 0.35]);
  }

  var matte = comp.layers.addShape();
  matte.name = layer.name + "-scribble";
  var group = kbAdd(kbGroup(matte, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  var contents = kbGroup(group, ["ADBE Vectors Group"]);
  var path = kbAdd(contents, "ADBE Vector Shape - Group");
  var zigzag = new Shape();
  zigzag.vertices = points;
  zigzag.closed = false;
  kbProp(path, ["ADBE Vector Shape"]).setValue(zigzag);

  var stroke = kbAdd(contents, "ADBE Vector Graphic - Stroke");
  kbProp(stroke, ["ADBE Vector Stroke Color"]).setValue([1, 1, 1, 1]);
  kbProp(stroke, ["ADBE Vector Stroke Width"]).setValue(rowHeight * 2.1);
  kbProp(stroke, ["ADBE Vector Stroke Line Cap"]).setValue(2); // Round Cap
  kbProp(stroke, ["ADBE Vector Stroke Line Join"]).setValue(2); // Round Join

  var trim = kbAdd(contents, "ADBE Vector Filter - Trim");
  kbKeys(kbProp(trim, ["ADBE Vector Trim End"]), [box.start, box.start + box.duration], [0, 100], KB_EASE.soft);

  kbProp(matte, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
  kbProp(matte, ["ADBE Transform Group", "ADBE Position"]).setValue([0, 0]);
  matte.moveBefore(layer);
  layer.setTrackMatte(matte, TrackMatteType.ALPHA);
  return matte;
}
