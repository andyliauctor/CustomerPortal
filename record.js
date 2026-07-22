const exportBtn = document.getElementById('exportBtn');
const recordingStatus = document.getElementById('recordingStatus');

exportBtn.addEventListener('click', async () => {

  if (!window.VideoEncoder) {
    alert("Your browser does not support offline video encoding.");
    return;
  }

  if (exportBtn.disabled) return;

  exportBtn.innerText = "Preparing 2K...";
  exportBtn.disabled = true;

  recordingStatus.classList.remove('hidden');
  recordingStatus.innerText = "🔴 Resizing canvas to 2K & rendering...";

  const canvas = window.GenerativeArt.canvas;

  // ----------------------------------------
  // STORE ORIGINAL SIZE & TIME
  // ----------------------------------------
  const originalWidth = canvas.width;
  const originalHeight = canvas.height;
  const originalTime = window.GenerativeArt.getTimeline().totalTime();

  // pause preview safely BEFORE rebuilding
  window.GenerativeArt.pausePreview();

  // ----------------------------------------
  // RESIZE TO 2K & REBUILD SCENE
  // ----------------------------------------
  // Triggers initCircles() so positions adapt to 2560x1440
  window.GenerativeArt.updateDimensions(2560, 1440);

  // Fetch the freshly generated GSAP timeline and pause it to stop it from auto-playing
  const timeline = window.GenerativeArt.getTimeline();
  timeline.pause();

  const renderFrame = window.GenerativeArt.renderFrame;

  const fps = 60;
  const durationSecs = 6.0;
  const totalFrames = fps * durationSecs;

  // ----------------------------------------
  // MUXER
  // ----------------------------------------

  let muxer = new WebMMuxer.Muxer({
    target: new WebMMuxer.ArrayBufferTarget(),
    video: {
      codec: 'V_VP9',
      width: 2560,
      height: 1440,
      frameRate: fps
    }
  });

  // ----------------------------------------
  // ENCODER
  // ----------------------------------------

  let videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => console.error("Encoding error:", e)
  });

  videoEncoder.configure({
    codec: 'vp09.00.10.08',
    width: 2560,
    height: 1440,
    bitrate: 25_000_000,
    framerate: fps
  });

  // ----------------------------------------
  // RENDER FRAMES
  // ----------------------------------------

  await new Promise((resolve) => {
    let i = 0;

    async function processNextBatch() {
      let batchEnd = Math.min(i + 5, totalFrames);

      while (i < batchEnd) {
        const time = i / fps;

        timeline.totalTime(time);
        renderFrame();

        let frame = new VideoFrame(canvas, {
          timestamp: time * 1e6
        });

        videoEncoder.encode(frame, {
          keyFrame: i % 60 === 0
        });

        frame.close();
        i++;
      }

      // avoid encoder overload
      if (videoEncoder.encodeQueueSize > 20) {
        await new Promise(r => setTimeout(r, 10));
      }

      exportBtn.innerText = `Rendering 2K... ${Math.round((i / totalFrames) * 100)}%`;

      if (i < totalFrames) {
        requestAnimationFrame(processNextBatch);
      } else {
        resolve();
      }
    }

    processNextBatch();
  });

  // ----------------------------------------
  // FINALIZE
  // ----------------------------------------

  await videoEncoder.flush();
  muxer.finalize();

  let blob = new Blob(
    [muxer.target.buffer],
    { type: 'video/webm' }
  );

  let url = URL.createObjectURL(blob);
  let a = document.createElement('a');
  a.href = url;
  a.download = 'generative-circles-2k.webm';
  a.click();
  URL.revokeObjectURL(url);

  // ----------------------------------------
  // RESTORE
  // ----------------------------------------

  // Rebuild the layout specifically for the browser size again
  window.GenerativeArt.updateDimensions(originalWidth, originalHeight);
  
  // Grab the rebuilt timeline, pause it, and restore the preview's exact playhead time
  const restoredTimeline = window.GenerativeArt.getTimeline();
  restoredTimeline.pause(); 
  restoredTimeline.totalTime(originalTime);

  window.GenerativeArt.resumePreview();

  exportBtn.innerText = "Export 2K Video";
  exportBtn.disabled = false;
  recordingStatus.classList.add('hidden');

});