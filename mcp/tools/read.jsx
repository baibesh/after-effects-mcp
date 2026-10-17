// Инструменты чтения: посмотреть проект перед тем, как что-то менять. Проект не трогают.

/**
 * @param {Layer} layer
 * @returns {string}
 */
function mcpLayerKind(layer) {
  if (layer instanceof TextLayer) return "text";
  if (layer instanceof ShapeLayer) return "shape";
  if (layer instanceof CameraLayer) return "camera";
  if (layer instanceof LightLayer) return "light";
  var av = /** @type {AVLayer} */ (layer);
  if (av.adjustmentLayer) return "adjustment";
  if (av.nullLayer) return "null";
  var source = av.source;
  if (source instanceof CompItem) return "precomp";
  if (source instanceof FootageItem) {
    if (source.mainSource instanceof SolidSource) return "solid";
    if (!source.hasVideo && source.hasAudio) return "audio";
    return source.mainSource.isStill ? "image" : "video";
  }
  return "layer";
}

/**
 * Значение свойства в виде, пригодном для JSON.
 * @param {Property} prop
 * @param {any} value
 * @returns {any}
 */
function mcpValue(prop, value) {
  var t = prop.propertyValueType;
  if (t === PropertyValueType.TEXT_DOCUMENT) {
    return {
      text: value.text,
      font: value.font,
      fontSize: value.fontSize,
      fillColor: value.applyFill ? value.fillColor : null,
      justification: String(value.justification)
    };
  }
  if (t === PropertyValueType.SHAPE) return "<path " + value.vertices.length + " вершин>";
  if (t === PropertyValueType.MARKER) return value.comment;
  if (t === PropertyValueType.NO_VALUE || t === PropertyValueType.CUSTOM_VALUE) return null;
  if (value instanceof Array) {
    var out = [];
    for (var i = 0; i < value.length; i++) out.push(Math.round(value[i] * 1000) / 1000);
    return out;
  }
  if (typeof value === "number") return Math.round(value * 1000) / 1000;
  return value;
}

/**
 * Эффекты слоя; у камеры и света их нет.
 * @param {Layer} layer
 * @returns {any}
 */
function mcpEffectParade(layer) {
  if (layer instanceof CameraLayer || layer instanceof LightLayer) return null;
  return kbGroup(layer, ["ADBE Effect Parade"]);
}

var MCP_INTERP = {};
MCP_INTERP[KeyframeInterpolationType.LINEAR] = "linear";
MCP_INTERP[KeyframeInterpolationType.BEZIER] = "bezier";
MCP_INTERP[KeyframeInterpolationType.HOLD] = "hold";

/**
 * @param {Property} prop
 * @returns {Object}
 */
function mcpDescribeProp(prop) {
  var d = {name: prop.name, matchName: prop.matchName};
  if (prop.propertyValueType !== PropertyValueType.NO_VALUE) {
    try { d.value = mcpValue(prop, prop.value); } catch (e) { d.value = null; }
  }
  if (prop.numKeys > 0) {
    var keys = [];
    for (var k = 1; k <= prop.numKeys; k++) {
      var key = {
        time: Math.round(prop.keyTime(k) * 1000) / 1000,
        value: mcpValue(prop, prop.keyValue(k)),
        interpIn: MCP_INTERP[prop.keyInInterpolationType(k)],
        interpOut: MCP_INTERP[prop.keyOutInterpolationType(k)]
      };
      if (prop.keyOutInterpolationType(k) === KeyframeInterpolationType.BEZIER) {
        var easeOut = prop.keyOutTemporalEase(k);
        var easeIn = prop.keyInTemporalEase(k);
        key.easeIn = Math.round(easeIn[0].influence);
        key.easeOut = Math.round(easeOut[0].influence);
      }
      keys.push(key);
    }
    d.keys = keys;
  }
  if (prop.canSetExpression && prop.expression) {
    d.expression = prop.expression;
    d.expressionEnabled = prop.expressionEnabled;
    if (prop.expressionError) d.expressionError = prop.expressionError;
  }
  return d;
}

/**
 * Свойства группы рекурсивно. onlyModified — пропускать нетронутые (по умолчанию для эффектов).
 * @param {PropertyGroup} group
 * @param {number} depth
 * @param {boolean} onlyModified
 * @returns {Object[]}
 */
function mcpDescribeGroup(group, depth, onlyModified) {
  var out = [];
  for (var i = 1; i <= group.numProperties; i++) {
    /** @type {any} */
    var p = group.property(i);
    if (!p || (p.isModified === false && onlyModified)) continue;
    // X/Y/Z Position существуют всегда, но действуют, только когда измерения разделены
    if (p.isSeparationFollower && !p.separationLeader.dimensionsSeparated) continue;
    if (p.propertyType === PropertyType.PROPERTY) {
      out.push(mcpDescribeProp(/** @type {Property} */ (p)));
    } else if (depth > 0) {
      var children = mcpDescribeGroup(/** @type {PropertyGroup} */ (p), depth - 1, onlyModified);
      if (children.length) out.push({name: p.name, matchName: p.matchName, properties: children});
    }
  }
  return out;
}

/**
 * Текстовые аниматоры: имя, свойства аниматора (что меняет, с ключами и выражениями) и селекторы.
 * @param {TextLayer} layer
 * @param {boolean} all
 * @returns {Object[]}
 */
function mcpTextAnimators(layer, all) {
  var out = [];
  var group = /** @type {PropertyGroup} */ (kbGroup(layer, ["ADBE Text Properties", "ADBE Text Animators"]));
  for (var i = 1; i <= group.numProperties; i++) {
    var an = /** @type {PropertyGroup} */ (group.property(i));
    var props = an.property("ADBE Text Animator Properties");
    var sels = /** @type {PropertyGroup} */ (an.property("ADBE Text Selectors"));
    var selectors = [];
    for (var s = 1; sels && s <= sels.numProperties; s++) {
      var sel = /** @type {PropertyGroup} */ (sels.property(s));
      selectors.push({name: sel.name, matchName: sel.matchName, properties: mcpDescribeGroup(sel, 1, !all)});
    }
    out.push({
      name: an.name,
      enabled: /** @type {any} */ (an).enabled,
      properties: props ? mcpDescribeGroup(/** @type {PropertyGroup} */ (props), 1, !all) : [],
      selectors: selectors
    });
  }
  return out;
}

/**
 * Маркеры слоя: время, комментарий, длительность, параметры.
 * @param {Layer} layer
 * @returns {Object[]}
 */
function mcpLayerMarkers(layer) {
  return mcpMarkerList(/** @type {Property} */ (kbProp(layer, ["ADBE Marker"])));
}

/**
 * @param {Property} markers свойство маркеров слоя или композиции
 * @returns {Object[]}
 */
function mcpMarkerList(markers) {
  var out = [];
  for (var i = 1; i <= markers.numKeys; i++) {
    var mv = /** @type {MarkerValue} */ (markers.keyValue(i));
    var m = {t: Math.round(markers.keyTime(i) * 1000) / 1000, comment: mv.comment};
    if (mv.duration) m.duration = Math.round(mv.duration * 1000) / 1000;
    var params = /** @type {any} */ (mv.getParameters());
    for (var k in params) { m.params = params; break; }
    out.push(m);
  }
  return out;
}

MCP_TOOLS.ae_status = {
  write: false,
  run: function () {
    var file = app.project.file;
    var active = app.project.activeItem;
    return {
      version: app.version,
      project: file ? file.fsName : null,
      dirty: /** @type {any} */ (app.project).dirty,
      items: app.project.numItems,
      bitsPerChannel: app.project.bitsPerChannel,
      linearBlending: app.project.linearBlending,
      activeComp: active instanceof CompItem ? mcpItemPath(active) : null,
      renderQueueItems: app.project.renderQueue.numItems
    };
  }
};

MCP_TOOLS.list_comps = {
  write: false,
  run: function () {
    var comps = [];
    for (var i = 1; i <= app.project.numItems; i++) {
      var c = app.project.item(i);
      if (!(c instanceof CompItem)) continue;
      comps.push({
        name: c.name,
        path: mcpItemPath(c),
        width: c.width,
        height: c.height,
        fps: Math.round(c.frameRate * 1000) / 1000,
        duration: Math.round(c.duration * 1000) / 1000,
        layers: c.numLayers
      });
    }
    return comps;
  }
};

MCP_TOOLS.list_layers = {
  write: false,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var layers = [];
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      var effects = [];
      var parade = mcpEffectParade(layer);
      for (var e = 1; parade && e <= parade.numProperties; e++) effects.push(parade.property(e).name);
      var info = {
        index: i,
        name: layer.name,
        kind: mcpLayerKind(layer),
        inPoint: Math.round(layer.inPoint * 1000) / 1000,
        outPoint: Math.round(layer.outPoint * 1000) / 1000,
        enabled: layer.enabled,
        parent: layer.parent ? layer.parent.name : null
      };
      if (effects.length) info.effects = effects;
      var av = /** @type {AVLayer} */ (layer);
      if (av.threeDLayer) info.threeD = true;
      if (av.source && av.source instanceof CompItem) info.source = mcpItemPath(av.source);
      if (av.hasTrackMatte) info.trackMatte = String(av.trackMatteType);
      layers.push(info);
    }
    var res = {
      comp: mcpItemPath(comp),
      width: comp.width,
      height: comp.height,
      fps: Math.round(comp.frameRate * 1000) / 1000,
      duration: Math.round(comp.duration * 1000) / 1000,
      layers: layers
    };
    var markers = mcpMarkerList(comp.markerProperty);
    if (markers.length) res.markers = markers; // маркеры композиции (sfx:…, сцены)
    return res;
  }
};

MCP_TOOLS.get_layer = {
  write: false,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var layer = mcpFindLayer(comp, args.layer);
    var all = args.all === true;
    var out = {
      comp: mcpItemPath(comp),
      name: layer.name,
      kind: mcpLayerKind(layer),
      inPoint: Math.round(layer.inPoint * 1000) / 1000,
      outPoint: Math.round(layer.outPoint * 1000) / 1000,
      startTime: Math.round(layer.startTime * 1000) / 1000,
      parent: layer.parent ? layer.parent.name : null,
      transform: mcpDescribeGroup(kbGroup(layer, ["ADBE Transform Group"]), 0, false)
    };
    if (layer instanceof TextLayer) {
      out.text = mcpDescribeProp(kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]));
      var animators = mcpTextAnimators(layer, all);
      if (animators.length) out.animators = animators;
    }
    var markers = mcpLayerMarkers(layer);
    if (markers.length) out.markers = markers;
    var parade = mcpEffectParade(layer);
    if (parade && parade.numProperties) {
      var effects = [];
      for (var e = 1; e <= parade.numProperties; e++) {
        /** @type {any} */
        var fx = parade.property(e);
        effects.push({name: fx.name, matchName: fx.matchName, enabled: fx.enabled, properties: mcpDescribeGroup(fx, 2, !all)});
      }
      out.effects = effects;
    }
    if (layer instanceof ShapeLayer) {
      out.contents = mcpDescribeGroup(kbGroup(layer, ["ADBE Root Vectors Group"]), args.depth || 3, !all);
    }
    return out;
  }
};
