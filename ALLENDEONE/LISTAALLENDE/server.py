import http.server
import socketserver
import webbrowser
import os

PORT = 3000

Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Servidor PROVSOFT corriendo en http://localhost:{PORT}/index.html")
    print("CTRL + C para detener")

    # 🔥 abrir directo index
    webbrowser.open(f"http://localhost:{PORT}/index.html")

    httpd.serve_forever()