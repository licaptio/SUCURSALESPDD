#!/usr/bin/env python3
import http.server
import os
import socketserver
import threading
import webbrowser

PORT = 8766
BASE = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE)

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("[PROVSOFT] " + (fmt % args))

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

url = f"http://127.0.0.1:{PORT}/"
print("\nPROVSOFT · SOLICITUD DE TRANSFERENCIA POS")
print("=" * 45)
print("Abriendo:", url)
print("Para cerrar el servidor: Ctrl+C\n")
threading.Timer(0.8, lambda: webbrowser.open(url)).start()
try:
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServidor cerrado.")
