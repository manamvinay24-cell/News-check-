
import os
import re
import sqlite3
from datetime import datetime, timedelta
from functools import wraps

import joblib
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash


# =========================================================
# 1. APPLICATION CONFIGURATION
# =========================================================

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(
    BASE_DIR, "model", "fake_news_model.joblib"
)

DATABASE_PATH = os.path.join(
    BASE_DIR, "history.db"
)

FRONTEND_URL = (
    os.environ.get(
        "FRONTEND_URL",
        "https://newscheck-frontend-sooty.vercel.app"
    )
    .strip()
    .rstrip("/")
)

BACKEND_URL = "https://news-check-np3i.onrender.com"

SECRET_KEY = os.environ.get("NEWSCHECK_SECRET_KEY")

if not SECRET_KEY:
    SECRET_KEY = "development-only-change-this-secret"
    print("WARNING: Set NEWSCHECK_SECRET_KEY in Render Environment.")

app.config["SECRET_KEY"] = SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

COOKIE_SECURE = (
    os.environ.get("COOKIE_SECURE", "true").lower() == "true"
)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=COOKIE_SECURE,
    SESSION_COOKIE_SAMESITE="None" if COOKIE_SECURE else "Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=7)
)

ALLOWED_ORIGINS = [
    FRONTEND_URL,
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5501",
    "http://127.0.0.1:5501"
]

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": ALLOWED_ORIGINS
        }
    },
    supports_credentials=True,
    allow_headers=["Content-Type"],
    methods=["GET", "POST", "DELETE", "OPTIONS"]
)

MIN_NEWS_LENGTH = 20
LOW_CONFIDENCE_THRESHOLD = 70.0

ALLOWED_IMAGE_EXTENSIONS = {
    "png", "jpg", "jpeg", "webp"
}

LABEL_NAMES = {
    0: "FAKE NEWS",
    1: "REAL NEWS"
}


# =========================================================
# 2. LOAD MACHINE LEARNING MODEL
# =========================================================

if not os.path.isfile(MODEL_PATH):
    raise FileNotFoundError(
        f"ML model not found: {MODEL_PATH}"
    )

model = joblib.load(MODEL_PATH)

if not hasattr(model, "predict"):
    raise ValueError("Model does not support predict().")

if not hasattr(model, "predict_proba"):
    raise ValueError("Model does not support predict_proba().")

model_classes = [
    int(value) for value in model.classes_
]

if model_classes != [0, 1]:
    raise ValueError(
        f"Unexpected model classes: {model_classes}"
    )

print("NewsCheck ML model loaded successfully.")
print("Model classes:", model_classes)


# =========================================================
# 3. DATABASE CONNECTION
# =========================================================

def get_db_connection():

    connection = sqlite3.connect(
        DATABASE_PATH,
        timeout=30
    )

    connection.row_factory = sqlite3.Row

    return connection


# =========================================================
# 4. DATABASE INITIALIZATION AND MIGRATION
# =========================================================

def initialize_database():

    with get_db_connection() as connection:

        connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                news TEXT NOT NULL,
                prediction TEXT NOT NULL,
                confidence REAL NOT NULL,
                content_type TEXT DEFAULT 'Text',
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        """)

        columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(history)"
            ).fetchall()
        }

        if "user_id" not in columns:
            connection.execute("""
                ALTER TABLE history
                ADD COLUMN user_id INTEGER
            """)

        if "content_type" not in columns:
            connection.execute("""
                ALTER TABLE history
                ADD COLUMN content_type TEXT DEFAULT 'Text'
            """)

        if "created_at" not in columns:
            connection.execute("""
                ALTER TABLE history
                ADD COLUMN created_at TEXT
            """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_history_user_id
            ON history(user_id)
        """)

    print("NewsCheck database initialized.")


initialize_database()


# =========================================================
# 5. AUTHENTICATION HELPERS
# =========================================================

def login_required(function):

    @wraps(function)
    def wrapper(*args, **kwargs):

        if not session.get("user_id"):
            return jsonify({
                "status": "error",
                "authenticated": False,
                "error": "Please login to continue."
            }), 401

        return function(*args, **kwargs)

    return wrapper


def get_current_user_id():
    return session.get("user_id")


# =========================================================
# 6. REGISTER API
# =========================================================

@app.route("/api/auth/register", methods=["POST"])
def register():

    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if len(name) < 2:
        return jsonify({
            "status": "error",
            "error": "Please enter your full name."
        }), 400

    if not re.fullmatch(
        r"[^@\s]+@[^@\s]+\.[^@\s]+",
        email
    ):
        return jsonify({
            "status": "error",
            "error": "Enter a valid email address."
        }), 400

    if len(password) < 8:
        return jsonify({
            "status": "error",
            "error": "Password must contain at least 8 characters."
        }), 400

    try:

        password_hash = generate_password_hash(password)

        with get_db_connection() as connection:

            cursor = connection.execute("""
                INSERT INTO users (
                    name,
                    email,
                    password_hash
                )
                VALUES (?, ?, ?)
            """, (
                name,
                email,
                password_hash
            ))

            user_id = cursor.lastrowid

        session.clear()
        session.permanent = True
        session["user_id"] = user_id
        session["user_name"] = name
        session["user_email"] = email

        return jsonify({
            "status": "success",
            "authenticated": True,
            "message": "Account created successfully.",
            "user": {
                "id": user_id,
                "name": name,
                "email": email
            }
        }), 201

    except sqlite3.IntegrityError:

        return jsonify({
            "status": "error",
            "error": "This email is already registered. Please login."
        }), 409

    except Exception:

        app.logger.exception("Registration failed")

        return jsonify({
            "status": "error",
            "error": "Registration failed. Please try again."
        }), 500


# =========================================================
# 7. LOGIN API
# =========================================================

@app.route("/api/auth/login", methods=["POST"])
def login():

    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not email or not password:
        return jsonify({
            "status": "error",
            "error": "Enter your email and password."
        }), 400

    try:

        with get_db_connection() as connection:

            user = connection.execute("""
                SELECT
                    id,
                    name,
                    email,
                    password_hash
                FROM users
                WHERE email = ?
            """, (email,)).fetchone()

        if not user or not check_password_hash(
            user["password_hash"],
            password
        ):
            return jsonify({
                "status": "error",
                "error": "Invalid email or password."
            }), 401

        session.clear()
        session.permanent = True

        session["user_id"] = user["id"]
        session["user_name"] = user["name"]
        session["user_email"] = user["email"]

        return jsonify({
            "status": "success",
            "authenticated": True,
            "message": "Login successful.",
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"]
            }
        }), 200

    except Exception:

        app.logger.exception("Login failed")

        return jsonify({
            "status": "error",
            "error": "Login failed. Please try again."
        }), 500


# =========================================================
# 8. CURRENT USER API
# =========================================================

@app.route("/api/auth/me", methods=["GET"])
def current_user():

    user_id = get_current_user_id()

    if not user_id:
        return jsonify({
            "status": "error",
            "authenticated": False,
            "error": "Not logged in."
        }), 401

    return jsonify({
        "status": "success",
        "authenticated": True,
        "user": {
            "id": user_id,
            "name": session.get("user_name"),
            "email": session.get("user_email")
        }
    }), 200


# =========================================================
# 9. LOGOUT API
# =========================================================

@app.route("/api/auth/logout", methods=["POST"])
def logout():

    session.clear()

    return jsonify({
        "status": "success",
        "authenticated": False,
        "message": "Logged out successfully."
    }), 200


# =========================================================
# 10. TEXT CLEANING
# =========================================================

def clean_text(text):

    if not isinstance(text, str):
        return ""

    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(
        r"https?://\S+|www\.\S+",
        " ",
        text
    )
    text = re.sub(r"\s+", " ", text)

    return text.strip()


# =========================================================
# 11. NEWS PREDICTION FUNCTION
# =========================================================

def predict_news(news_text):

    news_text = clean_text(news_text)

    if not news_text:
        raise ValueError("Please enter news content.")

    if len(news_text) < MIN_NEWS_LENGTH:
        raise ValueError(
            f"Please enter at least {MIN_NEWS_LENGTH} characters."
        )

    predicted_label = int(
        model.predict([news_text])[0]
    )

    probabilities = model.predict_proba(
        [news_text]
    )[0]

    classes = [
        int(value) for value in model.classes_
    ]

    predicted_index = classes.index(predicted_label)

    confidence = float(
        probabilities[predicted_index] * 100
    )

    prediction = LABEL_NAMES[predicted_label]

    if confidence < LOW_CONFIDENCE_THRESHOLD:
        confidence_level = "LOW"
        warning = (
            "Low model confidence. Verify this news "
            "using reliable sources."
        )
    else:
        confidence_level = "MODEL_SCORE"
        warning = (
            "This is an ML model prediction, not proof "
            "that the news is true or false."
        )

    return {
        "prediction": prediction,
        "confidence": round(confidence, 2),
        "confidence_level": confidence_level,
        "warning": warning
    }


# =========================================================
# 12. SAVE PREDICTION HISTORY
# =========================================================

def save_history(
    news,
    prediction,
    confidence,
    content_type
):

    user_id = get_current_user_id()

    created_at = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    with get_db_connection() as connection:

        connection.execute("""
            INSERT INTO history (
                user_id,
                news,
                prediction,
                confidence,
                content_type,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            news,
            prediction,
            confidence,
            content_type,
            created_at
        ))


# =========================================================
# 13. FETCH USER HISTORY
# =========================================================

def fetch_history(limit=None):

    user_id = get_current_user_id()

    query = """
        SELECT
            id,
            news,
            prediction,
            confidence,
            content_type,
            created_at
        FROM history
        WHERE user_id = ?
        ORDER BY id DESC
    """

    parameters = [user_id]

    if limit is not None:
        query += " LIMIT ?"
        parameters.append(int(limit))

    with get_db_connection() as connection:

        rows = connection.execute(
            query,
            parameters
        ).fetchall()

    return [
        {
            "id": row["id"],
            "news": row["news"],
            "prediction": row["prediction"],
            "confidence": round(
                float(row["confidence"]),
                2
            ),
            "content_type": row["content_type"] or "Text",
            "created_at": row["created_at"] or ""
        }
        for row in rows
    ]


# =========================================================
# 14. FILE SIZE ERROR HANDLER
# =========================================================

@app.errorhandler(413)
def file_too_large(error):

    return jsonify({
        "status": "error",
        "error": "Uploaded file is too large. Maximum size is 8 MB."
    }), 413


# =========================================================
# 15. HOME API
# =========================================================

@app.route("/", methods=["GET"])
def home():

    return jsonify({
        "status": "success",
        "message": "NewsCheck Fake News Detection Backend is running.",
        "frontend": FRONTEND_URL
    }), 200


# =========================================================
# 16. HEALTH CHECK API
# =========================================================

@app.route("/api/health", methods=["GET"])
def health():

    database_status = "connected"

    try:
        with get_db_connection() as connection:
            connection.execute("SELECT 1").fetchone()

    except Exception:
        app.logger.exception("Database health check failed")
        database_status = "error"

    status = (
        "success"
        if database_status == "connected"
        else "error"
    )

    return jsonify({
        "status": status,
        "message": "Backend and ML model are connected.",
        "model_loaded": model is not None,
        "database": database_status
    }), 200 if status == "success" else 503


# =========================================================
# 17. TEXT PREDICTION API
# =========================================================

@app.route("/api/predict", methods=["POST"])
@login_required
def predict():

    try:

        data = request.get_json(silent=True)

        if not isinstance(data, dict):
            return jsonify({
                "status": "error",
                "error": "Send JSON data containing the news field."
            }), 400

        news_text = data.get("news", "")

        if not isinstance(news_text, str):
            return jsonify({
                "status": "error",
                "error": "News content must be text."
            }), 400

        news_text = clean_text(news_text)

        result = predict_news(news_text)

        save_history(
            news_text,
            result["prediction"],
            result["confidence"],
            "Text"
        )

        return jsonify({
            "status": "success",
            **result,
            "content_type": "Text",
            "source": "Trained ML Model",
            "message": (
                "The model has analyzed the supplied text. "
                "Verify important claims with trusted sources."
            )
        }), 200

    except ValueError as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 400

    except Exception:

        app.logger.exception("Text prediction failed")

        return jsonify({
            "status": "error",
            "error": "Prediction failed. Please try again."
        }), 500


# =========================================================
# 18. IMAGE OCR PREDICTION API
# =========================================================

@app.route("/api/predict-image", methods=["POST"])
@login_required
def predict_image():

    try:

        if "image" not in request.files:
            return jsonify({
                "status": "error",
                "error": "Please upload an image using the image field."
            }), 400

        image_file = request.files["image"]

        if not image_file.filename:
            return jsonify({
                "status": "error",
                "error": "No image was selected."
            }), 400

        if "." not in image_file.filename:
            return jsonify({
                "status": "error",
                "error": "Invalid image filename."
            }), 400

        extension = (
            image_file.filename.rsplit(".", 1)[1].lower()
        )

        if extension not in ALLOWED_IMAGE_EXTENSIONS:
            return jsonify({
                "status": "error",
                "error": "Upload PNG, JPG, JPEG or WEBP images only."
            }), 400

        try:
            from PIL import Image
            import pytesseract

        except ImportError:
            return jsonify({
                "status": "error",
                "error": (
                    "Pillow and pytesseract are required. "
                    "Tesseract OCR must also be installed."
                )
            }), 500

        tesseract_path = os.environ.get("TESSERACT_CMD")

        if tesseract_path and os.path.exists(tesseract_path):
            pytesseract.pytesseract.tesseract_cmd = tesseract_path

        try:

            image = Image.open(
                image_file.stream
            ).convert("RGB")

            extracted_text = (
                pytesseract.image_to_string(image).strip()
            )

        except Exception:

            app.logger.exception("Image OCR failed")

            return jsonify({
                "status": "error",
                "error": (
                    "Could not read this image. "
                    "Check the image and OCR installation."
                )
            }), 400

        extracted_text = clean_text(extracted_text)

        if len(extracted_text) < MIN_NEWS_LENGTH:
            return jsonify({
                "status": "error",
                "error": (
                    "Not enough readable text was found. "
                    "Upload a clearer news screenshot."
                )
            }), 400

        result = predict_news(extracted_text)

        save_history(
            extracted_text,
            result["prediction"],
            result["confidence"],
            "Image (OCR)"
        )

        return jsonify({
            "status": "success",
            **result,
            "content_type": "Image (OCR)",
            "source": "OCR + Trained ML Model",
            "extracted_text": extracted_text,
            "message": (
                "The prediction is based on text extracted "
                "from the image. Verify the original news "
                "using trusted sources."
            )
        }), 200

    except ValueError as error:

        return jsonify({
            "status": "error",
            "error": str(error)
        }), 400

    except Exception:

        app.logger.exception("Image prediction failed")

        return jsonify({
            "status": "error",
            "error": "Image analysis failed. Check OCR setup."
        }), 500


# =========================================================
# 19. HISTORY API
# =========================================================

@app.route("/api/history", methods=["GET"])
@login_required
def get_history():

    try:

        history = fetch_history(limit=200)

        return jsonify({
            "status": "success",
            "history": history
        }), 200

    except Exception:

        app.logger.exception("History loading failed")

        return jsonify({
            "status": "error",
            "error": "Could not load prediction history."
        }), 500


# =========================================================
# 20. DASHBOARD STATISTICS API
# =========================================================

@app.route("/api/dashboard", methods=["GET"])
@login_required
def dashboard():

    try:

        user_id = get_current_user_id()

        with get_db_connection() as connection:

            summary = connection.execute("""
                SELECT
                    COUNT(*) AS total,

                    SUM(
                        CASE
                            WHEN UPPER(prediction) LIKE '%FAKE%'
                            THEN 1 ELSE 0
                        END
                    ) AS fake,

                    SUM(
                        CASE
                            WHEN UPPER(prediction) LIKE '%REAL%'
                            THEN 1 ELSE 0
                        END
                    ) AS real,

                    AVG(confidence) AS average_confidence

                FROM history
                WHERE user_id = ?
            """, (user_id,)).fetchone()

        total = int(summary["total"] or 0)
        fake_count = int(summary["fake"] or 0)
        real_count = int(summary["real"] or 0)

        average_confidence = float(
            summary["average_confidence"] or 0
        )

        recent = fetch_history(limit=4)

        return jsonify({
            "status": "success",
            "total": total,
            "fake": fake_count,
            "real": real_count,
            "average_confidence": round(
                average_confidence, 2
            ),
            "recent": recent
        }), 200

    except Exception:

        app.logger.exception("Dashboard loading failed")

        return jsonify({
            "status": "error",
            "error": "Could not load dashboard statistics."
        }), 500


# =========================================================
# 21. CLEAR HISTORY API
# =========================================================

@app.route("/api/history/clear", methods=["DELETE"])
@login_required
def clear_history():

    try:

        user_id = get_current_user_id()

        with get_db_connection() as connection:
            connection.execute("""
                DELETE FROM history
                WHERE user_id = ?
            """, (user_id,))

        return jsonify({
            "status": "success",
            "message": "Your prediction history cleared successfully."
        }), 200

    except Exception:

        app.logger.exception("History clearing failed")

        return jsonify({
            "status": "error",
            "error": "Could not clear prediction history."
        }), 500


# =========================================================
# 22. START APPLICATION
# =========================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False
    )
