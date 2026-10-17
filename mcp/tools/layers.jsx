// Слои: создать (текст, фигура, заливка, корректирующий, null, картинка/видео/звук), изменить, удалить.
// Текст — через kbText кита (якорь в центре блока), импорт — kbImport. Имена слоёв уникальны в композиции:
// по ним слои потом находят все инструменты.

/**
 * @param {CompItem} comp
 * @param {string} name
 */
function mcpCheckNewName(comp, name) {
  if (!name) throw new Error("Не указано имя слоя");
  for (var i = 1; i <= comp.numLayers; i++) {
    if (comp.layer(i).name === name) throw new Error("В «" + comp.name + "» уже есть слой «" + name + "» — имена должны быть уникальны");
  }
}

/**
 * Время жизни слоя: start — появление, end — исчезновение (секунды композиции).
 * @param {Layer} layer
 * @param {any} args
 */
function mcpApplyTiming(layer, args) {
  if (args.start !== undefined) {
    var length = layer.outPoint - layer.inPoint;
    layer.startTime += args.start - layer.inPoint;
    if (args.end === undefined) layer.outPoint = Math.min(layer.containingComp.duration, args.start + length);
  }
  if (args.end !== undefined) layer.outPoint = args.end;
}

var MCP_BLEND = {
  normal: BlendingMode.NORMAL,
  multiply: BlendingMode.MULTIPLY,
  screen: BlendingMode.SCREEN,
  overlay: BlendingMode.OVERLAY,
  add: BlendingMode.ADD,
  softLight: BlendingMode.SOFT_LIGHT,
  hardLight: BlendingMode.HARD_LIGHT,
  darken: BlendingMode.DARKEN,
  lighten: BlendingMode.LIGHTEN,
  colorBurn: BlendingMode.COLOR_BURN,
  colorDodge: BlendingMode.COLOR_DODGE,
  difference: BlendingMode.DIFFERENCE,
  color: BlendingMode.COLOR,
  luminosity: BlendingMode.LUMINOSITY
};

/**
 * Трансформ, время, родитель, наложение, порядок, видимость — всё, что передано.
 * @param {CompItem} comp
 * @param {Layer} layer
 * @param {any} args
 */
function mcpApplyLayerProps(comp, layer, args) {
  var tr = ["ADBE Transform Group"];
  if (args.anchor) kbProp(layer, tr.concat(["ADBE Anchor Point"])).setValue(args.anchor);
  if (args.position) kbProp(layer, tr.concat(["ADBE Position"])).setValue(args.position);
  if (args.scale !== undefined) {
    var s = args.scale instanceof Array ? args.scale : [args.scale, args.scale];
    kbProp(layer, tr.concat(["ADBE Scale"])).setValue(s);
  }
  if (args.rotation !== undefined) kbProp(layer, tr.concat(["ADBE Rotate Z"])).setValue(args.rotation);
  if (args.opacity !== undefined) kbProp(layer, tr.concat(["ADBE Opacity"])).setValue(args.opacity);
  mcpApplyTiming(layer, args);
  if (args.parent !== undefined) layer.parent = args.parent === null ? null : mcpFindLayer(comp, args.parent);
  if (args.blend) {
    if (!MCP_BLEND[args.blend]) throw new Error("Нет режима наложения «" + args.blend + "». Есть: normal, multiply, screen, overlay, add, softLight, …");
    /** @type {AVLayer} */ (layer).blendingMode = MCP_BLEND[args.blend];
  }
  if (args.enabled !== undefined) layer.enabled = args.enabled;
  if (args.moveTo) {
    var to = args.moveTo;
    if (to === "top") layer.moveToBeginning();
    else if (to === "bottom") layer.moveToEnd();
    else if (to.above) layer.moveBefore(mcpFindLayer(comp, to.above));
    else if (to.below) layer.moveAfter(mcpFindLayer(comp, to.below));
  }
}

/** @param {Layer} layer */
function mcpLayerSummary(layer) {
  var tr = ["ADBE Transform Group"];
  return {
    name: layer.name,
    index: layer.index,
    position: kbProp(layer, tr.concat(["ADBE Position"])).value,
    inPoint: Math.round(layer.inPoint * 1000) / 1000,
    outPoint: Math.round(layer.outPoint * 1000) / 1000
  };
}

MCP_TOOLS.add_text = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var name = args.name || String(args.text).substr(0, 30);
    mcpCheckNewName(comp, name);
    var font = KB_FONT[args.font] || args.font || KB_FONT.bold;
    // AE молча подставляет другой шрифт и при этом возвращает запрошенное имя — проверяем до создания.
    // На неизвестное имя AE отдаёт шрифт-заменитель (isSubstitute), а не пустой список.
    var found = app.fonts.getFontsByPostScriptName(font);
    var real = false;
    for (var f = 0; found && f < found.length; f++) if (!found[f].isSubstitute) real = true;
    if (!real) {
      var keys = [];
      for (var key in KB_FONT) if (KB_FONT.hasOwnProperty(key)) keys.push(key + " = " + KB_FONT[key]);
      throw new Error("Шрифта «" + font + "» нет в системе. Шрифты проекта: " + keys.join(", ") + ". Или PostScript-имя установленного шрифта.");
    }
    var layer = kbText(comp, {
      text: String(args.text).replace(/\n/g, "\r"),
      font: font,
      size: args.size || 80,
      color: args.color || [0.067, 0.067, 0.067],
      x: args.position ? args.position[0] : comp.width / 2,
      y: args.position ? args.position[1] : comp.height / 2,
      tracking: args.tracking,
      leading: args.leading
    });
    layer.name = name;
    if (args.justify && args.justify !== "center") {
      var source = kbProp(layer, ["ADBE Text Properties", "ADBE Text Document"]);
      var doc = source.value;
      doc.justification = args.justify === "left" ? ParagraphJustification.LEFT_JUSTIFY : ParagraphJustification.RIGHT_JUSTIFY;
      source.setValue(doc);
    }
    mcpApplyLayerProps(comp, layer, {start: args.start, end: args.end});
    var out = mcpLayerSummary(layer);
    out.font = font;
    return out;
  }
};

MCP_TOOLS.add_shape = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    mcpCheckNewName(comp, args.name);
    var layer = comp.layers.addShape();
    layer.name = args.name;
    var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
    group.name = args.name;
    var contents = kbGroup(group, ["ADBE Vectors Group"]);
    var size = args.size || [400, 400];
    if (args.shape === "ellipse") {
      kbProp(kbAdd(contents, "ADBE Vector Shape - Ellipse"), ["ADBE Vector Ellipse Size"]).setValue(size);
    } else {
      var rect = kbAdd(contents, "ADBE Vector Shape - Rect");
      kbProp(rect, ["ADBE Vector Rect Size"]).setValue(size);
      if (args.radius) kbProp(rect, ["ADBE Vector Rect Roundness"]).setValue(args.radius);
    }
    if (args.stroke) {
      var stroke = kbAdd(contents, "ADBE Vector Graphic - Stroke");
      kbProp(stroke, ["ADBE Vector Stroke Color"]).setValue(args.stroke.color);
      kbProp(stroke, ["ADBE Vector Stroke Width"]).setValue(args.stroke.width || 4);
    }
    if (args.fill !== null) {
      var fill = kbAdd(contents, "ADBE Vector Graphic - Fill");
      kbProp(fill, ["ADBE Vector Fill Color"]).setValue(args.fill || [0.722, 0.463, 0.165]);
    }
    // Фигура нарисована вокруг (0, 0) слоя: якорь — в центре, позиция — центр фигуры.
    kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
    kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue(args.position || [comp.width / 2, comp.height / 2]);
    mcpApplyLayerProps(comp, layer, {start: args.start, end: args.end});
    return mcpLayerSummary(layer);
  }
};

MCP_TOOLS.add_solid = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    mcpCheckNewName(comp, args.name);
    var size = args.size || [comp.width, comp.height];
    var layer = comp.layers.addSolid(args.color || [1, 1, 1], args.name, size[0], size[1], comp.pixelAspect);
    if (args.adjustment) layer.adjustmentLayer = true;
    if (args.position) kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue(args.position);
    mcpApplyLayerProps(comp, layer, {start: args.start, end: args.end, moveTo: args.adjustment ? undefined : args.moveTo});
    var out = mcpLayerSummary(layer);
    out.adjustment = layer.adjustmentLayer;
    return out;
  }
};

MCP_TOOLS.add_null = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    mcpCheckNewName(comp, args.name);
    var layer = comp.layers.addNull();
    layer.name = args.name;
    // Якорь null — левый верхний угол квадрата 100×100: ставим в центр, чтобы дети вращались вокруг позиции.
    kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([50, 50]);
    kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue(args.position || [comp.width / 2, comp.height / 2]);
    mcpApplyLayerProps(comp, layer, {start: args.start, end: args.end});
    return mcpLayerSummary(layer);
  }
};

MCP_TOOLS.add_footage = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var file = new File(args.file);
    if (!file.exists) throw new Error("Нет файла " + args.file);
    var name = args.name || file.displayName.replace(/\.[^.]+$/, "");
    mcpCheckNewName(comp, name);

    var item = kbImport(file.fsName); // уже импортированный файл переиспользуется
    var layer = comp.layers.add(item);
    layer.name = name;

    if (item.hasVideo) {
      var fit = args.fit || "none";
      var k = 1;
      if (fit === "contain") k = Math.min(comp.width / item.width, comp.height / item.height);
      if (fit === "cover") k = Math.max(comp.width / item.width, comp.height / item.height);
      if (typeof fit === "number") k = fit / item.width; // ширина на экране, px
      kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]).setValue([k * 100, k * 100]);
      kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue(args.position || [comp.width / 2, comp.height / 2]);
    }
    mcpApplyLayerProps(comp, layer, {start: args.start, end: args.end, blend: args.blend});
    var out = mcpLayerSummary(layer);
    out.source = item.name;
    out.size = item.hasVideo ? [item.width, item.height] : null;
    out.duration = Math.round(item.duration * 1000) / 1000;
    return out;
  }
};

MCP_TOOLS.set_layer = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var layer = mcpFindLayer(comp, args.layer);
    if (args.name && args.name !== layer.name) {
      mcpCheckNewName(comp, args.name);
      layer.name = args.name;
    }
    mcpApplyLayerProps(comp, layer, args);
    return mcpLayerSummary(layer);
  }
};

MCP_TOOLS.delete_layer = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var layer = mcpFindLayer(comp, args.layer);
    var name = layer.name;
    var dropped = kbSfxDropLayer(layer); // метки sfx движений этого слоя (kb-sfx-src), иначе kbSfxFromMarkers даст призрачные звуки
    layer.remove();
    var sfx = [];
    for (var i = dropped.length - 1; i >= 0; i--) sfx.push({kind: dropped[i].kind, t: Math.round(dropped[i].t * 1000) / 1000, strength: dropped[i].strength});
    return {deleted: name, layers: comp.numLayers, sfxRemoved: sfx};
  }
};

MCP_TOOLS.add_text_plate = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var text = mcpFindLayer(comp, args.text);
    if (!(text instanceof TextLayer)) throw new Error("«" + text.name + "» — не текстовый слой");
    var name = args.name || text.name + " plate";
    mcpCheckNewName(comp, name);
    var pad = args.padding || [36, 18];
    var minW = args.minWidth || 0;

    var layer = comp.layers.addShape();
    layer.name = name;
    var group = kbAdd(kbGroup(layer, ["ADBE Root Vectors Group"]), "ADBE Vector Group");
    group.name = "plate";
    var contents = kbGroup(group, ["ADBE Vectors Group"]);
    var rect = kbAdd(contents, "ADBE Vector Shape - Rect");
    if (args.radius) kbProp(rect, ["ADBE Vector Rect Roundness"]).setValue(args.radius);
    if (args.stroke) {
      var stroke = kbAdd(contents, "ADBE Vector Graphic - Stroke");
      kbProp(stroke, ["ADBE Vector Stroke Color"]).setValue(args.stroke.color);
      kbProp(stroke, ["ADBE Vector Stroke Width"]).setValue(args.stroke.width || 4);
    }
    if (args.fill !== null) {
      var fill = kbAdd(contents, "ADBE Vector Graphic - Fill");
      kbProp(fill, ["ADBE Vector Fill Color"]).setValue(args.fill || [0.184, 0.427, 0.71]);
    }

    // Добавление в группу делает недействительными прежние ссылки на её свойства — прямоугольник берём заново.
    rect = kbGroup(contents, ["ADBE Vector Shape - Rect"]);

    // Плашка — ребёнок текста: координаты — пространство слоя текста, где sourceRectAtTime и живёт;
    // движение, масштаб и поворот текста (пресеты, акценты) плашка получает от родителя.
    var ref = "thisComp.layer(" + mcpQuote(text.name) + ")";
    kbProp(rect, ["ADBE Vector Rect Size"]).expression =
      "var r = " + ref + ".sourceRectAtTime(time, false);\n" +
      "[Math.max(r.width + " + pad[0] * 2 + ", " + minW + "), r.height + " + pad[1] * 2 + "]";
    layer.parent = text;
    var tr = ["ADBE Transform Group"];
    kbProp(layer, tr.concat(["ADBE Anchor Point"])).setValue([0, 0]);
    kbProp(layer, tr.concat(["ADBE Position"])).expression =
      "var r = " + ref + ".sourceRectAtTime(time, false);\n" +
      "[r.left + r.width / 2, r.top + r.height / 2]";
    kbProp(layer, tr.concat(["ADBE Scale"])).setValue([100, 100]);
    kbProp(layer, tr.concat(["ADBE Rotate Z"])).setValue(0);
    // Прозрачность не наследуется от родителя — повторяем текст.
    kbProp(layer, tr.concat(["ADBE Opacity"])).expression = "value * " + ref + ".transform.opacity / 100";
    layer.inPoint = text.inPoint;
    layer.outPoint = text.outPoint;
    layer.moveAfter(text);

    var r0 = text.sourceRectAtTime(Math.max(text.inPoint, 0), false);
    return {
      name: name,
      text: text.name,
      size: [Math.round(Math.max(r0.width + pad[0] * 2, minW)), Math.round(r0.height + pad[1] * 2)],
      index: layer.index,
      note: "размер, положение и прозрачность — выражения от текста; менять текст можно set_text"
    };
  }
};
