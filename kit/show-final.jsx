// Переходы между сценами и финиш общей композиции: рывок панорамы, встряска камеры,
// хроматическая аберрация. Приёмы общие — к строкам конкретного ролика не привязаны.
//
// Зерно и виньетка — kbFinish из look.jsx (Noise 2,5 % + CS Vignette 10): ставить один раз
// на итоговую композицию, поверх всех трёх каналов.

//@include "core.jsx"
//@include "motion.jsx"

// Рывок: медленный старт, быстрая середина, посадка. Большое влияние с обеих сторон
// даёт высокую скорость в середине окна — её и размазывает motion blur.
var KB_EASE_WHIP = { out: 72, into: 82 };

// Значения выпадающих списков «Take … From» у ADBE Shift Channels — по порядку в интерфейсе.
// Зонд их не снимает (список приходит типом 6417, без состава), поэтому проверено кадрами
// check-final.jsx: 2 = Red (у бумаги R≠G≠B, и в shred-* красный совпал с master до кода),
// 10 = Full Off (в shred-* зелёный и синий строго нули), 9 = Full On (в shon-* зелёный —
// одно значение 6553 на весь кадр, то есть 1.0: saveFrameToPng делит яркость на 10).
// 1 и 5…8 (Alpha, Luminance, Hue, Lightness, Saturation) — по порядку в списке, не проверены.
var KB_SHIFT = {
  alpha: 1, red: 2, green: 3, blue: 4,
  luminance: 5, hue: 6, lightness: 7, saturation: 8,
  fullOn: 9, fullOff: 10
};

/**
 * Рывок панорамы между двумя сценами: уходящая и приходящая едут как единая панорама —
 * вплотную друг к другу, с одинаковым easing, поэтому щели между ними нет. Смаз даёт AE
 * (motion blur слоёв и композиции), вручную ничего размывать не нужно.
 *
 * Оба слоя должны жить всё окно рывка: уходящий кончается не раньше его конца,
 * приходящий начинается не позже начала. Вне окна слой стоит ровно в центре кадра.
 *
 * @param {AVLayer} layerOut уходящая сцена
 * @param {AVLayer} layerIn приходящая сцена
 * @param {number} time центр рывка в секундах композиции
 * @param {string} axis "x" — панорама по горизонтали (уходит влево), "y" — по вертикали (уходит вверх)
 * @param {{window?: number, overlap?: number, distance?: number, ease?: {out: number, into: number}}} [opts]
 *   window — длительность рывка (0,3 с), overlap — нахлёст уходящего слоя на приходящий в пикселях
 *   (2 px: страхует от щели в один пиксель при субпиксельном сдвиге), distance — длина хода
 * @returns {{start: number, end: number}} окно рывка
 */
function kbWhip(layerOut, layerIn, time, axis, opts) {
  opts = opts || {};
  var comp = layerOut.containingComp;
  var win = opts.window === undefined ? 0.3 : opts.window;
  var overlap = opts.overlap === undefined ? 2 : opts.overlap;
  var vertical = axis === "y" || axis === "Y";
  var span = opts.distance === undefined ? (vertical ? comp.height : comp.width) : opts.distance;
  var ease = opts.ease || KB_EASE_WHIP;

  var cx = comp.width / 2;
  var cy = comp.height / 2;
  var t0 = time - win / 2;
  var t1 = time + win / 2;

  var gone = vertical ? [cx, cy - span + overlap] : [cx - span + overlap, cy];
  var waiting = vertical ? [cx, cy + span] : [cx + span, cy];

  kbKeys(kbProp(layerOut, ["ADBE Transform Group", "ADBE Position"]), [t0, t1], [[cx, cy], gone], ease);
  kbKeys(kbProp(layerIn, ["ADBE Transform Group", "ADBE Position"]), [t0, t1], [waiting, [cx, cy]], ease);

  layerOut.motionBlur = true;
  layerIn.motionBlur = true;
  return { start: t0, end: t1 };
}

/**
 * Встряска камеры: Null дрожит на ударах, слои-дети едут вместе с ним.
 * Слой-пустышку функция приводит к тождественному преобразованию (якорь и позиция — в 0, 0),
 * поэтому у детей остаются их собственные координаты кадра, а дрожь читается как сдвиг в пикселях.
 *
 * Вызывать ДО того, как назначены дети: смена позиции Null после привязки сдвинула бы их.
 * Слой-пустышка не рисуется, ключи слайдера живут на нём же.
 *
 * @param {AVLayer} nullLayer слой-пустышка (comp.layers.addNull)
 * @param {number[]} hits времена ударов в секундах композиции
 * @param {{amount?: number, freq?: number, attack?: number, decay?: number}} [opts]
 *   amount — амплитуда в пикселях (14), freq — частота дрожи (22 Гц),
 *   attack/decay — время набора и спада амплитуды (0,06 / 0,35 с)
 * @returns {Property} слайдер амплитуды
 */
function kbShake(nullLayer, hits, opts) {
  opts = opts || {};
  var amount = opts.amount === undefined ? 14 : opts.amount;
  var freq = opts.freq === undefined ? 22 : opts.freq;
  var attack = opts.attack === undefined ? 0.06 : opts.attack;
  var decay = opts.decay === undefined ? 0.35 : opts.decay;

  kbProp(nullLayer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
  var position = kbProp(nullLayer, ["ADBE Transform Group", "ADBE Position"]);
  position.setValue([0, 0]);

  var slider = kbProp(kbEffect(nullLayer, "ADBE Slider Control"), ["ADBE Slider Control-0001"]);
  slider.setValue(0);
  for (var i = 0; i < hits.length; i++) {
    kbKeys(slider, [hits[i], hits[i] + attack, hits[i] + decay], [0, amount, 0], KB_EASE.punch);
  }

  // wiggle возвращает уже готовое значение (исходная позиция + шум) — складывать его с value нельзя,
  // иначе слой уедет на свою же позицию. effect(1)(1) — первый слайдер слоя, без имени:
  // имена свойств зависят от языка интерфейса AE.
  position.expression = "wiggle(" + freq + ", effect(1)(1));";
  return slider;
}

/**
 * Хроматическая аберрация: общая композиция вложена тремя каналами с разным масштабом.
 * Нижний слой — красный канал (Normal), над ним зелёный и синий в режиме Add: в 32-битном
 * проекте с линейным смешиванием R + G + B даёт исходный кадр, поэтому в центре кадра
 * (где масштабы совпадают) цвет не меняется вовсе, а каёмки набегают только к краям.
 *
 * Запас масштаба заодно прячет края при встряске: держать base - spread таким, чтобы
 * comp.height * (base - spread - 100) / 200 было больше амплитуды дрожи.
 *
 * @param {CompItem} finalComp итоговая композиция
 * @param {CompItem} master общая композиция
 * @param {{base?: number, spread?: number, blur?: boolean}} [opts]
 *   base — масштаб зелёного канала в процентах (102), spread — разбег красного и синего (0,35),
 *   blur — motion blur у вложенных слоёв (по умолчанию да)
 * @returns {AVLayer[]} слои [R, G, B] снизу вверх
 */
function kbChroma(finalComp, master, opts) {
  opts = opts || {};
  var base = opts.base === undefined ? 102 : opts.base;
  var spread = opts.spread === undefined ? 0.35 : opts.spread;

  var names = ["R", "G", "B"];
  var takeRed = [KB_SHIFT.red, KB_SHIFT.fullOff, KB_SHIFT.fullOff];
  var takeGreen = [KB_SHIFT.fullOff, KB_SHIFT.green, KB_SHIFT.fullOff];
  var takeBlue = [KB_SHIFT.fullOff, KB_SHIFT.fullOff, KB_SHIFT.blue];
  var scales = [base + spread, base, base - spread];

  /** @type {AVLayer[]} */
  var layers = [];
  for (var i = 0; i < names.length; i++) {
    // Каждый следующий слой встаёт выше предыдущего: красный остаётся внизу, на нём складываются два.
    var layer = finalComp.layers.add(master);
    layer.name = master.name + "-" + names[i];
    layer.motionBlur = opts.blur === undefined ? true : opts.blur;
    if (i > 0) layer.blendingMode = BlendingMode.ADD;

    var fx = kbEffect(layer, "ADBE Shift Channels");
    kbProp(fx, ["ADBE Shift Channels-0002"]).setValue(takeRed[i]); // Take Red From
    kbProp(fx, ["ADBE Shift Channels-0003"]).setValue(takeGreen[i]); // Take Green From
    kbProp(fx, ["ADBE Shift Channels-0004"]).setValue(takeBlue[i]); // Take Blue From
    // Take Alpha From не трогаем: у общей композиции он «Alpha», кадр и так непрозрачный.

    kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]).setValue([scales[i], scales[i], 100]);
    layers.push(layer);
  }
  return layers;
}
