(function () {
  "use strict";
  if (!FG.token()) return (location.replace("index.html"));
  var MAX = 50 * 1024 * 1024;
  var KINDS = {
    video: { ext: [".mp4", ".avi", ".mov"], hint: "MP4, AVI or MOV, up to 50 MB", url: "/analyze/video", btn: "ANALYZE VIDEO" },
    audio: { ext: [".wav", ".mp3", ".flac"], hint: "WAV, MP3 or FLAC, up to 50 MB", url: "/analyze/audio", btn: "ANALYZE AUDIO" }
  };
  var $ = function (i) { return document.getElementById(i); };
  var panels = {};

  function bytes(n) { return n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB"; }
  function clock(s) { s = Math.round(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function pct(v) { return Math.round(v * 1000) / 10; }
  function signOut() { FG.clear(); location.replace("index.html"); }

  /* Header: live status */
  $("ep").textContent = FG.API || location.origin; $("ep").title = $("ep").textContent;
  function health() {
    fetch(FG.API + "/health").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
      $("dot").className = "dot on"; $("st").textContent = "Online"; $("mode").textContent = d.mode || "-"; $("dev").textContent = String(d.device || "-").toUpperCase();
    }).catch(function () { $("dot").className = "dot off"; $("st").textContent = "Unreachable"; $("mode").textContent = $("dev").textContent = "-"; });
  }
  health(); setInterval(health, 15000);
  $("theme").onclick = FG.toggleTheme;
  $("out").onclick = function () {
    fetch(FG.API + "/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + FG.token() } }).catch(function () {}).then(signOut);
  };
  fetch(FG.API + "/auth/me", { headers: { Authorization: "Bearer " + FG.token() } }).then(function (r) {
    if (r.status === 401) return signOut(); return r.json().then(function (d) { $("user").textContent = d.username; });
  }).catch(function () {});

  /* Tabs */
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll(".tabs button").forEach(function (x) { x.setAttribute("aria-selected", x === b); });
      Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== b.dataset.kind; });
    };
  });

  function waveform(file, canvas, onInfo) {
    var AC = window.AudioContext || window.webkitAudioContext, ctx = canvas.getContext("2d");
    canvas.width = 800; canvas.height = 90;
    function note(t) { ctx.fillStyle = FG.css("--mu"); ctx.font = "13px IBM Plex Mono, monospace"; ctx.fillText(t, 12, 50); }
    if (!AC) return note("Waveform preview unavailable");
    note("Decoding waveform...");
    var ac = new AC();
    file.arrayBuffer().then(function (b) { return ac.decodeAudioData(b); }).then(function (buf) {
      var d = buf.getChannelData(0), step = Math.floor(d.length / 800) || 1;
      ctx.clearRect(0, 0, 800, 90); ctx.fillStyle = FG.css("--fg");
      for (var x = 0; x < 800; x++) {
        var m = 0; for (var i = 0; i < step; i += 16) m = Math.max(m, Math.abs(d[x * step + i] || 0));
        var h = Math.max(1, m * 84); ctx.fillRect(x, 45 - h / 2, 1, h);
      }
      onInfo(buf); ac.close();
    }).catch(function () { ctx.clearRect(0, 0, 800, 90); note("Waveform preview unavailable for this file"); });
  }

  function build(kind) {
    var cfg = KINDS[kind], root = $("tpl").content.firstElementChild.cloneNode(true);
    $("panels").appendChild(root); root.hidden = kind !== "video"; panels[kind] = root;
    var r = function (n) { return root.querySelector('[data-r="' + n + '"]'); };
    var st = { file: null, url: null, busy: false, score: null };
    r("dzHint").textContent = cfg.hint; r("file").accept = cfg.ext.join(","); r("go").textContent = cfg.btn;

    function flash(el, msg) { el.textContent = msg; el.hidden = !msg; }
    function thrText() {
      var t = r("thr").value;
      r("thrOut").textContent = t + "%";
      r("thrHint").textContent = "This dashboard flags any file scoring " + t + "% or higher. Lower values flag more files; higher values flag fewer.";
      r("mark").style.left = "calc(" + t + "% - 1px)";
      if (st.score !== null) {
        var hit = st.score * 100 >= t;
        r("thrNote").textContent = "Score " + pct(st.score) + "% is " + (hit ? "at or above" : "below") + " your " + t + "% threshold: " + (hit ? "FLAGGED" : "not flagged") + " in this view. The backend verdict above uses its own policy thresholds.";
      }
    }
    function reset() {
      flash(r("err"), ""); flash(r("fileErr"), ""); r("res").hidden = true; st.score = null;
      if (st.url) { URL.revokeObjectURL(st.url); st.url = null; }
      r("media").textContent = ""; r("meta").textContent = "";
    }
    function meta(k, v) { var a = document.createElement("dt"), b = document.createElement("dd"); a.textContent = k; b.textContent = v; b.title = v; r("meta").append(a, b); }

    function load(f) {
      reset(); st.file = null; r("work").hidden = true; r("empty").hidden = false;
      if (!f) return;
      var low = f.name.toLowerCase();
      if (!cfg.ext.some(function (e) { return low.endsWith(e); })) return flash(r("fileErr"), "Unsupported file type. Allowed: " + cfg.ext.join(", "));
      if (f.size > MAX) return flash(r("fileErr"), "File is " + bytes(f.size) + ". The edge limit is 50 MB.");
      st.file = f; st.url = URL.createObjectURL(f);
      r("work").hidden = false; r("empty").hidden = true;
      meta("Name", f.name); meta("Size", bytes(f.size)); meta("Type", f.type || low.slice(low.lastIndexOf(".")));
      if (kind === "video") {
        var v = document.createElement("video"); v.controls = true; v.preload = "metadata"; v.src = st.url + "#t=0.5";
        v.onloadedmetadata = function () { meta("Duration", clock(v.duration)); meta("Resolution", v.videoWidth + " x " + v.videoHeight); };
        r("media").append(v);
      } else {
        var c = document.createElement("canvas"), a = document.createElement("audio"); a.controls = true; a.src = st.url;
        r("media").append(c, a);
        waveform(f, c, function (b) { meta("Duration", clock(b.duration)); meta("Sample rate", b.sampleRate + " Hz"); meta("Channels", b.numberOfChannels); });
      }
      thrText();
    }

    r("file").onchange = function () { load(r("file").files[0]); };
    ["dragenter", "dragover"].forEach(function (e) {
      r("dz").addEventListener(e, function (ev) {
        ev.preventDefault(); r("dz").classList.add("over");
        var it = ev.dataTransfer && ev.dataTransfer.items && ev.dataTransfer.items[0];
        r("dzMain").textContent = "Release to load " + ((it && it.type) || "file");
      });
    });
    ["dragleave", "drop"].forEach(function (e) {
      r("dz").addEventListener(e, function (ev) { ev.preventDefault(); r("dz").classList.remove("over"); r("dzMain").textContent = "Drop a file here, or click to browse"; });
    });
    r("dz").addEventListener("drop", function (ev) { if (!st.busy && ev.dataTransfer.files[0]) load(ev.dataTransfer.files[0]); });
    r("thr").oninput = thrText;

    function busy(b, text) {
      st.busy = b; r("go").disabled = b; r("file").disabled = b; r("bar").hidden = !b; r("prog").hidden = !b;
      if (b) { r("bar").classList.remove("ind"); r("bar").firstChild.style.width = "0"; r("prog").textContent = text; }
    }
    function show(d) {
      var dec = d.decision || {}, v = dec.verdict || "UNCERTAIN", s = Number(d.deepfake_score);
      var cls = v === "DEEPFAKE" ? "bad" : v === "REAL" ? "ok" : "warn";
      st.score = s;
      r("score").textContent = pct(s) + "%";
      r("badge").textContent = v; r("badge").className = "badge2 mono " + cls;
      r("fill").style.width = Math.min(100, s * 100) + "%"; r("fill").style.background = "var(--" + cls + ")";
      r("risk").textContent = dec.risk_level || "-"; r("rfile").textContent = d.filename || st.file.name;
      r("explain").textContent = d.explanation || "";
      r("res").hidden = false; thrText();
    }
    r("go").onclick = function () {
      if (!st.file || st.busy) return;
      flash(r("err"), ""); r("res").hidden = true; busy(true, "Uploading 0%");
      var x = new XMLHttpRequest(), fd = new FormData(); fd.append("file", st.file, st.file.name);
      x.open("POST", FG.API + cfg.url); x.setRequestHeader("Authorization", "Bearer " + FG.token());
      x.upload.onprogress = function (e) {
        if (!e.lengthComputable) return;
        var p = Math.round(e.loaded / e.total * 100); r("bar").firstChild.style.width = p + "%";
        if (p >= 100) { r("bar").classList.add("ind"); r("prog").textContent = "Processing through Edge AI pipeline..."; } else r("prog").textContent = "Uploading " + p + "%";
      };
      x.onerror = function () { busy(false); flash(r("err"), "Could not reach the Edge Agent backend at " + (FG.API || location.origin) + "."); health(); };
      x.onload = function () {
        busy(false);
        if (x.status === 401) return signOut();
        var body = {}; try { body = JSON.parse(x.responseText); } catch (e) {}
        if (x.status === 404 || x.status === 405) return flash(r("err"), "This backend does not expose " + cfg.url + " yet.");
        if (x.status < 200 || x.status > 299) return flash(r("err"), "Backend error (" + x.status + "): " + (typeof body.detail === "string" ? body.detail : x.statusText));
        show(body);
      };
      x.send(fd);
    };
    thrText();
  }
  Object.keys(KINDS).forEach(build);
})();
