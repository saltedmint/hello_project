"""Run HTTP regression tests and file:// smoke tests with installed Chrome.

Uses only Python's standard library. No browser security settings are changed.
The autoplay flag is confined to the isolated headless test profile.
"""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
BROWSER = Path(os.environ.get("HELLO_TEST_BROWSER", r"C:\Program Files\Google\Chrome\Application\chrome.exe"))
finished = threading.Event()
reports = []


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        reports.append(self.rfile.read(int(self.headers["Content-Length"])).decode("utf-8"))
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        finished.set()

    def log_message(self, *args):
        pass


def run(mode, server):
    finished.clear()
    reports.clear()
    target = "report" if mode == "http" else "file-report"
    endpoint = f"http://127.0.0.1:{server.server_port}/result"
    listener = """<script>new MutationObserver(()=>{
      const r=document.getElementById('TARGET');
      if(r&&(r.dataset.result||/^(PASS|FAIL)/.test(r.textContent))&&!window.sent){
        if('TARGET'==='report'&&!r.dataset.result)return;
        window.sent=true;navigator.sendBeacon('ENDPOINT',r.textContent);
      }
    }).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});</script>"""
    listener = listener.replace("TARGET", target).replace("ENDPOINT", endpoint)
    source = ROOT / ("tests.html" if mode == "http" else "index.html")
    markup = source.read_text(encoding="utf-8").replace("<body>", listener + "<body>")
    if mode == "file":
        markup = markup.replace("</body>", '<script src="scripts/file-smoke.js"></script></body>')
    with tempfile.NamedTemporaryFile(mode="w", suffix=".html", prefix=f".{mode}-check-", dir=ROOT, encoding="utf-8", delete=False) as fixture:
        fixture.write(markup)
        path = Path(fixture.name)
    try:
        with tempfile.TemporaryDirectory(prefix=f"hello-{mode}-test-") as profile:
            url = f"http://127.0.0.1:{server.server_port}/{path.name}" if mode == "http" else path.as_uri()
            process = subprocess.Popen([str(BROWSER), "--headless", "--disable-gpu", "--no-first-run",
                "--remote-debugging-port=0", "--autoplay-policy=no-user-gesture-required",
                "--user-data-dir=" + profile, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                if not finished.wait(30):
                    raise RuntimeError(f"{mode}: browser test timed out")
                print(f"[{mode}]\n{reports[0]}", flush=True)
                return "FAIL" not in reports[0] and "ERROR" not in reports[0]
            finally:
                process.terminate()
                process.wait(timeout=10)
    finally:
        path.unlink()


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        http_ok = run("http", server)
        file_ok = run("file", server)
        sys.exit(0 if http_ok and file_ok else 1)
    finally:
        server.shutdown()
        server.server_close()
