
document.addEventListener("DOMContentLoaded", () => {

    // =====================================
    // 1. BACKEND URL
    // =====================================

    const API_URL = "http://127.0.0.1:5000";


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
    const bottomSwitch = document.getElementById("bottomSwitch");

    const loginButton = document.getElementById("loginButton");
    const registerButton = document.getElementById("registerButton");


    // =====================================
    // 3. MESSAGE FUNCTION
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
    // 4. BUTTON LOADING
    // =====================================

    function setLoading(button, loading, normalText) {

        button.disabled = loading;

        button.textContent = loading
            ? "Please wait..."
            : normalText;
    }


    // =====================================
    // 5. API REQUEST
    // =====================================

    async function apiRequest(endpoint, options = {}) {

        let response;

        try {

            response = await fetch(API_URL + endpoint, {

                ...options,

                credentials: "include",

                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                }

            });

        } catch (error) {

            throw new Error(
                "Cannot connect to NewsCheck backend. Please start Flask server."
            );

        }

        let data;

        try {

            data = await response.json();

        } catch {

            throw new Error("Invalid response received from backend.");

        }

        if (!response.ok) {

            throw new Error(
                data.message ||
                data.error ||
                "Request failed. Please try again."
            );

        }

        return data;
    }


    // =====================================
    // 6. SWITCH LOGIN / REGISTER
    // =====================================

    function showLogin() {

        loginForm.classList.remove("hidden");
        registerForm.classList.add("hidden");

        loginTab.classList.add("active");
        registerTab.classList.remove("active");

        formHeading.textContent = "Welcome Back!";

        formDescription.textContent =
            "Login to continue to your dashboard.";

        bottomText.innerHTML = "";

        bottomText.append(
            document.createTextNode("Don't have an account? ")
        );

        const button = document.createElement("button");

        button.type = "button";
        button.textContent = "Create Account";

        button.addEventListener("click", showRegister);

        bottomText.append(button);

        clearMessage();
    }


    function showRegister() {

        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");

        loginTab.classList.remove("active");
        registerTab.classList.add("active");

        formHeading.textContent = "Create Your Account";

        formDescription.textContent =
            "Register to start using NewsCheck.";

        bottomText.innerHTML = "";

        bottomText.append(
            document.createTextNode("Already have an account? ")
        );

        const button = document.createElement("button");

        button.type = "button";
        button.textContent = "Login";

        button.addEventListener("click", showLogin);

        bottomText.append(button);

        clearMessage();
    }


    loginTab.addEventListener("click", showLogin);
    registerTab.addEventListener("click", showRegister);

    bottomSwitch.addEventListener("click", showRegister);


    // =====================================
    // 7. PASSWORD SHOW / HIDE
    // =====================================

    document.querySelectorAll(".toggle-password").forEach(button => {

        button.addEventListener("click", () => {

            const input = document.getElementById(
                button.dataset.target
            );

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
    // 8. LOGIN FUNCTION
    // =====================================

    loginForm.addEventListener("submit", async event => {

        event.preventDefault();

        clearMessage();

        const email = document
            .getElementById("loginEmail")
            .value.trim();

        const password = document
            .getElementById("loginPassword")
            .value;

        if (!email || !password) {

            showMessage("Please enter your email and password.");

            return;
        }

        setLoading(loginButton, true, "Login to Dashboard");

        try {

            const data = await apiRequest("/api/auth/login", {

                method: "POST",

                body: JSON.stringify({
                    email: email,
                    password: password
                })

            });

            if (data.status !== "success") {

                throw new Error(data.message || "Login failed.");

            }

            showMessage("Login successful! Opening dashboard...", "success");

            // Verify that the session cookie is accepted.
            const session = await apiRequest("/api/auth/me", {
                method: "GET"
            });

            if (session.status !== "success") {

                throw new Error("Session verification failed.");

            }

            // Redirect to the existing dashboard.
            window.location.assign("./index.html");

        } catch (error) {

            showMessage(error.message);

        } finally {

            setLoading(loginButton, false, "Login to Dashboard");

        }

    });


    // =====================================
    // 9. REGISTER FUNCTION
    // =====================================

    registerForm.addEventListener("submit", async event => {

        event.preventDefault();

        clearMessage();

        const name = document
            .getElementById("registerName")
            .value.trim();

        const email = document
            .getElementById("registerEmail")
            .value.trim();

        const password = document
            .getElementById("registerPassword")
            .value;

        const confirmPassword = document
            .getElementById("confirmPassword")
            .value;


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
                "Account created successfully! Opening dashboard...",
                "success"
            );

            // Verify the newly created session.
            const session = await apiRequest("/api/auth/me", {
                method: "GET"
            });

            if (session.status !== "success") {

                throw new Error("Account created, but session verification failed. Please login.");

            }

            window.location.assign("./index.html");

        } catch (error) {

            showMessage(error.message);

        } finally {

            setLoading(registerButton, false, "Create Account");

        }

    });


    // =====================================
    // 10. CHECK EXISTING LOGIN
    // =====================================

    async function checkExistingSession() {

        try {

            const response = await fetch(
                API_URL + "/api/auth/me",
                {
                    method: "GET",
                    credentials: "include"
                }
            );

            if (response.ok) {

                window.location.replace("./index.html");

            }

        } catch (error) {

            console.warn("Backend is not available yet.", error);

        }

    }

    checkExistingSession();

});
