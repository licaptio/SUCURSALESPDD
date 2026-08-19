from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import webbrowser
import threading
import os

PORT = 8000

def abrir():
    webbrowser.open(f"http://localhost:{PORT}")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    threading.Timer(0.8, abrir).start()
    print(f"INCIDENCIAS ABARROTES PDD -> http://localhost:{PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), SimpleHTTPRequestHandler).serve_forever()
