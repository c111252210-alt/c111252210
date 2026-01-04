<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>胡智強的個人頁面</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f0f0f0;
        }
        header {
            background-color: #4CAF50;
            color: white;
            text-align: center;
            padding: 20px 0;
        }
        .container {
            width: 80%;
            margin: 0 auto;
            padding: 20px;
            background-color: white;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }
        h1 {
            color: #333;
        }
        p {
            line-height: 1.6;
            color: #555;
        }
        .social-links {
            list-style-type: none;
            padding: 0;
        }
        .social-links li {
            display: inline-block;
            margin-right: 10px;
        }
        .social-links a {
            text-decoration: none;
            color: #4CAF50;
            font-size: 18px;
        }
        footer {
            background-color: #333;
            color: white;
            text-align: center;
            padding: 10px 0;
            position: fixed;
            bottom: 0;
            width: 100%;
        }
        .tabs {
            margin: 20px 0;
            text-align: center;
        }
        .tabs button {
            padding: 10px 20px;
            margin: 5px;
            background-color: #4CAF50;
            color: white;
            border: none;
            cursor: pointer;
            font-size: 16px;
        }
        .tabs button:hover {
            background-color: #45a049;
        }
        .tab-content {
            display: none;
        }
        .active {
            display: block;
        }

        /* ===== 血壓偵測頁：少量補充樣式（不影響其他頁） ===== */
        .bp-card {
            border: 1px solid #eee;
            border-radius: 12px;
            padding: 12px;
            margin: 12px 0;
            background: #fafafa;
        }
        .bp-row {
            display: flex;
            gap: 10px;
            align-items: center;
            flex-wrap: wrap;
        }
        .bp-kpi {
            font-weight: bold;
            margin-bottom: 6px;
        }
        .bp-small {
            font-size: 12px;
            color: #666;
        }
        .bp-img {
            max-width: 100%;
            border: 1px solid #ddd;
            border-radius: 10px;
        }
        .bp-input { padding: 6px 8px; }
        .bp-btn {
            padding: 8px 12px;
            cursor: pointer;
            border: none;
            background: #4CAF50;
            color: #fff;
            border-radius: 6px;
        }
        .bp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    </style>
</head>

<body>

<header>
    <h1>歡迎來到我的個人頁面</h1>
</header>

<div class="container">
    <!-- 按鈕列 -->
    <div class="tabs">
        <button onclick="showTab('intro')">自我介紹</button>
        <button onclick="showTab('monitoring')">遠端監控</button>
        <button onclick="showTab('bloodPressure')">血壓偵測</button>
    </div>

    <!-- 分頁內容：自我介紹 -->
    <div id="intro" class="tab-content active">
        <h2>你好，我是胡智強</h2>
        <p>我是一名學生，來自高雄科技大學電子工程系大四。</p>

        <h3>聯絡方式</h3>
        <p>你可以通過以下方式與我聯繫：</p>
        <ul class="social-links">
            <li><a href="mailto:c111252210@nkust.edu.tw">Email</a></li>
        </ul>
    </div>

    <!-- 分頁內容：遠端監控 -->
    <div id="monitoring" class="tab-content">
        <h2>遠端監控</h2>
        <p>這裡未來會新增遠端監控的相關成果。</p>
    </div>

    <!-- 分頁內容：血壓偵測 -->
    <div id="bloodPressure" class="tab-content">
        <h2>血壓偵測</h2>
        <p class="bp-small">
            說明：上傳血壓計照片（建議先裁切到螢幕、避免反光）→ 呼叫 Hugging Face Space API →
            取得 SYS / DIA / PUL → 依據網站內 bp_data.json（基準）+ localStorage（新增）做趨勢判斷並可匯出合併 JSON。
        </p>

        <!-- 上傳 + 辨識 -->
        <div class="bp-card">
            <div class="bp-row">
                <input id="bpFile" class="bp-input" type="file" accept="image/*">
                <button id="bpRecognizeBtn" class="bp-btn" disabled>辨識</button>
                <span id="bpStatus" class="bp-small">載入中…</span>
            </div>
        </div>

        <!-- 預覽 -->
        <div class="bp-card">
            <div class="bp-kpi">預覽</div>
            <img id="bpPreview" class="bp-img" alt="">
        </div>

        <!-- 辨識結果 -->
        <div class="bp-card">
            <div class="bp-kpi">辨識結果</div>
            <div id="bpResult">尚未辨識</div>
        </div>

        <!-- 趨勢判斷 + 匯出 -->
        <div class="bp-card">
            <div class="bp-kpi">趨勢判斷</div>
            <div id="bpTrend" style="margin-top:10px;"></div>

            <div class="bp-row" style="margin-top:10px;">
                <button id="bpExportBtn" type="button" class="bp-btn">匯出 bp_data（JSON）</button>
                <span class="bp-small">※ 僅供專題展示參考，不能替代醫療建議</span>
            </div>
        </div>

        <!-- 歷史紀錄（只在血壓分頁出現） -->
        <div class="bp-card">
            <div class="bp-kpi">歷史紀錄（localStorage）</div>
            <div class="bp-row">
                <button id="bpClearBtn" class="bp-btn">清空紀錄</button>
                <span class="bp-small">（只會清你這個瀏覽器的紀錄）</span>
            </div>
            <div id="bpHistory" style="margin-top:8px;"></div>
        </div>
    </div>
</div>

<footer>
    <p>© 2025 胡智強. All Rights Reserved.</p>
</footer>

<script>
    function showTab(tabName) {
        const tabs = document.querySelectorAll('.tab-content');
        tabs.forEach(tab => tab.classList.remove('active'));

        const activeTab = document.getElementById(tabName);
        activeTab.classList.add('active');
    }
</script>

<!-- 血壓偵測主程式 -->
<script src="./bp.js?v=20260104"></script>

</body>
</html>
