# NextGen Screen Studio

## Run locally
1. Extract the ZIP.
2. Open the folder in VS Code.
3. Start a local server (`python -m http.server 5500` or VS Code Live Server).
4. Open `http://localhost:5500` in desktop Chrome or Edge.

## Features
- Dark / Light theme switch; the selected theme is remembered in this browser.
- Capture a screen, window, or browser tab using the browser's sharing picker.
- Select a precise recording region by dragging over the live preview.
- Record microphone and shared system/tab audio in one mixed audio track.
- High, Ultra, Maximum (4K target), and Standard quality presets.
- 30 / 60 FPS target, pause, resume, and stop controls.
- Save the finalized WebM video to a local folder selected by the user.
- Completion dialog with an in-app video player, file name, save folder, resolution, duration, and file size.
- Recent-session playback while the page remains open.
- Side-by-side video quality and frame-rate controls, each with a short explanation.
- Professional creator footer with verified WhatsApp and Telegram contact links.

## Seeking / video finalization
The recorder intentionally does not split the recording into one-second WebM fragments. It lets the browser finalize the WebM container before writing the finished file. This is intended to preserve the container metadata required for normal seeking (forward and backward) in compatible players.

**Important trade-off:** because the completed recording is held by the browser until finalization, very long recordings can use substantial RAM. Keep enough free memory available, especially for high-bitrate / 4K recordings. The final file is written to the selected folder after you press Stop.

## Audio notes
- Enable System / tab audio in the app and explicitly select the browser's audio-sharing option in the screen-share prompt.
- Enable Microphone if your narration should be included, then grant microphone permission.
- Desktop system audio availability depends on the browser, operating system, and capture source.

## Region capture notes
The selected region is relative to the live preview and is encoded through a canvas crop. The browser picker still determines which screen, window, or tab is initially shared.

## Quality notes
The app records at the selected region's available pixel dimensions, up to the chosen preset's width limit. A 4K output requires a source/region with enough pixels. Higher bitrate cannot restore detail that is not present in the source. Actual frame rate depends on the source, browser, and device.

## Browser and local-save notes
- Direct folder saving uses the File System Access API and is best supported in current desktop Chrome / Edge.
- Firefox may not support the folder picker used by this version.
- The browser cannot silently access Desktop; you must select and authorize a folder.
- Keep the browser open and prevent the computer from sleeping during recording and finalization.
- The application records WebM; MP4 export is not included.
