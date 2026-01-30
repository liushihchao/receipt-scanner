const STATE = {
    apiKey: localStorage.getItem('gemini_api_key') || '',
    model: localStorage.getItem('gemini_model') || 'gemini-2.0-flash',
    currentImageBase64: null,
    currentScanResult: null,
    receiptHistory: JSON.parse(localStorage.getItem('receipt_history') || '[]'),
    currentView: 'view-scan',
    statsMonth: new Date() // Default to current month
};

// DOM Elements
const elements = {
    views: {
        scan: document.getElementById('view-scan'),
        stats: document.getElementById('view-stats')
    },
    navItems: document.querySelectorAll('.nav-item'),
    fileInput: document.getElementById('file-input'),
    dropZone: document.getElementById('drop-zone'),
    previewContainer: document.getElementById('preview-container'),
    imagePreview: document.getElementById('image-preview'),
    loadingState: document.getElementById('loading-state'),
    resultContainer: document.getElementById('result-container'),
    analyzeBtn: document.getElementById('analyze-btn'),
    retakeBtn: document.getElementById('retake-btn'),
    saveResultBtn: document.getElementById('save-result-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeModalBtn: document.querySelector('.close-modal'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    apiKeyInput: document.getElementById('api-key-input'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    apiKeyInput: document.getElementById('api-key-input'),
    modelSelect: document.getElementById('model-select'),
    checkModelsBtn: document.getElementById('check-models-btn'),
    modelListOutput: document.getElementById('model-list-output'),

    // Edit Modal Elements
    editModal: document.getElementById('edit-item-modal'),
    closeEditModalBtn: document.getElementById('close-edit-modal'),
    editNameInput: document.getElementById('edit-name-zh'),
    editPriceInput: document.getElementById('edit-price'),
    editCategoryInput: document.getElementById('edit-category'),
    editIndexInput: document.getElementById('edit-item-index'),
    saveItemBtn: document.getElementById('save-item-btn'),
    deleteItemBtn: document.getElementById('delete-item-btn'),

    // Result Elements
    resultTotal: document.getElementById('result-total'),
    resultDate: document.getElementById('result-date'),
    resultItems: document.getElementById('result-items'),

    // Stats Elements
    currentMonthDisplay: document.getElementById('current-month-display'),
    monthlyTotalDisplay: document.getElementById('monthly-total-display'),
    historyContainer: document.getElementById('history-items-container'),
    prevMonthBtn: document.getElementById('prev-month'),
    nextMonthBtn: document.getElementById('next-month'),
    chartCanvas: document.getElementById('category-chart')
};

let chartInstance = null;

// --- Initialization ---
function init() {
    setupEventListeners();
    setupEditListeners();


    // Legacy migration: fix broken 1.5 models
    if (STATE.model.includes('gemini-1.5-flash') || STATE.model.includes('gemini-1.5-pro')) {
        STATE.model = 'gemini-2.0-flash';
        localStorage.setItem('gemini_model', STATE.model);
    }

    updateView('view-scan');
    elements.apiKeyInput.value = STATE.apiKey;
    elements.modelSelect.value = STATE.model;
    renderStats(); // Check stats on load
}

function setupEventListeners() {
    // Navigation
    elements.navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            updateView(target);
        });
    });

    // File Input
    elements.dropZone.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);

    // Settings
    elements.settingsBtn.addEventListener('click', () => {
        elements.settingsModal.classList.remove('hidden');
    });
    elements.closeModalBtn.addEventListener('click', () => {
        elements.settingsModal.classList.add('hidden');
    });

    elements.checkModelsBtn.addEventListener('click', checkAvailableModels);

    elements.saveSettingsBtn.addEventListener('click', () => {
        const key = elements.apiKeyInput.value.trim();
        const model = elements.modelSelect.value;

        if (key) {
            STATE.apiKey = key;
            STATE.model = model;
            localStorage.setItem('gemini_api_key', key);
            localStorage.setItem('gemini_model', model);
            alert('設定已儲存');
            elements.settingsModal.classList.add('hidden');
        } else {
            alert('請輸入有效的 API Key');
        }
    });

    // Actions
    elements.analyzeBtn.addEventListener('click', analyzeImage);
    elements.retakeBtn.addEventListener('click', resetScanView);
    elements.saveResultBtn.addEventListener('click', saveCurrentResult);

    // Stats Navigation
    elements.prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    elements.nextMonthBtn.addEventListener('click', () => changeMonth(1));
}

function updateView(viewId) {
    // Update State
    STATE.currentView = viewId;

    // Toggle Sections
    Object.values(elements.views).forEach(el => el.classList.remove('active-view'));
    document.getElementById(viewId).classList.add('active-view');

    // Update Nav
    elements.navItems.forEach(btn => {
        if (btn.dataset.target === viewId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    if (viewId === 'view-stats') {
        renderStats();
    }
}

// --- Edit Logic ---
function setupEditListeners() {
    elements.closeEditModalBtn.addEventListener('click', () => {
        elements.editModal.classList.add('hidden');
    });

    elements.saveItemBtn.addEventListener('click', () => {
        const index = parseInt(elements.editIndexInput.value);
        const name = elements.editNameInput.value;
        const price = parseFloat(elements.editPriceInput.value);
        const category = elements.editCategoryInput.value;

        if (!name || isNaN(price)) {
            alert('請輸入有效的名稱與價格');
            return;
        }

        // Update Data
        STATE.currentScanResult.items[index].name_zh = name;
        STATE.currentScanResult.items[index].price = price;
        STATE.currentScanResult.items[index].category = category;

        recalculateTotal();
        renderResult(STATE.currentScanResult); // Re-render list
        elements.editModal.classList.add('hidden');
    });

    elements.deleteItemBtn.addEventListener('click', () => {
        const index = parseInt(elements.editIndexInput.value);
        if (confirm('確定要刪除此項目嗎？')) {
            STATE.currentScanResult.items.splice(index, 1);
            recalculateTotal();
            renderResult(STATE.currentScanResult);
            elements.editModal.classList.add('hidden');
        }
    });
}

function recalculateTotal() {
    const total = STATE.currentScanResult.items.reduce((sum, item) => sum + item.price, 0);
    STATE.currentScanResult.total = total;
    elements.resultTotal.textContent = `${STATE.currentScanResult.currency || ''} ${total}`;
}

function openEditModal(index) {
    const item = STATE.currentScanResult.items[index];
    elements.editIndexInput.value = index;
    elements.editNameInput.value = item.name_zh;
    elements.editPriceInput.value = item.price;
    elements.editCategoryInput.value = item.category;

    elements.editModal.classList.remove('hidden');
}

// --- Image Handling ---
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        STATE.currentImageBase64 = event.target.result; // Data URL

        // Show Preview
        elements.imagePreview.src = STATE.currentImageBase64;
        elements.dropZone.parentElement.classList.add('hidden'); // Hide upload area
        elements.previewContainer.classList.remove('hidden');
        elements.resultContainer.classList.add('hidden'); // Hide previous results
    };
    reader.readAsDataURL(file);
}

function resetScanView() {
    elements.fileInput.value = '';
    STATE.currentImageBase64 = null;
    STATE.currentScanResult = null;

    elements.previewContainer.classList.add('hidden');
    elements.resultContainer.classList.add('hidden');
    elements.loadingState.classList.add('hidden');
    elements.dropZone.parentElement.classList.remove('hidden');
}

// --- API Integration (Gemini) ---
async function analyzeImage() {
    if (!STATE.apiKey) {
        alert('請先在設定中輸入 Google Gemini API Key');
        return;
    }

    if (!STATE.currentImageBase64) return;

    // UI State -> Loading
    elements.previewContainer.classList.add('hidden');
    elements.loadingState.classList.remove('hidden');

    try {
        const base64Data = STATE.currentImageBase64.split(',')[1]; // Remove header

        const prompt = `
            Analyze this receipt image. 
            1. Extract all items with their prices.
            2. Translate item names to Traditional Chinese (Taiwan usage).
            3. Categorize each item into one of: [食品, 交通, 居家, 娛樂, 其他].
            4. Identify the total amount and currency.
            5. Return ONLY raw JSON (no markdown formatting) with this structure:
            {
                "date": "YYYY-MM-DD",
                "currency": "TWD" or "JPY" or "USD",
                "total": number,
                "items": [
                    { "name": "original name", "name_zh": "translated name", "price": number, "category": "category" }
                ]
            }
            If date is not found, use today's date.
        `;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${STATE.model}:generateContent?key=${STATE.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: "image/jpeg", data: base64Data } }
                    ]
                }]
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        const textResult = data.candidates[0].content.parts[0].text;
        const jsonString = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedResult = JSON.parse(jsonString);

        STATE.currentScanResult = parsedResult;
        renderResult(parsedResult);

    } catch (err) {
        console.error(err);

        // Handle Rate Limit / Quota specific error
        if (err.message.includes('Quota exceeded') || err.message.includes('429')) {

            // Strategy: Flash -> 2.0 Lite -> 2.5 Lite
            const current = STATE.model;
            let nextModel = null;

            if (!current.includes('lite')) {
                nextModel = 'gemini-2.0-flash-lite-001';
            } else if (current === 'gemini-2.0-flash-lite-001') {
                nextModel = 'gemini-2.5-flash-lite';
            }

            if (nextModel) {
                STATE.model = nextModel;
                localStorage.setItem('gemini_model', STATE.model);
                if (elements.modelSelect) elements.modelSelect.value = STATE.model;

                const loadingMsg = elements.loadingState.querySelector('p');
                if (loadingMsg) loadingMsg.textContent = `額度已滿，正在切換至 ${nextModel} 重試...`;

                setTimeout(() => analyzeImage(), 1500); // Wait a bit longer
                return;
            }

            // All fallbacks failed
            let waitTime = '一小段時間';
            const match = err.message.match(/retry in ([0-9.]+)s/);
            if (match) {
                waitTime = Math.ceil(parseFloat(match[1])) + ' 秒';
            }
            alert(`所有可用模型的額度皆已達上限，請等待 ${waitTime} 後再試。`);
        } else {
            alert('分析失敗: ' + err.message);
        }

        elements.loadingState.classList.add('hidden');
        elements.previewContainer.classList.remove('hidden');
    }
}

function renderResult(data) {
    elements.loadingState.classList.add('hidden');
    elements.resultContainer.classList.remove('hidden');

    elements.resultTotal.textContent = `${data.currency} ${data.total}`;
    elements.resultDate.textContent = data.date;

    elements.resultItems.innerHTML = '';
    data.items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `
            <div class="item-info">
                <div class="item-name">${item.name_zh}</div>
                <span class="item-category">${item.category}</span>
                <small style="color:#aaa">(${item.name})</small>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <div class="item-price">${item.price}</div>
                <button class="icon-btn edit-btn" data-index="${index}" style="font-size:1.2rem; padding:4px;">
                    <i class="ri-pencil-line"></i>
                </button>
            </div>
        `;
        elements.resultItems.appendChild(div);
    });

    // Attach click events to new buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.currentTarget.dataset.index;
            openEditModal(index);
        });
    });
}

function saveCurrentResult() {
    if (!STATE.currentScanResult) return;

    // Add unique ID and timestamp
    const record = {
        ...STATE.currentScanResult,
        id: Date.now().toString(),
        timestamp: Date.now()
    };

    STATE.receiptHistory.push(record);
    localStorage.setItem('receipt_history', JSON.stringify(STATE.receiptHistory));

    alert('儲存成功！');
    resetScanView();
    // Update stats logic handled when view switches
}

// --- Statistics & History ---
function changeMonth(offset) {
    const newDate = new Date(STATE.statsMonth);
    newDate.setMonth(newDate.getMonth() + offset);
    STATE.statsMonth = newDate;
    renderStats();
}

function renderStats() {
    // Filter data for current month
    const year = STATE.statsMonth.getFullYear();
    const month = STATE.statsMonth.getMonth(); // 0-indexed

    // Update Header
    elements.currentMonthDisplay.textContent = `${year}年 ${month + 1}月`;

    const monthlyData = STATE.receiptHistory.filter(item => {
        const d = new Date(item.date); // Assuming date format YYYY-MM-DD
        return d.getFullYear() === year && d.getMonth() === month;
    });

    // Calculate Total
    const total = monthlyData.reduce((sum, item) => sum + item.total, 0);
    elements.monthlyTotalDisplay.textContent = `$${total.toLocaleString()}`;

    // Aggregates for Chart
    const categories = {};
    monthlyData.forEach(receipt => {
        receipt.items.forEach(item => {
            if (!categories[item.category]) categories[item.category] = 0;
            categories[item.category] += item.price;
        });
    });

    renderChart(categories);
    renderHistoryList(monthlyData);
}

function renderChart(categoryData) {
    const ctx = elements.chartCanvas.getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
    }

    const labels = Object.keys(categoryData);
    const data = Object.values(categoryData);

    // Fallback if no data
    if (labels.length === 0) {
        // Render empty state or just clear?
        // Let's just create an empty chart
    }

    const colors = [
        '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'
    ];

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#94a3b8' }
                }
            }
        }
    });
}

function renderHistoryList(data) {
    elements.historyContainer.innerHTML = '';

    // Sort by date desc
    data.sort((a, b) => new Date(b.date) - new Date(a.date));

    data.forEach(receipt => {
        const div = document.createElement('div');
        div.className = 'item-row';
        div.style.marginBottom = '10px';
        div.innerHTML = `
            <div class="item-info">
                <div class="item-name">${receipt.date}</div>
                <small class="item-category">${receipt.items.length} 項商品</small>
            </div>
            <div class="item-price" style="font-size: 1.1rem">$${receipt.total}</div>
        `;
        elements.historyContainer.appendChild(div);
    });
}

// --- Debugging ---
async function checkAvailableModels() {
    const key = elements.apiKeyInput.value.trim();
    if (!key) {
        alert('請先輸入 API Key');
        return;
    }

    elements.modelListOutput.style.display = 'block';
    elements.modelListOutput.textContent = '查詢中...';

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        if (data.models) {
            const names = data.models
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace('models/', ''))
                .join('\n');

            elements.modelListOutput.textContent = '您的 Key 可用的模型：\n\n' + names;
        } else {
            elements.modelListOutput.textContent = '未找到任何模型 (JSON response unexpected)';
        }

    } catch (err) {
        elements.modelListOutput.textContent = '查詢失敗: ' + err.message;
    }
}

// Start App
init();
