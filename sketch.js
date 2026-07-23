// noprotect

const canvas = document.getElementById('generativeCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

let circles = [];
let masterTimeline = null;
let globalTime = 0; 

let rafId = null;
let isPreviewing = true;
let isRecordingVideo = false; 

const BASE_CELL_SIZE = 10; 

// --- GENERATOR STATE VARIABLES ---
let numCirclesVal = 3;
let speedVal = .60;
let sizeVal = 1.0;     // NEW: Overall size multiplier
let spacingVal = 0.20; // Kept as a hardcoded value so stagger math works
let easingVal = .60; 
let opacityVal = 0.20; 
let dotSizeVal = 3.50;
let thicknessVal = 175; 
let startRadiusVal = 0; 

let currentBgColor = '#FFF6E5'; 
let currentColor1 = '#FFE4B2';  
let currentColor2 = '#184B48';

// --- CUSTOM UI FRAMEWORK ---
const BRAND_PALETTE = [
  '#FFF6E5', '#FFE4B2', '#FFCA66', '#FFA600', '#FF6801', '#FF4800',
  '#F9FFEB', '#F0FECE', '#BEDCB0', '#7BA987', '#184B48', '#002F33',
  '#E5EFFE', '#ABCCFA', '#6FA8F7', '#456FF7', '#0B197A', '#02073B',
  '#ffffff', '#000000'
];

function closeAllDropdowns() {
  const picker = document.getElementById('custom-color-picker');
  if (picker) picker.style.display = 'none';
}

document.addEventListener("click", function(e) {
  if (!e.target.closest('#custom-color-picker')) closeAllDropdowns();
});

function applyCustomSlider(slotId, cfg) {
  const container = document.getElementById('slider-container-' + slotId);
  if(!container) return;

  const track = container.querySelector('.custom-slider-track');
  const fill = container.querySelector('.custom-slider-fill');
  const thumb = container.querySelector('.custom-slider-thumb');
  const valDisplay = document.getElementById('val-' + slotId);
  const sliderEl = container.querySelector('.custom-slider');

  let isDragging = false;

  function updateUI(val) {
    const pct = (val - cfg.min) / (cfg.max - cfg.min);
    fill.style.width = `calc(${pct * 100}% - ${pct * 10}px + 5px)`;
    thumb.style.left = `calc(${pct * 100}% - ${pct * 10}px)`;
    if (valDisplay) valDisplay.innerText = Number(val).toFixed(cfg.step < 1 ? 2 : 1); 
  }

  function calculateValue(clientX) {
    const rect = track.getBoundingClientRect();
    let pct = (clientX - (rect.left + 5)) / (rect.width - 10);
    pct = Math.max(0, Math.min(1, pct));
    let rawVal = cfg.min + pct * (cfg.max - cfg.min);
    let snappedVal = Math.round(rawVal / cfg.step) * cfg.step;
    return Math.max(cfg.min, Math.min(cfg.max, snappedVal));
  }

  function onMove(e) {
    if (!isDragging) return;
    e.preventDefault(); 
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const v = calculateValue(clientX);
    updateUI(v);
    cfg.onChange(v);
  }

  function onUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  }

  sliderEl.addEventListener('mousedown', (e) => {
    isDragging = true;
    const v = calculateValue(e.clientX);
    updateUI(v);
    cfg.onChange(v);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  sliderEl.addEventListener('touchstart', (e) => {
    isDragging = true;
    const v = calculateValue(e.touches[0].clientX);
    updateUI(v);
    cfg.onChange(v);
    document.addEventListener('touchmove', onMove, {passive: false});
    document.addEventListener('touchend', onUp);
  }, {passive: true});

  updateUI(cfg.val);
}

// --- COLOR PICKER LOGIC ---
function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  let bigint = parseInt(hex, 16);
  if (hex.length === 3) {
      bigint = parseInt(hex.split('').map(x => x+x).join(''), 16);
  }
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

// Automatically switch UI text to white if background is dark
function checkTheme() {
  let rgb = hexToRgb(currentBgColor);
  let luminance = (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114);
  const controls = document.getElementById('controls');
  if (luminance < 130) {
    controls.classList.add('dark-theme');
  } else {
    controls.classList.remove('dark-theme');
  }
}

window.updateGlobalColor = function(type, hex) {
  if (type === 'bg') {
    currentBgColor = hex;
    checkTheme();
  }
  if (type === 'c1') currentColor1 = hex;
  if (type === 'c2') currentColor2 = hex;

  const labelSpan = document.getElementById(`swatch-label-${type}`);
  if (labelSpan) labelSpan.innerText = hex.toUpperCase().replace('#', '');
  const swatch = document.getElementById(`swatch-color-${type}`);
  if(swatch) swatch.style.background = hex;
  
  if(isPreviewing && !isRecordingVideo) updateAndPlay(); 
}

window.openCustomColorPicker = function(e, type, currentHex) {
  e.stopPropagation();
  closeAllDropdowns();

  let picker = document.getElementById('custom-color-picker');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'custom-color-picker';
    picker.style.position = 'absolute';
    picker.style.top = 'calc(100% + 4px)';
    picker.style.left = '0px';
    picker.style.zIndex = '9999';
    picker.addEventListener('click', (ev) => ev.stopPropagation());
  }

  e.currentTarget.appendChild(picker);
  picker.style.display = '';

  let gridHTML = '<div class="custom-picker-grid">';
  BRAND_PALETTE.forEach(hex => {
    gridHTML += `<div class="custom-picker-swatch" style="background: ${hex}; border: ${hex.toLowerCase()==='#ffffff'?'1px solid #ccc':'none'}" 
                 onclick="window.updateGlobalColor('${type}', '${hex}'); closeAllDropdowns();"></div>`;
  });
  gridHTML += '</div>';

  let hexValue = currentHex.replace('#', '');
  let hexInputHTML = `
    <div class="custom-picker-footer">
      <div id="custom-picker-preview" class="custom-picker-preview" style="background: ${currentHex};"></div>
      <span class="custom-picker-hex-prefix">#</span>
      <input type="text" class="custom-picker-input" value="${hexValue}" maxlength="6"
          oninput="
            let val = this.value.replace(/[^0-9A-Fa-f]/g, '');
            this.value = val;
            if(val.length === 6 || val.length === 3) {
              window.updateGlobalColor('${type}', '#' + val);
              document.getElementById('custom-picker-preview').style.background = '#' + val;
            }
          ">
    </div>`; 

  picker.innerHTML = gridHTML + hexInputHTML;
};

function renderColorRows() {
  const container = document.getElementById('ui-color-swatches');
  if (!container) return;

  const createSwatchHTML = (hex, type, labelStr) => {
    let h = (hex || '#000000').toUpperCase();
    return `
      <div class="color-row" onclick="window.openCustomColorPicker(event, '${type}', '${h}')">
        <div class="color-left">
          <span class="swatch" id="swatch-color-${type}" style="background:${h};"></span>
          <span style="opacity:0.6; font-size:9.5px; font-weight:bold; margin-right:4px;">${labelStr}</span>
          <span id="swatch-label-${type}">${h.replace('#','')}</span>
        </div>
        <span class="pct">100%</span>
      </div>
    `; 
  };

  container.innerHTML = 
    createSwatchHTML(currentBgColor, 'bg', 'BG') +
    createSwatchHTML(currentColor1, 'c1', 'C1') +
    createSwatchHTML(currentColor2, 'c2', 'C2');
}

// --- GENERATOR LOGIC ---

function updateAndPlay() { 
  initCircles(); 
  playAnimation(); 
}

function setupInitialCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function initCircles() {
  circles = [];
  const num = parseInt(numCirclesVal);
  const cx = canvas.width / 2, cy = canvas.height / 2;

  for (let i = 0; i < num; i++) {
    circles.push({ radius: 0, alpha: 0, x: cx, y: cy });
  }
}

function playAnimation() {
  if (masterTimeline) masterTimeline.kill();
  
  // Set timeline to loop seamlessly (0 delay)
  masterTimeline = gsap.timeline({
    repeat: isRecordingVideo ? 0 : -1,
    repeatDelay: 0.0 
  });
  
  gsap.killTweensOf(circles);
  
  circles.forEach(c => { 
    c.radius = parseFloat(startRadiusVal); 
    c.alpha = 0; 
  });
  
  globalTime = 0; 

  // Reduce base duration since we're no longer animating far off-screen
  const duration = 3.5 / speedVal; 
  
  // Multiply max radius by the new sizeVal
  const maxRadius = (Math.hypot(canvas.width / 2, canvas.height / 2) + 150) * sizeVal;
  
  const maxStagger = (circles.length > 1 ? circles.length - 1 : 1) * ((duration / circles.length) * spacingVal);

  circles.forEach((c, i) => {
    const progress = circles.length > 1 ? i / (circles.length - 1) : 0;
    const curve = Math.pow(progress, parseFloat(easingVal)); 
    const startTime = curve * maxStagger;
    
    masterTimeline.fromTo(c, {
      radius: parseFloat(startRadiusVal)
    }, {
      radius: maxRadius,
      duration: duration,
      ease: "power2.out" 
    }, startTime);

    masterTimeline.fromTo(c, {
      alpha: 0
    }, {
      alpha: 1,
      duration: duration * 0.05, 
      ease: "none"
    }, startTime).to(c, {
      alpha: 0,
      duration: duration * 0.1,
      ease: "power2.in" 
    }, startTime + (duration * 0.9));
  });
}

function drawBackground() {
  ctx.fillStyle = currentBgColor; 
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function renderFrame() {
  drawBackground();
  if (!isRecordingVideo) globalTime += 0.015; 

  const c1Rgb = hexToRgb(currentColor1);
  const c2Rgb = hexToRgb(currentColor2);

  if (circles.length === 0) return;

  const scale = canvas.width / 1920;
  const cellSize = BASE_CELL_SIZE * scale;
  const ringThickness = parseFloat(thicknessVal) * scale;
  let baseDotSize = parseFloat(dotSizeVal) * scale;

  const cols = Math.ceil(canvas.width / cellSize);
  const rows = Math.ceil(canvas.height / cellSize);
  
  // Scale the boundary tracking proportionally so fading still works smoothly
  const maxR = (Math.hypot(canvas.width / 2, canvas.height / 2) + 150) * sizeVal;

  for (let gy = 0; gy <= rows; gy++) {
    for (let gx = 0; gx <= cols; gx++) {
      const px = gx * cellSize + cellSize / 2;
      const py = gy * cellSize + cellSize / 2;
      
      let highestLight = 0;
      let hitDx = 0;

      const cellNoise = (Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453) % 1;
      const sizeVariation = 0.4 + Math.abs(cellNoise) * 1.2; 

      for (let j = 0; j < circles.length; j++) {
        const c = circles[j];
        if (c.alpha <= 0.01) continue;

        const dx = px - c.x;
        const dy = py - c.y;
        
        // Dynamic Squash (Circle to Oval)
        const squashProgress = Math.min(1, c.radius / (maxR * 0.7)); 
        const dynamicSquash = 1.0 + (0.8 * Math.pow(squashProgress, 0.8)); 

        const dist = Math.hypot(dx, dy * dynamicSquash);
        const distToRing = Math.abs(dist - c.radius);
        const effectiveThickness = Math.min(ringThickness, c.radius * 0.8);

        if (distToRing < effectiveThickness) {
          hitDx = dx; 
          
          // --- SPATIAL FADE MATH (Inner vs Outer Contrast) ---
          const fadeProgress = Math.min(1, c.radius / maxR);
          const spatialFadeExponent = opacityVal * 5.0; 
          const spatialFade = Math.pow(1.0 - fadeProgress, spatialFadeExponent);

          const ringShape = Math.pow(1 - (distToRing / effectiveThickness), 0.7);
          
          const intensity = ringShape * c.alpha * spatialFade;
          highestLight = Math.max(highestLight, intensity);
        }
      }

      if (highestLight >= 0.05) {
        const finalAlpha = highestLight; 
        const mix = Math.max(0, Math.min(1, (hitDx / (canvas.width * 0.5) + 1) * 0.5));
        
        ctx.fillStyle = `rgba(${c1Rgb.r + (c2Rgb.r - c1Rgb.r) * mix}, ${c1Rgb.g + (c2Rgb.g - c1Rgb.g) * mix}, ${c1Rgb.b + (c2Rgb.b - c1Rgb.b) * mix}, ${finalAlpha})`;
        
        ctx.beginPath();
        let dynamicRadius = Math.max(0.5 * scale, baseDotSize * highestLight * sizeVariation); 
        ctx.arc(px, py, dynamicRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function renderLoop() {
  if (isPreviewing && !isRecordingVideo) {
    renderFrame();
    rafId = requestAnimationFrame(renderLoop);
  }
}

// --- VIDEO EXPORT ENGINE ---
const exportHdBtn = document.getElementById('exportHdBtn'); 
const export4kBtn = document.getElementById('export4kBtn'); 
const exportPngBtn = document.getElementById('exportPngBtn');
const recordingStatus = document.getElementById('recordingStatus');

async function startVideoExport(exportWidth, exportHeight, activeBtn) {
  if (isRecordingVideo) return;
  if (typeof WebMMuxer === 'undefined' || typeof VideoEncoder === 'undefined') {
    alert("Browser does not support offline video encoding.");
    return;
  }

  isRecordingVideo = true;
  activeBtn.disabled = true;
  const originalBtnText = activeBtn.innerText;
  activeBtn.innerText = "Preparing...";
  
  exportHdBtn.disabled = true;
  export4kBtn.disabled = true;

  recordingStatus.classList.remove('hidden');
  recordingStatus.innerText = `🔴 Rendering ${exportWidth}x${exportHeight}...`;

  const origW = window.innerWidth;
  const origH = window.innerHeight;
  
  canvas.width = exportWidth;
  canvas.height = exportHeight;

  initCircles();
  playAnimation();
  masterTimeline.pause();
  
  const fps = 60; 
  // Add 1.0 second pause solely to the exported video's duration
  const totalDuration = masterTimeline.duration() + 1.0; 
  const totalFrames = Math.ceil(fps * totalDuration);

  const videoBitrate = exportWidth > 2000 ? 50_000_000 : 25_000_000;

  let muxer = new WebMMuxer.Muxer({
    target: new WebMMuxer.ArrayBufferTarget(),
    video: { codec: 'V_VP9', width: exportWidth, height: exportHeight, frameRate: fps }
  });

  let videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => console.error("Encoding error:", e)
  });

  videoEncoder.configure({ 
    codec: 'vp09.00.10.08', 
    width: exportWidth, 
    height: exportHeight, 
    bitrate: videoBitrate, 
    framerate: fps 
  });

  await new Promise((resolve) => {
    let frameIdx = 0;
    function encodeNextBatch() {
      if (frameIdx >= totalFrames) { resolve(); return; }
      
      if (videoEncoder.encodeQueueSize > 20) { setTimeout(encodeNextBatch, 20); return; }

      const time = frameIdx / fps;
      masterTimeline.totalTime(time);
      globalTime = time; 
      
      renderFrame();
      
      let frame = new VideoFrame(canvas, { timestamp: time * 1e6 });
      videoEncoder.encode(frame, { keyFrame: frameIdx % 60 === 0 });
      frame.close();
      
      frameIdx++;
      
      recordingStatus.innerText = `🔴 Rendering ${exportWidth}x${exportHeight}... ${Math.floor((frameIdx / totalFrames) * 100)}%`;
      
      setTimeout(encodeNextBatch, 5); 
    }
    encodeNextBatch();
  });

  await videoEncoder.flush();
  muxer.finalize();

  let blob = new Blob([muxer.target.buffer], { type: 'video/webm' });
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a'); a.href = url;
  a.download = `MotionExport_${exportWidth}x${exportHeight}_${Date.now()}.webm`; 
  a.click();
  URL.revokeObjectURL(url);

  canvas.width = origW; 
  canvas.height = origH;
  
  initCircles();
  isRecordingVideo = false;
  
  exportHdBtn.disabled = false; 
  export4kBtn.disabled = false;
  activeBtn.innerText = originalBtnText;
  recordingStatus.classList.add('hidden');
  
  playAnimation(); 
  rafId = requestAnimationFrame(renderLoop);
}

exportHdBtn.addEventListener('click', () => startVideoExport(1920, 1080, exportHdBtn));
export4kBtn.addEventListener('click', () => startVideoExport(3840, 2160, export4kBtn));

// --- INIT UI BINDINGS ---

window.addEventListener('resize', () => {
  if(!isRecordingVideo) {
    setupInitialCanvas();
    initCircles();
    playAnimation();
  }
});

// Bootstrap UI
document.addEventListener('DOMContentLoaded', () => {
  applyCustomSlider('complexity', { min: 1, max: 20, step: 1, val: numCirclesVal, onChange: (v) => { numCirclesVal = v; updateAndPlay(); }});
  
  // NEW: Size slider binding
  applyCustomSlider('size', { min: 0.1, max: 3.0, step: 0.1, val: sizeVal, onChange: (v) => { sizeVal = v; updateAndPlay(); }});
  
  applyCustomSlider('speed', { min: 0.2, max: 3.0, step: 0.1, val: speedVal, onChange: (v) => { speedVal = v; updateAndPlay(); }});
  applyCustomSlider('easing', { min: 0.1, max: 3.0, step: 0.1, val: easingVal, onChange: (v) => { easingVal = v; updateAndPlay(); }});
  applyCustomSlider('opacity', { min: 0.0, max: 1.0, step: 0.05, val: opacityVal, onChange: (v) => { opacityVal = v; updateAndPlay(); }});
  applyCustomSlider('dotsize', { min: 1, max: 10, step: 0.5, val: dotSizeVal, onChange: (v) => { dotSizeVal = v; updateAndPlay(); }});
  applyCustomSlider('thickness', { min: 10, max: 200, step: 1, val: thicknessVal, onChange: (v) => { thicknessVal = v; updateAndPlay(); }});
  applyCustomSlider('startradius', { min: 0, max: 200, step: 1, val: startRadiusVal, onChange: (v) => { startRadiusVal = v; updateAndPlay(); }});

  renderColorRows();
  checkTheme(); 
  setupInitialCanvas();
  initCircles();
  playAnimation();
  renderLoop();
});
