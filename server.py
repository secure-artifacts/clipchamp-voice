from __future__ import annotations

import asyncio
import io
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import uuid
import zipfile
from pathlib import Path

import edge_tts
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field


def resource_path(name: str) -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / name  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent / name


APP_DIR = resource_path("")
RUNTIME_DIR = Path(os.getenv("LOCALAPPDATA") or tempfile.gettempdir()) / "ClipchampTTS"
PREVIEW_FILE = RUNTIME_DIR / "temp_preview.mp3"
DEFAULT_VOICE = "en-US-AvaMultilingualNeural"
GENERATION_PAUSE_SECONDS = 1.5
SUPPORTED_DOWNLOAD_FORMATS = {
    "mp3": "audio/mpeg",
    "mp4": "video/mp4",
}

app = FastAPI(title="Clipchamp Edge-TTS Batch Workshop")
preview_lock = asyncio.Lock()
GENERATED_FILES: dict[str, Path] = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateSaveRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: str = DEFAULT_VOICE
    rate: str = "+0%"
    pitch: str = "+0Hz"
    save_dir: str = Field(..., min_length=1)
    file_name: str = Field(..., min_length=1)


class OpenFolderRequest(BaseModel):
    folder_path: str = Field(..., min_length=1)


class PreviewRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: str = DEFAULT_VOICE
    rate: str = "+0%"
    pitch: str = "+0Hz"


class DownloadZipRequest(BaseModel):
    file_ids: list[str] = Field(..., min_length=1)
    zip_name: str = "tts_batch.zip"
    formats: list[str] = Field(default_factory=lambda: ["mp3", "mp4"])


FALLBACK_VOICES = [
    {"ShortName": "en-US-AvaMultilingualNeural", "Locale": "en-US", "DisplayName": "Ava Multilingual", "LocalName": "Ava Multilingual", "Gender": "Female"},
    {"ShortName": "en-US-EmmaMultilingualNeural", "Locale": "en-US", "DisplayName": "Emma Multilingual", "LocalName": "Emma Multilingual", "Gender": "Female"},
    {"ShortName": "en-US-AriaNeural", "Locale": "en-US", "DisplayName": "Aria", "LocalName": "Aria", "Gender": "Female"},
    {"ShortName": "en-US-GuyNeural", "Locale": "en-US", "DisplayName": "Guy", "LocalName": "Guy", "Gender": "Male"},
    {"ShortName": "en-GB-SoniaNeural", "Locale": "en-GB", "DisplayName": "Sonia", "LocalName": "Sonia", "Gender": "Female"},
    {"ShortName": "en-GB-RyanNeural", "Locale": "en-GB", "DisplayName": "Ryan", "LocalName": "Ryan", "Gender": "Male"},
    {"ShortName": "it-IT-ElsaNeural", "Locale": "it-IT", "DisplayName": "Elsa", "LocalName": "Elsa", "Gender": "Female"},
    {"ShortName": "it-IT-DiegoNeural", "Locale": "it-IT", "DisplayName": "Diego", "LocalName": "Diego", "Gender": "Male"},
    {"ShortName": "zh-CN-XiaoxiaoNeural", "Locale": "zh-CN", "DisplayName": "Xiaoxiao", "LocalName": "晓晓", "Gender": "Female"},
    {"ShortName": "zh-CN-YunjianNeural", "Locale": "zh-CN", "DisplayName": "Yunjian", "LocalName": "云健", "Gender": "Male"},
]


def ensure_text(value: str) -> str:
    text = value.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    return text


def safe_file_name(file_name: str) -> str:
    name = Path(file_name).name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="file_name cannot be empty.")
    if name != file_name.strip():
        raise HTTPException(status_code=400, detail="file_name must not contain folders.")
    return name


def safe_download_format(format_name: str) -> str:
    normalized = format_name.lower().strip().lstrip(".")
    if normalized not in SUPPORTED_DOWNLOAD_FORMATS:
        raise HTTPException(status_code=400, detail="只支持 mp3 或 mp4 下载格式。")
    return normalized


def normalize_formats(formats: list[str]) -> list[str]:
    normalized: list[str] = []
    for item in formats:
        format_name = safe_download_format(item)
        if format_name not in normalized:
            normalized.append(format_name)
    if not normalized:
        normalized.append("mp3")
    return normalized


def download_name(path: Path, format_name: str) -> str:
    return f"{path.stem}.{format_name}"


def register_generated_file(path: Path) -> str:
    file_id = uuid.uuid4().hex
    GENERATED_FILES[file_id] = path.resolve()
    return file_id


def get_generated_file(file_id: str) -> Path:
    path = GENERATED_FILES.get(file_id)
    if not path or not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="下载文件不存在，请重新生成。")
    return path


async def save_tts(text: str, voice: str, rate: str, pitch: str, output_path: Path) -> None:
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, pitch=pitch)
    await communicate.save(str(output_path))


def create_format_aliases(output_path: Path) -> dict[str, str]:
    aliases = {"mp3": str(output_path)}
    mp4_path = output_path.with_suffix(".mp4")
    if mp4_path != output_path:
        shutil.copyfile(output_path, mp4_path)
        aliases["mp4"] = str(mp4_path)
    return aliases


def tts_error(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=500,
        detail=f"网络连接或生成失败，请检查代理、VPN、系统时间，或稍后再试。原始错误：{exc}",
    )


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(APP_DIR / "index.html")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/voices")
async def voices() -> dict[str, object]:
    try:
        voice_list = await edge_tts.list_voices()
        return {"status": "ok", "voices": voice_list}
    except Exception:
        return {"status": "fallback", "voices": FALLBACK_VOICES}


@app.post("/api/generate_save")
async def generate_save(payload: GenerateSaveRequest) -> dict[str, object]:
    text = ensure_text(payload.text)
    output_dir = Path(payload.save_dir).expanduser()
    name = safe_file_name(payload.file_name)
    output_path = output_dir / name

    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        await save_tts(text, payload.voice, payload.rate, payload.pitch, output_path)
        await asyncio.sleep(GENERATION_PAUSE_SECONDS)
    except Exception as exc:
        raise tts_error(exc) from exc

    file_id = register_generated_file(output_path)
    return {
        "status": "ok",
        "file_path": str(output_path),
        "file_name": name,
        "file_id": file_id,
        "download_urls": {
            "mp3": f"/api/download/{file_id}/mp3",
            "mp4": f"/api/download/{file_id}/mp4",
        },
        "play_url": f"/api/play/{file_id}",
    }


@app.get("/api/play/{file_id}")
async def play_file(file_id: str) -> FileResponse:
    path = get_generated_file(file_id)
    return FileResponse(path, media_type="audio/mpeg")


@app.get("/api/download/{file_id}")
async def download_file_legacy(file_id: str) -> FileResponse:
    return await download_file(file_id, "mp3")


@app.get("/api/download/{file_id}/{format_name}")
async def download_file(file_id: str, format_name: str) -> FileResponse:
    path = get_generated_file(file_id)
    format_name = safe_download_format(format_name)
    return FileResponse(
        path,
        media_type=SUPPORTED_DOWNLOAD_FORMATS[format_name],
        filename=download_name(path, format_name),
    )


@app.post("/api/download_zip")
async def download_zip(payload: DownloadZipRequest) -> StreamingResponse:
    zip_file_name = safe_file_name(payload.zip_name)
    if not zip_file_name.lower().endswith(".zip"):
        zip_file_name = f"{zip_file_name}.zip"
    formats = normalize_formats(payload.formats)

    buffer = io.BytesIO()
    seen_names: set[str] = set()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for file_id in payload.file_ids:
            path = get_generated_file(file_id)
            for format_name in formats:
                archive_name = download_name(path, format_name)
                if archive_name in seen_names:
                    archive_name = f"{path.stem}_{file_id[:6]}.{format_name}"
                seen_names.add(archive_name)
                archive.write(path, archive_name)
    buffer.seek(0)

    headers = {"Content-Disposition": 'attachment; filename="tts_batch.zip"'}
    return StreamingResponse(buffer, media_type="application/zip", headers=headers)


@app.post("/api/open_folder")
async def open_folder(payload: OpenFolderRequest) -> dict[str, str]:
    folder = Path(payload.folder_path).expanduser()

    try:
        folder.mkdir(parents=True, exist_ok=True)
        system = platform.system().lower()
        if system == "windows":
            os.startfile(str(folder))  # type: ignore[attr-defined]
        elif system == "darwin":
            subprocess.Popen(["open", str(folder)])
        else:
            subprocess.Popen(["xdg-open", str(folder)])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "status": "ok",
        "folder_path": str(folder),
    }


@app.post("/api/preview")
async def preview(payload: PreviewRequest) -> FileResponse:
    text = ensure_text(payload.text)[:30]

    try:
        RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        async with preview_lock:
            await save_tts(text, payload.voice, payload.rate, payload.pitch, PREVIEW_FILE)
    except Exception as exc:
        raise tts_error(exc) from exc

    return FileResponse(
        PREVIEW_FILE,
        media_type="audio/mpeg",
        filename="temp_preview.mp3",
    )
