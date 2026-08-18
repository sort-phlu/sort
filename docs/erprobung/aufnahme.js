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
  ziehrate: 50          // Millisekunden zwischen zwei Positionsmeldungen beim Ziehen
}, window.SORT_ABGABE || {});

/* ---------- Woher kommt diese Aufgabe? ---------- */
const pfad     = location.pathname.split('/').filter(Boolean);
const variante = pfad.length >= 2 ? pfad[pfad.length - 2] : 'unbekannt';
const thema    = pfad.length >= 3 ? pfad[pfad.length - 3] : 'unbekannt';
const titel    = document.title || '';

/* ---------- Zustand ---------- */
const S = {
  sitzung: null, klasse: '', gruppe: '', kennziffern: [],
  beginn: null, t0: 0,
  ereignisse: [], spur: null, aufnehmer: null, brocken: [],
  laeuft: false, zuletztGezogen: {}, uhr: null, pegel: 0
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
async function endbild(){
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
    klasse: S.klasse, gruppe: S.gruppe, kennziffern: S.kennziffern,
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
  f.appendChild(el('p', 'sortauf-augen', 'Sortieraufgabe'));
  f.appendChild(el('h2', null, titel));
  f.appendChild(el('p', 'sortauf-lauf',
    'Diese Sortierung wird für die Forschung aufgezeichnet: der Ton eures Gesprächs '
    + 'und die Bewegung der Karten. Kein Bild von euch, keine Namen.'));

  const reihe = el('div', 'sortauf-reihe');
  const klasse = el('input'); klasse.type = 'text'; klasse.placeholder = 'z. B. 7a';
  const gruppe = el('input'); gruppe.type = 'text'; gruppe.placeholder = 'z. B. 3';
  [['Klasse', klasse], ['Gruppe', gruppe]].forEach(([t, inp]) => {
    const s = el('div', 'sortauf-feld');
    s.appendChild(el('label', null, t)); s.appendChild(inp);
    reihe.appendChild(s);
  });
  f.appendChild(reihe);

  const kz = el('div', 'sortauf-feld');
  kz.appendChild(el('label', null, 'Eure Kennwörter'));
  kz.appendChild(el('p', 'sortauf-klein',
    'Jede und jeder trägt das eigene, selbst ausgedachte Kennwort ein. Keine Namen.'));
  const gitter = el('div', 'sortauf-gitter');
  const felder = [];
  for (let i = 0; i < 4; i++){
    const inp = el('input'); inp.type = 'text';
    inp.placeholder = i < 2 ? 'Kennwort' : 'falls vorhanden';
    felder.push(inp); gitter.appendChild(inp);
  }
  kz.appendChild(gitter);
  f.appendChild(kz);

  const ein = el('label', 'sortauf-haken');
  const box = el('input'); box.type = 'checkbox';
  ein.appendChild(box);
  ein.appendChild(el('span', null,
    'Für alle hier ist die Einwilligung abgegeben worden.'));
  f.appendChild(ein);

  const warn = el('p', 'sortauf-warn');
  f.appendChild(warn);

  const w = el('button', 'sortauf-knopf', 'Weiter zur Tonprüfung');
  w.onclick = () => {
    S.klasse = klasse.value.trim();
    S.gruppe = gruppe.value.trim();
    S.kennziffern = felder.map(i => i.value.trim()).filter(Boolean);
    if (!S.klasse || !S.gruppe){ warn.textContent = 'Klasse und Gruppe fehlen noch.'; return; }
    if (S.kennziffern.length < 1){ warn.textContent = 'Mindestens ein Kennwort eintragen.'; return; }
    if (!box.checked){ warn.textContent = 'Ohne bestätigte Einwilligung geht es nicht weiter.'; return; }
    S.sitzung = zeitcode() + '-' + S.klasse.replace(/\W/g,'') + '-g' + S.gruppe.replace(/\W/g,'');
    bildschirmTon();
  };
  f.appendChild(w);

  bildschirm(f);
  setTimeout(() => klasse.focus(), 100);
}

/* ---------- 2. Hört das Mikrofon uns? ---------- */
function bildschirmTon(){
  const f = document.createDocumentFragment();
  f.appendChild(el('p', 'sortauf-augen', 'Schritt 2 von 2'));
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

  addEventListener('beforeunload', e => {
    if (!S.laeuft) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

function leiste(){
  const b = el('div', 'sortauf-leiste');
  const punkt = el('span', 'sortauf-punkt');
  const zeit = el('span', 'sortauf-zeit', '00:00');
  const wer = el('span', 'sortauf-wer',
    'Klasse ' + S.klasse + ' · Gruppe ' + S.gruppe);
  const mini = el('span', 'sortauf-mini');
  const minifuell = el('i');
  mini.appendChild(minifuell);
  const schluss = el('button', 'sortauf-schluss', 'Aufnahme beenden');
  schluss.onclick = beenden;

  b.appendChild(punkt); b.appendChild(el('span', 'sortauf-etikett', 'Aufnahme läuft'));
  b.appendChild(zeit); b.appendChild(mini); b.appendChild(wer); b.appendChild(schluss);
  document.body.appendChild(b);
  document.body.classList.add('sortauf-platz');

  const an = new (window.AudioContext || window.webkitAudioContext)();
  const a = an.createAnalyser(); a.fftSize = 512;
  an.createMediaStreamSource(S.spur).connect(a);
  const d = new Uint8Array(a.fftSize);

  S.uhr = setInterval(() => {
    zeit.textContent = dauerText(performance.now() - S.t0);
    a.getByteTimeDomainData(d);
    let s = 0;
    for (let i = 0; i < d.length; i++){ const v = (d[i]-128)/128; s += v*v; }
    minifuell.style.width = Math.min(100, Math.sqrt(s/d.length) * 600) + '%';
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

  const leisteEl = document.querySelector('.sortauf-leiste');
  if (leisteEl) leisteEl.remove();
  document.body.classList.remove('sortauf-platz');

  const f = document.createDocumentFragment();
  f.appendChild(el('p', 'sortauf-augen', 'Fertig'));
  f.appendChild(el('h2', null, 'Danke – das Paket wird geschnürt.'));
  const stand = el('p', 'sortauf-lauf', 'Einen Moment …');
  f.appendChild(stand);
  bildschirm(f);

  const ton = new Blob(S.brocken, { type: S.brocken[0] ? S.brocken[0].type : 'audio/webm' });
  const bild = await endbild();
  const kopf = kopfdaten();
  kopf.ende = new Date().toISOString();
  kopf.dauer_s = Math.round((performance.now() - S.t0) / 1000);
  kopf.ereignisse = S.ereignisse.length;

  const dateien = [
    { name: 'angaben.json',   daten: textBytes(JSON.stringify(kopf, null, 2)) },
    { name: 'protokoll.json', daten: textBytes(JSON.stringify(S.ereignisse)) },
    { name: 'ton.webm',       daten: await zuBytes(ton) }
  ];
  if (bild) dateien.push({ name: 'ergebnis.png', daten: await zuBytes(bild) });

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
  g.appendChild(el('p', 'sortauf-augen', 'Fertig'));
  if (hoch){
    g.appendChild(el('h2', null, 'Abgegeben. Danke!'));
    g.appendChild(el('p', 'sortauf-lauf',
      'Eure Aufnahme ist angekommen. Ihr könnt das Fenster schliessen.'));
  } else {
    g.appendChild(el('h2', null, 'Bitte die Datei abgeben'));
    g.appendChild(el('p', 'sortauf-lauf',
      'Die Aufnahme konnte nicht direkt verschickt werden. Speichert sie und gebt sie '
      + 'der Lehrperson – so, wie es abgemacht ist.'));
    const s = el('button', 'sortauf-knopf', 'Aufnahme speichern (' + mb + ' MB)');
    s.onclick = () => {
      const a = el('a');
      a.href = URL.createObjectURL(paket); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      s.textContent = 'Gespeichert – nochmals speichern';
    };
    g.appendChild(s);
  }
  const code = el('p', 'sortauf-code', S.sitzung);
  g.appendChild(el('p', 'sortauf-klein', 'Sitzungscode, bitte notieren:'));
  g.appendChild(code);
  bildschirm(g);

  try { localStorage.removeItem('sort-protokoll-' + S.sitzung); } catch(e){}
}

/* ============================================================
   Anstrich
   ============================================================ */
const stil = document.createElement('style');
stil.textContent = `
.sortauf-huelle{position:fixed;inset:0;z-index:99998;display:grid;place-items:center;
  background:rgba(28,26,23,.82);backdrop-filter:blur(3px);padding:20px;overflow:auto;
  font-family:"Source Sans 3","Segoe UI",-apple-system,sans-serif;color:#1c1a17;}
.sortauf-karte{background:#faf8f5;max-width:470px;width:100%;padding:30px 32px 26px;
  border-radius:4px;box-shadow:0 24px 60px rgba(0,0,0,.35);
  border-top:5px solid #935100;}
.sortauf-augen{margin:0 0 6px;font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;
  color:#9a8f82;font-weight:700;}
.sortauf-karte h2{margin:0 0 12px;font-size:1.35rem;font-weight:600;line-height:1.25;
  letter-spacing:-.01em;}
.sortauf-lauf{margin:0 0 20px;font-size:.94rem;line-height:1.5;color:#4d4841;}
.sortauf-klein{margin:2px 0 8px;font-size:.8rem;color:#8b8177;line-height:1.4;}
.sortauf-reihe{display:flex;gap:12px;}
.sortauf-feld{flex:1;margin-bottom:16px;}
.sortauf-feld label{display:block;font-size:.78rem;font-weight:700;margin-bottom:5px;
  letter-spacing:.02em;}
.sortauf-huelle input[type=text]{width:100%;padding:9px 11px;font-size:.95rem;font-family:inherit;
  border:1px solid #d8d0c4;border-radius:3px;background:#fff;color:#1c1a17;}
.sortauf-huelle input[type=text]:focus{outline:2px solid #935100;outline-offset:1px;border-color:#935100;}
.sortauf-gitter{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.sortauf-haken{display:flex;gap:10px;align-items:flex-start;margin:6px 0 18px;
  font-size:.88rem;line-height:1.4;cursor:pointer;}
.sortauf-haken input{margin-top:3px;width:17px;height:17px;accent-color:#935100;flex:none;}
.sortauf-knopf{width:100%;padding:13px;font-family:inherit;font-size:1rem;font-weight:600;
  border:none;border-radius:3px;background:#935100;color:#fff;cursor:pointer;}
.sortauf-knopf:hover{background:#7d4500;}
.sortauf-knopf:disabled{background:#c3bab0;cursor:default;}
.sortauf-neben{display:block;width:100%;margin-top:10px;padding:8px;font-family:inherit;
  font-size:.83rem;background:none;border:none;color:#8b8177;cursor:pointer;
  text-decoration:underline;text-underline-offset:3px;}
.sortauf-warn{margin:0 0 14px;font-size:.86rem;color:#a32b1f;min-height:1.2em;line-height:1.4;}
.sortauf-hinweis{margin:0 0 14px;font-size:.86rem;color:#6f6862;min-height:1.2em;line-height:1.4;}
.sortauf-gut{margin:0 0 14px;font-size:.86rem;color:#2f6b3c;font-weight:600;min-height:1.2em;}
.sortauf-balken{height:16px;background:#eae4da;border-radius:8px;overflow:hidden;margin:0 0 14px;}
.sortauf-fuell{height:100%;width:0;background:#c4b8a8;transition:width .08s linear;}
.sortauf-fuell.gut{background:#2f6b3c;}
.sortauf-code{margin:2px 0 0;font-family:ui-monospace,Menlo,Consolas,monospace;
  font-size:1rem;font-weight:600;letter-spacing:.02em;color:#935100;
  background:#f0ebe4;padding:9px 11px;border-radius:3px;word-break:break-all;}

.sortauf-leiste{position:fixed;top:0;left:0;right:0;height:40px;z-index:99999;
  display:flex;align-items:center;gap:12px;padding:0 14px;background:#1c1a17;color:#f3efe9;
  font-family:"Source Sans 3","Segoe UI",sans-serif;font-size:.83rem;
  box-shadow:0 2px 12px rgba(0,0,0,.25);}
.sortauf-punkt{width:9px;height:9px;border-radius:50%;background:#e03b2c;flex:none;
  animation:sortauf-puls 1.6s ease-in-out infinite;}
@keyframes sortauf-puls{0%,100%{opacity:1}50%{opacity:.25}}
.sortauf-etikett{font-weight:600;letter-spacing:.02em;}
.sortauf-zeit{font-family:ui-monospace,Menlo,Consolas,monospace;color:#c8bfb2;}
.sortauf-mini{width:52px;height:5px;background:#3a352f;border-radius:3px;overflow:hidden;flex:none;}
.sortauf-mini i{display:block;height:100%;width:0;background:#7fae8a;transition:width .25s;}
.sortauf-wer{margin-left:auto;color:#9a938a;}
.sortauf-schluss{font-family:inherit;font-size:.83rem;font-weight:600;padding:6px 14px;
  border:1px solid #5b544b;border-radius:3px;background:none;color:#f3efe9;cursor:pointer;}
.sortauf-schluss:hover{background:#935100;border-color:#935100;}
body.sortauf-platz{padding-top:40px;}
@media (prefers-reduced-motion:reduce){.sortauf-punkt{animation:none}}
@media (max-width:520px){.sortauf-wer{display:none}.sortauf-karte{padding:24px 20px}}
`;
document.head.appendChild(stil);

/* ---------- Los ---------- */
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', bildschirmStart);
else bildschirmStart();

})();
