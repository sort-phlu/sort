/* ============================================================
   SORT – Aufnahmemodul
   Wird von aussen an eine beliebige sortieren.html gehängt.
   Verändert die Sortierfläche nicht, liest sie nur mit.

   Liegt nur im Erprobungsordner. Die oeffentlichen Sortierflaechen
   binden diese Datei nicht ein und nehmen deshalb nichts auf.
   ============================================================ */
(function(){
'use strict';

/* ---------- Welche Klasse? ----------
   Das Kuerzel steht in der Adresse (?k=7a) und wird in der gemeinsamen
   Klassentabelle nachgeschlagen. Diese Zeilen muessen vor den
   Einstellungen stehen - dort wird KLASSE bereits gebraucht. */
const KLASSENKUERZEL = new URLSearchParams(location.search).get('k') || '';
const KLASSEN = window.SORT_KLASSEN || {};
const KLASSE = KLASSEN[KLASSENKUERZEL] || null;

/* ---------- Einstellungen ---------- */
const CFG = Object.assign({
  // Ablage, die die Pakete entgegennimmt. null = nur herunterladen.
  // SWITCHdrive: 'https://drive.switch.ch/public.php/webdav'
  abgabe:   null,
  // Bei SWITCHdrive der Code aus dem Freigabelink (der Teil hinter /s/)
  schluessel: '',
  // Freigabelink der Ablage, den die Gruppe zum Abgeben oeffnet
  ablage:   null,
  ziehrate: 50          // Millisekunden zwischen zwei Positionsmeldungen beim Ziehen
}, window.SORT_ABGABE || {});

// Hat die Klasse eine eigene Ablage, geht ihre Abgabe dorthin.
if (KLASSE && KLASSE.ablage) CFG.ablage = KLASSE.ablage;

/* ---------- Woher kommt diese Aufgabe? ---------- */
/* Zum blossen Anschauen: ...?ansehen haengt das Aufnahmemodul aus.
   Fuer das Projektteam gedacht, das die Kaertchen pruefen will, ohne
   dass dabei eine Sitzung entsteht. */
if (new URLSearchParams(location.search).has('ansehen')) return;

const pfad = location.pathname.split('/').filter(Boolean);
// Endet die Adresse auf einen Dateinamen, faellt der weg: der letzte
// echte Abschnitt ist die Variante, der davor das Thema.
if (pfad.length && pfad[pfad.length - 1].indexOf('.') >= 0) pfad.pop();
const variante = pfad.length >= 1 ? pfad[pfad.length - 1] : 'unbekannt';
const thema    = pfad.length >= 2 ? pfad[pfad.length - 2] : 'unbekannt';
const titel    = document.title || '';


/* Thema und Variante als Nummern - sie machen den Dateinamen kurz
   und trotzdem eindeutig. Alles Weitere steht in angaben.json. */
const AUFGABE = window.SORT_AUFGABE || null;

/* ---------- Zustand ---------- */
const S = {
  sitzung: null, klasse: '', namen: [],
  beginn: null, t0: 0,
  ereignisse: [], spur: null, aufnehmer: null, brocken: [],
  laeuft: false, zuletztGezogen: {}, uhr: null, pegel: 0,
  zwischenbilder: [], runde: 0, fenster: null, rueckmeldung: '', stand: null,
  // Die Abzuege des Hintergrundes und die einmal abgelegten Bilder dazu.
  hintergruende: [], hgBilder: [], hgZuletzt: -1
};

/* ============================================================
   Werkzeuge
   ============================================================ */
const jetzt = () => Math.round(performance.now() - S.t0);

function merken(was, mehr){
  const e = Object.assign({ t: jetzt(), was: was }, mehr || {});
  S.ereignisse.push(e);
  if (S.ereignisse.length % 40 === 0) sichern();
  return e;
}

function sichern(){
  try {
    localStorage.setItem('sort-protokoll-' + S.sitzung,
      JSON.stringify({ kopf: kopfdaten(), ereignisse: S.ereignisse }));
  } catch(e){ /* Speicher voll – kein Grund abzubrechen */ }
}

function zeitcode(){
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return d.getFullYear() + z(d.getMonth()+1) + z(d.getDate())
       + '-' + z(d.getHours()) + z(d.getMinutes());
}

function dauerText(ms){
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0');
}

/* Wo der Browser heruntergeladene Dateien anzeigt. Absichtlich knapp:
   lieber eine Beschreibung, die fast immer stimmt, als eine falsche. */
function fundort(){
  const u = navigator.userAgent;
  const chrome  = /Chrome|CriOS|Chromium/.test(u) && !/Edg|OPR/.test(u);
  const edge    = /Edg/.test(u);
  const firefox = /Firefox|FxiOS/.test(u);
  const safari  = /Safari/.test(u) && !chrome && !edge && !firefox;
  const ipad    = /iPad|iPhone/.test(u);

  if (ipad)    return 'Tippt oben rechts auf den Pfeil nach unten – '
                    + 'dort steht eure Datei.';
  if (safari)  return 'Oben rechts blinkt kurz ein Pfeil nach unten. '
                    + 'Klickt ihn an – dort steht eure Datei.';
  if (chrome || edge)
               return 'Oben rechts erscheint ein Pfeil nach unten. '
                    + 'Klickt ihn an – dort steht eure Datei.';
  if (firefox) return 'Oben rechts erscheint ein Pfeil nach unten. '
                    + 'Klickt ihn an – dort steht eure Datei.';
  return 'Der Browser zeigt heruntergeladene Dateien meist oben rechts an.';
}

function el(tag, klasse, text){
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}

/* ---------- Lage einer Karte lesen ---------- */
function lage(k){
  const l = {
    karte: k.dataset.code || k.getAttribute('alt') || '?',
    x: Math.round(k._x || 0),
    y: Math.round(k._y || 0)
  };
  const w = parseFloat(k._rot || 0);
  if (w) l.dreh = Math.round(w * 10) / 10;
  const z = parseInt(k.style.zIndex, 10);
  if (!isNaN(z)) l.z = z;
  if (k._feld !== undefined && k._feld !== null) l.feld = k._feld;
  const ort = k.parentElement && k.parentElement.id;
  if (ort && ort !== 'tisch') l.ort = ort;
  // NEU (2026-09-13, Rikes Auftrag): Ob die Karte ueberhaupt auf dem
  // Tisch LAG. alleLagen() laeuft ueber ALLE .karte - auch ueber die,
  // die noch hinter einer Nachschubstufe liegen und display:none
  // tragen. Eine solche Karte hat _x = _y = 0 und sah im Protokoll
  // bisher aus wie eine, die links oben liegt.
  //
  // Das ist nicht Kosmetik: Rike will der Gruppe am Schluss ihre
  // eigene Sortierung zeigen, und zwar NUR mit den Figuren, die sie
  // tatsaechlich in der Hand hatte. Ohne diese Marke laesst sich das
  // aus einem abgegebenen Paket nicht mehr rekonstruieren.
  //
  // Additiv, mit Absicht: Die bereits abgegebenen Pakete kennen das
  // Feld nicht, und ihre Auswertung bricht dadurch nicht.
  if (k.style && k.style.display === 'none') l.verdeckt = 1;
  try {
    if (typeof HAELFTEN !== 'undefined' && HAELFTEN && typeof tisch !== 'undefined'){
      const b = (typeof breite !== 'undefined' ? breite : 170);
      const quer = HAELFTEN.achse === 'y';   // waagrechte Trennlinie
      l.haelfte = quer
        ? ((l.y + b * 0.844 / 2) < tisch.clientHeight * HAELFTEN.teiler
             ? HAELFTEN.links : HAELFTEN.rechts)
        : ((l.x + b / 2) < tisch.clientWidth * HAELFTEN.teiler
             ? HAELFTEN.links : HAELFTEN.rechts);
    }
  } catch(e){}
  return l;
}

function alleLagen(){
  const ks = document.querySelectorAll('.karte');
  return Array.prototype.map.call(ks, lage);
}

/* ============================================================
   Mitschreiben
   ============================================================ */
function mitschreibenStarten(){
  merken('start', {
    karten: alleLagen(),
    breite: (typeof breite !== 'undefined' ? breite : null),
    tisch: (typeof tisch !== 'undefined' && tisch)
           ? [tisch.clientWidth, tisch.clientHeight] : null,
    fenster: [innerWidth, innerHeight]
  });

  /* Greifen – vor der Sortierfläche, damit die Herkunft noch stimmt */
  document.addEventListener('pointerdown', e => {
    const k = e.target.closest && e.target.closest('.karte');
    if (!k) return;
    const l = lage(k);
    l.zeiger = e.pointerId;
    l.art = e.pointerType;
    merken('greifen', l);
  }, true);

  /* Ziehen – nach der Sortierfläche, damit die neue Lage schon steht */
  document.addEventListener('pointermove', e => {
    const k = e.target.closest && e.target.closest('.karte');
    if (!k || !k.classList.contains('aktiv')) return;
    const id = k.dataset.code || '?';
    const t = performance.now();
    if (S.zuletztGezogen[id] && t - S.zuletztGezogen[id] < CFG.ziehrate) return;
    S.zuletztGezogen[id] = t;
    merken('ziehen', {
      karte: id, x: Math.round(k._x || 0), y: Math.round(k._y || 0), zeiger: e.pointerId
    });
  }, false);

  /* Ablegen */
  ['pointerup','pointercancel'].forEach(typ =>
    document.addEventListener(typ, e => {
      const k = e.target.closest && e.target.closest('.karte');
      if (!k) return;
      const l = lage(k);
      l.zeiger = e.pointerId;
      merken('ablegen', l);
    }, false));

  /* Knöpfe der Sortierfläche */
  // NEU (2026-09-13, Rikes Auftrag): `mehrkarten` und `mehrkarten_viele`
  // standen hier NICHT. Das Nachlegen - der Knopf, um den sich die halbe
  // Gestaltung dreht - hinterliess keine einzige Spur im Protokoll.
  //
  // Damit war aus einem abgegebenen Paket nicht zu beantworten, wie weit
  // eine Gruppe ueberhaupt gekommen ist: wie oft sie nachgelegt hat,
  // wann, und welche Figuren sie je gesehen hat.
  const knoepfe = {
    pruefen: 'pruefen', raster: 'raster', zurueck: 'zurueck',
    kleiner: 'zoom-kleiner', groesser: 'zoom-groesser',
    runde: 'neue-runde', zufall: 'zufaellig-fuellen', bild: 'bild-gespeichert',
    mehrkarten: 'nachgelegt', mehrkarten_viele: 'nachgelegt-mehrere'
  };
  Object.keys(knoepfe).forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    b.addEventListener('click', () => {
      setTimeout(() => {
        const m = document.getElementById('meldung');
        const d = { };
        if (m && m.textContent.trim()) d.meldung = m.textContent.trim();
        if (id === 'kleiner' || id === 'groesser')
          d.breite = (typeof breite !== 'undefined' ? breite : null);
        if (id === 'pruefen'){
          d.markiert = Array.prototype.map.call(
            document.querySelectorAll('.karte.falsch, .karte.richtig'),
            k => (k.dataset.code || '?') + (k.classList.contains('richtig') ? '+' : '-'));
        }
        if (id === 'runde' || id === 'zufall') d.karten = alleLagen();
        // Beim Nachlegen wird die erreichte Stufe mitgeschrieben und die
        // Lage aller Karten - so steht im Protokoll, WELCHE Figuren ab
        // hier auf dem Tisch lagen, nicht nur DASS nachgelegt wurde.
        if (id === 'mehrkarten' || id === 'mehrkarten_viele'){
          if (typeof STUFE !== 'undefined') d.stufe = STUFE;
          d.karten = alleLagen();
        }
        merken(knoepfe[id], d);
      }, 60);
    }, false);
  });

  /* Auswahlknöpfe für die Feldanzahl, falls vorhanden */
  const ak = document.getElementById('anzahlknoepfe');
  if (ak) ak.addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON')
      merken('felderanzahl', { wert: e.target.textContent.trim() });
  }, false);

  addEventListener('resize', () => merken('fenster', { fenster: [innerWidth, innerHeight] }));
  document.addEventListener('visibilitychange',
    () => merken(document.hidden ? 'weggeklickt' : 'zurueck-im-fenster'));
}

/* ============================================================
   Endbild der Sortierfläche
   ============================================================ */
async function flaechenbild(){
  try {
    if (typeof tisch === 'undefined' || !tisch) return null;
    const b = (typeof breite !== 'undefined' ? breite : 170);
    const h = Math.round(b * 0.844);
    const abl = (typeof ABL !== 'undefined' ? ABL : 1);
    const auf = Array.prototype.filter.call(
      document.querySelectorAll('.karte'), k => k.parentElement === tisch);
    if (!auf.length) return null;

    let bx = 0, by = 0;
    auf.forEach(k => { bx = Math.max(bx, (k._x||0) + b); by = Math.max(by, (k._y||0) + h); });
    const s = 2, c = document.createElement('canvas');
    c.width = (bx + 24) * s; c.height = (by + 24) * s;
    const g = c.getContext('2d'); g.scale(s, s);
    g.fillStyle = '#fff'; g.fillRect(0, 0, bx + 24, by + 24);

    const sortiert = auf.slice().sort((a,b2) =>
      (+a.style.zIndex || 0) - (+b2.style.zIndex || 0));
    for (const k of sortiert){
      const im = k.querySelector('img');
      if (!im) continue;
      await im.decode().catch(() => {});
      const kw = k.classList.contains('ablage') ? b * abl : b;
      const kh = k.classList.contains('ablage') ? h * abl : h;
      const w = parseFloat(k._rot || 0);
      if (w){
        g.save();
        g.translate((k._x||0) + 12 + kw/2, (k._y||0) + 12 + kh/2);
        g.rotate(w * Math.PI / 180);
        g.drawImage(im, -kw/2, -kh/2, kw, kh);
        g.restore();
      } else {
        g.drawImage(im, (k._x||0) + 12, (k._y||0) + 12, kw, kh);
      }
    }
    return await new Promise(f => c.toBlob(f, 'image/png'));
  } catch(e){ return null; }
}

/* ============================================================
   Rundenwechsel: das Zwischenbild kommt ins Paket statt in
   den Download-Ordner. Die Sortierfläche ruft dafür bild(true).
   ============================================================ */
function rundenbilderAbfangen(){
  if (typeof window.bild !== 'function') return;
  const original = window.bild;
  window.bild = async function(still){
    if (still && S.laeuft){
      S.runde++;
      const b = await flaechenbild();
      if (b) S.zwischenbilder.push({ nr: S.runde, blob: b });
      merken('rundenbild', { nr: S.runde, gespeichert: !!b });
      return;
    }
    return original.apply(this, arguments);
  };
}

/* ============================================================
   Die Sortierfläche beschreiben - damit das Paket für sich
   allein wiedergegeben werden kann und niemand die passende
   index.html dazusuchen muss.
   ============================================================ */
/* Das Feld so festhalten, wie es WIRKLICH auf dem Tisch stand: gemessen
   am fertig gezeichneten Bild, nicht aus RASTER neu hergeleitet.

   FEHLERBEHOBEN (2026-08-28, Rikes Befund «beim Abspielen lag ein anderes
   Sortierfeld hinten dran als die Klasse gesehen hat»): Das Feld wurde
   zweimal gezeichnet - hier von der Aufgabenseite, und im Abspielgeraet
   noch einmal von vorne. Die beiden Zeichner sind auseinandergelaufen:
   `reihe` kannte das Abspielgeraet gar nicht, eine Beschriftungs-LISTE
   landete auf jedem Feld zugleich, und selbst dazugenommene Gruppen
   (`erweiterbar`) bekamen ueberhaupt keinen Rahmen. Gemessen am Probelauf
   ({anzahl:10, reihe:true}): eine Reihe ueber die ganze Breite auf der
   Aufgabenseite, ein mehrzeiliges Gitter im Abspielgeraet.

   Deshalb wird jetzt das Ergebnis aufgeschrieben statt der Regel. Was
   hier nicht gemessen wurde, kann drueben auch nicht falsch geraten
   werden - auch bei Feldarten, die es heute noch nicht gibt.

   Nebenbei kommen die selbst getippten Gruppennamen mit (`frei: true`).
   Die gingen bisher verloren, dabei sind sie das Interessante daran. */
function flaechengemessen(){
  const t = document.getElementById('tisch');
  if (!t) return null;
  // offset* statt style: Beide Sortierflaechen setzen ihre Felder anders,
  // die gemessene Lage ist bei beiden dieselbe Wahrheit.
  const masse = e => ({ x: e.offsetLeft, y: e.offsetTop,
                        w: e.offsetWidth, h: e.offsetHeight });
  const felder = Array.prototype.map.call(
    t.querySelectorAll('.rasterfeld, .feld'), d => {
      const eig = d.querySelector('input');
      const s = getComputedStyle(d);
      return Object.assign(masse(d), {
        // Getipptes zaehlt, der Platzhalter ist nur das Angebot.
        text: eig ? (eig.value || eig.placeholder || '')
                  : (d.textContent || '').trim(),
        selbstbenannt: !!(eig && eig.value),
        neu:    d.classList.contains('neu'),
        rand:   s.borderColor,
        strich: s.borderStyle
      });
    });
  const marken = Array.prototype.map.call(
    t.querySelectorAll('.haelfte'),
    d => Object.assign(masse(d), { text: (d.textContent || '').trim() }));
  const teiler = t.querySelector('#teiler');
  return {
    felder: felder, marken: marken,
    teiler: teiler ? masse(teiler) : null,
    // Sichtbar? Ein leeres Feld heisst: Die Gruppe hat es nie eingeblendet.
    sichtbar: felder.length > 0,
    breite: (typeof breite !== 'undefined') ? breite : null,
    tisch: [t.clientWidth, t.clientHeight]
  };
}

/* ============================================================
   Der Hintergrund, so wie er dasteht
   ============================================================ */
/* NEU (2026-09-16, Rikes Befund «es werden nicht die Hintergruende in
   exakt der Form angezeigt, wie die SuS sie gesehen haben»):

   flaechengemessen() oben liest eine FESTE LISTE von Feldarten
   (`.rasterfeld`, `.feld`, `.haelfte`, `#teiler`). Nachgezaehlt ueber
   alle 21 Flaechen der Erprobung: Auf ACHT davon findet diese Liste
   ueberhaupt nichts, obwohl der Tisch voll ist -

     Aehnlichkeit 2, Faktorisieren 2   3 Venn-Kreise, Slots, Aussenfeld
     Aehnlichkeit 3                    die Kette: 9 Teile, Pfeil-SVG, Schreibfeld
     Aehnlichkeit 5, Potenzen 7,
     Variablen 6                       je 24 Buendelteile
     Aehnlichkeit 4, Faktorisieren 5   das SVG-Hintergrundbild auf `#brett`

   Diese Sitzungen kamen im Abspielgeraet als weisse Flaeche mit
   schwebenden Karten an. Auf den uebrigen dreizehn fehlten die
   Vorratsfelder, die quere Trennlinie (`#teiler_quer` - gemessen wurde
   nur `#teiler`), die Fuellung der Zusatzfelder, die Rechenzeichen
   `·` und `=` und die halbe Deckkraft von «noch eine Gruppe».

   Die Ursache ist nicht, WAS in der Liste steht, sondern dass es eine
   Liste ist. Der Kommentar bei flaechengemessen() verspricht schon das
   Richtige - «was hier nicht gemessen wurde, kann drueben auch nicht
   falsch geraten werden, auch bei Feldarten, die es heute noch nicht
   gibt». Eine Aufzaehlung kann dieses Versprechen nicht halten; sie
   veraltet mit der naechsten neuen Flaechenart.

   Deshalb wird jetzt ABGEZOGEN statt aufgezaehlt: alles, was auf dem
   Tisch liegt und keine Karte ist, mit seiner gemessenen Lage und
   seinen AUSGERECHNETEN Stilen. Heraus kommt ein Stueck HTML, das ohne
   das Stylesheet der Aufgabenseite genauso dasteht. Eine neue Feldart
   kommt ohne eine Zeile Code mit.

   Und es wird MEHRMALS abgezogen. Bisher wurde einmal gemessen, ganz
   am Schluss - die ganze Sitzung lief mit dem Endzustand im Hintergrund
   ab, obwohl Zoom, dazugekommene Felder und mit der Belegung wachsende
   Feldhoehen ihn waehrenddessen mehrfach aendern. Ein Beobachter meldet
   jede Aenderung, gleiche Abzuege werden zusammengelegt.

   `gemessen` bleibt daneben stehen. Es kostet wenig, und ein aelteres
   Abspielgeraet kann ein neues Paket damit weiter lesen. */

/* Was mitkommt. Die erste Gruppe IMMER (ohne sie steht das Element
   nicht, wo es stand), die zweite nur, wenn sie vom Uebrigen abweicht. */
const HG_STILE = [
  'position','left','top','width','height','box-sizing','display','z-index',
  'right','bottom','align-items','justify-content','flex-direction','overflow',
  'margin-top','margin-right','margin-bottom','margin-left',
  'padding-top','padding-right','padding-bottom','padding-left',
  'border-top-width','border-right-width','border-bottom-width','border-left-width',
  'border-top-style','border-right-style','border-bottom-style','border-left-style',
  'border-top-color','border-right-color','border-bottom-color','border-left-color',
  'border-radius','background-color','background-image','background-size',
  'background-position','background-repeat','opacity','color',
  'font-family','font-size','font-weight','font-style','line-height',
  'letter-spacing','text-align','text-transform','white-space',
  'transform','transform-origin'
];
const HG_HALT = new Set(['position','left','top','width','height',
                         'box-sizing','display','z-index']);
// Werte, die nichts aussagen. `0px` steht hier, weil eine Randbreite von
// null dasselbe heisst wie kein Rand - bei `left` und `top` wuerde es
// das Element verschieben, deshalb stehen die in HG_HALT.
const HG_LEER = new Set(['auto','none','normal','0px','0%','visible','repeat',
                         'rgba(0, 0, 0, 0)','start','row','1','0% 0%','400']);

function hgText(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* FEHLERBEHOBEN (2026-09-16, beim ersten Durchlauf gegen die echte
   Flaeche gemessen): Der ausgerechnete Stil enthaelt ANFUEHRUNGSZEICHEN
   - `font-family:"Fira Sans", ...` bei jedem Element und
   `background-image:url("data:image/svg+xml;base64,...")` beim Brett.
   Ungeschuetzt in ein `style="..."` geschrieben, schliessen sie das
   Attribut mitten im Wert.

   Gemessen an Aehnlichkeit 4: Der Abzug kam mit 333 Zeichen und einem
   Bild richtig heraus und stand im Rahmen trotzdem leer da, weil das
   Attribut vor dem `url(` endete. Bei den Venn-Kreisen fiel es nicht
   auf - Rand und Fuellung stehen VOR der Schriftart, es ging nur das
   Dahinterliegende verloren. Der leisere und darum schlimmere Fall. */
function hgAttribut(s){
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function hgStil(e){
  const s = getComputedStyle(e), w = {};
  for (const n of HG_STILE){
    const v = s.getPropertyValue(n);
    if (!v) continue;
    if (!HG_HALT.has(n) && HG_LEER.has(v)) continue;
    w[n] = v;
  }
  /* Was nichts mehr bewirkt, wird gestrichen. Nicht aus Sparsamkeit:
     Ein `bottom`, das neben `top` und `height` steht, ist ueberbestimmt
     und wird ohnehin ignoriert - aber es steht dann im Abzug und sieht
     aus wie eine Angabe. Ein Abzug soll nur enthalten, was traegt. */
  if (w.left  && w.width)  delete w.right;
  if (w.top   && w.height) delete w.bottom;
  if (!w.transform) delete w['transform-origin'];
  ['top','right','bottom','left'].forEach(seite => {
    if (!w['border-' + seite + '-width'] || !w['border-' + seite + '-style'])
      delete w['border-' + seite + '-color'];
  });
  return Object.keys(w).map(n => n + ':' + w[n]).join(';');
}

function hgKnoten(e){
  const k = e.classList;
  // Die Karten sind der Vordergrund und stehen im Protokoll. Die
  // Aufnahme-Oberflaeche gehoert uns, nicht der Aufgabe.
  if (k && (k.contains('karte') || k.contains('sortauf-huelle'))) return '';
  if (typeof e.className === 'string' && /\bsortauf-/.test(e.className)) return '';
  const s = getComputedStyle(e);
  if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return '';
  // SVG traegt sein Aussehen in Attributen, nicht im Stylesheet, und
  // kommt deshalb unveraendert mit (die Pfeile der Kette).
  if (e.namespaceURI === 'http://www.w3.org/2000/svg') return e.outerHTML;
  // Ein Eingabefeld wird zu Text: Der getippte WERT steht nur in der
  // Eigenschaft, nicht im Quelltext, und ginge sonst verloren. Genau
  // das sind die selbst gewaehlten Gruppennamen.
  if (e.tagName === 'INPUT')
    return '<div style="' + hgAttribut(hgStil(e)) + '">'
         + hgText(e.value || e.placeholder || '') + '</div>';
  let innen = '';
  for (const kind of e.childNodes){
    if (kind.nodeType === 3) innen += hgText(kind.nodeValue);
    else if (kind.nodeType === 1) innen += hgKnoten(kind);
  }
  // Alles wird ein <div>: Ob es eine Zeile bildet oder nicht, steht als
  // ausgerechnetes `display` im Stil und haengt nicht mehr am Tag.
  return '<div style="' + hgAttribut(hgStil(e)) + '">' + innen + '</div>';
}

function hintergrundAbzug(){
  const t = document.getElementById('tisch');
  if (!t) return null;
  let html = '', tief = 0;
  for (const kind of t.children){
    const stueck = hgKnoten(kind);
    if (!stueck) continue;
    html += stueck;
    tief = Math.max(tief, kind.offsetTop + kind.offsetHeight);
  }
  // Eingebettete Bilder (das SVG auf `#brett` sind rund 42 kB base64)
  // stehen EINMAL im Paket und in den Abzuegen nur als Marke. Sonst
  // truege jeder Abzug seine eigene Kopie.
  html = html.replace(/url\(&quot;(data:[^&]{200,})&quot;\)/g, function(_, u){
    let i = S.hgBilder.indexOf(u);
    if (i < 0) i = S.hgBilder.push(u) - 1;
    return 'url(&quot;«bild' + i + '»&quot;)';
  });
  return { h: Math.ceil(tief), html: html };
}

/* Wieviel Platz alle Abzuege zusammen hoechstens einnehmen duerfen.

   Gemessen: Eine Fläche hat im Lauf einer Stunde eine Handvoll
   Zustaende - sechs bei «Wonach kann man diese Karten ordnen?», je 0,4
   bis 15 kB. Die Schranke ist also nicht fuer den erwarteten Fall da,
   sondern fuer den unerwarteten. Sie zaehlt Bytes und nicht Abzuege,
   weil das die Sorge genau trifft: Eine Aufnahme darf nie so gross
   werden, dass die Abgabe einer Gruppe scheitert.

   Ist sie erreicht, wird weiter auf die bekannten Abzuege verwiesen -
   nur kein neuer mehr angelegt. Die Aufnahme laeuft dadurch nicht
   schlechter, der Hintergrund bleibt nur ab da stehen. */
const HG_HOECHSTENS = 1500 * 1024;

function hintergrundPruefen(){
  /* Die Aufnahme laeuft in einer Schulstunde und darf die Flaeche unter
     keinen Umstaenden anhalten. Wenn hier etwas schiefgeht, fehlt ein
     Abzug - die Gruppe sortiert weiter und merkt nichts. Dieselbe
     Haltung wie bei flaechenbild() weiter oben. */
  try {
    const a = hintergrundAbzug();
    if (!a || !a.html) return;
    /* Gegen ALLE bisherigen vergleichen, nicht nur gegen den letzten.

       Grund: Zwei CSS-Regeln aendern das Aussehen eines Feldes, ohne
       dass sich im Baum etwas ruehrt - `.rasterfeld.neu:hover` (Deck-
       kraft 0,55 auf 1) und `.einfuegen:hover`. Faehrt die Gruppe
       waehrend eines Neuzeichnens gerade darueber, entsteht ein Abzug
       mit Hover-Zustand, danach wieder einer ohne. Beim Vergleich nur
       mit dem letzten wuerde die Liste bei jedem Hin und Her wachsen;
       so kostet der Wechsel zwei Eintraege, einmal, und danach nichts
       mehr. */
    for (let i = 0; i < S.hintergruende.length; i++){
      if (S.hintergruende[i].h === a.h && S.hintergruende[i].html === a.html){
        // Nur melden, wenn gerade ein anderer galt - sonst stuende
        // dasselbe zehnmal hintereinander im Protokoll.
        if (S.hgZuletzt !== i){ S.hgZuletzt = i; merken('hintergrund', { nr: i }); }
        return;
      }
    }
    const bisher = S.hintergruende.reduce((s, x) => s + x.html.length, 0);
    if (bisher + a.html.length > HG_HOECHSTENS) return;
    S.hintergruende.push(a);
    S.hgZuletzt = S.hintergruende.length - 1;
    merken('hintergrund', { nr: S.hgZuletzt });
  } catch(e){ /* Ein fehlender Abzug ist kein Grund, die Stunde zu stoeren. */ }
}

function hintergrundBeobachten(){
  const t = document.getElementById('tisch');
  if (!t) return;
  let warten = null;
  const anstossen = () => {
    clearTimeout(warten);
    // Abwarten: Zoomen und Feld-Einschieben zeichnen den Tisch in
    // mehreren Schritten neu. Ein Abzug je Schritt waere Papierkrieg.
    warten = setTimeout(hintergrundPruefen, 350);
  };
  new MutationObserver(function(meldungen){
    for (const m of meldungen){
      // Kartenbewegungen loesen keinen Abzug aus - sonst liefe der
      // Beobachter bei jedem Ziehen mit, fuenfzigmal in der Sekunde.
      if (m.target.nodeType === 1 && m.target.closest
          && m.target.closest('.karte')) continue;
      if (m.type === 'childList'){
        const knoten = [].concat([].slice.call(m.addedNodes),
                                 [].slice.call(m.removedNodes));
        if (knoten.length && knoten.every(n => n.nodeType === 1 && n.classList
                                            && n.classList.contains('karte')))
          continue;
      }
      anstossen();
      return;
    }
  }).observe(t, { childList: true, subtree: true, attributes: true,
                  attributeFilter: ['style', 'class'] });
  // Ein getippter Gruppenname aendert kein Attribut; der Beobachter
  // saehe ihn nie.
  t.addEventListener('input', anstossen, true);
}

function flaechenbeschreibung(){
  const karten = {}, gruppen = {};
  document.querySelectorAll('.karte').forEach(k => {
    const code = k.dataset.code;
    const im = k.querySelector('img');
    if (!code || !im) return;
    karten[code] = im.getAttribute('src');
    if (k.dataset.gruppe) gruppen[code] = k.dataset.gruppe;
  });

  const stil = getComputedStyle(document.documentElement);
  const farbe = n => (stil.getPropertyValue(n) || '').trim();

  return {
    titel: titel,
    karten: karten,
    gruppen: gruppen,
    gemessen: flaechengemessen(),
    // Der Abzug des Hintergrundes samt seiner Zeitpunkte. `gemessen`
    // bleibt daneben stehen, damit ein aelteres Abspielgeraet ein neues
    // Paket weiter lesen kann.
    hintergrund: S.hintergruende.length
      ? { tisch: (typeof tisch !== 'undefined' && tisch)
                   ? [tisch.clientWidth, tisch.clientHeight] : null,
          bilder: S.hgBilder, stuecke: S.hintergruende }
      : null,
    haelften: (typeof HAELFTEN !== 'undefined') ? HAELFTEN : null,
    raster:   (typeof RASTER   !== 'undefined') ? RASTER   : null,
    farben: {
      rand:   farbe('--feld-rand')  || '#c9bda6',
      fuell:  farbe('--feld-fuell') || 'rgba(147,81,0,.045)',
      akzent: farbe('--akzent')     || '#9b8ac4',
      linie:  farbe('--linie')      || '#e4d9c7',
      hell:   farbe('--tinte-hell') || '#6c6357'
    }
  };
}

/* ============================================================
   Paket schnüren und abgeben

   HERAUSGELOEST (2026-08-22) nach bauen/paket.js. Hier standen der
   Zip-Schreiber (CRC-Tabelle, crc32, zip) und weiter unten der
   fetch-Aufruf an die Ablage. Beides braucht seit heute auch die
   Rueckmeldung - Rikes Auftrag war ausdruecklich, sie zu UEBERNEHMEN
   und nicht neu zu bauen: «weil es eigentlich alles schon gebaut ist».

   Eine zweite Fassung desselben Zip-Schreibers waere derselbe Fehler
   wie bei «Faktorisieren 2»: zwei Dinge, die dasselbe tun sollen und
   irgendwann nicht mehr dasselbe tun.

   paket.js muss VOR dieser Datei geladen werden - studie_bauen.py
   haengt beide in dieser Reihenfolge ein.
   ============================================================ */
const P = window.SORT_PAKET;
// Ohne paket.js wuerde die naechste Zeile werfen und aufnahme.js waere
// tot - mitten in einer Erhebung, ohne dass irgendjemand es merkte.
// Lieber laut und lebendig: Die Sortierflaeche laeuft weiter, und in
// der Konsole steht, was fehlt. werkzeuge/rueckmeldung_kontrolle.py
// prueft die Reihenfolge beim Bauen, damit es gar nicht so weit kommt.
if (!P){
  console.error('aufnahme.js: paket.js fehlt oder steht dahinter. '
              + 'Es wird nichts aufgezeichnet.');
  return;
}
const zip       = P.zip;
const zuBytes   = P.zuBytes;
const textBytes = P.textBytes;


function kopfdaten(){
  return {
    sitzung: S.sitzung, thema: thema, variante: variante, titel: titel,
    klasse: S.klasse, klassenkuerzel: KLASSENKUERZEL, namen: S.namen,
    beginn: S.beginn, adresse: location.href,
    geraet: {
      browser: navigator.userAgent,
      beruehrung: navigator.maxTouchPoints > 0,
      fenster: [innerWidth, innerHeight]
    }
  };
}

/* ============================================================
   Oberfläche
   ============================================================ */
const huelle = el('div', 'sortauf-huelle');
document.documentElement.appendChild(huelle);

function bildschirm(inhalt){
  huelle.innerHTML = '';
  huelle.style.display = 'grid';
  const k = el('div', 'sortauf-karte');
  k.appendChild(inhalt);
  huelle.appendChild(k);
}

/* ---------- 1. Wer sortiert hier? ---------- */
function bildschirmOhneKlasse(){
  const f = document.createDocumentFragment();
  f.appendChild(el('p', 'sortauf-hand', 'Kurzer Halt'));
  f.appendChild(el('h2', null, 'Diesem Link fehlt die Klasse'));
  f.appendChild(el('p', 'sortauf-lauf',
    'Damit eure Aufnahme später zugeordnet werden kann, muss die Klasse in '
    + 'der Adresse stehen. Benutzt bitte den Link, den ihr von eurer '
    + 'Lehrperson bekommen habt – am besten über den QR-Code.'));
  f.appendChild(el('p', 'sortauf-klein',
    'Ihr könnt hier trotzdem sortieren, es wird nur nichts aufgezeichnet.'));
  const w = el('button', 'sortauf-knopf', 'Ohne Aufnahme sortieren');
  w.onclick = () => huelle.remove();
  f.appendChild(w);
  bildschirm(f);
}

function bildschirmStart(){
  const f = document.createDocumentFragment();
  f.appendChild(el('p', 'sortauf-hand', 'Bevor es losgeht'));
  f.appendChild(el('h2', null, titel));
  f.appendChild(el('p', 'sortauf-lauf',
    'Diese Sortierung wird aufgezeichnet: euer Gespräch und die Bewegung der '
    + 'Karten auf dem Bildschirm.'));
  const kamera = el('div', 'sortauf-kamera');
  kamera.appendChild(el('b', null, 'Keine Kamera.'));
  kamera.appendChild(el('span', null,
    ' Die Webcam bleibt aus. Niemand sieht euch, es gibt kein Bild von euch – '
    + 'nur den Ton und die Karten.'));
  f.appendChild(kamera);

  const kf = el('div', 'sortauf-klasse');
  kf.appendChild(el('span', null, 'Klasse'));
  kf.appendChild(el('b', null, KLASSE.name));
  f.appendChild(kf);

  const nf = el('div', 'sortauf-feld');
  nf.appendChild(el('label', null, 'Wer sortiert mit?'));
  nf.appendChild(el('p', 'sortauf-klein',
    'Vornamen von allen, die mitmachen. Gibt es den Vornamen in eurer Klasse '
    + 'zweimal, hängt den ersten Buchstaben des Nachnamens an – also «Steffi B.».'));
  const gitter = el('div', 'sortauf-gitter');
  const felder = [];
  for (let i = 0; i < 4; i++){
    const inp = el('input'); inp.type = 'text'; inp.autocomplete = 'off';
    inp.placeholder = i < 2 ? 'Vorname' : 'falls dabei';
    felder.push(inp); gitter.appendChild(inp);
  }
  nf.appendChild(gitter);
  f.appendChild(nf);

  const ein = el('label', 'sortauf-haken');
  const box = el('input'); box.type = 'checkbox';
  ein.appendChild(box);
  ein.appendChild(el('span', null,
    'Wir wissen, dass Ton und Kartenbewegungen aufgezeichnet werden und '
    + 'dass keine Kamera läuft.'));
  f.appendChild(ein);

  const warn = el('p', 'sortauf-warn');
  f.appendChild(warn);

  const w = el('button', 'sortauf-knopf', 'Weiter zur Tonprüfung');
  w.onclick = () => {
    S.klasse = KLASSE.name;
    S.namen = felder.map(i => i.value.trim()).filter(Boolean);
    if (S.namen.length < 2){
      warn.textContent = 'Tragt bitte alle ein, die mitsortieren.'; return; }
    if (!box.checked){ warn.textContent = 'Bitte das Kästchen ankreuzen.'; return; }
    const kuerzel = S.namen.map(n => n.replace(/\W/g, '')).join('-');
    S.sitzung = zeitcode() + '-' + KLASSENKUERZEL + '-' + kuerzel;
    bildschirmTon();
  };
  f.appendChild(w);

  /* NEU (2026-09-10, Rikes Auftrag): der aufnahmefreie Weg.
     Der Elternbrief sagt ihn seit dem 19.08. zu - «Die Jugendlichen
     koennen die SORT-Aktivitaeten auch nutzen ohne dass die Daten
     aufgezeichnet werden». Bis jetzt gab es ihn nur, wenn die Klasse
     im Link fehlte, also aus Versehen.

     DREI ASYMMETRIEN, und sie sind der ganze Punkt. Rikes Sorge war,
     Gruppen koennten aus Versehen ablehnen und die Aufnahme ginge
     verloren:

     1. Der Ausweg ist ein LEISER Knopf unter dem lauten, keine zweite
        gleichwertige Wahl. Wer nur weiterklickt, nimmt auf.
     2. Er ist als TATSACHE formuliert, nicht als Vorliebe. Wer
        aufgenommen werden darf, kann ihn nicht wahrheitsgemaess
        druecken.
     3. Er kostet eine zweite Bestaetigung, auf der der laute Knopf
        zurueckfuehrt.

     Und er ist UMKEHRBAR: waehrend des Sortierens bleibt oben eine
     Zeile stehen, ueber die die Gruppe doch noch aufnehmen kann.
     mitschreibenStarten() schreibt die Lage aller Karten als
     'start'-Ereignis - der Stand geht dabei nicht verloren. */
  const aus = el('button', 'sortauf-neben',
    'Bei uns ist jemand dabei, der nicht aufgenommen werden darf');
  aus.onclick = () => bildschirmOhneAufnahme();
  f.appendChild(aus);

  bildschirm(f);
  setTimeout(() => felder[0].focus(), 100);
}

/* ---------- 1b. Ohne Aufnahme - Rueckfrage ---------- */
function bildschirmOhneAufnahme(){
  const f = document.createDocumentFragment();
  f.appendChild(el('p', 'sortauf-hand', 'Kurzer Halt'));
  f.appendChild(el('h2', null, 'Ohne Aufnahme sortieren'));
  f.appendChild(el('p', 'sortauf-lauf',
    'Das ist in Ordnung und ausdrücklich vorgesehen: Wer nicht '
    + 'aufgenommen wird, macht trotzdem mit. Es wird dann gar nichts '
    + 'gespeichert – kein Ton, keine Kartenbewegungen, keine Abgabe.'));

  const hinweis = el('div', 'sortauf-kamera');
  hinweis.appendChild(el('b', null, 'Zum Schluss:'));
  hinweis.appendChild(el('span', null,
    ' Drückt oben «Bild speichern» und gebt das Bild eurer '
    + 'Lehrperson. So sieht sie, was ihr gelegt habt.'));
  f.appendChild(hinweis);

  f.appendChild(el('p', 'sortauf-klein',
    'Wählt das nur, wenn wirklich jemand bei euch dabei ist, der nicht '
    + 'aufgenommen werden darf. Sonst geht uns eure Aufnahme verloren – '
    + 'und die brauchen wir, um die Aufgaben besser zu machen.'));

  const zurueck = el('button', 'sortauf-knopf', 'Zurück – bei uns dürfen alle');
  zurueck.onclick = () => bildschirmStart();
  f.appendChild(zurueck);

  const weiter = el('button', 'sortauf-neben', 'Ja, ohne Aufnahme sortieren');
  weiter.onclick = () => ohneAufnahmeLos();
  f.appendChild(weiter);

  bildschirm(f);
}

/* ---------- 1c. Ohne Aufnahme - die Flaeche freigeben ---------- */
function ohneAufnahmeLos(){
  huelle.style.display = 'none';

  /* Die Zeile bleibt stehen, damit der Weg zurueckfuehrt. Sie sagt
     zugleich der Gruppe waehrend der ganzen Stunde, dass nichts
     mitlaeuft - ein stummer Zustand waere schlechter als ein
     angezeigter. */
  const bar = document.querySelector('.leiste');
  const gruppe = el('span', 'sortauf-gruppe');
  gruppe.appendChild(el('span', 'sortauf-etikett', 'Ohne Aufnahme'));
  const zurueck = el('button', 'sortauf-schluss sortauf-leise', 'Doch aufnehmen');
  zurueck.onclick = () => {
    document.querySelectorAll('.sortauf-gruppe, .sortauf-schluss, .sortauf-notleiste')
            .forEach(e => e.remove());
    huelle.style.display = 'grid';
    bildschirmStart();
  };
  if (bar){
    bar.appendChild(el('div', 'trenner'));
    bar.appendChild(gruppe);
    bar.appendChild(zurueck);
    const m = document.getElementById('meldung');
    if (m) bar.appendChild(m);
  } else {
    const notleiste = el('div', 'sortauf-notleiste');
    notleiste.appendChild(gruppe);
    notleiste.appendChild(zurueck);
    document.body.insertBefore(notleiste, document.body.firstChild);
  }
}

/* ---------- 2. Hört das Mikrofon uns? ---------- */
function bildschirmTon(){
  const f = document.createDocumentFragment();
  f.appendChild(el('p', 'sortauf-hand', 'Fast geschafft'));
  f.appendChild(el('h2', null, 'Hört euch das Mikrofon?'));
  f.appendChild(el('p', 'sortauf-lauf',
    'Der Browser fragt gleich um Erlaubnis. Dann sagt bitte etwas – der Balken muss ausschlagen.'));

  const balken = el('div', 'sortauf-balken');
  const fuell = el('div', 'sortauf-fuell');
  balken.appendChild(fuell);
  f.appendChild(balken);

  const stand = el('p', 'sortauf-warn', 'Erlaubnis wird angefragt …');
  f.appendChild(stand);

  const los = el('button', 'sortauf-knopf', 'Sortieren beginnen');
  los.disabled = true;
  los.onclick = starten;
  f.appendChild(los);

  const nochmal = el('button', 'sortauf-neben', 'Nochmals versuchen');
  nochmal.onclick = () => bildschirmTon();
  nochmal.style.display = 'none';
  f.appendChild(nochmal);

  bildschirm(f);

  navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true }
  }).then(spur => {
    S.spur = spur;
    const geraet = spur.getAudioTracks()[0];
    stand.className = 'sortauf-hinweis';
    stand.textContent = 'Mikrofon: ' + (geraet.label || 'unbenannt') + '. Sagt bitte etwas.';

    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const an = ac.createAnalyser();
    an.fftSize = 1024;
    ac.createMediaStreamSource(spur).connect(an);
    const daten = new Uint8Array(an.fftSize);
    let laut = 0;

    (function messen(){
      an.getByteTimeDomainData(daten);
      let summe = 0;
      for (let i = 0; i < daten.length; i++){
        const v = (daten[i] - 128) / 128;
        summe += v * v;
      }
      const p = Math.min(1, Math.sqrt(summe / daten.length) * 6);
      S.pegel = p;
      fuell.style.width = (p * 100) + '%';
      fuell.className = 'sortauf-fuell' + (p > 0.12 ? ' gut' : '');
      if (p > 0.12) laut++;
      if (laut > 12 && los.disabled){
        los.disabled = false;
        stand.className = 'sortauf-gut';
        stand.textContent = 'Das Mikrofon hört euch. Ihr könnt loslegen.';
      }
      if (S.laeuft) return;
      requestAnimationFrame(messen);
    })();

    setTimeout(() => {
      if (los.disabled){
        stand.className = 'sortauf-warn';
        stand.textContent = 'Es kommt noch kein Ton an. Ist das richtige Mikrofon gewählt? '
                          + 'Ist der Ton stummgeschaltet? Ruft die Lehrperson.';
        nochmal.style.display = 'block';
        los.disabled = false;   // Notausgang: trotzdem weiter
        los.textContent = 'Trotzdem beginnen';
      }
    }, 20000);

  }).catch(fehler => {
    stand.className = 'sortauf-warn';
    stand.textContent = 'Der Browser gibt das Mikrofon nicht frei (' + fehler.name + '). '
      + 'Erlaubnis erteilen und nochmals versuchen – links in der Adresszeile auf das Schloss klicken.';
    nochmal.style.display = 'block';
  });
}

/* ---------- 3. Aufnahme läuft ---------- */
function starten(){
  S.laeuft = true;
  S.beginn = new Date().toISOString();
  S.t0 = performance.now();

  let typ = '';
  ['audio/webm;codecs=opus','audio/webm','audio/mp4'].some(t => {
    if (MediaRecorder.isTypeSupported(t)){ typ = t; return true; }
    return false;
  });
  S.aufnehmer = new MediaRecorder(S.spur, typ ? { mimeType: typ, audioBitsPerSecond: 64000 } : {});
  S.aufnehmer.ondataavailable = e => { if (e.data && e.data.size) S.brocken.push(e.data); };
  S.aufnehmer.start(5000);

  huelle.style.display = 'none';
  leiste();
  mitschreibenStarten();
  rundenbilderAbfangen();
  // Der erste Abzug gehoert zum Anfang, nicht zur ersten Aenderung.
  hintergrundPruefen();
  hintergrundBeobachten();

  addEventListener('beforeunload', e => {
    if (!S.laeuft) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

function leiste(){
  const bar = document.querySelector('.leiste');
  const ziel = bar || document.body;

  const gruppe = el('span', 'sortauf-gruppe');
  const punkt = el('span', 'sortauf-punkt');
  const zeit = el('span', 'sortauf-zeit', '00:00');
  const mini = el('span', 'sortauf-mini');
  const minifuell = el('i');
  mini.appendChild(minifuell);
  gruppe.appendChild(punkt);
  gruppe.appendChild(el('span', 'sortauf-etikett', 'Aufnahme läuft'));
  gruppe.appendChild(zeit);
  gruppe.appendChild(mini);

  const schluss = el('button', 'sortauf-schluss', 'Aufnahme beenden');
  schluss.id = 'aufnahmeEnde';
  schluss.onclick = beenden;

  if (bar){
    const tr = el('div', 'trenner');
    bar.appendChild(tr);
    bar.appendChild(gruppe);
    bar.appendChild(schluss);
    const m = document.getElementById('meldung');
    if (m) bar.appendChild(m);          // Meldung bleibt am Ende
  } else {
    const notleiste = el('div', 'sortauf-notleiste');
    notleiste.appendChild(gruppe);
    notleiste.appendChild(schluss);
    document.body.insertBefore(notleiste, document.body.firstChild);
  }

  const an = new (window.AudioContext || window.webkitAudioContext)();
  const a = an.createAnalyser(); a.fftSize = 512;
  an.createMediaStreamSource(S.spur).connect(a);
  const d = new Uint8Array(a.fftSize);

  S.uhr = setInterval(() => {
    zeit.textContent = dauerText(performance.now() - S.t0);
    a.getByteTimeDomainData(d);
    let sm = 0;
    for (let i = 0; i < d.length; i++){ const v = (d[i]-128)/128; sm += v*v; }
    minifuell.style.width = Math.min(100, Math.sqrt(sm/d.length) * 600) + '%';
  }, 500);
}

/* ---------- 4. Abgeben ---------- */
async function beenden(){
  if (!S.laeuft) return;
  if (!confirm('Aufnahme wirklich beenden? Danach kann nicht weitersortiert werden.')) return;
  S.laeuft = false;
  clearInterval(S.uhr);
  merken('ende', { karten: alleLagen() });
  // Der Abzug des Hintergrundes gehoert zum Zeitpunkt des Abgebens,
  // aus demselben Grund wie S.stand zwei Zeilen weiter unten: Bis das
  // Blatt erscheint, liegen mehrere Bildschirme dazwischen.
  hintergrundPruefen();
  // NEU (2026-09-13, Rikes Auftrag): Der eigene Stand wird JETZT
  // festgehalten, nicht erst am Schluss. Bis das Blatt erscheint, liegen
  // mehrere Bildschirme dazwischen; ein Fenster, das die Groesse
  // aendert, oder ein gerolltes Brett wuerden die gemessenen Rechtecke
  // verschieben. Der Stand gehoert zum Zeitpunkt des Abgebens.
  S.stand = eigeneSortierung();

  const fertig = new Promise(f => { S.aufnehmer.onstop = f; });
  S.aufnehmer.stop();
  await fertig;
  S.spur.getTracks().forEach(t => t.stop());

  document.querySelectorAll('.sortauf-gruppe, .sortauf-schluss, .sortauf-notleiste')
          .forEach(e => e.remove());

  // Ton und Endbild laufen im Hintergrund, während die Gruppe schreibt.
  const vorbereitet = (async () => ({
    ton: new Blob(S.brocken, { type: S.brocken[0] ? S.brocken[0].type : 'audio/webm' }),
    bild: await flaechenbild()
  }))();

  await rueckmeldungFragen();

  const f = document.createDocumentFragment();
  f.appendChild(el('p', 'sortauf-hand', 'Fertig'));
  f.appendChild(el('h2', null, 'Danke – das Paket wird geschnürt.'));
  f.appendChild(el('p', 'sortauf-lauf', 'Einen Moment …'));
  bildschirm(f);

  const { ton, bild } = await vorbereitet;
  const kopf = kopfdaten();
  kopf.ende = new Date().toISOString();
  kopf.dauer_s = Math.round((performance.now() - S.t0) / 1000);
  kopf.ereignisse = S.ereignisse.length;
  kopf.runden = S.zwischenbilder.length;
  kopf.rueckmeldung = S.rueckmeldung || '';

  const dateien = [
    { name: 'angaben.json',   daten: textBytes(JSON.stringify(kopf, null, 2)) },
    { name: 'flaeche.json',   daten: textBytes(JSON.stringify(flaechenbeschreibung())) },
    { name: 'protokoll.json', daten: textBytes(JSON.stringify(S.ereignisse)) },
    { name: 'ton.webm',       daten: await zuBytes(ton) }
  ];
  if (bild) dateien.push({ name: 'ergebnis.png', daten: await zuBytes(bild) });
  if (S.rueckmeldung)
    dateien.push({ name: 'rueckmeldung.txt', daten: textBytes(S.rueckmeldung) });
  for (const zb of S.zwischenbilder){
    dateien.push({ name: 'runde-' + String(zb.nr).padStart(2, '0') + '.png',
                   daten: await zuBytes(zb.blob) });
  }

  const paket = zip(dateien);
  // Kurz halten: Thema.Variante, wer sortiert hat, und die Uhrzeit
  // gegen Namensgleichheit, wenn eine Gruppe dieselbe Aufgabe wiederholt.
  const nummer = AUFGABE ? AUFGABE.thema + '.' + AUFGABE.variante
                         : thema + '_' + variante;
  const wer = S.namen.map(n => n.replace(/\W/g, '')).join('-').slice(0, 40);
  const d = new Date();
  const uhr = String(d.getHours()).padStart(2,'0') + String(d.getMinutes()).padStart(2,'0');
  const name = nummer + '_' + wer + '_' + uhr + '.zip';
  const mb = (paket.size / 1048576).toFixed(1);

  let hoch = false;
  if (CFG.abgabe){
    stand.textContent = 'Wird abgegeben (' + mb + ' MB) …';
    hoch = await P.abgeben(CFG.abgabe, CFG.schluessel, name, paket);
  }

  const g = document.createDocumentFragment();
  g.appendChild(el('p', 'sortauf-hand', 'Fertig'));

  if (hoch){
    g.appendChild(el('h2', null, 'Abgegeben. Danke!'));
    g.appendChild(el('p', 'sortauf-lauf',
      'Eure Aufnahme ist angekommen. Ihr könnt das Fenster schliessen.'));
    g.appendChild(el('p', 'sortauf-klein', 'Sitzungscode:'));
    g.appendChild(el('p', 'sortauf-code', S.sitzung));
    bildschirm(g);
    try { localStorage.removeItem('sort-protokoll-' + S.sitzung); } catch(e){}
    return;
  }

  g.appendChild(el('h2', null, 'Noch zwei Schritte'));
  g.appendChild(el('p', 'sortauf-lauf',
    'Eure Aufnahme ist fertig. Speichert sie und legt sie danach ab – '
    + 'dann seid ihr durch.'));

  /* Schritt 1 --------------------------------------------------- */
  const s1 = el('div', 'sortauf-schritt');
  s1.appendChild(el('span', 'sortauf-zahl', '1'));
  const s1t = el('div', 'sortauf-schritttext');
  s1t.appendChild(el('b', null, 'Aufnahme speichern'));
  s1t.appendChild(el('p', null, 'Sie landet in eurem Download-Ordner.'));
  s1.appendChild(s1t);
  g.appendChild(s1);

  const speichern = el('button', 'sortauf-knopf', 'Aufnahme speichern (' + mb + ' MB)');
  g.appendChild(speichern);

  /* Schritt 2 --------------------------------------------------- */
  const s2 = el('div', 'sortauf-schritt aus');
  s2.appendChild(el('span', 'sortauf-zahl', '2'));
  const s2t = el('div', 'sortauf-schritttext');
  s2t.appendChild(el('b', null, 'Datei abgeben'));
  s2t.appendChild(el('p', null,
    'Es öffnet sich ein neues Fenster. Zieht eure Datei hinein.'));
  const wo = el('p', 'sortauf-fundort', fundort());
  s2t.appendChild(wo);
  s2.appendChild(s2t);
  g.appendChild(s2);

  const abgeben = el('button', 'sortauf-knopf', 'Abgabefenster öffnen');
  abgeben.disabled = true;
  g.appendChild(abgeben);

  g.appendChild(el('p', 'sortauf-klein', 'So heisst eure Datei:'));
  g.appendChild(el('p', 'sortauf-code', name));

  speichern.onclick = () => {
    const a = el('a');
    a.href = URL.createObjectURL(paket); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 6000);
    speichern.textContent = 'Gespeichert ✓ – nochmals speichern';
    speichern.classList.add('sortauf-erledigt');
    s2.classList.remove('aus');
    if (CFG.ablage) abgeben.disabled = false;
  };

  /* Schritt 3 --------------------------------------------------- */
  const s3 = el('div', 'sortauf-schritt aus');
  s3.appendChild(el('span', 'sortauf-zahl', '3'));
  const s3t = el('div', 'sortauf-schritttext');
  s3t.appendChild(el('b', null, 'Bestätigen'));
  s3t.appendChild(el('p', null,
    'Wenn die Datei drüben angekommen ist, drückt hier.'));
  s3.appendChild(s3t);
  g.appendChild(s3);

  const bestaetigen = el('button', 'sortauf-knopf', 'Wir haben abgegeben');
  bestaetigen.disabled = true;
  g.appendChild(bestaetigen);

  if (CFG.ablage){
    abgeben.onclick = () => {
      // kleines Fenster, damit die Sortierung dahinter sichtbar bleibt
      const b = Math.min(900, Math.round(screen.width * 0.62));
      const h = Math.min(720, Math.round(screen.height * 0.72));
      const l = Math.round((screen.width - b) / 2);
      const o = Math.round((screen.height - h) / 2.6);
      S.fenster = window.open(CFG.ablage, 'sortabgabe',
        `width=${b},height=${h},left=${l},top=${o},resizable=yes,scrollbars=yes`);
      if (!S.fenster) window.open(CFG.ablage, '_blank', 'noopener');
      abgeben.textContent = 'Abgabefenster nochmals öffnen';
      abgeben.classList.add('sortauf-erledigt');
      s3.classList.remove('aus');
      bestaetigen.disabled = false;
      merken('abgabefenster');
    };
  } else {
    abgeben.textContent = 'Kein Abgabeort eingerichtet';
    s2t.querySelector('p').textContent =
      'Gebt die gespeicherte Datei eurer Lehrperson.';
    s2t.querySelector('.sortauf-fundort').remove();
    s3.classList.remove('aus');
    bestaetigen.disabled = false;
  }

  bestaetigen.onclick = () => {
    if (S.fenster && !S.fenster.closed){ try { S.fenster.close(); } catch(e){} }
    merken('abgegeben');
    danke();
  };

  bildschirm(g);

  try { localStorage.removeItem('sort-protokoll-' + S.sitzung); } catch(e){}
}

/* ============================================================
   Das Blatt - Rikes Auftrag vom 2026-09-13

   «Ich glaub, es waer gut, wenn die Schueler am Ende, wenn sie abgegeben
   haben, irgendeine Form von Rueckmeldung bekommen. Und das aber nicht
   in Form von der Liste, sondern einfach auch von 'nem Bild ... Sie
   muessten quasi Ihre Sortierung sehen und Sie muessten sehen, was
   moegliche echte Sortierungen sind ... dass sie wirklich nur die
   Figuren auch sehen, die sie am Ende wirklich selber auch in der Hand
   hatten.»

   Drei Entscheidungen stecken darin, alle von Rike:

   KEIN ROT UND KEIN GRUEN. Nirgends steht, was falsch war. Nebeneinander
   sieht man, dass eine Reihe links zwei Reihen rechts entspricht - und
   genau darueber soll geredet werden. Das ist derselbe Grund, aus dem
   PRUEFKNOPF ausgeschaltet bleibt: Nichts soll sich wegklicken lassen.

   «KOENNTE» STATT «IST». Rechts steht EINE moegliche Sortierung. Wo es
   keine gibt - «Immer - manchmal - nie» haengt an der Begruendung, nicht
   an der Spalte -, traegt keine Karte eine Gruppenmarke, und dann
   entfaellt die rechte Seite von selbst.

   NUR DIE EIGENEN KARTEN. Rechts liegen genau die Karten, die auch links
   liegen. Wer nie nachgelegt hat, sieht keine Figur, die er nie gesehen
   hat.
   ============================================================ */

function sichtbareKarten(){
  return Array.prototype.filter.call(
    document.querySelectorAll('.karte'),
    k => k.dataset.code && !(k.style && k.style.display === 'none'));
}

/* Welche Karte liegt in welchem Feld?

   GEMESSEN, nicht abgefragt: In den Rasterfeldern rastet nichts ein -
   `einrasten()` im Kern greift nur bei `rolle === 'ablage'`, und `_feld`
   bleibt deshalb bei den Gruppenfeldern leer. Die Zugehoerigkeit
   entsteht also dort, wo die Karte liegt, und genau so wird sie hier
   gelesen: Mittelpunkt der Karte im Rechteck des Feldes.

   Das ist zugleich die Auskunft, die die Gruppe erwartet - sie hat die
   Karte ja hingelegt, nicht eingerastet. */
function eigeneSortierung(){
  const felder = Array.prototype.map.call(
    document.querySelectorAll('.rasterfeld'), f => {
      const e = f.querySelector('input.titel');
      const s = f.querySelector('span');
      return {
        name:   e ? e.value.trim() : (s ? s.textContent.trim() : ''),
        ersatz: e ? (e.placeholder || '') : (s ? s.textContent.trim() : ''),
        r: f.getBoundingClientRect(),
        codes: []
      };
    });
  const rest = [];
  sichtbareKarten().forEach(k => {
    const b = k.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    let wo = -1;
    for (let i = 0; i < felder.length; i++){
      const r = felder[i].r;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom){ wo = i; break; }
    }
    if (wo >= 0) felder[wo].codes.push(k.dataset.code);
    else rest.push(k.dataset.code);
  });
  return { felder: felder.filter(f => f.codes.length), rest: rest };
}

/* Die Klassen - aber nur mit den Karten, die auf dem Tisch lagen. */
function moeglicheSortierung(){
  const nach = {}, folge = [];
  sichtbareKarten().forEach(k => {
    const g = k.dataset.gruppe;
    if (g === undefined) return;
    if (!nach[g]){ nach[g] = []; folge.push(g); }
    nach[g].push(k.dataset.code);
  });
  // Die leere Marke sind die Einzelgaenger - sie kommen zuletzt, wie auf
  // dem Brett auch, und tragen dort ihren eigenen Satz.
  folge.sort((a, b) => (a === '' ? 1 : 0) - (b === '' ? 1 : 0));
  return folge.map(g => ({ leer: g === '', codes: nach[g] }));
}

function blattKarte(code, bilder){
  const b = el('button', 'sortauf-bk');
  b.type = 'button';
  b.dataset.code = code;
  b.setAttribute('aria-label', 'Karte ' + code);
  const q = bilder[code];
  if (q){ const i = el('img'); i.src = q; i.alt = ''; b.appendChild(i); }
  else   { b.textContent = code; }
  return b;
}

function blattReihe(name, codes, bilder, still){
  const d = el('div', 'sortauf-breihe' + (still ? ' still' : '')
                    + (name ? '' : ' ohne-namen'));
  const n = el('p', 'sortauf-bname');
  n.appendChild(document.createTextNode(name));
  n.appendChild(el('span', 'sortauf-bzahl', String(codes.length)));
  d.appendChild(n);
  const w = el('div', 'sortauf-bkarten');
  codes.forEach(c => w.appendChild(blattKarte(c, bilder)));
  d.appendChild(w);
  return d;
}

function blattZeigen(){
  const stand = S.stand;
  if (!stand || (!stand.felder.length && !stand.rest.length)) return false;

  // Die Bilder liegen schon in der Flaechenbeschreibung - Code auf
  // Bildquelle. Kein zweiter Weg, keine zweite Wahrheit.
  const bilder = {};
  sichtbareKarten().forEach(k => {
    const i = k.querySelector('img');
    if (i) bilder[k.dataset.code] = i.getAttribute('src');
  });

  const loesung = moeglicheSortierung();
  const f = document.createDocumentFragment();

  f.appendChild(el('p', 'sortauf-hand', 'Geschafft'));
  f.appendChild(el('h2', null, 'Danke – und hier ist eure Sortierung.'));
  f.appendChild(el('p', 'sortauf-lauf', loesung.length
    ? 'Links, wie ihr gelegt habt. Rechts, wie es auch liegen könnte. '
      + 'Es sind dieselben Karten – nur anders gruppiert. Schaut euch die '
      + 'Stellen an, an denen die beiden Seiten nicht übereinstimmen.'
    : 'So habt ihr gelegt. Bei dieser Aufgabe gibt es keine eine richtige '
      + 'Sortierung – sie hängt an eurer Begründung, nicht an der Zuordnung.'));

  const seiten = el('div', 'sortauf-bseiten' + (loesung.length ? '' : ' einzeln'));

  const links = el('div', 'sortauf-bseite');
  links.appendChild(el('p', 'sortauf-bkopf', 'So habt ihr gelegt'));
  stand.felder.forEach(g => {
    links.appendChild(blattReihe(g.name || g.ersatz || 'ohne Namen',
                                 g.codes, bilder, !g.name));
  });
  if (stand.rest.length)
    links.appendChild(blattReihe('noch nicht zugeordnet', stand.rest, bilder, true));
  seiten.appendChild(links);

  if (loesung.length){
    const rechts = el('div', 'sortauf-bseite loesung');
    rechts.appendChild(el('p', 'sortauf-bkopf', 'So könnte es auch liegen'));
    loesung.forEach(g => {
      // Die Klassen tragen im Dokument nur ihren Schluessel, keinen
      // Klartext. Statt einen Namen zu erfinden, den die Aufgabe nicht
      // kennt, steht hier keiner: Das Benennen ist ja die Arbeit der
      // Gruppe, und verglichen wird, WELCHE Karten zusammenliegen.
      rechts.appendChild(blattReihe(
        g.leer ? 'jede für sich allein' : '', g.codes, bilder, true));
    });
    seiten.appendChild(rechts);
  }
  f.appendChild(seiten);

  if (loesung.length)
    f.appendChild(el('p', 'sortauf-bfuss',
      'Tippt eine Karte an – dann seht ihr, wo dieselbe Karte auf der '
      + 'anderen Seite liegt.'));

  f.appendChild(el('p', 'sortauf-klein', 'Sitzungscode:'));
  f.appendChild(el('p', 'sortauf-code', S.sitzung));

  bildschirm(f);
  const karte = huelle.querySelector('.sortauf-karte');
  if (karte) karte.classList.add('breit');

  let hell = null;
  huelle.addEventListener('click', e => {
    const b = e.target.closest ? e.target.closest('.sortauf-bk') : null;
    huelle.querySelectorAll('.sortauf-bk.leuchtet')
          .forEach(x => x.classList.remove('leuchtet'));
    if (!b || b.dataset.code === hell){ hell = null; return; }
    hell = b.dataset.code;
    huelle.querySelectorAll('.sortauf-bk[data-code="' + hell + '"]')
          .forEach(x => x.classList.add('leuchtet'));
  });

  merken('blatt-gezeigt', { gruppen: stand.felder.length,
                            klassen: loesung.length,
                            karten: sichtbareKarten().length });
  try { localStorage.removeItem('sort-protokoll-' + S.sitzung); } catch(e){}
  return true;
}

function rueckmeldungFragen(){
  return new Promise(fertig => {
    const f = document.createDocumentFragment();
    f.appendChild(el('p', 'sortauf-hand', 'Eine letzte Frage'));
    f.appendChild(el('h2', null, 'Was nehmt ihr mit?'));
    f.appendChild(el('p', 'sortauf-lauf',
      'Worum ging es bei dieser Aufgabe eurer Meinung nach? Habt ihr etwas '
      + 'Neues gemerkt oder gab es einen Moment, in dem euch etwas '
      + 'aufgegangen ist? Schreibt in eigenen Worten – zwei, drei Sätze '
      + 'genügen. Es gibt kein Richtig oder Falsch.'));

    const feld = document.createElement('textarea');
    feld.className = 'sortauf-antwort';
    feld.rows = 5;
    feld.placeholder = 'Uns ist aufgefallen, dass …';
    f.appendChild(feld);

    const warn = el('p', 'sortauf-warn');
    f.appendChild(warn);

    const weiter = el('button', 'sortauf-knopf', 'Weiter');
    weiter.onclick = () => {
      const txt = feld.value.trim();
      if (txt.length < 10){
        warn.textContent = 'Schreibt bitte noch etwas mehr – ein Satz reicht schon.';
        feld.focus();
        return;
      }
      S.rueckmeldung = txt;
      merken('rueckmeldung', { zeichen: txt.length });
      fertig();
    };
    f.appendChild(weiter);

    const ohne = el('button', 'sortauf-neben', 'Uns fällt gerade nichts ein');
    ohne.onclick = () => {
      S.rueckmeldung = '';
      merken('rueckmeldung', { zeichen: 0 });
      fertig();
    };
    f.appendChild(ohne);

    bildschirm(f);
    setTimeout(() => feld.focus(), 120);
  });
}

function danke(){
  // GEAENDERT (2026-09-13, Rikes Auftrag): «Ich glaube, das Blatt darf
  // nach Abgabe selbst erscheinen.» Also erscheint es hier, ohne Knopf -
  // die Gruppe sitzt in diesem Moment noch beieinander und redet.
  //
  // Der Dank steht weiter oben auf dem Blatt; ein eigener Bildschirm
  // dafuer haette das Blatt hinter einen zweiten Klick geschoben.
  if (blattZeigen()) return;

  const d = document.createDocumentFragment();
  d.appendChild(el('p', 'sortauf-hand', 'Geschafft'));
  d.appendChild(el('h2', null, 'Danke für eure Arbeit!'));
  d.appendChild(el('p', 'sortauf-lauf',
    'Eure Sortierung ist bei uns angekommen. Ihr könnt das Fenster jetzt '
    + 'schliessen – einen schönen Tag noch.'));
  d.appendChild(el('p', 'sortauf-klein', 'Sitzungscode:'));
  d.appendChild(el('p', 'sortauf-code', S.sitzung));
  bildschirm(d);
  try { localStorage.removeItem('sort-protokoll-' + S.sitzung); } catch(e){}
}

/* ============================================================
   Anstrich
   ============================================================ */
const stil = document.createElement('style');
stil.textContent = `
:root{
  --sa-papier:#fbf8f3; --sa-creme:#f6ecdf; --sa-karte:#fffefb;
  --sa-tinte:#2d2924;  --sa-hell:#6c6357;  --sa-braun:#935100;
  --sa-linie:#e4d9c7;  --sa-gruen:#4f7a3a; --sa-rot:#b4474f;
  --sa-druck:'Fira Sans','Segoe UI',-apple-system,sans-serif;
  --sa-hand:'Patrick Hand','Bradley Hand',cursive;
}
.sortauf-huelle{position:fixed;inset:0;z-index:99998;display:grid;place-items:center;
  background:rgba(45,41,36,.78);backdrop-filter:blur(3px);padding:20px;overflow:auto;
  font-family:var(--sa-druck);color:var(--sa-tinte);}
.sortauf-karte{background:var(--sa-papier);max-width:480px;width:100%;
  padding:28px 32px 26px;border-top:4px solid var(--sa-braun);
  box-shadow:0 26px 60px rgba(45,35,20,.4);}
.sortauf-hand{font-family:var(--sa-hand);font-size:1.34rem;color:var(--sa-braun);
  margin:0 0 4px;transform:rotate(-1deg);display:inline-block;}
.sortauf-karte h2{margin:0 0 12px;font-size:1.34rem;font-weight:700;line-height:1.24;
  letter-spacing:-.01em;}
.sortauf-lauf{margin:0 0 20px;font-size:.95rem;line-height:1.55;color:#463f36;}
.sortauf-kamera{background:var(--sa-creme);border-left:3px solid var(--sa-gruen);
  padding:11px 14px;margin:0 0 18px;font-size:.89rem;line-height:1.5;}
.sortauf-kamera b{color:var(--sa-gruen);}
.sortauf-klein{margin:2px 0 9px;font-size:.83rem;color:var(--sa-hell);line-height:1.45;}
.sortauf-klasse{background:var(--sa-creme);border-left:3px solid var(--sa-braun);
  padding:9px 13px;margin:0 0 17px;}
.sortauf-klasse span{display:block;font-size:.72rem;letter-spacing:.12em;
  text-transform:uppercase;font-weight:700;color:var(--sa-hell);}
.sortauf-klasse b{font-size:1rem;}
.sortauf-feld{margin-bottom:17px;}
.sortauf-feld label{display:block;font-size:.8rem;font-weight:700;margin-bottom:5px;}
.sortauf-huelle input[type=text]{width:100%;padding:10px 12px;font-size:.96rem;
  font-family:inherit;border:1px solid var(--sa-linie);border-radius:3px;
  background:#fff;color:var(--sa-tinte);}
.sortauf-huelle input[type=text]:focus{outline:2px solid var(--sa-braun);
  outline-offset:1px;border-color:var(--sa-braun);}
.sortauf-antwort{width:100%;padding:11px 13px;font-size:.96rem;font-family:inherit;
  line-height:1.5;border:1px solid var(--sa-linie);border-radius:3px;background:#fff;
  color:var(--sa-tinte);resize:vertical;margin-bottom:12px;}
.sortauf-antwort:focus{outline:2px solid var(--sa-braun);outline-offset:1px;
  border-color:var(--sa-braun);}
.sortauf-gitter{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.sortauf-haken{display:flex;gap:10px;align-items:flex-start;margin:4px 0 18px;
  font-size:.89rem;line-height:1.45;cursor:pointer;}
.sortauf-haken input{margin-top:3px;width:17px;height:17px;accent-color:var(--sa-braun);
  flex:none;}
.sortauf-knopf{width:100%;padding:13px;font-family:inherit;font-size:1rem;font-weight:600;
  border:none;border-radius:3px;background:var(--sa-braun);color:#fff;cursor:pointer;}
.sortauf-knopf:hover{background:#7d4500;}
.sortauf-knopf:disabled{background:#c9c0b4;cursor:default;}
.sortauf-neben{display:block;width:100%;margin-top:10px;padding:8px;font-family:inherit;
  font-size:.85rem;background:none;border:none;color:var(--sa-hell);cursor:pointer;
  text-decoration:underline;text-underline-offset:3px;}
.sortauf-warn{margin:0 0 13px;font-size:.87rem;color:var(--sa-rot);min-height:1.2em;
  line-height:1.45;}
.sortauf-hinweis{margin:0 0 13px;font-size:.87rem;color:var(--sa-hell);min-height:1.2em;}
.sortauf-gut{margin:0 0 13px;font-size:.87rem;color:var(--sa-gruen);font-weight:600;
  min-height:1.2em;}
.sortauf-balken{height:17px;background:var(--sa-creme);border-radius:9px;overflow:hidden;
  margin:0 0 13px;border:1px solid var(--sa-linie);}
.sortauf-fuell{height:100%;width:0;background:#cdbfa9;transition:width .08s linear;}
.sortauf-fuell.gut{background:var(--sa-gruen);}
.sortauf-schritt{display:flex;gap:12px;align-items:flex-start;margin:18px 0 10px;
  transition:opacity .25s;}
.sortauf-schritt.aus{opacity:.4;}
.sortauf-zahl{flex:none;width:26px;height:26px;border-radius:50%;background:var(--sa-braun);
  color:#fff;display:grid;place-items:center;font-weight:700;font-size:.88rem;}
.sortauf-schritttext b{display:block;font-size:1rem;margin-bottom:2px;}
.sortauf-schritttext p{margin:0;font-size:.87rem;color:var(--sa-hell);line-height:1.45;}
.sortauf-fundort{margin:7px 0 0!important;font-family:var(--sa-hand);
  font-size:1.06rem!important;color:var(--sa-braun)!important;line-height:1.3!important;}
.sortauf-erledigt{background:var(--sa-gruen)!important;}
.sortauf-erledigt:hover{background:#3f6330!important;}
.sortauf-code{margin:2px 0 0;font-family:ui-monospace,Menlo,Consolas,monospace;
  font-size:.95rem;font-weight:600;color:var(--sa-braun);background:var(--sa-creme);
  padding:9px 11px;border-radius:3px;word-break:break-all;}

/* --- in der Werkzeugleiste der Sortierfläche --- */
.sortauf-gruppe{display:inline-flex;align-items:center;gap:7px;
  font-family:var(--sa-druck);font-size:.8rem;color:var(--sa-hell);}
.sortauf-punkt{width:8px;height:8px;border-radius:50%;background:var(--sa-rot);flex:none;
  animation:sortauf-puls 1.6s ease-in-out infinite;}
@keyframes sortauf-puls{0%,100%{opacity:1}50%{opacity:.22}}
.sortauf-etikett{font-weight:600;color:var(--sa-tinte);}
.sortauf-zeit{font-family:ui-monospace,Menlo,Consolas,monospace;}
.sortauf-mini{width:44px;height:5px;background:var(--sa-linie);border-radius:3px;
  overflow:hidden;flex:none;}
.sortauf-mini i{display:block;height:100%;width:0;background:var(--sa-gruen);
  transition:width .25s;}
.sortauf-schluss{font-family:var(--sa-druck);font-size:.85rem;font-weight:600;
  padding:7px 14px;border:1px solid var(--sa-braun);border-radius:3px;
  background:var(--sa-braun);color:#fff;cursor:pointer;}
.sortauf-schluss:hover{background:#7d4500;border-color:#7d4500;}
/* NEU (2026-09-10): Der Rueckweg aus dem aufnahmefreien Sortieren traegt
   denselben Umriss, aber nicht die Fuellung. «Aufnahme beenden» ist die
   Hauptsache der Stunde und darf laut sein; «Doch aufnehmen» ist ein
   Notausgang fuer den Fehlklick und war als gefuellter Knopf der
   lauteste Punkt der ganzen Leiste. */
.sortauf-schluss.sortauf-leise{background:none;color:var(--sa-braun);
  font-weight:500;padding:6px 11px;}
.sortauf-schluss.sortauf-leise:hover{background:var(--sa-creme);
  border-color:var(--sa-braun);color:var(--sa-braun);}
.sortauf-notleiste{display:flex;align-items:center;gap:12px;padding:8px 14px;
  background:var(--sa-creme);border-bottom:1px solid var(--sa-linie);}
/* ---- Das Blatt (2026-09-13) ----
   Es braucht Breite, die uebrigen Bildschirme nicht. Deshalb eine
   Zusatzklasse statt einer breiteren Grundkarte - sonst saehen alle
   anderen Schritte ploetzlich anders aus. */
.sortauf-karte.breit{max-width:1080px;}
.sortauf-bseiten{display:grid;gap:16px;grid-template-columns:1fr 1fr;
  align-items:start;margin:4px 0 6px;}
.sortauf-bseiten.einzeln{grid-template-columns:1fr;}
@media (max-width:820px){.sortauf-bseiten{grid-template-columns:1fr}}
.sortauf-bkopf{margin:0 0 10px;font-size:.68rem;font-weight:700;
  letter-spacing:.15em;text-transform:uppercase;color:var(--sa-hell);
  padding-bottom:6px;border-bottom:2px solid var(--sa-linie);}
.sortauf-bseite.loesung .sortauf-bkopf{border-bottom-color:var(--sa-braun);
  color:var(--sa-braun);}
.sortauf-breihe{border:1.5px dashed var(--sa-linie);border-radius:7px;
  padding:7px 8px 8px;margin:0 0 8px;background:var(--sa-karte);}
.sortauf-bseite.loesung .sortauf-breihe{border-color:#d9c39c;}
.sortauf-bname{margin:0 0 5px;font-family:var(--sa-hand);font-size:1.06rem;
  line-height:1.2;color:var(--sa-tinte);display:flex;gap:7px;align-items:baseline;
  min-height:1.2em;}
.sortauf-breihe.still .sortauf-bname{color:var(--sa-hell);}
.sortauf-bzahl{font-family:var(--sa-druck);font-size:.68rem;font-weight:600;
  color:var(--sa-hell);flex:none;}
/* Eine Reihe ohne Namen - rechts kennt die Flaeche nur den Schluessel der
   Klasse, keinen Klartext, und einen zu erfinden waere geraten. Dann soll
   die Zahl auch nicht wie ein Name aussehen: sie rueckt nach rechts und
   wird leiser. Sobald die Themen einen Klarnamen mitgeben, steht er hier. */
.sortauf-breihe.ohne-namen .sortauf-bname{justify-content:flex-end;
  min-height:0;margin:0 2px 4px 0;opacity:.55;}
.sortauf-bkarten{display:flex;flex-wrap:wrap;gap:4px;}
.sortauf-bk{width:66px;height:56px;padding:0;border:0;border-radius:3px;
  background:var(--sa-karte);cursor:pointer;overflow:hidden;
  filter:drop-shadow(0 1px 2px rgba(90,70,35,.22));
  outline:2px solid transparent;outline-offset:2px;
  font:600 .62rem/56px var(--sa-druck);color:var(--sa-hell);
  transition:transform .14s ease,outline-color .14s ease;}
.sortauf-bk img{width:100%;height:100%;display:block;pointer-events:none;}
.sortauf-bk:hover{transform:translateY(-2px);}
.sortauf-bk:focus-visible{outline-color:var(--sa-braun);}
.sortauf-bk.leuchtet{outline-color:var(--sa-braun);transform:translateY(-2px);}
.sortauf-bfuss{margin:6px 0 16px;font-size:.85rem;color:var(--sa-hell);}
@media (prefers-reduced-motion:reduce){.sortauf-punkt{animation:none}
  .sortauf-bk{transition:none}}
@media (max-width:520px){.sortauf-karte{padding:22px 20px}
  .sortauf-bk{width:54px;height:46px}}
`;
document.head.appendChild(stil);

/* ---------- Los ---------- */
const anfang = () => KLASSE ? bildschirmStart() : bildschirmOhneKlasse();
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', anfang);
else anfang();

})();
