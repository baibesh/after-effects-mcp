// Оживление растрового героя без рига: дыхание, разрез по шее и кивок, сквош на смене позы,
// покадровый шаг «на двойках», переключение поз hold-ключами.
//
// Все приёмы рассчитаны на дудл, который лежит НЕПРОЗРАЧНЫМ слоем поверх белой подложки
// (см. reels/hero-lab/scene-hero.jsx): растровые позы идут без альфы, а любой распад на слои
// и любой дисторшн (CC Bend It, Bezier Warp) вырезают из слоя прозрачность. Пока под героем
// лежит белый лист, прозрачности в композиции не возникает — и её можно целиком положить
// на бумагу умножением, а альфу для тени добрать отдельным слоем.

//@include "core.jsx"
//@include "motion.jsx"

/**
 * Служебная: прямоугольная маска во всю ширину слоя с растушёванным краем.
 * Координаты — в системе слоя (0, 0 — левый верхний угол исходника).
 * @param {AVLayer} layer
 * @param {string} name
 * @param {number} top
 * @param {number} bottom
 * @param {number} feather растушёвка, px (ложится поровну внутрь и наружу пути)
 * @returns {PropertyGroup}
 */
function kbHeroMask(layer, name, top, bottom, feather) {
  var mask = kbAdd(kbGroup(layer, ["ADBE Mask Parade"]), "ADBE Mask Atom"); // ae-ok: matchname
  mask.name = name;

  var box = new Shape();
  // Маска режет только по горизонтали: по бокам уходим далеко за края слоя.
  box.vertices = [[-4000, top], [4000, top], [4000, bottom], [-4000, bottom]];
  box.closed = true;
  kbProp(mask, ["ADBE Mask Shape"]).setValue(box); // ae-ok: matchname
  kbProp(mask, ["ADBE Mask Feather"]).setValue([feather, feather]); // ae-ok: matchname
  return mask;
}

/**
 * Дыхание «на двойках»: слой мягко растёт и оседает по вертикали, объём сохраняется
 * (выше ↔ уже). Якорь дудла стоит в подошвах (kbDoodle), поэтому дышит грудь, а не пол.
 * Шаг движения — выражением posterizeTime: эффект Posterize Time трансформы не касается.
 * @param {AVLayer} layer
 * @param {{amount?: number, period?: number, fps?: number, phase?: number}} [opts]
 *   amount — размах по вертикали в долях (0,022 = 2,2 %), period — секунд на вдох-выдох
 */
function kbBreath(layer, opts) {
  opts = opts || {};
  var amount = opts.amount === undefined ? 0.022 : opts.amount;
  var period = opts.period === undefined ? 2.6 : opts.period;
  var fps = opts.fps === undefined ? 12 : opts.fps;
  var phase = opts.phase === undefined ? 0 : opts.phase;

  kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]).expression =
    "posterizeTime(" + fps + ");\n" +
    "var s = value;\n" +
    "var k = " + amount + " * Math.sin((time + " + phase + ") * 2 * Math.PI / " + period + ");\n" +
    "var w = s[0] * (1 - k * 0.45);\n" +
    "var h = s[1] * (1 + k);\n" +
    "s.length > 2 ? [w, h, s[2]] : [w, h];";
}

/**
 * Покадровый шаг: слой пересчитывается 12 раз в секунду, как рисованная анимация «на двойках».
 * Касается только содержимого слоя и эффектов под ним — трансформы идут дальше в 30 fps,
 * поэтому дыхание и кивок шагают своим posterizeTime внутри выражения.
 * @param {AVLayer} layer
 * @param {number} [fps]
 * @returns {PropertyGroup}
 */
function kbOnTwos(layer, fps) {
  var fx = kbEffect(layer, "ADBE Posterize Time");
  kbProp(fx, ["ADBE Posterize Time-0001"]).setValue(fps === undefined ? 12 : fps);
  return fx;
}

/**
 * Разрез позы по линии шеи: голова становится отдельным слоем с якорем в шее, тело — тем же
 * слоем ниже разреза. Стык прячется двумя встречными растушёванными масками: голова лежит
 * поверх тела и перекрывает его на `overlap`, так что при повороте головы бумага между ними
 * не проступает. Линию разреза брать по толстому чёрному канту капюшона — тогда рассинхрон
 * в пару пикселей остаётся внутри штриха.
 * Голова становится ребёнком тела: наклон и дыхание корпуса она наследует, кивает поверх них.
 * @param {CompItem} comp
 * @param {AVLayer} layer слой дудла (все эффекты ставить ДО разреза — дубль их скопирует)
 * @param {{neck: number, x?: number, overlap?: number, feather?: number}} opts координаты — в системе слоя
 * @returns {{head: AVLayer, body: AVLayer}}
 */
function kbHeadSplit(comp, layer, opts) {
  var neck = opts.neck;
  var pivotX = opts.x === undefined ? layer.width / 2 : opts.x;
  var overlap = opts.overlap === undefined ? 5 : opts.overlap;
  var feather = opts.feather === undefined ? 8 : opts.feather;

  var body = layer;
  var head = /** @type {AVLayer} */ (layer.duplicate()); // дубль встаёт над оригиналом
  head.name = layer.name + "-head";
  body.name = layer.name + "-body";

  kbHeroMask(head, "head", -4000, neck + overlap, feather);
  kbHeroMask(body, "body", neck - overlap, 4000, feather);

  // Якорь головы — в шею: поворот идёт от места стыка, а не от подошв. Позицию сдвигаем
  // на тот же вектор, иначе голова прыгнет.
  var anchor = kbProp(head, ["ADBE Transform Group", "ADBE Anchor Point"]);
  var position = kbProp(head, ["ADBE Transform Group", "ADBE Position"]);
  var scale = kbProp(head, ["ADBE Transform Group", "ADBE Scale"]).value;
  var was = anchor.value;
  var pos = position.value;
  anchor.setValue([pivotX, neck]);
  position.setValue([
    pos[0] + (pivotX - was[0]) * scale[0] / 100,
    pos[1] + (neck - was[1]) * scale[1] / 100
  ]);

  // Присвоение parent сохраняет вид слоя (в отличие от setParentWithJump) — звать, пока тело
  // стоит в покое, до ключей и выражений на нём.
  head.parent = body;
  if (comp.numLayers < 2) kbLog("kbHeadSplit: в композиции меньше двух слоёв — проверить порядок сборки");
  return { head: head, body: body };
}

/**
 * Кивок: голова клюёт вперёд, отыгрывает назад и садится. Тело идёт следом с задержкой
 * и втрое меньшим размахом — движение читается как одно, а не как отвинченная голова.
 * @param {AVLayer} head слой головы из kbHeadSplit
 * @param {{time: number, angle?: number, duration?: number, body?: AVLayer, lag?: number, follow?: number, fps?: number}} opts
 */
function kbNod(head, opts) {
  var time = opts.time;
  var angle = opts.angle === undefined ? 6.5 : opts.angle;
  var duration = opts.duration === undefined ? 0.8 : opts.duration;

  var rotate = kbProp(head, ["ADBE Transform Group", "ADBE Rotate Z"]);
  var base = rotate.value;
  kbKeys(rotate,
    [time, time + duration * 0.24, time + duration * 0.5, time + duration * 0.74, time + duration],
    [base, base + angle, base - angle * 0.42, base + angle * 0.16, base],
    KB_EASE.snap);

  if (opts.body) {
    var lag = opts.lag === undefined ? 0.09 : opts.lag;
    var follow = opts.follow === undefined ? 0.3 : opts.follow;
    var bodyRotate = kbProp(opts.body, ["ADBE Transform Group", "ADBE Rotate Z"]);
    var bodyBase = bodyRotate.value;
    kbKeys(bodyRotate,
      [time + lag, time + lag + duration * 0.24, time + lag + duration * 0.55, time + lag + duration],
      [bodyBase, bodyBase + angle * follow, bodyBase - angle * follow * 0.4, bodyBase],
      KB_EASE.soft);
  }
}

/**
 * Сквош-стретч на удар: слой приседает (ниже и шире), проскакивает в обратную сторону и садится.
 * Делается Bezier Warp по коробке слоя: верхние вершины уезжают вниз, нижние стоят — поэтому
 * подошвы остаются на месте, если низ рисунка лежит у нижнего края слоя.
 * Bezier Warp считает в 16 битах — ставить только туда, где нет яркостей выше 1.0.
 * @param {AVLayer} layer
 * @param {number} time
 * @param {{amount?: number, stretch?: number, lead?: number}} [opts]
 *   amount — приседание в долях высоты слоя, stretch — вытяжка перед ударом, lead — за сколько до удара тянуться
 */
function kbSquash(layer, time, opts) {
  opts = opts || {};
  var amount = opts.amount === undefined ? 0.075 : opts.amount;
  var stretch = opts.stretch === undefined ? amount * 0.5 : opts.stretch;
  var lead = opts.lead === undefined ? 0.1 : opts.lead;

  var w = layer.width;
  var h = layer.height;
  var fx = kbEffect(layer, "ADBE BEZMESH"); // ae-ok: bpc

  // Коробка Bezier Warp: 4 вершины по часовой стрелке и по две касательные на сторону.
  // rest — покой, pull — куда уходит точка при приседании на 1,0 (домножается на амплитуду).
  // Вертикаль: верх опускается на всю амплитуду, бока — пропорционально высоте над низом,
  // низ стоит. Горизонталь: коробка раздаётся вширь, сильнее в середине.
  var names = [
    "ADBE BEZMESH-0001", "ADBE BEZMESH-0002", "ADBE BEZMESH-0003", "ADBE BEZMESH-0004",
    "ADBE BEZMESH-0005", "ADBE BEZMESH-0006", "ADBE BEZMESH-0007", "ADBE BEZMESH-0008",
    "ADBE BEZMESH-0009", "ADBE BEZMESH-0010", "ADBE BEZMESH-0011", "ADBE BEZMESH-0012"
  ];
  var rest = [
    [0, 0], [w / 3, 0], [w * 2 / 3, 0], [w, 0],
    [w, h / 3], [w, h * 2 / 3], [w, h], [w * 2 / 3, h],
    [w / 3, h], [0, h], [0, h * 2 / 3], [0, h / 3]
  ];
  var pull = [
    [-w * 0.25, h], [-w * 0.08, h], [w * 0.08, h], [w * 0.25, h],
    [w * 0.4, h * 0.667], [w * 0.4, h * 0.333], [w * 0.25, 0], [w * 0.08, 0],
    [-w * 0.08, 0], [-w * 0.25, 0], [-w * 0.4, h * 0.333], [-w * 0.4, h * 0.667]
  ];
  var times = [time - lead - 0.14, time - lead, time, time + 0.13, time + 0.3, time + 0.5];
  var amounts = [0, -stretch, amount, -amount * 0.35, amount * 0.1, 0];

  for (var i = 0; i < names.length; i++) {
    /** @type {[number, number][]} */
    var values = [];
    for (var t = 0; t < amounts.length; t++) {
      values.push([rest[i][0] + pull[i][0] * amounts[t], rest[i][1] + pull[i][1] * amounts[t]]);
    }
    kbKeys(kbProp(fx, [names[i]]), times, values, KB_EASE.snap);
  }
  return fx;
}

/**
 * Смена позы: слои поз гасятся и зажигаются hold-ключами по непрозрачности.
 * Ключ ставится на 0,02 с раньше отметки — затвор 270° открыт вокруг кадра, и ключ внутри
 * затвора дал бы один кадр с двумя позами разом.
 * @param {CompItem} comp
 * @param {(AVLayer|AVLayer[])[]} poses каждая поза — слой или набор слоёв (голова + тело)
 * @param {number[]} times когда поза становится видимой; times[0] обычно 0
 */
function kbPoseSwitch(comp, poses, times) {
  var lead = 0.02;
  for (var i = 0; i < poses.length; i++) {
    var group = poses[i] instanceof Array ? poses[i] : [poses[i]];
    var on = i === 0 ? 0 : Math.max(0, times[i] - lead);
    var off = i + 1 < times.length ? Math.min(comp.duration, times[i + 1] - lead) : -1;

    for (var j = 0; j < group.length; j++) {
      var opacity = kbProp(group[j], ["ADBE Transform Group", "ADBE Opacity"]);
      opacity.setValueAtTime(0, i === 0 ? 100 : 0);
      if (i > 0) opacity.setValueAtTime(on, 100);
      if (off >= 0) opacity.setValueAtTime(off, 0);
      for (var k = 1; k <= opacity.numKeys; k++) {
        opacity.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
      }
    }
  }
}

/**
 * Альфа по рисунку для растрового дудла без альфы: инверсия + «альфа из яркости».
 * Тушь и охра становятся непрозрачными, белая бумага — прозрачной; цвет слоя при этом
 * остаётся инвертированным, поэтому слой годится только как мат, тень или подложка.
 *
 * Нутро контуров альфа НЕ закрывает: лицо внутри головы белое, и в тени сквозь него читаются
 * очки и рот. Замкнуть его морфологией (Minimax, Simple Choker) не выходит — просвет головы
 * ~255 px, а просвет между ног 46–113 px, любой радиус закрывает либо оба, либо ни одного.
 * Закрывать нужно заливками в отдельной «теневой» композиции — см. reels/hero-lab/scene-hero.jsx.
 * @param {AVLayer} layer
 */
function kbInkAlpha(layer) {
  var invert = kbEffect(layer, "ADBE Invert");
  kbProp(invert, ["ADBE Invert-0001"]).setValue(1); // Channel: RGB
  var shift = kbEffect(layer, "ADBE Shift Channels");
  kbProp(shift, ["ADBE Shift Channels-0001"]).setValue(5); // Take Alpha From: Luminance
}

/**
 * Бумажная вырезка под рисунком героя: слой-двойник с альфой по туши, залитый цветом бумаги.
 * Делает две вещи разом — кладёт настоящую тень на стену и закрывает саму фигуру от этой тени
 * (слой героя идёт умножением, его белая бумага прозрачна для тени, и тень читалась бы
 * «вторым лицом» прямо по лицу героя).
 * Двойник берёт трансформ и ключи оригинала; `source` подменяет источник на теневую
 * композицию, где нутро контуров уже залито.
 * @param {AVLayer} layer 3D-слой героя (умножением, поверх вырезки)
 * @param {{color: [number, number, number], source?: CompItem, gap?: number}} opts
 *   gap — на сколько отодвинуть вырезку от камеры, px (копланарные 3D-слои мерцают)
 * @returns {AVLayer}
 */
function kbPaperCutout(layer, opts) {
  var cutout = /** @type {AVLayer} */ (layer.duplicate());
  cutout.name = layer.name + "-cutout";
  if (opts.source) cutout.replaceSource(opts.source, false);
  cutout.blendingMode = BlendingMode.NORMAL;
  cutout.moveAfter(layer);
  kbInkAlpha(cutout);

  // Цвет плоский: Tint красит и чёрное, и белое в один цвет, альфу не трогает.
  // ADBE Fill для этого не годится: у него по умолчанию включено «All Masks», масок нет —
  // и слой пропадает целиком, без ошибки в журнале.
  var tint = kbEffect(cutout, "ADBE Tint");
  kbProp(tint, ["ADBE Tint-0001"]).setValue([opts.color[0], opts.color[1], opts.color[2], 1]); // Map Black To
  kbProp(tint, ["ADBE Tint-0002"]).setValue([opts.color[0], opts.color[1], opts.color[2], 1]); // Map White To
  kbProp(tint, ["ADBE Tint-0003"]).setValue(100); // Amount to Tint

  var position = kbProp(cutout, ["ADBE Transform Group", "ADBE Position"]);
  var rest = position.value;
  position.setValue([rest[0], rest[1], rest[2] + (opts.gap === undefined ? 1.5 : opts.gap)]);

  var material = kbGroup(cutout, ["ADBE Material Options Group"]);
  kbProp(material, ["ADBE Casts Shadows"]).setValue(1);
  kbProp(material, ["ADBE Accepts Shadows"]).setValue(0);
  kbProp(material, ["ADBE Accepts Lights"]).setValue(0);
  return cutout;
}
