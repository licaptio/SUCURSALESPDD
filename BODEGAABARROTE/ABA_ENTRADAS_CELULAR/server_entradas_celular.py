from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
import socket
import webbrowser
import threading

PAGINA = "ENTRADAS_CELULAR.html"
PUERTO = 8001


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def obtener_ip_local():
    conexion = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        conexion.connect(("8.8.8.8", 80))
        return conexion.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        conexion.close()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    servidor = ThreadingHTTPServer(("0.0.0.0", PUERTO), Handler)
    url_pc = f"http://127.0.0.1:{PUERTO}/{PAGINA}"
    url_celular = f"http://{obtener_ip_local()}:{PUERTO}/{PAGINA}"
    threading.Timer(0.6, lambda: webbrowser.open(url_pc)).start()
    print("=" * 58)
    print("PROVSOFT - ENTRADAS PARA CELULAR")
    print(f"En el celular abre: {url_celular}")
    print("La computadora y el celular deben estar en el mismo Wi-Fi.")
    print("Mantén esta ventana abierta mientras se use la página.")
    print("=" * 58)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        servidor.server_close()
