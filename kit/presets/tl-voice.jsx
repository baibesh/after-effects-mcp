// №5 voice-in — слово встаёт в такт голосу. Подключать после tl-move.jsx (реестр TL_MOVES, tlAnimator).
// ES3, свойства только по matchName. Расписание: spec.md §3.5.

/**
 * Расписание букв по словам под голос.
 * Старт слова = onset − 3 к.; последняя буква слова садится не позже следующего onset − 2 к.;
 * стаггер букв внутри слова в [20, 45] мс; не выходит даже при 20 мс — единица укорачивается (WARN voice-in short).
 * Якорь {word, chars, at}: первые chars букв слова w обязаны сесть к at − 2 к. (ударное окончание — заглушка BIG|GER).
 * @param {string[]} words слова текста (в порядке чтения)
 * @param {number[]} onsets начала слов, с (время слоя/ячейки)
 * @param {number} off конец звучания, с
 * @param {{word: number, chars: number, at: number}[]=} anchors
 * @returns {{starts: number[], unitFr: number, hit: number, start: number, shrunk: boolean}}
 */
function tlVoiceSchedule(words, onsets, off, anchors) {
  if (words.length !== onsets.length) throw new Error("voice-in: слов в тексте " + words.length + ", меток " + onsets.length);
  var F = 1 / 30;
  var LEAD = 3 * F;
  var GAP = 2 * F;
  var UNIT = 5 * F;
  var ST_MIN = 0.020;
  var ST_MAX = 0.045;
  var plan = [];
  var minUnit = 5;
  var shrunk = false;
  var w;
  for (w = 0; w < words.length; w++) {
    var n = words[w].length;
    var s = onsets[w] - LEAD;
    var endW = w + 1 < words.length ? onsets[w + 1] : off;
    var deadline = w + 1 < words.length ? onsets[w + 1] - GAP : off;
    var avail = deadline - s;
    var span = n; // букв, которые обязаны сесть к дедлайну
    var a;
    if (anchors) {
      for (a = 0; a < anchors.length; a++) {
        if (anchors[a].word === w) { deadline = Math.min(deadline, anchors[a].at - GAP); avail = deadline - s; span = anchors[a].chars; }
      }
    }
    var st = 0;
    if (n > 1) {
      st = Math.min(0.6 * (endW - s) / n, (avail - UNIT) / Math.max(1, span - 1));
      if (st > ST_MAX) st = ST_MAX;
      if (st < ST_MIN) {
        st = ST_MIN;
        var u = Math.max(4 * F, avail - ST_MIN * (span - 1));
        var uf = Math.round(u * 30 * 100) / 100;
        if (uf < minUnit) minUnit = uf;
        shrunk = true;
        kbLog("WARN voice-in short " + words[w]);
      }
    }
    plan.push({ s: s, st: st, n: n, next: w + 1 < words.length ? onsets[w + 1] : off });
  }
  var unitFr = minUnit;
  var starts = [];
  var last = 0;
  for (w = 0; w < plan.length; w++) {
    var p = plan[w];
    var land = 0;
    for (var j = 0; j < p.n; j++) starts.push(p.s + j * p.st);
    land = p.s + (p.n - 1) * p.st + unitFr * F;
    var ok = w + 1 < plan.length ? land <= p.next - GAP + 0.0005 : true;
    kbLog("VOICE w" + (w + 1) + " " + words[w] + " start " + p.s.toFixed(3) + " st " + Math.round(p.st * 1000) + "ms land " + land.toFixed(3) +
      " next " + p.next.toFixed(3) + (ok ? " OK" : " LATE"));
    last = land;
  }
  return { starts: starts, unitFr: unitFr, hit: last, start: starts[0], shrunk: shrunk };
}

/**
 * Слова слоя (без пробелов и переводов строк).
 * @param {string} text
 * @returns {string[]}
 */
function tlWordsOf(text) {
  var parts = text.split(/\s+/);
  var out = [];
  for (var i = 0; i < parts.length; i++) if (parts[i] !== "") out.push(parts[i]);
  return out;
}

/**
 * Расписание под клип: метки слов из TL_WORDS[file] + старт клипа KB_S[id], конец — kbOff.
 * @param {string} text
 * @param {string} clipId id клипа в kbTimeline
 * @param {any[]=} anchors
 * @returns {any}
 */
function tlVoiceStarts(text, clipId, anchors) {
  var file = KB_FILE[clipId];
  // TL_WORDS — данные урока/витрины (stream1/voice.jsx), в lib не объявлены: читаем из глобала, чтобы валидатор lib/ без витрины не ругался
  /** @type {any} */
  var words = $.global["TL_WORDS"];
  var marks = words ? words[file] : undefined;
  if (!marks) throw new Error("voice-in: нет TL_WORDS[" + file + "]");
  var onsets = [];
  for (var i = 0; i < marks.length; i++) onsets.push(KB_S[clipId] + marks[i]);
  return tlVoiceSchedule(tlWordsOf(text), onsets, kbOff(clipId), anchors);
}

/**
 * №5 voice-in. opts: clip (id из kbTimeline) | {onsets[], off}, anchors[]. at/start не нужны — время задаёт голос.
 * Единица (5 к.): к. 0 y +0,24 em, 92 %, 0 % → к. 1 +0,28 em, 91 %, 40 % (soft) → к. 5 y 0, 100 % (snap), непрозрачность 100 % к к. 2,6.
 * hit = посадка последней буквы последнего слова; sfx нет.
 */
TL_MOVES["voice-in"] = {
  group: "text-in", slot: "in", units: ["char"], unit: "char",
  frames: { anticip: 1, travel: 4 }, stagger: { "char": 30 },
  over: 0, lead: 3, sfx: null,
  params: { strength: 1 },
  plan: function (layer, o, S) {
    var text = String(kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]).value.text);
    var sch;
    if (o.clip) sch = tlVoiceStarts(text, o.clip, o.anchors);
    else if (o.onsets) sch = tlVoiceSchedule(tlWordsOf(text), o.onsets, o.off, o.anchors);
    else throw new Error("voice-in: нужен clip или onsets+off");
    var n = tlCountUnits(layer, "char");
    if (n !== sch.starts.length) throw new Error("voice-in: букв " + n + ", расписание на " + sch.starts.length);
    return { n: n, unit: "char", starts: sch.starts, start: sch.start, hit: sch.hit, end: sch.hit, total: 0, unitFr: sch.unitFr, staggerFr: 0 };
  },
  run: function (layer, o, S, plan) {
    var em = tlFontSize(layer);
    var amp = o.strength * S.strength;
    var T = plan.unitFr;
    var a = 1;
    var full = a + 0.4 * (T - a);
    var span = 0.28 * em * Math.max(1, amp);
    tlAnimator(layer, { name: "voice-pos", basedOn: 2, grouping: 1, align: [0, 0], prop: "ADBE Text Position 3D", fullValue: [0, span, 0], rest: 0, span: span,
      starts: plan.starts, keys: [[0, 0.24 * em * amp], [a, 0.28 * em * amp, "soft"], [T, 0, "snap"]] });
    tlAnimator(layer, { name: "voice-scale", basedOn: 2, grouping: 1, align: [0, 0], prop: "ADBE Text Scale 3D", fullValue: [91, 91, 100], rest: 100, span: -9,
      starts: plan.starts, keys: [[0, 100 - 8 * amp], [a, 100 - 9 * amp, "soft"], [T, 100, "snap"]] });
    tlAnimator(layer, { name: "voice-op", basedOn: 2, grouping: 1, align: [0, 0], prop: "ADBE Text Opacity", fullValue: 0, rest: 100, span: -100,
      starts: plan.starts, keys: [[0, 0], [a, 40, "soft"], [full, 100, "snap"], [T, 100]] });
  }
};
