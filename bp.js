// ====== 小工具：localStorage 歷史 ======
const LS_KEY = "bp_history_v1";
let history = JSON.parse(localStorage.getItem(LS_KEY) || "[]");

function saveHistory() {
  localStorage.setItem(LS_KEY, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const el = document.getElementById("history");
  if (!history.length) {
    el.innerHTML = "<small>尚無資料</small>";
    return;
  }
  const rows = history.map(h =>
    `<div><b>t=${h.t}</b> SYS=${h.sys} / DIA=${h.dia} <small>(${new Date(h.ts).toLocaleString()})</small></div>`
  ).join("");
  el.innerHTML = rows;
}
renderHistory();

// ====== UI ======
const fileEl = document.getElementById("file");
const previewEl = document.getElementById("preview");
const canvasEl = document.getElementById("canvas");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const judgeOutEl = document.getElementById("judgeOut");

let last = { sys: null, dia: null, confidence: 0 };

fileEl.addEventListener("change", () => {
  const f = fileEl.files?.[0];
  if (!f) return;
  previewEl.src = URL.createObjectURL(f);
  resultEl.textContent = "已選擇圖片，按「辨識」";
  judgeOutEl.textContent = "";
});

document.getElementById("btnClear").addEventListener("click", () => {
  history = [];
  saveHistory();
});

document.getElementById("btnRecognize").addEventListener("click", async () => {
  if (!window.__cvReady) { alert("OpenCV.js 尚未載入完成"); return; }
  const f = fileEl.files?.[0];
  if (!f) { alert("請先選擇圖片"); return; }

  statusEl.textContent = "處理中…";
  const img = await loadImageFromFile(f);

  // 把圖畫到 canvas，OpenCV.js 用 cv.imread(canvas) 讀取
  const ctx = canvasEl.getContext("2d");
  canvasEl.width = img.naturalWidth;
  canvasEl.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  try {
    const out = recognizeSYS_DIA_FromCanvas(canvasEl);
    if (out.sys == null || out.dia == null) {
      resultEl.innerHTML = `<span class="bad">辨識失敗</span>：建議先裁切到螢幕區域、避免反光再試一次`;
      statusEl.textContent = "就緒";
      return;
    }

    last = out;
    resultEl.innerHTML = `SYS: <b>${out.sys}</b> / DIA: <b>${out.dia}</b>（confidence: ${out.confidence.toFixed(2)}）`;

    history.push({ t: history.length, sys: out.sys, dia: out.dia, ts: Date.now() });
    saveHistory();

    document.getElementById("btnJudge").disabled = false;
    statusEl.textContent = "就緒 ✅";
  } catch (e) {
    console.error(e);
    resultEl.innerHTML = `<span class="bad">錯誤</span>：${String(e)}`;
    statusEl.textContent = "就緒";
  }
});

document.getElementById("btnJudge").addEventListener("click", () => {
  if (last.sys == null || last.dia == null) { alert("請先辨識"); return; }
  const t = history.length - 1;

  const a_sys = parseFloat(document.getElementById("a_sys").value);
  const b_sys = parseFloat(document.getElementById("b_sys").value);
  const a_dia = parseFloat(document.getElementById("a_dia").value);
  const b_dia = parseFloat(document.getElementById("b_dia").value);
  const thr = parseFloat(document.getElementById("thr").value);

  const s = judgeOne(last.sys, a_sys, b_sys, t, thr);
  const d = judgeOne(last.dia, a_dia, b_dia, t, thr);

  const overall = (s.out || d.out)
    ? `<span class="bad">脫模（偏離趨勢）</span>`
    : `<span class="good">正常（符合趨勢）</span>`;

  judgeOutEl.innerHTML = `
    <div><b>總結：</b>${overall}</div>
    <div>SYS：ŷ=${s.yhat.toFixed(2)}，誤差=${s.err.toFixed(2)} → ${s.out ? '<span class="bad">脫模</span>' : '<span class="good">正常</span>'}</div>
    <div>DIA：ŷ=${d.yhat.toFixed(2)}，誤差=${d.err.toFixed(2)} → ${d.out ? '<span class="bad">脫模</span>' : '<span class="good">正常</span>'}</div>
  `;
});

function judgeOne(y, a, b, t, thr) {
  const yhat = a * t + b;
  const err = y - yhat;
  return { yhat, err, out: Math.abs(err) > thr };
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ====== 七段辨識（OpenCV.js） ======
const SEG_MAP = new Map([
  ["1111110", 0],
  ["0110000", 1],
  ["1101101", 2],
  ["1111001", 3],
  ["0110011", 4],
  ["1011011", 5],
  ["1011111", 6],
  ["1110000", 7],
  ["1111111", 8],
  ["1111011", 9],
]);

function recognizeSYS_DIA_FromCanvas(canvas) {
  let src = cv.imread(canvas);
  let gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // 可選：CLAHE（某些 build 沒有也不影響）
  try {
    const clahe = new cv.CLAHE(2.0, new cv.Size(8,8));
    let tmp = new cv.Mat();
    clahe.apply(gray, tmp);
    gray.delete();
    gray = tmp;
    clahe.delete();
  } catch (_) {}

  let blur = new cv.Mat();
  cv.GaussianBlur(gray, blur, new cv.Size(5,5), 0);

  let bin = new cv.Mat();
  cv.adaptiveThreshold(
    blur, bin, 255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    31, 5
  );

  // morphology open
  let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3,3));
  let opened = new cv.Mat();
  cv.morphologyEx(bin, opened, cv.MORPH_OPEN, kernel);

  const boxes = findDigitBoxes(opened);
  const [top, bottom] = splitRows(boxes);

  const sys = readRow(opened, top);
  const dia = readRow(opened, bottom);

  const confidence = Math.min(sys.conf, dia.conf);

  // cleanup
  src.delete(); gray.delete(); blur.delete(); bin.delete(); kernel.delete(); opened.delete();

  return {
    sys: sys.val,
    dia: dia.val,
    confidence,
    sys_conf: sys.conf,
    dia_conf: dia.conf,
  };
}

function findDigitBoxes(binMat) {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(binMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const H = binMat.rows, W = binMat.cols;
  const minArea = H * W * 0.0005;

  const boxes = [];
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const r = cv.boundingRect(c);
    const area = r.width * r.height;
    if (area < minArea) { c.delete(); continue; }
    if (r.height < 15 || r.width < 8) { c.delete(); continue; }

    const ar = r.width / r.height;
    if (ar < 0.15 || ar > 1.2) { c.delete(); continue; }

    boxes.push({ x:r.x, y:r.y, w:r.width, h:r.height });
    c.delete();
  }
  contours.delete(); hierarchy.delete();

  boxes.sort((a,b)=>a.x-b.x);
  return boxes;
}

function splitRows(boxes) {
  if (!boxes.length) return [[], []];
  const centers = boxes.map(b => b.y + b.h/2).sort((a,b)=>a-b);
  const mid = centers[Math.floor(centers.length/2)];

  const top = [], bottom = [];
  for (const b of boxes) (b.y + b.h/2 < mid ? top : bottom).push(b);

  top.sort((a,b)=>a.x-b.x);
  bottom.sort((a,b)=>a.x-b.x);
  return [top, bottom];
}

function readRow(binMat, boxes) {
  const digits = [];
  const confs = [];
  for (const b of boxes) {
    const out = readOneDigit(binMat, b, 0.45);
    if (out.digit == null) continue;
    digits.push(out.digit);
    confs.push(out.conf);
  }
  if (!digits.length) return { val: null, conf: 0.0 };
  const val = parseInt(digits.join(""), 10);
  const conf = confs.reduce((a,b)=>a+b,0) / confs.length;
  return { val, conf };
}

function readOneDigit(binMat, box, segOnThresh) {
  const roiRect = new cv.Rect(box.x, box.y, box.w, box.h);
  const roi = binMat.roi(roiRect);

  // 七段相對區域（比例切割）
  const segs = [
    {x0:0.20,y0:0.02,x1:0.80,y1:0.18}, // a
    {x0:0.78,y0:0.15,x1:0.98,y1:0.50}, // b
    {x0:0.78,y0:0.52,x1:0.98,y1:0.88}, // c
    {x0:0.20,y0:0.84,x1:0.80,y1:0.98}, // d
    {x0:0.02,y0:0.52,x1:0.22,y1:0.88}, // e
    {x0:0.02,y0:0.15,x1:0.22,y1:0.50}, // f
    {x0:0.20,y0:0.43,x1:0.80,y1:0.60}, // g
  ];

  const on = [];
  const strengths = [];

  for (const s of segs) {
    const x = Math.floor(s.x0 * roi.cols);
    const y = Math.floor(s.y0 * roi.rows);
    const w = Math.max(1, Math.floor((s.x1 - s.x0) * roi.cols));
    const h = Math.max(1, Math.floor((s.y1 - s.y0) * roi.rows));
    const r = new cv.Rect(x, y, Math.min(w, roi.cols - x), Math.min(h, roi.rows - y));
    const sub = roi.roi(r);

    const nz = cv.countNonZero(sub);
    const ratio = nz / (sub.rows * sub.cols);
    strengths.push(ratio);
    on.push(ratio > segOnThresh ? 1 : 0);

    sub.delete();
  }

  const key = on.join("");
  const digit = SEG_MAP.has(key) ? SEG_MAP.get(key) : null;

  // 簡單信心值：段亮比例離 0.5 越遠通常越穩（0~1）
  const conf = clamp(avg(strengths.map(v => Math.abs(v - 0.5))) * 2.0, 0, 1);

  roi.delete();
  return { digit, conf, key };
}

function avg(arr){ return arr.reduce((a,b)=>a+b,0)/arr.length; }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
