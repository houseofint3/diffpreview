// md-worker.js
'use strict';

// Extracts ```diff ...``` or ~~~diff ...~~~ blocks and returns the concatenated diff
self.onmessage = function (e) {
  var id = e.data && e.data.id;
  var content = (e.data && e.data.content) || '';

  try {
    var blocks = [];
    var reTicks = /```[ \t]*diff[^\n]*\n([\s\S]*?)\n```/gi;
    var reTildes = /~~~[ \t]*diff[^\n]*\n([\s\S]*?)\n~~~/gi;

    var m;
    while ((m = reTicks.exec(content)) !== null) blocks.push(m[1]);
    while ((m = reTildes.exec(content)) !== null) blocks.push(m[1]);

    var diffText = blocks.join('\n\n');
    self.postMessage({ id: id, diff: diffText, hasDiff: blocks.length > 0 });
  } catch (err) {
    self.postMessage({ id: id, error: err && err.message ? err.message : String(err) });
  }
};
