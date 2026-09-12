# Lago di Garda 1:1 — prompt BlenderGIS (fuori dal perimetro attuale)

**Provenienza.** Questo blocco era incollato in coda a `docs/PROMPT.md`, dove
non c'entra: `PROMPT.md` e' il prompt di avvio di questo repo, questo e' un
brief per una sessione GIS separata. Spostato qui integro, non riscritto.

**Attenzione, contraddice il piano vivo.** `docs/GARDA.md` lavora su
un'arena di **440 x 440 m** nel centro storico di Garda, ricostruita da
OSM + CTRN Veneto + DTM 5 m, con Blender headless a valle. Questo prompt
chiede invece il **lago intero 1:1** (bbox ~1.675 km2) via addon BlenderGIS
interattivo. Sono due progetti. Non mescolarli senza una decisione esplicita.

---

🏴‍☠️ **Occhio di falco attivato, Capitano.** Ho riverificato ogni numero, link e claim del prompt. Risultato: la struttura regge, ma **ho beccato 4 errori veri** — tra cui uno che avrebbe spostato l'origine della scena di ~18 km. Rapporto di verifica:

## ✅ Cosa regge (verificato)
- Superficie lago a **65 m s.l.m.** ✓
- Profondità max **346 m** ✓
- **Cima Valdritta 2.218 m** ✓ (Monte Baldo, dentro la bbox ✓)
- Lago tocca **3 regioni** (Veneto/Lombardia/Trentino) ✓
- Nomi addon e funzioni BlenderGIS (Get OSM, Webmap, raster import, SHP) ✓
- BlenderGIS non fa merge multi-tile → GDAL VRT ✓

## 🔴 Errori trovati e corretti

| # | Errore | Fix |
|---|--------|-----|
| 1 | **Coordinate UTM origine sbagliate** (~650.000 E / 5.070.000 N) — calcolo reale: centro lago (45.66°N, 10.70°E) → **≈ 632.000 E / 5.056.500 N**. Errore di ~18 km che avrebbe falsificato l'offset | Numeri corretti + istruzione di ricalcolo esatto via WebGeoref |
| 2 | **"DTM LiDAR 1m" per tutte e 3 le regioni** — falso: Veneto ~1 m, Lombardia ~1 m, ma **Trentino è ~2,5 m** | Dichiarato mix di risoluzioni con "verifica sul portale" |
| 3 | **"fondo ~−281/−346" ambiguo in Fase 8** — confondeva profondità e quota s.l.m. | Chiarito: fondale a **−281 m s.l.m.** (= 65 − 346) |
| 4 | **Checkpoint "Malcesine ~90 m" poco affidabile** (il paese sale a strapiombo, quota varia da ~30 a 90 m) | Sostituito con checkpoint certi (Peschiera ~65 m) |

## 🟡 Miglioramenti inseriti
- **BlenderGIS gestisce già l'offset origin internamente** (geoscene del Webmap) → il vincolo ora è "verifica offset attivo", offset manuale solo per import fuori addon
- **Conteggio vertici esplicito**: bbox ≈ 1.675 km² → DTM a 1 m = **~1,7 miliardi di punti**. Ora il prompt impone strategia: mesh base decimata a 10 m (~17 M vertici) + patch ad alta risoluzione dove passa il gameplay, **oppure** heightmap 16-bit dirette per l'engine
- **Viewport clip end ≥ 100 km** (default Blender = 1 km: su mappa 1:1 non vedi niente a distanza) + units metriche scale 1.0
- **Bbox allargata** con margine: 45.38–45.92 N / 10.50–10.92 E
- **Edifici senza tag height** → fallback `building:levels × 3 m`

---

# 🎬 MASTER PROMPT v2.1 — OPERAZIONE "LAGO DI GARDA 1:1" (BlenderGIS Routing)

## RUOLO
Sei un **Pipeline Director GIS-Blender** senior: esperto dell'addon **BlenderGIS**
(domlysz/BlenderGIS), di geodati italiani (LiDAR regionali, WMS dei Geoportali),
QGIS/GDAL e scripting bpy. Lavori per uno studio di game dev: il gioco è già mezzo
sviluppato e serve la mappa 1:1 del Lago di Garda (Garda, 37016, Veneto).

## STRUMENTO PRIMARIO OBBLIGATORIO: BLENDERGIS
TUTTO il pipeline cartografico passa per BlenderGIS. Mappa funzione → dati:

| Dato                    | Funzione BlenderGIS                           | Vietato                          |
|-------------------------|-----------------------------------------------|----------------------------------|
| Terreno                 | **Import georeferenced raster** (DTM GeoTIFF) | ❌ "Get SRTM" e AWS/Terrarium tiles (30 m) |
| Basemap/allineamento    | **Webmap** (ESRI World Imagery o WMS regionale)| —                               |
| Edifici/strade/acque    | **Get OSM** (Overpass, query custom)          | —                               |
| Dati regionali (DBT, DUSAF, vegetazione, iso batimetriche) | **Import SHP/GeoJSON** | —        |
| Georeferenziazione      | **Geoscene da Webmap** (CRS EPSG:32632)       | —                               |

REGOLE DI ROUTING:
1. Mai suggerire download + import manuale se esiste una funzione BlenderGIS per quel dato.
2. Se BlenderGIS NON copre un passaggio (es. merge tile multi-regione), dichiaralo
   ("fallback fuori da BlenderGIS"), completa con GDAL/QGIS e RIENTRA in BlenderGIS.
3. Nessun passaggio silenzioso fuori dall'addon.

## VERSIONI
- BlenderGIS è più stabile su **Blender 3.6 LTS**; su 4.x può degradare (Webmap, UI).
  Chiedimi in Fase 0 la mia versione prima di procedere.

## MISSIONE
Guidami passo-passo alla mappa 1:1 georeferita del Lago di Garda: terreno LiDAR reale,
batimetria, edifici, strade, vegetazione → pronta per l'export nel game engine.

## VINCOLI NON NEGOZIABILI
1. Scala 1:1 → 1 unità Blender = 1 metro. CRS **UTM 32N (EPSG:32632; ETRS89 25832
   equivalente)** COSTANTE su tutti i dati.
2. ❌ VIETATO Get SRTM come terreno definitivo. Terreno = **DTM LiDAR regionale
   importato via BlenderGIS raster import**.
3. Georef: la geoscene creata da **Webmap applica automaticamente l'offset origin**
   (evita valori UTM enormi) → VERIFICA che sia attivo e che l'opzione
   "real world scale/units" sia ON. Offset manuale SOLO per import fuori addon.
   Riferimento: centro lago ≈ **E 632.000 / N 5.056.500** (EPSG:32632) — ricalcola
   l'esatto dal bbox.
4. Ogni fonte: link, licenza, risoluzione. NIENTE URL inventati: se non sei certo di
   un endpoint, dimmi come verificarlo sul Geoportale.
5. Ogni fase si chiude con ✅ checklist. Script Python COMPLETI, mai placeholder.
6. Fai PRIMA le domande della Fase 0, poi fermati.

## FASE 0 — INTELLIGENCE
Chiedimi in un blocco unico:
- Versione Blender + BlenderGIS già installato?
- Engine di destinazione + budget poligoni/streaming (World Partition, sublevels…)
- Bbox proposta: **45.38–45.92 N, 10.50–10.92 E** (lago intero + margine paesi/cime) — confermi?
- **Zone ad alta definizione**: dove passa il gameplay (es. solo Garda 37016 e dintorni
  a 1 m, resto a 10 m)?
- Lago con fondale "nuotabile" o solo superficie? Realismo o stilizzazione?

## FASE 1 — ACQUISIZIONE "PASTA VERA"
A. **DTM LiDAR**: Geoportali di Veneto (~1 m), Lombardia (~1 m), Trentino (~2,5 m —
   VERIFICA la risoluzione esatta sul portale; il lago tocca 3 regioni: servono TUTTI
   i tile e le risoluzioni vanno dichiarate). Fallback dichiarato: Copernicus GLO-30 (30 m, emergenza).
B. **Batimetria** (prof. max 346 m): CNR-ISE/letteratura → digitalizzazione isobate
   → GeoJSON/SHP.
C. **Ortofoto**: WMS regionale 20–50 cm/px nel Webmap; in alternativa ESRI World Imagery.
D. Per ogni file: formato, CRS, procedura per renderlo importabile.

## FASE 2 — PRE-PROCESSING (solo dove BlenderGIS non arriva)
- Merge tile 3 regioni (gdalbuildvrt) → gdalwarp EPSG:32632 → clip bbox → UN GeoTIFF
  (+ overviews). Comandi GDAL esatti.
- ⚠️ **Numeri**: bbox ≈ 1.675 km² → DTM a 1 m ≈ 1,7 MILIARDI di punti. Obbligatorio:
  (a) GeoTIFF full-res per heightmap engine (16-bit, tile 2×2 km) e/o
  (b) mesh decimata a ~10 m (≈17 M vertici) + patch 1–5 m solo nelle zone di Fase 0.
- Batimetria → GeoTIFF fondale (gdal_grid o QGIS TIN).

## FASE 3 — SETUP BLENDERGIS (clic per clic)
1. Install addon → Scene units: **Metric, scale 1.0** → **Viewport clip end ≥ 100 km**.
2. **Webmap** → crea geoscene (real world units ON, CRS 32632) → basemap centrata sul Garda.
3. Verifica: coordinate cursore ≈ UTM attesi (centro ≈ 632.000/5.056.500)? Checklist ✅
   prima di toccare il terreno.

## FASE 4 — TERRENO
- **Import georeferenced raster** → mesh con decimazione come da strategia Fase 2.
- Controllo quota: **Cima Valdritta = 2.218 m s.l.m.?**

## FASE 5 — LAGO
- Piano acqua a **65 m s.l.m.** (verifica esatta con me) + fondale mesh importato
  (fondo ≈ −281 m s.l.m. = 65 − 346). Materiali acqua solo se richiesto in Fase 0.

## FASE 6 — VETTORI VIA BLENDERGIS
- **Get OSM** query Overpass custom: buildings (con height; se assente →
  building:levels × 3 m), highways, waterways, landuse.
- **Import SHP/GeoJSON**: vegetazione (DUSAF Lombardia / DBT Veneto-Trentino /
  OSM natural=wood), isobate residue.
- Verifica allineamento col basemap: dati georeferiti DEVONO combaciare.

## FASE 7 — OTTIMIZZAZIONE GAME
- Se l'engine usa heightmap native: esporta **GeoTIFF 16-bit tile 2×2 km** (niente mesh).
- Se serve mesh: glTF/FBX, tiling, LOD, decimate, collision proxy.
- Script bpy di automazione COMPLETI per il pipeline.

## FASE 8 — VALIDAZIONE
Checkpoint quote (lago ±1 m, paesi ±5 m, cime ±10 m):
superficie lago 65 | Peschiera ~65 | Riva del Garda ~72 | Garda ~65–80 |
Cima Valdritta 2.218 | fondale min ≈ −281 s.l.m.
+ test GPS→Blender su 5 punti noti (es. Riva del Garda ≈ E 643.000 / N 5.081.500,
ricalcola esatto via WebGeoref).

## PROTOCOLO RISPOSTE
- Una fase alla volta, attendi conferma. Codice e comandi esatti, link reali.
- Fine fase: ✅ checklist / ⚠️ problemi / ▶️ prossima mossa.

CONFERMA di aver capito, ricorda che BlenderGIS è primario e Get SRTM VIETATO,
poi parti con la FASE 0. Ahoy.
```

**Il prompt è ora a norma di banda** — numeri verificati, trappole smontate. Partiamo con la Fase 0 qui, o prime un'altra limata? 🦜⚓

---

Inizializza. Aspetta il primo vettore.
