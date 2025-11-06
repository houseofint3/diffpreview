(function () {
  // ------------- Worker + perf helpers -------------
  var mdWorker = null;
  var BIG_DIFF_BYTES = 500000; // ~0.5MB
  var BIG_DIFF_LINES = 8000;
  var uiShown = false;

  function initMdWorker() {
    if (typeof Worker === 'undefined') return;
    try {
      mdWorker = new Worker('md-worker.js');
      mdWorker.onmessage = function (e) {
        var data = e.data || {};
        if (data.error) {
          showError('Markdown worker error: ' + data.error);
          return;
        }
        var diffText = data.diff || '';
        renderDiffString(diffText);
      };
    } catch (err) {
      console.warn('Failed to start md-worker:', err);
      mdWorker = null;
    }
  }
  initMdWorker();

  function isBig(diffText) {
    if (!diffText) return false;
    var approxBytes = diffText.length;
    var lines = (diffText.match(/\n/g) || []).length + 1;
    return approxBytes > BIG_DIFF_BYTES || lines > BIG_DIFF_LINES;
  }

  function renderDiffString(diffString) {
    var targetElement = document.getElementById('myDiffElement');

    if (!diffString || !diffString.trim()) {
      targetElement.innerHTML = '<div class="alert alert-info">No diff blocks found.</div>';
      return;
    }

    var big = isBig(diffString);
    var configuration = {
      drawFileList: true,
      fileListToggle: true,
      fileListStartVisible: true,
      fileContentToggle: true,
      matching: big ? 'none' : 'lines',
      outputFormat: big ? 'line-by-line' : 'side-by-side',
      synchronisedScroll: !big,
      highlight: !big,
      renderNothingWhenEmpty: false,
      diffStyle: big ? 'word' : 'char',
      rawTemplates: { "tag-file-changed": '<span class="d2h-tag d2h-changed d2h-changed-tag">MODIFIED</span>' }
    };

    if (big) {
      var hint = document.createElement('div');
      hint.className = 'alert alert-warning';
      hint.innerHTML = 'Large diff detected. Using simplified rendering for performance.';
      targetElement.before(hint);
    }

    // Yield to not block UI
    setTimeout(function () {
      var diff2htmlUi = new Diff2HtmlUI(targetElement, diffString, configuration);
      diff2htmlUi.draw();

      if (!big) {
        // Optional tweaks similar to your original code
        const files = diff2htmlUi.targetElement.querySelectorAll('.d2h-file-wrapper');
        files.forEach(file => {
          file.setAttribute('data-lang', 'c');
        });

        const ins = diff2htmlUi.targetElement.querySelectorAll('.d2h-ins.d2h-change:not(.d2h-code-side-linenumber)');
        ins.forEach(elem => { elem.className = 'd2h-change'; });

        const dels = diff2htmlUi.targetElement.querySelectorAll('.d2h-del.d2h-change:not(.d2h-code-side-linenumber)');
        dels.forEach(elem => { elem.className = 'd2h-change'; });

        diff2htmlUi.highlightCode();
      }
    }, 0);
  }

  function looksLikeDiff(text) {
    return /^diff\s--git/m.test(text) || /^@@/m.test(text);
  }

  function looksLikeMarkdown(text) {
    return /(^|\n)\s{0,3}#{1,6}\s/.test(text) // headings
      || /(^|\n)[>\-*+]\s/.test(text)        // blockquote/list
      || /```/.test(text);                   // code fences
  }

  function escapeHtml(text) {
    return (text || '').replace(/[&<>"']/g, function (m) {
      switch (m) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return m;
      }
    });
  }

  // ----------------- UI helpers -----------------
  function showMainPage() {
    if (uiShown) return;
    uiShown = true;
    document.getElementById('main').className = 'container';
    document.getElementById('loading').className += ' hide';
    document.getElementById('files').className = 'container';
    document.getElementById('gist_details').className = 'container';
  }

  function showError(message) {
    document.getElementById('alert-box').innerHTML
      += '<div class="alert alert-danger">'
      + '<a href="#" class="close" data-dismiss="alert" aria-label="close">&times;</a>'
      + message
      + '</div>';
  }

  function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
  }

  function addGistDetails(info) {
    var html = `<h4>Gist Details:</h4><ul>`
    var print_keys = ['html_url', 'description', 'id', 'created_at', 'updated_at']
    for (var item in info) {
      if (print_keys.includes(item)) {
        var line;
        if (item.includes('url')) {
          line = `<li>${item} : <a href="${info[item]}" target="_blank" rel="noopener">${info[item]}</a> </li><br>`;
        } else {
          line = `<li>${item} : ${info[item]} </li><br>`;
        }
        html += line;
      }
    }
    document.getElementById('gist_details').innerHTML = html;
  }

  function addFilesToList(info) {
    var query = document.getElementById('gist_id').value;
    var files = info.files;
    var html = `<h4>Files from Gist: <span class="badge">${Object.keys(files).length}</span></h4><ul>`
    for (var file in info.files) {
      var raw_url = files[file]['raw_url']
      let line = `<li><a  target="_blank" rel="noopener" href="?${query}/${file}">${file}</a> (${formatBytes(parseInt(files[file].size / 1024))}) [<a href="${raw_url}">raw_gist</a>] </li><br>`;
      html += line;
    }
    html += '</ul>'
    document.getElementById('files').innerHTML = html;
  }

  function submit() {
    var query = document.getElementById('gist_id').value;
    var fileName = document.getElementById('file_name').value;
    if (fileName) {
      query += '/' + fileName;
    }
    location.search = query;  // page will be refreshed
  }

  async function fetchUrl(raw_url) {
    const response = await fetch(raw_url);
    return response;
  }

  function processContent(content, fileName) {
    var targetElement = document.getElementById('myDiffElement');
    targetElement.innerHTML = '<div class="alert alert-info">Rendering...</div>';

    var ext = (fileName.split('.').pop() || '').toLowerCase();

    // Heuristic override for .txt or unknown extensions
    if (ext === 'txt' || !['diff', 'md', 'html'].includes(ext)) {
      if (looksLikeDiff(content)) ext = 'diff';
      else if (looksLikeMarkdown(content)) ext = 'md';
    }

    try {
      switch (ext) {
        case 'diff': {
          var configuration = {
            drawFileList: true,
            fileListToggle: true,
            fileListStartVisible: true,
            fileContentToggle: true,
            matching: 'lines',
            outputFormat: 'side-by-side',
            synchronisedScroll: true,
            highlight: true,
            renderNothingWhenEmpty: false,
            diffStyle: 'char',
            rawTemplates: { "tag-file-changed": '<span class="d2h-tag d2h-changed d2h-changed-tag">MODIFIED</span>' }
          };
          setTimeout(function () {
            var diff2htmlUi = new Diff2HtmlUI(targetElement, content, configuration);
            diff2htmlUi.draw();
            diff2htmlUi.highlightCode();
          }, 0);
          break;
        }

        case 'md': {
          // Use worker to extract ```diff``` blocks
          if (mdWorker) {
            mdWorker.postMessage({ id: 'md_' + Date.now(), content: content });
          } else {
            // Fallback: quick extraction on main thread
            var reTicks = /```[ \t]*diff[^\n]*\n([\s\S]*?)\n```/gi;
            var reTildes = /~~~[ \t]*diff[^\n]*\n([\s\S]*?)\n~~~/gi;
            var blocks = [], m;
            while ((m = reTicks.exec(content)) !== null) blocks.push(m[1]);
            while ((m = reTildes.exec(content)) !== null) blocks.push(m[1]);
            renderDiffString(blocks.join('\n\n'));
          }
          break;
        }

        case 'html': {
          targetElement.innerHTML = content;
          break;
        }

        default: {
          // Plain text fallback
          targetElement.innerHTML = '<pre style="white-space:pre-wrap">' + escapeHtml(content) + '</pre>';
          break;
        }
      }
    } catch (err) {
      showError('Render error: ' + (err && err.message ? err.message : String(err)));
      targetElement.innerHTML = '<div class="alert alert-danger">Failed to render content.</div>';
    }
  }

  document.getElementById('submit').onclick = submit;
  document.onkeypress = function (e) {
    if (e.keyCode === 13) submit();
  }

  // 1) Query string
  var query = location.search.substring(1);
  if (query.length === 0) {
    showMainPage();
    return;
  }

  // 2) get gist id and file name
  query = query.split('/');
  var gistId = query[0];
  var fileName = decodeURIComponent(query[1] || '');

  // 3) write data to inputs
  document.getElementById('gist_id').value = gistId;
  document.getElementById('file_name').value = fileName;

  // 4) fetch gist meta
  fetch('https://api.github.com/gists/' + gistId)
    .then(function (res) {
      return res.json().then(function (body) {
        if (res.status === 200) return body;
        throw new Error('Gist <strong>' + gistId + '</strong>, ' + (body && body.message ? body.message.replace(/\(.*\)/, '') : res.status));
      });
    })
    .then(function (info) {
      addGistDetails(info);
      addFilesToList(info);

      // Show main UI NOW so you never get stuck on "Loading..."
      showMainPage();

      if (fileName === '') {
        for (var file in info.files) {
          if (fileName === '' || file === 'index.html') {
            fileName = file;
          }
        }
      }

      if (!info.files.hasOwnProperty(fileName)) {
        throw new Error('File <strong>' + fileName + '</strong> does not exist');
      }

      var f = info.files[fileName];
      if (f.truncated) {
        fetchUrl(f.raw_url).then(res => {
          if (res.status === 200) {
            res.text().then(text => processContent(text, fileName));
          } else {
            throw new Error('Failed to pull full content ' + fileName + ' <strong>' + gistId + '</strong>, ' + res.status);
          }
        }).catch(function (err) {
          showError(err.message || String(err));
        });
      } else {
        processContent(f.content, fileName);
      }
    })
    .catch(function (err) {
      showMainPage();
      showError(err && err.message ? err.message : String(err));
    });
})();
