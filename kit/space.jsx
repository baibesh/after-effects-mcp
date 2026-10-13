// 2,5D-пространство: бумажная стена, вырезки над ней, камера с глубиной резкости, свет с настоящими тенями.
// Ось Z в AE: отрицательные значения — к камере. Вырезка «парит» над стеной на z < 0 и роняет на неё тень.

//@include "core.jsx"
//@include "motion.jsx"

/**
 * Что слой делает со светом. Цвета держим плоскими (свет их не меняет), тени — включаем адресно.
 * @param {AVLayer} layer
 * @param {{casts?: boolean, acceptsShadows?: boolean}} opts
 */
function kbMaterial(layer, opts) {
  var group = kbGroup(layer, ["ADBE Material Options Group"]);
  kbProp(group, ["ADBE Casts Shadows"]).setValue(opts.casts ? 1 : 0);
  kbProp(group, ["ADBE Accepts Shadows"]).setValue(opts.acceptsShadows ? 1 : 0);
  kbProp(group, ["ADBE Accepts Lights"]).setValue(0);
}

/**
 * Бумажная стена: большая плоскость на z = 0, принимает тени. Фактура — на самом слое
 * (экранная фактура поверх 3D-сцены выглядела бы грязью на объективе).
 * @param {CompItem} comp
 * @param {{x: number, y: number, width: number, height: number, color: [number, number, number]}} opts
 * @returns {AVLayer}
 */
function kbWall(comp, opts) {
  var wall = comp.layers.addSolid(opts.color, "wall", opts.width, opts.height, 1, comp.duration);
  wall.threeDLayer = true;
  kbProp(wall, ["ADBE Transform Group", "ADBE Position"]).setValue([opts.x, opts.y, 0]);
  kbMaterial(wall, { acceptsShadows: true });

  var noise = kbEffect(wall, "ADBE Fractal Noise");
  kbProp(noise, ["ADBE Fractal Noise-0004"]).setValue(14); // Contrast
  kbProp(noise, ["ADBE Fractal Noise-0005"]).setValue(47); // Brightness
  kbProp(noise, ["ADBE Fractal Noise-0010"]).setValue(3.5); // Scale
  kbProp(noise, ["ADBE Fractal Noise-0015"]).setValue(4); // Complexity
  kbProp(noise, ["ADBE Fractal Noise-0030"]).setValue(5); // Blending Mode: Multiply
  return wall;
}

/**
 * Бумажная вырезка: скруглённый прямоугольник, парит над стеной и отбрасывает тень.
 * @param {CompItem} comp
 * @param {{name: string, x: number, y: number, width: number, height: number, lift?: number, tilt?: number, color?: [number, number, number]}} opts
 * @returns {ShapeLayer}
 */
function kbCutout(comp, opts) {
  var layer = comp.layers.addShape();
  layer.name = opts.name;
  layer.threeDLayer = true;
  layer.motionBlur = true;

  var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
  var contents = kbGroup(group, ["ADBE Vectors Group"]);
  var rect = kbAdd(contents, "ADBE Vector Shape - Rect");
  kbProp(rect, ["ADBE Vector Rect Size"]).setValue([opts.width, opts.height]);
  kbProp(rect, ["ADBE Vector Rect Roundness"]).setValue(18);
  var fill = kbAdd(contents, "ADBE Vector Graphic - Fill");
  var color = opts.color || [0.995, 0.99, 0.975];
  kbProp(fill, ["ADBE Vector Fill Color"]).setValue([color[0], color[1], color[2], 1]);

  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([opts.x, opts.y, -(opts.lift === undefined ? 40 : opts.lift)]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Rotate Z"]).setValue(opts.tilt || 0);
  kbMaterial(layer, { casts: true });
  return layer;
}

/**
 * Посадить слой на вырезку: становится её ребёнком, лежит чуть выше её поверхности.
 * @param {AVLayer} layer
 * @param {AVLayer} cutout
 * @param {number} dx смещение от центра вырезки
 * @param {number} dy
 * @param {number} [gap] зазор над поверхностью, px
 */
function kbStick(layer, cutout, dx, dy, gap) {
  layer.threeDLayer = true;
  layer.parent = cutout;
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([dx, dy, -(gap === undefined ? 2 : gap)]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Orientation"]).setValue([0, 0, 0]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Rotate Z"]).setValue(0);
  kbMaterial(layer, {});
}

/**
 * Вырезка падает на стену: прилетает от камеры, проскакивает и садится; тень при этом сходится.
 * @param {AVLayer} cutout
 * @param {number} start
 */
function kbDrop(cutout, start) {
  var position = kbProp(cutout, ["ADBE Transform Group", "ADBE Position"]);
  var rest = position.value;
  kbKeys(position, [start, start + 0.32, start + 0.5],
    [[rest[0], rest[1] + 60, rest[2] - 900], [rest[0], rest[1], rest[2] + 45], rest], KB_EASE.snap);

  var rotate = kbProp(cutout, ["ADBE Transform Group", "ADBE Rotate Z"]);
  var tilt = rotate.value;
  kbKeys(rotate, [start, start + 0.5], [tilt + (tilt >= 0 ? 14 : -14), tilt], KB_EASE.snap);

  cutout.inPoint = start;
}

/**
 * Камера с глубиной резкости. Фокус всегда на точке интереса — выражением, чтобы не расходился с полётом.
 * @param {CompItem} comp
 * @param {{aperture?: number, blur?: number}} [opts]
 * @returns {CameraLayer}
 */
function kbCamera(comp, opts) {
  opts = opts || {};
  var camera = comp.layers.addCamera("camera", [comp.width / 2, comp.height / 2]);
  var options = kbGroup(camera, ["ADBE Camera Options Group"]);
  kbProp(options, ["ADBE Camera Depth of Field"]).setValue(1);
  // Диафрагма в пикселях: до ~100 размытия практически нет, заметная глубина резкости — от 300.
  kbProp(options, ["ADBE Camera Aperture"]).setValue(opts.aperture === undefined ? 400 : opts.aperture);
  kbProp(options, ["ADBE Camera Blur Level"]).setValue(opts.blur === undefined ? 200 : opts.blur);
  kbProp(options, ["ADBE Camera Focus Distance"]).expression =
    "length(transform.position, transform.pointOfInterest);";
  return camera;
}

/**
 * Свет, дающий тени: точечный, мягкая тень.
 * @param {CompItem} comp
 * @returns {LightLayer}
 */
function kbShadowLight(comp) {
  var light = comp.layers.addLight("key-light", [comp.width / 2, comp.height / 2]);
  light.lightType = LightType.POINT;
  var options = kbGroup(light, ["ADBE Light Options Group"]);
  kbProp(options, ["ADBE Light Intensity"]).setValue(100);
  kbProp(options, ["ADBE Casts Shadows"]).setValue(1);
  kbProp(options, ["ADBE Light Shadow Darkness"]).setValue(24);
  kbProp(options, ["ADBE Light Shadow Diffusion"]).setValue(140);
  return light;
}

/**
 * Полёт камеры по остановкам. На каждой остановке камера смотрит на точку под наклоном и медленно наезжает;
 * свет идёт следом, чтобы тени везде падали одинаково.
 * @param {CameraLayer} camera
 * @param {LightLayer} light
 * @param {{x: number, y: number, z: number, arrive: number, leave: number, side?: number}[]} stops
 * @param {{back?: number, below?: number}} [opts] отступ камеры от точки: назад (к зрителю) и вниз по стене
 */
function kbFlight(camera, light, stops, opts) {
  opts = opts || {};
  var back = opts.back === undefined ? 1100 : opts.back;
  var below = opts.below === undefined ? 600 : opts.below;

  var times = [];
  var eyes = [];
  var targets = [];
  var lamps = [];
  for (var i = 0; i < stops.length; i++) {
    var s = stops[i];
    var side = s.side || 0;
    // Приезд и отъезд: между ними — медленный наезд на 6 %.
    times.push(s.arrive, s.leave);
    eyes.push([s.x + side, s.y + below, s.z - back], [s.x + side * 0.8, s.y + below * 0.94, s.z - back * 0.94]);
    targets.push([s.x, s.y - 30, s.z], [s.x, s.y - 30, s.z]);
    lamps.push([s.x - 500, s.y - 700, s.z - 1700], [s.x - 500, s.y - 700, s.z - 1700]);
  }

  kbKeys(kbProp(camera, ["ADBE Transform Group", "ADBE Position"]), times, eyes, KB_EASE.soft);
  kbKeys(kbProp(camera, ["ADBE Transform Group", "ADBE Anchor Point"]), times, targets, KB_EASE.soft);
  kbKeys(kbProp(light, ["ADBE Transform Group", "ADBE Position"]), times, lamps, KB_EASE.soft);
}
