// Текст: слой, выравнивание по центру блока, влёт по буквам из глубины.

//@include "core.jsx"
//@include "motion.jsx"

// PostScript-имена, как их видит AE (tools/data/fonts.json проекта). Набор шрифтов — у каждого проекта свой:
// KB_CONFIG.fonts в ae/kit.config.jsx заменяет таблицу целиком. По умолчанию — статический Inter (rsms/inter).
var KB_FONT = kbConfig("fonts", {
  black: "Inter-Black",
  bold: "Inter-Bold",
  semibold: "Inter-SemiBold",
  medium: "Inter-Medium",
  regular: "Inter-Regular"
});

/**
 * @param {CompItem} comp
 * @param {{text: string, font: string, size: number, color: [number, number, number], x: number, y: number, tracking?: number, leading?: number}} opts
 * @returns {TextLayer}
 */
function kbText(comp, opts) {
  var layer = comp.layers.addText(opts.text);
  var source = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]);

  /** @type {TextDocument} */
  var doc = source.value;
  doc.resetCharStyle();
  doc.resetParagraphStyle();
  doc.font = opts.font;
  doc.fontSize = opts.size;
  doc.applyFill = true;
  doc.fillColor = opts.color;
  doc.applyStroke = false;
  doc.tracking = opts.tracking || 0;
  doc.justification = ParagraphJustification.CENTER_JUSTIFY;
  if (opts.leading) {
    doc.autoLeading = false;
    doc.leading = opts.leading;
  }
  source.setValue(doc);

  // Якорь — в центр фактического прямоугольника текста: масштаб и поворот идут от середины блока.
  var rect = layer.sourceRectAtTime(0, false);
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([rect.left + rect.width / 2, rect.top + rect.height / 2]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([opts.x, opts.y]);

  layer.motionBlur = true;
  return layer;
}

/**
 * Влёт по буквам из глубины: каждая буква приходит из -Z размытая и прозрачная, порядок случайный.
 * Работает через диапазон «Ramp Up» и смещение −100 → 100: пока диапазон левее текста, аниматор
 * действует на все буквы; уезжая вправо, отпускает их по одной.
 * @param {TextLayer} layer
 * @param {{start: number, duration: number, depth?: number, blur?: number, random?: boolean, seed?: number}} opts
 */
function kbTextFlyIn(layer, opts) {
  layer.threeDLayer = true;
  layer.threeDPerChar = true;

  var animator = kbAdd(kbGroup(layer, ["ADBE Text Properties", "ADBE Text Animators"]), "ADBE Text Animator");
  animator.name = "fly-in";

  var props = kbGroup(animator, ["ADBE Text Animator Properties"]);
  /** @type {Property} */ (props.addProperty("ADBE Text Position 3D")).setValue([0, 0, -(opts.depth || 1400)]);
  /** @type {Property} */ (props.addProperty("ADBE Text Opacity")).setValue(0);
  var blur = opts.blur === undefined ? 36 : opts.blur;
  /** @type {Property} */ (props.addProperty("ADBE Text Blur")).setValue([blur, blur]);

  var selector = kbAdd(kbGroup(animator, ["ADBE Text Selectors"]), "ADBE Text Selector");
  var advanced = kbGroup(selector, ["ADBE Text Range Advanced"]);
  kbProp(advanced, ["ADBE Text Range Shape"]).setValue(2); // Ramp Up // ae-ok: matchname
  kbProp(advanced, ["ADBE Text Levels Max Ease"]).setValue(60);
  kbProp(advanced, ["ADBE Text Levels Min Ease"]).setValue(-20);
  if (opts.random !== false) {
    kbProp(advanced, ["ADBE Text Randomize Order"]).setValue(1); // ae-ok: matchname
    kbProp(advanced, ["ADBE Text Random Seed"]).setValue(opts.seed || 7);
  }

  kbKeys(kbProp(selector, ["ADBE Text Percent Offset"]), [opts.start, opts.start + opts.duration], [-100, 100], KB_EASE.snap);
}

/**
 * Удар масштабом всего блока: короткий перелёт в момент, когда текст собрался.
 * @param {TextLayer} layer
 * @param {number} time
 */
function kbTextPunch(layer, time) {
  var scale = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]);
  kbOvershoot(scale, time, 0.4, [92, 92, 100], [104, 104, 100], [100, 100, 100]);
}

/**
 * Счётчик: число в строке набегает от from до to и тормозит к концу. Стиль текста сохраняется.
 * Вызывать после kbText: якорь уже посчитан по итоговой строке, а выключка по центру держит середину.
 * @param {TextLayer} layer
 * @param {{from: number, to: number, start: number, duration: number, suffix: string}} opts
 */
function kbCountUp(layer, opts) {
  kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).expression =
    "var t = (time - " + opts.start + ") / " + opts.duration + ";\n" +
    "t = Math.min(Math.max(t, 0), 1);\n" +
    "var eased = 1 - Math.pow(1 - t, 4);\n" +
    "Math.round(" + opts.from + " + (" + opts.to + " - " + opts.from + ") * eased) + \"" + opts.suffix + "\";";
}
