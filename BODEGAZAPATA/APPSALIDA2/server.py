from http.server import HTTPServer, SimpleHTTPRequestHandler
import socket
import threading
import webbrowser
import time

PORT = 8000

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

def abrir_navegador():
    time.sleep(1)
    webbrowser.open(f"http://localhost:{PORT}")

hostname = socket.gethostname()
try:
    local_ip = socket.gethostbyname(hostname)
except Exception:
    local_ip = "TU-IP-LOCAL"

print("=" * 60)
print(f"LOCAL  : http://localhost:{PORT}")
print(f"CELULAR: http://{local_ip}:{PORT}")
print("=" * 60)

threading.Thread(target=abrir_navegador, daemon=True).start()
HTTPServer(("0.0.0.0", PORT), NoCacheHandler).serve_forever()
