from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
import threading
import webbrowser

PORT = 8001
ROOT = Path(__file__).resolve().parent / "assets"
URL = f"http://127.0.0.1:{PORT}/index.html"

handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
threading.Timer(0.8, lambda: webbrowser.open(URL)).start()
print("PROVSOFT - MONITOR RUTA 2 / INVENTARIO 12-09-2026")
print(f"Abriendo: {URL}")
print("Para cerrar el servidor presione Ctrl+C.")
ThreadingHTTPServer(("127.0.0.1", PORT), handler).serve_forever()
