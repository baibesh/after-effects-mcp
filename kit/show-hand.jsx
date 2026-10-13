// Маркер, проведённый рукой: полоса-выделение и подчёркивание.
//
// Приёмка владельца: «ровная полоса с косыми срезами» — но не напечатанная плашка. Рука ведёт прямо,
// однако линейки у неё нет: ход чуть выгибается и сносится, край нибблится волокном бумаги, краска
// ложится неровно (в начале плотнее — там наконечник поставили), а текст под полупрозрачным фломастером
// теплеет. Всё это здесь и собрано; волны и кляксы сознательно не делаем — их владелец уже отверг.
//
// Слой идёт умножением: краска на бумаге, буквы поверх. Яркостей выше 1.0 в слое нет, поэтому
// 8-битный Roughen Edges тут допустим.

//@include "core.jsx"
//@include "motion.jsx"
//@include "shape.jsx"
//@include "look.jsx"

/**
 * Повторяемый псевдослучайный ряд (ES3, без Math.random): один и тот же seed — один и тот же штрих.
 * @param {number} seed
 * @returns {function(): number} следующее число в [0, 1)
 */
function kbHandNoise(seed) {
  var state = Math.floor(seed === undefined ? 1 : seed) % 2147483647;
  if (state <= 0) state += 2147483646;
  return function () {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/**
 * Полоса текстовыделителем, проведённая рукой.
 *
 * Что внутри: траектория из нескольких вершин с разбросом по вертикали, лёгкой дугой и сносом конца
 * (сглажена по Catmull-Rom); постоянная толщина — ширину даёт наконечник, а не нажим; косые срезы концов
 * перекосом группы; второй короткий проход в начале — чуть плотнее краска; к концу штрих легче
 * (вычитающая маска с растушёвкой); продольные разводы (kbInkStreaks), микронеровность края
 * (Turbulent Displace + Roughen Edges, оба без эволюции — бумага не шевелится).
 *
 * @param {CompItem} comp
 * @param {{x: number, y: number, width: number, thickness: number, color: [number, number, number],
 *   start: number, duration?: number, seed?: number, tilt?: number, cut?: number, wobble?: number,
 *   arc?: number, slant?: number, points?: number, rough?: number, roughSize?: number, fade?: number,
 *   head?: number, name?: string}} opts
 *   x, y — центр полосы в кадре; width/thickness — длина и высота штриха; start/duration — прорисовка;
 *   seed — номер штриха (разные штрихи не должны совпадать); tilt — наклон слоя, град. (по умолчанию −0.9);
 *   cut — угол косого среза концов (−16); wobble — разброс вершин по вертикали, px (4.5);
 *   arc — прогиб дуги, px (3); slant — снос конца относительно начала, px (3); points — число вершин (5);
 *   rough — увод края, px (3); roughSize — длина волны увода, px (140: меньше 80 даёт рябь);
 *   fade — насколько легче краска к концу, % (16);
 *   head — доля длины второго, более плотного прохода в начале (0 — выключен; включать только на длинных
 *   полосах: на коротких стык прохода виден как печатная граница)
 * @returns {ShapeLayer}
 */
function kbHandMarker(comp, opts) {
  var rnd = kbHandNoise(opts.seed === undefined ? 5 : opts.seed);
  var half = opts.width / 2;
  var count = opts.points === undefined ? 5 : opts.points;
  var wobble = opts.wobble === undefined ? 4.5 : opts.wobble;
  var arc = opts.arc === undefined ? 3 : opts.arc;
  var slant = opts.slant === undefined ? 3 : opts.slant;
  var cut = opts.cut === undefined ? -16 : opts.cut;
  var duration = opts.duration === undefined ? 0.34 : opts.duration;
  var head = opts.head === undefined ? 0 : opts.head;

  var layer = comp.layers.addShape();
  layer.name = opts.name || "marker";
  layer.blendingMode = BlendingMode.MULTIPLY;
  layer.motionBlur = true;

  // Вершины штриха: дуга + снос + разброс. Первая и последняя тоже гуляют — рука не ставит точку по линейке.
  var i, t;
  /** @type {[number, number][]} */
  var points = [];
  for (i = 0; i < count; i++) {
    t = count === 1 ? 0 : i / (count - 1);
    var bow = Math.sin(t * Math.PI) * arc;
    var drift = (t - 0.5) * slant;
    var jitter = (rnd() * 2 - 1) * wobble;
    points.push([-half + opts.width * t, bow + drift + jitter]);
  }

  var root = kbGroup(layer, ["ADBE Root Vectors Group"]);

  // Второй проход кладём первым: в списке содержимого верхний элемент рисуется поверх нижних.
  if (head > 0) {
    /** @type {[number, number][]} */
    var headPoints = [];
    var headCount = Math.max(2, Math.round(count * head) + 1);
    for (i = 0; i < headCount; i++) {
      t = i / (headCount - 1) * head;
      headPoints.push([-half + opts.width * t, Math.sin(t * Math.PI) * arc + (t - 0.5) * slant + (rnd() * 2 - 1) * wobble * 0.6]);
    }
    // Толщину второй проход не меняет: любая ступенька по высоте читается как брак печати, а не как краска.
    /** @type {[number, number, number]} */
    var dense = [opts.color[0], opts.color[1] * 0.97, opts.color[2] * 0.88];
    kbHandPass(root, headPoints, dense, opts.thickness, opts.start, duration * head * 1.2, cut * 1.7, "pass-2");
  }
  kbHandPass(root, points, opts.color, opts.thickness, opts.start, duration, cut, "pass-1");

  // Нажим слабеет к концу: вычитающая маска с широкой растушёвкой снимает несколько процентов краски.
  var fade = opts.fade === undefined ? 16 : opts.fade;
  if (fade > 0) {
    var masks = kbGroup(layer, ["ADBE Mask Parade"]);
    // Вычитающая маска на слое без открывающей стирает его целиком (проверено на живом AE): сначала Add
    // на весь штрих с запасом под смещение краёв, и только потом Subtract на хвост.
    var all = new Shape();
    all.vertices = [[-half - 400, -opts.thickness * 2], [half + 400, -opts.thickness * 2],
      [half + 400, opts.thickness * 2], [-half - 400, opts.thickness * 2]];
    all.closed = true;
    var open = /** @type {MaskPropertyGroup} */ (kbAdd(masks, "ADBE Mask Atom")); // ae-ok: matchname
    open.name = "all";
    open.maskMode = MaskMode.ADD;
    kbProp(open, ["ADBE Mask Shape"]).setValue(all); // ae-ok: matchname

    // Край маски стоит в первой трети, растушёвка — почти на весь штрих: краска густая там, где наконечник
    // поставили, и постепенно легчает к отрыву. Ступеньки нет, потому что граница размазана по всей длине.
    var tail = new Shape();
    tail.vertices = [[-half * 0.4, -opts.thickness * 2], [half + 400, -opts.thickness * 2],
      [half + 400, opts.thickness * 2], [-half * 0.4, opts.thickness * 2]];
    tail.closed = true;
    var less = /** @type {MaskPropertyGroup} */ (kbAdd(masks, "ADBE Mask Atom")); // ae-ok: matchname
    less.name = "tail";
    less.maskMode = MaskMode.SUBTRACT;
    kbProp(less, ["ADBE Mask Shape"]).setValue(tail); // ae-ok: matchname
    kbProp(less, ["ADBE Mask Feather"]).setValue([opts.width * 0.5, opts.width * 0.5]); // ae-ok: matchname
    kbProp(less, ["ADBE Mask Opacity"]).setValue(fade); // ae-ok: matchname
  }

  kbInkStreaks(layer);

  // Край: волокно бумаги съедает ровную линию. Эволюция не анимируется — краска высохла и не шевелится.
  // Большая длина волны — это лёгкий увод штриха, а не рябь: при Size ≈ 60 полоса начинает волниться.
  var rough = opts.rough === undefined ? 3 : opts.rough;
  var warp = kbEffect(layer, "ADBE Turbulent Displace");
  kbProp(warp, ["ADBE Turbulent Displace-0002"]).setValue(rough); // Amount
  kbProp(warp, ["ADBE Turbulent Displace-0003"]).setValue(opts.roughSize === undefined ? 140 : opts.roughSize); // Size
  kbProp(warp, ["ADBE Turbulent Displace-0005"]).setValue(2); // Complexity
  kbProp(warp, ["ADBE Turbulent Displace-0006"]).setValue((opts.seed || 5) * 37); // Evolution

  var edge = kbEffect(layer, "ADBE Roughen Edges"); // ae-ok: bpc
  kbProp(edge, ["ADBE Roughen Edges-0002"]).setValue(3); // Border
  kbProp(edge, ["ADBE Roughen Edges-0003"]).setValue(1.4); // Edge Sharpness
  kbProp(edge, ["ADBE Roughen Edges-0005"]).setValue(26); // Scale
  kbProp(edge, ["ADBE Roughen Edges-0008"]).setValue(2); // Complexity
  kbProp(edge, ["ADBE Roughen Edges-0009"]).setValue((opts.seed || 5) * 53); // Evolution

  kbProp(layer, ["ADBE Transform Group", "ADBE Rotate Z"]).setValue(opts.tilt === undefined ? -0.9 : opts.tilt);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([opts.x, opts.y]);
  return layer;
}

/**
 * Один проход маркера внутри слоя: путь, обводка постоянной ширины, прорисовка и косой срез концов.
 * @param {PropertyGroup} root группа «Contents» слоя
 * @param {[number, number][]} points
 * @param {[number, number, number]} color
 * @param {number} thickness
 * @param {number} start
 * @param {number} duration
 * @param {number} cut угол среза, град.
 * @param {string} name
 * @returns {PropertyGroup}
 */
function kbHandPass(root, points, color, thickness, start, duration, cut, name) {
  var group = kbAdd(root, "ADBE Vector Group");
  group.name = name;
  var contents = kbGroup(group, ["ADBE Vectors Group"]);

  var path = kbAdd(contents, "ADBE Vector Shape - Group");
  kbProp(path, ["ADBE Vector Shape"]).setValue(kbSmoothPath(points));

  var stroke = kbAdd(contents, "ADBE Vector Graphic - Stroke");
  kbProp(stroke, ["ADBE Vector Stroke Color"]).setValue([color[0], color[1], color[2], 1]);
  kbProp(stroke, ["ADBE Vector Stroke Width"]).setValue(thickness);
  kbProp(stroke, ["ADBE Vector Stroke Line Cap"]).setValue(1); // Butt Cap — срез, а не скругление
  kbProp(stroke, ["ADBE Vector Stroke Line Join"]).setValue(2); // Round Join — на изломах нет шипов

  var trim = kbAdd(contents, "ADBE Vector Filter - Trim");
  kbKeys(kbProp(trim, ["ADBE Vector Trim End"]), [start, start + duration], [0, 100], KB_EASE.punch);

  // Перекос вдоль полосы (ось 0°) даёт косые торцы и у начала, и у бегущего конца.
  var transform = kbGroup(group, ["ADBE Vector Transform Group"]);
  kbProp(transform, ["ADBE Vector Skew"]).setValue(cut);
  kbProp(transform, ["ADBE Vector Skew Axis"]).setValue(0);
  return group;
}

/**
 * Подчёркивание от руки: тот же приём, только тоньше и спокойнее.
 * @param {CompItem} comp
 * @param {{x: number, y: number, width: number, color: [number, number, number], start: number,
 *   duration?: number, thickness?: number, seed?: number, tilt?: number, cut?: number, wobble?: number,
 *   arc?: number, fade?: number, head?: number, name?: string}} opts
 * @returns {ShapeLayer}
 */
function kbHandUnderline(comp, opts) {
  return kbHandMarker(comp, {
    x: opts.x, y: opts.y, width: opts.width, thickness: opts.thickness === undefined ? 30 : opts.thickness,
    color: opts.color, start: opts.start, duration: opts.duration === undefined ? 0.3 : opts.duration,
    seed: opts.seed, tilt: opts.tilt === undefined ? -1.3 : opts.tilt,
    cut: opts.cut === undefined ? -24 : opts.cut,
    wobble: opts.wobble === undefined ? 2.4 : opts.wobble,
    arc: opts.arc === undefined ? 2 : opts.arc,
    slant: 2,
    rough: 4,
    fade: opts.fade === undefined ? 14 : opts.fade,
    head: opts.head === undefined ? 0.26 : opts.head,
    name: opts.name || "underline"
  });
}

/**
 * Краска поверх букв: копия штриха ложится НАД текстом с малой непрозрачностью, и буквы под маркером
 * теплеют, как под настоящим полупрозрачным фломастером. На самой полосе копия невидима — цвет тот же.
 * Вызывать последним: копия забирает все ключи штриха (прорисовку и наезд), поэтому их ставят до неё.
 * @param {AVLayer} band слой маркера (результат kbHandMarker)
 * @param {AVLayer} over слой, который лежит поверх полосы (текст): копия встанет прямо над ним
 * @param {{opacity?: number}} [opts] непрозрачность копии, % (по умолчанию 2.2)
 *   Проект смешивает в линейном свете, поэтому проценты обманчивы: 12 % уже красят тушь в оливу
 *   (замер [78, 58, 29]), а 2–3 % дают тот самый «чуть другой» тон (замер [42, 35, 19] против [19, 19, 19]).
 * @returns {AVLayer}
 */
function kbMarkerGlaze(band, over, opts) {
  opts = opts || {};
  var glaze = /** @type {AVLayer} */ (band.duplicate());
  glaze.name = band.name + "-glaze";
  glaze.blendingMode = BlendingMode.NORMAL;
  kbProp(glaze, ["ADBE Transform Group", "ADBE Opacity"]).setValue(opts.opacity === undefined ? 2.2 : opts.opacity);
  glaze.moveBefore(over);
  return glaze;
}
