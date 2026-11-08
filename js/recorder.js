// Screen recorder with selectable-region capture and finalized, seekable WebM output.
const RecorderEngine = (() => {
  let displayStream = null, micStream = null;
  let outputStream = null, recorder = null, audioContext = null;
  let recording = false, paused = false, startedAt = 0, elapsedBeforePause = 0, timerInterval = null;
  let currentFileName = "", mimeType = "", chunks = [], renderFrame = 0;
  let outputCanvas = null, canvasContext = null, previewVideo = null, crop = null;
  let finalFile = null, finalDuration = 0, finalBlobUrl = null, requestedBitrate = 0;

  const mimeCandidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  const chooseMime = () => mimeCandidates.find(type => MediaRecorder.isTypeSupported(type)) || "";

  async function chooseScreen(includeSystemAudio = true, fps = 30) {
    stopCaptureStreams();
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: fps, max: fps } },
      audio: includeSystemAudio
    });
    displayStream.getVideoTracks()[0].addEventListener("ended", () => {
      if (recording) stop();
      else stopCaptureStreams();
    });
    return displayStream;
  }

  function setCrop(normalizedCrop) { crop = normalizedCrop; }
  function setPreviewVideo(video) { previewVideo = video; }

  async function buildAudioTracks(includeMic) {
    const systemTracks = displayStream?.getAudioTracks() || [];
    if (includeMic) {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
    }
    const micTracks = micStream?.getAudioTracks() || [];
    const inputs = [...systemTracks, ...micTracks];
    if (!inputs.length) return [];

    audioContext = new AudioContext();
    await audioContext.resume();
    const destination = audioContext.createMediaStreamDestination();
    inputs.forEach(track => {
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      const gain = audioContext.createGain();
      gain.gain.value = 1;
      source.connect(gain).connect(destination);
    });
    return destination.stream.getAudioTracks();
  }

  function computeCrop(video) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!crop) return { x: 0, y: 0, width: vw, height: vh };
    const x = Math.max(0, Math.min(vw - 2, Math.round(crop.x * vw)));
    const y = Math.max(0, Math.min(vh - 2, Math.round(crop.y * vh)));
    const width = Math.max(2, Math.min(vw - x, Math.round(crop.width * vw)));
    const height = Math.max(2, Math.min(vh - y, Math.round(crop.height * vh)));
    return { x, y, width, height };
  }

  async function start(options = {}) {
    if (!displayStream?.getVideoTracks().length) throw new Error("Choose a screen source first.");
    if (!LocalStorageManager.hasDirectory()) throw new Error("Choose a save folder first.");
    const sourceVideo = previewVideo;
    if (!sourceVideo || sourceVideo.readyState < 2) throw new Error("Wait until the screen preview is ready.");

    const sourceCrop = computeCrop(sourceVideo);
    const maxWidth = options.maxWidth || sourceCrop.width;
    const scale = Math.min(1, maxWidth / sourceCrop.width);
    const outW = Math.max(2, Math.floor(sourceCrop.width * scale / 2) * 2);
    const outH = Math.max(2, Math.floor(sourceCrop.height * scale / 2) * 2);
    const fps = Number(options.fps || 30);

    outputCanvas = document.createElement("canvas");
    outputCanvas.width = outW;
    outputCanvas.height = outH;
    canvasContext = outputCanvas.getContext("2d", { alpha: false });

    const drawFrame = () => {
      if (!recording || paused) return;
      if (sourceVideo.readyState >= 2) {
        canvasContext.drawImage(sourceVideo, sourceCrop.x, sourceCrop.y, sourceCrop.width, sourceCrop.height, 0, 0, outW, outH);
      }
      renderFrame = requestAnimationFrame(drawFrame);
    };

    const audioTracks = await buildAudioTracks(Boolean(options.includeMic));
    const canvasStream = outputCanvas.captureStream(fps);
    outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
    mimeType = chooseMime();
    if (!mimeType) throw new Error("Your browser does not support WebM recording.");

    const now = new Date();
    currentFileName = `NextGen_Recording_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}-${String(now.getMinutes()).padStart(2,"0")}-${String(now.getSeconds()).padStart(2,"0")}.webm`;
    chunks = [];
    requestedBitrate = Number(options.videoBitsPerSecond || 20000000);
    recorder = new MediaRecorder(outputStream, {
      mimeType,
      videoBitsPerSecond: requestedBitrate,
      audioBitsPerSecond: 256000
    });

    recorder.addEventListener("dataavailable", event => {
      if (event.data?.size) chunks.push(event.data);
    });
    recorder.addEventListener("error", event => {
      window.dispatchEvent(new CustomEvent("recorder-error", {
        detail: event.error?.message || "MediaRecorder error."
      }));
    });
    recorder.addEventListener("stop", finalizeRecording, { once: true });

    canvasContext.drawImage(sourceVideo, sourceCrop.x, sourceCrop.y, sourceCrop.width, sourceCrop.height, 0, 0, outW, outH);
    recording = true;
    paused = false;
    startedAt = Date.now();
    elapsedBeforePause = 0;
    // No timeslice: the browser finalizes the WebM container and its seek metadata before saving.
    recorder.start();
    drawFrame();
    timerInterval = setInterval(() => {
      if (recording && !paused) {
        window.dispatchEvent(new CustomEvent("recording-tick", { detail: getElapsedSeconds() }));
      }
    }, 250);

    return { fileName: currentFileName, mimeType, width: outW, height: outH, bitrate: requestedBitrate };
  }

  async function finalizeRecording() {
    cancelAnimationFrame(renderFrame);
    clearInterval(timerInterval);
    timerInterval = null;
    const duration = getElapsedSeconds();
    recording = false;
    paused = false;

    try {
      const blob = new Blob(chunks, { type: mimeType || "video/webm" });
      chunks = [];
      if (!blob.size) throw new Error("The recording is empty. Please try again.");

      const writable = await LocalStorageManager.createRecordingFile(currentFileName);
      await writable.write(blob);
      await writable.close();
      const fileHandle = await LocalStorageManager.getLastFileHandle();
      finalFile = fileHandle ? await fileHandle.getFile() : blob;
      finalDuration = duration;
      stopMicAndAudio();

      window.dispatchEvent(new CustomEvent("recording-finished", {
        detail: {
          fileName: currentFileName,
          mimeType,
          duration: finalDuration,
          file: finalFile,
          width: outputCanvas.width,
          height: outputCanvas.height,
          bitrate: requestedBitrate,
          location: LocalStorageManager.getDirectoryName()
        }
      }));
    } catch (error) {
      stopMicAndAudio();
      window.dispatchEvent(new CustomEvent("recorder-error", {
        detail: `Could not finalize/save the video: ${error.message || error}`
      }));
    }
  }

  function pause() {
    if (recorder?.state === "recording") {
      elapsedBeforePause = getElapsedSeconds();
      paused = true;
      recorder.pause();
      cancelAnimationFrame(renderFrame);
    }
  }

  function resume() {
    if (recorder?.state === "paused") {
      startedAt = Date.now();
      paused = false;
      recorder.resume();
      const sourceCrop = computeCrop(previewVideo);
      const draw = () => {
        if (!recording || paused) return;
        if (previewVideo?.readyState >= 2) {
          canvasContext.drawImage(previewVideo, sourceCrop.x, sourceCrop.y, sourceCrop.width, sourceCrop.height, 0, 0, outputCanvas.width, outputCanvas.height);
        }
        renderFrame = requestAnimationFrame(draw);
      };
      draw();
    }
  }

  function stop() {
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function getElapsedSeconds() {
    if (paused || !recording) return elapsedBeforePause;
    return elapsedBeforePause + Math.floor((Date.now() - startedAt) / 1000);
  }

  function getState() { return { recording, paused, stream: displayStream, fileName: currentFileName }; }

  function stopMicAndAudio() {
    micStream?.getTracks().forEach(track => track.stop());
    micStream = null;
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
    outputStream?.getTracks().forEach(track => track.stop());
    outputStream = null;
    displayStream?.getTracks().forEach(track => track.stop());
    displayStream = null;
  }

  function stopCaptureStreams() {
    displayStream?.getTracks().forEach(track => track.stop());
    displayStream = null;
  }

  function makeFinalUrl(file) {
    if (finalBlobUrl) URL.revokeObjectURL(finalBlobUrl);
    finalBlobUrl = file ? URL.createObjectURL(file) : null;
    return finalBlobUrl;
  }

  return {
    chooseScreen, setCrop, setPreviewVideo, start, pause, resume, stop, getState,
    getElapsedSeconds, makeFinalUrl
  };
})();
