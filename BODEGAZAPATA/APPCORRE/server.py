from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import webbrowser
import os
import socket

PUERTO = 8000

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".json": "application/json",
        ".css": "text/css",
        ".html": "text/html",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def obtener_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


if __name__ == "__main__":
    carpeta = os.path.dirname(os.path.abspath(__file__))
    os.chdir(carpeta)
    servidor = ThreadingHTTPServer(("0.0.0.0", PUERTO), Handler)
    url_local = f"http://localhost:{PUERTO}/index.html"
    url_red = f"http://{obtener_ip()}:{PUERTO}/index.html"

    print("=" * 60)
    print("PROVSOFT - Corrección de Inventario Modal")
    print("Servidor iniciado")
    print("=" * 60)
    print("Local :", url_local)
    print("Red   :", url_red)
    print("=" * 60)

    webbrowser.open(url_local)

    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        servidor.server_close()
