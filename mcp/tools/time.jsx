// Время: сдвиг слоёв (по именам, «всё после t», выравнивание по другому слою или маркеру), вставка и удаление
// паузы (ripple), свойства композиции. Ключи живут во времени слоя: сдвиг startTime двигает их вместе со слоем.

/**
 * Момент для выравнивания: {layer, edge: "in"|"out"}, {marker: комментарий маркера композиции} или {time}; + offset.
 * @param {CompItem} comp
 * @param {any} to
 * @returns {number}
 */
function mcpAlignTime(comp, to) {
  var t;
  if (to.layer) {
    var ref = mcpFindLayer(comp, to.layer);
    t = to.edge === "out" ? ref.outPoint : ref.inPoint;
  } else if (to.marker) {
    var markers = /** @type {any} */ (comp).markerProperty;
    for (var i = 1; i <= markers.numKeys; i++) {
      if (markers.keyValue(i).comment === to.marker) { t = markers.keyTime(i); break; }
    }
    if (t === undefined) {
      // опорное слово озвучки: маркер «!имя» на звуковом слое здесь или в родительской композиции
      var name = String(to.marker).replace(/^!/, "");
      var voice = mcpVoiceBeats(comp, 4);
      for (var v = 0; v < voice.length; v++) if (voice[v].label === name) { t = voice[v].time; break; }
    }
    if (t === undefined) throw new Error("Нет маркера «" + to.marker + "» ни у композиции, ни среди опорных слов озвучки");
  } else if (to.time !== undefined) {
    t = to.time;
  } else {
    throw new Error("alignTo: укажите layer (+ edge), marker или time");
  }
  return t + (to.offset || 0);
}

/**
 * Сдвинуть ключи всех свойств слоя, начиная с момента from (для слоёв, идущих через точку вставки паузы).
 * @param {Layer} layer
 * @param {number} from
 * @param {number} delta
 * @param {number} fps
 * @returns {number}
 */
function mcpShiftKeysAfter(layer, from, delta, fps) {
  var props = [];
  mcpKeyedProps(layer, props, 6);
  var n = 0;
  for (var i = 0; i < props.length; i++) {
    if (props[i].numKeys === 0) continue;
    n += mcpMoveKeys(props[i], from, 1e9, function (t) { return t + delta; }, fps);
  }
  return n;
}

MCP_TOOLS.shift_layers = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var fps = comp.frameRate;
    var eps = 0.5 / fps;
    var selected = [];
    var i;
    if (args.layers) {
      for (i = 0; i < args.layers.length; i++) selected.push(mcpFindLayer(comp, args.layers[i]));
    } else if (args.after !== undefined) {
      for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i).inPoint >= args.after - eps) selected.push(comp.layer(i));
    } else {
      throw new Error("Укажите layers (имена) или after (все слои, что начинаются не раньше этого момента)");
    }
    if (args.ripple && args.after === undefined) throw new Error("ripple работает от момента after");

    var delta;
    if (args.alignTo) {
      if (!selected.length) throw new Error("Нечего выравнивать");
      var first = selected[0].inPoint;
      for (i = 1; i < selected.length; i++) first = Math.min(first, selected[i].inPoint);
      delta = mcpAlignTime(comp, args.alignTo) - first;
    } else {
      delta = args.frames !== undefined ? args.frames / fps : args.seconds;
    }
    if (delta === undefined) throw new Error("Укажите seconds, frames или alignTo");
    delta = Math.round(delta * fps) / fps; // на кадр

    var locked = [];
    for (i = 0; i < selected.length; i++) if (selected[i].locked) locked.push(selected[i].name);
    var spanning = [];
    if (args.ripple) {
      for (i = 1; i <= comp.numLayers; i++) {
        var l = comp.layer(i);
        if (l.inPoint < args.after - eps && l.outPoint > args.after + eps) {
          spanning.push(l);
          if (l.locked) locked.push(l.name);
        }
      }
      if (delta < 0) {
        // Убрать паузу [after − |delta|, after): в ней не должно начинаться ничего, кроме сдвигаемого.
        for (i = 1; i <= comp.numLayers; i++) {
          var w = comp.layer(i);
          if (w.inPoint >= args.after + delta - eps && w.inPoint < args.after - eps) {
            throw new Error("В убираемом отрезке " + mcpRound(args.after + delta) + "–" + mcpRound(args.after) + " с начинается слой «" + w.name + "» — сначала сдвиньте или удалите его");
          }
        }
        // ключи сквозных слоёв в убираемом отрезке — до любых изменений, чтобы не оставить полдела
        for (i = 0; i < spanning.length; i++) {
          var kp = [];
          mcpKeyedProps(spanning[i], kp, 6);
          for (var pi = 0; pi < kp.length; pi++) {
            for (var ki = 1; ki <= kp[pi].numKeys; ki++) {
              var kt = kp[pi].keyTime(ki);
              if (kt >= args.after + delta - eps && kt < args.after - eps) {
                throw new Error("У «" + spanning[i].name + "» ключ «" + kp[pi].name + "» в " + mcpRound(kt) + " с внутри убираемого отрезка — удалите его (edit_keys delete) или уберите паузу в другом месте");
              }
            }
          }
        }
      }
    }
    if (locked.length) throw new Error("Заблокированные слои (замок в таймлайне): " + locked.join(", ") + " — снимите замок");

    var moved = [];
    for (i = 0; i < selected.length; i++) {
      selected[i].startTime += delta;
      moved.push({name: selected[i].name, inPoint: mcpRound(selected[i].inPoint), outPoint: mcpRound(selected[i].outPoint)});
    }
    var stretched = [];
    if (args.ripple) {
      for (i = 0; i < spanning.length; i++) {
        var s = spanning[i];
        var keys = mcpShiftKeysAfter(s, args.after, delta, fps);
        var wantOut = s.outPoint + delta;
        s.outPoint = wantOut;
        var note;
        var src = /** @type {any} */ (s).source;
        if (src instanceof FootageItem && !src.mainSource.isStill && !(src.mainSource instanceof SolidSource)) {
          note = "пауза внутри звучащего/идущего клипа: звук и видео не останавливаются — для озвучки ставьте паузу между клипами";
        } else if (Math.abs(s.outPoint - wantOut) > eps) {
          note = "конец упёрся в длину исходника";
        }
        stretched.push({name: s.name, outPoint: mcpRound(s.outPoint), keysShifted: keys, note: note});
      }
      // маркеры композиции после точки
      var markers = /** @type {any} */ (comp).markerProperty;
      if (markers.numKeys) mcpMoveKeys(markers, args.after, 1e9, function (t) { return t + delta; }, fps);
      comp.duration = Math.max(1 / fps, comp.duration + delta); // пауза удлиняет, удаление укорачивает
    }
    var warn = [];
    for (i = 0; i < selected.length; i++) if (selected[i].inPoint < 0) warn.push(selected[i].name + " начинается раньше 0");
    var end = 0;
    for (i = 1; i <= comp.numLayers; i++) end = Math.max(end, comp.layer(i).outPoint);
    if (end > comp.duration + eps) warn.push("слои идут дольше композиции (" + mcpRound(end) + " > " + mcpRound(comp.duration) + " с) — set_comp duration");
    return {delta: mcpRound(delta), frames: Math.round(delta * fps), moved: moved, stretched: stretched, duration: mcpRound(comp.duration), warnings: warn};
  }
};

MCP_TOOLS.set_comp = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    if (args.name && args.name !== comp.name) {
      for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof CompItem && it.name === args.name) throw new Error("Композиция «" + args.name + "» уже есть");
      }
      comp.name = args.name;
    }
    if (args.duration) comp.duration = args.duration;
    if (args.fps) comp.frameRate = args.fps;
    if (args.background) comp.bgColor = args.background;
    if (args.workArea) {
      comp.workAreaStart = args.workArea[0];
      comp.workAreaDuration = args.workArea[1] - args.workArea[0];
    }
    return {name: comp.name, duration: mcpRound(comp.duration), fps: comp.frameRate, background: comp.bgColor,
      workArea: [mcpRound(comp.workAreaStart), mcpRound(comp.workAreaStart + comp.workAreaDuration)]};
  }
};
