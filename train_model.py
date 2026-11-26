
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

# ==========================================
# 1. PROJECT PATHS
# ==========================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATASET_DIR = os.path.join(BASE_DIR, "dataset")
MODEL_DIR = os.path.join(BASE_DIR, "model")
MODEL_PATH = os.path.join(
    MODEL_DIR, "fake_news_model.joblib"
)

FAKE_FILE = os.path.join(DATASET_DIR, "Fake.csv")
REAL_FILE = os.path.join(DATASET_DIR, "True.csv")

LABEL_NAMES = {
    0: "FAKE NEWS",
    1: "REAL NEWS"
}


# ==========================================
# 2. CLEAN TEXT
# ==========================================

def clean_text(text):
    if pd.isna(text):
        return ""

    text = str(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(
        r"(https?://\S+|www\.\S+)",
        " ",
        text,
        flags=re.IGNORECASE
    )
    text = re.sub(r"\s+", " ", text)

    return text.strip()


# ==========================================
# 3. LOAD DATASETS
# ==========================================

print("\nLoading datasets...")

if not os.path.isfile(FAKE_FILE):
    raise FileNotFoundError(
        f"Fake dataset not found: {FAKE_FILE}"
    )

if not os.path.isfile(REAL_FILE):
    raise FileNotFoundError(
        f"Real dataset not found: {REAL_FILE}"
    )

fake = pd.read_csv(FAKE_FILE)
real = pd.read_csv(REAL_FILE)

required_columns = {"title", "text"}

for filename, df in [
    ("Fake.csv", fake),
    ("True.csv", real)
]:
    missing = required_columns - set(df.columns)

    if missing:
        raise ValueError(
            f"{filename} is missing columns: {missing}"
        )

print("Fake articles:", len(fake))
print("Real articles:", len(real))


# ==========================================
# 4. PREPARE DATA
# ==========================================

fake["label"] = 0
real["label"] = 1

fake["content"] = (
    fake["title"].fillna("").astype(str)
    + " "
    + fake["text"].fillna("").astype(str)
)

real["content"] = (
    real["title"].fillna("").astype(str)
    + " "
    + real["text"].fillna("").astype(str)
)

data = pd.concat(
    [
        fake[["content", "label"]],
        real[["content", "label"]]
    ],
    ignore_index=True
)

data["content"] = data["content"].apply(clean_text)

data = data[data["content"].str.len() > 0].copy()

data = data.drop_duplicates(
    subset=["content"]
).reset_index(drop=True)

if data["label"].nunique() != 2:
    raise ValueError(
        "Dataset must contain both fake and real news."
    )

print("\nTotal articles:", len(data))
print("\nClass distribution:")
print(data["label"].value_counts().sort_index())


# ==========================================
# 5. SPLIT DATASET
# ==========================================

X = data["content"]
y = data["label"]

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

print("\nOriginal training samples:", len(X_train))
print("Original testing samples:", len(X_test))


# ==========================================
# 6. ADD SCIENCE EXAMPLES TO TRAINING
# ==========================================
# These are factual statements, not verified news articles.
# They help with selected science-related wording only.

science_examples = [
    "The Earth revolves around the Sun.",
    "The Earth orbits the Sun.",
    "Earth rotates on its axis.",
    "The Moon orbits the Earth.",
    "The Sun is a star.",
    "Mars is a planet in our Solar System.",
    "The Solar System contains planets orbiting the Sun.",
    "Scientists use telescopes to study galaxies.",
    "Scientists use telescopes to observe distant galaxies.",
    "Astronomers study stars and distant galaxies.",
    "Astronomers use space telescopes to observe the universe.",
    "NASA's Perseverance rover is exploring Mars.",
    "NASA's Perseverance rover collects scientific data on Mars.",
    "Water is composed of hydrogen and oxygen.",
    "Water freezes at zero degrees Celsius under standard pressure.",
    "Water boils at approximately 100 degrees Celsius at sea level.",
    "Plants use sunlight during photosynthesis.",
    "Gravity attracts objects with mass toward each other.",
    "Scientists study fossils to learn about ancient life.",
    "Sound travels through air as waves.",
    "The human heart pumps blood around the body.",
    "The human heart pumps blood throughout the body.",
    "The heart circulates blood through the human body.",
    "The human heart moves blood through blood vessels.",
    "The heart is an organ that pumps blood.",
    "New Delhi is the capital of India.",
    "Scientific research uses observations and experiments."
]

science_data = pd.DataFrame({
    "content": [
        clean_text(text) for text in science_examples
    ],
    "label": [1] * len(science_examples)
})

# Remove any exact examples already in the original training set.
existing_training = set(X_train)

science_data = science_data[
    ~science_data["content"].isin(existing_training)
].copy()

X_train = pd.concat(
    [
        X_train.reset_index(drop=True),
        science_data["content"].reset_index(drop=True)
    ],
    ignore_index=True
)

y_train = pd.concat(
    [
        y_train.reset_index(drop=True),
        science_data["label"].reset_index(drop=True)
    ],
    ignore_index=True
)

# Remove duplicate training texts.
training_data = pd.DataFrame({
    "content": X_train,
    "label": y_train
})

training_data = training_data.drop_duplicates(
    subset=["content"]
).reset_index(drop=True)

X_train = training_data["content"]
y_train = training_data["label"]

print("\nScience examples added:", len(science_data))
print("Final training samples:", len(X_train))


# ==========================================
# 7. BUILD MACHINE LEARNING MODEL
# ==========================================

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
            random_state=42
        )
    )
])


# ==========================================
# 8. TRAIN MODEL
# ==========================================

print("\nTraining model. Please wait...")

model.fit(X_train, y_train)

print("Training completed!")


# ==========================================
# 9. EVALUATE MODEL
# ==========================================
# Evaluation uses the original held-out test dataset.

print("\nEvaluating on original test dataset...")

predictions = model.predict(X_test)

accuracy = accuracy_score(y_test, predictions)

print("\n===================================")
print("MODEL RESULTS")
print("===================================")

print(f"Test accuracy: {accuracy * 100:.2f}%")

print("\nClassification Report:")

print(
    classification_report(
        y_test,
        predictions,
        labels=[0, 1],
        target_names=["FAKE NEWS", "REAL NEWS"],
        digits=4,
        zero_division=0
    )
)

print("\nConfusion Matrix")
print("Order: FAKE NEWS, REAL NEWS")

print(
    confusion_matrix(
        y_test,
        predictions,
        labels=[0, 1]
    )
)


# ==========================================
# 10. SAVE TRAINED MODEL
# ==========================================

os.makedirs(MODEL_DIR, exist_ok=True)

joblib.dump(model, MODEL_PATH)

print("\nModel saved successfully!")
print("Saved at:", MODEL_PATH)


# ==========================================
# 11. PREDICTION FUNCTION
# ==========================================

def predict_news(news):
    news = clean_text(news)

    if not news:
        return {
            "prediction": "NO INPUT",
            "confidence": 0.0,
            "message": "Please enter news content."
        }

    predicted_label = int(model.predict([news])[0])

    probabilities = model.predict_proba([news])[0]
    classifier = model.named_steps["classifier"]

    predicted_index = list(classifier.classes_).index(
        predicted_label
    )

    confidence = float(
        probabilities[predicted_index] * 100
    )

    return {
        "prediction": LABEL_NAMES[predicted_label],
        "confidence": round(confidence, 2),
        "message": (
            "Machine learning prediction only. "
            "Verify claims using reliable sources."
        )
    }


# ==========================================
# 12. TEST SAMPLE PREDICTIONS
# ==========================================

test_samples = [
    "The Earth revolves around the Sun.",
    "Scientists use telescopes to study galaxies.",
    "NASA's Perseverance rover is exploring Mars.",
    "The human heart pumps blood throughout the body.",
    "New Delhi is the capital of India.",
    "Breaking: A secret miracle drink cures every disease instantly."
]

print("\n===================================")
print("SAMPLE PREDICTIONS")
print("===================================")

for sample in test_samples:
    result = predict_news(sample)

    print("\nNews:", sample)
    print("Prediction:", result["prediction"])
    print("Model confidence:", str(result["confidence"]) + "%")
    print("Note:", result["message"])

print("\nTraining and evaluation finished.")
