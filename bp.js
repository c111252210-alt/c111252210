const LS_KEY = "bp_history_v1";
let history = JSON.parse(localStorage.getItem(LS_KEY) || "[]");

function $(id){ return document.getElementById(id); }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
function avg(arr){ return arr.reduce((a,b)=>a+b,0)/arr.length; }

function renderHistory(){
  const el = $("bpHistory");
  if (!el) return;
  if (!history.length) { el.innerHTML = "<small>尚無資料</small>"; return; }
  el.innerHTML = history.map(h =>
    `<div><b>t=${h.t}</b> SYS=${h.sys} / DIA=${h.dia} <small>(${new Date(h.ts).toLocaleString()})</small></div>`
  ).join("");
}
function saveHistory(){
  localStorage.setItem(LS_KEY, JSON.stringify(history));
  renderHistory();
}
renderHistory();

let last = { sys:null, dia:null, confidence:0 };

// ===== 七段 mapping =====
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

// ===== UI 綁定（等 DOM ready）=====
window.addEventListener("DOMContentLoaded", () => {
  const fileEl = $("bpFile");
  const previewEl = $("bpPreview");
  const canvasEl = $("bpCanvas");
  const statusEl = $("bpStatus");
  const resultEl = $("bpResult");
  const judgeOutEl = $("bpJudgeOut");

  const recognizeBtn = $("bpRecognizeBtn");
  const judgeBtn = $("bpJudgeBtn");
  const clearBtn = $("bpClearBtn");

  if (!fileEl || !previewEl || !canvasEl || !resultEl || !recognizeBtn) return;

  fileEl.addEventListener("change", () => {
    const f = fileEl.files?.[0];
    if (!f) return;
    previewEl.src = URL.createObjectURL(f);
    resultEl.textContent = "已選擇圖片，按「辨識」";
    if (judgeOutEl) judgeOutEl.textContent = "";
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      history = [];
      saveHistory();
    });
  }

  recognizeBtn.addEventListener("click", async () => {
    if (!window.__cvReady || typeof cv === "undefined") {
      alert("OpenCV.js 尚未載入完成（請等一下或重新整理）");
      return;
    }
    const f = fileEl.files?.[0];
    if (!f) { alert("請先選擇圖片"); return; }

    if (statusEl) statusEl.textContent = "處理中…";

    const img = await loadImageFromFile(f);

    const ctx = canvasEl.getContext("2d");
    canvasEl.width = img.naturalWidth;
    canvasEl.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    try {
      const out = recognizeSYS_DIA_FromCanvas(canvasEl);
      if (out.sys == null || out.dia == null) {
        resultEl.innerHTML = `<span style="color:#b00020;font-weight:bold">辨識失敗</span>：建議先裁切到螢幕區域、避免反光再試一次`;
        if (statusEl) statusEl.textContent = "就緒";
        return;
      }

      last = out;
      resultEl.innerHTML = `SYS: <b>${out.sys}</b> / DIA: <b>${out.dia}</b>（confidence: ${out.confidence.toFixed(2)}）`;

      history.push({ t: history.length, sys: out.sys, dia: out.dia, ts: Date.now() });
      saveHistory();

      if (judgeBtn) judgeBtn.disabled = false;
      if (statusEl) statusEl.textContent = "就緒 ✅";
    } catch (e) {
      console.error(e);
      resultEl.innerHTML = `<span style="color:#b00020;font-weight:bold">錯誤</span>：${String(e)}`;
      if (statusEl) statusEl.textContent = "就緒";
    }
  });

  if (judgeBtn) {
    judgeBtn.addEventListener("click", () => {
      if (last.sys == null || last.dia == null) { alert("請先辨識"); return; }

      const t = history.length - 1;
      const a_sys = parseFloat($("bp_a_sys").value);
      const b_sys = parseFloat($("bp_b_sys").value);
      const a_dia = parseFloat($("bp_a_dia").value);
      const b_dia = parseFloat($("bp_b_dia").value);
      const thr = parseFloat($("bp_thr").value);

      const s = judgeOne(last.sys, a_sys, b_sys, t, thr);
      const d = judgeOne(last.dia, a_dia, b_dia, t, thr);

      const overall = (s.out || d.out)
        ? `<span style="color:#b00020;font-weight:bold">脫模（偏離趨勢）</span>`
        : `<span style="color:#0a7a2f;font-weight:bold">正常（符合趨勢）</span>`;

      if (judgeOutEl) {
        judgeOutEl.innerHTML = `
          <div><b>總結：</b>${overall}</div>
          <div>SYS：ŷ=${s.yhat.toFixed(2)}，誤差=${s.err.toFixed(2)} → ${s.out ? '<b style="color:#b00020">脫模</b>' : '<b style="color:#0a7a2f">正常</b>'}</div>
          <div>DIA：ŷ=${d.yhat.toFixed(2)}，誤差=${d.err.toFixed(2)} → ${d.out ? '<b style="color:#b00020">脫模</b>' : '<b style="color:#0a7a2f">正常</b>'}</div>
        `;
      }
    });
  }
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

// ===== OpenCV.js 辨識核心 =====
function recognizeSYS_DIA_FromCanvas(canvas) {
  let src = cv.imread(canvas);
  let gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  let blur = new cv.Mat();
  cv.GaussianBlur(gray, blur, new cv.Size(5,5), 0);

  let bin = new cv.Mat();
  cv.adaptiveThreshold(
    blur, bin, 255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    31, 5
  );

  let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3,3));
  let opened = new cv.Mat();
  cv.morphologyEx(bin, opened, cv.MORPH_OPEN, kernel);

  const boxes = findDigitBoxes(opened);
  const [top, bottom] = splitRows(boxes);

  const sys = readRow(opened, top);
  const dia = readRow(opened, bottom);

  const confidence = Math.min(sys.conf, dia.conf);

  src.delete(); gray.delete(); blur.delete(); bin.delete(); kernel.delete(); opened.delete();

  return { sys: sys.val, dia: dia.val, confidence };
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
  return { val: parseInt(digits.join(""), 10), conf: avg(confs) };
}

function readOneDigit(binMat, box, segOnThresh) {
  const roi = binMat.roi(new cv.Rect(box.x, box.y, box.w, box.h));

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
    const rect = new cv.Rect(x, y, Math.min(w, roi.cols - x), Math.min(h, roi.rows - y));
    const sub = roi.roi(rect);

    const ratio = cv.countNonZero(sub) / (sub.rows * sub.cols);
    strengths.push(ratio);
    on.push(ratio > segOnThresh ? 1 : 0);

    sub.delete();
  }

  const key = on.join("");
  const digit = SEG_MAP.has(key) ? SEG_MAP.get(key) : null;
  const conf = clamp(avg(strengths.map(v => Math.abs(v - 0.5))) * 2.0, 0, 1);

  roi.delete();
  return { digit, conf, key };
}
const API_BASE = "https://smile950123-bp-paligemma-api.hf.space";

function $(id){ return document.getElementById(id); }

async function recognizeByAPI(file) {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${API_BASE}/recognize`, {
    method: "POST",
    body: fd
  });

  // 後端若回 500，這裡也能顯示
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

window.addEventListener("DOMContentLoaded", () => {
  // 你的血壓分頁 id（照你之前的 index.html）
  const fileEl = $("bpFile");
  const previewEl = $("bpPreview");
  const btn = $("bpRecognizeBtn");
  const statusEl = $("bpStatus");
  const resultEl = $("bpResult");

  if (!fileEl || !btn || !previewEl || !resultEl) return;

  // 現在不需要等 OpenCV.js 了，直接開按鈕
  btn.disabled = false;
  if (statusEl) statusEl.textContent = "就緒 ✅（使用 PaliGemma API）";

  fileEl.addEventListener("change", () => {
    const f = fileEl.files?.[0];
    if (!f) return;
    previewEl.src = URL.createObjectURL(f);
    resultEl.textContent = "已選擇圖片，按「辨識」";
  });

  btn.addEventListener("click", async () => {
    const f = fileEl.files?.[0];
    if (!f) { alert("請先選擇圖片"); return; }

    btn.disabled = true;
    if (statusEl) statusEl.textContent = "辨識中…";

    try {
      const j = await recognizeByAPI(f);

      if (!j.ok) {
        resultEl.innerHTML =
          `<span style="color:#b00020;font-weight:bold">辨識失敗</span><br>` +
          `error: ${j.error || ""}<br>` +
          `raw: ${JSON.stringify(j.raw || j, null, 2)}`;
      } else {
        resultEl.innerHTML =
          `SYS: <b>${j.sys}</b> / DIA: <b>${j.dia}</b> / PUL: <b>${j.pul}</b>`;
      }

      if (statusEl) statusEl.textContent = "就緒 ✅";
    } catch (e) {
      console.error(e);
      resultEl.innerHTML =
        `<span style="color:#b00020;font-weight:bold">呼叫 API 失敗</span><br>${String(e)}`;
      if (statusEl) statusEl.textContent = "就緒";
    } finally {
      btn.disabled = false;
    }
  });
});

