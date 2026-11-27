
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    // =====================================
    // 1. BACKEND URL
    // =====================================

    const API_BASE = "https://news-check-np3i.onrender.com";

    // =====================================
    // 2. HTML ELEMENTS
    // =====================================

    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");

    const loginTab = document.getElementById("loginTab");
    const registerTab = document.getElementById("registerTab");

    const formHeading = document.getElementById("formHeading");
    const formDescription = document.getElementById("formDescription");

    const messageBox = document.getElementById("messageBox");
    const bottomText = document.getElementById("bottomText");

    const loginButton = document.getElementById("loginButton");
    const registerButton = document.getElementById("registerButton");

    if (!loginForm || !registerForm || !loginTab ||
        !registerTab || !messageBox ||
        !loginButton || !registerButton) {
        console.error("Required login/register HTML elements are missing.");
        return;
    }

    // =====================================
    // 3. INPUT HELPER
    // =====================================

    function getInput(ids) {
        for (const id of ids) {
            const element = document.getElementById(id);
            if (element) return element;
        }
        return null;
    }

    function getValue(ids) {
        const element = getInput(ids);
        return element ? element.value.trim() : "";
    }

    // =====================================
    // 4. MESSAGE FUNCTION
    // =====================================

    function showMessage(message, type = "error") {
        messageBox.textContent = message;
        messageBox.className = "message-box show " + type;
    }

    function clearMessage() {
        messageBox.textContent = "";
        messageBox.className = "message-box";
    }

    // =====================================
    // 5. LOADING BUTTON
    // =====================================

    function setLoading(button, loading, normalText) {
        button.disabled = loading;
        button.textContent = loading ? "Please wait..." : normalText;
    }

    // =====================================
    // 6. API REQUEST
    // =====================================

    async function apiRequest(endpoint, options = {}) {
        let response;

        try {
            response = await fetch(API_BASE + endpoint, {
                ...options,
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                }
            });
        } catch (error) {
            console.error(error);
            throw new Error(
                "Cannot connect to NewsCheck backend. Please try again."
            );
        }

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("Invalid response from backend.");
        }

        if (!response.ok) {
            throw new Error(
                data.message || data.error || `Request failed (${response.status})`
            );
        }

        return data;
    }

    // =====================================
    // 7. SWITCH LOGIN / REGISTER
    // =====================================

    function showLogin() {
        loginForm.classList.remove("hidden");
        registerForm.classList.add("hidden");

        loginTab.classList.add("active");
        registerTab.classList.remove("active");

        if (formHeading) {
            formHeading.textContent = "Welcome Back!";
        }

        if (formDescription) {
            formDescription.textContent =
                "Login to continue to your dashboard.";
        }

        if (bottomText) {
            bottomText.textContent = "Don't have an account? ";

            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Create Account";
            button.addEventListener("click", showRegister);

            bottomText.appendChild(button);
        }

        clearMessage();
    }

    function showRegister() {
        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");

        loginTab.classList.remove("active");
        registerTab.classList.add("active");

        if (formHeading) {
            formHeading.textContent = "Create Your Account";
        }

        if (formDescription) {
            formDescription.textContent =
                "Register to start using NewsCheck.";
        }

        if (bottomText) {
            bottomText.textContent = "Already have an account? ";

            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Login";
            button.addEventListener("click", showLogin);

            bottomText.appendChild(button);
        }

        clearMessage();
    }

    loginTab.addEventListener("click", showLogin);
    registerTab.addEventListener("click", showRegister);

    // =====================================
    // 8. PASSWORD SHOW / HIDE
    // =====================================

    document.querySelectorAll(".toggle-password").forEach(button => {
        button.addEventListener("click", () => {
            const input = document.getElementById(button.dataset.target);

            if (!input) return;

            if (input.type === "password") {
                input.type = "text";
                button.textContent = "Hide";
            } else {
                input.type = "password";
                button.textContent = "Show";
            }
        });
    });

    // =====================================
    // 9. LOGIN
    // =====================================

    loginForm.addEventListener("submit", async event => {
        event.preventDefault();
        clearMessage();

        const email = getValue(["loginEmail", "email"]);
        const password = getValue(["loginPassword", "password"]);

        if (!email || !password) {
            showMessage("Please enter your email and password.");
            return;
        }

        setLoading(loginButton, true, "Login to Dashboard");

        try {
            const data = await apiRequest("/api/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });

            if (data.status !== "success") {
                throw new Error(data.message || "Login failed.");
            }

            const session = await apiRequest("/api/auth/me");

            if (session.status !== "success" ||
                session.authenticated !== true) {
                throw new Error("Login session could not be verified.");
            }

            showMessage("Login successful! Opening dashboard...", "success");
            window.location.assign("./index.html");

        } catch (error) {
            showMessage(error.message);
        } finally {
            setLoading(loginButton, false, "Login to Dashboard");
        }
    });

    // =====================================
    // 10. REGISTER
    // =====================================

    registerForm.addEventListener("submit", async event => {
        event.preventDefault();
        clearMessage();

        const name = getValue([
            "registerName",
            "fullName",
            "name"
        ]);

        const email = getValue([
            "registerEmail",
            "email"
        ]);

        const password = getValue([
            "registerPassword",
            "password"
        ]);

        const confirmPassword = getValue([
            "confirmPassword",
            "registerConfirmPassword",
            "confirm_password"
        ]);

        // Check if HTML input elements exist
        if (
            !getInput(["registerName", "fullName", "name"]) ||
            !getInput(["registerEmail", "email"]) ||
            !getInput(["registerPassword", "password"]) ||
            !getInput([
                "confirmPassword",
                "registerConfirmPassword",
                "confirm_password"
            ])
        ) {
            console.error("Registration input IDs do not match login.js.");
            showMessage("Registration form fields are not connected correctly. Please check login.html.");
            return;
        }

        if (!name || !email || !password || !confirmPassword) {
            showMessage("Please fill in all fields.");
            return;
        }

        if (password.length < 8) {
            showMessage("Password must contain at least 8 characters.");
            return;
        }

        if (password !== confirmPassword) {
            showMessage("Passwords do not match.");
            return;
        }

        setLoading(registerButton, true, "Create Account");

        try {
            const data = await apiRequest("/api/auth/register", {
                method: "POST",
                body: JSON.stringify({
                    name: name,
                    email: email,
                    password: password
                })
            });

            if (data.status !== "success") {
                throw new Error(data.message || "Registration failed.");
            }

            showMessage(
                "Account created successfully! Please login.",
                "success"
            );

            registerForm.reset();
            showLogin();

        } catch (error) {
            showMessage(error.message);
        } finally {
            setLoading(registerButton, false, "Create Account");
        }
    });

    // =====================================
    // 11. EXISTING SESSION CHECK
    // =====================================

    async function checkExistingSession() {
        try {
            const session = await apiRequest("/api/auth/me");

            if (
                session.status === "success" &&
                session.authenticated === true
            ) {
                window.location.replace("./index.html");
            }
        } catch (error) {
            console.warn("Session check:", error.message);
        }
    }

    checkExistingSession();

});
