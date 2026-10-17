// Правила урока для audit_animation (когда передан стиль серии): docs/research/motion-design-pro.md §7.11.
//   easyEase  ключи с Easy Ease по умолчанию (influence 33,3 %, скорость 0 с обеих сторон) — кривые стиля вместо него
//   safe      текст выходит за safe-зону формата (интерфейс Shorts/Reels/TikTok закроет)
//   size      кегль мельче type.min стиля (не читается на телефоне)
//   contrast  текст на фоне стиля контрастнее 4,5:1 (цель 7:1); текст на плашках не проверяется — у плашки свои пары
//   idle      одновременно больше 3 циклов простоя (idle.*): глаз не знает, куда смотреть
//   rhythm    окно 4 с без единого события (вход, ключ, акцент) — внимание проседает
// Прекомпы того же размера (блоки урока) проверяются вместе с мастером, время переводится в мастер.

/**
 * Относительная яркость цвета 0…1 (WCAG).
 * @param {number[]} c
 * @returns {number}
 */
function mcpLuma(c) {
  var ch = function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
}

/**
 * Контраст двух цветов (WCAG), 1…21.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function mcpContrast(a, b) {
  var la = mcpLuma(a);
  var lb = mcpLuma(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Слои композиции и вложенных прекомпов того же размера: [{layer, offset}] — offset переводит время слоя в мастер.
 * @param {CompItem} comp
 * @param {number} offset
 * @param {number} depth
 * @param {any[]} out
 * @returns {any[]}
 */
function mcpLessonLayers(comp, offset, depth, out) {
  for (var i = 1; i <= comp.numLayers; i++) {
    var l = comp.layer(i);
    if (!l.enabled) continue;
    out.push({ layer: l, offset: offset });
    var src = /** @type {any} */ (l).source;
    if (depth > 0 && src instanceof CompItem && src.width === comp.width && src.height === comp.height) {
      mcpLessonLayers(src, offset + l.startTime, depth - 1, out);
    }
  }
  return out;
}

/**
 * @param {CompItem} comp
 * @param {any} style итоговый стиль
 * @param {function(string, string, Object): void} add
 * @param {number} from
 * @param {number} to
 * @returns {{texts: number, events: number}}
 */
function mcpAuditLesson(comp, style, add, from, to) {
  var fmt = kbFormat(comp);
  var safe = kbTok(style, "safe." + fmt);
  var unit = kbLibUnit(style, comp);
  var minSize = kbTok(style, "type.min") * unit;
  var bg = kbHex(kbTok(style, "color.bg"));
  var all = mcpLessonLayers(comp, 0, 2, []);
  var events = [];
  var idles = [];
  var texts = 0;
  var easyLayers = {};

  for (var i = 0; i < all.length; i++) {
    var l = all[i].layer;
    var off = all[i].offset;
    var lin = l.inPoint + off;
    var lout = l.outPoint + off;
    if (lout < from || lin > to) continue;
    var where = l.containingComp === comp ? l.name : l.containingComp.name + " / " + l.name;
    if (lin > from + 0.01) events.push(lin);

    var props = [];
    mcpKeyedProps(l, props, 6);
    for (var p = 0; p < props.length; p++) {
      var pr = props[p];
      for (var k = 1; k <= pr.numKeys; k++) events.push(pr.keyTime(k) + off);
      if (pr.expression && pr.expression.indexOf("kb-idle") >= 0) idles.push({ layer: where, t0: lin, t1: lout });
      // Анимация текста библиотеки — выражение без ключей: начало и конец из метки kb-text, внутри — событие на каждые 0,5 с.
      var tm = pr.expression ? /kb-text ([\d.]+) ([\d.]+)/.exec(pr.expression) : null;
      if (tm) for (var tt = Number(tm[1]); tt <= Number(tm[2]) + 1e-6; tt += 0.5) events.push(tt + off);
      // Easy Ease по умолчанию: отрезок, где выход и вход — 33,3 % при скорости 0.
      if (!easyLayers[where] && pr.numKeys > 1 && pr.propertyValueType !== PropertyValueType.NO_VALUE) {
        for (var e = 1; e < pr.numKeys; e++) {
          if (pr.keyOutInterpolationType(e) !== KeyframeInterpolationType.BEZIER) continue;
          var o = pr.keyOutTemporalEase(e)[0];
          var n = pr.keyInTemporalEase(e + 1)[0];
          if (Math.abs(o.influence - 33.333) < 0.05 && Math.abs(n.influence - 33.333) < 0.05 && Math.abs(o.speed) < 1e-6 && Math.abs(n.speed) < 1e-6) {
            easyLayers[where] = true;
            add("easyEase", "info", { layer: where, prop: pr.name, at: mcpRound(pr.keyTime(e) + off),
              message: "Easy Ease по умолчанию (33 %) — движение без характера", fix: "кривая из стиля: apply_library или ease пресета expoOut/quintOut" });
            break;
          }
        }
      }
    }

    if (!(l instanceof TextLayer)) continue;
    texts++;
    var rest = Math.max(l.inPoint, Math.min(l.outPoint - 0.05, l.inPoint + (l.outPoint - l.inPoint) * 0.75));
    var doc = kbProp(l, ["ADBE Text Properties", "ADBE Text Document"]).valueAtTime(rest, false);
    var sc = kbProp(l, ["ADBE Transform Group", "ADBE Scale"]).valueAtTime(rest, false)[1] / 100;
    var parentScale = l.parent ? kbProp(l.parent, ["ADBE Transform Group", "ADBE Scale"]).valueAtTime(rest, false)[1] / 100 : 1;
    var size = doc.fontSize * sc * parentScale;
    if (size < minSize - 0.5) {
      add("size", "warning", { layer: where, size: Math.round(size), min: Math.round(minSize), message: "кегль " + Math.round(size) + " px мельче минимума стиля " + Math.round(minSize), fix: "крупнее или короче текст (type.min)" });
    }
    if (!l.parent) {
      var box = kbLibBox(l, rest);
      var over = [];
      if (box.left < safe.left - 1) over.push("слева " + Math.round(safe.left - box.left));
      if (box.right > comp.width - safe.right + 1) over.push("справа " + Math.round(box.right - comp.width + safe.right));
      if (box.top < safe.top - 1) over.push("сверху " + Math.round(safe.top - box.top));
      if (box.bottom > comp.height - safe.bottom + 1) over.push("снизу " + Math.round(box.bottom - comp.height + safe.bottom));
      if (over.length) add("safe", "warning", { layer: where, at: mcpRound(rest + off), message: "текст за safe-зоной " + fmt + ": " + over.join(", ") + " px", fix: "сдвинуть в safe-зону или уменьшить (safe стиля)" });
      if (doc.applyFill) {
        var ratio = mcpContrast(doc.fillColor, bg);
        if (ratio < 4.5) add("contrast", "warning", { layer: where, ratio: Math.round(ratio * 10) / 10, message: "контраст с фоном стиля " + (Math.round(ratio * 10) / 10) + ":1 < 4,5:1", fix: "цвет ink/onSurface стиля или плашка под текстом" });
      }
    }
  }

  // idle: больше трёх циклов одновременно.
  for (var a = 0; a < idles.length; a++) {
    var t = idles[a].t0;
    var live = [];
    for (var b = 0; b < idles.length; b++) if (idles[b].t0 <= t && idles[b].t1 > t) live.push(idles[b].layer);
    if (live.length > 3) {
      add("idle", "warning", { at: mcpRound(t), layers: live, message: live.length + " циклов простоя одновременно (> 3)", fix: "оставить idle только главному объекту" });
      break;
    }
  }

  // rhythm: окна 4 с без событий, шаг 1 с.
  events.sort(function (x, y) { return x - y; });
  var quietFrom = -1;
  for (var w = from; w + 4 <= to + 1e-6; w += 1) {
    var any = false;
    for (var v = 0; v < events.length; v++) if (events[v] >= w && events[v] < w + 4) { any = true; break; }
    if (!any && quietFrom < 0) quietFrom = w;
    if ((any || w + 5 > to) && quietFrom >= 0) {
      add("rhythm", "info", { from: mcpRound(quietFrom), to: mcpRound(any ? w + 3 : w + 4), message: "4+ с без событий — внимание проседает", fix: "акцент, вход или смена плана каждые 2–4 с" });
      quietFrom = -1;
    }
  }
  return { texts: texts, events: events.length };
}
