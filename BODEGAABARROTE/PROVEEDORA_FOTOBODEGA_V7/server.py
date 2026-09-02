from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os, threading, webbrowser

PORT = 8011
BASE = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE)

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control","no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma","no-cache")
        self.send_header("Expires","0")
        super().end_headers()

url=f"http://localhost:{PORT}"
print("="*64)
print(" PROVEEDORA FOTO BODEGA V6")
print(" Puerto:", PORT)
print(" URL:", url)
print(" NO CIERRES ESTA VENTANA mientras uses la pagina.")
print("="*64)
threading.Timer(0.8, lambda: webbrowser.open(url)).start()
ThreadingHTTPServer(("127.0.0.1",PORT),NoCacheHandler).serve_forever()
