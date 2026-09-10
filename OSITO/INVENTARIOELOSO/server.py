import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

APP_FILE = "OSITOINVE.html"
START_PORT = 3000
APP_DIR = os.path.dirname(os.path.abspath(__file__))

class ReusableTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

class AppHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

def puerto_disponible(desde=START_PORT, intentos=20):
    for puerto in range(desde, desde + intentos):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as prueba:
            try:
                prueba.bind(("127.0.0.1", puerto))
                return puerto
            except OSError:
                continue
    raise OSError("No se encontro un puerto disponible entre 3000 y 3019.")

def main():
    app_path = os.path.join(APP_DIR, APP_FILE)
    if not os.path.isfile(app_path):
        print(f"ERROR: No se encontro {APP_FILE} en {APP_DIR}")
        input("Presiona ENTER para cerrar...")
        return 1

    puerto = puerto_disponible()
    url = f"http://127.0.0.1:{puerto}/{APP_FILE}"
    with ReusableTCPServer(("127.0.0.1", puerto), AppHandler) as servidor:
        print("PROVSOFT - INVENTARIO EL OSO")
        print(f"Servidor activo en: {url}")
        print("Esta ventana debe permanecer abierta.")
        print("Presiona CTRL+C para detener el servidor.")
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
