// Фоны и картинки в стиле серии (kit/visual.jsx): сервер передаёт готовый стиль.

MCP_TOOLS.add_background = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var res = kbBackground(args.style, comp, args.id, { start: args.start, params: args.params });
    return { id: res.id, layers: res.layers, style: args.style.id };
  }
};

MCP_TOOLS.add_image = {
  write: true,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var res = kbImage(args.style, comp, args.file, {
      box: args.box, mask: args.mask, fit: args.fit, focus: args.focus, grade: args.grade,
      start: args.start, hold: args.hold, reveal: args.reveal, kenBurns: args.kenBurns, name: args.name
    });
    var out = { image: res.image.name, layers: res.layers, mask: res.mask, scale: Math.round(res.scale * 10000) / 10000, start: res.start, end: Math.round(res.end * 1000) / 1000, style: args.style.id };
    if (args.zoom) {
      var z = kbImageZoom(args.style, res, args.zoom.focus, args.zoom.start, { scale: args.zoom.scale });
      out.zoom = { start: z.start, end: Math.round(z.end * 1000) / 1000, point: z.point };
    }
    // Запас разрешения: наезд/зум выше 100 % исходника мылит картинку.
    var maxScale = res.scale * (args.zoom ? (args.zoom.scale || 200) / 100 : 1.1);
    if (maxScale > 1) out.warning = "картинка растянута до " + Math.round(maxScale * 100) + " % исходника — нужен исходник крупнее (запас ×1,5)";
    return out;
  }
};
