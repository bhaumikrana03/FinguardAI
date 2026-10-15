import os
from pathlib import Path


class Settings:
    """
    Central configuration object for the entire Edge AI system.
    Loaded once and imported everywhere.
    """

    # =========================
    # Runtime Mode
    # =========================
    ENV = os.getenv("ENV", "local")  # local | staging | production
    DEBUG = ENV == "local"
    RUNTIME_MODE = "EDGE_OFFLINE"

    # =========================
    # Server
    # =========================
    HOST = "0.0.0.0"
    PORT = int(os.getenv("PORT", 8000))

    # =========================
    # Paths
    # =========================
    BASE_DIR = Path(__file__).resolve().parent.parent
    MODEL_DIR = BASE_DIR / "models"
    DATA_DIR = BASE_DIR / "data"
    LOG_DIR = BASE_DIR / "app_logging"
    FRONTEND_DIR = BASE_DIR / "app" / "ui"

    # =========================
    # Authentication (override with environment variables)
    # =========================
    AUTH_USERNAME = os.getenv("FINGUARD_USER", "admin")
    AUTH_PASSWORD = os.getenv("FINGUARD_PASSWORD", "1234")
    SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", 3600))

    # =========================
    # Model Configuration
    # =========================
    DEEPFAKE_MODEL_PATH = MODEL_DIR / "deepfake_model.pth"
    MODEL_METADATA_PATH = MODEL_DIR / "model_metadata.json"

    # =========================
    # Device Configuration
    # =========================
    DEVICE = "cpu"  # auto-detection can be added later
    USE_FP16 = False

    # =========================
    # Inference Thresholds
    # =========================
    # These directly affect the agent's decision logic
    DEEPFAKE_THRESHOLD_HIGH = 0.75
    DEEPFAKE_THRESHOLD_LOW = 0.40

    # =========================
    # Preprocessing
    # =========================
    FRAME_SAMPLE_RATE = 5          # frames per second
    MAX_FRAMES = 150               # hard cap for edge safety
    FACE_IMAGE_SIZE = 224

    # =========================
    # Security
    # =========================
    ENABLE_INTEGRITY_CHECK = True
    ALLOW_EXTERNAL_NETWORK = False

    # =========================
    # Logging
    # =========================
    ENABLE_EVENT_LOGGING = True
    LOG_LEVEL = "INFO"

    # =========================
    # Future Expansion Flags
    # =========================
    ENABLE_FEDERATED = False
    ENABLE_RBAC = False


# Singleton-style access
settings = Settings()
