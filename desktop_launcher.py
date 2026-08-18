from __future__ import annotations

import ctypes
import logging
import os
import socket
import sys
import tempfile
import threading
import time
import traceback
import webbrowser
from pathlib import Path


HOST = "127.0.0.1"
START_PORT = 8765
APP_NAME = "Clipchamp Edge-TTS 批量配音工坊"
LOG_DIR = Path(os.getenv("LOCALAPPDATA") or tempfile.gettempdir()) / "ClipchampTTS"
LOG_FILE = LOG_DIR / "launcher.log"


def setup_logging() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=str(LOG_FILE),
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        encoding="utf-8",
    )


class LogWriter:
    def __init__(self, level: int) -> None:
        self.level = level

    def write(self, message: str) -> None:
        message = message.strip()
        if message:
            logging.log(self.level, message)

    def flush(self) -> None:
        pass

    def isatty(self) -> bool:
        return False


def redirect_standard_streams() -> None:
    sys.stdout = LogWriter(logging.INFO)  # type: ignore[assignment]
    sys.stderr = LogWriter(logging.ERROR)  # type: ignore[assignment]


def show_error(message: str) -> None:
    text = f"{message}\n\n错误日志：\n{LOG_FILE}"
    try:
        ctypes.windll.user32.MessageBoxW(None, text, APP_NAME, 0x10)  # type: ignore[attr-defined]
    except Exception:
        pass


def find_free_port(start_port: int = START_PORT) -> int:
    for port in range(start_port, start_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.2)
            if sock.connect_ex((HOST, port)) != 0:
                return port
    raise RuntimeError("No free local port found.")


def open_browser(port: int) -> None:
    time.sleep(1.2)
    webbrowser.open(f"http://{HOST}:{port}")


def run_server() -> None:
    import uvicorn
    from server import app

    port = find_free_port()
    logging.info("Starting %s on http://%s:%s", APP_NAME, HOST, port)
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()
    config = uvicorn.Config(
        app,
        host=HOST,
        port=port,
        log_level="warning",
        access_log=False,
        log_config=None,
    )
    server = uvicorn.Server(config)
    server.run()


def main() -> None:
    setup_logging()
    redirect_standard_streams()
    logging.info("Launcher booting. frozen=%s executable=%s", getattr(sys, "frozen", False), sys.executable)
    run_server()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        try:
            setup_logging()
            logging.error("Startup failed:\n%s", traceback.format_exc())
        finally:
            show_error(f"软件启动失败：{exc}")
        raise
