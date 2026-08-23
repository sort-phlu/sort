/* ============================================================
   Ein Paket schnüren und abgeben — gemeinsam für Aufnahme und
   Rückmeldung.

   HERAUSGELOEST am 2026-08-22 aus bauen/aufnahme.js. Anlass ist Rikes
   Bauhinweis zur Rueckmeldung:

     «Da kannst du mal schauen, ob nicht das, was wir bei der Abgabe
      machen, wo wir auch noch Ton aufnehmen - ob wir das nicht hier in
      einer sehr einfachen Variante uebernehmen koennen fuer die
      Rueckmeldung, weil es eigentlich alles schon gebaut ist und sogar
      einfacher ist, weil wir keine Tonaufnahme haben.»

   Genau das. Zwei Fassungen desselben Zip-Schreibers waeren derselbe
   Fehler, den das Projekt schon zweimal benannt hat - zuletzt bei
   «Faktorisieren 2», wo zwei Zeichnungen auseinanderliefen.

   Der Zip-Schreiber ist bewusst OHNE Komprimierung und ohne
   Fremdbibliothek: Die Seiten sind reine Dateien auf GitHub Pages, es
   gibt nichts, was ein Paket nachladen koennte.

   Haengt sich als window.SORT_PAKET an - die beiden Module sind
   eigenstaendige IIFEs und sehen einander sonst nicht.
   ============================================================ */
(function(){
'use strict';

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

/* dateien: [{name, daten:Uint8Array}] -> Blob */
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

/* Ein Paket an eine WebDAV-Ablage geben - bei SWITCHdrive der
   oeffentliche Abgabelink. Liefert true bei Erfolg.

   `ziel` ist die WebDAV-Adresse, `schluessel` der Teil hinter /s/ aus
   dem Freigabelink. Ohne Ziel wird nichts versucht: Die Seite laeuft
   dann im Herunterladen-Modus, und das ist ein gueltiger Zustand, kein
   Fehler - solange kein Abgabelink da ist, soll niemand ins Leere
   laden. */
async function abgeben(ziel, schluessel, name, paket){
  if (!ziel) return false;
  try {
    const antwort = await fetch(ziel + '/' + encodeURIComponent(name), {
      method: 'PUT',
      headers: schluessel ? { 'Authorization': 'Basic ' + btoa(schluessel + ':') } : {},
      credentials: 'omit',
      body: paket
    });
    return antwort.ok || antwort.status === 201 || antwort.status === 204;
  } catch(e){ return false; }
}

const zuBytes   = async b => new Uint8Array(await b.arrayBuffer());
const textBytes = s => new TextEncoder().encode(s);

window.SORT_PAKET = { zip, crc32, abgeben, zuBytes, textBytes };

})();
