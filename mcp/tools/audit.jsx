// Проверка анимации по правилам /animation-craft (Уильямс, Глебас). Проект не меняет.
// Пороги — в кадрах при 24 fps (как в таблице Уильямса), переводятся в секунды делением на 24.
//
// Правила:
//   linear      линейные ключи на положении/масштабе/повороте/якоре (непрозрачность — можно)
//   hold        у персонажа ничего не меняется дольше maxHold кадров (moving hold); живым считается всё:
//               ключи слоя и эффектов, выражения, анимация внутри прекомпа (моргание, дыхание кита)
//   accent      пик движения к ударному слогу: должен быть на 1–6 кадров раньше (лучше 2–4)
//   entrance    два новых элемента входят в пределах 4 кадров (дети одного родителя — один элемент)
//   expression  выражение с ошибкой

var MCP_F24 = 1 / 24;

/**
 * Все свойства слоя с ключами или выражением (рекурсивно), кроме маркеров.
 * @param {any} group
 * @param {any[]} out
 * @param {number} depth
 */
function mcpKeyedProps(group, out, depth) {
  for (var i = 1; i <= group.numProperties; i++) {
    /** @type {any} */
    var p = group.property(i);
    if (!p || p.matchName === "ADBE Marker") continue;
    if (p.propertyType === PropertyType.PROPERTY) {
      if (p.numKeys > 0 || (p.canSetExpression && p.expressionEnabled && p.expression)) out.push(p);
    } else if (depth > 0) {
      mcpKeyedProps(p, out, depth - 1);
    }
  }
}

/**
 * Значения ключей различаются (форма, текст и прочие объекты считаются разными: ключ ставят ради изменения).
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function mcpDiffers(a, b) {
  if (typeof a === "number") return Math.abs(a - b) > 1e-6;
  if (a instanceof Array) {
    for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return true;
    return false;
  }
  return true;
}

/**
 * Где слой (с содержимым прекомпа) что-то меняет: [{t0, t1}] в секундах его композиции; t0 = t1 — мгновенная смена.
 * @param {Layer} layer
 * @param {number} depth глубина захода в прекомпы
 * @param {Object} cache
 * @returns {Object[]}
 */
function mcpLayerActivity(layer, depth, cache) {
  var acts = [];
  var props = [];
  mcpKeyedProps(layer, props, 6);
  for (var i = 0; i < props.length; i++) {
    var p = props[i];
    if (p.canSetExpression && p.expressionEnabled && p.expression && !p.expressionError) {
      acts.push({t0: layer.inPoint, t1: layer.outPoint});
      continue;
    }
    for (var k = 1; k < p.numKeys; k++) {
      var ta = p.keyTime(k);
      var tb = p.keyTime(k + 1);
      if (!mcpDiffers(p.keyValue(k), p.keyValue(k + 1))) continue;
      if (p.keyOutInterpolationType(k) === KeyframeInterpolationType.HOLD) acts.push({t0: tb, t1: tb});
      else acts.push({t0: ta, t1: tb});
    }
  }
  var av = /** @type {any} */ (layer);
  if (depth > 0 && av.source instanceof CompItem && !av.timeRemapEnabled) {
    var inner = mcpCompActivity(av.source, depth - 1, cache);
    var k2 = av.stretch / 100;
    for (var j = 0; j < inner.length; j++) {
      var a = layer.startTime + inner[j].t0 * k2;
      var b = layer.startTime + inner[j].t1 * k2;
      acts.push({t0: Math.min(a, b), t1: Math.max(a, b)});
    }
  }
  return acts;
}

/**
 * Активность композиции целиком (объединение видимых слоёв), с кэшем по id.
 * @param {CompItem} comp
 * @param {number} depth
 * @param {Object} cache
 * @returns {Object[]}
 */
function mcpCompActivity(comp, depth, cache) {
  var key = comp.id + ":" + depth;
  if (cache[key]) return cache[key];
  var acts = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    var layer = comp.layer(i);
    if (!layer.enabled || /** @type {any} */ (layer).guideLayer || !layer.hasVideo) continue;
    var own = mcpLayerActivity(layer, depth, cache);
    for (var j = 0; j < own.length; j++) {
      var t0 = Math.max(own[j].t0, layer.inPoint);
      var t1 = Math.min(own[j].t1, layer.outPoint);
      if (t1 >= t0) acts.push({t0: t0, t1: t1});
    }
  }
  cache[key] = acts;
  return acts;
}

/**
 * Отрезки покоя длиннее limit внутри [from, to].
 * @param {Object[]} acts
 * @param {number} from
 * @param {number} to
 * @param {number} limit секунды
 * @returns {number[][]}
 */
function mcpStillGaps(acts, from, to, limit) {
  acts.sort(function (a, b) { return a.t0 - b.t0; });
  var gaps = [];
  var cursor = from;
  for (var i = 0; i < acts.length; i++) {
    var a = acts[i];
    if (a.t1 < from || a.t0 > to) continue;
    if (a.t0 - cursor > limit) gaps.push([cursor, a.t0]);
    if (a.t1 > cursor) cursor = a.t1;
  }
  if (to - cursor > limit) gaps.push([cursor, to]);
  return gaps;
}

/** @param {number} t @returns {number} */
function mcpRound(t) {
  return Math.round(t * 100) / 100;
}

var MCP_MOTION_PROPS = {
  "ADBE Position": "position", "ADBE Position_0": "x", "ADBE Position_1": "y", "ADBE Position_2": "z",
  "ADBE Scale": "scale", "ADBE Rotate Z": "rotation", "ADBE Rotate X": "rotationX", "ADBE Rotate Y": "rotationY",
  "ADBE Orientation": "orientation", "ADBE Anchor Point": "anchor"
};

/**
 * Свойства движения слоя с ключами.
 * @param {Layer} layer
 * @returns {any[]}
 */
function mcpMotionProps(layer) {
  var out = [];
  var tr = kbGroup(layer, ["ADBE Transform Group"]);
  for (var i = 1; i <= tr.numProperties; i++) {
    /** @type {any} */
    var p = tr.property(i);
    if (p && MCP_MOTION_PROPS[p.matchName] && p.numKeys > 1) out.push(p);
  }
  return out;
}

/**
 * Пики движения (смена направления) по ключам свойств движения слоя: {time, size}.
 * size — размах пика (сумма двух соседних изменений): удар больше антиципации, к слогу привязываем удар.
 * @param {Layer} layer
 * @returns {Object[]}
 */
function mcpAccentPeaks(layer) {
  var peaks = [];
  var props = mcpMotionProps(layer);
  for (var i = 0; i < props.length; i++) {
    var p = props[i];
    for (var k = 2; k < p.numKeys; k++) {
      var a = p.keyValue(k - 1);
      var b = p.keyValue(k);
      var c = p.keyValue(k + 1);
      var dot = 0;
      var size = 0;
      if (typeof a === "number") {
        dot = (b - a) * (c - b);
        size = Math.abs(b - a) + Math.abs(c - b);
      } else {
        var d1 = 0;
        var d2 = 0;
        for (var d = 0; d < a.length; d++) {
          dot += (b[d] - a[d]) * (c[d] - b[d]);
          d1 += (b[d] - a[d]) * (b[d] - a[d]);
          d2 += (c[d] - b[d]) * (c[d] - b[d]);
        }
        size = Math.sqrt(d1) + Math.sqrt(d2);
      }
      if (dot < 0) peaks.push({time: p.keyTime(k), size: size});
    }
  }
  return peaks;
}

/**
 * Опорные слова озвучки: маркеры слоёв «!имя» (их ставит kbAudioMarkers кита) в этой композиции или,
 * если здесь их нет, в родительских — со временем, пересчитанным во время этой композиции.
 * @param {CompItem} comp
 * @param {number} depth
 * @returns {Object[]} [{time, label, layer}]
 */
function mcpVoiceBeats(comp, depth) {
  var own = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    var layer = comp.layer(i);
    var markers = kbProp(layer, ["ADBE Marker"]);
    for (var k = 1; k <= markers.numKeys; k++) {
      var c = String(markers.keyValue(k).comment);
      if (c.charAt(0) === "!") own.push({time: markers.keyTime(k), label: c.substr(1), layer: layer.name});
    }
  }
  if (own.length || depth <= 0) return own;
  var mapped = [];
  for (var p = 1; p <= app.project.numItems; p++) {
    var parent = app.project.item(p);
    if (!(parent instanceof CompItem)) continue;
    for (var j = 1; j <= parent.numLayers; j++) {
      var l = /** @type {any} */ (parent.layer(j));
      if (l.source !== comp || l.timeRemapEnabled) continue;
      var up = mcpVoiceBeats(parent, depth - 1);
      for (var u = 0; u < up.length; u++) {
        if (up[u].time < l.inPoint || up[u].time > l.outPoint) continue;
        mapped.push({time: (up[u].time - l.startTime) * 100 / l.stretch, label: up[u].label, layer: parent.name + " / " + up[u].layer});
      }
    }
  }
  return mapped;
}

/**
 * Ударные слоги: args.beats, маркеры слоя args.beatLayer или маркеры композиции.
 * @param {CompItem} comp
 * @param {any} args
 * @returns {Object[]} [{time, label}]
 */
function mcpBeats(comp, args) {
  var beats = [];
  var i;
  if (args.beats) {
    for (i = 0; i < args.beats.length; i++) {
      var b = args.beats[i];
      beats.push(typeof b === "number" ? {time: b, label: ""} : {time: b.time, label: b.label || ""});
    }
    return beats;
  }
  var markers = args.beatLayer ? kbProp(mcpFindLayer(comp, args.beatLayer), ["ADBE Marker"]) : /** @type {any} */ (comp).markerProperty;
  if (args.beatLayer || args.useCompMarkers) {
    for (i = 1; i <= markers.numKeys; i++) beats.push({time: markers.keyTime(i), label: markers.keyValue(i).comment});
    return beats;
  }
  if (args.voiceBeats === false) return beats;
  return mcpVoiceBeats(comp, 4); // по умолчанию — опорные слова озвучки
}

/**
 * Персонаж: имя в args.characters или подходит под шаблон (по имени слоя или его прекомпа).
 * @param {Layer} layer
 * @param {any} args
 * @param {RegExp} pattern
 * @returns {boolean}
 */
function mcpIsCharacter(layer, args, pattern) {
  if (args.characters) {
    for (var i = 0; i < args.characters.length; i++) if (args.characters[i] === layer.name) return true;
    return false;
  }
  var source = /** @type {any} */ (layer).source;
  return pattern.test(layer.name) || (source instanceof CompItem && pattern.test(source.name));
}

/** @param {Layer} layer @returns {Layer} */
function mcpRootLayer(layer) {
  var l = layer;
  while (l.parent) l = l.parent;
  return l;
}

/**
 * Склейки композиции: моменты (в её времени), когда она появляется и уходит в родительских, с учётом вложенности.
 * @param {CompItem} comp
 * @param {number} depth
 * @returns {number[]}
 */
function mcpCutTimes(comp, depth) {
  var cuts = [];
  if (depth <= 0) return cuts;
  for (var i = 1; i <= app.project.numItems; i++) {
    var parent = app.project.item(i);
    if (!(parent instanceof CompItem)) continue;
    for (var j = 1; j <= parent.numLayers; j++) {
      var l = /** @type {any} */ (parent.layer(j));
      if (l.source !== comp || l.timeRemapEnabled) continue;
      var k = 100 / l.stretch;
      cuts.push((l.inPoint - l.startTime) * k, (l.outPoint - l.startTime) * k);
      var up = mcpCutTimes(parent, depth - 1);
      for (var u = 0; u < up.length; u++) {
        if (up[u] >= l.inPoint && up[u] <= l.outPoint) cuts.push((up[u] - l.startTime) * k);
      }
    }
  }
  return cuts;
}

/**
 * Слой в момент t за кадром (по позиции; размер слоя не учитывается — грубо, но входы из-за края ловит).
 * @param {Layer} layer
 * @param {number} t
 * @returns {boolean}
 */
function mcpOffscreen(layer, t) {
  var comp = layer.containingComp;
  var pos = kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).valueAtTime(t, false);
  return pos[0] < 0 || pos[1] < 0 || pos[0] > comp.width || pos[1] > comp.height;
}

MCP_TOOLS.audit_animation = {
  write: false,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var from = args.start || 0;
    var to = args.end === undefined ? comp.duration : args.end;
    var maxHold = (args.maxHold || 6) * MCP_F24;
    var depth = args.depth === undefined ? 3 : args.depth;
    var patternText = args.characterPattern || "char|hero|персонаж|герой";
    var pattern = new RegExp(patternText, "i");
    var issues = [];
    var counts = {linear: 0, hold: 0, accent: 0, entrance: 0, expression: 0};
    var characters = [];
    var cache = {};
    /**
     * @param {string} rule
     * @param {string} severity
     * @param {Object} data
     */
    var add = function (rule, severity, data) {
      counts[rule]++;
      data.rule = rule;
      data.severity = severity;
      issues.push(data);
    };

    var cuts = mcpCutTimes(comp, 4);
    var entries = [];
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      if (!layer.enabled || /** @type {any} */ (layer).guideLayer || layer.outPoint < from || layer.inPoint > to) continue;
      var isChar = layer.hasVideo && mcpIsCharacter(layer, args, pattern);
      if (isChar) characters.push(layer.name);

      // expression: ошибки во всех свойствах слоя
      var keyed = [];
      mcpKeyedProps(layer, keyed, 6);
      for (var e = 0; e < keyed.length; e++) {
        if (keyed[e].canSetExpression && keyed[e].expressionEnabled && keyed[e].expressionError) {
          add("expression", "error", {layer: layer.name, prop: keyed[e].name, message: keyed[e].expressionError,
            fix: "исправить выражение (get_layer покажет текст)"});
        }
      }

      // linear: движение без ease. Смотрим на старт из покоя и остановку в покой внутри цепочки линейных отрезков:
      //   ≥ 3 отрезков подряд — кривая, «запечённая» в значения (ease внутри значений) — не замечание;
      //   линейный старт/стоп на краю композиции или жизни слоя, на склейке, за кадром — вход/уход уже в движении — совет;
      //   линейный стык с ease-отрезком — не старт и не стоп.
      var motion = mcpMotionProps(layer);
      var near = 1.5 / comp.frameRate;
      /** @param {number} t @param {boolean} offscreen @returns {boolean} */
      var isEdge = function (t, offscreen) {
        if (Math.abs(t - layer.inPoint) < near || Math.abs(t - layer.outPoint) < near || Math.abs(t - from) < near || Math.abs(t - to) < near) return true;
        for (var ci = 0; ci < cuts.length; ci++) if (Math.abs(t - cuts[ci]) < near) return true;
        return offscreen;
      };
      for (var m = 0; m < motion.length; m++) {
        var p = motion[m];
        var spatial = p.matchName === "ADBE Position";
        var k = 1;
        while (k < p.numKeys) {
          if (p.keyOutInterpolationType(k) !== KeyframeInterpolationType.LINEAR || !mcpDiffers(p.keyValue(k), p.keyValue(k + 1))) {
            k++;
            continue;
          }
          var first = k;
          while (k < p.numKeys && p.keyOutInterpolationType(k) === KeyframeInterpolationType.LINEAR && mcpDiffers(p.keyValue(k), p.keyValue(k + 1))) k++;
          if (k - first >= 3) continue;
          var t0 = p.keyTime(first);
          var t1 = p.keyTime(k);
          var starts = first === 1 || !mcpDiffers(p.keyValue(first - 1), p.keyValue(first));
          var stops = k === p.numKeys || !mcpDiffers(p.keyValue(k), p.keyValue(k + 1));
          if (!starts && !stops) continue;
          var bad = (starts && !isEdge(t0, spatial && mcpOffscreen(layer, t0))) || (stops && !isEdge(t1, spatial && mcpOffscreen(layer, t1)));
          // Вложенный тернарный оператор ExtendScript разбирает неверно (проверено на 26.5) — только if.
          var what = "стоп в покой";
          if (starts && stops) what = "старт и остановка";
          else if (starts) what = "старт из покоя";
          var text = "линейный старт/стоп на склейке, краю или за кадром — нормально, если движение продолжается за кадром";
          if (bad) text = "линейный " + what + " без ease" + (isChar ? " у персонажа" : "");
          add("linear", bad ? "warning" : "info", {
            layer: layer.name, prop: MCP_MOTION_PROPS[p.matchName], from: mcpRound(t0), to: mcpRound(t1),
            message: text,
            fix: "ease на старт и остановку (пресеты snap/soft, easy ease)"
          });
        }
      }

      // hold: персонаж без микродвижения
      if (isChar) {
        var acts = mcpLayerActivity(layer, depth, cache);
        var gaps = mcpStillGaps(acts, Math.max(from, layer.inPoint), Math.min(to, layer.outPoint), maxHold);
        for (var g = 0; g < gaps.length; g++) {
          var frames = Math.round((gaps[g][1] - gaps[g][0]) * 24);
          add("hold", "warning", {
            layer: layer.name, from: mcpRound(gaps[g][0]), to: mcpRound(gaps[g][1]), frames24: frames,
            message: "мёртвый холд " + frames + " к. (при 24 fps) — статика дольше " + Math.round(maxHold * 24) + " к.",
            fix: "микродвижение: пресет breathe, моргание на смене мысли, лёгкий наклон головы"
          });
        }
      }

      // entrance: время входа слоя (середина композиции или проявление из нуля)
      if (layer.hasVideo && !(layer instanceof CameraLayer) && !/** @type {any} */ (layer).adjustmentLayer && !/** @type {any} */ (layer).nullLayer) {
        var enter = null;
        if (layer.inPoint > from + 0.01) enter = layer.inPoint;
        var op = kbProp(layer, ["ADBE Transform Group", "ADBE Opacity"]);
        if (op.numKeys > 0 && op.keyValue(1) === 0 && (enter === null || op.keyTime(1) > enter)) enter = op.keyTime(1);
        if (enter !== null && enter <= to) entries.push({time: enter, layer: layer.name, root: mcpRootLayer(layer).name});
      }
    }

    // entrance: несколько новых элементов разом. Одним элементом считаются: дети одного родителя, слои с общим
    // началом имени («ben-text» + «ben-plate», «end0-0» + «end0-1») и цепочка входов с шагом ≤ 2 кадров (строка по словам).
    entries.sort(function (a, b) { return a.time - b.time; });
    var window = 4 * MCP_F24;
    var stagger = 2.01 / comp.frameRate;
    /** @param {string} name @returns {string} */
    var stem = function (name) { return name.replace(/[-_ ][^-_ ]*$/, ""); };
    var used = {};
    for (var n = 0; n < entries.length; n++) {
      if (used[n]) continue;
      var group = [entries[n]];
      for (var q = n + 1; q < entries.length && entries[q].time - entries[n].time <= window; q++) {
        group.push(entries[q]);
        used[q] = true;
      }
      // единицы: по корню-родителю и основе имени; входы в одном кадре сливаются
      var units = [];
      for (var gi = 0; gi < group.length; gi++) {
        var en = group[gi];
        var unit = -1;
        for (var ui = 0; ui < units.length; ui++) {
          var un = units[ui];
          // ступенчатый вход строки (слова с шагом ≤ 2 к.) — тоже одна единица: сравниваем с последним в ней
          if (un.root === en.root || un.stem === stem(en.root) || Math.abs(un.last - en.time) <= stagger) unit = ui;
        }
        if (unit < 0) units.push({root: en.root, stem: stem(en.root), time: en.time, last: en.time, layers: [en.layer]});
        else { units[unit].layers.push(en.layer); units[unit].last = en.time; }
      }
      if (units.length > 1) {
        var names = [];
        for (var r = 0; r < units.length; r++) names.push(units[r].layers.join(" + "));
        add("entrance", "info", {
          time: mcpRound(entries[n].time), layers: names,
          message: units.length + " разных элемента входят в пределах 4 к. — внимание делится",
          fix: "один новый элемент за раз, следующий — после паузы (Глебас); или объединить родителем, если это одно целое"
        });
      }
    }

    // accent: пики движения к ударным слогам
    var beats = mcpBeats(comp, args);
    var fromVoice = !args.beats && !args.beatLayer && !args.useCompMarkers;
    var quietBeats = 0;
    if (beats.length) {
      var accentLayers = [];
      for (var al = 1; al <= comp.numLayers; al++) {
        var cand = comp.layer(al);
        if (!cand.enabled) continue;
        if (args.accentLayers) {
          for (var an = 0; an < args.accentLayers.length; an++) if (args.accentLayers[an] === cand.name) accentLayers.push(cand);
        } else if (mcpMotionProps(cand).length) {
          accentLayers.push(cand);
        }
      }
      for (var bi = 0; bi < beats.length; bi++) {
        var beat = beats[bi];
        var best = null;
        for (var li = 0; li < accentLayers.length; li++) {
          var peaks = mcpAccentPeaks(accentLayers[li]);
          for (var pi = 0; pi < peaks.length; pi++) {
            var lead = (beat.time - peaks[pi].time) * 24;
            if (lead < -6 || lead > 12) continue;
            // самый сильный пик в окне; при равных — ближе к идеальным 3 кадрам
            if (!best || peaks[pi].size > best.size * 1.01 ||
                (peaks[pi].size >= best.size * 0.99 && Math.abs(lead - 3) < Math.abs(best.lead - 3))) {
              best = {layer: accentLayers[li].name, time: peaks[pi].time, lead: lead, size: peaks[pi].size};
            }
          }
        }
        var where = {beat: mcpRound(beat.time), label: beat.label};
        if (!best) {
          // Опорные слова озвучки — отметки тайминга, не каждое требует акцента: без пика — только счёт.
          if (fromVoice) { quietBeats++; continue; }
          where.message = "на ударный слог нет пика движения в окне −12…+6 к.";
          where.fix = "акцент (пресет accent-punch) со стартом за 6–7 к. до слога — пик придёт за 2–4 к.";
          add("accent", "info", where);
        } else if (best.lead < 1) {
          where.layer = best.layer;
          where.peak = mcpRound(best.time);
          where.leadFrames24 = Math.round(best.lead * 10) / 10;
          where.message = best.lead <= -0.5 ? "акцент опаздывает за звуком на " + Math.round(-best.lead) + " к." : "акцент совпадает со звуком — глаз воспринимает его поздно";
          where.fix = "сдвинуть акцент раньше: пик на 2–4 к. до слога (Уильямс)";
          add("accent", "warning", where);
        } else if (best.lead > 6) {
          where.layer = best.layer;
          where.peak = mcpRound(best.time);
          where.leadFrames24 = Math.round(best.lead * 10) / 10;
          where.message = "акцент слишком рано: " + Math.round(best.lead) + " к. до слога";
          where.fix = "пик на 2–4 к. до слога";
          add("accent", "info", where);
        }
      }
    }

    var limit = args.limit || 60;
    var order = {error: 0, warning: 1, info: 2};
    issues.sort(function (a, b) { return order[a.severity] - order[b.severity]; });
    return {
      comp: mcpItemPath(comp),
      range: [mcpRound(from), mcpRound(to)],
      fps: comp.frameRate,
      characters: characters,
      beats: beats.length,
      beatsWithoutAccent: fromVoice ? quietBeats : undefined,
      beatsFrom: args.beats ? "beats" : (args.beatLayer ? "beatLayer" : (args.useCompMarkers ? "compMarkers" : "voice !-markers")),
      counts: counts,
      issues: issues.slice(0, limit),
      truncated: issues.length > limit ? issues.length - limit : 0,
      note: characters.length ? undefined : "Персонажи не найдены (шаблон " + patternText + ") — проверка холдов не шла; передайте characters: [имена слоёв]."
    };
  }
};
