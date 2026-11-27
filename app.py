
import os
import sqlite3
import joblib
import numpy as np
import pytesseract

from datetime import datetime
from functools import wraps
from io import BytesIO

from PIL import Image

from flask import Flask, request, jsonify, session
from flask_cors import CORS

from werkzeug.security import (
    generate_password_hash,
    check_password_hash
)

from sklearn.metrics.pairwise import cosine_similarity


# =====================================================
# 1. APP SETTINGS
# =====================================================

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")

MODEL_PATH = os.path.join(
    MODEL_DIR,
    "fake_news_model.joblib"
)

REFERENCE_PATH = os.path.join(
    MODEL_DIR,
    "news_reference.joblib"
)

DATABASE_PATH = os.path.join(
    BASE_DIR,
    "history.db"
)

app.secret_key = os.environ.get(
    "SECRET_KEY",
    "development-only-change-this-secret"
)

FRONTEND_ORIGIN = os.environ.get(
    "FRONTEND_ORIGIN",
    "https://newscheck-frontend-sooty.vercel.app"
)

CORS(
    app,
    origins=[FRONTEND_ORIGIN],
    supports_credentials=True
)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_SAMESITE="None",
    MAX_CONTENT_LENGTH=5 * 1024 * 1024
)

MAX_NEWS_LENGTH = 15000
MIN_NEWS_LENGTH = 20

model = None
reference_data = None
reference_vectorizer = None
reference_matrix = None
reference_labels = None

model_loaded = False
reference_loaded = False


# =====================================================
# 2. DATABASE
# =====================================================

def get_db():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_database():

    connection = get_db()

    connection.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            news TEXT NOT NULL,
            prediction TEXT NOT NULL,
            confidence REAL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)

    connection.commit()
    connection.close()

    print("Database initialized successfully.")


# =====================================================
# 3. LOAD ML MODEL
# =====================================================

def load_model():

    global model, model_loaded

    try:

        if not os.path.exists(MODEL_PATH):
            print("Model file not found:", MODEL_PATH)
            model = None
            model_loaded = False
            return False

        model = joblib.load(MODEL_PATH)

        if not hasattr(model, "predict"):
            raise ValueError("Invalid ML model.")

        model_loaded = True

        print("ML model loaded successfully.")
        return True

    except Exception as error:

        print("Model loading error:", error)
        model = None
        model_loaded = False
        return False


# =====================================================
# 4. LOAD REFERENCE DATA
# =====================================================

def load_reference_data():

    global reference_data
    global reference_vectorizer
    global reference_matrix
    global reference_labels
    global reference_loaded

    try:

        if not os.path.exists(REFERENCE_PATH):
            print("Reference file not found:", REFERENCE_PATH)
            reference_loaded = False
            return False

        reference_data = joblib.load(REFERENCE_PATH)

        reference_vectorizer = reference_data["vectorizer"]
        reference_matrix = reference_data["matrix"]

        reference_labels = np.asarray(
            reference_data["labels"]
        )

        if reference_matrix.shape[0] == 0:
            raise ValueError("Reference dataset is empty.")

        if reference_matrix.shape[0] != len(reference_labels):
            raise ValueError("Reference data mismatch.")

        reference_loaded = True

        print("Reference dataset loaded successfully.")
        print("Reference records:", reference_matrix.shape[0])

        return True

    except Exception as error:

        print("Reference loading error:", error)

        reference_data = None
        reference_vectorizer = None
        reference_matrix = None
        reference_labels = None

        reference_loaded = False

        return False


# =====================================================
# 5. LOGIN REQUIRED
# =====================================================

def login_required(function):

    @wraps(function)
    def wrapper(*args, **kwargs):

        if not session.get("user_id"):
            return jsonify({
                "status": "error",
                "message": "Please login first."
            }), 401

        return function(*args, **kwargs)

    return wrapper


# =====================================================
# 6. DATASET SIMILARITY
# =====================================================

def calculate_dataset_similarity(news_text):

    if not reference_loaded:
        return {
            "available": False,
            "similarity": 0,
            "nearest_label": None
        }

    try:

        query_vector = reference_vectorizer.transform(
            [news_text]
        )

        if query_vector.nnz == 0:
            return {
                "available": True,
                "similarity": 0,
                "nearest_label": None
            }

        similarities = cosine_similarity(
            query_vector,
            reference_matrix
        )[0]

        best_index = int(np.argmax(similarities))

        return {
            "available": True,
            "similarity": float(similarities[best_index]),
            "nearest_label": int(reference_labels[best_index])
        }

    except Exception as error:

        print("Similarity error:", error)

        return {
            "available": False,
            "similarity": 0,
            "nearest_label": None
        }


# =====================================================
# 7. ML PREDICTION
# =====================================================

def predict_news(news_text):

    if not model_loaded or model is None:
        return {
            "status": "error",
            "prediction": "NEED MORE INFORMATION",
            "confidence": None,
            "similarity": 0,
            "message": "ML model is unavailable."
        }

    news_text = str(news_text).strip()

    if len(news_text) < MIN_NEWS_LENGTH:
        return {
            "status": "error",
            "prediction": "NEED MORE INFORMATION",
            "confidence": None,
            "similarity": 0,
            "message": "Please provide more news information."
        }

    try:

        ml_prediction = int(
            model.predict([news_text])[0]
        )

        probabilities = model.predict_proba(
            [news_text]
        )[0]

        confidence = float(
            probabilities[ml_prediction]
        ) * 100

        similarity_result = calculate_dataset_similarity(
            news_text
        )

        similarity = float(
            similarity_result.get("similarity", 0)
        )

        CONFIDENCE_THRESHOLD = 60.0

        if confidence < CONFIDENCE_THRESHOLD:

            final_prediction = "NEED MORE INFORMATION"

            message = (
                "The model is not sufficiently confident. "
                "More reliable information is required."
            )

        else:

            if ml_prediction == 1:
                final_prediction = "REAL NEWS"
            else:
                final_prediction = "FAKE NEWS"

            message = (
                "Prediction generated using the trained "
                "machine learning model."
            )

        return {
            "status": "success",
            "prediction": final_prediction,

            "ml_prediction": (
                "REAL NEWS" if ml_prediction == 1
                else "FAKE NEWS"
            ),

            "confidence": round(confidence, 2),
            "similarity": round(similarity * 100, 2),

            "real_probability": round(
                float(probabilities[1]) * 100, 2
            ),

            "fake_probability": round(
                float(probabilities[0]) * 100, 2
            ),

            "message": message,

            "verification_note": (
                "This is an ML prediction, not independent "
                "verification of whether the news is true."
            )
        }

    except Exception as error:

        print("Prediction error:", error)

        return {
            "status": "error",
            "prediction": "NEED MORE INFORMATION",
            "confidence": None,
            "similarity": 0,
            "message": "Unable to classify this news."
        }


# =====================================================
# 8. SAVE HISTORY
# =====================================================

def save_history(user_id, news, prediction, confidence):

    connection = get_db()

    try:

        connection.execute("""
            INSERT INTO history
            (user_id, news, prediction, confidence, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (
            user_id,
            news,
            prediction,
            confidence,
            datetime.now().isoformat()
        ))

        connection.commit()

    finally:
        connection.close()


# =====================================================
# 9. REGISTER
# =====================================================

@app.route("/api/auth/register", methods=["POST"])
def register():

    data = request.get_json(silent=True) or {}

    # Accept both frontend field names
    username = str(
        data.get("name") or data.get("username") or ""
    ).strip()

    email = str(
        data.get("email") or ""
    ).strip().lower()

    password = str(
        data.get("password") or ""
    )

    if not username or not email or not password:
        return jsonify({
            "status": "error",
            "message": "All fields are required."
        }), 400

    if len(username) > 80:
        return jsonify({
            "status": "error",
            "message": "Name must be 80 characters or less."
        }), 400

    if len(password) < 8:
        return jsonify({
            "status": "error",
            "message": "Password must contain at least 8 characters."
        }), 400

    connection = get_db()

    try:

        connection.execute("""
            INSERT INTO users
            (username, email, password, created_at)
            VALUES (?, ?, ?, ?)
        """, (
            username,
            email,
            generate_password_hash(password),
            datetime.now().isoformat()
        ))

        connection.commit()

        return jsonify({
            "status": "success",
            "message": "Registration successful. Please login."
        }), 201

    except sqlite3.IntegrityError:

        return jsonify({
            "status": "error",
            "message": "Username or email already exists."
        }), 409

    except Exception as error:

        print("Registration error:", error)

        return jsonify({
            "status": "error",
            "message": "Registration failed. Please try again."
        }), 500

    finally:
        connection.close()


# =====================================================
# 10. LOGIN
# =====================================================

@app.route("/api/auth/login", methods=["POST"])
def login():

    data = request.get_json(silent=True) or {}

    email = str(
        data.get("email") or ""
    ).strip().lower()

    password = str(
        data.get("password") or ""
    )

    if not email or not password:
        return jsonify({
            "status": "error",
            "message": "Email and password are required."
        }), 400

    connection = get_db()

    try:

        user = connection.execute("""
            SELECT *
            FROM users
            WHERE email = ?
        """, (email,)).fetchone()

    finally:
        connection.close()

    if (
        user is None
        or not check_password_hash(
            user["password"],
            password
        )
    ):

        return jsonify({
            "status": "error",
            "message": "Invalid email or password."
        }), 401

    session.clear()

    session["user_id"] = user["id"]
    session["username"] = user["username"]

    return jsonify({
        "status": "success",
        "message": "Login successful.",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"]
        }
    })


# =====================================================
# 11. CURRENT USER / SESSION CHECK
# =====================================================

@app.route("/api/auth/me", methods=["GET"])
def current_user():

    if not session.get("user_id"):

        return jsonify({
            "status": "error",
            "authenticated": False,
            "logged_in": False
        }), 401

    return jsonify({
        "status": "success",
        "authenticated": True,
        "logged_in": True,
        "username": session.get("username")
    })


# =====================================================
# 12. LOGOUT
# =====================================================

@app.route("/api/auth/logout", methods=["POST"])
def logout():

    session.clear()

    return jsonify({
        "status": "success",
        "message": "Logged out successfully."
    })


# =====================================================
# 13. HEALTH CHECK
# =====================================================

@app.route("/api/health", methods=["GET"])
def health():

    return jsonify({
        "status": "success",
        "message": "NewsCheck backend is running.",
        "model_loaded": model_loaded,
        "reference_loaded": reference_loaded,
        "database": "connected",
        "model_name": "TF-IDF + Logistic Regression"
    })


# =====================================================
# 14. TEXT PREDICTION
# =====================================================

@app.route("/api/predict", methods=["POST"])
@login_required
def predict():

    data = request.get_json(silent=True) or {}

    news_text = str(
        data.get("text")
        or data.get("news")
        or data.get("content")
        or ""
    ).strip()

    if len(news_text) < MIN_NEWS_LENGTH:
        return jsonify({
            "status": "error",
            "message": "Please enter at least 20 characters."
        }), 400

    if len(news_text) > MAX_NEWS_LENGTH:
        return jsonify({
            "status": "error",
            "message": "News text is too long."
        }), 400

    result = predict_news(news_text)

    save_history(
        session["user_id"],
        news_text,
        result["prediction"],
        result.get("confidence")
    )

    return jsonify(result)


# =====================================================
# 15. IMAGE PREDICTION / OCR
# =====================================================

@app.route("/api/predict-image", methods=["POST"])
@login_required
def predict_image():

    if "image" not in request.files:
        return jsonify({
            "status": "error",
            "message": "Please upload an image."
        }), 400

    file = request.files["image"]

    if not file.filename:
        return jsonify({
            "status": "error",
            "message": "No image selected."
        }), 400

    try:

        image_data = file.read()

        image = Image.open(
            BytesIO(image_data)
        ).convert("RGB")

        extracted_text = pytesseract.image_to_string(
            image
        ).strip()

        if len(extracted_text) < MIN_NEWS_LENGTH:
            return jsonify({
                "status": "error",
                "message": "Could not extract enough readable text."
            }), 400

        extracted_text = extracted_text[:MAX_NEWS_LENGTH]

        result = predict_news(extracted_text)

        result["extracted_text"] = extracted_text

        save_history(
            session["user_id"],
            extracted_text,
            result["prediction"],
            result.get("confidence")
        )

        return jsonify(result)

    except Exception as error:

        print("Image OCR error:", error)

        return jsonify({
            "status": "error",
            "message": "Unable to process this image."
        }), 400


# =====================================================
# 16. HISTORY
# =====================================================

@app.route("/api/history", methods=["GET"])
@login_required
def get_history():

    connection = get_db()

    try:

        records = connection.execute("""
            SELECT
                id,
                news,
                prediction,
                confidence,
                created_at
            FROM history
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT 100
        """, (
            session["user_id"],
        )).fetchall()

    finally:
        connection.close()

    return jsonify({
        "status": "success",
        "history": [
            dict(record)
            for record in records
        ]
    })


# =====================================================
# 17. CLEAR HISTORY
# =====================================================

@app.route(
    "/api/history/clear",
    methods=["DELETE", "POST"]
)
@login_required
def clear_history():

    connection = get_db()

    try:

        connection.execute("""
            DELETE FROM history
            WHERE user_id = ?
        """, (
            session["user_id"],
        ))

        connection.commit()

    finally:
        connection.close()

    return jsonify({
        "status": "success",
        "message": "History cleared successfully."
    })


# =====================================================
# 18. STARTUP
# =====================================================

init_database()

load_model()

load_reference_data()


# =====================================================
# 19. RUN SERVER
# =====================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False
    )
