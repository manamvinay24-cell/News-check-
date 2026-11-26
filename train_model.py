
import os
import re
import joblib
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix
)


# =====================================================
# 1. PROJECT PATHS
# =====================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATASET_DIR = os.path.join(BASE_DIR, "dataset")
MODEL_DIR = os.path.join(BASE_DIR, "model")

FAKE_FILE = os.path.join(DATASET_DIR, "Fake.csv")
REAL_FILE = os.path.join(DATASET_DIR, "True.csv")

MODEL_PATH = os.path.join(
    MODEL_DIR,
    "fake_news_model.joblib"
)

LABEL_NAMES = {
    0: "FAKE NEWS",
    1: "REAL NEWS"
}


# =====================================================
# 2. CLEAN TEXT
# =====================================================

def clean_text(text):

    if pd.isna(text):
        return ""

    text = str(text)

    text = re.sub(r"<[^>]+>", " ", text)

    text = re.sub(
        r"https?://\S+|www\.\S+",
        " ",
        text,
        flags=re.IGNORECASE
    )

    text = re.sub(r"\s+", " ", text)

    return text.strip()


# =====================================================
# 3. LOAD DATASETS
# =====================================================

print("\nLoading datasets...")

if not os.path.isfile(FAKE_FILE):
    raise FileNotFoundError(
        f"Fake dataset not found: {FAKE_FILE}"
    )

if not os.path.isfile(REAL_FILE):
    raise FileNotFoundError(
        f"Real dataset not found: {REAL_FILE}"
    )

fake = pd.read_csv(FAKE_FILE, low_memory=False)
real = pd.read_csv(REAL_FILE, low_memory=False)

# Normalize column names.
fake.columns = fake.columns.str.strip().str.lower()
real.columns = real.columns.str.strip().str.lower()

required_columns = {"title", "text"}

for filename, dataframe in [
    ("Fake.csv", fake),
    ("True.csv", real)
]:

    missing = required_columns - set(dataframe.columns)

    if missing:
        raise ValueError(
            f"{filename} is missing columns: {missing}"
        )

print("Fake articles:", len(fake))
print("Real articles:", len(real))


# =====================================================
# 4. PREPARE DATA
# =====================================================

fake["label"] = 0
real["label"] = 1

data = pd.concat(
    [fake, real],
    ignore_index=True
)

data["title"] = data["title"].apply(clean_text)
data["text"] = data["text"].apply(clean_text)

# Use title + article as the full article sample.
data["content"] = (
    data["title"] + " " + data["text"]
).str.strip()

data = data[
    data["content"].str.len() > 0
].copy()

# Remove records with identical content but conflicting labels.
label_counts = data.groupby("content")["label"].nunique()

conflicting_content = label_counts[
    label_counts > 1
].index

if len(conflicting_content):
    print(
        "Removing conflicting duplicate articles:",
        len(conflicting_content)
    )

    data = data[
        ~data["content"].isin(conflicting_content)
    ].copy()

# Remove exact duplicate articles.
data = data.drop_duplicates(
    subset=["content"]
).reset_index(drop=True)

if data["label"].nunique() != 2:
    raise ValueError(
        "Both FAKE and REAL classes are required."
    )

print("\nTotal usable articles:", len(data))

print("\nClass distribution:")
print(
    data["label"].value_counts().sort_index().rename(
        index=LABEL_NAMES
    )
)


# =====================================================
# 5. SPLIT ORIGINAL DATASET
# =====================================================

train_data, test_data = train_test_split(
    data,
    test_size=0.20,
    random_state=42,
    stratify=data["label"]
)

print("\nOriginal training articles:", len(train_data))
print("Original testing articles:", len(test_data))


# =====================================================
# 6. PREPARE TRAINING EXAMPLES
# =====================================================
# Each training article produces:
# 1. Full article (title + text)
# 2. Title-only example
#
# Both examples inherit the article's original label.
# No manually invented science labels are added.

train_full = train_data["content"].tolist()
train_titles = train_data["title"].tolist()

train_labels = train_data["label"].tolist()

X_train = []
y_train = []

for full_text, title, label in zip(
    train_full,
    train_titles,
    train_labels
):

    if full_text:
        X_train.append(full_text)
        y_train.append(label)

    if title and len(title) >= 5:
        X_train.append(title)
        y_train.append(label)

print("\nTraining examples:", len(X_train))


# =====================================================
# 7. PREPARE SEPARATE TEST SETS
# =====================================================

X_test_full = test_data["content"].tolist()
y_test_full = test_data["label"].tolist()

X_test_titles = []
y_test_titles = []

for title, label in zip(
    test_data["title"],
    test_data["label"]
):

    if title and len(title) >= 5:
        X_test_titles.append(title)
        y_test_titles.append(label)

print("Full article test samples:", len(X_test_full))
print("Title-only test samples:", len(X_test_titles))


# =====================================================
# 8. BUILD TF-IDF + LOGISTIC REGRESSION MODEL
# =====================================================

word_features = TfidfVectorizer(
    lowercase=True,
    stop_words="english",
    max_features=60000,
    ngram_range=(1, 2),
    min_df=1,
    sublinear_tf=True
)

character_features = TfidfVectorizer(
    analyzer="char_wb",
    lowercase=True,
    max_features=30000,
    ngram_range=(3, 5),
    min_df=1,
    sublinear_tf=True
)

model = Pipeline([
    (
        "features",
        FeatureUnion([
            ("word_tfidf", word_features),
            ("char_tfidf", character_features)
        ])
    ),
    (
        "classifier",
        LogisticRegression(
            max_iter=1500,
            class_weight="balanced",
            random_state=42
        )
    )
])


# =====================================================
# 9. TRAIN MODEL
# =====================================================

print("\nTraining NewsCheck model...")
print("Please wait...")

model.fit(X_train, y_train)

print("\nTraining completed successfully!")


# =====================================================
# 10. EVALUATE FULL ARTICLES
# =====================================================

print("\n========================================")
print("FULL ARTICLE TEST RESULTS")
print("========================================")

full_predictions = model.predict(X_test_full)

full_accuracy = accuracy_score(
    y_test_full,
    full_predictions
)

print(
    f"\nFull article accuracy: {full_accuracy * 100:.2f}%"
)

print("\nClassification Report:")

print(
    classification_report(
        y_test_full,
        full_predictions,
        labels=[0, 1],
        target_names=["FAKE NEWS", "REAL NEWS"],
        digits=4,
        zero_division=0
    )
)

print("\nConfusion Matrix:")
print("Order: FAKE NEWS, REAL NEWS")

print(
    confusion_matrix(
        y_test_full,
        full_predictions,
        labels=[0, 1]
    )
)


# =====================================================
# 11. EVALUATE TITLE-ONLY EXAMPLES
# =====================================================

print("\n========================================")
print("TITLE-ONLY TEST RESULTS")
print("========================================")

if X_test_titles:

    title_predictions = model.predict(X_test_titles)

    title_accuracy = accuracy_score(
        y_test_titles,
        title_predictions
    )

    print(
        f"\nTitle-only accuracy: {title_accuracy * 100:.2f}%"
    )

    print("\nTitle Classification Report:")

    print(
        classification_report(
            y_test_titles,
            title_predictions,
            labels=[0, 1],
            target_names=["FAKE NEWS", "REAL NEWS"],
            digits=4,
            zero_division=0
        )
    )

else:
    print("No usable titles found for evaluation.")


# =====================================================
# 12. SAVE MODEL
# =====================================================

os.makedirs(MODEL_DIR, exist_ok=True)

joblib.dump(model, MODEL_PATH)

print("\n========================================")
print("MODEL SAVED SUCCESSFULLY")
print("========================================")

print("Model location:", MODEL_PATH)
print("Model classes:", model.classes_)


# =====================================================
# 13. SAMPLE PREDICTIONS
# =====================================================
# These are diagnostic examples only.
# Their output is not guaranteed to be correct.

def predict_news(news):

    news = clean_text(news)

    if not news:
        return {
            "prediction": "NO INPUT",
            "confidence": 0.0
        }

    predicted_label = int(
        model.predict([news])[0]
    )

    probabilities = model.predict_proba([news])[0]

    classifier = model.named_steps["classifier"]

    predicted_index = list(
        classifier.classes_
    ).index(predicted_label)

    confidence = float(
        probabilities[predicted_index] * 100
    )

    return {
        "prediction": LABEL_NAMES[predicted_label],
        "confidence": round(confidence, 2)
    }


test_samples = [
    "The Earth revolves around the Sun.",
    "Water boils at approximately 100 degrees Celsius at standard atmospheric pressure.",
    "The Sun is a star located at the center of our solar system.",
    "India's Chandrayaan-3 mission successfully landed on the Moon in August 2023.",
    "Breaking: A secret miracle drink cures every disease instantly."
]

print("\n========================================")
print("SAMPLE PREDICTION RESULTS")
print("========================================")

for sample in test_samples:

    result = predict_news(sample)

    print("\nInput:", sample)
    print("Prediction:", result["prediction"])
    print("Confidence:", str(result["confidence"]) + "%")

print("\nNewsCheck training process completed.")
