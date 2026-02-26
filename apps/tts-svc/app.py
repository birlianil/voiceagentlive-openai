import base64
import io
import os
import threading
import time
import wave
from pathlib import Path

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
try:
    from piper import PiperVoice  # type: ignore
except Exception:  # pragma: no cover
    from piper.voice import PiperVoice  # type: ignore

app = FastAPI()

VOICE_DIR = Path(os.getenv("PIPER_VOICE_DIR", "/models"))
VOICE_NAME = os.getenv("PIPER_MODEL", "en_US-lessac-medium")
MODEL_PATH = VOICE_DIR / f"{VOICE_NAME}.onnx"
CONFIG_PATH = VOICE_DIR / f"{VOICE_NAME}.onnx.json"

MODEL_URL = os.getenv(
    "PIPER_MODEL_URL",
    f"https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/{VOICE_NAME}.onnx",
)
CONFIG_URL = os.getenv(
    "PIPER_CONFIG_URL",
    f"https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/{VOICE_NAME}.onnx.json",
)


class Req(BaseModel):
    text: str


voice = None
voice_lock = threading.Lock()


def _download_if_missing(path: Path, url: str):
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with path.open("wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)


@app.on_event("startup")
def startup():
    global voice
    try:
        _download_if_missing(MODEL_PATH, MODEL_URL)
        _download_if_missing(CONFIG_PATH, CONFIG_URL)
        voice = PiperVoice.load(str(MODEL_PATH), config_path=str(CONFIG_PATH), use_cuda=False)
    except Exception as exc:
        raise RuntimeError(f"Failed to prepare piper voice model: {exc}") from exc


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": str(MODEL_PATH),
        "ready": MODEL_PATH.exists() and CONFIG_PATH.exists(),
        "voice_loaded": voice is not None,
    }


@app.post("/synthesize")
def synthesize(req: Req):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if voice is None:
        raise HTTPException(status_code=503, detail="voice model not loaded")

    started = time.perf_counter()
    wav_io = io.BytesIO()

    with voice_lock:
        try:
            with wave.open(wav_io, "wb") as wav_file:
                if hasattr(voice, "synthesize_wav"):
                    voice.synthesize_wav(text, wav_file)
                else:
                    chunks = voice.synthesize(text)
                    first = next(iter(chunks), None)
                    if first is None:
                        raise RuntimeError("no audio chunks returned")
                    wav_file.setnchannels(first.sample_channels)
                    wav_file.setsampwidth(first.sample_width)
                    wav_file.setframerate(first.sample_rate)
                    wav_file.writeframes(first.audio_int16_bytes)
                    for chunk in chunks:
                        wav_file.writeframes(chunk.audio_int16_bytes)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"piper synthesis failed: {exc}") from exc

    wav_bytes = wav_io.getvalue()
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    print(f"[tts-svc] synthesized chars={len(text)} bytes={len(wav_bytes)} in {elapsed_ms}ms")
    if not wav_bytes:
        raise HTTPException(status_code=500, detail="piper produced empty wav")

    return {
        "audio_base64": base64.b64encode(wav_bytes).decode("ascii"),
        "content_type": "audio/wav",
    }
