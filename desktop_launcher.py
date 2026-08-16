from __future__ import annotations

import socket
import threading
import time
import webbrowser

import uvicorn

from server import app


HOST = "127.0.0.1"
START_PORT = 8765
APP_NAME = "Clipchamp Edge-TTS 批量配音工坊"


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


def main() -> None:
    port = find_free_port()
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()
    config = uvicorn.Config(
        app,
        host=HOST,
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    server.run()


if __name__ == "__main__":
    main()
