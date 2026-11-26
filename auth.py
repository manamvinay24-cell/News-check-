
import re
import sqlite3
from functools import wraps

from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash

auth = Blueprint("auth", __name__)

DATABASE_PATH = None


def configure_auth(database_path):
    global DATABASE_PATH
    DATABASE_PATH = database_path

    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)


def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({
                "status": "error",
                "error": "Please login to continue."
            }), 401

        return function(*args, **kwargs)

    return wrapper


@auth.route("/api/auth/register", methods=["POST"])
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

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify({
            "status": "error",
            "error": "Enter a valid email address."
        }), 400

    if len(password) < 8:
        return jsonify({
            "status": "error",
            "error": "Password must contain at least 8 characters."
        }), 400

    password_hash = generate_password_hash(password)

    try:
        with get_connection() as connection:
            cursor = connection.execute("""
                INSERT INTO users (name, email, password_hash)
                VALUES (?, ?, ?)
            """, (name, email, password_hash))

            user_id = cursor.lastrowid

        session.clear()
        session["user_id"] = user_id
        session["user_name"] = name
        session["user_email"] = email

        return jsonify({
            "status": "success",
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


@auth.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not email or not password:
        return jsonify({
            "status": "error",
            "error": "Enter your email and password."
        }), 400

    with get_connection() as connection:
        user = connection.execute("""
            SELECT id, name, email, password_hash
            FROM users
            WHERE email = ?
        """, (email,)).fetchone()

    if not user or not check_password_hash(
        user["password_hash"], password
    ):
        return jsonify({
            "status": "error",
            "error": "Invalid email or password."
        }), 401

    session.clear()
    session["user_id"] = user["id"]
    session["user_name"] = user["name"]
    session["user_email"] = user["email"]

    return jsonify({
        "status": "success",
        "message": "Login successful.",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"]
        }
    }), 200


@auth.route("/api/auth/me", methods=["GET"])
def current_user():
    if not session.get("user_id"):
        return jsonify({
            "status": "error",
            "authenticated": False
        }), 401

    return jsonify({
        "status": "success",
        "authenticated": True,
        "user": {
            "id": session["user_id"],
            "name": session.get("user_name"),
            "email": session.get("user_email")
        }
    }), 200


@auth.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()

    return jsonify({
        "status": "success",
        "message": "Logged out successfully."
    }), 200
