// bp.js (FULL REPLACE)
// - Reads baseline data from ./bp_data.json
// - Appends new recognized results into localStorage (cannot write back to repo file on GitHub Pages)
// - Re-fits trend each time (recursive update) and flags outliers ("脫模")
// - Provides Export JSON (merged) for manual commit

const API_BASE = "https://smile950123-bp-paligemma-api.hf.space";

// localStorage keys
const LS_APPEND_KEY = "bp_append_v2";     // user-added records (array)
const LS_MERGED_CACHE = "bp_merged_v2";   // optional cache

function $(id) { return document.getElementById(id); }

let baseData = [];     // from bp_data.json
let appendData = [];   // from localStorage
let mergedData = [];   // base + append (sorted by t)

let last = { sys: null, dia: null, pul: null };

// ------------------------ utils ------------------------
function safeJSONParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function nowISO() {
  return new Date().toISOString();
}

function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function mad(arr) {
  // Median Absolute Deviation
  if (!arr.length) return 0;
  const med = median(arr);
  const dev = arr.map(x => Math.abs(x - med));
  return median(dev);
}

// simple linear regression y = a*t + b
function fitLinear(ts, ys) {
  const n = Math.min(ts.length, ys.length);
  if (n < 2) return { a: 0, b: ys[0] ?? 0 };

  let sumT = 0, sumY = 0, sumTT = 0, sumTY = 0;
  for (let i = 0; i < n; i++) {
    const t = ts[i], y = ys[i];
    sumT += t;
    sumY += y;
    sumTT += t * t;
    sumTY += t * y;
  }
  const denom = (n * sumTT - sumT * sumT);
  if (Math.abs(denom) < 1e-9) return { a: 0, b: sumY / n };

  const a = (n * sumTY - sumT * sumY) / denom;
  const b = (sumY - a * sumT) / n;
  return { a, b };
}

function renderHistory() {
  const el = $("bpHistory");
  if (!el) return;

  if (!mergedData.length) {
    el.innerHTML = "<small>尚無資料</small>";
    return;
  }

  const lastN = mergedData.slice(-15); // show last 15
  el.innerHTML = lastN.map(h =>
    `<div>
      <b>t=${h.t}</b>
      SYS=${h.sys} / DIA=${h.dia} / PUL=${h.pul ?? "-"}
      <small>(${h.time})</small>
    </div>`
  ).join("");
}

function setTrendText(html) {
  const el = $("bpTrend");
  if (!el) return;
  el.innerHTML = html;
}

// ------------------------ data load/merge ------------------------
async function loadBaseData() {
  // baseline: bp_data.json in your website root/repo
  const r = await fetch("./bp_data.json", { cache: "no-store" });
  if (!r.ok) throw new Error(`讀取 bp_data.json 失敗：HTTP ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error("bp_data.json 格式不是陣列");
  return j;
}

function loadAppendData() {
  const j = safeJSONParse(localStorage.getItem(LS_APPEND_KEY) || "[]", []);
  return Array.isArray(j) ? j : [];
}

function saveAppendData() {
  localStorage.setItem(LS_APPEND_KEY, JSON.stringify(appendData));
}

function rebuildMerged() {
  const combined = [...baseData, ...appendData];

  // ensure t exists and is increasing; if missing t, generate.
  // We'll sort by (t) if exists, else by time.
  combined.sort((a, b) => {
    const ta = Number.isFinite(a.t) ? a.t : 1e18;
    const tb = Number.isFinite(b.t) ? b.t : 1e18;
    if (ta !== tb) return ta - tb;
    const da = new Date(a.time || 0).getTime();
    const db = new Date(b.time || 0).getTime();
    return da - db;
  });

  // reassign continuous t = 0..N-1 (so trend fitting is stable)
  mergedData = combined.map((row, idx) => ({
    t: idx,
    time: row.time || nowISO(),
    sys: Number(row.sys),
    dia: Number(row.dia),
    pul: row.pul == null ? null : Number(row.pul),
  }));

  localStorage.setItem(LS_MERGED_CACHE, JSON.stringify(mergedData));
  renderHistory();
}

// ------------------------ trend judgement ------------------------
function judgeTrendForNewPoint(newPoint, k = 3.0, minAbsThr = 8) {
  // Use last windowSize points (before adding newPoint) to fit trend
  if (mergedData.length < 5) {
    return {
      ok: true,
      msg: "資料筆數太少（<5），暫不判斷脫模。",
      detailHTML: ""
    };
  }

  const hist = mergedData;
  const ts = hist.map(r => r.t);

  function judgeOne(metric) {
    const ys = hist.map(r => r[metric]).filter(v => Number.isFinite(v));
    const t2 = hist.filter(r => Number.isFinite(r[metric])).map(r => r.t);

    if (ys.length < 5) {
      return { metric, canJudge: false, reason: "資料不足", out: false };
    }

    const { a, b } = fitLinear(t2, ys);
    const yhat = a * newPoint.t + b;
    const err = newPoint[metric] - yhat;

    // robust scale from residuals of history
    const residuals = [];
    for (let i = 0; i < ys.length; i++) {
      const pred = a * t2[i] + b;
      residuals.push(ys[i] - pred);
    }
    const scale = 1.4826 * mad(residuals); // approx sigma
    const thr = Math.max(minAbsThr, k * (scale || 0));

    const out = Math.abs(err) > thr;
    return {
      metric,
      canJudge: true,
      a, b,
      yhat,
      err,
      thr,
      out,
      scale
    };
  }

  const s = judgeOne("sys");
  const d = judgeOne("dia");

  const anyOut = (s.canJudge && s.out) || (d.canJudge && d.out);

  const summary = anyOut
    ? `<span style="color:#b00020;font-weight:bold">脫模（偏離趨勢）</span>`
    : `<span style="color:#0a7a2f;font-weight:bold">符合趨勢（正常）</span>`;

  const line = (o, label) => {
    if (!o.canJudge) return `<div>${label}：資料不足，未判斷</div>`;
    return `<div>${label}：ŷ=${o.yhat.toFixed(2)}，誤差=${o.err.toFixed(2)}，門檻=${o.thr.toFixed(2)} → ${o.out ? '<b style="color:#b00020">脫模</b>' : '<b style="color:#0a7a2f">正常</b>'}</div>`;
    };

  return {
    ok: true,
    msg: anyOut ? "脫模" : "符合趨勢",
    detailHTML: `
      <div><b>趨勢判斷：</b>${summary}</div>
      ${line(s, "SYS")}
      ${line(d, "DIA")}
      <div>PUL：<b>${newPoint.pul ?? "-"}</b>（目前不納入趨勢判斷）</div>
    `
  };
}

// ------------------------ API call ------------------------
async function recognizeByAPI(file) {
  const base = API_BASE.replace(/\/+$/, "");
  const url = `${base}/recognize`;
  console.log("[BP] POST ->", url);
  console.log("[BP] original file:", file.type, file.size, file.name);

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(url, {
    method: "POST",
    body: fd,
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
  });

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}

  if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}: ${text.slice(0, 250)}`);
  return data ?? { ok: false, error: "Non-JSON response", raw: text };
}

// ------------------------ UI wiring ------------------------
window.addEventListener("DOMContentLoaded", async () => {
  const fileEl = $("bpFile");
  const previewEl = $("bpPreview");
  const statusEl = $("bpStatus");
  const resultEl = $("bpResult");

  const recognizeBtn = $("bpRecognizeBtn");
  const clearBtn = $("bpClearBtn");
  const exportBtn = $("bpExportBtn");

  // init view
  if (resultEl) resultEl.textContent = "請選擇血壓計圖片";
  setTrendText("");

  // load data
  try {
    baseData = await loadBaseData();
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = `讀取 bp_data.json 失敗：${String(e)}`;
    baseData = [];
  }

  appendData = loadAppendData();
  rebuildMerged();

  // health check
  if (statusEl) statusEl.textContent = "檢查後端連線中…";
  try {
    const base = API_BASE.replace(/\/+$/, "");
    const r = await fetch(`${base}/health`, { cache: "no-store", credentials: "omit" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (statusEl) statusEl.textContent = `後端OK ✅ (${j.device}, ${j.model})`;
  } catch (e) {
    if (statusEl) statusEl.textContent = `後端連線失敗：${String(e)}`;
  }

  // preview
  if (fileEl && previewEl) {
    fileEl.addEventListener("change", () => {
      const f = fileEl.files?.[0];
      if (!f) return;
      previewEl.src = URL.createObjectURL(f);
      if (resultEl) resultEl.textContent = "已選擇圖片，按「辨識」";
      setTrendText("");
    });
  }

  // export merged json
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      // export mergedData as file for user to commit manually
      downloadJSON("bp_data_merged.json", mergedData);
    });
  }

  // clear appended only (keep baseline file unchanged)
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      appendData = [];
      saveAppendData();
      rebuildMerged();
      if (resultEl) resultEl.textContent = "已清空「新增資料」（基準 bp_data.json 不變）";
      setTrendText("");
    });
  }

  // recognize
  if (recognizeBtn && fileEl) {
    recognizeBtn.disabled = false;

    recognizeBtn.addEventListener("click", async () => {
      const f = fileEl.files?.[0];
      if (!f) { alert("請先選擇圖片"); return; }

      recognizeBtn.disabled = true;
      if (statusEl) statusEl.textContent = "辨識中…";

      try {
        const j = await recognizeByAPI(f);

        if (!j || !j.ok) {
          const err = j?.error ? String(j.error) : "unknown";
          if (resultEl) {
            resultEl.innerHTML =
              `<span style="color:#b00020;font-weight:bold">辨識失敗</span><br>` +
              `error: ${err}<br>` +
              `raw: <pre style="white-space:pre-wrap">${JSON.stringify(j?.raw ?? j, null, 2)}</pre>`;
          }
          setTrendText("");
          if (statusEl) statusEl.textContent = "就緒";
          return;
        }

        last = { sys: j.sys, dia: j.dia, pul: j.pul };

        if (resultEl) {
          resultEl.innerHTML =
            `SYS: <b>${j.sys}</b> / DIA: <b>${j.dia}</b> / PUL: <b>${j.pul}</b>`;
        }

        // build new record with next t (temporary; rebuildMerged will re-index)
        const newRec = {
          t: mergedData.length, // provisional
          time: nowISO(),
          sys: Number(j.sys),
          dia: Number(j.dia),
          pul: j.pul == null ? null : Number(j.pul),
        };

        // judge trend BEFORE permanently adding (fit on history)
        const judge = judgeTrendForNewPoint(newRec);
        setTrendText(judge.detailHTML || "");

        // append to localStorage (recursive update basis)
        appendData.push(newRec);
        saveAppendData();

        // rebuild merged (t will be reindexed 0..N-1)
        rebuildMerged();

        if (statusEl) statusEl.textContent = "就緒 ✅";
      } catch (e) {
        console.error(e);
        if (resultEl) {
          resultEl.innerHTML =
            `<span style="color:#b00020;font-weight:bold">呼叫 API 失敗</span><br>` +
            `<span class="bp-small">${String(e)}</span>`;
        }
        setTrendText("");
        if (statusEl) statusEl.textContent = "就緒";
      } finally {
        recognizeBtn.disabled = false;
      }
    });
  }
});
