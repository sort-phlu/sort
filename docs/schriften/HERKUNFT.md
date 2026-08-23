# Die Schriften, die mitgeliefert werden

Angelegt 2026-08-22 auf Rikes Frage: *«Müssen wir die Schrift von Google
wirklich holen, können wir das nicht mitgeben, damit nichts von Google
live geholt wird?»*

Die Antwort ist ja, und es war aus zwei Gründen dringend.

## Warum das mehr war als eine Aufräumfrage

**1 · Es hat die Seiten angehalten.** Ein `<link rel="stylesheet">` im
`<head>` blockiert die Ausführung **aller nachfolgenden Skripte**, bis
er geladen ist — auch der eingebetteten. Hängt oder bremst
`fonts.googleapis.com`, läuft das Flächenskript **nie an**: Die Seite
steht halb da, die Schrift ist falsch, und die Karten lassen sich nicht
bewegen. Genau dieses Bild hat Rike am 2026-08-22 beschrieben.

**2 · Jeder Seitenaufruf ging an Google.** Die Sortierflächen werden von
Schulklassen benutzt. Bei jedem Laden schickte der Browser eines
Minderjährigen seine IP-Adresse an einen Dritten — ohne dass jemand
zugestimmt hätte und ohne dass es nötig war.
`../GRUNDREGELN.md` Punkt 6 hält Personendaten von der Versionierung
fern; hier flossen sie aus der Seite heraus.

## Was hier liegt

| Datei | Familie | Schnitt | Lizenz |
|---|---|---|---|
| `PatrickHand-Regular.woff` | Patrick Hand | 400 | SIL OFL 1.1 |
| `FiraSans-Regular.woff` | Fira Sans | 400 | SIL OFL 1.1 |

Erzeugt mit `fontTools` aus den Dateien in `~/Library/Fonts/`, also aus
denselben, mit denen matplotlib die Kartenbilder setzt. Damit tragen
Kartenbild und Fläche garantiert dieselbe Schrift — vorher waren es zwei
Quellen für dasselbe.

WOFF und nicht WOFF2: `brotli` fehlt in der Arbeitsumgebung. WOFF ist
seit 2012 überall unterstützt; WOFF2 wäre rund ein Drittel kleiner.

## PRUEFEN — was fehlt, und was das kostet

Die Seiten fragten bei Google **Fira Sans 400, 500, 600, 700 und
kursiv 400** an. Auf dem Rechner liegt nur **400**.

**Folge:** Fett und Kursiv werden vom Browser *gerechnet* statt gesetzt.
Das ist dieselbe Einschränkung, die bei den Kartenbildern längst gilt —
die Übergabe hält fest: *«Fira Sans Bold und Italic fehlen auf dem
Rechner. Rike will sie nicht nachinstallieren; die Fettung auf den
Kartenbildern wird nachgezogen.»* Neu ist nur, dass sie jetzt auch im
Web gilt.

**Behoben ist das, sobald die Dateien hier liegen** — es braucht keinen
Code, nur die Datei:

    FiraSans-Medium.otf      ->  500
    FiraSans-SemiBold.otf    ->  600
    FiraSans-Bold.otf        ->  700
    FiraSans-Italic.otf      ->  kursiv 400

Dann `bauen/schriften_bauen.py` laufen lassen; der Bauer nimmt auf, was
er findet.

## Lizenz — offen, aber mit einer Pflicht

Beide Familien stehen unter der **SIL Open Font License 1.1**. Sie
erlaubt Weitergabe und Einbettung ausdrücklich, auch verändert und auch
kommerziell.

**PRUEFEN vor der Veröffentlichung:** Die OFL verlangt, dass der
**Lizenztext mitgeliefert** wird. Er liegt hier noch nicht — ich habe
ihn nicht heruntergeladen, weil Herunterladen Rikes Zustimmung braucht.
Vor dem ersten Push in ein öffentliches Repository muss `OFL.txt`
daneben liegen.

Urheber, fürs Register:

- **Fira Sans** — Erik Spiekermann, Ralph du Carrois (Carrois Type Design)
  für Mozilla
- **Patrick Hand** — Patrick Wagesreiter
