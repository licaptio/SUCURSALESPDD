#!/usr/bin/env python3
import argparse
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

APP_FILE = "index.html"

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0, private")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    def log_message(self, fmt, *args):
        print("[PROVSOFT] " + (fmt % args))

def local_ip():
    s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8",80)); return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()

def main():
    parser=argparse.ArgumentParser(description="Servidor PROVSOFT - Clasificador Reposteria")
    parser.add_argument("--port",type=int,default=8080)
    parser.add_argument("--no-browser",action="store_true")
    args=parser.parse_args()
    base=os.path.dirname(os.path.abspath(sys.argv[0] if getattr(sys,"frozen",False) else __file__))
    os.chdir(base)
    if not os.path.exists(APP_FILE):
        print("ERROR: no se encuentra index.html"); input("Enter para cerrar..."); return 1
    socketserver.TCPServer.allow_reuse_address=True
    with socketserver.ThreadingTCPServer(("0.0.0.0",args.port),Handler) as httpd:
        pc=f"http://127.0.0.1:{args.port}/"
        mobile=f"http://{local_ip()}:{args.port}/"
        print("\nPROVSOFT · CLASIFICADOR REPOSTERIA")
        print("="*44)
        print("PC:     ",pc)
        print("CELULAR:",mobile)
        print("\nCelular y PC deben estar en la misma red Wi-Fi.")
        print("Nota: la cámara del navegador puede exigir HTTPS en el celular.")
        print("Para cerrar: Ctrl+C\n")
        if not args.no_browser:
            threading.Timer(.7,lambda:webbrowser.open(pc)).start()
        try: httpd.serve_forever()
        except KeyboardInterrupt: print("\nServidor cerrado.")
    return 0

if __name__=="__main__": raise SystemExit(main())
