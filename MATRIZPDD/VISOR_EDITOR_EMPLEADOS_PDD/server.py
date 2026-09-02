from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import webbrowser, threading

PORT = 8080
url = f"http://localhost:{PORT}"
threading.Timer(1, lambda: webbrowser.open(url)).start()
print(f"PROVSOFT Empleados disponible en {url}")
ThreadingHTTPServer(("localhost", PORT), SimpleHTTPRequestHandler).serve_forever()
