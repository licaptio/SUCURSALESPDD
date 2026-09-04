from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import socket

HOST = "0.0.0.0"
PORT = 8000

BASE_DIR = Path(__file__).resolve().parent
os.chdir(BASE_DIR)

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

if __name__ == "__main__":
    lan_ip = get_lan_ip()
    print("=" * 58)
    print(" SALIDAS ZAPATA PC")
    print("=" * 58)
    print(f" PC local : http://localhost:{PORT}")
    print(f" Red LAN  : http://{lan_ip}:{PORT}")
    print(" Para cerrar: Ctrl + C")
    print("=" * 58)

    try:
        ThreadingHTTPServer((HOST, PORT), NoCacheHandler).serve_forever()
    except KeyboardInterrupt:
        print("\nServidor cerrado.")
