// Приёмы блока E витрины: блик по кадру и подгонка строки под ширину.
// Имена параметров эффектов — из tools/data/effect-params-names.json.

//@include "core.jsx"
//@include "motion.jsx"
//@include "text.jsx"

/**
 * Блик: светлая полоса едет слева направо. Center — в пикселях кадра.
 *
 * На бумажной сцене вешать блик НА СЛОЙ (opts.target — сам логотип или прекомпозиция «слово + маркер»):
 * свет тогда считается по альфе этого слоя, бумага не трогается вообще. Корректирующий слой (без target)
 * годится только для тёмных сцен: на бумаге 0.957 любой добавленный свет упирается в белое и полоса
 * проходит через весь кадр дешёвым вайпом — проверено на кадрах, владелец такое не принял.
 * @param {CompItem} comp
 * @param {number} t0 начало прохода, с
 * @param {number} t1 конец прохода, с
 * @param {{target?: AVLayer, y?: number, from?: number, to?: number, intensity?: number, width?: number,
 *   direction?: number, shape?: number, reception?: number, color?: [number, number, number],
 *   ease?: {out: number, into: number}}} [opts]
 *   shape: 1 Linear, 2 Smooth, 3 Sharp; reception: 1 Add, 2 Composite, 3 Cutout (проверено глазами на кадре:
 *   Add рисует белую полосу поверх всего, Composite тянет пиксель к цвету света — тушь светлеет, ярче 1.0
 *   ничего не уходит, поэтому на бумажной сцене нужен именно он)
 * @returns {AVLayer} слой с эффектом (target или созданный корректирующий)
 */
function kbLightSweep(comp, t0, t1, opts) {
  opts = opts || {};
  var layer = opts.target;
  if (!layer) {
    layer = comp.layers.addSolid([1, 1, 1], "sweep", comp.width, comp.height, 1, comp.duration);
    layer.adjustmentLayer = true;
  }

  var fx = kbEffect(layer, "CC Light Sweep");
  var y = opts.y === undefined ? comp.height / 2 : opts.y;
  var from = opts.from === undefined ? -comp.width * 0.2 : opts.from;
  var to = opts.to === undefined ? comp.width * 1.2 : opts.to;
  // Блик идёт с постоянной скоростью: разгон и торможение у света выглядят как рывок фонаря.
  kbKeys(kbProp(fx, ["CC Light Sweep-0001"]), [t0, t1], [[from, y], [to, y]], opts.ease || { out: 0.1, into: 0.1 }); // Center
  kbProp(fx, ["CC Light Sweep-0002"]).setValue(opts.direction === undefined ? 24 : opts.direction); // Direction
  kbProp(fx, ["CC Light Sweep-0003"]).setValue(opts.shape === undefined ? 2 : opts.shape); // Shape
  // Ширина — в пикселях, но полоса расплывается далеко за неё: 90 на бумаге выжигает пол-кадра, 20–30 даёт блик.
  kbProp(fx, ["CC Light Sweep-0004"]).setValue(opts.width === undefined ? 24 : opts.width); // Width
  kbProp(fx, ["CC Light Sweep-0005"]).setValue(opts.intensity === undefined ? 26 : opts.intensity); // Sweep Intensity
  // Кромка светит по краям альфы; у корректирующего слоя это рамка кадра — выключаем.
  kbProp(fx, ["CC Light Sweep-0006"]).setValue(0); // Edge Intensity
  kbProp(fx, ["CC Light Sweep-0007"]).setValue(0); // Edge Thickness
  var color = opts.color || [1, 1, 1];
  kbProp(fx, ["CC Light Sweep-0008"]).setValue([color[0], color[1], color[2], 1]); // Light Color
  kbProp(fx, ["CC Light Sweep-0009"]).setValue(opts.reception === undefined ? 1 : opts.reception); // Light Reception

  // Свой слой живёт только на время прохода; чужой (target) не трогаем — на нём держится картинка.
  if (!opts.target) {
    layer.inPoint = Math.max(0, t0 - 0.1);
    layer.outPoint = Math.min(comp.duration, t1 + 0.1);
  }
  return layer;
}

/**
 * Размер строки в пикселях при заданном стиле: временный слой, замер, удаление.
 * Нужно, когда под слово подгоняется другой объект (маркер, плашка) и ширину надо знать до сборки.
 * @param {CompItem} comp
 * @param {{text: string, font: string, size: number, tracking?: number}} opts
 * @returns {{width: number, height: number, top: number, left: number}}
 */
function kbTextMeasure(comp, opts) {
  var probe = kbText(comp, {
    text: opts.text, font: opts.font, size: opts.size, color: [0, 0, 0],
    x: -4000, y: -4000, tracking: opts.tracking || 0
  });
  var rect = probe.sourceRectAtTime(0, false);
  var out = { width: rect.width, height: rect.height, top: rect.top, left: rect.left };
  probe.remove();
  return out;
}

/**
 * Подогнать кегль под ширину кадра: строка становится ровно targetWidth пикселей, якорь пересчитывается.
 * Вызывать сразу после kbText и до аниматоров: они меняют прямоугольник строки.
 * @param {TextLayer} layer
 * @param {number} targetWidth
 * @returns {number} итоговый кегль
 */
function kbTextFitWidth(layer, targetWidth) {
  var source = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]);
  var rect = layer.sourceRectAtTime(0, false);

  /** @type {TextDocument} */
  var doc = source.value;
  var size = doc.fontSize;
  if (rect.width > 1) {
    size = Math.round(doc.fontSize * targetWidth / rect.width * 10) / 10;
    doc.fontSize = size;
    source.setValue(doc);
  }

  var fitted = layer.sourceRectAtTime(0, false);
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([fitted.left + fitted.width / 2, fitted.top + fitted.height / 2]);
  return size;
}
