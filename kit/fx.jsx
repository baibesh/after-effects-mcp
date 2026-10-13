// Приёмы-удары: жидкая заливка кадра, конфетти, свечение в 32 битах.

//@include "core.jsx"
//@include "motion.jsx"

/**
 * Жидкая заливка: капля вырастает из точки и заполняет кадр, брызги вылетают вперёд и сливаются с ней.
 * «Жидкость» делают два эффекта подряд: размытие склеивает соседние пятна, сжатие мата возвращает чёткий край.
 * Слой остаётся фоном сцены. Фон композиции должен быть прозрачным, чтобы под каплей была предыдущая сцена.
 * @param {CompItem} comp
 * @param {{x: number, y: number, color: [number, number, number], start: number, duration: number, down?: boolean, paper?: boolean}} opts
 *   down — капля идёт сверху вниз; paper — добавить на заливку бумажное волокно
 * @returns {ShapeLayer}
 */
function kbLiquidFill(comp, opts) {
  var layer = comp.layers.addShape();
  layer.name = "liquid";

  var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  var contents = kbGroup(group, ["ADBE Vectors Group"]);
  var t0 = opts.start;
  var t1 = opts.start + opts.duration;

  var reach = Math.sqrt(Math.pow(comp.width, 2) + Math.pow(comp.height, 2)) * 2.3;
  var main = kbAdd(contents, "ADBE Vector Shape - Ellipse");
  kbKeys(kbProp(main, ["ADBE Vector Ellipse Size"]), [t0, t0 + opts.duration * 0.35, t1], [[0, 0], [620, 560], [reach, reach]], KB_EASE.soft);

  // Брызги: улетают раньше капли, потом она их догоняет.
  /** @type {[number, number, number][]} */
  var drops = [[-420, -760, 230], [380, -900, 190], [-90, -1180, 260], [520, -520, 170], [-560, -380, 150], [160, -1420, 140]];
  for (var i = 0; i < drops.length; i++) {
    var drop = kbAdd(contents, "ADBE Vector Shape - Ellipse");
    var size = drops[i][2];
    kbKeys(kbProp(drop, ["ADBE Vector Ellipse Size"]), [t0, t0 + opts.duration * 0.3, t1], [[0, 0], [size, size * 1.15], [size * 0.7, size * 0.7]], KB_EASE.snap);
    kbKeys(kbProp(drop, ["ADBE Vector Ellipse Position"]), [t0, t0 + opts.duration * 0.55], [[0, 0], [drops[i][0], opts.down ? -drops[i][1] : drops[i][1]]], KB_EASE.snap);
  }

  var fill = kbAdd(contents, "ADBE Vector Graphic - Fill");
  kbProp(fill, ["ADBE Vector Fill Color"]).setValue([opts.color[0], opts.color[1], opts.color[2], 1]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([opts.x, opts.y]);

  var warp = kbEffect(layer, "ADBE Turbulent Displace");
  kbProp(warp, ["ADBE Turbulent Displace-0002"]).setValue(70); // Amount
  kbProp(warp, ["ADBE Turbulent Displace-0003"]).setValue(160); // Size
  kbProp(warp, ["ADBE Turbulent Displace-0006"]).expression = "time * 260;"; // Evolution

  var blur = kbEffect(layer, "ADBE Gaussian Blur 2");
  kbProp(blur, ["ADBE Gaussian Blur 2-0001"]).setValue(70); // Blurriness
  var choke = kbEffect(layer, "ADBE Simple Choker");
  kbProp(choke, ["ADBE Simple Choker-0002"]).setValue(30); // Choke Matte

  if (opts.paper) {
    var noise = kbEffect(layer, "ADBE Fractal Noise");
    kbProp(noise, ["ADBE Fractal Noise-0004"]).setValue(14); // Contrast
    kbProp(noise, ["ADBE Fractal Noise-0005"]).setValue(47); // Brightness
    kbProp(noise, ["ADBE Fractal Noise-0010"]).setValue(3.5); // Scale
    kbProp(noise, ["ADBE Fractal Noise-0015"]).setValue(4); // Complexity
    kbProp(noise, ["ADBE Fractal Noise-0030"]).setValue(5); // Blending Mode: Multiply
  }
  return layer;
}

/**
 * Залп конфетти: бумажные квадратики разлетаются из точки и падают. CC Particle World считает в 16 битах —
 * слой держим под свечением, ярче 1.0 он не нужен.
 * @param {CompItem} comp
 * @param {{x: number, y: number, time: number, color: [number, number, number], seed?: number, amount?: number}} opts
 *   x, y — в пикселях кадра
 * @returns {AVLayer}
 */
function kbConfetti(comp, opts) {
  var layer = comp.layers.addSolid([0, 0, 0], "confetti", comp.width, comp.height, 1, comp.duration);
  var fx = kbEffect(layer, "CC Particle World"); // ae-ok: bpc

  var rate = kbProp(fx, ["CC Particle World-0004"]); // Birth Rate
  rate.setValueAtTime(0, 0);
  rate.setValueAtTime(opts.time - 0.04, 0);
  rate.setValueAtTime(opts.time, opts.amount === undefined ? 5 : opts.amount);
  rate.setValueAtTime(opts.time + 0.1, 0);
  kbProp(fx, ["CC Particle World-0005"]).setValue(1.7); // Longevity

  // Позиция источника — в долях ширины кадра от центра.
  kbProp(fx, ["CC Particle World-0007"]).setValue((opts.x - comp.width / 2) / comp.width); // Position X
  kbProp(fx, ["CC Particle World-0008"]).setValue((opts.y - comp.height / 2) / comp.width); // Position Y
  kbProp(fx, ["CC Particle World-0010"]).setValue(0.09); // Radius X
  kbProp(fx, ["CC Particle World-0011"]).setValue(0.03); // Radius Y

  kbProp(fx, ["CC Particle World-0016"]).setValue(2.7); // Velocity
  kbProp(fx, ["CC Particle World-0018"]).setValue(0.55); // Gravity
  kbProp(fx, ["CC Particle World-0041"]).setValue(3.2); // Resistance
  kbProp(fx, ["CC Particle World-0019"]).setValue(0.9); // Extra

  kbProp(fx, ["CC Particle World-0023"]).setValue(10); // Particle Type: QuadPolygon
  kbProp(fx, ["CC Particle World-0043"]).setValue(260); // Rotation Speed
  kbProp(fx, ["CC Particle World-0024"]).setValue(0.62); // Birth Size
  kbProp(fx, ["CC Particle World-0025"]).setValue(0.5); // Death Size
  kbProp(fx, ["CC Particle World-0026"]).setValue(60); // Size Variation
  kbProp(fx, ["CC Particle World-0027"]).setValue(100); // Max Opacity
  kbProp(fx, ["CC Particle World-0029"]).setValue([opts.color[0], opts.color[1], opts.color[2], 1]); // Birth Color
  kbProp(fx, ["CC Particle World-0030"]).setValue([opts.color[0], opts.color[1], opts.color[2], 1]); // Death Color
  kbProp(fx, ["CC Particle World-0039"]).setValue(1); // Transfer Mode: Composite
  kbProp(fx, ["CC Particle World-0104"]).setValue(opts.seed || 3); // Random Seed
  layer.motionBlur = true;
  return layer;
}

/**
 * Вспышка: слой на мгновение становится ярче белого и оседает. Вместе с kbGlow даёт настоящий ореол.
 * @param {AVLayer} layer
 * @param {number} time
 * @param {{peak?: number, rest?: number}} [opts] экспозиция в ступенях: пик и остаток
 */
function kbFlash(layer, time, opts) {
  opts = opts || {};
  var fx = kbEffect(layer, "ADBE Exposure2");
  // В покое — без пересвета: остаток ярче белого даёт ореол только по красному каналу, на синем он розовый.
  var rest = opts.rest === undefined ? 0 : opts.rest;
  kbKeys(kbProp(fx, ["ADBE Exposure2-0003"]), [time - 0.05, time + 0.04, time + 0.55],
    [rest, opts.peak === undefined ? 2.4 : opts.peak, rest], KB_EASE.snap);
}

/**
 * Свечение на весь кадр с порогом 100 %: светится только то, что ярче белого (в 32 битах такое есть).
 * @param {CompItem} comp
 * @returns {AVLayer}
 */
function kbGlow(comp) {
  var layer = comp.layers.addSolid([1, 1, 1], "glow", comp.width, comp.height, 1, comp.duration);
  layer.adjustmentLayer = true;
  var fx = kbEffect(layer, "ADBE Glo2");
  // Порог в скрипте задаётся по шкале 0–255 (в интерфейсе это проценты): 255 = 100 %. Проверено на живом AE —
  // при значении 100 (= 39 %) светился весь кадр, синий уходил в голубой.
  kbProp(fx, ["ADBE Glo2-0002"]).setValue(255); // Glow Threshold
  kbProp(fx, ["ADBE Glo2-0003"]).setValue(110); // Glow Radius
  kbProp(fx, ["ADBE Glo2-0004"]).setValue(1.1); // Glow Intensity
  return layer;
}
