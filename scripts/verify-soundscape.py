"""B actual Chrome playback, reload, JSON download/import; isolated HTTP/file profiles."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import os
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
BROWSER = os.environ.get('HELLO_TEST_BROWSER', r'C:\Program Files\Google\Chrome\Application\chrome.exe')
finished = threading.Event()
reports = []

class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        reports.append(self.rfile.read(int(self.headers['Content-Length'])).decode('utf-8'))
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        finished.set()

    def log_message(self, *args):
        pass

SCRIPT = r'''<script>window.addEventListener('load',async()=>{
const $=id=>document.getElementById(id), b=HelloSoundscape,D=HelloSoundscapeData;
const assert=value=>{if(!value)throw Error('B browser assertion failed');};
const wait=async test=>{for(let i=0;i<500;i++){if(test())return;await new Promise(r=>setTimeout(r,10));}throw Error('timeout / '+$('b-feedback').textContent);};
try{
 $('choose-b-legacy').click();
 if(!sessionStorage.getItem('b-stage')){
   assert(b.getRecords().length===0&&!b.player.context);
   $('b-example-count').value='20';$('b-examples').click();assert(b.getRecords().length===20);
   const assertOverview=()=>{
     assert(document.body.classList.contains('soundscape-open'));
     assert(document.documentElement.scrollHeight<=innerHeight+1);
     assert([...$('b-records').children].every(row=>{const box=row.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight&&box.height>=20;}));
   };
   assertOverview();
   sessionStorage.setItem('b-expected',JSON.stringify(b.getRecords()));
   const scheduled=[],originalSchedule=b.player.schedule.bind(b.player);
   b.player.schedule=(event,start)=>{scheduled.push({...event,cycleStart:start});originalSchedule(event,start);};
   $('b-sound-start').click();await wait(()=>b.player.running);
   assert(b.player.context.state==='running'&&b.diagnostics().events===260);
   await wait(()=>b.diagnostics().voices>0);
   const cycle=b.player.current, clock=b.player.context;
   $('b-morse').click();assert(b.player.current===cycle&&b.player.context===clock);
   assertOverview();
   assert($('b-records').querySelectorAll('.b-morse-group').length===260);
   const group=$('b-records').querySelector('.b-morse-group'), before=group.getBoundingClientRect();
   group.classList.add('b-sounding');const after=group.getBoundingClientRect();assert(before.width===after.width&&before.x===after.x);
   // Wait through a full real-time cycle, not only a simulated clock.
   const waitCycle=async test=>{for(let i=0;i<1800;i++){if(test())return;await new Promise(r=>setTimeout(r,10));}throw Error('real cycle timeout');};
   await waitCycle(()=>b.player.current.start>cycle.start&&scheduled.some(e=>e.cycleStart>cycle.start));
   const firstCycle=scheduled.filter(e=>e.cycleStart===cycle.start), expectedPlan=HelloSoundscapeAudio.plan(b.getRecords(),cycle.start);
   assert(firstCycle.length===260);
   assert(firstCycle.every((e,i)=>e.id===expectedPlan.events[i].id&&e.index===expectedPlan.events[i].index&&e.time===expectedPlan.events[i].time));
   const repeated=scheduled.find(e=>e.cycleStart>cycle.start), original=firstCycle.find(e=>e.id===repeated.id&&e.index===repeated.index);
   assert(Math.abs(repeated.time-original.time-cycle.period)<.000001);
   $('b-stop').click();assert(!b.player.running&&b.diagnostics().voices===0&&b.diagnostics().frame===null);
   $('b-sound-start').click();await wait(()=>b.player.running);HelloExperiments.selectMode('a');
   assert(!b.player.running&&b.diagnostics().voices===0&&b.diagnostics().inputBindings===0);
   sessionStorage.setItem('b-stage','restoring');location.reload();return;
 }
 assert(JSON.stringify(b.getRecords())===sessionStorage.getItem('b-expected'));
 assert(!b.player.context&&!b.player.running);
 const expected=b.getRecords();b.store.remove(expected[0].id);b.setRecords([]);
 const transfer=new DataTransfer();transfer.items.add(new File([D.serialize([expected[0]])],'one.json',{type:'application/json'}));
 $('b-json-file').files=transfer.files;$('b-json-file').dispatchEvent(new Event('change'));
 await wait(()=>b.getRecords().length===20);
 assert(b.getRecords().every(r=>expected.some(e=>JSON.stringify(e)===JSON.stringify(r))));
 $('b-download').click();
 navigator.sendBeacon('ENDPOINT','PASS B: 20-layer live AudioContext, full 260-event cycle and exact repetition, visual switch, stop, mode cleanup, reload without autoplay, native JSON import/download');
}catch(error){navigator.sendBeacon('ENDPOINT','ERROR '+error.stack);}
});</script>'''

def run(server, protocol):
    reports.clear()
    finished.clear()
    endpoint = f'http://127.0.0.1:{server.server_port}/result'
    markup = (ROOT / 'index.html').read_text(encoding='utf-8').replace('</body>', SCRIPT.replace('ENDPOINT', endpoint) + '</body>')
    with tempfile.NamedTemporaryFile(mode='w', suffix='.html', prefix='.b-check-', dir=ROOT, encoding='utf-8', delete=False) as file:
        file.write(markup)
        fixture = Path(file.name)
    try:
        with tempfile.TemporaryDirectory(prefix='hello-b-test-') as folder:
            profile, downloads = Path(folder) / 'profile', Path(folder) / 'downloads'
            (profile / 'Default').mkdir(parents=True)
            downloads.mkdir()
            preferences = {'download': {'default_directory': str(downloads), 'prompt_for_download': False},
                           'profile': {'default_content_setting_values': {'automatic_downloads': 1}}}
            (profile / 'Default' / 'Preferences').write_text(json.dumps(preferences), encoding='utf-8')
            url = fixture.as_uri() if protocol == 'file' else f'http://127.0.0.1:{server.server_port}/{fixture.name}'
            process = subprocess.Popen([BROWSER, '--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
                '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', '--user-data-dir='+str(profile), url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                if not finished.wait(25):
                    raise RuntimeError(f'{protocol}: B browser timeout')
                if not reports[0].startswith('PASS'):
                    raise RuntimeError(reports[0])
                target = downloads / 'greeting-soundscape.json'
                for _ in range(100):
                    if target.exists() and not list(downloads.glob('*.crdownload')):
                        break
                    time.sleep(.05)
                value = json.loads(target.read_text(encoding='utf-8'))
                assert value['schemaVersion'] == 1 and value['mode'] == 'soundscape-b' and len(value['records']) == 20
                for record in value['records']:
                    assert record['text'] == 'hello stranger' and len(record['relativeTimesMs']) == 14
                    assert record['durationMs'] == record['relativeTimesMs'][-1] and record['source'] == 'example'
                    assert set(record['b']) == {'midi', 'pan', 'startFraction'}
                print(f'[{protocol}] {reports[0]} / actual JSON inspected', flush=True)
            finally:
                process.terminate()
                process.wait(timeout=10)
    finally:
        fixture.unlink()

if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        for protocol in ['http', 'file']:
            run(server, protocol)
    finally:
        server.shutdown()
        server.server_close()
