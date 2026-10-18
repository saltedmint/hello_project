"""Real Chromium DOM events (synthetic IME), live audio, reload and JSON.
Not a physical Korean IME or speaker listening test. Isolated profiles only.
"""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import os
import subprocess
import tempfile
import threading
import time

ROOT=Path(__file__).resolve().parents[1]
BROWSER=os.environ.get('HELLO_TEST_BROWSER',r'C:\Program Files\Google\Chrome\Application\chrome.exe')
finished=threading.Event()
reports=[]
class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        reports.append(self.rfile.read(int(self.headers['Content-Length'])).decode('utf-8'))
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin','*')
        self.end_headers()
        finished.set()
    def log_message(self,*args):pass

SCRIPT=r'''<script>window.addEventListener('load',async()=>{
const $=id=>document.getElementById(id),Q=HelloQuestions,D=HelloQuestionData;
const assert=(value,reason)=>{if(!value)throw Error(reason||'question browser assertion');};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async test=>{for(let i=0;i<1800;i++){if(test())return;await delay(10);}throw Error('timeout / '+$('q-feedback').textContent);};
const type=async char=>{
 const area=$('q-answer'),base=area.value;
 if(/[가-힣]/.test(char)){
   area.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
   area.dispatchEvent(new CompositionEvent('compositionupdate',{data:HelloQuestionMorse.decompose(char)[0],bubbles:true}));
   await delay(35);area.value=base+char;area.setSelectionRange(area.value.length,area.value.length);
   area.dispatchEvent(new InputEvent('input',{inputType:'insertCompositionText',isComposing:true,bubbles:true}));
   area.dispatchEvent(new CompositionEvent('compositionend',{data:char,bubbles:true}));
   area.dispatchEvent(new InputEvent('input',{inputType:'insertText',bubbles:true}));
 }else{
   area.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:char,bubbles:true,cancelable:true}));
   area.value=base+char;area.setSelectionRange(area.value.length,area.value.length);area.dispatchEvent(new InputEvent('input',{inputType:'insertText',data:char,bubbles:true}));
 }
 await delay(35);
};
try{
 $('choose-b').click();HelloTypeExperience.openOperator();
 if(sessionStorage.getItem('q-stage')==='dots-restore'){
   assert(D.serialize(Q.store.getRecords())===sessionStorage.getItem('q-demo-expected'),'demo native reload');
   assert(!Q.player.context&&!Q.player.running,'demo restore without autoplay');
   assert(Q.store.records.length===17&&HelloQuestionDemo.query(Q.store).answers===30,'seed not duplicated on startup');
   $('q-download').click();navigator.sendBeacon('ENDPOINT','PASS questions: Q1/Q2/Q3, synthetic IME, Morse live clock, demo 10/30 idempotent, prior 7 retained, native reload twice without autoplay/reseed, dots mode/filters/stop, native JSON');return;
 }
 if(!sessionStorage.getItem('q-stage')){
   assert(!Q.player.context&&Q.store.records.length===0,'must not autoplay/create context');
   $('q-begin').click();assert(!$('q-intro').hidden,'intro');$('q-intro-start').click();
   for(let index=0;index<3;index++){
     await wait(()=>Q.diagnostics().questionIndex===index&&!$('q-answer').disabled);
     assert(document.activeElement===$('q-answer')&&$('q-results').hidden&&$('q-tools').hidden,'question must focus and hide results');
     await delay(65);for(const char of ['red','감사','hi'][index])await type(char);await delay(90);$('q-submit').click();
   }
   await wait(()=>Q.diagnostics().state==='results');const own=Q.getPending();
   assert(own.answers.map(a=>a.text).join('|')==='red|감사|hi','final text and IME dedup');
   assert(own.answers.every(a=>a.firstActivityMs>50&&a.submittedAtMs-a.lastTextInputMs>70),'first and final silence');
   assert(Q.store.records.length===0,'review must not auto-join');
   $('q-join').click();assert(Q.store.records.length===1,'complete join');
   $('q-load-examples').click();$('q-load-examples').click();assert(Q.store.records.length===7,'six examples once');
   const selected=Q.store.records.find(r=>r.source==='participant');$('q-person').value=selected.id;$('q-person').dispatchEvent(new Event('change'));
   $('q-speed').value='4';$('q-speed').dispatchEvent(new Event('change'));
   const scheduled=[],originalSchedule=Q.player.schedule.bind(Q.player);Q.player.schedule=(event,when,duration)=>{scheduled.push({event,when,duration});originalSchedule(event,when,duration);};
   $('q-own-listen').click();await wait(()=>Q.player.running);
   assert(Q.player.context.state==='running','real AudioContext');const plan=Q.player.plan,startedAt=Q.player.startedAt;
   $('q-axis').value='original';$('q-axis').dispatchEvent(new Event('change'));assert(Q.player.plan===plan,'axis must not restart audio');
   await wait(()=>!Q.player.running);
   assert(scheduled.length===plan.events.length,'every Morse symbol scheduled');
   assert(scheduled.every((s,i)=>Math.abs(s.when-startedAt-plan.events[i].atMs/1000)<.03&&s.duration===plan.events[i].durationMs/1000),'audio clock schedule');
   assert(Q.player.voices.size===0&&Q.diagnostics().frame===null&&Q.player.timer===null,'completion cleanup');
   $('q-play-all').click();await wait(()=>Q.player.running);HelloExperiments.selectMode('a');assert(Q.player.voices.size===0&&!Q.player.running&&Q.diagnostics().inputBindings===0,'mode cleanup');
   sessionStorage.setItem('q-expected',D.serialize(Q.store.getRecords()));sessionStorage.setItem('q-stage','restore');location.reload();return;
 }
 assert(D.serialize(Q.store.getRecords())===sessionStorage.getItem('q-expected'),'native reload');assert(!Q.player.context&&!Q.player.running,'restore without autoplay');assert(Q.diagnostics().state==='waiting','new visitor starts at waiting, not previous results');
 window.confirm=()=>true;$('q-remove-examples').click();assert(Q.store.records.length===1,'remove examples preserves participant');
 const transfer=new DataTransfer();transfer.items.add(new File([D.serialize(HelloQuestionExamples.examples())],'questions.json',{type:'application/json'}));
 $('q-file').files=transfer.files;$('q-file').dispatchEvent(new Event('change'));await wait(()=>Q.store.records.length===7);
 assert(D.serialize(Q.store.getRecords())===sessionStorage.getItem('q-expected'),'native file roundtrip');
 $('q-seed-demo').click();$('q-seed-demo').click();assert(Q.store.records.length===17,'ten seeded once, prior seven retained');
 assert(HelloQuestionDemo.query(Q.store).participants===10&&HelloQuestionDemo.query(Q.store).answers===30,'query batch links');
 const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('change'));};
 change('q-data-filter','actual');assert($('q-board').querySelectorAll('.q-row').length===3,'actual filter');
 change('q-data-filter','demo');assert($('q-board').querySelectorAll('.q-row').length===48,'demo filter includes previous examples');
 const demo=Q.store.records.find(r=>r.demoBatchId);change('q-person',demo.id);change('q-question-selection','Q2');
 $('q-play-all').click();await wait(()=>Q.player.running);change('q-expression','dots');
 assert(!Q.player.running&&Q.player.voices.size===0&&Q.player.timer===null&&Q.diagnostics().frame===null,'expression switch cancels everything');
 assert($('q-person').value===demo.id&&$('q-question-selection').value==='Q2'&&$('q-data-filter').value==='demo','selection preserved');
 $('q-play-all').click();await wait(()=>Q.player.running);const dotPlan=Q.player.plan,answer=demo.answers[1];
 assert(dotPlan.events.length===answer.typingActivities.length&&dotPlan.events.every((e,i)=>e.atMs===answer.typingActivities[i].atMs&&e.durationMs===80),'raw dots timing and count');
 await wait(()=>Q.player.voices.size>0);$('q-stop').click();assert(Q.player.voices.size===0&&Q.player.timer===null&&Q.diagnostics().frame===null,'dot live stop cleanup');
 sessionStorage.setItem('q-demo-expected',D.serialize(Q.store.getRecords()));sessionStorage.setItem('q-stage','dots-restore');location.reload();return;
}catch(error){navigator.sendBeacon('ENDPOINT','ERROR '+error.stack+' / '+$('q-feedback').textContent);}
});</script>'''

def run(server,protocol,timeout=35):
    reports.clear();finished.clear()
    endpoint=f'http://127.0.0.1:{server.server_port}/result'
    markup=(ROOT/'index.html').read_text(encoding='utf-8').replace('</body>',SCRIPT.replace('ENDPOINT',endpoint)+'</body>')
    with tempfile.NamedTemporaryFile(mode='w',suffix='.html',prefix='.questions-check-',dir=ROOT,encoding='utf-8',delete=False) as file:
        file.write(markup);fixture=Path(file.name)
    try:
        with tempfile.TemporaryDirectory(prefix='hello-questions-') as folder:
            profile,downloads=Path(folder)/'profile',Path(folder)/'downloads';(profile/'Default').mkdir(parents=True);downloads.mkdir()
            preferences={'download':{'default_directory':str(downloads),'prompt_for_download':False},'profile':{'default_content_setting_values':{'automatic_downloads':1}}}
            (profile/'Default'/'Preferences').write_text(json.dumps(preferences),encoding='utf-8')
            url=fixture.as_uri() if protocol=='file' else f'http://127.0.0.1:{server.server_port}/{fixture.name}'
            process=subprocess.Popen([BROWSER,'--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0','--autoplay-policy=no-user-gesture-required','--window-size=1440,1000','--user-data-dir='+str(profile),url],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            try:
                if not finished.wait(timeout):raise RuntimeError(f'{protocol}: question browser timeout')
                if not reports[0].startswith('PASS'):raise RuntimeError(reports[0])
                target=downloads/'three-questions-v2.json'
                for _ in range(100):
                    if target.exists() and not list(downloads.glob('*.crdownload')):break
                    time.sleep(.05)
                value=json.loads(target.read_text(encoding='utf-8'))
                assert value['schemaVersion']==2 and value['kind']=='three-questions-collection' and len(value['records'])==17
                assert sum(p['source']=='synthetic' for p in value['records'])==16
                demos=[p for p in value['records'] if p.get('demoBatchId')=='presentation-10-v1']
                assert len(demos)==10 and sum(len(p['answers']) for p in demos)==30
                assert all(p['isDemo'] and all(a['recordingVersion']=='dom-typing-v2' and len(a['typingActivities'])>0 for a in p['answers']) for p in demos)
                actual=next(p for p in value['records'] if p['source']=='participant')
                assert [a['text'] for a in actual['answers']]==['red','감사','hi']
                for participant in value['records']:
                    assert len(participant['answers'])==3
                    for answer in participant['answers']:
                        assert ''.join(c['char'] for c in answer['characters'])==answer['text']
                        assert answer['firstActivityMs']>=0 and answer['submittedAtMs']>=answer['lastTextInputMs']
                        assert answer['morse']['durationMs']>=answer['submittedAtMs'] and answer['recordingVersion'] in ('dom-composition-v1','dom-typing-v2')
                print(f'[{protocol}] {reports[0]} / downloaded v2 JSON inspected',flush=True)
            finally:process.terminate();process.wait(timeout=10)
    finally:fixture.unlink()

if __name__=='__main__':
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        for protocol in ['http','file']:run(server,protocol)
    finally:server.shutdown();server.server_close()
