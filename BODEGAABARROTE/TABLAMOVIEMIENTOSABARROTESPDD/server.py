from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import webbrowser
import threading
import os
import socket

PAGINA = "INVENTARIOABARROTES.html"

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

def puerto_disponible(preferido=8000):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", preferido))
            return preferido
        except OSError:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    puerto = puerto_disponible()
    url = f"http://127.0.0.1:{puerto}/{PAGINA}"
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    servidor = ThreadingHTTPServer(("127.0.0.1", puerto), Handler)
    print("=" * 50)
    print("PROVSOFT - INVENTARIO ABARROTES")
    print(f"Servidor local: {url}")
    print("Cierra esta ventana para detener el servidor.")
    print("=" * 50)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        servidor.server_close()
