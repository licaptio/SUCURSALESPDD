from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import socket
import threading
import webbrowser

HOST = "127.0.0.1"
PORT = 8765
BASE = Path(__file__).resolve().parent
os.chdir(BASE)

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()


def abrir_navegador():
    webbrowser.open(f"http://{HOST}:{PORT}/")

if __name__ == "__main__":
    try:
        server = ThreadingHTTPServer((HOST, PORT), NoCacheHandler)
    except OSError as exc:
        print(f"No se pudo iniciar el servidor en el puerto {PORT}: {exc}")
        input("Presiona ENTER para cerrar...")
        raise SystemExit(1)

    print("PROVSOFT Monitor de Transferencias")
    print(f"Servidor: http://{HOST}:{PORT}/")
    threading.Timer(0.7, abrir_navegador).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
