from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import tempfile
import os

# Core pipeline imports
from preprocessing.video_loader import load_video
from preprocessing.frame_sampler import sample_frames
from preprocessing.normalization import normalize_frames
from face_detection.face_detector import detect_faces
from inference.deepfake_infer import run_inference
from inference.temporal_aggregation import aggregate_predictions
from agent.decision_engine import make_decision
from agent.explanation_engine import generate_explanation

# System utilities
from app.config import settings
from app_logging.event_logger import log_event
from security.integrity_check import verify_input_integrity
from app import auth


app = FastAPI(
    title="Deepfake Edge Agent",
    description="Autonomous Edge AI System for Deepfake Detection",
    version="1.0.0"
)

# CORS (allows the dashboard to be opened from a different origin during development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "mode": settings.RUNTIME_MODE,
        "device": settings.DEVICE
    }


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/auth/login")
def auth_login(body: LoginRequest, request: Request):
    return auth.login(body.username, body.password, auth.client_ip(request))


@app.get("/auth/me")
def auth_me(user: str = Depends(auth.require_auth)):
    return {"username": user}


@app.post("/auth/logout")
def auth_logout(request: Request, user: str = Depends(auth.require_auth)):
    auth.logout(request.headers["authorization"].split(" ", 1)[1])
    return {"status": "signed_out"}


@app.post("/analyze/video")
async def analyze_video(file: UploadFile = File(...), user: str = Depends(auth.require_auth)):
    """
    Core autonomous pipeline:
    Input → Preprocessing → Inference → Decision → Explanation → Logging
    """

    if not file.filename.lower().endswith((".mp4", ".avi", ".mov")):
        raise HTTPException(status_code=400, detail="Unsupported video format")

    try:
        # Save video temporarily (edge-safe)
        with tempfile.NamedTemporaryFile(delete=False, suffix=file.filename) as tmp:
            tmp.write(await file.read())
            video_path = tmp.name

        # Step 0: Integrity & security check
        verify_input_integrity(video_path)

        log_event("VIDEO_RECEIVED", {"file": file.filename})

        # Step 1: Load video
        video = load_video(video_path)

        # Step 2: Frame sampling
        frames = sample_frames(video)

        # Step 3: Normalization
        frames = normalize_frames(frames)

        # Step 4: Face detection & alignment
        raw_faces = detect_faces(frames)
        from face_detection.face_aligner import align_faces
        face_batches = align_faces(raw_faces)

        

        if len(face_batches) == 0:
            raise HTTPException(status_code=422, detail="No faces detected")

        # Step 5: Deepfake inference (frame-level)
        predictions = run_inference(face_batches)

        # Step 6: Temporal aggregation (video-level)
        raw_val = aggregate_predictions(predictions)
        # FORCE TO FLOAT IMMEDIATELY
        aggregated_score = float(raw_val) 

        # Step 7: Agent decision logic
        # Ensure decision engine gets a float
        decision = make_decision(aggregated_score)

        # Step 8: Explanation generation
        # Use the guaranteed numeric score
        explanation = generate_explanation(
            decision["verdict"],
            float(aggregated_score),
            
            decision["risk_level"]
        )

        # Step 9: Logging & feedback hook
        log_event(
            "ANALYSIS_COMPLETE",
            {
                "score": float(aggregated_score), # No rounding here to be safe
                "decision": decision
            }
        )

        return {
            "filename": file.filename,
            "deepfake_score": float(aggregated_score),
            "decision": decision,
            "explanation": explanation
        }
        

    except HTTPException:
        raise

    except Exception as e:
        log_event("PIPELINE_ERROR", {"error": str(e)})
        raise HTTPException(status_code=500, detail="Internal processing error")

    finally:
        if os.path.exists(video_path):
            os.remove(video_path)


# Serve the HTML/CSS/JS dashboard from the same origin as the API.
# This must stay after all API routes so that it only handles unmatched paths.
app.mount(
    "/",
    StaticFiles(directory=str(settings.FRONTEND_DIR), html=True),
    name="frontend"
)


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.DEBUG
    )
