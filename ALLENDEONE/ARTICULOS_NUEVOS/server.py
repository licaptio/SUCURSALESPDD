from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import webbrowser

PUERTO = 8000
CARPETA = Path(__file__).resolve().parent

os.chdir(CARPETA)
url = f"http://localhost:{PUERTO}"
print(f"App disponible en: {url}")
webbrowser.open(url)

servidor = ThreadingHTTPServer(("localhost", PUERTO), SimpleHTTPRequestHandler)
try:
    servidor.serve_forever()
except KeyboardInterrupt:
    print("\nServidor detenido.")
finally:
    servidor.server_close()
