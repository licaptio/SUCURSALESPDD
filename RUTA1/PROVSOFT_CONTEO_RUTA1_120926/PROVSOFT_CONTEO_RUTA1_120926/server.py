from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import socket
import threading
import webbrowser

HOST = "127.0.0.1"
DEFAULT_PORT = 8000
BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "assets"


def find_free_port(start=DEFAULT_PORT, tries=50):
    for port in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((HOST, port))
                return port
            except OSError:
                continue
    raise RuntimeError("No se encontró un puerto libre para iniciar el servidor.")


def main():
    if not WEB_DIR.exists():
        raise SystemExit(f"No existe la carpeta de assets: {WEB_DIR}")

    os.chdir(WEB_DIR)
    port = find_free_port()
    url = f"http://{HOST}:{port}/"

    server = ThreadingHTTPServer((HOST, port), SimpleHTTPRequestHandler)
    print("=" * 68)
    print(" PROVSOFT - CONTEO FISICO RUTA 1 - 12/09/2026")
    print("=" * 68)
    print(f"Servidor activo en: {url}")
    print("Para detenerlo, cierra esta ventana o presiona Ctrl+C.")
    print("=" * 68)

    threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
