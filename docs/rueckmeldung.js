/* ============================================================
   Rückmeldung sammeln — die Abgabe ohne Ton

   NEU (Rikes Auftrag, 2026-08-22). Sie beschreibt es so:

     «Ein Feld aufploppt, in das man eintippen kann oder mit der Maus
      oder dem Stift reinschreiben kann. Und dort sollen Vorschlaege,
      Anmerkungen und Aehnliches stehen.»

   Und zum Bau:

     «Ob wir das nicht in einer sehr einfachen Variante uebernehmen
      koennen fuer die Rueckmeldung, weil es eigentlich alles schon
      gebaut ist und sogar einfacher ist, weil wir keine Tonaufnahme
      haben.»

   Genau das ist dieses Modul: dieselbe Abgabe wie aufnahme.js, aber
   ohne Mikrofon, ohne Ereignis-Log und ohne Klassenlogik. Der
   Zip-Schreiber und der Weg zur Ablage stehen gemeinsam in paket.js.

   Es loest die frueheren notiz.js ab, deren Zeichenflaeche es
   uebernimmt. Neu dazu: Bild hochladen, Name, und die Abgabe.

   ------------------------------------------------------------
   WARUM SCHRIFTLICH UND NICHT MUENDLICH
   ------------------------------------------------------------
   Das ist keine Bequemlichkeit, sondern die Herkunftsregel -
   AGENTS.md 15 und agent/16_herkunft.md. Rike:

     «Wenn ich's nur muendlich bekomme, dann muss ich alles dir auch
      direkt weitergeben. Aber wenn wir's direkt schriftlich haben oder
      als Bild, dann kann ich dir das direkt geben, ohne dass ich's noch
      mal selber umformuliere. Ziel waere ja wirklich, dass wir auch
      genau sehen, wer hat was beigetragen. Wenn ich Sachen lese und dir
      dann noch mal nenne, dann kommt ja meine Interpretation noch mit
      rein.»

   Die geschriebene Notiz haelt den Beitrag UNVERMITTELT. Ein Umweg
   ueber Rikes Ohr und ihre Formulierung wuerde die Grenze zwischen
   Anstoss und Ausarbeitung verwischen - und genau die soll scharf
   bleiben. Darum drei schriftliche Wege und kein Mikrofon.

   ------------------------------------------------------------
   WAS AN JEDER NOTIZ HAENGT (Rikes Vorgabe)
   ------------------------------------------------------------
     - die Flaeche, immer
     - Kapitel und Etappe, wo es gestaffelte gibt
     - WER geschrieben hat: «sie muessen auch, wenn sie da reingehen,
       ihren Namen eingeben, und das protokollieren»

   KEINE Karten-ID. Rikes Einwand: «Sie kennen ja die Karten-IDs nicht,
   sondern sie werden das anders beschreiben.» Der Anker ist die
   Flaeche, nicht die Karte.

   ------------------------------------------------------------
   WANN ABGEGEBEN WIRD
   ------------------------------------------------------------
     Daten und Zufall   er wandert von Etappe zu Etappe und notiert
                        unterwegs; alles wird gemerkt und geht AM STUECK
                        pro Aufgabe raus
     SORT               eine Sortierflaeche, eine Abgabe

   Beides faellt hier zusammen: Gesammelt wird ueber die ganze Seite,
   abgegeben wird einmal. Der Unterschied liegt allein darin, wie viele
   Etappen eine Seite hat. Jede gemerkte Notiz traegt ihren Ort mit -
   deshalb bleibt beim Wandern nachvollziehbar, wo was gilt.

   Alles ueberlebt ein Neuladen (localStorage). Wer die Seite
   versehentlich schliesst, verliert nichts.

   Zum blossen Anschauen haengt ?ansehen das Modul aus - wie bei der
   Aufnahme.
   ============================================================ */
(function(){
'use strict';

/* WANN DIE LEISTE ERSCHEINT - und das ist der Punkt, an dem sich
   Rueckmeldung und Aufnahme genau umgekehrt verhalten.

   `?ansehen` haengt bei aufnahme.js das Modul AUS. Es ist der Link, den
   die Teamseite benutzt: «Zum Pruefen der Kaertchen. Es wird nichts
   aufgezeichnet und nichts gespeichert.» Also genau der Weg, auf dem
   Maurus, Lucia und die Lehrpersonen die Flaechen ansehen.

   Damit ist `?ansehen` der ORT DER RUECKMELDUNG, und hier schaltet es
   das Modul entsprechend EIN. Rikes Bild:

     «Die Versionen, die im Moment noch ohne Aufnahme starten, laufen
      fuer die Lehrer und fuer Maurus. Dass die halt doch mit einer
      Aufnahme starten, aber mit einer, wo sie am Ende direkt noch eine
      Rueckmeldung abgeben.»

   Daraus ergibt sich von selbst, was sie mit «bitte ohne» meinte: Es
   sind zwei Links. Wer nur sortieren will, nimmt den Klassenlink; wer
   pruefen will, den mit ?ansehen. Niemand muss ein Startfeld wegklicken.

     ?ansehen      Rueckmeldung an, Aufnahme aus     Team, Lehrpersonen
     ?k=<klasse>   Aufnahme an, Rueckmeldung aus     Klassen
     ohne beides   nach `immer` in den Einstellungen oeffentliche Seiten
*/
const ANSEHEN = new URLSearchParams(location.search).has('ansehen');

const P = window.SORT_PAKET;

/* ---------- Einstellungen ---------- */
const CFG = Object.assign({
  /* WebDAV-Adresse der Ablage. null = nur herunterladen.
     SWITCHdrive: 'https://drive.switch.ch/public.php/webdav'

     PRUEFEN (2026-08-22): Rike legt einen oeffentlichen Abgabelink an -
     «Ich schick dir einen oeffentlichen Abgabelink fuer genau diese
     Rueckmeldungen.» Bis er da ist, steht hier null und die Seite laedt
     die Datei herunter, statt sie abzugeben. Das ist ein gueltiger
     Zustand und keine halbe Sache: Lieber eine Datei in der Hand als
     ein Upload ins Leere. Wenn der Link kommt, ist es EINE Zeile in
     projekt.py - sonst aendert sich nichts. */
  abgabe: null,
  schluessel: '',        // der Teil hinter /s/ aus dem Freigabelink
  /* Der Freigabelink zum Anschauen - er wird im Abgabefenster als Knopf
     angeboten, falls der direkte Upload nicht geht. Zwei verschiedene
     Dinge: `abgabe` ist die WebDAV-Adresse fuer die Maschine, `ablage`
     die Seite fuer den Menschen. */
  ablage: null,
  projekt: 'kasper',     // steht im Dateinamen, trennt SORT von DZ
  /* true: die Leiste steht immer da, auch ohne ?ansehen. So laufen die
     Reflexionen und die Festigung - dort GIBT es keine Klassenlinks,
     die Seite ist ohnehin die Pruefansicht. */
  immer: false,
  /* SAMMELN - der Unterschied zwischen den beiden Welten, und Rike hat
     ihn scharf benannt (2026-08-23):

       «Bei Daten und Zufall haben wir nicht nur eine Sortierflaeche,
        sondern mehrere Etappen. Waer's cool, wenn man pro Etappe
        Notizen aufschreibt, sich die merkt, die Etappe wechselt, auch
        wieder Sachen aufschreibt - und erst ganz am Ende abgibt.»

       «Das braucht eigentlich nur Maurus, das brauchen die anderen
        nicht, weil wir dort ja immer nur eine Sortierflaeche haben.»

     true   Reflexionen: «Notiz merken» sammelt ueber die Etappen
     false  SORT: eine Flaeche, eine Notiz, direkt abgeben - der
            Merkknopf erscheint gar nicht erst. Ein Knopf, den man
            nicht braucht, ist kein Angebot, sondern eine Frage. */
  sammeln: false
}, window.KASPER_RUECKMELDUNG || {});

if (!ANSEHEN && !CFG.immer) return;

const ORT = 'kasper-rueck-' + location.pathname;

/* ---------- Zustand ----------
   notizen: [{ort, text, bild, zeit}] - `bild` ist eine data-URL aus der
   Zeichenflaeche oder aus einer hochgeladenen Datei, oder null. */
let S = { wer: '', notizen: [], entwurf: '', zeichnung: null };
try { S = Object.assign(S, JSON.parse(localStorage.getItem(ORT) || '{}')); }
catch(e){}

let uhr = null;
function merken(still){
  clearTimeout(uhr);
  uhr = setTimeout(() => {
    try { localStorage.setItem(ORT, JSON.stringify(S)); } catch(e){}
    if (!still) zeigen('gemerkt');
  }, 400);
}

/* ---------- Werkzeuge ---------- */
function el(tag, klasse, text){
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}

/* Wo gilt diese Notiz? Aus dem, was die Seite gerade ZEIGT - nicht aus
   einer Zahl, die jemand eintippen muesste.

   Die Selektoren decken beide Welten ab: Die Reflexionen tragen den Ort
   in der Auftragszeile (.titel), die Festigung oben rechts (#wostehe),
   die SORT-Flaechen in ihrer Ueberschrift. Findet sich keiner, bleibt
   der Seitentitel - der ist immer da. */
function wo(){
  const teile = [document.title];
  ['#wostehe', '.auftrag .titel', '.titel', '.auftrag h1', 'h1'].forEach(w => {
    const e = document.querySelector(w);
    const t = e && e.textContent.trim().replace(/\s+/g, ' ');
    if (t && teile.indexOf(t) < 0) teile.push(t);
  });
  return teile.join(' · ');
}

function zeitstempel(){
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth()+1) + '-' + z(d.getDate())
       + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
}

/* ============================================================
   Das Aussehen - im Modul, nicht in einem Stylesheet

   Bewusst so: Die Leiste soll in BEIDEN Welten gleich aussehen, und
   SORT und «Daten und Zufall» haben verschiedene Stylesheets mit
   verschiedenen Variablen. Ein gemeinsames .css muesste in beide
   Bauwege eingehaengt werden und koennte in einem davon vergessen
   werden - dann stuende die Leiste da und waere unbrauchbar, ohne dass
   irgendetwas eine Meldung gaebe.

   Die Variablen werden mit Rueckfallwert gelesen: `var(--tinte, #2d2924)`.
   Wo es sie gibt, fuegt sich die Leiste ein; wo nicht, sieht sie
   trotzdem richtig aus. Rikes Vorgabe war «was am einfachsten und
   stabilsten ist».
   ============================================================ */
const STIL = `
/* ── Der Öffner in der Kopfzeile ──────────────────────────────
   Das EINZIGE, was im Ruhezustand von der Rückmeldung zu sehen ist.
   Er sitzt in der Kopfzeile, wo keine Karte liegt. */
.rueckoeffner{display:inline-flex;align-items:center;gap:6px;
  font:600 13px var(--druck,'Fira Sans','Segoe UI',sans-serif);
  padding:5px 12px;border-radius:999px;cursor:pointer;
  border:1px solid var(--akzent,#9867A5);background:transparent;
  color:var(--akzent,#9867A5);white-space:nowrap}
.rueckoeffner:hover{background:var(--akzent,#9867A5);color:#fff}
.rueckoeffner.an{background:var(--akzent,#9867A5);color:#fff}
.rueckoeffner.imkopf{margin-left:auto}
.rueckoeffner.freistehend{position:fixed;top:10px;right:12px;z-index:100000;
  background:var(--karte,#fffefb);box-shadow:0 2px 8px rgba(0,0,0,.18)}
.rueckoeffner .rueckzahl:empty{display:none}
.rueckoeffner .rueckzahl{background:currentColor;color:transparent;
  border-radius:999px;padding:0 6px;font-size:11px;position:relative}
.rueckoeffner .rueckzahl::after{content:attr(data-n);position:absolute;
  inset:0;display:grid;place-items:center;color:var(--karte,#fffefb)}
.rueckoeffner.an .rueckzahl::after{color:var(--akzent,#9867A5)}

/* ── Die Tafel ────────────────────────────────────────────────
   Rechts, über die volle Höhe, GESCHLOSSEN ganz draussen. Sie nimmt
   der Fläche keinen Platz weg - weder Platz noch Klickbarkeit. */
.rueckleiste{position:fixed;top:0;right:0;bottom:0;z-index:100001;
  width:min(400px,94vw);display:flex;flex-direction:column;
  background:var(--karte,#fffefb);color:var(--tinte,#2d2924);
  border-left:2px solid var(--akzent,#9867A5);
  box-shadow:-6px 0 28px rgba(45,41,36,.18);
  font:14px var(--druck,'Fira Sans','Segoe UI',sans-serif);
  transform:translateX(100%);transition:transform .18s ease-out;
  visibility:hidden}
.rueckleiste.offen{transform:translateX(0);visibility:visible}
.rueckgriff{display:flex;align-items:center;gap:6px;flex:0 0 auto;
  padding:10px 14px;border-bottom:1px solid var(--linie,#e4d9c7);
  font-size:13.5px;background:var(--creme,#f6ecdf)}
.rueckgriff .stift{color:var(--akzent,#9867A5);font-size:15px}
.rueckgriff .zart{color:var(--matt,#6c6357);font-size:12.5px}
.rueckzu{margin-left:auto;border:none;background:none;font-size:22px;
  line-height:1;color:var(--matt,#6c6357);cursor:pointer;padding:0 4px;
  border-radius:6px}
.rueckzu:hover{background:var(--karte,#fffefb);color:var(--tinte,#2d2924)}
/* Der rollende Teil. Er ist selbst eine Spalte, damit Schreibfeld und
   Zeichenfläche den freien Platz UNTER sich aufteilen können - vorher
   stand die untere Hälfte der Tafel leer.

   min-height:0 ist nötig, sonst weigert sich ein Flex-Kind, unter
   seine Inhaltshöhe zu schrumpfen, und der Rollbalken erscheint nie.

   ACHTUNG: Dieser Block steht in einem Template-Literal. Rückwärts-
   Anführungszeichen beenden es - auch im Kommentar. Genau daran ist
   dieser Kommentar beim Schreiben einmal zerbrochen. */
.rueckinhalt{flex:1 1 auto;overflow-y:auto;padding:12px 14px 14px;
  display:flex;flex-direction:column;gap:8px;min-height:0}
.rueckkopf{flex:0 0 auto;display:flex;gap:6px;align-items:flex-start;
  flex-wrap:wrap}
.rueckkopf label{font-size:12px;color:var(--matt,#6c6357);
  display:flex;align-items:center;gap:6px;flex:1 1 100%}
.rueckwer{font:inherit;font-size:13px;padding:5px 9px;border-radius:7px;
  border:1px solid var(--linie,#e4d9c7);background:#fff;
  color:var(--tinte,#2d2924);flex:1 1 auto;min-width:0}
.rueckwer:focus{outline:none;border-color:var(--akzent,#9867A5)}
.rueckwo{font-size:12px;color:var(--matt,#6c6357);flex:1 1 100%;
  line-height:1.35}
/* Schreibfeld und Zeichenfläche teilen sich den Platz: ein Drittel
   tippen, zwei Drittel von Hand. Die Mindesthöhen sorgen dafür, dass
   auf einem kurzen Fenster gerollt wird, statt beides plattzudrücken. */
.ruecktext{width:100%;flex:1 1 0;min-height:110px;box-sizing:border-box;
  font:14px var(--druck,'Fira Sans',sans-serif);padding:8px 10px;
  border:1px solid var(--linie,#e4d9c7);border-radius:8px;background:#fff;
  color:var(--tinte,#2d2924);resize:none}
.ruecktext:focus{outline:none;border-color:var(--akzent,#9867A5)}
.rueckmalen{position:relative;flex:2 1 0;min-height:200px;display:flex}
/* LARS' Falle (FUERKASPERleisterechts.md): Ein <canvas> ist ein
   ERSATZELEMENT. Width und Height gehoeren ausdruecklich in die CSS,
   sonst nimmt es seine Eigengroesse aus den Attributen - die stehen in
   Geraetepunkten, und der Stift setzt dann nicht dort an, wo die Maus
   ist. Hier stand es schon richtig; es bleibt so und mit Begruendung. */
.rueckblatt{display:block;flex:1 1 auto;width:100%;height:100%;
  background:#fff;border:1px dashed var(--akzent,#9867A5);
  border-radius:8px;cursor:crosshair;touch-action:none}
.rueckhinweis{position:absolute;left:10px;top:6px;font-size:12px;
  color:var(--matt,#6c6357);pointer-events:none}
.rueckbilder{flex:0 0 auto;display:flex;gap:8px;flex-wrap:wrap}
.rueckbilder:empty{display:none}
.rueckbild{position:relative;display:inline-block}
.rueckbild img{height:64px;border-radius:6px;
  border:1px solid var(--linie,#e4d9c7);display:block}
.rueckbild button{position:absolute;top:-6px;right:-6px;width:19px;height:19px;
  border-radius:50%;border:1px solid var(--linie,#e4d9c7);background:#fff;
  color:var(--matt,#6c6357);font-size:13px;line-height:1;cursor:pointer;padding:0}
/* Die Knopfreihe sitzt AUSSERHALB des rollenden Teils, ganz unten.
   Sie ist damit immer erreichbar - man muss nicht erst ans Ende
   rollen, um abzugeben. */
.rueckknoepfe{flex:0 0 auto;display:flex;gap:8px;align-items:center;
  flex-wrap:wrap;padding:10px 14px;border-top:1px solid var(--linie,#e4d9c7);
  background:var(--creme,#f6ecdf)}
.rueckknoepfe button,.ruecklade{font:inherit;font-size:13px;padding:6px 12px;
  border-radius:8px;border:1px solid var(--linie,#e4d9c7);
  background:var(--karte,#fffefb);color:var(--tinte,#2d2924);cursor:pointer}
.rueckknoepfe button:hover,.ruecklade:hover{border-color:var(--akzent,#9867A5);
  color:var(--akzent,#9867A5)}
.rueckstand{font-size:12px;color:#2E7D32;flex:1 1 100%;order:9}
.rueckhalten{font-weight:600}
.rueckgeben{background:var(--akzent,#9867A5) !important;color:#fff !important;
  border-color:var(--akzent,#9867A5) !important;font-weight:600;
  flex:1 1 auto}
.rueckliste{flex:0 0 auto;margin-top:2px;font-size:12.5px}
.rueckliste:empty{display:none}
.rueckliste > b{color:var(--akzent,#9867A5)}
.rueckzeile{display:flex;gap:6px;align-items:baseline;padding:4px 0;
  border-top:1px solid var(--linie,#e4d9c7)}
.rueckzeile .nr{background:var(--akzent,#9867A5);color:#fff;border-radius:4px;
  padding:0 6px;font-size:11px;font-weight:600;flex:0 0 auto}
.rueckzeile .wo{color:var(--matt,#6c6357);flex:0 1 100px;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.rueckzeile .was{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap}
.rueckzeile button{border:none;background:none;color:var(--matt,#6c6357);
  cursor:pointer;font-size:14px;padding:0 4px}

/* ── Das Abgabefenster ───────────────────────────────────────── */
.rueckfenster{position:fixed;inset:0;z-index:100002;display:grid;
  place-items:center;background:rgba(45,41,36,.55);padding:20px;
  font:14px var(--druck,'Fira Sans','Segoe UI',sans-serif)}
.rueckfensterkarte{position:relative;background:var(--karte,#fffefb);
  color:var(--tinte,#2d2924);border-radius:14px;padding:26px 28px;
  max-width:440px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.3);
  text-align:left}
.rueckfensterkarte .rueckzu{position:absolute;top:10px;right:12px;
  margin-left:0}
.rueckfensterkarte .augen{font-size:12px;text-transform:uppercase;
  letter-spacing:.07em;color:var(--akzent,#9867A5);margin:0 0 4px}
.rueckfensterkarte h2{margin:0 0 12px;font-size:19px;line-height:1.3}
.rueckklein{margin:0 0 4px;font-size:12px;color:var(--matt,#6c6357)}
.rueckdatei{margin:0 0 14px;padding:9px 12px;border-radius:8px;
  background:var(--creme,#f6ecdf);font-size:13px;word-break:break-all}
.rueckdatei span{color:var(--matt,#6c6357)}
.rueckhinweistext{margin:0 0 16px;line-height:1.45;
  color:var(--matt,#6c6357);font-size:13.5px}
.rueckknopf{display:inline-block;font:inherit;font-size:14px;margin-top:2px;
  padding:9px 16px;border-radius:9px;border:1px solid var(--linie,#e4d9c7);
  background:var(--karte,#fffefb);color:var(--tinte,#2d2924);cursor:pointer;
  text-decoration:none}
.rueckknopf.gross{background:var(--akzent,#9867A5);color:#fff;
  border-color:var(--akzent,#9867A5);font-weight:600}
.rueckknopf:hover{border-color:var(--akzent,#9867A5)}

@media (max-width:640px){
  .rueckleiste{width:100vw}
  .rueckoeffner .wort{display:none}
}
`;
const stilKnoten = document.createElement('style');
stilKnoten.textContent = STIL;
document.head.appendChild(stilKnoten);

/* ============================================================
   Die Leiste
   ============================================================ */
const leiste = el('div', 'rueckleiste');
leiste.innerHTML =
    /* Der Kopf der Tafel. Der Umschalter sitzt seit dem 2026-08-24
       NICHT mehr hier, sondern als einzelner Knopf in der Kopfzeile
       der Seite - siehe knopfEinhaengen(). */
    '<div class="rueckgriff">'
  + '<span class="stift">✎</span> Rückmeldung'
  + '<span class="zart rueckwink"> — was würden Sie hier anpassen?</span>'
  + '<button class="rueckzu" type="button" title="Schliessen">×</button></div>'
  + '<div class="rueckinhalt">'
  + '  <div class="rueckkopf">'
  + '    <label>Ihr Name<input class="rueckwer" type="text" autocomplete="off"'
  + '      placeholder="Vor- und Nachname"></label>'
  + '    <span class="rueckwo"></span>'
  + '  </div>'
  + '  <textarea class="ruecktext" spellcheck="false"'
  + '    placeholder="Tippen: Was stört, und wie schlimm — Kleinigkeit, stört,'
  + ' geht so nicht."></textarea>'
  + '  <div class="rueckmalen">'
  + '    <canvas class="rueckblatt"></canvas>'
  + '    <div class="rueckhinweis">Oder von Hand: hier zeichnen und schreiben.</div>'
  + '  </div>'
  + '  <div class="rueckbilder"></div>'
  + '  <div class="rueckliste"></div>'
  + '</div>'
  /* NEU (Rikes Befund, 2026-08-23): «Notiz merken» stand ganz LINKS,
     «Rückmeldung abgeben» ganz RECHTS - die beiden Schritte, die
     zusammengehören, so weit auseinander wie möglich.

     Ihre Beobachtung an sich selbst: «Ich hätte, ohne dass mir jemand
     erklärt, wie es funktioniert, sofort nach der ersten Notiz auf
     Rückmeldung abgeben geklickt und nicht kapiert, dass ich die
     mehreren merken muss, um dann abzugeben.»

     Jetzt liegen sie nebeneinander, und in der Reihenfolge, in der man
     sie braucht: merken · merken · merken - abgeben. Links bleibt, was
     zum SCHREIBEN gehört; rechts, was mit dem Ergebnis geschieht.

     GEAENDERT (Rikes Befund, 2026-08-24): Die Knopfreihe steht jetzt
     GANZ UNTEN und AUSSERHALB des rollenden Teils. «Das Notizmerken und
     gesammelte Rückmeldung abgeben kann eigentlich ganz unten stehen,
     genauso wie Bild hinzufügen oder Zeichnung löschen, sodass dann
     einfach ein größeres Freischreibfeld ist.»

     Damit bleiben die Knöpfe immer erreichbar, egal wie weit oben man
     gerade schreibt - und der ganze übrige Platz gehört dem Schreiben
     und Zeichnen. */
  + '  <div class="rueckknoepfe">'
  + '    <label class="ruecklade">Bild hinzufügen'
  + '      <input type="file" accept="image/*" hidden></label>'
  + '    <button type="button" class="rueckleeren leer">Zeichnung löschen</button>'
  + '    <span class="rueckstand"></span>'
  + (CFG.sammeln
     ? '    <button type="button" class="rueckhalten">Notiz merken</button>'
     : '')
  + '    <button type="button" class="rueckgeben">'
  + (CFG.sammeln ? 'Gesammelte Rückmeldung abgeben' : 'Rückmeldung abgeben')
  + '</button>'
  + '  </div>';
document.body.appendChild(leiste);

const werF   = leiste.querySelector('.rueckwer');
const woFeld = leiste.querySelector('.rueckwo');
const text   = leiste.querySelector('.ruecktext');
const blatt  = leiste.querySelector('.rueckblatt');
const stand  = leiste.querySelector('.rueckstand');
const bilder = leiste.querySelector('.rueckbilder');
const liste  = leiste.querySelector('.rueckliste');
const datei  = leiste.querySelector('.ruecklade input');

function zeigen(was){
  stand.textContent = was;
  if (was) setTimeout(() => { if (stand.textContent === was) stand.textContent = ''; }, 1800);
}

woFeld.textContent = wo();

/* FEHLERBEHOBEN (2026-08-23, Rikes Befund «die Seite laedt in
   Zeitlupentempo»): Hier stand ein MutationObserver auf dem GANZEN
   <body>, mit subtree und characterData. Er sollte den Ort nachfuehren,
   wenn die Etappe wechselt.

   Der Preis war ruinoes. Jede einzelne DOM-Aenderung rief wo() auf, und
   wo() macht FUENF querySelector ueber das ganze Dokument. Eine
   Sortierflaeche baut Hunderte von Karten und schiebt sie beim Ziehen
   staendig herum - das sind Tausende Aenderungen mal fuenf Suchlaeufe.
   Die Seite kam nicht mehr hinterher: Sie lud bis etwa einem Drittel
   und kroch dann.

   Der Fehler stammt aus notiz.js, von wo diese Datei die Zeichenflaeche
   uebernommen hat; ich habe ihn mit auf die SORT-Flaechen getragen.

   RICHTIG IST, den Ort dann zu holen, WENN ER GEBRAUCHT WIRD:
     - beim Aufklappen, fuer die Anzeige
     - beim Merken einer Notiz - und das tut halten() ohnehin selbst,
       es ruft wo() im Moment des Speicherns auf. Die RICHTIGKEIT der
       gespeicherten Angabe hing also nie am Beobachter.
   Solange die Leiste zu ist - also die ganze Zeit, in der sortiert
   wird - kostet das gar nichts.

   Waehrend sie offen steht, laeuft ein leichter Takt mit: Wer beim
   Schreiben die Etappe wechselt, soll nicht auf einen alten Ort sehen.
   Einmal pro Sekunde, und nur dann. */
let ortTakt = null;
function ortVerfolgen(an){
  clearInterval(ortTakt);
  ortTakt = null;
  if (!an) return;
  woFeld.textContent = wo();
  ortTakt = setInterval(() => { woFeld.textContent = wo(); }, 1000);
}

werF.value = S.wer || '';
werF.addEventListener('input', () => { S.wer = werF.value.trim(); merken(); });
text.value = S.entwurf || '';
text.addEventListener('input', () => { S.entwurf = text.value; merken(); });

/* ============================================================
   Der Umschalter sitzt in der KOPFZEILE, nicht auf der Flaeche

   FEHLERBEHOBEN (Rikes Befund, 2026-08-24): «Durch diese
   Rueckmeldeleiste ist unten immer ein Stueck von der Sortierflaeche
   ueberschrieben. Bei der ersten Etappe von der Kombinatorik fuehrt das
   zu einem Problem, weil dadurch die Buttons ueberdeckt sind, mit denen
   man die Kaertchen ueberhaupt erst auslegt.»

   Eine fest sitzende Leiste am unteren Rand nimmt der Flaeche DAUERND
   Platz weg - auch wenn niemand etwas schreibt. Und was darunter
   geraet, ist nicht bloss schlecht zu sehen, sondern nicht mehr
   anklickbar.

   Rikes Loesung, und sie ist besser als der Zwischenweg:

     «Wir koennten es so bauen, dass es einfach nur ein einzelner Button
      ist. Oben rechts, weil dort ja der Kopf der ganzen
      Sortieraktivitaet ist und damit keine wichtigen Sachen fuer die
      Sortieraktivitaet. Und wenn man auf diesen Button klickt, dann
      oeffnet sich der Rueckmeldeteil. Sie soll nur dann sichtbar sein,
      wenn ich sie anschalte, und nur dieser eine Button ueberdeckt dann
      die Sortierflaeche.»

   LARS hat dasselbe Problem mit einem Streifen am rechten Rand geloest,
   der immer 52 px breit stehen bleibt, und hat es fuer Kasper
   aufgeschrieben (FUERKASPERleisterechts.md, 2026-08-24). Sein Weg
   funktioniert - aber er kostet dauerhaft 52 px, und die Seite muss
   ihm ausweichen («der Teil, der wehtut»). Rikes Weg kostet NICHTS:
   Geschlossen ist gar nichts da ausser einem Knopf, der ohnehin in
   einer Kopfzeile sitzt, wo keine Karte liegt.

   Uebernommen habe ich von LARS die Falle mit dem <canvas> - dort
   steckt eines drin.
   ============================================================ */
function knopfEinhaengen(){
  const k = el('button', 'rueckoeffner');
  k.type = 'button';
  k.innerHTML = '<span class="stift">✎</span><span class="wort">Rückmeldung</span>'
              + '<span class="rueckzahl"></span>';
  k.title = 'Rückmeldung schreiben';
  k.onclick = () => zeigenTafel(!leiste.classList.contains('offen'));

  // In die Kopfzeile, wenn es eine gibt - dort liegt keine Karte. Alle
  // drei Seitenarten haben eine: die Reflexionen, die Festigung und die
  // SORT-Flaechen. Sonst haengt er sich oben rechts ans Fenster; dann
  // ist er das einzige, was ueberdeckt.
  const kopf = document.querySelector('header');
  if (kopf){ kopf.appendChild(k); k.classList.add('imkopf'); }
  else { document.body.appendChild(k); k.classList.add('freistehend'); }
  return k;
}
const oeffner = knopfEinhaengen();
const wink = leiste.querySelector('.rueckwink');

function zeigenTafel(offen){
  leiste.classList.toggle('offen', offen);
  oeffner.classList.toggle('an', offen);
  wink.textContent = offen ? ' — Ihre Notiz zu dieser Stelle'
                           : ' — was würden Sie hier anpassen?';
  ortVerfolgen(offen);
  if (offen){ blattGroesse(); werF.focus(); }
}

leiste.querySelector('.rueckzu').onclick = () => zeigenTafel(false);

/* Escape schiebt sie weg - nuetzlich, wenn jemand mitten im Schreiben
   wieder auf die Flaeche sehen will. Von LARS uebernommen. */
addEventListener('keydown', e => {
  if (e.key === 'Escape' && leiste.classList.contains('offen')) zeigenTafel(false);
});

/* ---------- die Zeichenfläche ----------
   Uebernommen aus notiz.js, unveraendert bewaehrt. */
const stift = blatt.getContext('2d');
let malt = false, letzte = null;

function blattGroesse(){
  // Die Zeichnung ginge beim Groesseaendern verloren - erst sichern,
  // dann neu aufspannen, dann zurueckmalen.
  const alt = blatt.width ? blatt.toDataURL() : null;
  const b = blatt.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  blatt.width  = Math.max(1, Math.round(b.width  * dpr));
  blatt.height = Math.max(1, Math.round(b.height * dpr));
  stift.setTransform(dpr, 0, 0, dpr, 0, 0);
  stift.lineCap = 'round'; stift.lineJoin = 'round';
  stift.lineWidth = 2; stift.strokeStyle = '#2d2924';
  const quelle = alt || S.zeichnung;
  if (quelle){
    const im = new Image();
    im.onload = () => stift.drawImage(im, 0, 0, b.width, b.height);
    im.src = quelle;
  }
}

const punkt = e => {
  const r = blatt.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};
blatt.addEventListener('pointerdown', e => {
  malt = true; letzte = punkt(e); blatt.setPointerCapture(e.pointerId);
  e.preventDefault();
});
blatt.addEventListener('pointermove', e => {
  if (!malt) return;
  const p = punkt(e);
  stift.beginPath(); stift.moveTo(letzte[0], letzte[1]);
  stift.lineTo(p[0], p[1]); stift.stroke();
  letzte = p;
});
['pointerup','pointercancel'].forEach(t =>
  blatt.addEventListener(t, () => {
    if (!malt) return;
    malt = false;
    try { S.zeichnung = blatt.toDataURL(); } catch(e){}
    merken();
  }));

leiste.querySelector('.rueckleeren').onclick = () => {
  stift.clearRect(0, 0, blatt.width, blatt.height);
  S.zeichnung = null; merken();
};

/* ---------- Bild hinzufügen ----------
   Rikes dritter Weg neben Tippen und Schreiben. Ein Bildschirmfoto ist
   oft die schnellste Rueckmeldung: draufzeigen statt beschreiben.

   Es wird verkleinert, bevor es in den Zustand geht - ein Foto vom
   Handy hat leicht 4 MB, und localStorage fasst rund 5. Ohne das
   Verkleinern waere die erste Notiz auch die letzte. 1400 px lange
   Kante reicht, um einen Bildschirm lesbar zu halten. */
let angehaengt = [];

function verkleinern(f){
  return new Promise(fertig => {
    const leser = new FileReader();
    leser.onload = () => {
      const im = new Image();
      im.onload = () => {
        const max = 1400;
        const s = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width  = Math.round(im.width  * s);
        c.height = Math.round(im.height * s);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        fertig(c.toDataURL('image/jpeg', 0.82));
      };
      im.onerror = () => fertig(null);
      im.src = leser.result;
    };
    leser.onerror = () => fertig(null);
    leser.readAsDataURL(f);
  });
}

datei.addEventListener('change', async () => {
  const f = datei.files && datei.files[0];
  if (!f) return;
  zeigen('Bild wird vorbereitet …');
  const d = await verkleinern(f);
  datei.value = '';
  if (!d){ zeigen('Das Bild liess sich nicht lesen.'); return; }
  angehaengt.push(d);
  bilderZeigen();
  zeigen('Bild angehängt');
});

function bilderZeigen(){
  bilder.innerHTML = '';
  angehaengt.forEach((d, i) => {
    const k = el('span', 'rueckbild');
    const im = new Image(); im.src = d; k.appendChild(im);
    const weg = el('button', null, '×');
    weg.title = 'Bild entfernen';
    weg.onclick = () => { angehaengt.splice(i, 1); bilderZeigen(); };
    k.appendChild(weg);
    bilder.appendChild(k);
  });
}

/* ---------- eine Notiz merken ---------- */
/* `still` unterdrueckt die Meldung «Notiz N gemerkt». Gebraucht wird
   das beim Abgeben ohne Sammeln: Dort ist das Merken ein interner
   Zwischenschritt, kein eigener Vorgang - und eine Meldung darueber
   sieht aus, als waere das schon alles gewesen.

   FEHLERBEHOBEN (Rikes Befund, 2026-08-23): «Wenn ich eine Notiz
   schreibe und auf abgeben klicke, dann heisst es immer erst mal nur
   gemerkt, und ich muss dann noch mal draufklicken.» Genau so sah es
   aus - abgegeben wurde zwar, aber die Meldung des Merkens ueberschrieb
   die des Abgebens, weil merken() sie mit 400 ms Verzoegerung
   nachschickt. Sie kam also SPAETER und blieb stehen. */
function halten(still){
  const t = text.value.trim();
  const gezeichnet = S.zeichnung && !leer(blatt) ? S.zeichnung : null;
  if (!t && !gezeichnet && !angehaengt.length){
    zeigen('Es steht noch nichts da.'); return false;
  }
  S.notizen.push({ ort: wo(), text: t, zeichnung: gezeichnet,
                   bilder: angehaengt.slice(), zeit: zeitstempel() });
  // Der Tisch wird frei fuer die naechste Notiz - der Name bleibt.
  text.value = ''; S.entwurf = '';
  S.zeichnung = null; stift.clearRect(0, 0, blatt.width, blatt.height);
  angehaengt = []; bilderZeigen();
  merken(still);
  listeZeigen();
  if (!still) zeigen('Notiz ' + S.notizen.length + ' gemerkt');
  return true;
}
const halteKnopf = leiste.querySelector('.rueckhalten');
if (halteKnopf) halteKnopf.onclick = halten;

/* Ist auf dem Blatt wirklich etwas? Ein leeres Canvas liefert trotzdem
   eine data-URL - ohne diese Pruefung haetten Notizen ein leeres Bild
   im Paket. */
function leer(c){
  // Ein nie aufgespanntes Blatt ist 0x0 - getImageData wuerde werfen
  // und die ganze Notiz mitreissen.
  if (!c.width || !c.height) return true;
  try {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
    return true;
  } catch(e){ return false; }   // im Zweifel behalten, nicht wegwerfen
}

function listeZeigen(){
  // Die Zahl der gemerkten Notizen steht am OEFFNER - dort sieht man
  // sie auch bei geschlossener Tafel. Sonst wuesste niemand, dass
  // etwas gesammelt ist.
  const z = oeffner.querySelector('.rueckzahl');
  if (S.notizen.length){
    z.textContent = S.notizen.length;
    z.dataset.n = S.notizen.length;
  } else {
    z.textContent = ''; delete z.dataset.n;
  }
  liste.innerHTML = '';
  if (!S.notizen.length) return;
  liste.appendChild(el('b', null, 'Gemerkt: ' + S.notizen.length));
  S.notizen.forEach((n, i) => {
    const z = el('div', 'rueckzeile');
    z.appendChild(el('span', 'nr', String(i + 1)));
    const anhang = (n.bilder || []).length;
    z.appendChild(el('span', 'wo', n.ort));
    z.appendChild(el('span', 'was',
      (n.text || '(nur gezeichnet)').slice(0, 90)
      + (anhang ? '  · ' + anhang + ' Bild' + (anhang > 1 ? 'er' : '') : '')));
    const weg = el('button', null, '×');
    weg.title = 'Notiz verwerfen';
    weg.onclick = () => { S.notizen.splice(i, 1); merken(); listeZeigen(); };
    z.appendChild(weg);
    liste.appendChild(z);
  });
}
listeZeigen();

/* ============================================================
   Abgeben
   ============================================================ */
function alsText(){
  const zeilen = ['# Rückmeldung', '',
    'Von:     ' + (S.wer || '(kein Name angegeben)'),
    'Seite:   ' + document.title,
    'Adresse: ' + location.href,
    'Datum:   ' + zeitstempel(), '',
    '---', ''];
  S.notizen.forEach((n, i) => {
    zeilen.push('## ' + (i + 1) + ' · ' + n.ort);
    zeilen.push('*' + n.zeit + '*', '');
    if (n.text) zeilen.push(n.text, '');
    if (n.zeichnung) zeilen.push('![handschriftlich](notiz-'
      + String(i + 1).padStart(2, '0') + '-hand.png)', '');
    (n.bilder || []).forEach((b, j) => zeilen.push('![Bild](notiz-'
      + String(i + 1).padStart(2, '0') + '-bild-' + (j + 1) + '.jpg)', ''));
    zeilen.push('');
  });
  return zeilen.join('\n');
}

const datenBytes = d => {
  const roh = atob(d.slice(d.indexOf(',') + 1));
  const u = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) u[i] = roh.charCodeAt(i);
  return u;
};

leiste.querySelector('.rueckgeben').onclick = async () => {
  /* Ohne Sammeln gibt es keinen Merkknopf - dann ist das, was gerade
     dasteht, die Rueckmeldung. Sie wird beim Abgeben uebernommen.
     Ohne das muesste man erst merken, um abgeben zu koennen, und genau
     diese Huerde sollte hier verschwinden. */
  if (!CFG.sammeln && !S.notizen.length) halten(true);
  if (!S.notizen.length){
    zeigen(CFG.sammeln ? 'Merken Sie zuerst mindestens eine Notiz.'
                       : 'Schreiben Sie zuerst etwas.'); return;
  }
  if (!S.wer){
    zeigen('Bitte tragen Sie Ihren Namen ein.'); werF.focus(); return;
  }
  if (!P){ zeigen('paket.js fehlt — bitte melden.'); return; }
  zeigen('Paket wird geschnürt …');

  const dateien = [
    { name: 'rueckmeldung.md', daten: P.textBytes(alsText()) },
    { name: 'angaben.json', daten: P.textBytes(JSON.stringify({
        wer: S.wer, seite: document.title, adresse: location.href,
        projekt: CFG.projekt, datum: new Date().toISOString(),
        anzahl: S.notizen.length,
        notizen: S.notizen.map(n => ({ ort: n.ort, zeit: n.zeit,
          text: n.text, bilder: (n.bilder || []).length,
          handschrift: !!n.zeichnung }))
      }, null, 2)) }
  ];
  S.notizen.forEach((n, i) => {
    const nr = String(i + 1).padStart(2, '0');
    if (n.zeichnung)
      dateien.push({ name: 'notiz-' + nr + '-hand.png', daten: datenBytes(n.zeichnung) });
    (n.bilder || []).forEach((b, j) =>
      dateien.push({ name: 'notiz-' + nr + '-bild-' + (j+1) + '.jpg',
                     daten: datenBytes(b) }));
  });

  const paket = P.zip(dateien);
  const wer = (S.wer || 'ohne-namen').replace(/\W+/g, '-').slice(0, 40);
  const seite = document.title.replace(/\W+/g, '-').slice(0, 40);
  const d = new Date(), z = n => String(n).padStart(2, '0');
  const name = CFG.projekt + '_' + seite + '_' + wer + '_'
             + d.getFullYear() + z(d.getMonth()+1) + z(d.getDate())
             + '-' + z(d.getHours()) + z(d.getMinutes()) + '.zip';

  const hoch = await P.abgeben(CFG.abgabe, CFG.schluessel, name, paket);

  /* FEHLERBEHOBEN (2026-08-23, beim Einbau des ersten echten
     Abgabelinks gefunden - vorher war der Zweig nie erreichbar):

     1. Das Fenster bekam `!!CFG.abgabe` als «hochgeladen». Das sagt
        aber nur, OB ein Link eingetragen ist - nicht, ob die Abgabe
        geklappt hat. War ein Link gesetzt und der Upload scheiterte,
        stand da «Angekommen — danke, Ihre Rückmeldung ist da». Genau
        die Luege, die man nicht machen darf: Maurus haette geglaubt,
        es sei angekommen, und die Datei waere nur in seinen Downloads
        gelegen.

     2. Bei Erfolg erschien gar kein Fenster, nur eine kleine gruene
        Zeile - und die Notizen wurden geleert. Wer eine Kopie behalten
        wollte, hatte keine mehr.

     Jetzt: IMMER herunterladen, IMMER das Fenster, und es sagt die
     Wahrheit ueber den Upload. Die Datei in der Hand kostet nichts und
     ist die Sicherung gegen alles, was zwischen hier und SWITCHdrive
     schiefgehen kann. */
  const a = document.createElement('a');
  a.href = URL.createObjectURL(paket); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);

  if (hoch){
    // Erst NACH der bestaetigten Abgabe leeren. Wer vorher leert,
    // verliert alles, wenn das Netz gerade weg ist.
    S.notizen = []; merken(true); listeZeigen();
  }
  abgabefenster(name, paket.size, hoch);
};

/* Das Abgabefenster — es geht nach dem Herunterladen auf.

   NEU (Rikes Auftrag, 2026-08-23): «Wenn man auf Abgeben klickt, dann
   sollte nicht nur die ZIP-Datei runtergeladen werden, sondern es
   sollte sich auch ein Feld oeffnen, wo wir es dann zu SWITCH
   hochladen.»

   Warum es AUCH dann kommt, wenn ein Abgabelink gesetzt ist und der
   Upload geklappt hat: dann sagt es nur Danke und schliesst sich. Wer
   abgibt, soll nie im Ungewissen bleiben, ob es angekommen ist - das
   ist der haeufigste Grund, dieselbe Datei dreimal zu schicken.

   PRUEFEN (2026-08-23): SWITCHdrive zieht bis heute 20 Uhr auf eine
   neue Plattform um und ist bis dahin nicht erreichbar. Der
   Freigabelink kann erst danach erzeugt werden. Alles bis dahin ist
   gebaut; es fehlt EINE Zeile in projekt.py:
       RUECKMELDUNG_ADRESSE   die WebDAV-Adresse
       RUECKMELDUNG_SCHLUESSEL  der Teil hinter /s/ im Freigabelink
   Solange sie leer ist, zeigt das Fenster den Weg von Hand. */
function abgabefenster(name, groesse, hochgeladen){
  document.querySelectorAll('.rueckfenster').forEach(e => e.remove());
  const f = el('div', 'rueckfenster');
  const k = el('div', 'rueckfensterkarte');

  k.appendChild(el('p', 'augen', 'Gespeichert'));
  k.appendChild(el('h2', null, 'Die Datei liegt in Ihren Downloads.'));

  k.appendChild(el('p', 'rueckklein', 'So heisst sie:'));
  const d = el('p', 'rueckdatei');
  d.appendChild(el('b', null, name));
  d.appendChild(el('span', null, '  ' + (groesse / 1048576).toFixed(1) + ' MB'));
  k.appendChild(d);

  if (CFG.ablage){
    k.appendChild(el('p', 'rueckhinweistext',
      'Es öffnet sich ein neues Fenster. Ziehen Sie Ihre Datei hinein.'));
    const b = el('a', 'rueckknopf gross', 'Abgabefenster öffnen');
    b.href = CFG.ablage; b.target = '_blank'; b.rel = 'noopener';
    k.appendChild(b);
  } else {
    k.appendChild(el('p', 'rueckhinweistext',
      'Ein Abgabeordner ist noch nicht eingerichtet. Schicken Sie die '
      + 'Datei bitte vorerst so, wie Sie es abgemacht haben — sie enthält '
      + 'alles, was gebraucht wird.'));
  }

  // Schliessen ohne Knopf: das Kreuz oben, ein Klick daneben, Escape.
  // Rike, 2026-08-23: «Wir brauchen keinen dritten Button mit
  // abgegeben und Abschiedsfloskel.» Ein Fenster, das nur informiert,
  // braucht keine Zeremonie zum Verlassen.
  const zu = el('button', 'rueckzu', '×');
  zu.title = 'Schliessen';
  zu.onclick = () => f.remove();
  k.appendChild(zu);
  f.onclick = e => { if (e.target === f) f.remove(); };
  const esc = e => { if (e.key === 'Escape'){ f.remove();
                                              removeEventListener('keydown', esc); } };
  addEventListener('keydown', esc);

  f.appendChild(k);
  document.body.appendChild(f);
}

addEventListener('resize', () => {
  if (leiste.classList.contains('offen')) blattGroesse();
});

})();
