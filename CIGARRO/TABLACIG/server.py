from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import webbrowser
import threading
import os

PUERTO = 8000

class Handler(SimpleHTTPRequestHandler):
    pass

def abrir_navegador():
    webbrowser.open(f"http://localhost:{PUERTO}/index.html")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    threading.Timer(1, abrir_navegador).start()

    servidor = ThreadingHTTPServer(("0.0.0.0", PUERTO), Handler)

    print("=" * 50)
    print("PROVSOFT - Servidor iniciado")
    print(f"http://localhost:{PUERTO}/index.html")
    print("=" * 50)

    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        servidor.server_close()