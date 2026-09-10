# Garda 3D — portale dal portfolio a una mappa giocabile

Stato: **piano, niente codice scritto.** Documento di handoff per riprendere la sessione altrove.

---

## 1. L'idea

Il portfolio apre un portale su una scena Three.js dove si gira per Garda (VR 37016)
in prima/terza persona, con movimento tipo parkour.

## 2. Vincolo che decide tutto: da dove viene la geometria

### ❌ Estrarre le mesh da Google Maps

Tecnicamente possibile (ripper via RenderDoc). **Da scartare.** La fotogrammetria è
di Google: ripubblicarla viola i ToS e il copyright. Su un portfolio di un security
researcher è anche l'ironia sbagliata.

### ✅ A — Google Photorealistic 3D Tiles API

Il modo *licenziato* di avere quello stesso dato.

- Formato OGC 3D Tiles, in streaming.
- Si aggancia a Three.js con [`3d-tiles-renderer`](https://github.com/NASA-AMMOS/3DTilesRendererJS).
- Attribution obbligatoria a schermo, billing a richiesta (c'è credito mensile gratuito).

**Pro:** zero pipeline. Se la copertura c'è, la mappa è fatta in un pomeriggio.
**Contro:**
- Copertura da verificare (vedi §5): i comuni piccoli spesso hanno solo terreno con
  ortofoto spalmata, inutile per il parkour.
- **I mesh fotogrammetrici sono pessimi collisori.** Sono fusi, senza spigoli netti,
  con geometria rumorosa. Non ci si cammina sopra decentemente.
- Geometria non modificabile.

### ✅ B — Ricostruzione da dati aperti

- **Footprint edifici:** OpenStreetMap (zona lago molto mappata; le altezze
  `building:levels` saranno però sparse e vanno integrate a mano).
- **Terreno:** LiDAR / DTM-DSM della **Regione Veneto** (Geoportale Veneto) —
  rilievi buoni sull'area gardesana. Fallback: Geoportale Nazionale.
- **Pipeline:** OSM → estrusione → Blender (cleanup, tetti, dettagli) → glTF.

**Pro:** geometria **tua** — pulita, collisori veri, tetti calpestabili, stile
coerente con l'identità visiva del sito invece che fotorealismo generico.
**Contro:** settimane di lavoro.

> **Raccomandazione: B**, o A solo come reference visiva in Blender.
> La fotogrammetria è bellissima da ferma e orribile da attraversare.

## 3. Lo scope è la vera trappola

Il comune di Garda è **~25 km²**. Un'area giocabile di quelle dimensioni è un
progetto da studio, non da portfolio — e il 95% è collina e vigneti: zero
verticalità, zero parkour.

Tutto ciò che rende Garda riconoscibile sta in **mezzo km²**:

- il porticciolo
- il lungolago
- i vicoli del centro storico
- la Rocca sopra il paese

Denso, verticale, tetti attaccati: **un livello di parkour già progettato nel 1400.**

**Decisione da prendere per prima:** perimetro giocabile. La proposta è il centro
storico + lungolago, con il resto come skybox/terreno non calpestabile a bassa LOD.

## 4. Architettura

### Il portale
Non un link. La mesh neurale già presente in `src/components/canvas/` **collassa**
e risucchia dentro la scena.

**Vincolo non negoziabile:** il gioco è un **chunk separato, caricato solo
all'ingresso**. Il portfolio non deve portarsi dietro un byte del gioco.
Il repo già fa code-splitting aggressivo (vedi `vite.config.ts`,
`manualChunks`) — seguire quel pattern.

### Budget di rendering
Il portfolio ha già un budget GPU impegnato dalla mesh neurale. Il gioco gira
al posto suo, non insieme: allo switch, smontare la simulazione.

### Stack
- Three.js (già in dipendenza, r185)
- Fisica: Rapier (WASM) — il repo ha già toolchain Rust/wasm-pack in CI
- Asset: glTF + **Draco/meshopt** + texture **KTX2/Basis**
- LOD + frustum/occlusion culling obbligatori

## 5. Primo passo, prima di qualsiasi codice

**Verificare la copertura fotogrammetrica di Garda.**

Aprire Google Earth Web sul porticciolo di Garda e inclinare la camera:

- **Edifici 3D veri** → strada A percorribile, almeno come reference.
- **Terreno piatto con foto sopra** → è B, e il primo milestone diventa la
  pipeline OSM + LiDAR.

Da verificare anche (bloccato in questa sessione dalla policy di rete, farlo
a mano su [overpass-turbo.eu](https://overpass-turbo.eu)):

```overpassql
[out:json][timeout:60];
area["name"="Garda"]["boundary"="administrative"]["admin_level"="8"]->.g;
( way["building"](area.g); );
out count;
```

E quanti di quegli edifici hanno `building:levels` o `height`.

## 6. Milestone proposti

1. **Verifica dati** (§5) — mezz'ora, decide tutto il resto.
2. **Grey-box del centro storico.** Volumi senza texture, controller in prima
   persona, collisioni. Serve a capire se il parkour su quella pianta è *divertente*
   prima di investire in geometria bella.
3. **Blocco geometrico definitivo** da OSM + LiDAR, cleanup in Blender.
4. **Texturing e look** coerenti col sito (non fotorealismo: cyan/magenta,
   brutalist-elegance).
5. **Portale** e transizione dal portfolio.
6. **Ottimizzazione**: LOD, KTX2, streaming per zone.

Il milestone 2 è quello che salva o uccide il progetto. Farlo prima di tutto il resto.

## 7. Domande aperte

- Perimetro giocabile definitivo.
- Prima o terza persona.
- Il gioco vive in questo repo o in uno separato? (Separato riduce il rischio
  per il portfolio; il portale diventa un cross-origin o un sotto-percorso Pages.)
- Obiettivi di gioco o sandbox pura?
- Budget mensile accettabile se si va su A (API a consumo).

## 8. Licenze — da tenere in ordine dal giorno uno

- OSM → **ODbL**, attribution obbligatoria.
- Dati Regione Veneto → verificare la licenza del singolo dataset (di norma CC-BY).
- Google 3D Tiles → attribution a schermo, sempre.
- **Mai** mesh estratte da Google Maps/Earth.
