const $ = selector => document.querySelector(selector);
const ui = {
  video: $("#previewVideo"), empty: $("#previewEmpty"), stage: $("#previewStage"),
  selection: $("#selectionBox"), choose: $("#chooseSourceBtn"), change: $("#changeSourceBtn"),
  resetArea: $("#resetAreaBtn"), folder: $("#folderBtn"), record: $("#recordBtn"),
  pause: $("#pauseBtn"), stop: $("#stopBtn"), timer: $("#mainTimer"),
  overlayTimer: $("#overlayTimer"), previewRec: $("#previewRec"),
  status: $("#statusText"), statusDot: $("#statusDot"), state: $("#recordState"),
  hint: $("#recordHint"), sourceName: $("#sourceName"), sourceDetail: $("#sourceDetail"),
  folderName: $("#folderName"), folderPath: $("#folderPath"), recent: $("#recentList"),
  themeButton: $("#themeToggle"), themeLabel: $("#themeLabel")
};
let selectedSource = false;
let cropRect = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
let selecting = false, startPoint = null, finalUrl = null, lastSession = null;

function timeText(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(safe / 3600), m = Math.floor(safe % 3600 / 60), s = safe % 60;
  return [h, m, s].map(value => String(value).padStart(2, "0")).join(":");
}
function bytesText(bytes) {
  if (!bytes) return "Size unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 2 : 1)} ${units[index]}`;
}
function setStatus(text, mode = "ready") {
  ui.status.textContent = text;
  const color = mode === "recording" ? "#f05262" : mode === "paused" ? "#f5b95d" : "#38d69b";
  ui.statusDot.style.background = color;
  ui.statusDot.style.boxShadow = `0 0 12px ${color}88`;
}
function errorMessage(error) {
  console.error(error);
  alert(error?.message || String(error));
}

function applyTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("nextgen-screen-studio-theme", nextTheme);
  ui.themeLabel.textContent = nextTheme === "dark" ? "Light mode" : "Dark mode";
  ui.themeButton.querySelector(".theme-symbol").textContent = nextTheme === "dark" ? "☼" : "☾";
  ui.themeButton.setAttribute("aria-label", `Switch to ${nextTheme === "dark" ? "light" : "dark"} mode`);
  ui.themeButton.title = `Switch to ${nextTheme === "dark" ? "light" : "dark"} mode`;
}
function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

function getVideoContentRect() {
  const stage = ui.stage.getBoundingClientRect();
  const vw = ui.video.videoWidth || stage.width;
  const vh = ui.video.videoHeight || stage.height;
  const scale = Math.min(stage.width / vw, stage.height / vh);
  const width = vw * scale, height = vh * scale;
  return { left: (stage.width - width) / 2, top: (stage.height - height) / 2, width, height, stage };
}
function applyCropBox() {
  const rect = getVideoContentRect();
  ui.selection.style.left = `${rect.left + cropRect.x * rect.width}px`;
  ui.selection.style.top = `${rect.top + cropRect.y * rect.height}px`;
  ui.selection.style.width = `${cropRect.width * rect.width}px`;
  ui.selection.style.height = `${cropRect.height * rect.height}px`;
  RecorderEngine.setCrop(cropRect);
}
function pointInStage(event) {
  const rect = getVideoContentRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.stage.left - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.stage.top - rect.top) / rect.height))
  };
}
ui.stage.addEventListener("pointerdown", event => {
  if (!selectedSource || RecorderEngine.getState().recording || event.target.closest("button")) return;
  selecting = true;
  startPoint = pointInStage(event);
  cropRect = { x: startPoint.x, y: startPoint.y, width: 0.01, height: 0.01 };
  ui.selection.hidden = false;
  ui.stage.setPointerCapture(event.pointerId);
  applyCropBox();
});
ui.stage.addEventListener("pointermove", event => {
  if (!selecting) return;
  const point = pointInStage(event);
  const x = Math.min(startPoint.x, point.x), y = Math.min(startPoint.y, point.y);
  cropRect = {
    x, y,
    width: Math.max(0.03, Math.abs(point.x - startPoint.x)),
    height: Math.max(0.03, Math.abs(point.y - startPoint.y))
  };
  cropRect.width = Math.min(cropRect.width, 1 - x);
  cropRect.height = Math.min(cropRect.height, 1 - y);
  applyCropBox();
});
ui.stage.addEventListener("pointerup", () => { selecting = false; });
ui.stage.addEventListener("pointercancel", () => { selecting = false; });

async function chooseSource() {
  try {
    const stream = await RecorderEngine.chooseScreen($("#systemAudioToggle").checked, Number($("#fpsSelect").value));
    ui.video.srcObject = stream;
    ui.video.style.display = "block";
    ui.empty.style.display = "none";
    await ui.video.play();
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    ui.sourceName.textContent = track.label || "Selected display";
    ui.sourceDetail.textContent = `${settings.width || "?"} × ${settings.height || "?"} · Screen capture`;
    selectedSource = true;
    cropRect = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
    ui.selection.hidden = false;
    applyCropBox();
    ui.resetArea.disabled = false;
    ui.hint.textContent = "Drag on the preview to adjust the recording region";
    RecorderEngine.setPreviewVideo(ui.video);
    updateControls();
    setStatus("SCREEN SOURCE SELECTED");
  } catch (error) {
    if (error.name !== "NotAllowedError") errorMessage(error);
  }
}
function resetArea() {
  cropRect = { x: 0, y: 0, width: 1, height: 1 };
  applyCropBox();
}
async function chooseFolder() {
  try {
    const name = await LocalStorageManager.chooseDirectory();
    ui.folderName.textContent = name;
    ui.folderPath.textContent = "Selected folder · Local device";
    updateControls();
  } catch (error) {
    if (error.name !== "AbortError") errorMessage(error);
  }
}
function updateControls() {
  const state = RecorderEngine.getState(), active = state.recording;
  ui.record.disabled = !selectedSource || !LocalStorageManager.hasDirectory() || active;
  ui.pause.disabled = !active;
  ui.stop.disabled = !active;
  ui.pause.textContent = state.paused ? "▶" : "Ⅱ";
  ui.state.textContent = !active ? "READY" : state.paused ? "PAUSED" : "RECORDING";
  ui.state.style.color = state.paused ? "#f5b95d" : active ? "#ff8290" : "#75dfb8";
  ui.previewRec.style.display = active ? "flex" : "none";
  ui.record.querySelector("span").textContent = active ? "Recording…" : "Start recording";
  ui.hint.textContent = !LocalStorageManager.hasDirectory()
    ? "Choose a save folder before recording."
    : !selectedSource
      ? "Choose a screen source before starting."
      : state.paused
        ? "Recording is paused."
        : active
          ? "Recording the selected area. Keep this tab open until saving is complete."
          : "Ready to record.";
}
async function startRecording() {
  try {
    if (!LocalStorageManager.hasDirectory()) throw new Error("Choose a destination folder first.");
    if (!selectedSource) throw new Error("Choose a screen source first.");
    const preset = $("#qualitySelect").value;
    const bitrates = { standard: 8000000, high: 24000000, ultra: 38000000, "4k": 55000000 };
    const maxWidths = { standard: 1280, high: 1920, ultra: 2560, "4k": 3840 };
    const result = await RecorderEngine.start({
      includeMic: $("#micToggle").checked,
      videoBitsPerSecond: bitrates[preset],
      maxWidth: maxWidths[preset],
      fps: Number($("#fpsSelect").value)
    });
    lastSession = { ...result, preset };
    setStatus("RECORDING IN PROGRESS", "recording");
    updateControls();
  } catch (error) {
    errorMessage(error);
  }
}
function pauseResume() {
  const state = RecorderEngine.getState();
  if (state.paused) {
    RecorderEngine.resume();
    setStatus("RECORDING IN PROGRESS", "recording");
  } else {
    RecorderEngine.pause();
    setStatus("RECORDING PAUSED", "paused");
  }
  updateControls();
}
function stopRecording() {
  if (!confirm("Finish this recording now? The video will be finalized before it is saved.")) return;
  ui.stop.disabled = true;
  ui.hint.textContent = "Finalizing video and preparing its seek index. Please wait…";
  RecorderEngine.stop();
}
function addRecent(name, detail, url = null) {
  ui.recent.querySelector(".empty-list")?.remove();
  const row = document.createElement("div");
  row.className = "recent-item";
  const icon = document.createElement("div");
  icon.className = "recent-play";
  icon.textContent = "▶";
  const info = document.createElement("div");
  info.className = "recent-info";
  const title = document.createElement("b");
  title.textContent = name;
  const sub = document.createElement("small");
  sub.textContent = detail;
  info.append(title, sub);
  row.append(icon, info);
  if (url) {
    const open = document.createElement("button");
    open.className = "recent-open";
    open.textContent = "PLAY";
    open.onclick = () => {
      const player = $("#finishedVideo");
      player.src = url;
      player.load();
      $("#finishDialog").showModal();
    };
    row.append(open);
  }
  ui.recent.prepend(row);
}
function showFinished(detail) {
  const file = detail.file;
  finalUrl = file ? RecorderEngine.makeFinalUrl(file) : null;
  const duration = detail.duration || 0;
  const quality = `${detail.width} × ${detail.height} · ${lastSession?.preset || "Custom"} · ${$("#fpsSelect").value} FPS`;
  $("#resultName").textContent = detail.fileName;
  $("#resultLocation").textContent = `${detail.location || "Selected folder"} / ${detail.fileName}`;
  $("#resultQuality").textContent = quality;
  $("#resultMeta").textContent = `${timeText(duration)} · ${file ? bytesText(file.size) : "File saved; preview unavailable"}`;
  const player = $("#finishedVideo");
  if (finalUrl) {
    player.src = finalUrl;
    player.load();
    player.style.display = "block";
  } else {
    player.removeAttribute("src");
    player.style.display = "none";
  }
  $("#finishDialog").showModal();
  addRecent(detail.fileName, `${timeText(duration)} · ${file ? bytesText(file.size) : "Saved WebM"}`, finalUrl);
  ui.timer.textContent = timeText(duration);
  ui.previewRec.style.display = "none";
  ui.video.srcObject = null;
  ui.video.style.display = "none";
  ui.empty.style.display = "flex";
  ui.selection.hidden = true;
  selectedSource = false;
  ui.hint.textContent = "Recording saved. Choose a new source to start again.";
  setStatus("RECORDING SAVED");
  updateControls();
  updateStorage();
}
function updateStorage() {
  navigator.storage?.estimate?.().then(estimate => {
    if (!estimate.quota) return;
    const percent = Math.round((estimate.usage || 0) / estimate.quota * 100);
    $("#storagePercent").textContent = `${percent}%`;
    $("#storageBar").style.width = `${percent}%`;
    $("#storageText").textContent = "Browser-managed storage estimate (not drive free space)";
  }).catch(() => {});
}

ui.choose.addEventListener("click", chooseSource);
ui.change.addEventListener("click", chooseSource);
ui.resetArea.addEventListener("click", resetArea);
ui.folder.addEventListener("click", chooseFolder);
ui.record.addEventListener("click", startRecording);
ui.pause.addEventListener("click", pauseResume);
ui.stop.addEventListener("click", stopRecording);
ui.themeButton.addEventListener("click", toggleTheme);
$("#settingsBtn").addEventListener("click", () => $("#settingsDialog").showModal());
$("#libraryNav").addEventListener("click", () => $("#recentPanel").scrollIntoView({ behavior: "smooth" }));
$("#playAgainBtn").addEventListener("click", () => $("#finishedVideo").play());
$("#doneBtn").addEventListener("click", () => $("#finishedVideo").pause());
window.addEventListener("recording-tick", event => {
  ui.timer.textContent = timeText(event.detail);
  ui.overlayTimer.textContent = timeText(event.detail);
});
window.addEventListener("recording-finished", event => showFinished(event.detail));
window.addEventListener("recorder-error", event => {
  alert(event.detail);
  setStatus("RECORDING ERROR");
  updateControls();
});
document.addEventListener("keydown", event => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (event.code === "Space" && RecorderEngine.getState().recording) {
    event.preventDefault();
    pauseResume();
  }
  if (event.key === "Escape" && RecorderEngine.getState().recording) stopRecording();
});

applyTheme(localStorage.getItem("nextgen-screen-studio-theme") || "dark");
if (!LocalStorageManager.supported()) {
  ui.folderName.textContent = "Folder access not supported";
  ui.folderPath.textContent = "Use desktop Chrome or Edge for direct saving.";
}
RecorderEngine.setPreviewVideo(ui.video);
updateStorage();
updateControls();
