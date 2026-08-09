from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
import webbrowser
import threading

HOST = "127.0.0.1"
PORT = 8000

os.chdir(os.path.dirname(os.path.abspath(__file__)))

url = f"http://{HOST}:{PORT}/"

print("=" * 55)
print(" SALIDA DE ABARROTES PDD - SERVIDOR LOCAL")
print("=" * 55)
print(f"Abriendo: {url}")
print("Para detener el servidor presiona CTRL+C")
print("=" * 55)

def abrir_navegador():
    webbrowser.open(url)

threading.Timer(1.0, abrir_navegador).start()

try:
    ThreadingHTTPServer((HOST, PORT), SimpleHTTPRequestHandler).serve_forever()
except KeyboardInterrupt:
    print("\nServidor detenido.")
