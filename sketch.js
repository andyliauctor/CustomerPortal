const canvas = document.getElementById('generativeCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

let circles = [];
let animationTimeline;
let globalTime = 0; 

let rafId = null;
let isPreviewing = true;
let isRecordingVideo = false; 

const CELL_SIZE = 10; 

// --- GENERATOR STATE VARIABLES ---
let currentPattern = 'concentric'; 
let currentAspectRatio = 'fill';
let numCirclesVal = 6;
let scaleFactorVal = 0.75;
let spreadFactorVal = 1.2;
let dotSizeVal = 3.0;

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
  document.querySelectorAll('.select-items').forEach(item => item.classList.add('select-hide'));
  document.querySelectorAll('.select-selected').forEach(btn => btn.classList.remove('active'));
  const picker = document.getElementById('custom-color-picker');
  if (picker) picker.style.display = 'none';
  document.querySelectorAll('.ui-panel').forEach(panel => panel.style.zIndex = '');
}

document.addEventListener("click", function(e) {
  if (!e.target.matches('.select-selected') && !e.target.closest('#custom-color-picker')) closeAllDropdowns();
});

function applyDropdown(selectId, items, defaultVal, callback) {
  const select = document.getElementById(selectId);
  if(!select) return;
  let btn = select.querySelector('.select-selected');
  let dropdown = select.querySelector('.select-items');
  if(!btn || !dropdown) return;
  
  const newBtn = btn.cloneNode(true);
  btn.replaceWith(newBtn);
  btn = newBtn;
  
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    const isOpening = dropdown.classList.contains('select-hide');
    closeAllDropdowns();
    if (isOpening) {
      btn.classList.add('active');
      dropdown.classList.remove('select-hide');
      dropdown.style.position = 'absolute';
      dropdown.style.top = 'calc(100% + 4px)'; 
      dropdown.style.left = '0px';
      dropdown.style.width = '100%';
      const parentPanel = select.closest('.ui-panel');
      if (parentPanel) parentPanel.style.zIndex = '999';
    }
  });

  dropdown.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div');
    div.innerText = item.label;
    div.addEventListener('click', function(e) {
      e.stopPropagation();
      btn.innerText = item.label;
      callback(item.value);
      dropdown.classList.add('select-hide');
      btn.classList.remove('active');
      const parentPanel = select.closest('.ui-panel');
      if (parentPanel) parentPanel.style.zIndex = '';
    });
    dropdown.appendChild(div);
  });
  
  const defItem = items.find(i => i.value === defaultVal) || items[0];
  if (defItem) btn.innerText = defItem.label;
}

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
    fill.style.width = `calc(${pct * 100}% - ${pct * 12}px + 6px)`;
    thumb.style.left = `calc(${pct * 100}% - ${pct * 12}px)`;
    if (valDisplay) valDisplay.innerText = Number(val).toFixed(cfg.step < 1 ? 2 : 0);
  }

  function calculateValue(clientX) {
    const rect = track.getBoundingClientRect();
    let pct = (clientX - (rect.left + 6)) / (rect.width - 12);
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
window.updateGlobalColor = function(type, hex) {
  if (type === 'bg') currentBgColor = hex;
  if (type === 'c1') currentColor1 = hex;
  if (type === 'c2') currentColor2 = hex;

  const labelSpan = document.getElementById(`swatch-label-${type}`);
  if (labelSpan) labelSpan.innerText = hex.toUpperCase().replace('#', '');
  const swatch = document.getElementById(`swatch-color-${type}`);
  if(swatch) swatch.style.background = hex;
  
  if(isPreviewing && !isRecordingVideo) renderFrame();
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
  const parentPanel = e.currentTarget.closest('.ui-panel');
  if (parentPanel) parentPanel.style.zIndex = '999';

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
          <span style="color:#aaa; font-size:10px; font-weight:bold; margin-right:4px;">${labelStr}</span>
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
function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  let bigint = parseInt(hex, 16);
  if (hex.length === 3) {
      bigint = parseInt(hex.split('').map(x => x+x).join(''), 16);
  }
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function updateAndPlay() { 
  resizeCanvas(); 
  initCircles(); 
  playAnimation(); 
}

function resizeCanvas() {
  let targetW = window.innerWidth;
  let targetH = window.innerHeight;

  if (currentAspectRatio !== 'fill') {
    const parts = currentAspectRatio.split(':');
    const ratio = parseInt(parts[0]) / parseInt(parts[1]);
    if (targetW / targetH > ratio) targetW = targetH * ratio;
    else targetH = targetW / ratio;
  }

  canvas.width = Math.floor(targetW / 2) * 2;
  canvas.height = Math.floor(targetH / 2) * 2;
}

function initCircles() {
  circles = [];
  const mode = currentPattern;

  const num = parseInt(numCirclesVal);
  const scaleF = parseFloat(scaleFactorVal);
  const spreadF = parseFloat(spreadFactorVal);
  const maxR = Math.min(canvas.width, canvas.height) * 0.35;
  const cx = canvas.width / 2, cy = canvas.height / 2;

  if (mode === 'venn') {
    const offset = (maxR * 0.4) * spreadF; 
    for (let i = 0; i < num; i++) {
      let r = (maxR * 0.8) * Math.pow(scaleF, i);
      circles.push({ baseR: r, squashY: 1.0, scale: 0, rotation: 0, type: 'vennTop', baseY: cy - offset, x: cx, y: cy - offset });
      circles.push({ baseR: r, squashY: 1.0, scale: 0, rotation: 0, type: 'vennBottom', baseY: cy + offset, x: cx, y: cy + offset });
    }
  } else if (mode === 'concentric') {
    for (let i = 0; i < num; i++) {
      let r = maxR * Math.pow(scaleF, i);
      circles.push({ baseR: r * 1.5, squashY: 0.45, scale: 0, rotation: 0, type: 'rift', baseY: cy, x: cx, y: cy });
    }
  } else if (mode === 'phyll') {
    let count = Math.floor(num * 1.5);
    for (let i = 0; i < count; i++) {
      let a = i * 137.5 * (Math.PI / 180);
      let r = maxR * Math.pow(scaleF, i / 1.5);
      let offsetDist = (maxR * 0.25) * spreadF * Math.sqrt(i / count);
      circles.push({ baseR: r, squashY: 1.0, scale: 0, rotation: 0, type: 'spiral', baseY: cy + Math.sin(a)*offsetDist, x: cx + Math.cos(a)*offsetDist, y: cy + Math.sin(a)*offsetDist });
    }
  } else if (mode === 'infinity') {
    const offset = (maxR * 0.55) * spreadF; 
    for (let i = 0; i < num; i++) {
      let r = (maxR * 0.75) * Math.pow(scaleF, i);
      circles.push({ baseR: r, squashY: 0.9, scale: 0, rotation: 0, type: 'infLeft', baseY: cy, x: cx - offset, y: cy });
      circles.push({ baseR: r, squashY: 0.9, scale: 0, rotation: 0, type: 'infRight', baseY: cy, x: cx + offset, y: cy });
    }
  }
  circles.sort((a, b) => b.baseR - a.baseR);
}

function playAnimation() {
  if (animationTimeline) animationTimeline.kill();
  gsap.killTweensOf(circles);
  circles.forEach(c => { c.scale = 0; });
  globalTime = 0; 

  animationTimeline = gsap.timeline();
  let staggerTime = Math.min(0.03, 1 / (circles.length || 1));
  const breathDuration = 3.0; 

  animationTimeline.to(circles, { scale: 1, duration: 1.5, ease: "power3.out", stagger: { each: staggerTime, from: "center" } });

  if (currentPattern === 'venn') {
    const shift = 50; 
    animationTimeline.to(circles, {
      y: (i, t) => t.type === 'vennTop' ? t.baseY + shift : (t.type === 'vennBottom' ? t.baseY - shift : t.baseY),
      duration: breathDuration, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: { each: staggerTime, from: "center" }
    }, 1.0); 
  } else {
    animationTimeline.to(circles, {
      y: (i, t) => t.baseY + (i % 2 === 0 ? 15 : -15), 
      duration: breathDuration, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: { each: staggerTime, from: "center" }
    }, 1.0);
  }

  animationTimeline.to(circles, {
    scale: 0.92, duration: breathDuration, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: { each: staggerTime, from: "center" }
  }, 1.0);
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
  
  let baseDotSize = parseFloat(dotSizeVal);

  if (circles.length === 0) return;

  let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
  circles.forEach(c => {
    const maxStretch = Math.max(1, c.squashY);
    const pad = (c.baseR * c.scale * maxStretch) + (CELL_SIZE * 2);
    minX = Math.min(minX, c.x - pad); maxX = Math.max(maxX, c.x + pad);
    minY = Math.min(minY, c.y - pad); maxY = Math.max(maxY, c.y + pad);
  });

  const startCol = Math.max(0, Math.floor(minX / CELL_SIZE)), endCol = Math.min(Math.ceil(canvas.width / CELL_SIZE), Math.ceil(maxX / CELL_SIZE));
  const startRow = Math.max(0, Math.floor(minY / CELL_SIZE)), endRow = Math.min(Math.ceil(canvas.height / CELL_SIZE), Math.ceil(maxY / CELL_SIZE));

  for (let gy = startRow; gy <= endRow; gy++) {
    for (let gx = startCol; gx <= endCol; gx++) {
      const px = gx * CELL_SIZE + CELL_SIZE / 2, py = gy * CELL_SIZE + CELL_SIZE / 2;
      let hitCircle = null, hitDx = 0, highestLight = 0;

      for (let j = circles.length - 1; j >= 0; j--) {
        const c = circles[j];
        if (c.scale <= 0.01) continue;

        const dx = px - c.x, dy = py - c.y;
        const cosA = Math.cos(-c.rotation), sinA = Math.sin(-c.rotation);
        const rdx = dx * cosA - dy * sinA;
        const rdy = (dx * sinA + dy * cosA) / c.squashY;

        const dist = Math.sqrt(rdx * rdx + rdy * rdy);
        const currentR = c.baseR * c.scale;

        if (dist <= currentR) {
          hitCircle = c; hitDx = dx; 
          highestLight = Math.max(highestLight, Math.pow(1 - (dist / currentR), 0.65));
          break; 
        }
      }

      if (hitCircle && highestLight >= 0.1) {
        const mix = Math.max(0, Math.min(1, (hitDx / (hitCircle.baseR * hitCircle.scale) + 1) * 0.5));
        ctx.fillStyle = `rgba(${c1Rgb.r + (c2Rgb.r - c1Rgb.r) * mix}, ${c1Rgb.g + (c2Rgb.g - c1Rgb.g) * mix}, ${c1Rgb.b + (c2Rgb.b - c1Rgb.b) * mix}, ${0.55 + highestLight * 0.45})`;
        
        ctx.beginPath();
        let dynamicRadius = Math.max(1, baseDotSize * highestLight); 
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
const exportVideoBtn = document.getElementById('exportBtn'); 
const exportPngBtn = document.getElementById('exportPngBtn');
const recordingStatus = document.getElementById('recordingStatus');

async function startVideoExport() {
  if (isRecordingVideo) return;
  if (typeof WebMMuxer === 'undefined' || typeof VideoEncoder === 'undefined') {
    alert("Browser does not support offline video encoding.");
    return;
  }

  isRecordingVideo = true;
  exportVideoBtn.disabled = true;
  exportVideoBtn.innerText = "Preparing...";
  recordingStatus.classList.remove('hidden');
  recordingStatus.innerText = "🔴 Rendering 2K...";

  const origW = canvas.width; const origH = canvas.height;
  canvas.width = 2560; canvas.height = 1440;
  initCircles();
  playAnimation();
  animationTimeline.pause();
  
  const fps = 60; const durationSecs = 6.0; const totalFrames = fps * durationSecs;

  let muxer = new WebMMuxer.Muxer({
    target: new WebMMuxer.ArrayBufferTarget(),
    video: { codec: 'V_VP9', width: 2560, height: 1440, frameRate: fps }
  });

  let videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => console.error("Encoding error:", e)
  });

  videoEncoder.configure({ codec: 'vp09.00.10.08', width: 2560, height: 1440, bitrate: 25_000_000, framerate: fps });

  await new Promise((resolve) => {
    let frameIdx = 0;
    function encodeNextBatch() {
      if (frameIdx >= totalFrames) { resolve(); return; }
      if (videoEncoder.encodeQueueSize > 20) { setTimeout(encodeNextBatch, 20); return; }

      const batchLimit = Math.min(frameIdx + 5, totalFrames);
      for (; frameIdx < batchLimit; frameIdx++) {
        const time = frameIdx / fps;
        animationTimeline.totalTime(time);
        globalTime = time; 
        renderFrame();
        let frame = new VideoFrame(canvas, { timestamp: time * 1e6 });
        videoEncoder.encode(frame, { keyFrame: frameIdx % 60 === 0 });
        frame.close();
      }
      recordingStatus.innerText = `🔴 Rendering 2K... ${Math.floor((frameIdx / totalFrames) * 100)}%`;
      setTimeout(encodeNextBatch, 0); 
    }
    encodeNextBatch();
  });

  await videoEncoder.flush();
  muxer.finalize();

  let blob = new Blob([muxer.target.buffer], { type: 'video/webm' });
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a'); a.href = url;
  a.download = `MotionExport_2K_${Date.now()}.webm`; a.click();
  URL.revokeObjectURL(url);

  canvas.width = origW; canvas.height = origH;
  initCircles();
  isRecordingVideo = false;
  exportVideoBtn.disabled = false; exportVideoBtn.innerText = "Export 2K";
  recordingStatus.classList.add('hidden');
  playAnimation(); 
  rafId = requestAnimationFrame(renderLoop);
}

exportVideoBtn.addEventListener('click', startVideoExport);

exportPngBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `snapshot_${Date.now()}.png`; link.href = canvas.toDataURL('image/png'); link.click();
});

// --- INIT UI BINDINGS ---
document.getElementById('restartBtn').addEventListener('click', playAnimation);
window.addEventListener('resize', () => { if(isPreviewing && !isRecordingVideo) { resizeCanvas(); initCircles(); } });

// Bootstrap UI
document.addEventListener('DOMContentLoaded', () => {
  const modeItems = [
    {label: 'Concentric', value: 'concentric'},
    {label: 'Vertical Venn (Organic)', value: 'venn'},
    {label: 'Phyllotaxis Spiral', value: 'phyll'},
    {label: 'Infinity (Lemniscate)', value: 'infinity'}
  ];
  applyDropdown('select-pattern', modeItems, currentPattern, (v) => { currentPattern = v; updateAndPlay(); });

  const aspectItems = [
    {label: 'Fill Screen', value: 'fill'}, {label: '16:9 (Landscape)', value: '16:9'},
    {label: '1:1 (Square)', value: '1:1'}, {label: '9:16 (Portrait)', value: '9:16'}, {label: '4:3 (Standard)', value: '4:3'}
  ];
  applyDropdown('select-aspect', aspectItems, currentAspectRatio, (v) => { currentAspectRatio = v; updateAndPlay(); });

  applyCustomSlider('complexity', { min: 1, max: 40, step: 1, val: numCirclesVal, onChange: (v) => { numCirclesVal = v; updateAndPlay(); }});
  applyCustomSlider('scale', { min: 0.4, max: 0.95, step: 0.05, val: scaleFactorVal, onChange: (v) => { scaleFactorVal = v; updateAndPlay(); }});
  applyCustomSlider('spread', { min: 0.5, max: 4.0, step: 0.1, val: spreadFactorVal, onChange: (v) => { spreadFactorVal = v; updateAndPlay(); }});
  applyCustomSlider('dotsize', { min: 1, max: 10, step: 0.5, val: dotSizeVal, onChange: (v) => { dotSizeVal = v; if(isPreviewing) renderFrame(); }});

  renderColorRows();
  
  resizeCanvas();
  initCircles();
  playAnimation();
  renderLoop();
});