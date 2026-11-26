
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    // =====================================================
    // 1. API CONFIGURATION - RENDER BACKEND
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
    // 2. HTML ELEMENT HELPER
    // =====================================================

    const $ = id => document.getElementById(id);

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
            console.error(`Required HTML element missing: ${id}`);
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
    // 5. RESPONSE HANDLER
    // =====================================================

    async function readResponse(response) {
        const body = await response.text();

        try {
            return body ? JSON.parse(body) : {};
        } catch {
            throw new Error(
                "Backend did not return valid JSON. Please check the Render backend."
            );
        }
    }


    // =====================================================
    // 6. AUTHENTICATION CHECK
    // =====================================================

    async function checkLogin() {
        try {
            const response = await fetch(API.loginCheck, {
                method: "GET",
                credentials: "include"
            });

            if (response.status === 401) {
                window.location.replace("login.html");
                return false;
            }

            const data = await readResponse(response);

            if (!response.ok || !data.authenticated) {
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

            alert(
                "Cannot connect to NewsCheck backend. " +
                "Please check your internet connection and Render service."
            );

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
            const response = await fetch(API.health);
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

    newsText.addEventListener("input", updateCharacterCount);


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
    // 10. IMAGE UPLOAD
    // =====================================================

    imageBrowseBtn.addEventListener("click", event => {
        event.stopPropagation();
        imageInput.click();
    });


    imageUploadArea.addEventListener("click", event => {
        if (!event.target.closest("button")) {
            imageInput.click();
        }
    });


    imageUploadArea.addEventListener("keydown", event => {
        if (event.target !== imageUploadArea) return;

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            imageInput.click();
        }
    });


    imageInput.addEventListener("change", () => {
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

        imagePreview.src = imageObjectURL;
        imagePreviewContainer.hidden = false;

        imageInfo.textContent =
            `${file.name} · ${formatFileSize(file.size)}`;

        imageUploadArea.querySelector("h3").textContent =
            "Image selected successfully";

        resultCard.hidden = true;
    }


    function clearImage() {
        selectedImage = null;
        imageInput.value = "";

        imagePreview.removeAttribute("src");
        imagePreviewContainer.hidden = true;
        imageInfo.textContent = "";

        if (imageObjectURL) {
            URL.revokeObjectURL(imageObjectURL);
            imageObjectURL = null;
        }

        imageUploadArea.querySelector("h3").textContent =
            "Choose an image to upload";
    }


    removeImage.addEventListener("click", () => {
        clearImage();
        hideImageError();
    });


    function showImageError(message) {
        imageError.textContent = message;
        imageError.hidden = false;
    }


    function hideImageError() {
        imageError.textContent = "";
        imageError.hidden = true;
    }


    // =====================================================
    // 11. DRAG AND DROP
    // =====================================================

    function setupDragDrop(area, onFile) {

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
    // 12. VIDEO PREVIEW
    // =====================================================

    videoBrowseBtn.addEventListener("click", event => {
        event.stopPropagation();
        videoInput.click();
    });


    videoUploadArea.addEventListener("click", event => {
        if (!event.target.closest("button")) {
            videoInput.click();
        }
    });


    videoUploadArea.addEventListener("keydown", event => {
        if (event.target !== videoUploadArea) return;

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            videoInput.click();
        }
    });


    videoInput.addEventListener("change", () => {
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

        videoPreview.src = videoObjectURL;
        videoPreview.load();

        videoPreviewContainer.hidden = false;

        videoInfo.textContent =
            `${file.name} · ${formatFileSize(file.size)}`;
    }


    function clearVideo() {
        selectedVideo = null;
        videoInput.value = "";

        videoPreview.pause();
        videoPreview.removeAttribute("src");
        videoPreview.load();

        videoPreviewContainer.hidden = true;
        videoInfo.textContent = "";

        if (videoObjectURL) {
            URL.revokeObjectURL(videoObjectURL);
            videoObjectURL = null;
        }
    }


    removeVideo.addEventListener("click", clearVideo);


    // =====================================================
    // 13. ANALYZE BUTTON
    // =====================================================

    analyzeBtn.addEventListener("click", analyzeContent);


    async function analyzeContent() {

        if (isAnalyzing) return;

        resultCard.hidden = true;
        extractedTextBox.hidden = true;

        if (currentTab === "image") {

            if (!selectedImage) {
                showImageError(
                    "Please choose an image first."
                );
                return;
            }

            hideImageError();

            await analyzeImageContent();
            return;
        }

        if (currentTab === "video") {
            alert(
                "Video preview is available. " +
                "Video prediction is not implemented in this project."
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

            const response = await fetch(API.predict, {
                method: "POST",
                credentials: "include",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    news: text
                })
            });

            const data = await readResponse(response);

            if (response.status === 401) {
                window.location.replace("login.html");
                return;
            }

            if (!response.ok) {
                throw new Error(
                    data.error || `HTTP ${response.status}`
                );
            }

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
    // 14. IMAGE PREDICTION
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

            const response = await fetch(API.predictImage, {
                method: "POST",
                credentials: "include",
                body: formData
            });

            const data = await readResponse(response);

            if (response.status === 401) {
                window.location.replace("login.html");
                return;
            }

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    `Image API error: HTTP ${response.status}`
                );
            }

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

            extractedText.textContent =
                textFromImage ||
                "No readable text was returned by OCR.";

            extractedTextBox.hidden = false;

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
    // 15. DISPLAY PREDICTION
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
            status: status,
            confidence: confidence,

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

        resultStatus.textContent = result.status;

        resultStatus.className =
            `result-status ${result.status.toLowerCase()}`;


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


        resultMessage.textContent = result.message;

        confidenceValue.textContent =
            `${result.confidence.toFixed(2)}%`;

        progressBar.style.width =
            `${result.confidence}%`;

        progressBar.className =
            `progress-bar ${result.status.toLowerCase()}`;

        confidenceProgress.setAttribute(
            "aria-valuenow",
            String(Math.round(result.confidence))
        );

        contentType.textContent = result.type;

        sourceResult.textContent = result.source;

        languageResult.textContent =
            result.type.includes("Image")
                ? "OCR + Text Classification"
                : "Text Classification";

        confidenceLevel.textContent =
            String(result.confidenceLevel).replaceAll("_", " ");

        resultCard.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }


    // =====================================================
    // 16. LOADING STATE
    // =====================================================

    function setLoading(active, message = "") {

        loadingCard.hidden = !active;

        loadingMessage.textContent = message;

        analyzeBtn.disabled = active;
        clearBtn.disabled = active;

        analyzeBtn.textContent =
            active ? "Analyzing..." : "⌕ Analyze Content";
    }


    // =====================================================
    // 17. DASHBOARD REFRESH
    // =====================================================

    async function refreshAllData() {

        await Promise.all([
            loadDashboard(),
            loadPredictionHistory(),
            checkBackend()
        ]);
    }


    // =====================================================
    // 18. LOAD DASHBOARD STATISTICS
    // =====================================================

    async function loadDashboard() {

        try {

            const response = await fetch(API.dashboard, {
                credentials: "include"
            });

            const data = await readResponse(response);

            if (response.status === 401) {
                window.location.replace("login.html");
                return;
            }

            if (!response.ok) {
                throw new Error(
                    data.error || "Dashboard could not be loaded."
                );
            }

            $("totalCount").textContent = data.total ?? 0;

            $("fakeCount").textContent = data.fake ?? 0;

            $("realCount").textContent = data.real ?? 0;

            $("averageConfidence").textContent =
                `${Number(data.average_confidence || 0).toFixed(1)}%`;


            const total = Number(data.total || 0);

            const fake = Number(data.fake || 0);

            const real = Number(data.real || 0);

            const other = Math.max(
                0,
                total - fake - real
            );


            const fakePct =
                total ? fake / total * 100 : 0;

            const realPct =
                total ? real / total * 100 : 0;

            const otherPct =
                total ? other / total * 100 : 0;


            $("fakePercent").textContent =
                `${fakePct.toFixed(1)}%`;

            $("realPercent").textContent =
                `${realPct.toFixed(1)}%`;

            $("otherPercent").textContent =
                `${otherPct.toFixed(1)}%`;


            $("fakeDistribution").style.width =
                `${fakePct}%`;

            $("realDistribution").style.width =
                `${realPct}%`;

            $("otherDistribution").style.width =
                `${otherPct}%`;


            $("distributionNote").textContent = total
                ? `${total} saved prediction${total === 1 ? "" : "s"} included in this summary.`
                : "Your saved predictions will appear here after analysis.";


            renderDashboardRecent(
                Array.isArray(data.recent) ? data.recent : []
            );

        } catch (error) {

            console.error("Dashboard loading error:", error);

            $("totalCount").textContent = "—";
            $("fakeCount").textContent = "—";
            $("realCount").textContent = "—";
            $("averageConfidence").textContent = "—";

            $("dashboardRecent").textContent =
                "Dashboard data is unavailable. Please refresh.";
        }
    }


    // =====================================================
    // 19. RECENT DASHBOARD PREDICTIONS
    // =====================================================

    function renderDashboardRecent(items) {

        const container = $("dashboardRecent");

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
    // 20. LOAD PREDICTION HISTORY
    // =====================================================

    async function loadPredictionHistory() {

        try {

            const response = await fetch(API.history, {
                credentials: "include"
            });

            const data = await readResponse(response);

            if (response.status === 401) {
                window.location.replace("login.html");
                return;
            }

            if (!response.ok) {
                throw new Error(
                    data.error || "Could not load history."
                );
            }

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
    // 21. RENDER HISTORY
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
    // 22. CLEAR TEXT INPUT
    // =====================================================

    clearBtn.addEventListener("click", () => {

        if (isAnalyzing) return;

        newsText.value = "";

        updateCharacterCount();

        clearImage();

        clearVideo();

        hideImageError();

        resultCard.hidden = true;

        extractedTextBox.hidden = true;

        newsText.focus();
    });


    // =====================================================
    // 23. CLEAR PREDICTION HISTORY
    // =====================================================

    clearHistoryBtn.addEventListener("click", async () => {

        if (isClearingHistory || isAnalyzing) return;

        const confirmed = confirm(
            "Delete all your saved prediction history? This cannot be undone."
        );

        if (!confirmed) return;

        isClearingHistory = true;

        clearHistoryBtn.disabled = true;

        try {

            const response = await fetch(API.clearHistory, {
                method: "DELETE",
                credentials: "include"
            });

            const data = await readResponse(response);

            if (response.status === 401) {
                window.location.replace("login.html");
                return;
            }

            if (!response.ok) {
                throw new Error(
                    data.error || "Unable to clear history."
                );
            }

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
    // 24. REFRESH DASHBOARD BUTTON
    // =====================================================

    refreshDashboardBtn.addEventListener("click", async () => {

        refreshDashboardBtn.disabled = true;

        refreshDashboardBtn.textContent = "Refreshing...";

        try {
            await refreshAllData();
        } finally {
            refreshDashboardBtn.disabled = false;
            refreshDashboardBtn.textContent = "↻ Refresh";
        }
    });


    // =====================================================
    // 25. LOGOUT
    // =====================================================

    logoutBtn.addEventListener("click", async () => {

        if (isLoggingOut) return;

        const confirmed = confirm(
            "Are you sure you want to logout?"
        );

        if (!confirmed) return;

        isLoggingOut = true;

        logoutBtn.disabled = true;

        logoutBtn.textContent = "Logging out...";

        try {

            const response = await fetch(API.logout, {
                method: "POST",
                credentials: "include"
            });

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(
                    data.error || "Logout failed."
                );
            }

            window.location.replace("login.html");

        } catch (error) {

            console.error("Logout error:", error);

            alert(
                `Logout failed: ${error.message}`
            );

            isLoggingOut = false;

            logoutBtn.disabled = false;

            logoutBtn.textContent = "Logout";
        }
    });


    // =====================================================
    // 26. COPY EXTRACTED OCR TEXT
    // =====================================================

    copyExtractedText.addEventListener("click", async () => {

        const text = extractedText.textContent.trim();

        if (!text) {
            alert("There is no extracted text to copy.");
            return;
        }

        try {

            await navigator.clipboard.writeText(text);

            alert("Extracted text copied successfully.");

        } catch (error) {

            alert(
                "Copy failed. Select the extracted text and copy it manually."
            );
        }
    });


    // =====================================================
    // 27. FILE SIZE FORMAT
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
    // 28. INITIAL APPLICATION START
    // =====================================================

    async function initializeDashboard() {

        updateCharacterCount();

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
    // 29. CLEAN UP TEMPORARY FILE PREVIEWS
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
