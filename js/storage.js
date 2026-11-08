// Local file destination and device storage helpers.
const LocalStorageManager = (() => {
  let directoryHandle = null;
  let directoryName = "";
  let lastFileHandle = null;

  const supported = () => "showDirectoryPicker" in window;

  async function chooseDirectory() {
    if (!supported()) throw new Error("Direct folder access is not supported in this browser. Use desktop Chrome or Edge.");
    directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    directoryName = directoryHandle.name || "Selected folder";
    return directoryName;
  }

  async function createRecordingFile(name) {
    if (!directoryHandle) throw new Error("Choose a save folder first.");
    lastFileHandle = await directoryHandle.getFileHandle(name, { create: true });
    return lastFileHandle.createWritable({ keepExistingData: false });
  }

  async function getStorageEstimate() {
    if (!navigator.storage?.estimate) return null;
    return navigator.storage.estimate();
  }

  function getDirectoryName() { return directoryName; }
  function getLastFileHandle() { return lastFileHandle; }
  function hasDirectory() { return Boolean(directoryHandle); }

  return { supported, chooseDirectory, createRecordingFile, getStorageEstimate, getDirectoryName, getLastFileHandle, hasDirectory };
})();
