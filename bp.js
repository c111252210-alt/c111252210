const LS_KEY = "bp_history_v1";
let history = JSON.parse(localStorage.getItem(LS_KEY) || "[]");

const API_BASE = "https://smile950123-bp-paligemma-api.hf.space";

function $(id){ return document.getElementById(id); }
function avg(arr){ return arr.reduce((a,b)=>a+b,0)/Math.max(1,arr.length); }

let last = { sys:null, dia:null, pul:null };

function renderHistory(){
  const el = $("bpHistory");
  if (!el) return;
  if (!history.length) { el.innerHTML = "<small>尚無資料</small>"; return; }

  el.innerHTML = history.map(h =>
    `<div><b>t=${h.t}</b> SYS=${h.sys} / DIA=${h.dia} / PUL=${h.pul ?? "-"} <small>(${new Date(h.ts).toLocaleString()})</small></div>`
  ).join("");
}
function saveHistory(){
  localStorage.setItem(LS_KEY, JSON.stringify(history));
  renderHistory();
}
renderHistory();

async function recognizeByAPI(file) {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${API_BASE}/recognize`, {
    method: "POST",
    body: fd
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function judgeOne(y, a, b, t, thr) {
  const yhat = a * t + b;
  const err = y - yhat;
  return { yhat, err, out: Math.abs(err) > thr };
}

// ===== UI 綁定 =====
window.addEventListener("DOMContentLoaded", () => {
  const fileEl = $("bpFile");
  const previewEl = $("bpPreview");
  const statusEl = $("bpStatus");
  const resultEl = $("bpResult");
  const judgeOutEl = $("bpJudgeOut");

  const recognizeBtn = $("bpRecognizeBtn");
  const judgeBtn = $("bpJudgeBtn");
  const clearBtn = $("bpClearBtn");

  if (!fileEl || !previewEl || !resultEl || !recognizeBtn) return;

  // API 版：不需要 OpenCV.js，直接可用
  recognizeBtn.disabled = false;
  if (statusEl) statusEl.textContent = "就緒 ✅（使用 PaliGemma API）";

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
      last = { sys:null, dia:null, pul:null };
      if (judgeBtn) judgeBtn.disabled = true;
      if (resultEl) resultEl.textContent = "已清空紀錄";
      if (judgeOutEl) judgeOutEl.textContent = "";
    });
  }

  recognizeBtn.addEventListener("click", async () => {
    const f = fileEl.files?.[0];
    if (!f) { alert("請先選擇圖片"); return; }

    recognizeBtn.disabled = true;
    if (statusEl) statusEl.textContent = "辨識中…";

    try {
      const j = await recognizeByAPI(f);

      if (!j || !j.ok) {
        const err = j?.error ? String(j.error) : "unknown";
        resultEl.innerHTML =
          `<span style="color:#b00020;font-weight:bold">辨識失敗</span><br>` +
          `error: ${err}<br>` +
          `raw: <pre style="white-space:pre-wrap">${JSON.stringify(j?.raw ?? j, null, 2)}</pre>`;
        if (judgeBtn) judgeBtn.disabled = true;
        if (statusEl) statusEl.textContent = "就緒";
        return;
      }

      last = { sys: j.sys, dia: j.dia, pul: j.pul };

      resultEl.innerHTML =
        `SYS: <b>${j.sys}</b> / DIA: <b>${j.dia}</b> / PUL: <b>${j.pul}</b>`;

      // 寫入歷史（t = 0,1,2...）
      history.push({ t: history.length, sys: j.sys, dia: j.dia, pul: j.pul, ts: Date.now() });
      saveHistory();

      if (judgeBtn) judgeBtn.disabled = false;
      if (statusEl) statusEl.textContent = "就緒 ✅";
    } catch (e) {
      console.error(e);
      resultEl.innerHTML =
        `<span style="color:#b00020;font-weight:bold">呼叫 API 失敗</span><br>` +
        `<span class="bp-small">${String(e)}</span>`;
      if (judgeBtn) judgeBtn.disabled = true;
      if (statusEl) statusEl.textContent = "就緒";
    } finally {
      recognizeBtn.disabled = false;
    }
  });

  if (judgeBtn) {
    judgeBtn.addEventListener("click", () => {
      if (last.sys == null || last.dia == null) { alert("請先辨識"); return; }

      // 最近一次 push 進 history 的那筆，就是本次 t
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
          <div>PUL：<b>${last.pul ?? "-"}</b>（目前未納入趨勢判斷）</div>
        `;
      }
    });
  }
});
