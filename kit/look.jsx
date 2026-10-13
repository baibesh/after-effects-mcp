// Фактура и финиш: бумага, дрожание рисованной линии, рваный край краски, зерно и виньетка на весь кадр.
// Имена параметров эффектов — из tools/data/effect-params-names.json (снято зондом с живого AE).

//@include "core.jsx"

/**
 * Волокна бумаги: мелкий фрактальный шум умножением поверх заливки. Неподвижен — бумага не шевелится.
 * @param {CompItem} comp
 * @returns {AVLayer}
 */
function kbPaperGrain(comp) {
  var layer = comp.layers.addSolid([1, 1, 1], "paper-grain", comp.width, comp.height, 1, comp.duration);
  layer.blendingMode = BlendingMode.MULTIPLY;
  kbProp(layer, ["ADBE Transform Group", "ADBE Opacity"]).setValue(100);

  var noise = kbEffect(layer, "ADBE Fractal Noise");
  kbProp(noise, ["ADBE Fractal Noise-0004"]).setValue(14); // Contrast — узкий диапазон: 0.94…1.0
  kbProp(noise, ["ADBE Fractal Noise-0005"]).setValue(47); // Brightness — шум почти белый, умножение едва темнит
  kbProp(noise, ["ADBE Fractal Noise-0010"]).setValue(3.5); // Scale — волокно мелкое, иначе бумага похожа на камень
  kbProp(noise, ["ADBE Fractal Noise-0015"]).setValue(4); // Complexity
  return layer;
}

/**
 * Дрожание рисованной линии: смещение пересчитывается 12 раз в секунду, как в покадровой анимации.
 * @param {AVLayer} layer
 * @param {{amount?: number, size?: number, fps?: number}} [opts]
 */
function kbBoil(layer, opts) {
  opts = opts || {};
  var fx = kbEffect(layer, "ADBE Turbulent Displace");
  kbProp(fx, ["ADBE Turbulent Displace-0002"]).setValue(opts.amount === undefined ? 7 : opts.amount); // Amount
  kbProp(fx, ["ADBE Turbulent Displace-0003"]).setValue(opts.size === undefined ? 24 : opts.size); // Size
  kbProp(fx, ["ADBE Turbulent Displace-0006"]).expression = // Evolution
    "posterizeTime(" + (opts.fps || 12) + ");\ntime * 1440;";
}

/**
 * Край краски: неровный, как у маркера на бумаге. Roughen Edges считает в 8 битах —
 * ставить только на плоские слои до любого свечения.
 * @param {AVLayer} layer
 * @param {number} [border]
 */
function kbInkEdge(layer, border) {
  var fx = kbEffect(layer, "ADBE Roughen Edges"); // ae-ok: bpc
  kbProp(fx, ["ADBE Roughen Edges-0002"]).setValue(border === undefined ? 5 : border); // Border
  kbProp(fx, ["ADBE Roughen Edges-0003"]).setValue(2); // Edge Sharpness
  kbProp(fx, ["ADBE Roughen Edges-0005"]).setValue(45); // Scale
}

/**
 * Продольные разводы чернил на маркерной полосе: шум, сильно вытянутый по ходу полосы.
 * Полоса остаётся ровной по форме — неоднородна только плотность краски.
 * @param {AVLayer} layer
 */
function kbInkStreaks(layer) {
  var fx = kbEffect(layer, "ADBE Fractal Noise");
  kbProp(fx, ["ADBE Fractal Noise-0004"]).setValue(26); // Contrast
  kbProp(fx, ["ADBE Fractal Noise-0005"]).setValue(40); // Brightness — разводы светлые, краска почти сплошная
  kbProp(fx, ["ADBE Fractal Noise-0009"]).setValue(0); // Uniform Scaling — выкл.
  kbProp(fx, ["ADBE Fractal Noise-0011"]).setValue(3000); // Scale Width
  kbProp(fx, ["ADBE Fractal Noise-0012"]).setValue(9); // Scale Height
  kbProp(fx, ["ADBE Fractal Noise-0015"]).setValue(3); // Complexity
  kbProp(fx, ["ADBE Fractal Noise-0030"]).setValue(5); // Blending Mode: Multiply
}

/**
 * Финиш поверх всей сцены: живое зерно и виньетка. Свечения на бумажных сценах нет:
 * бумага сама ярче любого порога, засветится весь кадр.
 * @param {CompItem} comp
 * @param {{grain?: number, vignette?: number}=} opts зерно, % (по умолчанию 2,5) · виньетка (по умолчанию 10; 0 — без эффекта, уроки 16:9)
 * @returns {AVLayer}
 */
function kbFinish(comp, opts) {
  var o = opts || {};
  var layer = comp.layers.addSolid([1, 1, 1], "finish", comp.width, comp.height, 1, comp.duration);
  layer.adjustmentLayer = true;
  layer.moveToBeginning();

  var grain = kbEffect(layer, "ADBE Noise");
  kbProp(grain, ["ADBE Noise-0001"]).setValue(o.grain === undefined ? 2.5 : o.grain); // Amount of Noise, %
  kbProp(grain, ["ADBE Noise-0002"]).setValue(0); // Use Color Noise — выкл.

  var amount = o.vignette === undefined ? 10 : o.vignette;
  if (amount > 0) {
    var vignette = kbEffect(layer, "CS Vignette");
    kbProp(vignette, ["CS Vignette-0001"]).setValue(amount); // Amount
  }
  return layer;
}

/**
 * Живой наклон растрового рисунка без рига: слой гнётся дугой от ног к голове и возвращается.
 * CC Bend It считает в 16 битах — для дудла на бумаге этого достаточно.
 * @param {AVLayer} layer
 * @param {{time: number, feet: [number, number], head: [number, number], amount?: number}} opts точки — в координатах слоя
 */
function kbLean(layer, opts) {
  var fx = kbEffect(layer, "CC Bend It"); // ae-ok: bpc
  kbProp(fx, ["CC Bend It-0002"]).setValue(opts.feet); // Start
  kbProp(fx, ["CC Bend It-0003"]).setValue(opts.head); // End
  var amount = opts.amount === undefined ? 16 : opts.amount;
  kbKeys(kbProp(fx, ["CC Bend It-0001"]), [opts.time, opts.time + 0.16, opts.time + 0.38, opts.time + 0.62],
    [0, -amount, amount * 0.45, 0], KB_EASE.snap);
}
