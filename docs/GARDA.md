# Garda 3D — dal portale al gioco

Stato: **milestone 1-6 chiusi** (§6). Dati verificati, arena scelta sui dati,
grey-box con tetti veri, runtime su `three/webgpu` + TSL + Rapier SIMD.
Documento vivo: quello che c'è scritto qui è misurato, non stimato. Dove non
l'ho misurato, lo dico. Lo stato operativo per turno sta in `docs/STATE.md`.

---

## 0. L'obiettivo, dichiarato

Un videogioco in browser ambientato a Garda, ricreata con cura maniacale,
con il rigore di Bruno Simon. Non una demo tecnica: un oggetto finito.

Questo obiettivo ha una conseguenza che decide tutto il resto e sta in §3.

---

## 1. Verifica dei dati — FATTO

### Le mesh di Google restano fuori
Confermato: non si tocca. Né ripper né 3D Tiles come geometria. La strada è
la ricostruzione da dati aperti.

### Cosa contiene davvero OSM (misurato, non stimato)

Query Overpass sul comune (bbox 45.5671–45.5906 / 10.6310–10.7397):

| dato | valore |
|---|---|
| edifici mappati | **1735** |
| con `height` | **0** |
| con `building:levels` | **58** (3.3%) |
| con `roof:shape` | **22** (1.3%) |
| `building=yes` non tipizzati | **1387** (80%) |

**Conseguenza operativa:** una pipeline automatica OSM→città non esiste.
OSM dà le sagome. **L'altezza è materiale d'autore**, e va scritta a mano o
derivata da una regola dichiarata. Il modello usato oggi è in
`tools/garda/build.mjs` ed è deterministico (piani da tag → da tipologia →
da densità del tessuto, più jitter da hash dell'id OSM: stessa mesh a ogni run).

### Il tessuto è un livello di parkour — misurato

Finestra 400×400 m più densa del comune, trovata scorrendo una griglia da 25 m:
**45.5737–45.5773 / 10.7064–10.7116** — il centro storico.

| metrica | valore |
|---|---|
| edifici nella finestra | 127 |
| copertura al suolo | **27.0%** |
| gap al vicino più prossimo, mediana | **3.52 m** |
| attaccati (< 0.5 m) | 19.8% |
| raggiungibili con salto in corsa (≤ 4 m) | **57.9%** |
| raggiungibili al limite (≤ 6 m) | **76.2%** |
| isolati (> 12 m) | 4.8% |

Su tutto il comune la mediana sale a 6.46 m e gli isolati al 20%: **la densità
che rende il gioco possibile esiste solo nel nucleo storico.**

### Quota

DEM campionato a 12.5 m su tutto il perimetro (EU-DEM 25 m via opentopodata,
9922 punti, 0 buchi):

- lago **63.5 m**, picco de La Rocca **270.0 m** nel campionamento
  (il nodo OSM `natural=peak` sta a 45.56924 / 10.71324)
- centro storico su un terrazzo a **~72–76 m**, cioè 8–12 m sopra il lago
- salita dal paese alla Rocca: **188 m in 500 m di pianta → pendenza media 37%**

**Verificato che NON è contaminazione da edifici:** differenza mediana fra
quota sul sedime e quota sulle strade entro 60 m = **+0.14 m** (media +0.34 m,
n=329). EU-DEM qui si comporta da DTM. L'ipotesi opposta era mia ed era sbagliata.

### Limite noto della quota
A 25 m nativi **la Rocca è un pallone**: nessuna cresta, nessuna roccia,
nessun terrazzamento. Provato e fallito: WCS/WMS del geoportale Veneto
(404 / nessuna risposta); su opentopodata `eudem25m` è il migliore disponibile
sull'Italia. **La rupe va scolpita in Blender su fotografia**, oppure serve il
LiDAR regionale scaricato a mano.

---

## 2. Grey-box e arena — FATTO

`tools/garda/` e' la pipeline, riproducibile da zero:

```
fetch.mjs    Overpass + opentopodata  ->  cache/*.json      (idempotente)
build.mjs    cache -> site.json        (metri, altezze e falde autorate)
greybox.py   site.json -> Blender -> garda.glb + render + roof_measured.json
nav.mjs      site.json + roof_measured -> public/garda/garda.nav.json
raster.mjs   site.json -> PNG di controllo, 1 px = 1 m
```

L'ordine conta: `nav.mjs` gira DOPO Blender, perche' legge le quote di colmo
realmente costruite.

### Terreno rilevato — DTM regionale a 5 m

`dtm.mjs` sostituisce EU-DEM (25 m) con `rv:DTM_RV_5m_3003` (IDT2 Regione del
Veneto), campionato a 2.5 m. Il WCS e' disabilitato e il WMS in GeoTIFF
restituisce RGBA: si chiede allora al WMS di **codificare la quota nel colore**
con uno stile inviato nella richiesta (SLD_BODY), in due passate — rampa
60-320 m e dente di sega da 4 m — ricomposte a ±1.6 cm. La richiesta va in POST:
in URL lo stile a 130 voci supera il limite e il server risponde vuoto.

| verifica | EU-DEM 25 m | DTM 5 m |
|---|---|---|
| piede rilevato CTRN meno terreno (566 edifici) | **-5.17 m** | **-0.32 m** |
| pelo del lago | 63.5 m | **64.0-64.1 m** (WATER_LEVEL 64.15) |
| scarto EU-DEM meno DTM | — | mediana +2.54 m, p90 +8.80 m |

Conseguenze: la rupe della Rocca esiste davvero nel modello, la mesh del
terreno passa a 5 m (206k triangoli, glTF 0.65 MB) e `garda.nav.json` porta il
terreno a 5 m (289 KB, 36 KB gzip).

**Non c'e' LiDAR su Garda**: i DSM a 2 m del geoserver regionale (`DSM_FP/LP_2m_clip`)
coprono il Bellunese. Senza DSM, le falde restano a padiglione dal modello, non
rilevate.

### Altezze rilevate — CTRN Regione Veneto

`ctrn.mjs` scarica lo strato `v_edifici` (GeoPortale ARPAV, CC BY 3.0): per
ogni unita' volumetrica sagoma, `piede` e `gronda` in m s.l.m. Il WFS non lo
espone; una GetFeatureInfo JSON con `buffer` restituisce anche la geometria,
247 chiamate sequenziali a celle da 80 m. **606 unita', tutte con quote.**

| misura | valore |
|---|---|
| errore del vecchio modello stimato (per edificio) | mediana assoluta **2.51 m**, p10 -5.1, p90 +4.3 |
| scarto fra centroidi CTRN e OSM | ~1.5 m |
| piede CTRN - EU-DEM | mediana **-5.2 m** -> si usa solo gronda - piede |
| unita' usate / scartate | 572 / 33 (coperture aperte, altezze fuori 2..40 m) |
| edifici OSM tenuti (nessuna CTRN sopra) | 63 su 427 |

Il -5.2 m dice anche che l'EU-DEM nel nucleo urbano sta alto: da correggere
quando entrera' un DTM migliore.

### Zona rifinita — lungolago, moli, darsena

Rettangolo sito x[-540..-60] y[-320..90]: Piazza Catullo, i moli, la
darsena, il lungolago Regina Adelaide. Tutto calcolato dai dati, niente a mano:

- **riva dall'ortofoto 2023** (`orto.mjs`, GeoPortale ARPAV, 0.25 m/px):
  misurato, la riva dell'EU-DEM stava fino a **40 m** nell'entroterra davanti
  al porto; il poligono regionale del lago e' 1:50 000 (29 vertici in 480 m).
  Lago aperto segmentato (colore + varianza + riempimento dal largo + apertura
  morfologica 2 m); **porto digitalizzato a mano** sull'ortofoto (bacino, diga a
  L da 6 m, pontile da 2.6 m, ormeggi), precisione ±1-2 m. Licenza dello strato
  da verificare prima di pubblicare dati derivati
- **prova**: `node tools/garda/measure.mjs --top` affianca la vista ortogonale
  del modello all'ortofoto dello stesso rettangolo (`out/ref/confronto_riva.png`)
- **terreno**: vertici del DEM dove l'ortofoto dice acqua sotto il pelo; a terra
  lungo l'acqua una **banchina continua** a 1 m a quota di riva (`ground.mjs`)
- **schiuma** da `riva.png` a 0.5 m, la stessa linea dei muri
- **muro di riva** in pietra lungo la linea, parapetto 75 cm sopra il pelo:
  oltre l'autostep, quindi ferma il personaggio (`greybox.py`)
- **moli** OSM come impalcati da 45 cm (8), **lastricato** nei primi 10 m a terra
- **arredo** (`garda.props.json`, `src/garda/props.ts`): 23 lampioni,
  8 panchine, 83 bitte, 90 barche che dondolano nello shader, con collisioni

Trappole pagate: il poligono della darsena sta quasi tutto in acqua aperta
(i suoi lati sono dighe): ormeggiando su tutto il perimetro uscivano righe di
barche nel lago. Si ormeggia solo dove alle spalle c'e' terra o un molo. E il
personaggio poteva nascere e camminare sul fondale scavato: ora torna
all'ultimo appoggio asciutto e le inquadrature cercano terra sopra 64.7 m.

### L'arena, scelta sui dati

Non a occhio: la finestra 440 x 440 m con piu' superficie costruita. Ricalcolata
sulle sagome CTRN.

| | |
|---|---|
| posizione (metri locali) | x[-329..111] y[-338..102] |
| edifici | **277** unita' |
| cornice (silhouette, non calpestabile) | 208 |
| fondale | 150 |

### Tetti veri

Il tetto e' la superficie di gioco: piatto non si legge e non si gioca.
Falda a **21 gradi** (i coppi gardesani stanno sul 35-40% di pendenza),
gronda a sbalzo di 38 cm.

**Una sola regola genera la mesh e la collisione:**

```
z = gronda + min(distanza dal bordo, rientranza) * tan(21 gradi)
```

Blender la esegue con anelli di `inset_region` da 1.25 m; il browser la
rivaluta punto per punto. 373 edifici a falde, 54 a tetto piano.

Modello: **58 302 triangoli**, glTF Draco **293 KB**.

**Trappole gia' pagate qui, non ripagarle:**

- **Il sole dietro la camera appiattisce tutto.** Meta' dei render iniziali
  non aveva ombre non perche' la luce fosse rotta, ma perche' inquadravo dal
  lato del sole. Le camere stanno a 70-120 gradi dall'asse solare.
- **Il cielo annega il sole.** Sia in Blender sia in three, con l'ambiente a
  intensita' piena il cielo produceva ~80% dell'illuminazione e le ombre
  sparivano. Rapporti tarati: Blender sole 9 / cielo 0.045; three sole 5.2 /
  `scene.environmentIntensity` 0.20. Isolare una sorgente alla volta e'
  l'unico modo per accorgersene: a occhio sembra solo "un po' piatto".
- **OSM non garantisce il verso di percorrenza di una way chiusa.** Circa
  meta' delle sagome gira in senso orario; la faccia che ne nasce ha la
  normale in basso e `inset_region` costruisce la falda VERSO IL SOTTOSUOLO.
  Misurato: tetto disegnato fino a 5.01 m sotto quello calpestabile, cioe'
  esattamente il doppio della salita di colmo. Si normalizza a CCW in
  `build.mjs`, una volta sola.
- **`inradius = 2*area/perimetro` sovrastima del 67%** su una pianta
  allungata (8 x 40 m: da' 6.7 m contro 4 reali). Serve il massimo vero della
  distanza dal bordo, campionato sulla pianta.
- **Un solo `inset_region` da 6.5 m rovescia le piante concave**: i lati che
  rientrano si incrociano e la falda sborda sopra il vicino. A passi da
  1.25 m ogni anello e' un offset perpendicolare vero e quando un braccio si
  chiude la faccia degenera e il ciclo si ferma: e' uno scheletro dritto
  ottenuto senza scriverlo.
- **Le piante molto concave restano comunque fuori portata.** Sotto
  solidita' 0.82 (area / area dell'involucro convesso) il tetto diventa
  piano — che su un palazzo e' anche la scelta architettonica giusta. Senza
  questo, nel render restano macchie nere che nemmeno `recalc_face_normals`
  raddrizza: su un solido auto-intersecato "fuori" non e' definito.
- **Overpass restituisce la geometria intera di ogni way che tocca il bbox.**
  Senza taglio il modello usciva 1623 x 2699 m invece di 1015 x 1500 e le
  strade fluttuavano nel vuoto. `clipPolyline` in `build.mjs`.
- **`Object3D.lookAt` orienta il +Z**, la camera guarda lungo il -Z. Copiare
  quel quaternione su una camera inquadra esattamente il lato opposto. Si usa
  `Matrix4.lookAt`.
- **Una shadow map adattata all'intero frustum in vista plastico** dava un box
  di 9353 m -> 4.6 m per texel: l'ombra di una casa di 10 m stava in due
  texel. Due strategie separate (`fitShadowToSphere` sul modello,
  `fitShadowToFrustum` a terra) in `src/garda/world.ts`.
- **`FogExp2` a 0.00009 su un piano d'acqua di 60 km** rende il lago identico
  al cielo. Densita' corretta: 0.000032.
- **Normal map ripetuta centinaia di volte** senza mipmap -> moire'. Servono
  `generateMipmaps` + anisotropia.
- **`three/examples/jsm` finiva nel chunk `three` condiviso col portfolio.**
  GLTFLoader, DRACOLoader e Sky viaggiavano dentro il bundle che carica anche
  il sito. Escluderli da `manualChunks`: chunk condiviso 786.7 -> 727.4 KB
  (gzip 204.1 -> 186.1).
- **`Reflector` di three non entra nella draw list di questa scena.**
  Verificato spostandolo a quota 300, dove avrebbe dovuto tagliare in due il
  paese, e restava invisibile. Causa non trovata. Il lago usa Fresnel da IBL.
  **Da riprendere:** manca il riflesso planare del rilievo nell'acqua.

## 3. La decisione che decide tutto: il perimetro

**Il perimetro attuale (1.52 km²) è incompatibile con "cura maniacale".**

Non è un'opinione: 427 edifici con facciate, tetti veri, interni visibili e
lightmap cotte sono lavoro da studio. I mondi per cui Bruno Simon è celebre
sono **piccoli ed eseguiti perfettamente**, non grandi e approssimati.

La misura di §1 dice già dove sta il gioco: **la finestra 400 × 400 m del
centro storico, 127 edifici, 76% dei tetti collegati.** Un decimo del lavoro,
tutta l'identità.

**Proposta:**

| zona | estensione | trattamento |
|---|---|---|
| **arena** | 400 × 400 m, centro storico + porto | tutto: facciate, tetti veri, lightmap, collisione fine |
| **cornice** | fino a ~900 m | volumi con silhouette corretta, materiale semplice, non calpestabile |
| **fondale** | Rocca + lago + monti | terreno scolpito, nessuna interazione |

La Rocca resta **visibile e raggiungibile** — è la spina verticale del livello,
188 m di salita — ma come percorso scolpito, non come superficie di gioco libera.

---

## 4. La decisione tecnica che decide il look: cuocere la luce

Il PBR realtime che gira adesso **non arriverà mai** a quel livello di
finitura. Il salto non è "più shader": è **cuocere**.

- GI Cycles → lightmap per l'arena, esportate in KTX2
- ombra e rimbalzo di qualità cinematografica a **costo runtime zero**
- il sole realtime resta solo per gli oggetti mobili e il personaggio

Blender è già nella pipeline: è un'estensione di `greybox.py`, non un
cambio di rotta. **Va deciso ora**, perché detta layout UV, come si spezza la
geometria e tutto il sistema dei materiali. Rimandarlo significa rifare.

---

## 5. Cosa gira gia' — misurato nel bundle, non ancora in browser

Lo stack e' quello deciso in `docs/STACK.md`: **`three/webgpu` + TSL**,
`WebGPURenderer` con fallback WebGL2 automatico (`?backend=gpu|gl` per
misurare i due backend sulla stessa scena), ombre `CSMShadowNode`,
**Rapier SIMD** con `KinematicCharacterController`. Lo spike F0.5 non e' piu'
un piano: e' il codice che gira in `src/garda/`.

`/garda.html` — entry Vite separata. **Il vincolo e' verificabile nel bundle,
non promesso a parole** (build del 2026-09-12, `vite build`, 657 ms):

```
dist/index.html -> main.js, main.css, motion.js, react-dom, runtime, ...
                   nessun byte di three, di garda o di rapier
dist/garda.html -> garda.js -> three, three.tsl, rapier (dinamici)
```

Peso della prima visita a `/garda.html`, **misurato** (gzip dove comprime;
glTF Draco e PNG contati grezzi, sono gia' compressi):

| voce | raw | in rete |
|---|---:|---:|
| `garda.js` + `garda.css` | 120.3 KB | **40.6 KB** |
| `three` (core WebGPU) | 727.4 KB | 183.2 KB |
| `three.tsl` | 675.0 KB | 187.4 KB |
| Rapier js + wasm | 2.40 MB | 767.5 KB |
| decoder Draco (wasm + wrapper) | 250.9 KB | 74.8 KB |
| `garda.glb` | 686.1 KB | 686.1 KB |
| `garda.nav.json` | 296.4 KB | 35.9 KB |
| `garda.veg.json` + props | 112.3 KB | 42.7 KB |
| texture PNG (`public/garda/tex`) | 1.11 MB | 1.11 MB |
| **totale prima visita** | | **~3.12 MB** |

Di questi **1.21 MB sono runtime condiviso** (three, TSL, Rapier, Draco):
restano in cache fra le visite. La scena vera pesa **1.91 MB**, e **1.11 MB
sono PNG** — cioe' la voce piu' grossa del progetto e' l'unica non ancora
ottimizzata. KTX2/ETC1S e' deciso in `docs/STACK.md` §6 ma **non applicato**:
manca `ktx` di KTX-Software sulla macchina. E' il primo taglio disponibile.

Il wasm di Rapier (733 KB in rete) e' il prezzo della fisica vera e non si
tratta: ha sostituito la collisione analitica, vedi sotto.

- **plastico**: il modello e' un oggetto, lo si gira con inerzia
- **sopralluogo**: prima persona, pointer lock, WASD, corsa, salto
- il passaggio fra i due e' un **volo di camera**, non una dissolvenza

Fisica tarata sul dato misurato del tessuto, non sul gusto:

| grandezza | valore | perche' |
|---|---|---|
| corsa | 7.5 m/s | — |
| gravita' | 17.6 m/s2 | — |
| spinta salto | 7.0 m/s | -> stacco 1.39 m, **5.96 m in corsa** |

Quel 5.96 m e' scelto per coprire il **76.2%** dei gap misurati e non di piu':
se coprisse 12 m il livello sparirebbe, se coprisse 3 m sarebbe un vicolo
cieco. Misurato in browser: corsa 6.29 m/s dopo 1 s, stacco 1.36 m.

### Quanto il tetto calpestabile coincide con quello disegnato

1000 campioni nell'arena, raycast sulla mesh contro la formula analitica
(esclusi i punti entro 40 cm dal filo di gronda, dove il raggio rade la
silhouette e la misura non significa niente):

| stato | scarto mediano | entro 20 cm | max sopra | max sotto |
|---|---|---|---|---|
| verso di percorrenza sbagliato | 1.66 m | — | +5.01 m | — |
| dopo la normalizzazione CCW | 0.21 m | — | +0.23 m | -3.72 m |
| inset a passi da 1.25 m | 0.17 m | 57% | +0.22 m | -2.34 m |
| **piante concave a tetto piano** | **0.028 m** | **78%** | **+0.21 m** | -2.07 m |

Lo scarto e' quasi sempre negativo: la collisione stava appena SOTTO la falda,
quindi non si galleggiava mai in modo visibile. Restava una coda: su qualche
pianta concava sopra soglia si sprofondava fino a 2 m dentro il displuvio.

**Questa tabella e' storia.** La collisione non insegue piu' la mesh: i
collider sono **trimesh Rapier costruiti dagli stessi mesh che si vedono**
(`src/garda/physics.ts`). Lo scarto fra tetto disegnato e tetto calpestabile
e' zero per costruzione, e la milestone "scheletro dritto vero" e' chiusa da
un'altra strada. La formula analitica sopravvive in `nav.ts` per spawn,
piazzamenti e query di quota, dove 20 cm non si vedono.

**Non verificato in questa sessione:** il runtime WebGPU in browser (l'ultima
verifica in Chromium e' anteriore al passaggio a `three/webgpu`), Firefox,
Safari, touch, hardware modesto. **Nessun frame time misurato sul nuovo
backend** — la soglia F0.5 di `STACK.md` §5 e' ancora da riempire con numeri.

**Verruca nota:** la build emette ~1.2 MB di decoder Draco hashati che nessuno
scarica (duplicati di quelli in `public/garda/draco/`). Peso dell'artefatto,
non della banda utente.

## 6. Milestone, riscritti

1. ~~Verifica dati~~ **fatto**
2. ~~Grey-box + controller + collisioni~~ **fatto**
3. ~~Perimetro ristretto sull'arena~~ **fatto** — 440 m, 145 edifici, §2
4. ~~Tetti veri, con collisione che li segue~~ **fatto** — §2, §5
5. ~~4bis — scheletro dritto vero~~ **superato** — trimesh Rapier: il tetto
   calpestabile e' il tetto disegnato, §5
6. ~~Stack: `three/webgpu` + TSL + Rapier SIMD~~ **fatto nel codice**, §5 —
   ma la soglia F0.5 di `STACK.md` §5 e' **aperta**: nessun frame time
   misurato, nessun A/B WebGPU contro `forceWebGL`
7. **Misurare il portale in browser.** E' il prossimo, e viene prima di
   qualsiasi cosa nuova: il runtime e' cambiato sotto i piedi e l'ultima
   verifica in Chromium e' di un'altra architettura
8. **KTX2 sulle texture**: 1.11 MB di PNG e' la voce piu' grossa e l'unica
   non ottimizzata. Serve `ktx` di KTX-Software (`STACK.md` §6)
9. **Cottura GI** (§4) o GTAO realtime: l'A/B e' deciso in `STACK.md` §2 e
   detta UV e materiali. Va fatto prima delle facciate, non dopo
10. **Kit modulare di facciate** + trim sheet: 145 edifici si fanno cosi'
11. **Scolpire la Rocca** su fotografia — il DEM non ce l'ha
12. **Portale** dal portfolio: la mesh neurale collassa e risucchia dentro
13. Ottimizzazione: LOD, streaming per zone

Il 9 e' quello che decide se il progetto sembra un gioco o una demo. Il 7 e'
quello che decide se sappiamo di cosa stiamo parlando.

---

## 7. Domande ancora aperte

- Obiettivi di gioco o sandbox? (decide se servono NPC, tempi, stati)
- Prima o terza persona definitiva? (la terza persona costringe a modellare
  il personaggio e cambia la camera nei vicoli stretti)
- Repo separato per il gioco? Oggi vive qui come entry a sé: il portfolio
  non si porta dietro un byte, verificabile nel bundle.

---

## 8. Licenze — in ordine dal giorno uno

- OSM → **ODbL**, attribuzione a schermo: c'è, in basso a sinistra
- EU-DEM → Copernicus, ridistribuzione libera, attribuzione: c'è
- **Mai** mesh estratte da Google Maps/Earth
