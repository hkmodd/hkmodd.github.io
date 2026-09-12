# STATE — Manifesto operativo

Fonte di verità per turno. Si **legge prima** di agire, si **aggiorna dopo**.
Il contesto della chat è volatile; questo file no.

Ultimo aggiornamento: **2026-09-12**, sessione "il terreno vero".

---

## PROGETTO

| | |
|---|---|
| nome | `hkmodd.github.io` — portfolio + **mini open world parkour** su Garda |
| obiettivo | un videogioco in browser costruito come un tripla A: cura su ogni dettaglio, peso da sito web |
| perimetro | **5.42 × 2.61 km = 14.15 km²** — Punta San Vigilio, Monte Luppia, La Rocca, entro il comune |
| stack | React 19 + Vite 8 · `three/webgpu` 0.185.1 + TSL · Rapier SIMD 0.20 · Blender 5.2.1 + BlenderGIS 2.2.15 |
| deploy | GitHub Pages via Actions su `main` — **push solo su richiesta esplicita** |
| documenti | **`ARENA.md` il piano v2** · `GARDA.md` archivio v1 · `STACK.md` stack · `PROMPT.md` avvio · `LAGO-1-1.md` brief GIS originale |

---

## FATTO — nodi immutabili

- **v1 completa e archiviata** — non si butta: è la riserva di spunti e di trappole pagate.
- **Perimetro v2 misurato** — `tools/garda/perimetro.mjs`: confine comunale OSM, capisaldi, bbox, costo.
- **Georeferenziazione provata** — UTM32 di BlenderGIS contro implementazione indipendente: **scarto 5 mm** (`tools/gis/env.py`, `tools/gis/utm.mjs`).
- **BlenderGIS gira su Blender 5.2.1** — enable headless riuscito, `importgis.*` / `exportgis.*` / `geoscene.*` vivi. Il Webmap è modale, GUI-only: la geoscene si imposta da codice.
- **DTM LiDAR 5 m acquisito e verificato** — 30 tile, copertura arena 8/8 celle, quote confermate sui 7 capisaldi con **scarto massimo 7.3 m** (`tools/gis/fetch-dtm.mjs`, `tools/gis/dtm.mjs`).
- **Sagome degli edifici** — layer 13337 "Edifici del Veneto" per comune: **2181 edifici nell'arena**, agg. feb 2022. Senza quote (`tools/gis/ctrn.mjs`).
- **ALTEZZE RILEVATE** — GeoDBT classe `UN_VOL`: **4859 corpi di fabbrica nell'arena, 100% con gronda e piede**. Mediana 4.9 m. Controllo incrociato piede-vs-LiDAR: **mediana -0.60 m** (`tools/gis/edifici.mjs`).
- **Città in scena** — 4831 corpi estrusi fra le loro due quote rilevate, 176 616 vertici, nessuna altezza inventata (`tools/gis/import_citta.py`).
- **Terreno mosaicato e in scena in Blender** — 1106 × 540 celle da 5 m, **zero buchi a terra**, lago separato dalla maschera d'acqua; import via `importgis.asc_file`: 597 240 vertici, quote 64.0–416.1 m, render guardati (`tools/gis/mosaic.mjs`, `tools/gis/import_dtm.py`).

---

## MISURATO

| | |
|---|---|
| arena | 5.42 × 2.61 km = **14.15 km²** in EPSG:32632, 73× la v1 |
| dislivello | lago ~65 m → Monte Luppia 415.6 m (misurato nel DTM) |
| edifici OSM dentro | **1728**, di cui **0** con `height`, 58 con `levels` (3.4%) |
| edifici rilevati dentro (layer 13337) | **2181**, agg. feb 2022 — 0 con quota, Z geometriche tutte a 0 |
| **corpi di fabbrica con quote** (GeoDBT `UN_VOL`) | **4859**, gronda e piede al **100%** — altezze p10 2.2 / mediana 4.9 / p90 10.8 m |
| piede rilevato meno terreno LiDAR | mediana **-0.60 m** — due rilievi indipendenti che concordano |
| terreno a 5 m (la sorgente reale) | 0.57 M punti · 1.13 M triangoli |
| convergenza del meridiano | **1.217°** → 116 m di scarto sull'estensione E-O |
| DTM: `nodata` sul lago | fino all'**89%** di un tile — corretto, il LiDAR non penetra l'acqua |
| Blender | 5.2.1 LTS, Python 3.13.13 |
| GDAL / PyProj / QGIS | **assenti**, e non bloccanti: la reproiezione la fa il nostro codice |
| build portfolio | `vite build` exit 0, 657 ms; `dist/index.html` senza un byte di three/garda/rapier |

---

## IN CORSO

Nessuno. Il terreno è in scena e verificato a occhio e coi numeri.

---

## BLOCCO

| blocco | sblocca |
|---|---|
| ~~Altezze degli edifici~~ | **RISOLTO** — GeoDBT `UN_VOL`, 4859 corpi con gronda e piede al 100% |
| **Roccia della Rocca** | non è nel dato a 5 m, e un 1 m su Garda non esiste. Va scolpita su fotografia |
| GDAL | non bloccante oggi. Lo diventa solo se si vuole che sia BlenderGIS a reproiettare EPSG:6876 |

---

## PROSSIMO — uno solo

**I tetti a falda.** Tutti i dati ci sono: terreno rilevato, piante rilevate,
gronda e piede rilevati. Manca l'alzato vero della copertura — oggi i corpi
hanno il tetto piatto. La regola della v1 vale ancora e va applicata sulla
pianta: falda a 21 gradi, gronda a sbalzo 38 cm, una sola formula che genera
mesh e collisione.

Subito dopo: portare terreno e città a tile nel browser e misurare il frame
budget. Solo allora l'ottimizzazione ha senso.

---

## DECISIONI

- **Perimetro dal brief visivo, bbox dai dati** — San Vigilio + Luppia + Rocca, confine comunale, mai a occhio.
- **Terreno = heightmap con LOD**, non mesh unica. La base è a 5 m e costa poco; tiling e LOD servono per gli edifici e per il dettaglio d'autore.
- **Edifici da CTRN, mai da `Get OSM`** — 0 altezze su 1728. È la differenza fra Garda e una Garda inventata.
- **La reproiezione la fa il nostro codice**, verificato, non l'addon. BlenderGIS resta per import e vista.
- **La v1 resta nel repo** — archivio, non zavorra.
- **Niente mesh estratte da Google** — vincolo di licenza, dal giorno uno.

---

## TRAPPOLE PAGATE IN QUESTA SESSIONE — non ripagarle

- **EPSG:6876 ha `k0 = 1`, non 0.9996.** Applicare il fattore di scala UTM al
  fuso 12 sposta la northing di **~2 km**: abbastanza da mettere la Rocca in
  mezzo al lago. Non produce errori — produce `nodata` plausibili.
- **Il nord UTM non è il nord geografico**: 1.217° di convergenza a Garda,
  116 m sull'estensione dell'arena. La bbox in lat/lon non è un rettangolo in UTM.
- **L'elenco tile "per Comune" di IDT2 è incompleto ai bordi**: i tile del
  margine sud ed est di Garda appartengono a Bardolino e Costermano.
- **Non esiste un DTM a 1 m su IDT2.** Solo DTM5, DTM25, LiDAR 5 m.
- **BlenderGIS senza GDAL/PyProj reproietta solo UTM/WGS84/WebMercator.**
  Su altri CRS ricade su un servizio web e fallisce con `ApiKeyError`.
- **Il nome cartella `BlenderGIS-2215` col trattino non rompe nulla**: il
  codice usa sempre `__package__`. Nessun rename necessario.
- **La geoscene va messa sullo stesso CRS del file importato**: se coincidono,
  BlenderGIS non invoca reproiezione e lavora offline senza GDAL.
- **`predefCrsJson` è una lista di triple**, non un dizionario. Senza registrarci
  il CRS, l'enum `fileCRS` dell'import resta vuoto.
- **Blender 5.2: l'engine è `BLENDER_EEVEE`**, non `BLENDER_EEVEE_NEXT`.
- **Senza materiale EEVEE usa un diffuse quasi bianco**: con luce radente il
  render va in clipping e sembra che il terreno non abbia rilievo.

---

## ASSUNZIONI ATTIVE

- La CTRN copre l'arena estesa come copriva il nucleo: **assunto**. La v1 ne aveva 606 unità su 1.5 km².
- I numeri di fisica della v1 (corsa 6.29 m/s, stacco 1.36 m) sono **precedenti a Rapier**: da rimisurare.
- Il quadtree LOD regge il frame budget: **non misurato**, è la soglia della slice sul terreno in scena.
- Le condizioni d'uso del DTM IDT2 permettono di ridistribuire derivati: **da verificare** prima di pubblicare.
