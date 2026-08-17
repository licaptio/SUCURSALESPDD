from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import webbrowser, threading
PORT=8000
URL=f"http://127.0.0.1:{PORT}/MONITORCONTEO.html"
threading.Timer(0.8, lambda: webbrowser.open(URL)).start()
print(f"Monitor ABARROTESPDD: {URL}")
ThreadingHTTPServer(("127.0.0.1",PORT),SimpleHTTPRequestHandler).serve_forever()
