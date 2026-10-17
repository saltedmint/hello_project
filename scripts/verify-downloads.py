"""Download both WAVs into an isolated temporary profile and inspect with wave."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import array
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import wave

ROOT = Path(__file__).resolve().parents[1]
BROWSER = os.environ.get("HELLO_TEST_BROWSER", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
finished = threading.Event()
reports = []


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        reports.append(self.rfile.read(int(self.headers["Content-Length"])).decode())
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        finished.set()

    def log_message(self, *args):
        pass


SCRIPT = """<script>window.addEventListener('load',async()=>{
const $=id=>document.getElementById(id);
const wait=async test=>{for(let i=0;i<1000;i++){if(test())return;await new Promise(r=>setTimeout(r,10));}throw Error('timeout: '+$('export-status').textContent+' / '+$('sound-status').textContent);};
try{
  $('choose-a').click();
  await wait(()=>$('sound-status').textContent.includes('완료'));
  window.AudioContext=function(){throw Error('export must stay offline');};
  let now=1000;Object.defineProperty(performance,'now',{configurable:true,value:()=>now});$('start').click();
  for(let b=0;b<4;b++)[...'hello','Enter'].forEach((key,i)=>{
    now=1000+b*2000+[0,180,420,570,900,1200][i];
    for(const type of ['keydown','keyup'])$('input-zone').dispatchEvent(new KeyboardEvent(type,{key,code:key==='Enter'?'Enter':'Key'+key.toUpperCase(),bubbles:true,cancelable:true}));
  });
  $('add-handwriting').click();const c=$('handwriting-canvas'),ids=new Set();
  c.setPointerCapture=id=>ids.add(id);c.hasPointerCapture=id=>ids.has(id);c.releasePointerCapture=id=>ids.delete(id);
  for(const [event,x,y,t] of [['pointerdown',.1,.9,10000],['pointermove',.5,.9,11000],['pointerup',.9,.9,12000],['pointerdown',.9,.1,13000],['pointermove',.5,.1,13500],['pointerup',.1,.1,14000]]){
    now=t;const r=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent(event,{pointerId:1,isPrimary:true,button:0,bubbles:true,cancelable:true,clientX:r.left+x*r.width,clientY:r.top+y*r.height}));
  }
  $('finish-writing').click();delete performance.now;
  $('melody-volume').value='30';$('melody-volume').dispatchEvent(new Event('input'));
  $('save-json').click();
  for(const id of ['download-original','download-repeated']){
    $(id).click();await wait(()=>$('export-status').textContent.includes('준비 완료')||$('export-status').textContent.includes('실패'));
    if($('export-status').textContent.includes('실패'))throw Error($('export-status').textContent);
  }
  navigator.sendBeacon('ENDPOINT',$('export-status').textContent);
}catch(error){navigator.sendBeacon('ENDPOINT','ERROR '+error.stack);}
});</script>"""


def run():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    script = SCRIPT.replace("ENDPOINT", f"http://127.0.0.1:{server.server_port}/result")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".html", prefix=".file-check-", dir=ROOT, encoding="utf-8", delete=False) as file:
        file.write((ROOT / "index.html").read_text(encoding="utf-8").replace("</body>", script + "</body>"))
        fixture = Path(file.name)
    try:
        with tempfile.TemporaryDirectory(prefix="hello-wav-download-") as folder:
            profile = Path(folder) / "profile"
            (profile / "Default").mkdir(parents=True)
            downloads = Path(folder) / "downloads"
            downloads.mkdir()
            preferences = {"download": {"default_directory": str(downloads), "prompt_for_download": False},
                "profile": {"default_content_setting_values": {"automatic_downloads": 1}}}
            (profile / "Default" / "Preferences").write_text(json.dumps(preferences), encoding="utf-8")
            process = subprocess.Popen([BROWSER, "--headless", "--disable-gpu", "--no-first-run",
                "--remote-debugging-port=0", "--user-data-dir=" + str(profile), fixture.as_uri()],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                if not finished.wait(25):
                    raise RuntimeError("download workflow timeout")
                if reports[0].startswith("ERROR"):
                    raise RuntimeError(reports[0])
                for _ in range(200):
                    if len(list(downloads.glob("*.wav"))) == 2 and not list(downloads.glob("*.crdownload")):
                        break
                    time.sleep(.05)
                print(reports[0])
                json_files = list(downloads.glob('*.json'))
                assert len(json_files) == 1
                saved = json.loads(json_files[0].read_text(encoding='utf-8'))
                assert saved['schemaVersion'] == 1 and saved['text'] == 'hello' * 4
                assert len(saved['relativeTimesMs']) == 20 and saved['durationMs'] == 6900
                assert saved['relativeTimesMs'][5] == 2000 and len(saved['raw']['keyDownTimesMs']) == 20
                assert len(saved['a']['handwriting']['strokes']) == 2
                assert abs(saved['a']['handwriting']['volume'] - .045) < .000001
                print('PASS actual JSON download: original times, four bars, handwriting, and volume preserved')
                for name, expected in [("greeting-original.wav", 5.66), ("greeting-repeated.wav", 15.66)]:
                    with wave.open(str(downloads / name), "rb") as audio:
                        pcm = array.array("h", audio.readframes(audio.getnframes()))
                        duration = audio.getnframes() / audio.getframerate()
                        tail = pcm[-int(.08 * audio.getframerate()) * audio.getnchannels():]
                        assert (audio.getnchannels(), audio.getframerate(), audio.getsampwidth()) == (2, 44100, 2)
                        assert abs(duration - expected) < .001 and all(value == 0 for value in tail)
                        assert 0 < max(map(abs, pcm)) < 32767
                        print(f"PASS {name}: stereo, 44100Hz, PCM16, {duration:.5f}s, peak={max(map(abs, pcm))}, silent tail")
            finally:
                process.terminate()
                process.wait(timeout=10)
    finally:
        fixture.unlink()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    run()
