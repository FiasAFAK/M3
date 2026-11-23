const videoInput = document.getElementById("videoInput");
const dropZone = document.getElementById("dropZone");
const fileNameEl = document.getElementById("fileName");
const formatSelect = document.getElementById("formatSelect");
const extractBtn = document.getElementById("extractBtn");
const statusBox = document.getElementById("statusBox");
const progressFill = document.getElementById("progressFill");
const pctText = document.getElementById("pctText");
const statusText = document.getElementById("statusText");
const resultBox = document.getElementById("resultBox");
const resultMeta = document.getElementById("resultMeta");
const audioPreview = document.getElementById("audioPreview");
const downloadLink = document.getElementById("downloadLink");

// عناصر قص الصوت
const trimBox = document.getElementById("trimBox");
const trimDurationLabel = document.getElementById("trimDurationLabel");
const startRange = document.getElementById("startRange");
const endRange = document.getElementById("endRange");
const startVal = document.getElementById("startVal");
const endVal = document.getElementById("endVal");
const startInput = document.getElementById("startInput");
const endInput = document.getElementById("endInput");
const previewTrimBtn = document.getElementById("previewTrimBtn");
const resetTrimBtn = document.getElementById("resetTrimBtn");
const trimPreviewAudio = document.getElementById("trimPreviewAudio");

// عناصر المشغّل المخصص للنتيجة
const playerEl = document.getElementById("player");
const playBtn = document.getElementById("playBtn");
const icoPlay = document.getElementById("icoPlay");
const icoPause = document.getElementById("icoPause");
const seekInput = document.getElementById("seek");
const tNowEl = document.getElementById("tNow");
const tAllEl = document.getElementById("tAll");

// عناصر تثبيت التطبيق على الجوال (PWA)
const installBtn = document.getElementById("installBtn");
const installHint = document.getElementById("installHint");
let deferredInstallPrompt = null;

let selectedFile = null;
let currentAudioUrl = null;
let trimPreviewUrl = null;
let mediaDuration = 0;
let trimStartSec = 0;
let trimEndSec = 0;

function formatTimeDetailed(sec) {
  if (!isFinite(sec) || sec < 0) return "00:00.0";
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  const wholeSec = Math.floor(rem);
  const tenths = Math.floor((rem - wholeSec) * 10);
  return `${String(mins).padStart(2, "0")}:${String(wholeSec).padStart(2, "0")}.${tenths}`;
}

function formatClock(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const w = Math.floor(sec);
  const m = Math.floor(w / 60);
  const s = w % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseTimeInput(str) {
  if (!str) return NaN;
  const clean = str.trim().replace(",", ".");
  if (clean.includes(":")) {
    const parts = clean.split(":");
    if (parts.length === 2) {
      const mins = Number(parts[0]);
      const secs = Number(parts[1]);
      if (isFinite(mins) && isFinite(secs) && mins >= 0 && secs >= 0) {
        return mins * 60 + secs;
      }
    }
    return NaN;
  }
  const num = Number(clean);
  return isFinite(num) && num >= 0 ? num : NaN;
}

function setProgress(percent, text) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  statusBox.classList.remove("hidden");
  progressFill.style.width = `${clamped}%`;
  pctText.textContent = `${clamped}%`;
  statusText.textContent = text;
}

function updateTrimUI(syncInputs = true) {
  if (!mediaDuration || mediaDuration <= 0) {
    trimBox.classList.add("hidden");
    return;
  }
  trimBox.classList.remove("hidden");

  trimStartSec = Math.max(0, Math.min(trimStartSec, Math.max(0, mediaDuration - 0.1)));
  trimEndSec = Math.max(trimStartSec + 0.1, Math.min(trimEndSec, mediaDuration));

  startRange.max = mediaDuration.toFixed(2);
  endRange.max = mediaDuration.toFixed(2);
  startRange.value = trimStartSec.toFixed(2);
  endRange.value = trimEndSec.toFixed(2);

  startVal.textContent = formatTimeDetailed(trimStartSec);
  endVal.textContent = formatTimeDetailed(trimEndSec);

  if (syncInputs) {
    startInput.value = formatTimeDetailed(trimStartSec);
    endInput.value = formatTimeDetailed(trimEndSec);
  }

  const cutLen = Math.max(0.1, trimEndSec - trimStartSec);
  const isFull = trimStartSec <= 0.05 && trimEndSec >= mediaDuration - 0.05;
  trimDurationLabel.textContent = isFull
    ? `المدة المحددة: كامل المقطع (${formatTimeDetailed(cutLen)})`
    : `المقطع المقصوص: ${formatTimeDetailed(cutLen)}`;
}

async function detectMediaDuration(file) {
  return new Promise((resolve) => {
    const tempUrl = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;

    const cleanup = () => {
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(tempUrl);
    };

    v.onloadedmetadata = () => {
      const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      cleanup();
      resolve(dur);
    };

    v.onerror = () => {
      cleanup();
      resolve(0);
    };

    v.src = tempUrl;
  });
}

async function handleFileSelection(file) {
  if (!file) return;
  if (!file.type.startsWith("video/") && !file.name.match(/\.(mp4|mov|mkv|avi|webm|m4v)$/i)) {
    alert("يرجى اختيار ملف فيديو صالح.");
    return;
  }

  selectedFile = file;
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  fileNameEl.textContent = `${file.name} (${sizeMB} MB)`;
  extractBtn.disabled = false;
  resultBox.classList.add("hidden");
  statusBox.classList.add("hidden");
  trimPreviewAudio.classList.add("hidden");
  trimPreviewAudio.pause();

  mediaDuration = await detectMediaDuration(file);
  if (mediaDuration > 0) {
    trimStartSec = 0;
    trimEndSec = mediaDuration;
    updateTrimUI(true);
  } else {
    trimBox.classList.add("hidden");
  }
}

videoInput.addEventListener("change", (e) => {
  handleFileSelection(e.target.files[0]);
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length > 0) {
    handleFileSelection(e.dataTransfer.files[0]);
  }
});

// أحداث أشرطة ومربعات القص
startRange.addEventListener("input", () => {
  const val = Number(startRange.value);
  trimStartSec = Math.min(val, trimEndSec - 0.1);
  updateTrimUI(true);
});

endRange.addEventListener("input", () => {
  const val = Number(endRange.value);
  trimEndSec = Math.max(val, trimStartSec + 0.1);
  updateTrimUI(true);
});

startInput.addEventListener("change", () => {
  const parsed = parseTimeInput(startInput.value);
  if (!isNaN(parsed)) {
    trimStartSec = Math.max(0, Math.min(parsed, trimEndSec - 0.1));
  }
  updateTrimUI(true);
});

endInput.addEventListener("change", () => {
  const parsed = parseTimeInput(endInput.value);
  if (!isNaN(parsed)) {
    trimEndSec = Math.max(trimStartSec + 0.1, Math.min(parsed, mediaDuration));
  }
  updateTrimUI(true);
});

resetTrimBtn.addEventListener("click", () => {
  if (!mediaDuration) return;
  trimStartSec = 0;
  trimEndSec = mediaDuration;
  trimPreviewAudio.classList.add("hidden");
  trimPreviewAudio.pause();
  updateTrimUI(true);
});

// قص AudioBuffer إلى المقطع المحدد (startSec إلى endSec)
function sliceAudioBuffer(audioBuffer, startSec, endSec) {
  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.max(0, Math.min(audioBuffer.length - 1, Math.floor(startSec * sampleRate)));
  const endSample = Math.max(startSample + 1, Math.min(audioBuffer.length, Math.floor(endSec * sampleRate)));
  const frameCount = endSample - startSample;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const tempCtx = new AudioCtx();
  const sliced = tempCtx.createBuffer(audioBuffer.numberOfChannels, frameCount, sampleRate);

  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const srcData = audioBuffer.getChannelData(ch);
    const dstData = sliced.getChannelData(ch);
    dstData.set(srcData.subarray(startSample, endSample));
  }

  if (typeof tempCtx.close === "function") {
    tempCtx.close().catch(() => {});
  }
  return sliced;
}

// تحويل AudioBuffer إلى ملف WAV قياسي بدون الحاجة لأي مكتبات خارجية
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const samples = buffer.length * numChannels;
  const byteRate = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;
  const dataSize = samples * (bitDepth / 8);
  const bufferLength = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = Math.max(-1, Math.min(1, channels[ch][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

// تحميل مكتبة lamejs ديناميكياً عند اختيار MP3
function loadLameJs() {
  return new Promise((resolve, reject) => {
    if (window.lamejs) {
      resolve(window.lamejs);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
    script.onload = () => resolve(window.lamejs);
    script.onerror = () => reject(new Error("تعذر تحميل محول MP3. تأكد من الاتصال بالإنترنت أو اختر صيغة WAV."));
    document.head.appendChild(script);
  });
}

async function audioBufferToMp3(buffer, onProgress) {
  const lamejs = await loadLameJs();
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 128);
  const mp3Data = [];

  const left = buffer.getChannelData(0);
  const right = numChannels > 1 ? buffer.getChannelData(1) : left;

  const sampleBlockSize = 1152;
  const totalSamples = left.length;

  const floatTo16Bit = (input) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  };

  const left16 = floatTo16Bit(left);
  const right16 = numChannels > 1 ? floatTo16Bit(right) : null;

  for (let i = 0; i < totalSamples; i += sampleBlockSize) {
    const leftChunk = left16.subarray(i, i + sampleBlockSize);
    let mp3buf;
    if (numChannels === 1) {
      mp3buf = mp3encoder.encodeBuffer(leftChunk);
    } else {
      const rightChunk = right16.subarray(i, i + sampleBlockSize);
      mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    }
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
    if (i % (sampleBlockSize * 100) === 0 && onProgress) {
      onProgress(Math.round((i / totalSamples) * 100));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const endBuf = mp3encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(endBuf);
  }

  return new Blob(mp3Data, { type: "audio/mp3" });
}

async function decodeSelectedFileToAudioBuffer() {
  const arrayBuffer = await selectedFile.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextClass();
  try {
    return await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    if (typeof audioCtx.close === "function") {
      audioCtx.close().catch(() => {});
    }
  }
}

previewTrimBtn.addEventListener("click", async () => {
  if (!selectedFile) return;
  previewTrimBtn.disabled = true;
  try {
    setProgress(25, "جاري تجهيز معاينة المقطع المقصوص...");
    const fullBuffer = await decodeSelectedFileToAudioBuffer();
    const effectiveEnd = trimEndSec > trimStartSec ? trimEndSec : fullBuffer.duration;
    const slicedBuffer = sliceAudioBuffer(fullBuffer, trimStartSec, effectiveEnd);
    const wavBlob = audioBufferToWav(slicedBuffer);

    if (trimPreviewUrl) {
      URL.revokeObjectURL(trimPreviewUrl);
    }
    trimPreviewUrl = URL.createObjectURL(wavBlob);
    trimPreviewAudio.src = trimPreviewUrl;
    trimPreviewAudio.classList.remove("hidden");
    setProgress(100, "المعاينة جاهزة للاستماع.");
    trimPreviewAudio.play().catch(() => {});
  } catch (err) {
    console.error(err);
    setProgress(0, "تعذر معاينة المقطع. تأكد أن الفيديو يحتوي على مسار صوتي مدعوم.");
  } finally {
    previewTrimBtn.disabled = false;
  }
});

extractBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  extractBtn.disabled = true;
  resultBox.classList.add("hidden");
  audioPreview.pause();

  try {
    setProgress(15, "جاري قراءة ملف الفيديو...");
    const fullBuffer = await decodeSelectedFileToAudioBuffer();

    setProgress(45, "جاري فك تشفير وقص المسار الصوتي...");
    const hasTrim = mediaDuration > 0 && (trimStartSec > 0.05 || trimEndSec < mediaDuration - 0.05);
    const finalBuffer = hasTrim
      ? sliceAudioBuffer(fullBuffer, trimStartSec, Math.min(trimEndSec, fullBuffer.duration))
      : fullBuffer;

    const chosenFormat = formatSelect.value;
    let audioBlob;

    if (chosenFormat === "mp3") {
      setProgress(60, "جاري تحويل الصوت إلى MP3...");
      audioBlob = await audioBufferToMp3(finalBuffer, (pct) => {
        const mapped = 60 + Math.round(pct * 0.35);
        setProgress(mapped, `جاري ضغط MP3... (${pct}%)`);
      });
    } else {
      setProgress(75, "جاري تجهيز ملف WAV...");
      audioBlob = audioBufferToWav(finalBuffer);
    }

    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
    }
    currentAudioUrl = URL.createObjectURL(audioBlob);

    const baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
    const suffix = hasTrim ? `-cut-${Math.floor(trimStartSec)}s-to-${Math.ceil(trimEndSec)}s` : "-audio";
    const outName = `${baseName}${suffix}.${chosenFormat}`;

    audioPreview.src = currentAudioUrl;
    downloadLink.href = currentAudioUrl;
    downloadLink.download = outName;

    const sizeKB = (audioBlob.size / 1024).toFixed(0);
    const sizeMB = (audioBlob.size / (1024 * 1024)).toFixed(2);
    const sizeLabel = audioBlob.size >= 1048576 ? `${sizeMB} MB` : `${sizeKB} KB`;
    resultMeta.textContent = `الصيغة: ${chosenFormat.toUpperCase()} · الحجم: ${sizeLabel} · المدة: ${formatTimeDetailed(finalBuffer.duration)}`;

    setProgress(100, "اكتملت العملية!");
    resultBox.classList.remove("hidden");
  } catch (err) {
    console.error(err);
    setProgress(0, "حدث خطأ: قد يكون الفيديو بدون صوت أو بصيغة غير مدعومة في هذا المتصفح.");
  } finally {
    extractBtn.disabled = false;
  }
});

// تحكم المشغّل المخصص للنتيجة
function setPlayingState(isPlaying) {
  playerEl.classList.toggle("playing", isPlaying);
  icoPlay.hidden = isPlaying;
  icoPause.hidden = !isPlaying;
  playBtn.setAttribute("aria-label", isPlaying ? "إيقاف الاستماع" : "تشغيل الصوت");
}

playBtn.addEventListener("click", () => {
  if (!audioPreview.src) return;
  if (audioPreview.paused) {
    audioPreview.play().catch(() => {});
  } else {
    audioPreview.pause();
  }
});

audioPreview.addEventListener("play", () => setPlayingState(true));
audioPreview.addEventListener("pause", () => setPlayingState(false));
audioPreview.addEventListener("ended", () => setPlayingState(false));

audioPreview.addEventListener("loadedmetadata", () => {
  const dur = isFinite(audioPreview.duration) ? audioPreview.duration : 0;
  seekInput.max = dur;
  tAllEl.textContent = formatClock(dur);
});

audioPreview.addEventListener("timeupdate", () => {
  seekInput.value = audioPreview.currentTime;
  tNowEl.textContent = formatClock(audioPreview.currentTime);
});

seekInput.addEventListener("input", () => {
  audioPreview.currentTime = Number(seekInput.value);
  tNowEl.textContent = formatClock(audioPreview.currentTime);
});

// ميزة تثبيت التطبيق على الجوال (PWA)
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.hidden = false;
  installHint.hidden = true;
});

installBtn.addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } catch (_) {}
    deferredInstallPrompt = null;
  } else {
    installHint.hidden = !installHint.hidden;
  }
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installHint.hidden = true;
  installBtn.textContent = "تم تثبيت التطبيق على جهازك";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
