from http.server import HTTPServer, SimpleHTTPRequestHandler
import webbrowser

HOST = "localhost"
PORT = 8000

webbrowser.open(f"http://{HOST}:{PORT}")

httpd = HTTPServer((HOST, PORT), SimpleHTTPRequestHandler)

print(f"Servidor iniciado en http://{HOST}:{PORT}")
print("Presiona Ctrl+C para detenerlo.")

httpd.serve_forever()