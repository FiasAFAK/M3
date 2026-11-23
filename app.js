(function () {
  "use strict";

  var MAX_BYTES = 200 * 1024 * 1024;
  var UNSUPPORTED = "ما قدرنا نقرأ هذا الملف. استخدم MP4 أو MOV أو MKV أو WebM.";
  var NO_AUDIO = "هذا الفيديو بلا مسار صوتي.";
  var TOO_BIG = "الملف أكبر من 200 م.ب. قصّره ثم أعد المحاولة.";
  var NO_LIB = "تعذّر تحميل أداة الاستخراج. تأكد من الإنترنت ثم أعد فتح الصفحة.";

  var HOSTS = ["https://cdn.jsdelivr.net/npm/", "https://unpkg.com/"];
  function urls(pkg, base) {
    var out = [];
    HOSTS.forEach(function (h) {
      ["dist/bundles/", "dist/"].forEach(function (d) {
        ["cjs", "js", "min.cjs", "min.js"].forEach(function (x) {
          out.push(h + pkg + "@1.66.2/" + d + base + "." + x);
        });
      });
    });
    return out;
  }
  var LIB_URLS = urls("mediabunny", "mediabunny");
  var MP3_URLS = urls("@mediabunny/mp3-encoder", "mediabunny-mp3-encoder");
  var AAC_URLS = urls("@mediabunny/aac-encoder", "mediabunny-aac-encoder");

  var FORMATS = [
    { id: "mp3", label: "MP3", hint: "الأشهر", ext: "mp3" },
    { id: "m4a", label: "M4A", hint: "جودة أعلى", ext: "m4a" },
    { id: "wav", label: "WAV", hint: "بلا ضغط", ext: "wav" }
  ];
  var RATES = {
    mp3: [{ kbps: 128, label: "خفيف" }, { kbps: 192, label: "متوازن" }, { kbps: 320, label: "عالي" }],
    m4a: [{ kbps: 128, label: "قياسي" }, { kbps: 192, label: "عالي" }]
  };

  function $(id) { return document.getElementById(id); }
  var el = {};
  ["card","placeholder","videoBox","video","emptyInfo","fileInfo","fname","fmeta","noteTracks","noteAudioOnly","error","options","formats","ratesBox","rates","wavNote","working","workText","pct","barFill","cancelBtn","done","doneText","player","playBtn","icoPlay","icoPause","seek","tNow","tAll","audio","outSize","saveBtn","saveText","againFmt","againVid","actions","extractBtn","pickBtn","pickSpin","pickIco","pickText","changeBtn","file"].forEach(function (id) { el[id] = $(id); });

  var S = { file: null, probe: null, error: null, status: "idle", format: "mp3", bitrate: 192, progress: 0, result: null, videoUrl: null, audioUrl: null };
  var token = 0, abort = null;

  function clock(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    var w = Math.floor(sec), m = Math.floor(w / 60), r = w % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }
  function bytes(n) {
    if (n < 1048576) return Math.max(1, Math.round(n / 1024)) + " KB";
    var mb = n / 1048576;
    return (mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)) + " MB";
  }
  function stem(name) {
    var s = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, " ").trim();
    return s.slice(0, 80) || "صوت";
  }
  function chosenFormat() { return FORMATS.filter(function (f) { return f.id === S.format; })[0] || FORMATS[0]; }

  /* ---------- مكتبة الاستخراج ---------- */
  function lib() { return window.Mediabunny; }

  function loadScript(url) {
    return new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = url; s.onload = ok; s.onerror = function () { fail(new Error(NO_LIB)); };
      document.head.appendChild(s);
    });
  }

  function loadFirst(list, check) {
    var i = 0;
    return new Promise(function (ok, fail) {
      function next() {
        if (check()) return ok();
        if (i >= list.length) return fail(new Error(NO_LIB));
        loadScript(list[i++]).then(function () { check() ? ok() : next(); }, next);
      }
      next();
    });
  }

  var libReady = null;
  function ensureLib() {
    if (!libReady) {
      libReady = loadFirst(LIB_URLS, function () { return !!window.Mediabunny; });
      libReady.catch(function () { libReady = null; });
    }
    return libReady;
  }

  var encoders = null;
  function ensureEncoders() {
    if (!encoders) {
      encoders = (async function () {
        await ensureLib();
        var L = lib();
        if (!(await L.canEncodeAudio("mp3"))) {
          await loadFirst(MP3_URLS, function () { return !!window.MediabunnyMp3Encoder; });
          window.MediabunnyMp3Encoder.registerMp3Encoder();
        }
        if (!(await L.canEncodeAudio("aac"))) {
          await loadFirst(AAC_URLS, function () { return !!window.MediabunnyAacEncoder; });
          window.MediabunnyAacEncoder.registerAacEncoder();
        }
      })();
      encoders.catch(function () { encoders = null; });
    }
    return encoders;
  }

  async function probeVideo(file) {
    await ensureLib();
    var L = lib();
    var input = new L.Input({ source: new L.BlobSource(file), formats: L.ALL_FORMATS });
    try {
      var readable = await input.canRead();
      if (!readable) return { readable: false, hasAudio: false, hasVideo: false, audioTracks: 0, duration: null };
      var r = await Promise.all([
        input.getAudioTracks(),
        input.getPrimaryVideoTrack(),
        input.getDurationFromMetadata().catch(function () { return null; })
      ]);
      var d = r[2];
      if (d == null || !isFinite(d) || d <= 0) d = await input.computeDuration().catch(function () { return null; });
      if (d != null && (!isFinite(d) || d <= 0)) d = null;
      return { readable: true, hasAudio: r[0].length > 0, hasVideo: r[1] != null, audioTracks: r[0].length, duration: d };
    } finally {
      input.dispose();
    }
  }

  function failureMessage(discarded) {
    var audio = discarded.filter(function (t) { return t.track.type === "audio"; });
    var reasons = audio.map(function (t) { return t.reason; });
    if (reasons.indexOf("undecodable_source_codec") > -1 || reasons.indexOf("unknown_source_codec") > -1)
      return "تعذّر قراءة الصوت داخل هذا الملف. جرّب MP4 أو MOV أو WebM.";
    if (reasons.indexOf("no_encodable_target_codec") > -1) return "هذه الصيغة غير متاحة في المتصفح الحالي. جرّب WAV.";
    if (audio.length === 0) return NO_AUDIO;
    return "تعذّر تجهيز ملف الصوت من هذا المقطع.";
  }

  async function extractAudio(o) {
    if (o.file.size > MAX_BYTES) throw new Error(TOO_BIG);
    await ensureLib();
    if (o.format !== "wav") await ensureEncoders();
    if (o.signal.aborted) throw new DOMException("Aborted", "AbortError");
    var L = lib();
    var input = new L.Input({ source: new L.BlobSource(o.file), formats: L.ALL_FORMATS });
    var mime = o.format === "mp3" ? "audio/mpeg" : o.format === "wav" ? "audio/wav" : "audio/mp4";
    try {
      var fmt = o.format === "mp3" ? new L.Mp3OutputFormat() : o.format === "wav" ? new L.WavOutputFormat() : new L.Mp4OutputFormat();
      var target = new L.BufferTarget();
      var output = new L.Output({ format: fmt, target: target });
      var bitrate = (o.format === "m4a" ? Math.min(o.bitrateKbps, 192) : o.bitrateKbps) * 1000;
      var conv = await L.Conversion.init({
        input: input, output: output, showWarnings: false,
        tags: { title: o.title, artist: "نبرة" },
        video: { discard: true },
        audio: o.format === "wav"
          ? { codec: "pcm-s16" }
          : { codec: o.format === "mp3" ? "mp3" : "aac", quality: new L.Quality({ bitrate: bitrate }), forceTranscode: true }
      });
      if (!conv.isValid) throw new Error(failureMessage(conv.discardedTracks));
      if (!conv.utilizedTracks.some(function (t) { return t.type === "audio"; })) throw new Error(NO_AUDIO);
      conv.onProgress = function (p) { if (isFinite(p)) o.onProgress(Math.max(0, Math.min(1, p))); };
      var onAbort = function () { conv.cancel(); };
      o.signal.addEventListener("abort", onAbort, { once: true });
      try {
        await conv.execute();
      } catch (e) {
        if (o.signal.aborted || e instanceof L.ConversionCanceledError) throw new DOMException("Aborted", "AbortError");
        throw new Error("توقّف الاستخراج قبل اكتماله. جرّب ملفًا أقصر أو صيغة WAV.");
      } finally {
        o.signal.removeEventListener("abort", onAbort);
      }
      if (!target.buffer || target.buffer.byteLength < 64) throw new Error("لم يُنتج ملف صوت. تأكد أن المقطع يحتوي صوتًا.");
      return new Blob([target.buffer], { type: mime });
    } finally {
      input.dispose();
    }
  }

  function saveAudioFile(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------- الحالة والعرض ---------- */
  function setVideoUrl(u) {
    if (S.videoUrl && S.videoUrl !== u) URL.revokeObjectURL(S.videoUrl);
    S.videoUrl = u;
  }
  function setAudioUrl(u) {
    if (S.audioUrl && S.audioUrl !== u) URL.revokeObjectURL(S.audioUrl);
    S.audioUrl = u;
  }

  function optButton(label, hint, active, disabled, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "opt" + (active ? " active" : "");
    b.setAttribute("aria-pressed", active ? "true" : "false");
    b.disabled = disabled;
    var t = document.createElement("b"); t.textContent = label;
    var h = document.createElement("i"); h.textContent = hint;
    b.appendChild(t); b.appendChild(h);
    b.onclick = onClick;
    return b;
  }

  function render() {
    var st = S.status, f = S.file, p = S.probe;
    var working = st === "working", done = st === "done";
    var canExtract = st === "review" && p && p.readable && p.hasAudio && !S.error;

    el.placeholder.hidden = !!(S.videoUrl && f);
    el.videoBox.hidden = !(S.videoUrl && f);
    el.emptyInfo.hidden = !!f;
    el.fileInfo.hidden = !f;
    if (f) {
      el.fname.textContent = f.name; el.fname.title = f.name;
      el.fmeta.textContent = bytes(f.size) + (p && p.duration ? " · " + clock(p.duration) : "") + (st === "probing" ? " · نقرأ الملف" : "");
    }
    el.noteTracks.hidden = !(p && p.audioTracks > 1 && !S.error);
    el.noteAudioOnly.hidden = !(p && p.readable && p.hasAudio && !p.hasVideo && !S.error);
    el.error.hidden = !S.error;
    el.error.textContent = S.error || "";

    var showOpts = !!f && !done;
    el.options.hidden = !showOpts;
    if (showOpts) {
      el.formats.textContent = "";
      FORMATS.forEach(function (x) {
        el.formats.appendChild(optButton(x.label, x.hint, S.format === x.id, working, function () {
          S.format = x.id;
          if (x.id === "m4a" && S.bitrate > 192) S.bitrate = 192;
          render();
        }));
      });
      var rates = S.format === "wav" ? [] : RATES[S.format];
      el.ratesBox.hidden = rates.length === 0;
      el.wavNote.hidden = rates.length !== 0;
      el.rates.className = "grid3" + (rates.length === 2 ? " two" : "");
      el.rates.textContent = "";
      rates.forEach(function (r) {
        el.rates.appendChild(optButton(r.label, String(r.kbps), S.bitrate === r.kbps, working, function () { S.bitrate = r.kbps; render(); }));
      });
    }

    var pc = Math.round(S.progress * 100);
    el.working.hidden = !working;
    el.workText.textContent = pc < 2 ? "نجهّز أداة الاستخراج" : "نفصل الصوت";
    el.pct.textContent = pc + "%";
    el.barFill.style.width = pc + "%";

    el.done.hidden = !(done && S.result && S.audioUrl);
    if (!el.done.hidden) {
      var c = chosenFormat();
      el.doneText.textContent = "استمع أولًا، ثم احفظ ملف " + c.label + " فقط.";
      el.outSize.textContent = bytes(S.result.blob.size);
      el.saveText.textContent = "حفظ " + c.label;
      if (el.audio.getAttribute("src") !== S.audioUrl) el.audio.src = S.audioUrl;
    }

    el.actions.hidden = working || done;
    el.extractBtn.hidden = !canExtract;
    el.pickBtn.hidden = !!canExtract;
    el.changeBtn.hidden = !canExtract;
    el.pickBtn.disabled = st === "probing";
    el.pickSpin.hidden = st !== "probing";
    el.pickIco.style.display = st === "probing" ? "none" : "";
    el.pickText.textContent = f ? "اختر فيديو آخر" : "اختر فيديو";
  }

  async function take(next) {
    var id = ++token;
    if (abort) abort.abort();
    S.file = next; S.probe = null; S.result = null; S.progress = 0; S.error = null;
    setVideoUrl(URL.createObjectURL(next));
    setAudioUrl(null);
    el.video.src = S.videoUrl;

    if (/\.(avi|wmv|flv)$/i.test(next.name)) {
      S.status = "review"; S.error = "صيغة AVI وما يشبهها غير مدعومة. حوّل المقطع إلى MP4 ثم أعد رفعه.";
      return render();
    }
    if (next.size > MAX_BYTES) { S.status = "review"; S.error = TOO_BIG; return render(); }

    S.status = "probing"; render();
    try {
      var info = await probeVideo(next);
      if (token !== id) return;
      S.probe = info; S.status = "review";
      if (!info.readable) S.error = UNSUPPORTED;
      else if (!info.hasAudio) S.error = "هذا المقطع بلا مسار صوتي.";
    } catch (e) {
      if (token !== id) return;
      S.status = "review"; S.error = e instanceof Error ? e.message : UNSUPPORTED;
    }
    render();
  }

  async function runExtract() {
    if (!S.file || !S.probe || !S.probe.hasAudio || S.status === "working") return;
    var ctl = new AbortController();
    abort = ctl;
    S.status = "working"; S.error = null; S.progress = 0; S.result = null;
    setAudioUrl(null); render();
    var c = chosenFormat(), title = stem(S.file.name);
    try {
      var blob = await extractAudio({
        file: S.file, format: S.format, bitrateKbps: S.bitrate, title: title, signal: ctl.signal,
        onProgress: function (v) { S.progress = v; render(); }
      });
      if (ctl.signal.aborted) return;
      S.result = { blob: blob, name: title + "." + c.ext };
      setAudioUrl(URL.createObjectURL(blob));
      S.progress = 1; S.status = "done";
    } catch (e) {
      S.status = "review"; S.progress = 0;
      if (!(ctl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")))
        S.error = e instanceof Error ? e.message : "تعذّر استخراج الصوت.";
    }
    render();
  }

  function reset() {
    token++;
    if (abort) abort.abort();
    S.file = null; S.probe = null; S.error = null; S.result = null; S.progress = 0; S.status = "idle";
    setVideoUrl(null); setAudioUrl(null);
    el.video.removeAttribute("src"); el.video.load();
    el.audio.pause(); el.audio.removeAttribute("src");
    el.file.value = "";
    render();
  }

  /* ---------- الأحداث ---------- */
  function pick() { el.file.click(); }
  el.pickBtn.onclick = pick;
  el.changeBtn.onclick = pick;
  el.extractBtn.onclick = runExtract;
  el.cancelBtn.onclick = function () { if (abort) abort.abort(); };
  el.saveBtn.onclick = function () { if (S.result) saveAudioFile(S.result.blob, S.result.name); };
  el.againFmt.onclick = function () {
    S.status = "review"; S.result = null; S.progress = 0; setAudioUrl(null);
    el.audio.pause(); el.audio.removeAttribute("src"); render();
  };
  el.againVid.onclick = reset;
  el.file.onchange = function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) take(f);
    e.target.value = "";
  };

  el.card.addEventListener("dragover", function (e) { e.preventDefault(); el.card.classList.add("drag"); });
  el.card.addEventListener("dragleave", function (e) { if (!el.card.contains(e.relatedTarget)) el.card.classList.remove("drag"); });
  el.card.addEventListener("drop", function (e) {
    e.preventDefault(); el.card.classList.remove("drag");
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) take(f);
  });

  el.video.addEventListener("loadeddata", function () {
    var v = el.video;
    if (v.currentTime < 0.05) {
      var mark = isFinite(v.duration) ? Math.min(0.2, v.duration / 2) : 0.1;
      if (mark > 0) v.currentTime = mark;
    }
  });

  /* المشغّل */
  var a = el.audio;
  el.playBtn.onclick = function () { if (a.paused) a.play(); else a.pause(); };
  function playState(on) {
    el.player.classList.toggle("playing", on);
    el.icoPlay.hidden = on; el.icoPause.hidden = !on;
    el.playBtn.setAttribute("aria-label", on ? "إيقاف الاستماع" : "تشغيل الصوت");
  }
  a.onplay = function () { playState(true); };
  a.onpause = function () { playState(false); };
  a.onended = function () { playState(false); };
  a.ontimeupdate = function () { el.seek.value = a.currentTime; el.tNow.textContent = clock(a.currentTime); };
  a.onloadedmetadata = function () {
    var d = isFinite(a.duration) ? a.duration : 0;
    el.seek.max = d; el.tAll.textContent = clock(d);
  };
  el.seek.oninput = function () { a.currentTime = Number(el.seek.value); el.tNow.textContent = clock(a.currentTime); };

  /* تثبيت التطبيق على الجوال */
  var installBtn = $("installBtn"), deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferred = e; installBtn.hidden = false;
  });
  installBtn.onclick = async function () {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) {}
    deferred = null; installBtn.hidden = true;
  };
  window.addEventListener("appinstalled", function () { installBtn.hidden = true; });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});

  render();
  ensureLib().catch(function () {
    if (!S.error) { S.error = NO_LIB; render(); }
  });
})();
