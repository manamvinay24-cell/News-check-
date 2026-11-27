
import os
import re
import joblib
import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix
)
from sklearn.metrics.pairwise import cosine_similarity


# =====================================================
# 1. PATHS
# =====================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATASET_DIR = os.path.join(BASE_DIR, "dataset")
MODEL_DIR = os.path.join(BASE_DIR, "model")

TRUE_FILE = os.path.join(DATASET_DIR, "True.csv")
FAKE_FILE = os.path.join(DATASET_DIR, "Fake.csv")

MODEL_PATH = os.path.join(
    MODEL_DIR, "fake_news_model.joblib"
)

REFERENCE_PATH = os.path.join(
    MODEL_DIR, "news_reference.joblib"
)

os.makedirs(MODEL_DIR, exist_ok=True)


# =====================================================
# 2. LOAD DATASETS
# =====================================================

def load_dataset(path):

    if not os.path.exists(path):
        raise FileNotFoundError(f"File missing: {path}")

    try:
        df = pd.read_csv(
            path,
            encoding="utf-8-sig",
            on_bad_lines="skip"
        )
    except UnicodeDecodeError:
        df = pd.read_csv(
            path,
            encoding="latin1",
            on_bad_lines="skip"
        )

    return df


print("\nLoading datasets...")

true_df = load_dataset(TRUE_FILE)
fake_df = load_dataset(FAKE_FILE)


# =====================================================
# 3. PREPARE DATA
# =====================================================

def prepare_dataset(df):

    df = df.copy()

    for col in ["title", "text"]:
        if col not in df.columns:
            df[col] = ""

        df[col] = df[col].fillna("").astype(str)

    df["combined_text"] = (
        df["title"].str.strip()
        + " "
        + df["text"].str.strip()
    )

    df["combined_text"] = (
        df["combined_text"]
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )

    df = df[
        df["combined_text"].str.len() >= 30
    ]

    return df


true_df = prepare_dataset(true_df)
fake_df = prepare_dataset(fake_df)

true_df["label"] = 1
fake_df["label"] = 0

data = pd.concat(
    [true_df, fake_df],
    ignore_index=True
)

data = data.drop_duplicates(
    subset=["combined_text"]
)

data = data.sample(
    frac=1,
    random_state=42
).reset_index(drop=True)


print("\nTotal records:", len(data))
print("REAL records:", (data["label"] == 1).sum())
print("FAKE records:", (data["label"] == 0).sum())


# =====================================================
# 4. TRAIN TEST SPLIT
# =====================================================

X = data["combined_text"]
y = data["label"]

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)


# =====================================================
# 5. TF-IDF FEATURES
# =====================================================

word_vectorizer = TfidfVectorizer(
    analyzer="word",
    ngram_range=(1, 2),
    max_features=60000,
    min_df=2,
    max_df=0.98,
    sublinear_tf=True
)

char_vectorizer = TfidfVectorizer(
    analyzer="char_wb",
    ngram_range=(3, 5),
    max_features=40000,
    min_df=2,
    sublinear_tf=True
)

features = FeatureUnion([
    ("word", word_vectorizer),
    ("character", char_vectorizer)
])


# =====================================================
# 6. TRAIN MODEL
# =====================================================

model = Pipeline([
    ("features", features),
    ("classifier", LogisticRegression(
        max_iter=2000,
        C=2.0,
        class_weight="balanced",
        random_state=42
    ))
])

print("\nTraining started...")

model.fit(X_train, y_train)

print("Training completed!")


# =====================================================
# 7. EVALUATION
# =====================================================

predictions = model.predict(X_test)

accuracy = accuracy_score(
    y_test,
    predictions
)

print("\nAccuracy:", round(accuracy * 100, 2), "%")

print("\nClassification Report:")

print(
    classification_report(
        y_test,
        predictions,
        target_names=["FAKE", "REAL"],
        zero_division=0
    )
)

print("\nConfusion Matrix:")

print(confusion_matrix(y_test, predictions))


# =====================================================
# 8. BUILD REFERENCE DATASET
# =====================================================

# Use only training data for reference matching.
# This avoids using test records as the reference set.

reference_texts = X_train.tolist()

reference_labels = y_train.tolist()

reference_vectorizer = TfidfVectorizer(
    ngram_range=(1, 2),
    max_features=50000,
    min_df=2,
    sublinear_tf=True
)

reference_matrix = reference_vectorizer.fit_transform(
    reference_texts
)


# =====================================================
# 9. SAVE MODELS
# =====================================================

joblib.dump(
    model,
    MODEL_PATH,
    compress=3
)

reference_data = {
    "vectorizer": reference_vectorizer,
    "matrix": reference_matrix,
    "labels": np.array(reference_labels),
    "texts": reference_texts
}

joblib.dump(
    reference_data,
    REFERENCE_PATH,
    compress=3
)

print("\n================================")
print("MODEL SAVED SUCCESSFULLY")
print("================================")

print("ML model:", MODEL_PATH)
print("Reference data:", REFERENCE_PATH)


# =====================================================
# 10. SAMPLE TESTING
# =====================================================

def test_prediction(news):

    probabilities = model.predict_proba([news])[0]

    ml_label = int(model.predict([news])[0])

    query_vector = reference_vectorizer.transform([news])

    similarities = cosine_similarity(
        query_vector,
        reference_matrix
    )[0]

    best_index = int(np.argmax(similarities))

    similarity = float(similarities[best_index])

    nearest_label = int(reference_labels[best_index])

    # Similarity threshold is a heuristic, not a fact check.
    if similarity < 0.50:
        final_result = "NEED MORE INFORMATION"

    elif ml_label == 1:
        final_result = "REAL"

    else:
        final_result = "FAKE"

    print("\nNews:", news)
    print("Final result:", final_result)
    print("Dataset similarity:", round(similarity * 100, 2), "%")
    print("ML REAL probability:", round(probabilities[1] * 100, 2), "%")
    print("ML FAKE probability:", round(probabilities[0] * 100, 2), "%")
    print("Nearest dataset label:", "REAL" if nearest_label == 1 else "FAKE")


samples = [
    "The Earth revolves around the Sun once approximately every 365.25 days.",
    "Earth rotates on its own axis causing day and night.",
    "A government announcement claims that every citizen will receive ten lakh rupees.",
]

for sample in samples:
    test_prediction(sample)


print("\nTRAINING FINISHED SUCCESSFULLY!")
