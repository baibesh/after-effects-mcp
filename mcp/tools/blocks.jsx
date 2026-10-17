// Блоки и урок (kit/blocks.jsx, kit/lesson-build.jsx): сервер передаёт готовый стиль и описание блока.

MCP_TOOLS.build_block = {
  write: true,
  run: function (args) {
    var b = kbBlock(args.style, args.item, args.data, { format: args.format, index: args.index, audience: args.audience, name: args.name });
    return { comp: b.comp.name, type: b.type, format: args.format || "9x16", duration: b.duration, beats: b.beats, style: args.style.id };
  }
};

MCP_TOOLS.build_lesson = {
  write: true,
  run: function (args) {
    var res = kbBuildLesson(args.style, args.lesson, { transitions: args.transitions });
    var out = [];
    for (var i = 0; i < res.masters.length; i++) {
      var m = res.masters[i];
      out.push({ comp: m.comp.name, format: m.format, duration: Math.round(m.duration * 1000) / 1000, timeline: m.timeline });
    }
    return { lesson: args.lesson.id, style: args.style.id, masters: out };
  }
};
