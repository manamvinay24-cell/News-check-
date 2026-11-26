
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    // =====================================================
    // 1. API CONFIGURATION
    // =====================================================

    const API_BASE = "https://news-check-np3i.onrender.com";

    const API = {
        loginCheck: `${API_BASE}/api/auth/me`,
        logout: `${API_BASE}/api/auth/logout`,
        predict: `${API_BASE}/api/predict`,
        predictImage: `${API_BASE}/api/predict-image`,
        history: `${API_BASE}/api/history`,
        clearHistory: `${API_BASE}/api/history/clear`,
        dashboard: `${API_BASE}/api/dashboard`,
        health: `${API_BASE}/api/health`
    };

    // =====================================================
    // 2. ELEMENT HELPER
    // =====================================================

    const $ = id => document.getElementById(id);

    const on = (element, event, callback) => {
        if (element) {
            element.addEventListener(event, callback);
        }
    };

    const requiredIds = [
        "newsText",
        "analyzeBtn",
        "clearBtn",
        "resultCard",
        "historyList",
        "logoutBtn"
    ];

    for (const id of requiredIds) {
        if (!$(id)) {
            console.error(`Missing HTML element: ${id}`);
            return;
        }
    }

    // =====================================================
    // 3. ELEMENT REFERENCES
    // =====================================================

    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".tab-panel");

    const newsText = $("newsText");
    const charCount = $("charCount");

    const imageInput = $("imageInput");
    const imageBrowseBtn = $("imageBrowseBtn");
    const imageUploadArea = $("imageUploadArea");
    const imagePreviewContainer = $("imagePreviewContainer");
    const imagePreview = $("imagePreview");
    const imageInfo = $("imageInfo");
    const removeImage = $("removeImage");
    const imageError = $("imageError");

    const videoInput = $("videoInput");
    const videoBrowseBtn = $("videoBrowseBtn");
    const videoUploadArea = $("videoUploadArea");
    const videoPreviewContainer = $("videoPreviewContainer");
    const videoPreview = $("videoPreview");
    const videoInfo = $("videoInfo");
    const removeVideo = $("removeVideo");

    const analyzeBtn = $("analyzeBtn");
    const clearBtn = $("clearBtn");
    const clearHistoryBtn = $("clearHistoryBtn");
    const refreshDashboardBtn = $("refreshDashboardBtn");
    const logoutBtn = $("logoutBtn");

    const loadingCard = $("loadingCard");
    const loadingMessage = $("loadingMessage");

    const resultCard = $("resultCard");
    const resultStatus = $("resultStatus");
    const resultTitle = $("resultTitle");
    const resultMessage = $("resultMessage");

    const confidenceValue = $("confidenceValue");
    const confidenceProgress = $("confidenceProgress");
    const progressBar = $("progressBar");

    const contentType = $("contentType");
    const sourceResult = $("sourceResult");
    const languageResult = $("languageResult");
    const confidenceLevel = $("confidenceLevel");

    const extractedTextBox = $("extractedTextBox");
    const extractedText = $("extractedText");
    const copyExtractedText = $("copyExtractedText");

    const historyList = $("historyList");

    // =====================================================
    // 4. APPLICATION VARIABLES
    // =====================================================

    let currentTab = "text";
    let selectedImage = null;
    let selectedVideo = null;

    let isAnalyzing = false;
    let isClearingHistory = false;
    let isLoggingOut = false;

    let imageObjectURL = null;
    let videoObjectURL = null;

    // =====================================================
    // 5. API RESPONSE HANDLER
    // =====================================================

    async function readResponse(response) {

        const body = await response.text();

        if (!body) {
            return {};
        }

        try {
            return JSON.parse(body);
        } catch {
            throw new Error(
                "Backend returned an invalid response. Please try again."
            );
        }
    }

    async function apiRequest(url, options = {}) {

        const response = await fetch(url, {
            ...options,
            credentials: "include"
        });

        const data = await readResponse(response);

        if (response.status === 401) {
            window.location.replace("login.html");
            throw new Error("Your session has expired. Please login again.");
        }

        if (!response.ok) {
            throw new Error(
                data.error || `Request failed: HTTP ${response.status}`
            );
        }

        return data;
    }

    // =====================================================
    // 6. AUTHENTICATION CHECK
    // =====================================================

    async function checkLogin() {

        try {

            const data = await apiRequest(API.loginCheck);

            if (!data.authenticated) {
                window.location.replace("login.html");
                return false;
            }

            if (data.user && $("welcomeUser")) {
                $("welcomeUser").textContent =
                    `Welcome, ${data.user.name}!`;
            }

            return true;

        } catch (error) {

            console.error("Login verification failed:", error);

            if (error.message.includes("session has expired")) {
                return false;
            }

            alert(
                "Cannot connect to NewsCheck backend.\n\n" +
                "Please check your internet connection and Render service."
            );

            setBackendStatus(false, "Connection error");

            return false;
        }
    }

    // =====================================================
    // 7. BACKEND STATUS
    // =====================================================

    function setBackendStatus(isOnline, message) {

        if ($("backendStatus")) {
            $("backendStatus").textContent = message;
        }

        if ($("backendDot")) {
            $("backendDot").classList.toggle("online", isOnline);
            $("backendDot").classList.toggle("offline", !isOnline);
        }
    }

    async function checkBackend() {

        try {

            const response = await fetch(API.health, {
                method: "GET"
            });

            const data = await readResponse(response);

            if (!response.ok || data.status !== "success") {
                throw new Error("Backend unavailable");
            }

            setBackendStatus(true, "Backend connected");

        } catch (error) {

            console.error("Backend status error:", error);
            setBackendStatus(false, "Backend offline");
        }
    }

    // =====================================================
    // 8. CHARACTER COUNT
    // =====================================================

    function updateCharacterCount() {

        if (charCount) {
            charCount.textContent =
                `${newsText.value.length} characters`;
        }
    }

    on(newsText, "input", updateCharacterCount);

    // =====================================================
    // 9. TAB SWITCHING
    // =====================================================

    tabs.forEach(tab => {

        tab.addEventListener("click", () => {

            currentTab = tab.dataset.tab;

            tabs.forEach(item => {

                const active = item === tab;

                item.classList.toggle("active", active);

                item.setAttribute(
                    "aria-selected",
                    String(active)
                );
            });

            panels.forEach(panel => {

                panel.classList.toggle(
                    "active",
                    panel.id === `${currentTab}Panel`
                );
            });

            resultCard.hidden = true;

            hideImageError();
        });
    });

    // =====================================================
    // 10. IMAGE ERROR HELPERS
    // =====================================================

    function showImageError(message) {

        if (!imageError) return;

        imageError.textContent = message;
        imageError.hidden = false;
    }

    function hideImageError() {

        if (!imageError) return;

        imageError.textContent = "";
        imageError.hidden = true;
    }

    // =====================================================
    // 11. IMAGE UPLOAD
    // =====================================================

    on(imageBrowseBtn, "click", event => {

        event.stopPropagation();

        imageInput?.click();
    });

    on(imageUploadArea, "click", event => {

        if (!event.target.closest("button")) {
            imageInput?.click();
        }
    });

    on(imageUploadArea, "keydown", event => {

        if (event.target !== imageUploadArea) return;

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            imageInput?.click();
        }
    });

    on(imageInput, "change", () => {

        if (imageInput.files[0]) {
            handleImage(imageInput.files[0]);
        }
    });

    function handleImage(file) {

        hideImageError();

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {

            showImageError(
                "Choose a PNG, JPG, JPEG or WEBP image."
            );

            imageInput.value = "";
            return;
        }

        if (file.size > 8 * 1024 * 1024) {

            showImageError(
                "Image size must be 8 MB or less."
            );

            imageInput.value = "";
            return;
        }

        clearImage();

        selectedImage = file;

        imageObjectURL = URL.createObjectURL(file);

        if (imagePreview) {
            imagePreview.src = imageObjectURL;
        }

        if (imagePreviewContainer) {
            imagePreviewContainer.hidden = false;
        }

        if (imageInfo) {
            imageInfo.textContent =
                `${file.name} · ${formatFileSize(file.size)}`;
        }

        const heading = imageUploadArea?.querySelector("h3");

        if (heading) {
            heading.textContent = "Image selected successfully";
        }

        resultCard.hidden = true;
    }

    function clearImage() {

        selectedImage = null;

        if (imageInput) {
            imageInput.value = "";
        }

        if (imagePreview) {
            imagePreview.removeAttribute("src");
        }

        if (imagePreviewContainer) {
            imagePreviewContainer.hidden = true;
        }

        if (imageInfo) {
            imageInfo.textContent = "";
        }

        if (imageObjectURL) {
            URL.revokeObjectURL(imageObjectURL);
            imageObjectURL = null;
        }

        const heading = imageUploadArea?.querySelector("h3");

        if (heading) {
            heading.textContent = "Choose an image to upload";
        }
    }

    on(removeImage, "click", () => {

        clearImage();
        hideImageError();
    });

    // =====================================================
    // 12. DRAG AND DROP
    // =====================================================

    function setupDragDrop(area, onFile) {

        if (!area) return;

        area.addEventListener("dragover", event => {

            event.preventDefault();
            area.classList.add("dragover");
        });

        area.addEventListener("dragleave", event => {

            if (!area.contains(event.relatedTarget)) {
                area.classList.remove("dragover");
            }
        });

        area.addEventListener("drop", event => {

            event.preventDefault();

            area.classList.remove("dragover");

            const file = event.dataTransfer.files[0];

            if (file) {
                onFile(file);
            }
        });
    }

    setupDragDrop(imageUploadArea, handleImage);

    // =====================================================
    // 13. VIDEO PREVIEW
    // =====================================================

    on(videoBrowseBtn, "click", event => {

        event.stopPropagation();

        videoInput?.click();
    });

    on(videoUploadArea, "click", event => {

        if (!event.target.closest("button")) {
            videoInput?.click();
        }
    });

    on(videoUploadArea, "keydown", event => {

        if (event.target !== videoUploadArea) return;

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            videoInput?.click();
        }
    });

    on(videoInput, "change", () => {

        if (videoInput.files[0]) {
            handleVideo(videoInput.files[0]);
        }
    });

    setupDragDrop(videoUploadArea, handleVideo);

    function handleVideo(file) {

        if (!file.type.startsWith("video/")) {
            alert("Please choose a valid video file.");
            return;
        }

        if (file.size > 100 * 1024 * 1024) {
            alert("Choose a video smaller than 100 MB.");
            return;
        }

        clearVideo();

        selectedVideo = file;

        videoObjectURL = URL.createObjectURL(file);

        if (videoPreview) {
            videoPreview.src = videoObjectURL;
            videoPreview.load();
        }

        if (videoPreviewContainer) {
            videoPreviewContainer.hidden = false;
        }

        if (videoInfo) {
            videoInfo.textContent =
                `${file.name} · ${formatFileSize(file.size)}`;
        }
    }

    function clearVideo() {

        selectedVideo = null;

        if (videoInput) {
            videoInput.value = "";
        }

        if (videoPreview) {
            videoPreview.pause();
            videoPreview.removeAttribute("src");
            videoPreview.load();
        }

        if (videoPreviewContainer) {
            videoPreviewContainer.hidden = true;
        }

        if (videoInfo) {
            videoInfo.textContent = "";
        }

        if (videoObjectURL) {
            URL.revokeObjectURL(videoObjectURL);
            videoObjectURL = null;
        }
    }

    on(removeVideo, "click", clearVideo);

    // =====================================================
    // 14. ANALYZE BUTTON
    // =====================================================

    on(analyzeBtn, "click", analyzeContent);

    async function analyzeContent() {

        if (isAnalyzing) return;

        resultCard.hidden = true;

        if (extractedTextBox) {
            extractedTextBox.hidden = true;
        }

        if (currentTab === "image") {

            if (!selectedImage) {
                showImageError("Please choose an image first.");
                return;
            }

            hideImageError();

            await analyzeImageContent();

            return;
        }

        if (currentTab === "video") {

            alert(
                "Video preview is available. " +
                "Video prediction is not implemented yet."
            );

            return;
        }

        const text = newsText.value.trim();

        if (text.length < 20) {

            alert(
                "Please enter at least 20 characters of news text."
            );

            newsText.focus();

            return;
        }

        isAnalyzing = true;

        setLoading(
            true,
            "Sending text to the machine-learning model..."
        );

        try {

            const data = await apiRequest(API.predict, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    news: text
                })
            });

            showPrediction(data, "Text");

            await refreshAllData();

        } catch (error) {

            console.error("Text prediction error:", error);

            alert(
                `Text prediction failed:\n${error.message}`
            );

            await checkBackend();

        } finally {

            isAnalyzing = false;

            setLoading(false);
        }
    }

    // =====================================================
    // 15. IMAGE PREDICTION
    // =====================================================

    async function analyzeImageContent() {

        if (isAnalyzing || !selectedImage) return;

        isAnalyzing = true;

        setLoading(
            true,
            "Uploading image and extracting text with OCR..."
        );

        try {

            const formData = new FormData();

            formData.append("image", selectedImage);

            const data = await apiRequest(
                API.predictImage,
                {
                    method: "POST",
                    body: formData
                }
            );

            if (typeof data.prediction !== "string") {
                throw new Error(
                    "No prediction received from the backend."
                );
            }

            const textFromImage =
                String(data.extracted_text || "").trim();

            if (textFromImage) {

                newsText.value = textFromImage;

                updateCharacterCount();
            }

            showPrediction(data, "Image (OCR)");

            if (extractedText) {
                extractedText.textContent =
                    textFromImage ||
                    "No readable text was returned by OCR.";
            }

            if (extractedTextBox) {
                extractedTextBox.hidden = false;
            }

            await refreshAllData();

        } catch (error) {

            console.error("Image analysis error:", error);

            showImageError(
                `Image analysis failed: ${error.message}. ` +
                "Check the Render backend and OCR configuration."
            );

            await checkBackend();

        } finally {

            isAnalyzing = false;

            setLoading(false);
        }
    }

    // =====================================================
    // 16. DISPLAY PREDICTION
    // =====================================================

    function showPrediction(data, defaultType) {

        const prediction =
            String(data.prediction || "").toUpperCase();

        let status = "UNCERTAIN";

        if (prediction.includes("FAKE")) {
            status = "FAKE";
        } else if (prediction.includes("REAL")) {
            status = "REAL";
        }

        const confidence = Math.max(
            0,
            Math.min(100, Number(data.confidence) || 0)
        );

        displayResult({
            status,
            confidence,
            type: data.content_type || defaultType,
            source: data.source || "Trained ML Model",
            confidenceLevel:
                data.confidence_level || "MODEL_SCORE",
            message:
                data.warning ||
                data.message ||
                "This is a model prediction, not a verified fact-check."
        });
    }

    function displayResult(result) {

        resultCard.hidden = false;

        if (resultStatus) {

            resultStatus.textContent = result.status;

            resultStatus.className =
                `result-status ${result.status.toLowerCase()}`;
        }

        if (resultTitle) {

            if (result.status === "FAKE") {
                resultTitle.textContent =
                    "Model predicts potentially misleading content";

            } else if (result.status === "REAL") {
                resultTitle.textContent =
                    "Model predicts likely real content";

            } else {
                resultTitle.textContent =
                    "Prediction is uncertain";
            }
        }

        if (resultMessage) {
            resultMessage.textContent = result.message;
        }

        if (confidenceValue) {
            confidenceValue.textContent =
                `${result.confidence.toFixed(2)}%`;
        }

        if (progressBar) {

            progressBar.style.width =
                `${result.confidence}%`;

            progressBar.className =
                `progress-bar ${result.status.toLowerCase()}`;
        }

        if (confidenceProgress) {

            confidenceProgress.setAttribute(
                "aria-valuenow",
                String(Math.round(result.confidence))
            );
        }

        if (contentType) {
            contentType.textContent = result.type;
        }

        if (sourceResult) {
            sourceResult.textContent = result.source;
        }

        if (languageResult) {

            languageResult.textContent =
                result.type.includes("Image")
                    ? "OCR + Text Classification"
                    : "Text Classification";
        }

        if (confidenceLevel) {

            confidenceLevel.textContent =
                String(result.confidenceLevel).replaceAll("_", " ");
        }

        resultCard.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    // =====================================================
    // 17. LOADING STATE
    // =====================================================

    function setLoading(active, message = "") {

        if (loadingCard) {
            loadingCard.hidden = !active;
        }

        if (loadingMessage) {
            loadingMessage.textContent = message;
        }

        analyzeBtn.disabled = active;
        clearBtn.disabled = active;

        analyzeBtn.textContent =
            active ? "Analyzing..." : "⌕ Analyze Content";
    }

    // =====================================================
    // 18. REFRESH ALL DATA
    // =====================================================

    async function refreshAllData() {

        await Promise.all([
            loadDashboard(),
            loadPredictionHistory(),
            checkBackend()
        ]);
    }

    // =====================================================
    // 19. LOAD DASHBOARD STATISTICS
    // =====================================================

    async function loadDashboard() {

        try {

            const data = await apiRequest(API.dashboard);

            if ($("totalCount")) {
                $("totalCount").textContent = data.total ?? 0;
            }

            if ($("fakeCount")) {
                $("fakeCount").textContent = data.fake ?? 0;
            }

            if ($("realCount")) {
                $("realCount").textContent = data.real ?? 0;
            }

            if ($("averageConfidence")) {

                $("averageConfidence").textContent =
                    `${Number(data.average_confidence || 0).toFixed(1)}%`;
            }

            const total = Number(data.total || 0);
            const fake = Number(data.fake || 0);
            const real = Number(data.real || 0);

            const other = Math.max(
                0,
                total - fake - real
            );

            const fakePct = total ? fake / total * 100 : 0;
            const realPct = total ? real / total * 100 : 0;
            const otherPct = total ? other / total * 100 : 0;

            if ($("fakePercent")) {
                $("fakePercent").textContent =
                    `${fakePct.toFixed(1)}%`;
            }

            if ($("realPercent")) {
                $("realPercent").textContent =
                    `${realPct.toFixed(1)}%`;
            }

            if ($("otherPercent")) {
                $("otherPercent").textContent =
                    `${otherPct.toFixed(1)}%`;
            }

            if ($("fakeDistribution")) {
                $("fakeDistribution").style.width =
                    `${fakePct}%`;
            }

            if ($("realDistribution")) {
                $("realDistribution").style.width =
                    `${realPct}%`;
            }

            if ($("otherDistribution")) {
                $("otherDistribution").style.width =
                    `${otherPct}%`;
            }

            if ($("distributionNote")) {

                $("distributionNote").textContent = total
                    ? `${total} saved prediction${total === 1 ? "" : "s"} included in this summary.`
                    : "Your saved predictions will appear here after analysis.";
            }

            renderDashboardRecent(
                Array.isArray(data.recent) ? data.recent : []
            );

        } catch (error) {

            console.error("Dashboard loading error:", error);

            [
                "totalCount",
                "fakeCount",
                "realCount",
                "averageConfidence"
            ].forEach(id => {
                if ($(id)) {
                    $(id).textContent = "—";
                }
            });

            if ($("dashboardRecent")) {
                $("dashboardRecent").textContent =
                    "Dashboard data is unavailable. Please refresh.";
            }
        }
    }

    // =====================================================
    // 20. RECENT DASHBOARD PREDICTIONS
    // =====================================================

    function renderDashboardRecent(items) {

        const container = $("dashboardRecent");

        if (!container) return;

        container.replaceChildren();

        if (!items.length) {

            const empty = document.createElement("div");

            empty.className = "empty-history";
            empty.textContent = "No recent checks yet.";

            container.appendChild(empty);

            return;
        }

        items.slice(0, 4).forEach(item => {

            const row = document.createElement("div");
            row.className = "dashboard-recent-item";

            const copy = document.createElement("div");
            copy.className = "dashboard-recent-copy";

            const title = document.createElement("div");
            title.className = "dashboard-recent-title";
            title.textContent =
                String(item.news || "Analyzed content");

            const date = document.createElement("div");
            date.className = "dashboard-recent-date";
            date.textContent = item.created_at || "";

            copy.append(title, date);

            const badge = document.createElement("span");

            const prediction =
                String(item.prediction || "UNCERTAIN").toUpperCase();

            badge.className =
                "history-status dashboard-foot-status";

            if (prediction.includes("FAKE")) {
                badge.classList.add("fake");
            } else if (prediction.includes("REAL")) {
                badge.classList.add("real");
            }

            badge.textContent = prediction;

            row.append(copy, badge);

            container.appendChild(row);
        });
    }

    // =====================================================
    // 21. LOAD PREDICTION HISTORY
    // =====================================================

    async function loadPredictionHistory() {

        try {

            const data = await apiRequest(API.history);

            renderHistory(
                Array.isArray(data.history) ? data.history : []
            );

        } catch (error) {

            console.error("History loading error:", error);

            historyList.textContent =
                "History is unavailable. Please check the backend.";
        }
    }

    // =====================================================
    // 22. RENDER HISTORY
    // =====================================================

    function renderHistory(items) {

        historyList.replaceChildren();

        if (!items.length) {

            const empty = document.createElement("div");

            empty.className = "empty-history";

            empty.textContent =
                "No prediction history available. Analyze some news first.";

            historyList.appendChild(empty);

            return;
        }

        items.forEach(item => {

            const row = document.createElement("div");
            row.className = "history-item";

            const left = document.createElement("div");
            left.className = "history-left";

            const icon = document.createElement("div");
            icon.className = "history-icon";

            icon.textContent =
                item.content_type === "Image (OCR)" ? "▧" : "✎";

            const info = document.createElement("div");
            info.className = "history-info";

            const title = document.createElement("div");
            title.className = "history-title";
            title.textContent =
                String(item.news || "Analyzed content");

            const type = document.createElement("div");
            type.className = "history-type";

            type.textContent =
                `${item.content_type || "Text"} · ${Number(item.confidence || 0).toFixed(2)}% confidence`;

            const date = document.createElement("div");
            date.className = "history-date";
            date.textContent = item.created_at || "";

            info.append(title, type, date);
            left.append(icon, info);

            const badge = document.createElement("span");

            const prediction =
                String(item.prediction || "UNCERTAIN").toUpperCase();

            badge.className = "history-status";

            if (prediction.includes("FAKE")) {
                badge.classList.add("fake");
            } else if (prediction.includes("REAL")) {
                badge.classList.add("real");
            }

            badge.textContent = prediction;

            row.append(left, badge);

            historyList.appendChild(row);
        });
    }

    // =====================================================
    // 23. CLEAR TEXT AND FILE INPUT
    // =====================================================

    on(clearBtn, "click", () => {

        if (isAnalyzing) return;

        newsText.value = "";

        updateCharacterCount();

        clearImage();
        clearVideo();

        hideImageError();

        resultCard.hidden = true;

        if (extractedTextBox) {
            extractedTextBox.hidden = true;
        }

        newsText.focus();
    });

    // =====================================================
    // 24. CLEAR HISTORY
    // =====================================================

    on(clearHistoryBtn, "click", async () => {

        if (isClearingHistory || isAnalyzing) return;

        const confirmed = confirm(
            "Delete all your saved prediction history? This cannot be undone."
        );

        if (!confirmed) return;

        isClearingHistory = true;

        clearHistoryBtn.disabled = true;

        try {

            await apiRequest(API.clearHistory, {
                method: "DELETE"
            });

            await refreshAllData();

            alert("Your prediction history has been cleared.");

        } catch (error) {

            console.error("Clear history error:", error);

            alert(
                `Could not clear history:\n${error.message}`
            );

        } finally {

            isClearingHistory = false;

            clearHistoryBtn.disabled = false;
        }
    });

    // =====================================================
    // 25. REFRESH DASHBOARD
    // =====================================================

    on(refreshDashboardBtn, "click", async () => {

        refreshDashboardBtn.disabled = true;

        const originalText = refreshDashboardBtn.textContent;

        refreshDashboardBtn.textContent = "Refreshing...";

        try {

            await refreshAllData();

        } finally {

            refreshDashboardBtn.disabled = false;

            refreshDashboardBtn.textContent =
                originalText || "↻ Refresh";
        }
    });

    // =====================================================
    // 26. LOGOUT
    // =====================================================

    on(logoutBtn, "click", async () => {

        if (isLoggingOut) return;

        const confirmed = confirm(
            "Are you sure you want to logout?"
        );

        if (!confirmed) return;

        isLoggingOut = true;

        logoutBtn.disabled = true;
        logoutBtn.textContent = "Logging out...";

        try {

            await apiRequest(API.logout, {
                method: "POST"
            });

            window.location.replace("login.html");

        } catch (error) {

            console.error("Logout error:", error);

            alert(`Logout failed: ${error.message}`);

            isLoggingOut = false;

            logoutBtn.disabled = false;
            logoutBtn.textContent = "Logout";
        }
    });

    // =====================================================
    // 27. COPY EXTRACTED OCR TEXT
    // =====================================================

    on(copyExtractedText, "click", async () => {

        const text = extractedText?.textContent.trim() || "";

        if (!text) {
            alert("There is no extracted text to copy.");
            return;
        }

        try {

            await navigator.clipboard.writeText(text);

            alert("Extracted text copied successfully.");

        } catch {

            alert(
                "Copy failed. Select the extracted text and copy it manually."
            );
        }
    });

    // =====================================================
    // 28. FILE SIZE FORMAT
    // =====================================================

    function formatFileSize(bytes) {

        if (bytes < 1024) {
            return `${bytes} Bytes`;
        }

        const units = ["KB", "MB", "GB"];

        let size = bytes / 1024;
        let unit = 0;

        while (
            size >= 1024 &&
            unit < units.length - 1
        ) {
            size /= 1024;
            unit++;
        }

        return `${size.toFixed(2)} ${units[unit]}`;
    }

    // =====================================================
    // 29. INITIAL APPLICATION START
    // =====================================================

    async function initializeDashboard() {

        updateCharacterCount();

        setBackendStatus(false, "Connecting...");

        const authenticated = await checkLogin();

        if (!authenticated) {
            return;
        }

        await refreshAllData();

        console.log(
            "NewsCheck dashboard and analyzer initialized."
        );
    }

    initializeDashboard();

    // =====================================================
    // 30. CLEAN UP TEMPORARY FILE PREVIEWS
    // =====================================================

    window.addEventListener("beforeunload", () => {

        if (imageObjectURL) {
            URL.revokeObjectURL(imageObjectURL);
        }

        if (videoObjectURL) {
            URL.revokeObjectURL(videoObjectURL);
        }
    });

});
