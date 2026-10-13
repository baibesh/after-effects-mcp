// Эффекты: добавить (matchName — его находит сервер по словарю tools/data), настроить параметры, включить,
// удалить, переставить. Параметры — по matchName («ADBE Gaussian Blur 2-0001») или по имени («Blurriness»,
// английский интерфейс AE); цвет [r, g, b] дополняется альфой.

/**
 * Параметр эффекта по matchName или имени (без учёта регистра), включая вложенные группы.
 * @param {any} fx
 * @param {string} key
 * @returns {any}
 */
function mcpEffectParam(fx, key) {
  var lower = String(key).toLowerCase();
  /** @param {any} group @returns {any} */
  var search = function (group) {
    for (var i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      if (!p) continue;
      if (p.matchName === key || String(p.name).toLowerCase() === lower) {
        if (p.propertyType === PropertyType.PROPERTY) return p;
      }
      if (p.propertyType !== PropertyType.PROPERTY && p.matchName !== "ADBE Effect Built In Params") { // ae-ok: matchname — группа Compositing Options (есть в effect-params-names.json)
        var inner = search(p);
        if (inner) return inner;
      }
    }
    return null;
  };
  var found = search(fx);
  if (!found) {
    var names = [];
    for (var j = 1; j <= fx.numProperties; j++) {
      var q = fx.property(j);
      if (q && q.propertyType === PropertyType.PROPERTY && q.propertyValueType !== PropertyValueType.NO_VALUE) names.push(q.name);
    }
    throw new Error("У «" + fx.name + "» нет параметра «" + key + "». Есть: " + names.join(", "));
  }
  return found;
}

/**
 * @param {any} fx
 * @param {Object} params {имя или matchName: значение}
 * @returns {string[]} что выставлено
 */
function mcpSetEffectParams(fx, params) {
  var done = [];
  for (var key in params) {
    if (!params.hasOwnProperty(key)) continue;
    var p = mcpEffectParam(fx, key);
    var v = params[key];
    if (p.propertyValueType === PropertyValueType.COLOR && v instanceof Array && v.length === 3) v = [v[0], v[1], v[2], 1];
    if (p.numKeys > 0) throw new Error("У «" + fx.name + " → " + p.name + "» есть ключи — менять через edit_keys, prop: [\"Effects\", \"" + fx.name + "\", \"" + p.name + "\"]");
    p.setValue(v);
    done.push(p.name);
  }
  return done;
}

/**
 * @param {Layer} layer
 * @param {string} name имя эффекта на слое
 * @returns {any}
 */
function mcpFindEffect(layer, name) {
  var parade = mcpEffectParade(layer);
  var names = [];
  for (var i = 1; parade && i <= parade.numProperties; i++) {
    if (parade.property(i).name === name) return parade.property(i);
    names.push(parade.property(i).name);
  }
  throw new Error("На «" + layer.name + "» нет эффекта «" + name + "». Есть: " + (names.length ? names.join(", ") : "ни одного"));
}

/** @param {any} fx @returns {Object} */
function mcpEffectSummary(fx) {
  return {name: fx.name, matchName: fx.matchName, enabled: fx.enabled, index: fx.propertyIndex, params: mcpDescribeGroup(fx, 1, true)};
}

MCP_TOOLS.add_effect = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var layer = mcpFindLayer(comp, args.layer);
    var parade = mcpEffectParade(layer);
    if (!parade) throw new Error("У «" + layer.name + "» эффектов не бывает (камера/свет)");
    if (args.name) {
      for (var i = 1; i <= parade.numProperties; i++) {
        if (parade.property(i).name === args.name) throw new Error("На «" + layer.name + "» уже есть эффект «" + args.name + "»");
      }
    }
    var fx = kbEffect(layer, args.matchName);
    if (args.name) fx.name = args.name;
    var set = args.params ? mcpSetEffectParams(fx, args.params) : [];
    var out = mcpEffectSummary(fx);
    out.layer = layer.name;
    out.set = set;
    out.projectBits = app.project.bitsPerChannel;
    return out;
  }
};

MCP_TOOLS.set_effect = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var layer = mcpFindLayer(comp, args.layer);
    var fx = mcpFindEffect(layer, args.effect);
    if (args.remove) {
      fx.remove();
      return {layer: layer.name, removed: args.effect};
    }
    var set = args.params ? mcpSetEffectParams(fx, args.params) : [];
    if (args.enabled !== undefined) fx.enabled = args.enabled;
    if (args.rename) fx.name = args.rename;
    if (args.index) fx.moveTo(args.index);
    var out = mcpEffectSummary(fx);
    out.layer = layer.name;
    out.set = set;
    return out;
  }
};
