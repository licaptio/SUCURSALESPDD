from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os, webbrowser, threading

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
url = "http://127.0.0.1:8000"
threading.Timer(0.8, lambda: webbrowser.open(url)).start()
print(f"Catálogo disponible en {url}")
ThreadingHTTPServer(("127.0.0.1", 8000), SimpleHTTPRequestHandler).serve_forever()
