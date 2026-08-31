from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import webbrowser, threading, os
PORT=8765
os.chdir(os.path.dirname(os.path.abspath(__file__)))
url=f'http://127.0.0.1:{PORT}/'
threading.Timer(0.8, lambda: webbrowser.open(url)).start()
print(f'PROVSOFT - Salida Abarrotes PDD\nAbriendo {url}\nPara cerrar: Ctrl+C')
ThreadingHTTPServer(('127.0.0.1',PORT), SimpleHTTPRequestHandler).serve_forever()
