// Сборка урока по партитуре: блоки (kit/blocks.jsx) своими композициями → мастер с переходами (library/transitions.json).
// Хронометраж по озвучке — kit/lesson.jsx (kbTimeline); здесь длина блока — от его входов и удержания текста.
//
//   var res = kbBuildLesson(kbStyle("editorial-dark"), {
//     id: "en-03", formats: ["9x16"], audience: "teens",
//     transitions: {"default": "style", "beforeGame": "trans.shapeWipe"},
//     blocks: [{type: "title", title: "Food"}, {type: "word", word: "apple", …}, {type: "quiz-pick", …}]
//   });
//   // res.masters[0].comp — «lesson · en-03 · 9x16», res.masters[0].timeline — [{type, start, end, transition}]

//@include "blocks.jsx"

/**
 * Переход перед блоком i: свой у блока → beforeGame (перед квизом) → default урока → motion.transition стиля.
 * @param {any} style
 * @param {any} lesson
 * @param {any} block
 * @returns {string}
 */
function kbLessonTransition(style, lesson, block) {
  var t = lesson.transitions || {};
  if (block.transition) return block.transition;
  if (block.type === "quiz-pick" && t.beforeGame) return t.beforeGame;
  if (t["default"] && t["default"] !== "style") return t["default"];
  return kbTok(style, "motion.transition");
}

/**
 * Перекрытие блоков переходом, с: overlap — вся длина, cover и cut — 0 (склейка встык).
 * @param {any} style
 * @param {any} tr
 * @param {number} fps
 * @returns {number}
 */
function kbTransOverlap(style, tr, fps) {
  return tr.mode === "overlap" ? kbMsToTime(kbMs(style, tr.dur), fps) : 0;
}

/**
 * Переход между слоями блоков в мастере.
 * @param {any} style
 * @param {any} tr примитив перехода (с id)
 * @param {CompItem} master
 * @param {AVLayer} prev уходящий блок
 * @param {AVLayer} next приходящий блок
 * @param {number} at начало перехода (overlap) или склейка (cover)
 * @param {string} nextBg цвет фона следующего блока (роль color.bg его стиля)
 * @returns {string[]} созданные слои
 */
function kbTransition(style, tr, master, prev, next, at, nextBg) {
  var fps = 1 / master.frameDuration;
  var D = kbMsToTime(kbMs(style, tr.dur), fps);
  var W = master.width;
  var H = master.height;
  var curve = tr.curve ? kbLibCurve(style, tr.curve, "transition") : kbTok(style, "motion.ease.transition");
  var made = [];
  var pos = function (l) { return kbProp(l, ["ADBE Transform Group", "ADBE Position"]); };
  var c0 = [W / 2, H / 2];
  if (tr.id === "trans.cut" || D <= 0) return made;

  if (tr.id === "trans.push" || tr.id === "trans.whip") {
    kbKeysCurve(pos(prev), at, D, c0, [c0[0] - W, c0[1]], curve);
    kbKeysCurve(pos(next), at, D, [c0[0] + W, c0[1]], c0, curve);
    prev.motionBlur = true;
    next.motionBlur = true;
    if (tr.id === "trans.whip") {
      var layers = [prev, next];
      for (var i = 0; i < 2; i++) {
        var blur = kbEffect(layers[i], "ADBE Motion Blur");
        kbProp(blur, ["ADBE Motion Blur-0001"]).setValue(90);
        var len = kbProp(blur, ["ADBE Motion Blur-0002"]);
        kbKeysCurve(len, at, D / 2, 0, 120, "sineInOut");
        kbKeysCurve(len, at + D / 2, D / 2, 120, 0, "sineInOut");
      }
    }
  } else if (tr.id === "trans.zoomThrough") {
    var sp = kbProp(prev, ["ADBE Transform Group", "ADBE Scale"]);
    kbKeysCurve(sp, at, D, sp.value, kbLibValue(400, sp.value, "scale", 1), "expoIn");
    kbKeysCurve(kbProp(prev, ["ADBE Transform Group", "ADBE Opacity"]), at, D, 100, 0, "expoIn");
    var sn = kbProp(next, ["ADBE Transform Group", "ADBE Scale"]);
    kbKeysCurve(sn, at, D, kbLibValue(60, sn.value, "scale", 1), sn.value, "expoOut");
    kbKeysCurve(kbProp(next, ["ADBE Transform Group", "ADBE Opacity"]), at, D * 0.6, 0, 100, "expoOut");
  } else if (tr.id === "trans.fade") {
    kbKeysCurve(kbProp(next, ["ADBE Transform Group", "ADBE Opacity"]), at, D, 0, 100, curve);
  } else if (tr.id === "trans.iris") {
    // Круг-мат над приходящим блоком: масштаб 0 → 100 % от диагонали кадра.
    var matte = kbLibShapeLayer(master, "iris · " + next.name);
    var d = Math.sqrt(W * W + H * H) * 1.02;
    kbLibShape(matte, { name: "iris", ellipse: [d, d], center: c0, fill: [1, 1, 1] });
    var tg = kbGroup(matte, ["ADBE Root Vectors Group", "iris", "ADBE Vector Transform Group"]);
    kbProp(tg, ["ADBE Vector Anchor"]).setValue(c0);
    kbProp(tg, ["ADBE Vector Position"]).setValue(c0);
    kbKeysCurve(kbProp(tg, ["ADBE Vector Scale"]), at, D, [0, 0], [100, 100], curve);
    matte.moveBefore(next);
    next.setTrackMatte(matte, TrackMatteType.ALPHA);
    matte.inPoint = next.inPoint;
    matte.outPoint = next.outPoint;
    made.push(matte);
  } else if (tr.id === "trans.shapeWipe") {
    // Шторки идут справа налево; последняя (фон следующего блока) закрывает кадр ровно в момент склейки.
    var p = kbLibParams(tr, {});
    var stagger = kbMsToTime(kbMs(style, p.stagger), fps);
    var n = p.colors.length;
    for (var k = 0; k < n; k++) {
      var role = p.colors[k] === "next" ? nextBg : p.colors[k];
      var cover = kbLibShapeLayer(master, "wipe " + (k + 1) + " · " + next.name);
      kbLibShape(cover, { name: "cover", rect: [W, H], center: c0, fill: kbHex(kbTok(style, "color." + role)) });
      var lead = (n - 1 - k) * stagger;
      var t0 = at - D / 2 - lead;
      var cp = pos(cover);
      kbKeysCurve(cp, t0, D / 2, [W, 0], [0, 0], curve);
      kbKeysCurve(cp, t0 + D / 2, D / 2, [0, 0], [-W, 0], curve);
      cover.inPoint = Math.max(0, t0);
      cover.outPoint = t0 + D + master.frameDuration;
      made.push(cover);
    }
  } else {
    throw new Error("Переход «" + tr.id + "» не собирается: trans.cut, push, whip, shapeWipe, iris, zoomThrough, fade");
  }
  return kbLibNames(made);
}

/**
 * Урок по партитуре: для каждого формата — блоки и мастер.
 * @param {any} style итоговый стиль или id
 * @param {{id: string, formats?: string[], audience?: string, transitions?: any, blocks: any[]}} lesson
 * @param {{transitions?: any}=} o transitions — {id: примитив} от сервера (иначе читаются из библиотеки)
 * @returns {{masters: any[]}}
 */
function kbBuildLesson(style, lesson, o) {
  var st = typeof style === "string" ? kbStyle(style) : style;
  if (!lesson.blocks || !lesson.blocks.length) throw new Error("Урок без блоков");
  for (var v = 0; v < lesson.blocks.length; v++) {
    if (!KB_BLOCKS[lesson.blocks[v].type]) throw new Error("Блок " + (v + 1) + ": тип «" + lesson.blocks[v].type + "» — title, word, image-callout, quiz-pick, recap");
    kbBlockCheckData(lesson.blocks[v].type, lesson.blocks[v]);
  }
  var trs = (o && o.transitions) || {};
  var getTr = function (id) {
    var t = trs[id] || kbLibItem(id);
    t.id = id;
    return t;
  };
  var formats = lesson.formats || ["9x16"];
  var masters = [];
  for (var f = 0; f < formats.length; f++) {
    var fmt = formats[f];
    var built = [];
    for (var b = 0; b < lesson.blocks.length; b++) {
      var blk = lesson.blocks[b];
      var res = kbBlock(st, blk.type, blk, {
        format: fmt, index: b + 1, audience: lesson.audience,
        name: "lesson · " + lesson.id + " · " + fmt + " · " + (b < 9 ? "0" : "") + (b + 1) + " " + blk.type
      });
      built.push(res);
    }
    var size = KB_BLOCK_SIZE[fmt];
    var fps = built[0].comp.frameRate;
    var name = "lesson · " + lesson.id + " · " + fmt;
    for (var i = app.project.numItems; i >= 1; i--) if (app.project.item(i).name === name && app.project.item(i) instanceof CompItem) app.project.item(i).remove();

    // Хронометраж: старт блока = конец предыдущего минус перекрытие перехода перед ним.
    var starts = [0];
    var trIds = ["trans.cut"];
    for (var s = 1; s < built.length; s++) {
      var tid = kbLessonTransition(st, lesson, lesson.blocks[s]);
      trIds.push(tid);
      starts.push(Math.round((starts[s - 1] + built[s - 1].duration - kbTransOverlap(st, getTr(tid), fps)) * fps) / fps);
    }
    var total = starts[built.length - 1] + built[built.length - 1].duration;
    var master = app.project.items.addComp(name, size[0], size[1], 1, total, fps);
    var layers = [];
    for (var l = 0; l < built.length; l++) {
      var layer = master.layers.add(built[l].comp);
      layer.startTime = starts[l];
      layer.name = (l < 9 ? "0" : "") + (l + 1) + " " + built[l].type;
      layers.push(layer);
    }
    // layers.add кладёт новый слой наверх: следующий блок уже над предыдущим (приходящий накрывает уходящий).

    var timeline = [];
    var nextBg = "bg";
    for (var t = 0; t < built.length; t++) {
      var entry = { block: t + 1, type: built[t].type, comp: built[t].comp.name, start: Math.round(starts[t] * 1000) / 1000, end: Math.round((starts[t] + built[t].duration) * 1000) / 1000, transition: trIds[t] };
      if (t > 0) {
        var tr = getTr(trIds[t]);
        // overlap — переход идёт с начала нахлёста; cover — склейка ровно на старте блока.
        entry.transitionLayers = kbTransition(st, tr, master, layers[t - 1], layers[t], starts[t], nextBg);
      }
      var beats = [];
      for (var k = 0; k < built[t].beats.length; k++) beats.push({ beat: built[t].beats[k].beat, t: Math.round((starts[t] + built[t].beats[k].t) * 1000) / 1000 });
      entry.beats = beats;
      timeline.push(entry);
    }
    masters.push({ comp: master, format: fmt, duration: total, timeline: timeline });
  }
  return { masters: masters };
}
