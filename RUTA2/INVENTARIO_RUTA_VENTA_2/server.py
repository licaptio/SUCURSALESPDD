import http.server
import os
import socket
import socketserver
import threading
import webbrowser

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)


def obtener_puerto_libre() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        print(f"[HTTP] {format % args}")


if __name__ == "__main__":
    puerto = obtener_puerto_libre()
    direccion = "127.0.0.1"
    url = f"http://{direccion}:{puerto}/INVENTARIORUTA2.html"

    with socketserver.TCPServer((direccion, puerto), Handler) as servidor:
        print("=" * 58)
        print("TABLA DE INVENTARIO RUTA 2")
        print(f"Servidor activo: {url}")
        print("Presiona Ctrl+C para cerrar.")
        print("=" * 58)

        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")
