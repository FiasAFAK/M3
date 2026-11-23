const videoInput = document.getElementById("videoInput");
const dropZone = document.getElementById("dropZone");
const fileNameEl = document.getElementById("fileName");
const formatSelect = document.getElementById("formatSelect");
const extractBtn = document.getElementById("extractBtn");
const statusBox = document.getElementById("statusBox");
const progressFill = document.getElementById("progressFill");
const statusText = document.getElementById("statusText");
const resultBox = document.getElementById("resultBox");
const audioPreview = document.getElementById("audioPreview");
const downloadLink = document.getElementById("downloadLink");

let selectedFile = null;
let currentAudioUrl = null;

function setProgress(percent, text) {
  statusBox.classList.remove("hidden");
  progressFill.style.width = `${percent}%`;
  statusText.textContent = text;
}

function handleFileSelection(file) {
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

extractBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  extractBtn.disabled = true;
  resultBox.classList.add("hidden");

  try {
    setProgress(15, "جاري قراءة ملف الفيديو...");
    const arrayBuffer = await selectedFile.arrayBuffer();

    setProgress(40, "جاري فك تشفير المسار الصوتي...");
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const chosenFormat = formatSelect.value;
    let audioBlob;

    if (chosenFormat === "mp3") {
      setProgress(60, "جاري تحويل الصوت إلى MP3...");
      audioBlob = await audioBufferToMp3(audioBuffer, (pct) => {
        const mapped = 60 + Math.round(pct * 0.35);
        setProgress(mapped, `جاري ضغط MP3... (${pct}%)`);
      });
    } else {
      setProgress(75, "جاري تجهيز ملف WAV...");
      audioBlob = audioBufferToWav(audioBuffer);
    }

    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
    }
    currentAudioUrl = URL.createObjectURL(audioBlob);

    const baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
    const outName = `${baseName}-audio.${chosenFormat}`;

    audioPreview.src = currentAudioUrl;
    downloadLink.href = currentAudioUrl;
    downloadLink.download = outName;

    setProgress(100, "اكتملت العملية!");
    resultBox.classList.remove("hidden");
  } catch (err) {
    console.error(err);
    setProgress(0, "حدث خطأ: قد يكون الفيديو بدون صوت أو بصيغة غير مدعومة في هذا المتصفح.");
  } finally {
    extractBtn.disabled = false;
  }
});
