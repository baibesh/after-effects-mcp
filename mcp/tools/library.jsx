// Библиотека примитивов (kit/library.jsx): сервер передаёт готовый стиль (после extends) и сам примитив.

/**
 * Слой или точка: [x, y] как есть, строка — слой композиции.
 * @param {CompItem} comp
 * @param {any} v
 * @returns {any}
 */
function mcpLibRef(comp, v) {
  if (v === undefined || v === null || v instanceof Array) return v;
  return mcpFindLayer(comp, String(v));
}

MCP_TOOLS.apply_library = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var layer = args.layer ? mcpFindLayer(comp, args.layer) : null;
    var opts = { comp: comp, start: args.start, dur: args.dur, params: args.params, index: args.index, name: args.name };
    if (args.from !== undefined) opts.from = mcpLibRef(comp, args.from);
    if (args.to !== undefined) opts.to = mcpLibRef(comp, args.to);
    if (args.others) {
      opts.others = [];
      for (var i = 0; i < args.others.length; i++) opts.others.push(mcpFindLayer(comp, args.others[i]));
    }
    var res = kbLib(args.style, args.item, layer, opts);
    res.style = args.style.id;
    res.start = Math.round(res.start * 1000) / 1000;
    res.end = Math.round(res.end * 1000) / 1000;
    return res;
  }
};
