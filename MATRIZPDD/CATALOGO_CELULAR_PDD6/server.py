from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import socket
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
PORT = 8000
LOCAL_URL = f"http://127.0.0.1:{PORT}"

def obtener_ip_local():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return None

ip = obtener_ip_local()
threading.Timer(0.8, lambda: webbrowser.open(LOCAL_URL)).start()
print(f"Catalogo disponible en esta PC: {LOCAL_URL}")
if ip:
    print(f"Desde un celular en la misma Wi-Fi: http://{ip}:{PORT}")
print("Presiona Ctrl+C para detener el servidor.")
ThreadingHTTPServer(("0.0.0.0", PORT), SimpleHTTPRequestHandler).serve_forever()
