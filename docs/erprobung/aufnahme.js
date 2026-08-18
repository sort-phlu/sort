/* ============================================================
   SORT – Aufnahmemodul
   Wird von aussen an eine beliebige sortieren.html gehängt.
   Verändert die Sortierfläche nicht, liest sie nur mit.

   Liegt nur im Erprobungsordner. Die oeffentlichen Sortierflaechen
   binden diese Datei nicht ein und nehmen deshalb nichts auf.
   ============================================================ */
(function(){
'use strict';

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

/* ---------- Woher kommt diese Aufgabe? ---------- */
const pfad = location.pathname.split('/').filter(Boolean);
// Endet die Adresse auf einen Dateinamen, faellt der weg: der letzte
// echte Abschnitt ist die Variante, der davor das Thema.
if (pfad.length && pfad[pfad.length - 1].indexOf('.') >= 0) pfad.pop();
const variante = pfad.length >= 1 ? pfad[pfad.length - 1] : 'unbekannt';
const thema    = pfad.length >= 2 ? pfad[pfad.length - 2] : 'unbekannt';
const titel    = document.title || '';

/* ---------- Zustand ---------- */
const S = {
  sitzung: null, klasse: '', namen: [],
  beginn: null, t0: 0,
  ereignisse: [], spur: null, aufnehmer: null, brocken: [],
  laeuft: false, zuletztGezogen: {}, uhr: null, pegel: 0,
  zwischenbilder: [], runde: 0, fenster: null, rueckmeldung: ''
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
  try {
    if (typeof HAELFTEN !== 'undefined' && HAELFTEN && typeof tisch !== 'undefined'){
      const b = (typeof breite !== 'undefined' ? breite : 170);
      l.haelfte = (l.x + b / 2) < tisch.clientWidth * HAELFTEN.teiler
                ? HAELFTEN.links : HAELFTEN.rechts;
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
  const knoepfe = {
    pruefen: 'pruefen', raster: 'raster', zurueck: 'zurueck',
    kleiner: 'zoom-kleiner', groesser: 'zoom-groesser',
    runde: 'neue-runde', zufall: 'zufaellig-fuellen', bild: 'bild-gespeichert'
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
   Paket schnüren (Zip ohne Komprimierung)
   ============================================================ */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++){
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(u8){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(dateien){
  const teile = [], zentral = [];
  let versatz = 0;
  const txt = new TextEncoder();

  dateien.forEach(d => {
    const name = txt.encode(d.name);
    const roh  = d.daten;
    const summe = crc32(roh);

    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true);
    kopf.setUint16(4, 20, true); kopf.setUint16(6, 0, true); kopf.setUint16(8, 0, true);
    kopf.setUint16(10, 0, true); kopf.setUint16(12, 0, true);
    kopf.setUint32(14, summe, true);
    kopf.setUint32(18, roh.length, true); kopf.setUint32(22, roh.length, true);
    kopf.setUint16(26, name.length, true); kopf.setUint16(28, 0, true);
    teile.push(new Uint8Array(kopf.buffer), name, roh);

    const z = new DataView(new ArrayBuffer(46));
    z.setUint32(0, 0x02014b50, true);
    z.setUint16(4, 20, true); z.setUint16(6, 20, true);
    z.setUint32(16, summe, true);
    z.setUint32(20, roh.length, true); z.setUint32(24, roh.length, true);
    z.setUint16(28, name.length, true);
    z.setUint32(42, versatz, true);
    zentral.push(new Uint8Array(z.buffer), name);

    versatz += 30 + name.length + roh.length;
  });

  let zlen = 0;
  zentral.forEach(t => zlen += t.length);
  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true);
  ende.setUint16(8, dateien.length, true); ende.setUint16(10, dateien.length, true);
  ende.setUint32(12, zlen, true); ende.setUint32(16, versatz, true);

  return new Blob(teile.concat(zentral, [new Uint8Array(ende.buffer)]),
                  { type: 'application/zip' });
}

const zuBytes = async b => new Uint8Array(await b.arrayBuffer());
const textBytes = s => new TextEncoder().encode(s);

function kopfdaten(){
  return {
    sitzung: S.sitzung, thema: thema, variante: variante, titel: titel,
    klasse: S.klasse, namen: S.namen,
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

  const kf = el('div', 'sortauf-feld');
  kf.appendChild(el('label', null, 'Klasse'));
  const klasse = el('input'); klasse.type = 'text'; klasse.placeholder = 'z. B. 7a';
  klasse.autocomplete = 'off';
  kf.appendChild(klasse);
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
    S.klasse = klasse.value.trim();
    S.namen = felder.map(i => i.value.trim()).filter(Boolean);
    if (!S.klasse){ warn.textContent = 'Die Klasse fehlt noch.'; return; }
    if (S.namen.length < 2){
      warn.textContent = 'Tragt bitte alle ein, die mitsortieren.'; return; }
    if (!box.checked){ warn.textContent = 'Bitte das Kästchen ankreuzen.'; return; }
    const kuerzel = S.namen.map(n => n.replace(/\W/g, '')).join('-');
    S.sitzung = zeitcode() + '-' + S.klasse.replace(/\W/g, '') + '-' + kuerzel;
    bildschirmTon();
  };
  f.appendChild(w);

  bildschirm(f);
  setTimeout(() => klasse.focus(), 100);
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
  const name = 'SORT_' + thema + '_' + variante + '_' + S.sitzung + '.zip';
  const mb = (paket.size / 1048576).toFixed(1);

  let hoch = false;
  if (CFG.abgabe){
    stand.textContent = 'Wird abgegeben (' + mb + ' MB) …';
    try {
      const antwort = await fetch(CFG.abgabe + '/' + encodeURIComponent(name), {
        method: 'PUT',
        headers: CFG.schluessel ? { 'Authorization': 'Basic ' + btoa(CFG.schluessel + ':') } : {},
        credentials: 'omit',
        body: paket
      });
      hoch = antwort.ok || antwort.status === 201 || antwort.status === 204;
    } catch(e){ hoch = false; }
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
.sortauf-notleiste{display:flex;align-items:center;gap:12px;padding:8px 14px;
  background:var(--sa-creme);border-bottom:1px solid var(--sa-linie);}
@media (prefers-reduced-motion:reduce){.sortauf-punkt{animation:none}}
@media (max-width:520px){.sortauf-karte{padding:22px 20px}}
`;
document.head.appendChild(stil);

/* ---------- Los ---------- */
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', bildschirmStart);
else bildschirmStart();

})();
