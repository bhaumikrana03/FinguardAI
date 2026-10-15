import json
import torch
from pathlib import Path

from app.config import settings
from app_logging.event_logger import log_event


class ModelLoader:
    """
    Centralized deepfake model loader.

    Responsibilities:
    - Load PyTorch model
    - Handle device placement
    - Set eval mode
    - Validate metadata compatibility
    """

    def __init__(self):
        self.device = torch.device(settings.DEVICE)
        self.model = None
        self.metadata = None

        self._load_metadata()
        self._load_model()

    def _load_metadata(self):
        metadata_path = Path(settings.MODEL_METADATA_PATH)

        if not metadata_path.exists():
            raise FileNotFoundError("Model metadata file missing")

        with open(metadata_path, "r") as f:
            self.metadata = json.load(f)

        log_event(
            "MODEL_METADATA_LOADED",
            {
                "model_name": self.metadata.get("model_name"),
                "version": self.metadata.get("version")
            }
        )

    def _load_model(self):
        model_path = Path(settings.DEEPFAKE_MODEL_PATH)

        if not model_path.exists():
            raise FileNotFoundError("Deepfake model file missing")

        # NOTE:
        # The actual architecture is assumed to be defined during training.
        # Here we load a serialized torch model for inference only.
        self.model = torch.load(
        model_path,
        map_location=self.device,
        weights_only=False ) # This allows the model to load in PyTorch 2.6+
        
        self.model.to(self.device)
        self.model.eval()

        log_event(
            "MODEL_LOADED",
            {
                "device": str(self.device),
                "fp16": settings.USE_FP16
            }
        )

    def get_model(self):
        return self.model

    def get_device(self):
        return self.device


# Singleton-style access (important for performance)
_model_loader = None


def get_model_loader():
    global _model_loader
    if _model_loader is None:
        _model_loader = ModelLoader()
    return _model_loader
