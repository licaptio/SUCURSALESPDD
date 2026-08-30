from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os, webbrowser, threading

ROOT = Path(__file__).resolve().parent
PORT = 8787

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

if __name__ == "__main__":
    os.chdir(ROOT)
    url = f"http://127.0.0.1:{PORT}/"
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    print(f"Reporte PDD disponible en {url}")
    print("Presiona Ctrl+C para cerrar.")
    ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler).serve_forever()
