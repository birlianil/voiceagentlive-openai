import os
import tempfile

from fastapi import FastAPI, File, UploadFile
from faster_whisper import WhisperModel

app = FastAPI()
model_name = os.getenv("WHISPER_MODEL", "base")
language_hint = os.getenv("WHISPER_LANGUAGE", "").strip() or None
use_vad_filter = os.getenv("WHISPER_VAD_FILTER", "true").lower() in ("1", "true", "yes")
beam_size = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
best_of = int(os.getenv("WHISPER_BEST_OF", "5"))
temperature = float(os.getenv("WHISPER_TEMPERATURE", "0.0"))
model = WhisperModel(model_name, device="cpu", compute_type="int8")


@app.get("/health")
async def health():
    return {
        "ok": True,
        "model": model_name,
        "language_hint": language_hint or "auto",
        "vad_filter": use_vad_filter,
        "beam_size": beam_size,
        "best_of": best_of,
        "temperature": temperature,
    }


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    data = await audio.read()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as f:
        f.write(data)
        f.flush()
        segments, info = model.transcribe(
            f.name,
            beam_size=beam_size,
            best_of=best_of,
            temperature=temperature,
            language=language_hint,
            vad_filter=use_vad_filter,
            condition_on_previous_text=False,
        )
        text = " ".join([seg.text.strip() for seg in segments]).strip()
    return {"text": text, "language": info.language}
