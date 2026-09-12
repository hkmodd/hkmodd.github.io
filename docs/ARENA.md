# ARENA — mini open world parkour, Garda

Il gioco. Non una demo tecnica: un oggetto finito, costruito come un tripla A
e pesato come un sito web.

`GARDA.md` resta l'**archivio della v1** (arena 440 m, grey-box, `.glb` unico).
Non si butta: le sue trappole pagate sono valide e vanno riusate. Questo
documento è la v2.

Documento vivo. Quello che c'è scritto è **misurato**; dove non lo è, lo dice.

---

## 1. Il perimetro — misurato, non a occhio

Il brief è: da **Punta San Vigilio** inclusa, tutto **Monte Luppia** e dintorni,
**La Rocca**, fermandosi al confine del comune di Garda.

Tradotto in numeri da OSM (`tools/garda/perimetro.mjs`, confine
`admin_level=8`, 464 vertici di confine):

| | lat / lon | quota OSM |
|---|---|---|
| Punta San Vigilio | 45.57271 / 10.67191 | livello lago |
| **Monte Luppia** | 45.58763 / 10.69145 | **413 m** |
| Monte Are | 45.58474 / 10.68654 | 372 m |
| Monte Bre | 45.58046 / 10.68044 | 303 m |
| **La Rocca** | 45.56924 / 10.71324 | **283 m** |
| Garda paese | 45.57565 / 10.70853 | ~65–80 m |

Torri del Benaco (45.60945) cade **fuori**: il confine nord passa prima. Il
comune si estende a ovest fino a 10.63096, ma è tutta acqua — i comuni
rivieraschi possiedono la loro fetta di lago.

**Arena adottata:**

```
south 45.56713   north 45.59061      (confine comunale S e N)
west  10.66941   east  10.73965      (San Vigilio +200 m di lago, confine E)
```

| | valore |
|---|---|
| misura | **5.42 × 2.61 km = 14.15 km²** (in EPSG:32632, vedi §1bis) |
| contro la v1 (0.44 × 0.44 km) | **73×** |
| dislivello | dal pelo del lago (64.1 m) a Monte Luppia (413 m) = **349 m** |
| edifici OSM dentro | **1728** |
| ...con tag `height` | **0** |
| ...con `building:levels` | 58 (3.4%) |

---

## 1bis. La georeferenziazione, provata — e la trappola dei 116 m

CRS di lavoro: **EPSG:32632** (UTM 32N / WGS84). I capisaldi, reproiettati
da BlenderGIS senza GDAL né rete (`HAS_GDAL: False`, motore builtin):

| | E | N |
|---|---:|---:|
| Punta San Vigilio | 630 452.41 | 5 047 933.86 |
| Monte Luppia | 631 942.07 | 5 049 623.40 |
| La Rocca | 633 685.44 | 5 047 616.40 |
| Garda paese | 633 302.74 | 5 048 320.69 |
| arena SW | 630 270.25 | 5 047 309.87 |
| arena NE | 635 694.72 | 5 050 034.91 |

**Verificati contro un'implementazione UTM indipendente (Snyder, in
`scratchpad/utm.mjs`): scarto massimo 5 mm.** La catena di proiezione è sana,
e GDAL non serve per reproiettare — solo per il merge dei tile.

### La trappola

```
largo E-O                5424.5 m
alto  N-S (stesso meridiano)  2608.6 m
dN fra SW e NE           2725.0 m   ->  116.5 m di scarto
convergenza del meridiano a Garda: 1.217°  ->  115.3 m attesi
```

**Il nord UTM non è il nord geografico.** A 1.7° dal meridiano centrale della
zona 32, la griglia diverge di **1.217°**. Chi assume che coincidano ruota la
mappa e all'estremo est dell'arena sbaglia di **116 m**.

Conseguenze operative:

- la bbox in lat/lon **non è un rettangolo** in UTM: i due lati verticali non
  hanno la stessa northing. Il box di lavoro si definisce **in UTM**, poi si
  riporta in lat/lon per le query OSM, mai il contrario;
- il nord della scena Blender è il nord **della griglia**, non quello vero.
  Se in gioco compare una bussola, o se la posizione del sole viene calcolata
  da lat/lon, va corretta di 1.217°;
- misura e teoria concordano (116.5 contro 115.3 m): lo scarto residuo è la
  variazione della convergenza con la latitudine lungo il box.

---

## 2. Cosa rompe la scala — la decisione che decide tutto

Costo del terreno sull'arena, calcolato:

| passo | punti | triangoli | heightmap 16-bit |
|---|---:|---:|---:|
| 1 m | 14.30 M | 28.6 M | 27.3 MB |
| 2 m | 3.58 M | 7.2 M | 6.8 MB |
| 5 m | 0.57 M | 1.1 M | 1.1 MB |
| 10 m | 0.14 M | 0.3 M | 0.3 MB |

La v1 spediva **un `.glb` unico da 686 KB** con dentro terreno e città. A
28.6 M triangoli quella strada non esiste: non è un problema di ottimizzazione,
è un problema di architettura.

**Aggiornamento dopo il download (§3bis): la sorgente è a 5 m, non a 1 m.**
L'arena a 5 m costa **0.57 M punti / 1.13 M triangoli** — leggera. La riga
"1 m" qui sotto resta come limite superiore per quando si aggiungerà dettaglio
d'autore (la Rocca scolpita, i terrazzamenti), non come costo di partenza.
Il tiling e il LOD restano giustificati dagli **edifici**, non dal terreno.

**Decisione: il terreno diventa una heightmap con LOD, non una mesh.**

- griglia **5 m** dal LiDAR come base, tagliata in **tile da 256 m**;
- in scena un **quadtree**: il tile sotto i piedi a 1 m, i vicini a 2 m, il
  fondale a 8–16 m. La geometria è una griglia riusata, spostata e campionata
  nel vertex shader (TSL) — **una sola `BufferGeometry`, N istanze**;
- la **collisione** non è un trimesh globale: Rapier riceve un `heightfield`
  per i tile attorno al personaggio, creato e distrutto con lo streaming;
- gli **edifici** restano mesh vere, ma a tile e con LOD proprio.

Questo detta tutto il resto e non si rimanda: cambiarlo dopo significa rifare.

**Non misurato:** il frame budget di questo schema su questa scena. La soglia
va posta e verificata sullo slice 3 (§6), non promessa qui.

---

## 3. I dati — chi li prende e da dove

| dato | fonte | risoluzione | stato |
|---|---|---|---|
| **DTM LiDAR** | Regione Veneto IDT2 | **5 m** | **SCARICATO** — 11 tile, §3bis |
| **Edifici + quote** | CTRN `v_edifici` (ARPAV, CC BY 3.0) | vettoriale, gronda e piede in m s.l.m. | **da scaricare a mano** su tutta l'arena |
| Ortofoto | WMS regionale / ESRI World Imagery | 0.25 m/px | via BlenderGIS Webmap |
| Sagome, strade, acque, POI | OSM (ODbL) | — | via Overpass, già in pipeline |
| Batimetria | letteratura CNR | isobate | solo se il lago diventa nuotabile |

---

## 3bis. Il terreno, scaricato e verificato

**Non esiste un DTM a 1 m su IDT2.** Il portale espone DTM5, DTM25 e DTM
LiDAR 5 m. La mia assunzione precedente era sbagliata: **il meglio disponibile
è 5 m**, ed è lo stesso passo che la v1 già otteneva dal WMS. Il guadagno non
è la risoluzione — è che il dato ora è **nativo** invece che ricostruito dai
colori di un PNG, copre tutta l'arena nuova, e non ha artefatti di ricomposizione.

Per un metro vero servirebbe il LiDAR PST/MASE nazionale, che vola per strisce
e il cui WMS rispondeva 500. **La roccia della Rocca continua a non esserci nel
dato: va scolpita.**

### La procedura, scriptabile

Il portale sembra manuale ma sotto ha una REST. Scoperta ispezionando
`ConfiguratorDownloadDtmLidar5`:

```
/idt/datiistat/getComuniByProvinciaGS?siglaProvincia=VR        -> Garda = 23036
/idt/download/layerDownload/getDtmLidar5ByComune?codComune=23036&formatoFile=ZIP
/idt/download/layerDownload/downloadDtmLidar5?dataDtmLidarId=<idPol>
```

Nessuna sessione, nessun cookie. **11 tile scaricati** in `tools/gis/cache/dtm/`,
400 × 400 celle da 5 m (2 × 2 km l'uno), ESRI ASCII Grid, ~1.5 MB zippati.

**L'elenco per Comune è incompleto**: i tile che coprono il bordo sud ed est
dell'arena sono arrivati interrogando Bardolino (23006) e Costermano (23030).
Chi rifà questo passo deve interrogare anche i comuni confinanti.

### La trappola che è costata di più: `k0 = 1`

Il dato è in **EPSG:6876** (ETRF2000-RDN fuso 12): meridiano centrale 12°,
falso est 3 000 000, **fattore di scala 1**.

Non 0.9996. Applicare il k0 di UTM a questa proiezione sposta la northing di
**~2 km** — abbastanza da mettere la Rocca in mezzo al lago, che è esattamente
quello che è successo. Il sintomo non era un errore: erano quote `nodata`
plausibili. L'ha smascherato il confronto fra il `max` di ogni tile e le quote
note delle cime.

### Il dato non sa reproiettarsi da solo

**BlenderGIS senza GDAL né PyProj sa fare solo UTM / WGS84 / Web Mercator.**
Su EPSG:6876 ricade su un servizio web e fallisce con `ApiKeyError`. La
conversione la fa il nostro codice (`tools/gis/dtm.mjs`), verificato contro
BlenderGIS su UTM32 a 5 mm. Se in futuro serve BlenderGIS per reproiettare,
allora GDAL diventa bloccante — oggi no.

### Verifica sui capisaldi

| caposaldo | atteso | misurato | scarto |
|---|---:|---:|---:|
| Lago davanti al porto | 64.1 | 66.0 | +1.9 |
| Garda paese | 72 | 68.9 | −3.1 |
| **La Rocca** | 283 | **290.3** | +7.3 |
| **Monte Luppia** | 413 | **415.6** | +2.6 |
| Monte Bre | 303 | 298.8 | −4.2 |
| Monte Are | 372 | 375.6 | +3.6 |
| Punta San Vigilio | 70 | 66.0 | −4.0 |

Scarto massimo **7.3 m**, zero capisaldi fuori copertura. Gli attesi sono quote
dei nodi OSM `natural=peak`, che non cadono sul vertice esatto: uno scarto di
pochi metri è il rumore della sorgente di confronto, non del DTM.

**Il lago è `nodata`** — fino all'89% su un tile. È corretto: il LiDAR non
penetra l'acqua. Il pelo dell'acqua e il fondale sono un dato separato.

`node tools/gis/dtm.mjs` rifà questa verifica in un secondo.

---

## 3ter. Il terreno in scena — fatto, e guardato

`tools/gis/mosaic.mjs` → `tools/gis/import_dtm.py`. Due comandi, riproducibili.

### Il mosaico

**L'arena è un rettangolo in EPSG:6876, non in lat/lon.** La bbox geografica
non è un rettangolo in proiezione (§1bis): inseguirla costringerebbe a ruotare
e ricampionare il terreno. Allineandosi alla griglia del DTM, ogni cella del
mosaico coincide **esattamente** con una cella sorgente e il dato passa per
copia — zero interpolazione.

```
arena  x 2896125..2901655   y 5048745..5051445   (EPSG:6876)
       1106 x 540 celle da 5 m  =  5530 x 2700 m
```

| | |
|---|---|
| celle con dato valido | 443 907 su 597 240 (**74.3%**) |
| acqua (lago) | 153 333 celle (**25.7%**) |
| **buchi a terra** | **0** — il LiDAR copre la terraferma dell'arena senza lacune |
| quote | **65.0 → 416.1 m**, lago posato a 64.0 |

Il `nodata` non è un buco solo: il lago è `nodata` per costruzione e va distinto
dai buchi veri. Si riconosce perché è la regione di `nodata` **connessa al bordo**
della griglia. Riempire tutto allo stesso modo produrrebbe un lago a imbuto.
La maschera d'acqua esce come `arena.acqua.pgm` e servirà al piano d'acqua e
ai materiali.

### L'import

`importgis.asc_file` con `importMode='MESH'`. **597 240 vertici, 595 595
poligoni**, estensione 5525 × 2695 m (una cella in meno per lato: i vertici
stanno ai centri), quote **64.0 → 416.1 m**. Coincide con il mosaico.

Origine della geoscene al centro dell'arena: coordinate da 2.9 milioni mangiano
la precisione float32 di viewport e motore di gioco.

### Trappole pagate qui

- **La geoscene va messa sullo STESSO CRS del file.** Se coincidono, BlenderGIS
  non invoca nessuna reproiezione e lavora offline. Se differiscono, su EPSG:6876
  ricade sul servizio web e muore con `ApiKeyError`.
- **`predefCrsJson` non è un dizionario**: è una lista di triple
  `[codice, nome, descrizione]`. Serve registrarci il CRS o l'enum `fileCRS`
  dell'operatore di import resta vuoto.
- **In Blender 5.2 l'engine è `BLENDER_EEVEE`**, non `BLENDER_EEVEE_NEXT`.
- **Senza materiale EEVEE usa un diffuse quasi bianco**: con la luce radente il
  rilievo va in clipping e il primo render esce slavato. Grigio medio 0.18,
  sole 2.2, ambiente 0.04, AgX.

### Cosa dicono i render

- **La Rocca esiste davvero nel dato**, con la parete che scende sul lago. La v1
  a 25 m la definiva "un pallone": a 5 m la rupe c'è.
- **Ma la parete esce a gradini.** Su un fronte quasi verticale una griglia a 5 m
  non può fare altro. Conferma, dal dato e non dall'opinione, che **la rupe va
  scolpita a mano**.
- Sul terrazzo del centro storico si leggono strade e terrazzamenti agricoli.
  **Gli edifici non ci sono**: è un DTM, il terreno. Le case arrivano dalla CTRN.

---

## 3quater. Gli edifici — sagome sì, quote no

`tools/gis/ctrn.mjs`. Anche la Carta Tecnica passa da una REST, scoperta come
quella del DTM:

```
/idt/download/layerDownload/getCartaTecnicaByComune?codComune=..&formatoFile=SHAPE
/idt/download/layerDownload/downloadLayerByComune?codComune=..&idLayer=13337
/idt/download/layerDownload/downloadGeoDBT?lotto=..&rif=FUSO12&type=aree|linee|punti|doc
```

Il layer **13337 "Edifici del Veneto"**, ritagliato per comune, pesa **672 KB**
contro i **329 MB** del lotto GeoDBT: per le sagome è la strada giusta.

| | |
|---|---|
| edifici **dentro l'arena** | **2181** |
| da Garda / Costermano / Torri / Bardolino | 1648 / 390 / 97 / 46 |
| aggiornamento | **feb 2022** (la v1 aveva record 2021) |
| CRS | **EPSG:6876**, lo stesso del DTM — zero reproiezione |

Il `.prj` conferma da fonte primaria i parametri dedotti in §3bis:
`central_meridian 12`, **`scale_factor 1.0`**, `false_easting 3000000`.

**I comuni confinanti servono davvero**: 533 edifici dell'arena su 2181 (il 24%)
stanno fuori dal comune di Garda. La bbox rettangolare in proiezione sconfina.

### Dove NON stanno le quote — due vicoli ciechi misurati

1. **Il layer 13337 non ha quote.** Campi: `classid, scril, edi_idag, edi_ided,
   edi_rsa, edi_stat, edi_sup_ty, edi_ty, edi_uso, anno_agg, classe_or,
   ente_prod` — tipologia e uso, nient'altro. Le geometrie sono **PolygonZ** ma
   **tutte le Z valgono 0**: verificato sui vertici, non sull'header.
2. **La classe `EDIFC` del GeoDBT ha Z vere ma sono il sedime a terra.**
   Sottraendo il terreno viene una mediana di **0.3 m**: l'edificio risulterebbe
   alto quanto il suolo. Non è l'alzato.

### Dove stanno davvero: `UN_VOL`

La classe **unità volumetriche** del GeoDBT — 156 253 record sul lotto — porta
le quote esplicite:

```
UN_VOL_QB  quota di base (piede)     UN_VOL_QG  quota di gronda
UN_VOL_AV  altezza                   UN_VOL_QE  quota estradosso
```

È la stessa grandezza che la v1 estraeva da ARPAV **una cella alla volta** via
WMS GetFeatureInfo, 247 chiamate per 1.5 km². Qui arriva tutta in un file.

| | |
|---|---|
| **corpi di fabbrica nell'arena** | **4859** |
| con quota di gronda | **100%** |
| con quota di piede | **100%** |
| altezze (gronda − piede) | p10 **2.2** · mediana **4.9** · p90 **10.8** · max **24.5 m** |
| fuori 1.5–40 m | 71 corpi (1.5%) |
| confronto | il modello inventato della v1 aveva mediana **7.0 m**: sovrastimava di ~2 m |

**Unità volumetriche, non edifici**: 4859 corpi per ~2181 edifici. Ogni edificio
è spezzato nei suoi volumi ad altezze diverse — che per un gioco di parkour è
meglio di un'altezza media per fabbricato, non peggio.

### Il controllo incrociato che vale più di tutti

```
piede rilevato (GeoDBT) meno terreno (LiDAR):  p10 -2.20  mediana -0.60  p90 +0.40 m
```

Due rilievi **indipendenti**, presi ad anni di distanza con tecniche diverse,
concordano entro **60 cm** in mediana. Né la georeferenziazione né il mosaico
né la scelta del CRS possono essere sbagliati di molto: si sarebbe visto qui.
(La v1 aveva lo stesso controllo e otteneva −0.32 m sul suo DTM 5 m.)

### La città in scena

`tools/gis/import_citta.py`: **4831 corpi estrusi fra piede e gronda**,
176 616 vertici, 93 139 facce, quote 64.1 → 325.6 m. Nessuna altezza inventata.

Tetti **piatti** in questo passaggio: le falde arrivano dopo, con la regola
della v1 (21°, gronda a sbalzo 38 cm) applicata sulla pianta — non improvvisata
in fase di import.

Trappola della v1 ripagata a costo zero perché era scritta: **gli anelli ESRI
girano in senso orario**, quindi una ngon costruita in quell'ordine ha la
normale in basso e il tetto si illumina come un pavimento. Si normalizza una
volta sola, all'ingresso.

---

**Il collo di bottiglia umano resta sulla CTRN.** `ctrn.mjs` della v1
interrogava il WMS cella per cella: 247 chiamate per 1.5 km². Su 14.30 km²
sarebbero **~2300 chiamate sequenziali** a un servizio pubblico — è un abuso,
non una pipeline. Il download bulk da IDT2 filtrato per Comune sostituisce
entrambe le cose, DTM e CTRN, in un gesto solo.

---

## 4. Routing BlenderGIS — dove è primario e dove no

BlenderGIS 2.2.15 è lo strumento cartografico primario. Gira su Blender 5.2:
il gate nel sorgente è `bpy.app.version[0] > 5`, blocca solo 6.x. **Non è
testato su 5.x**: va verificato aprendo una geoscene, prima di fidarsi.

| dato | strada | nota |
|---|---|---|
| georeferenziazione | **Webmap** → geoscene EPSG:32632 | offset origin automatico, da verificare attivo |
| terreno | **Import georeferenced raster** (DTM LiDAR) | mai `Get SRTM`: è a 30 m |
| ortofoto | **Webmap** | allineamento visivo |
| strade, acque, POI | **Get OSM** | qui OSM è affidabile |
| **edifici** | **Import SHP** della CTRN | **mai `Get OSM` per le altezze** |

L'ultima riga è l'unica deviazione, ed è misurata: su 1728 edifici dell'arena
**zero** hanno `height`. `Get OSM` col fallback `building:levels × 3 m`
inventerebbe l'altezza del **96.6%** del costruito, e "Garda che non è Garda"
è esattamente il fallimento da evitare. La CTRN porta gronda e piede rilevati.
Il routing è già previsto dal brief originale alla voce *Import SHP/GeoJSON*.

---

## 5. Cosa si eredita dalla v1 — non si ripaga

Il runtime non sa quale città carica e resta: `renderer.ts` (WebGPU + fallback
WebGL2), `physics.ts` (Rapier SIMD), `player.ts`, `character.ts`,
`materials.ts` (TSL), `palette.ts`, `portal.ts`.

Valgono ancora, misurate nella v1:

- **fisica tarata sul tessuto**: corsa 7.5 m/s, gravità 17.6 m/s², salto 7.0 m/s
  → 5.96 m in corsa, scelto per coprire il 76.2% dei salti fra tetti misurati.
  **Da rimisurare su Rapier**: quei numeri sono di prima;
- **luce**: sole 5.2 contro ambiente 0.20. Con l'ambiente a intensità piena il
  cielo produce l'80% dell'illuminazione e le ombre spariscono;
- **camere a 70–120° dall'asse solare**: il sole dietro la camera appiattisce tutto;
- **sagome OSM normalizzate a CCW**: metà girano in senso orario e le falde
  nascono verso il sottosuolo;
- **Overpass restituisce way intere**: senza clip il modello sborda di 600 m;
- **`Matrix4.lookAt`**, non `Object3D.lookAt`: orienta il +Z e inquadra il lato opposto;
- **nebbia** su un piano d'acqua da 60 km: densità 0.000032, non 0.00009;
- **normal map ripetuta**: mipmap + anisotropia, o moiré;
- `three/examples/jsm` **fuori** da `manualChunks`, o finisce nel bundle del portfolio.

---

## 6. Le slice — una alla volta, chiusa prima di aprire la successiva

1. ~~**Geoscene**~~ **CHIUSA** — BlenderGIS 2.2.15 si abilita su Blender 5.2.1
   LTS (Python 3.13.13) headless, senza errori. Operatori vivi: `importgis.*`
   (`georaster`, `shapefile`, `osm_query`, `asc_file`, `dem_query`),
   `exportgis.shapefile`, `geoscene.*`. Proiezione verificata a 5 mm (§1bis).
   **`view3d.map_start` (il Webmap) è un operatore modale: GUI-only.** La
   geoscene si imposta invece da codice con la classe `GeoScene` e
   `geoscene.set_crs` — deterministico e riproducibile, che è meglio.
2. ~~**Terreno grezzo**~~ **CHIUSA** — dato acquisito, mosaicato e **in scena
   in Blender** (§3bis, §3ter). 597 240 vertici, quote 64.0–416.1 m, render di
   controllo guardati.
3. **Tile + LOD** — il terreno esce a tile da 256 m, il quadtree gira nel
   browser, Rapier riceve heightfield in streaming. **Qui si misura il frame
   budget**: è la soglia che decide se lo schema regge.
4. **Città** — CTRN in sagome e quote, tetti a falda (la regola della v1 vale:
   21°, gronda 38 cm), LOD per tile.
5. **Il percorso** — il parkour progettato sul tessuto reale, da San Vigilio
   alla Rocca. Prima si gioca, poi si abbellisce.
6. **Rifinitura** — materiali, vegetazione, acqua, luce, arredo.

---

## 7. Blocchi aperti

| blocco | stato |
|---|---|
| ~~BlenderGIS non installato~~ | **risolto** — `BlenderGIS-2215` in `5.2/scripts/addons`, si abilita headless |
| ~~BlenderGIS non testato su Blender 5.x~~ | **risolto** — 5.2.1 LTS, enable riuscito, operatori vivi |
| ~~PyProj / reproiezione~~ | **non serve** — motore builtin verificato a 5 mm, offline |
| ~~DTM LiDAR~~ | **risolto** — 11 tile a 5 m scaricati e verificati (§3bis) |
| **CTRN sull'arena** | **aperto** — è il dato delle altezze degli edifici, e senza quello la città è inventata |
| GDAL assente | aperto, **non bloccante**: la reproiezione la fa `tools/gis/dtm.mjs`, verificato. Diventa bloccante solo se si vuole che sia BlenderGIS a reproiettare |
| **Roccia della Rocca** | non è nel dato a 5 m. Va scolpita su fotografia — come già sapeva la v1 |
| Pillow assente | ImageIO + FreeImage disponibili (la DLL si è scaricata da sola al primo enable). Da riverificare quando entra il primo GeoTIFF |

Nota sul nome cartella: `BlenderGIS-2215` contiene un trattino, illegale come
identificatore Python. **Non rompe nulla**: il codice usa sempre `__package__`,
mai il nome hardcoded — verificato con grep su tutto l'addon.

---

## 8. Licenze

OSM → ODbL, attribuzione a schermo. CTRN/ARPAV → CC BY 3.0. DTM Veneto →
verificare la licenza del download IDT2 prima di ridistribuire dati derivati.
**Mai** mesh estratte da Google Maps/Earth.
