from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import socket
import webbrowser

HOST = "127.0.0.1"
PORT = 8080
ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def find_port(start=PORT, tries=25):
    for port in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((HOST, port))
                return port
            except OSError:
                pass
    raise RuntimeError("No se encontró un puerto libre.")

if __name__ == "__main__":
    port = find_port()
    url = f"http://{HOST}:{port}/"
    print("=" * 62)
    print(" LA PROVEEDORA - CATALOGO REPOSTERIA")
    print(f" Abriendo: {url}")
    print(" Para cerrar el servidor presiona Ctrl+C")
    print("=" * 62)
    webbrowser.open(url)
    ThreadingHTTPServer((HOST, port), NoCacheHandler).serve_forever()
