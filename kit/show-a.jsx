// Приёмы блока «движение»: шлейф из прошлых кадров слоя (Echo) и концентрические дуги,
// которые прочерчиваются и проворачиваются.

//@include "core.jsx"
//@include "motion.jsx"

/**
 * Шлейф скорости: Echo подкладывает под слой его же прошлые кадры.
 * Эффект стоит до трансформа слоя, поэтому тянет то, что движется внутри слоя
 * (аниматоры текста, содержимое shape-группы), а не перелёт масштабом самого слоя.
 * Шлейф включается только на окна движения: вне них шаг и затухание — нули, иначе на покое
 * остаётся двойной контур. Включение незаметно: на неподвижном слое эхо совпадают с оригиналом.
 * @param {AVLayer} layer
 * @param {{time?: number, echoes?: number, decay?: number, intensity?: number, operator?: number, rest?: number, windows?: {from: number, to: number, fade?: number, rise?: number}[], fade?: number, rise?: number}} [opts]
 *   time — шаг эха в секундах (отрицательный = в прошлое, по умолчанию −0,03);
 *   operator — номер в списке «Echo Operator» (5 = Composite In Back, проверять глазами);
 *   windows — окна, когда шлейф живёт (с 0 до rest, если задан только rest; без обоих — всегда);
 *   fade — за сколько секунд гаснет после окна, rise — за сколько разгорается перед ним
 * @returns {PropertyGroup}
 */
function kbEcho(layer, opts) {
  opts = opts || {};
  var fx = kbEffect(layer, "ADBE Echo");
  var step = opts.time === undefined ? -0.03 : opts.time;
  var decay = opts.decay === undefined ? 0.6 : opts.decay;

  kbProp(fx, ["ADBE Echo-0002"]).setValue(opts.echoes === undefined ? 6 : opts.echoes); // Number Of Echoes
  kbProp(fx, ["ADBE Echo-0003"]).setValue(opts.intensity === undefined ? 1 : opts.intensity); // Starting Intensity
  kbProp(fx, ["ADBE Echo-0005"]).setValue(opts.operator === undefined ? 5 : opts.operator); // Echo Operator

  var time = kbProp(fx, ["ADBE Echo-0001"]);
  var falloff = kbProp(fx, ["ADBE Echo-0004"]);
  var windows = opts.windows;
  if (!windows && opts.rest !== undefined) windows = [{ from: 0, to: opts.rest }];
  if (!windows) {
    time.setValue(step);
    falloff.setValue(decay);
    return fx;
  }

  var fade = opts.fade === undefined ? 0.22 : opts.fade;
  var rise = opts.rise === undefined ? 0.05 : opts.rise;
  var times = [];
  var steps = [];
  var decays = [];
  for (var i = 0; i < windows.length; i++) {
    var w = windows[i];
    if (w.from > 0) {
      times.push(w.from - (w.rise === undefined ? rise : w.rise));
      steps.push(0);
      decays.push(0);
    }
    times.push(w.from); steps.push(step); decays.push(decay);
    times.push(w.to); steps.push(step); decays.push(decay);
    // Эхо смотрит на 0,2 с назад: если гасить долго, остановившееся слово ещё тянет за собой хвост.
    times.push(w.to + (w.fade === undefined ? fade : w.fade)); steps.push(0); decays.push(0);
  }
  // Шаг гасим вместе с затуханием: иначе последнее эхо на покое всё ещё стоит рядом со слоем.
  kbKeys(time, times, steps, KB_EASE.soft);
  kbKeys(falloff, times, decays, KB_EASE.soft);
  return fx;
}

/**
 * Рывок в сторону и обратно с перелётом на возврате. Двигает буквы аниматором внутри слоя —
 * именно поэтому Echo видит движение и тянет шлейф (перелёт трансформом слоя он не видит).
 * Аниматор без селектора действует на все буквы разом, слово идёт единым блоком.
 * @param {TextLayer} layer
 * @param {{time: number, distance?: number, duration?: number, back?: number, ease?: {out: number, into: number}}} opts
 *   distance — на сколько пикселей уходит (минус = влево); back — доля перелёта на возврате
 * @returns {PropertyGroup}
 */
function kbTextJolt(layer, opts) {
  var dx = opts.distance === undefined ? -150 : opts.distance;
  var total = opts.duration === undefined ? 0.27 : opts.duration;
  var back = opts.back === undefined ? 0.17 : opts.back;
  // Аниматор буквам нужен трёхмерный (как у влёта): у плоского текста своего Position 3D нет.
  layer.threeDLayer = true;
  layer.threeDPerChar = true;

  var animator = kbAdd(kbGroup(layer, ["ADBE Text Properties", "ADBE Text Animators"]), "ADBE Text Animator");
  animator.name = "jolt";
  var props = kbGroup(animator, ["ADBE Text Animator Properties"]);
  var pos = /** @type {Property} */ (props.addProperty("ADBE Text Position 3D"));
  var t = opts.time;
  kbKeys(pos,
    [t, t + total * 0.3, t + total * 0.7, t + total],
    [[0, 0, 0], [dx, 0, 0], [-dx * back, 0, 0], [0, 0, 0]],
    opts.ease || { out: 12, into: 35 });
  return animator;
}

/**
 * Концентрические дуги вокруг точки: эллипс + обводка с круглыми концами + Trim Paths.
 * Каждая дуга прочерчивается (End 0 → end) и одновременно проворачивается (Offset, градусы:
 * отрицательный spin — в другую сторону). После отрисовки дуга не замирает: до until идёт
 * медленный доворот на drift — композиция кадра почти держится, но движение не останавливается.
 * beat — общий для всех дуг быстрый доворот посреди покоя: каждая дуга крутится в свою сторону,
 * после удара продолжает медленный дрейф от нового угла.
 * Сдвиг Offset на 180° = точное отражение дуги через центр (у эллипса симметрия), этим удобно
 * перекладывать дугу на другую сторону, не трогая остальное.
 * @param {CompItem} comp
 * @param {{x: number, y: number, until?: number, ease?: {out: number, into: number}, beat?: {time: number, duration?: number, spin?: number}, arcs: {width: number, height: number, thickness: number, color: [number, number, number], end?: number, spin?: number, drift?: number, phase?: number, start?: number, duration?: number, opacity?: number, beat?: {time: number, duration?: number, spin?: number}}[]}} opts
 *   until — до какой секунды идёт доворот (по умолчанию до конца композиции)
 * @returns {ShapeLayer}
 */
function kbArcs(comp, opts) {
  var layer = comp.layers.addShape();
  layer.name = "arcs";
  var root = kbGroup(layer, ["ADBE Root Vectors Group"]);
  var until = opts.until === undefined ? comp.duration : opts.until;
  var ease = opts.ease || { out: 20, into: 45 };

  for (var i = 0; i < opts.arcs.length; i++) {
    var arc = opts.arcs[i];
    var group = kbAdd(root, "ADBE Vector Group");
    group.name = "arc-" + (i + 1);
    var contents = kbGroup(group, ["ADBE Vectors Group"]);

    var ellipse = kbAdd(contents, "ADBE Vector Shape - Ellipse");
    kbProp(ellipse, ["ADBE Vector Ellipse Size"]).setValue([arc.width, arc.height]);

    var stroke = kbAdd(contents, "ADBE Vector Graphic - Stroke");
    kbProp(stroke, ["ADBE Vector Stroke Color"]).setValue([arc.color[0], arc.color[1], arc.color[2], 1]);
    kbProp(stroke, ["ADBE Vector Stroke Width"]).setValue(arc.thickness);
    kbProp(stroke, ["ADBE Vector Stroke Line Cap"]).setValue(2); // Round Cap — концы дуги круглые
    if (arc.opacity !== undefined) kbProp(stroke, ["ADBE Vector Stroke Opacity"]).setValue(arc.opacity);

    var trim = kbAdd(contents, "ADBE Vector Filter - Trim");
    var t0 = arc.start === undefined ? 0 : arc.start;
    var t1 = t0 + (arc.duration === undefined ? 1 : arc.duration);
    kbKeys(kbProp(trim, ["ADBE Vector Trim End"]), [t0, t1], [0, arc.end === undefined ? 62 : arc.end], KB_EASE.snap);

    var spin = arc.spin === undefined ? 200 : arc.spin;
    var phase = arc.phase === undefined ? 0 : arc.phase;
    var target = phase + spin;
    var drift = arc.drift === undefined ? 0 : arc.drift;
    var offset = kbProp(trim, ["ADBE Vector Trim Offset"]);
    var beat = arc.beat || opts.beat;
    if (beat && beat.time > t1 && beat.time < until) {
      var beatSpan = beat.duration === undefined ? 0.3 : beat.duration;
      var beatSpin = (beat.spin === undefined ? 75 : beat.spin) * (spin < 0 ? -1 : 1);
      // Дрейф к моменту удара — доля пути: после удара дуга идёт дальше от нового угла.
      var driftAt = drift * (beat.time - t1) / (until - t1);
      kbKeys(offset, [t0, t1, beat.time, beat.time + beatSpan, until],
        [phase, target, target + driftAt, target + driftAt + beatSpin, target + drift + beatSpin], ease);
      // Два ключа удара переопределяем резким easing: рывок, потом долгая посадка.
      kbKeys(offset, [beat.time, beat.time + beatSpan],
        [target + driftAt, target + driftAt + beatSpin], KB_EASE.punch);
    } else if (drift) {
      kbKeys(offset, [t0, t1, until], [phase, target, target + drift], ease);
    } else {
      kbKeys(offset, [t0, until], [phase, target], ease);
    }
  }

  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([opts.x, opts.y]);
  return layer;
}
