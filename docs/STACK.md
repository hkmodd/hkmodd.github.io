# Garda — decisione sullo stack

Ricerca del 2026-09-11. Ogni riga dice da dove viene:

- **[M]** misurato: letto nel sorgente, su npm, nel registro ufficiale o eseguito su questa macchina
- **[F]** fonte primaria: documentazione o blog del produttore
- **[S]** fonte secondaria, non verificata
- **[D]** mia deduzione

---

## 0. Il riferimento, letto nel codice e non nei blog

Il folio 2025 di Bruno Simon è open source con licenza MIT, file Blender inclusi.

**Stack [M]** (`package.json`, `sources/Game/Rendering.js`, `scripts/compress.js`):

| Voce | Scelta |
|---|---|
| Rendering | `three` ^0.183.2 via `three/webgpu`, `WebGPURenderer` con `forceWebGL: false` |
| Materiali ed effetti | tutto in TSL |
| Post-processing | `THREE.RenderPipeline` con `bloom` e un `cheapDOF` suo, catena ridotta sui livelli di qualità bassi |
| Fisica | `@dimforge/rapier3d` ^0.17.3, veicolo in `PhysicsVehicle.js` |
| Asset | gltf-transform: `etc1s` per le texture, poi `draco` edgebreaker con quantizzazione aggressiva (posizione 12, normale 6, UV 6) |
| Audio | `howler` ^2.2.4 |
| Strumenti | `camera-controls`, `gsap`, `stats-gl`, `tweakpane`, Inspector di three |
| Build | Vite 7, `vite-plugin-wasm`, `vite-plugin-top-level-await` |

**Come illumina [M]** (`sources/Game/Materials/MeshDefaultMaterial.js`, `Cycles/DayCycles.js`)

La luce **non è cotta**. È un modello di shading stilizzato: `MeshLambertNodeMaterial` con un `outputNode` scritto da lui.

- colore base per colore e intensità della luce;
- **ombra di forma** = `smoothstep` sul prodotto normale·direzione della luce;
- **ombra portata** presa dalla shadow map ma trasformata in un fattore, poi **tinta con un colore d'ombra** (viola di giorno, `#6d3fff`) invece di scurire;
- **rimbalzo** che mescola il colore del terreno sulle facce rivolte in basso vicino al suolo;
- nebbia a gradiente;
- quattro preset (giorno, tramonto, notte, alba) interpolati.

Il colore viene da una **texture palette** [F: case study Awwwards, 11 marzo 2026]. Sul mobile la shadow map è ridotta [F].

**Correzione a una mia affermazione precedente**: avevo indicato la luce cotta come leva principale del suo look. Sbagliato. La leva è la **direzione artistica scritta dentro lo shader**. Il bake resta un'opzione per noi (§2), non un requisito.

---

## 1. Decisione

| Strato | Scelta | Perché |
|---|---|---|
| **Renderer** | three **r186** (`three/webgpu`), `WebGPURenderer`, fallback WebGL2 automatico | È lo stack del riferimento [M]. Il fallback sta nel sorgente (`forceWebGL`, `WebGLBackend`) [M]. |
| **Shading** | Materiale "Garda" in TSL, stessi principi di Simon, palette del lago | È lì che nasce la soddisfazione visiva [M §0]. |
| **Ombre** | `SunLight` con cascaded shadow maps | Aggiunta in r186 [M, note di rilascio]. Sostituisce il mio `fitShadowToSphere/Frustum`. |
| **Post-processing** | `RenderPipeline` TSL: bloom, TRAA, GTAO; SSGI/SSR solo se il bilancio regge | I nodi esistono in `examples/jsm/tsl/display/` [M]. |
| **Riflesso del lago** | Nodo TSL `reflector()` | Esiste in `src/nodes/utils/ReflectorNode.js` [M]. Il bug del `Reflector` WebGL diventa irrilevante. |
| **Fisica** | `@dimforge/rapier3d-simd` 0.20.0 + `KinematicCharacterController` | Versione su npm [M]. Pendenza massima, gradino automatico, aggancio al suolo [F: docs Rapier]. SIMD "2–5x rispetto al 2024" [F: blog Dimforge, gennaio 2026]. |
| **Personaggio** | `SkinnedMesh` + `AnimationMixer`, terza persona | `SkinnedMesh` è supportato nel renderer [M]. Sorgente del modello: §4. |
| **Asset** | Blender 5.2 headless → glTF → gltf-transform 4.5 | Pipeline già in uso; gltf-transform 4.5.0 su npm [M]. |
| **Geometria compressa** | Draco per la città statica, meshopt per personaggio e animazioni | Draco già misurato qui (1,24 MB → 148 KB). Meshopt per le animazioni [S]. |
| **Texture** | KTX2: ETC1S per il colore, UASTC per le normali | `KTX2Loader.detectSupport` gestisce `isWebGPURenderer` [M, r185]: il thread del 2024 che diceva il contrario è superato. Regola ETC1S/UASTC [S]. |
| **Audio** | Web Audio nativo tramite `AudioListener` / `PositionalAudio` di three | Zero dipendenze. Howler non pubblica dal 2023 [M, npm]. |
| **Architettura** | three **senza React** dentro `src/garda/`, montato dal portfolio | Il loop di gioco non passa dal reconciler [D]. Stesso schema a classi di Simon [M]. |
| **Misura della fluidità** | Inspector di three + `stats-gl` | Li usa il riferimento [M]. |

### Supporto WebGPU [F: wiki gpuweb, aggiornata il 13 agosto 2026]

- **Chrome/Edge**: Windows, macOS, ChromeOS (113+); Android 12+ su ARM/Qualcomm/Intel (121+); Linux Intel Gen12+ (144+) e NVIDIA Wayland (147+).
- **Safari 26**: macOS, iOS, iPadOS, visionOS.
- **Firefox**: Windows 141+, macOS Apple Silicon 145+ (tutti i Mac 147+). **Linux e Android non ancora**: lì gira il fallback WebGL2.

**Firefox**: `lib/runtime.ts` oggi evita WebGPU su Gecko per lo stutter di TSL. La regola resta finché la misura dello spike (§5) non dice il contrario.

---

## 2. Luce cotta: complemento, da decidere sullo slice

`lightMap` è supportato dai materiali a nodi (`NodeMaterial.setupLightMap`) [M].

Cycles vede la RTX 4080 sia con OptiX sia con CUDA [M, eseguito qui]: il bake è fattibile in locale.

Il dubbio vero riguarda i **vicoli da 3 m**. Un sole realtime non dà l'occlusione morbida che fa sembrare vero un vicolo italiano. Si decide sullo slice F1 con un A/B misurato: GTAO realtime contro AO cotta in lightmap, a parità di frame time [D].

---

## 3. Dati per la fedeltà

| Dato | Stato | Dettaglio |
|---|---|---|
| **Altezze reali degli edifici** | **Disponibili** [M] | Strato `v_edifici` ARPAV / Regione Veneto (CTRN, CC BY 3.0). Campi `altezza`, `gronda`, `piede`, `desuso`. Letti via WMS GetFeatureInfo; il WFS non è esposto sui 3 endpoint provati [M]. |
| Confronto col modello attuale | **Sottostima di circa 3 m** [M, campione piccolo] | 8 edifici nell'arena: altezza p10/p50/p90 = **8,2 / 9,9 / 15,2 m**. Il modello inventato in `build.mjs` ha mediana 7,0 m. Record datati 2021. |
| Download massivo | Da fare | Portale IDT2 (`idt2.regione.veneto.it/idt/downloader/download`), filtro per comune. Non automatizzato: interrogare il WMS punto per punto sarebbe un abuso di un servizio pubblico. |
| **LiDAR DTM 1 m** (PST, MASE) | Copertura **non verificata** | Voli 2008–2010, CC BY 4.0, bbox lon 10,68–13,09 / lat 44,79–46,63: contiene Garda [M, record RNDT]. Ma il PST volava per strisce, e oggi il WMS del PCN risponde **HTTP 500** [M]. |
| DTM armonizzato 5 m | Ripiego | Regione Veneto, da voli LiDAR regionali, "la maggior parte del territorio" [F]. È 5 volte più fine dell'EU-DEM 25 m in uso. |
| OSM | Resta | Sagome, strade, POI (ODbL). Da confrontare con le sagome CTRN. |
| **Foto dell'autore** | Da raccogliere | Sorgente di verità per materiali, colori e la Rocca. |

---

## 4. Scartati o sospesi

| Opzione | Esito | Motivo |
|---|---|---|
| Babylon.js | scartato | Motore completo (Havok, audio), ma ecosistema molto più piccolo [S] e fuori dal riferimento. Cambiare costa più di quanto rende [D]. |
| PlayCanvas | scartato | Il flusso è l'editor in cloud; noi lavoriamo da codice e Blender headless. Buone prestazioni mobile [S]. |
| Needle Engine | scartato | Lightmap da Blender e caricamento progressivo interessanti [F]. Ma su npm oggi è `6.0.0-alpha.3` [M] e la pagina prezzi non si è caricata, quindi la licenza per un portfolio professionale non è verificata. L'idea del glTF progressivo si replica. |
| Gaussian splat (Spark 2.1) | sospeso | Solo WebGL2 [F: docs Spark], quindi non condivide un renderer WebGPU. Solo esperimento per il fondale, fuori dal nucleo. |
| Jolt Physics | scartato | Più funzioni (corpi morbidi, veicoli) che qui non servono; Rapier è già collaudato dal riferimento. "2x più veloce di Rapier" [S, non verificato]. |
| Unity / Godot export web | **non ricercati a fondo** | Runtime più pesanti, perdono la disciplina di payload del repo [D]. |
| Mixamo per il personaggio | aperto | Gratuito anche per uso commerciale, senza ridistribuire i file grezzi [S]. La FAQ Adobe ha risposto **403**: termini da riconfermare alla fonte prima di usarlo. |

---

## 5. Impatto sul piano

**F0.** La mappatura dei muri in Blender resta da applicare: le UV non dipendono dal renderer. Tutto il resto di `world.ts` si riscrive. `PCFSoftShadowMap`, usato oggi, è **rimosso in r186** [M, note di rilascio]. `onBeforeCompile` e il `Reflector` WebGL non esistono nel mondo TSL.

**F0.5 — spike tecnico, nuovo, prima di F1.** Arena attuale portata su `three/webgpu` r186 con materiale TSL, `SunLight` a cascate e personaggio Rapier. Soglie:

- frame time a 1440p sulla 4080 **misurato con WebGPU e con `forceWebGL`**. I blog promettono 2–10x [S]: il numero vero lo diamo noi;
- nessuna regressione di shading fra i due backend;
- il controller sale e scende una falda a 21° senza scatti, gradino automatico ≤ 0,35 m.

**F1** resta com'era, con lo shading stilizzato come leva principale e l'A/B sulla luce cotta.

---

## 6. Permessi necessari

Per le regole del progetto, niente di questo si installa senza ok:

1. `three` 0.185.1 → **0.186.0**, pinnata esatta. È uscita l'8 settembre 2026 [M]: `SunLight` è nuova, va provata nello spike prima di fidarsi.
2. `@dimforge/rapier3d-simd` 0.20.0, più il pacchetto non-SIMD come ripiego.
3. `@gltf-transform/cli`, `core`, `functions`, `extensions` (dev).
4. **KTX-Software ≥ 4.4.0**, strumento di sistema: gltf-transform lancia il comando `ktx` e fallisce se manca [M, `packages/cli/src/transforms/toktx.ts`]. Oggi `toktx`/`ktx` non sono installati [M].

---

## Fonti

- [brunosimon/folio-2025 (GitHub)](https://github.com/brunosimon/folio-2025) — `package.json`, `Rendering.js`, `MeshDefaultMaterial.js`, `DayCycles.js`, `compress.js`
- [Bruno's Portfolio Case Study (Awwwards, 2026-03-11)](https://www.awwwards.com/brunos-portfolio-case-study.html)
- [DeepWiki folio-2025](https://deepwiki.com/brunosimon/folio-2025)
- [three.js releases (GitHub API)](https://github.com/mrdoob/three.js/releases)
- [WebGPU Implementation Status (gpuweb wiki)](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- [SSGINode](https://threejs.org/docs/pages/SSGINode.html) · [GTAONode](https://threejs.org/docs/pages/GTAONode.html)
- [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/)
- [Dimforge: 2025 review and 2026 goals](https://dimforge.com/blog/2026/01/09/the-year-2025-in-dimforge/)
- [glTF Transform CLI](https://gltf-transform.dev/cli) · [toktx.ts](https://github.com/donmccurdy/glTF-Transform/blob/main/packages/cli/src/transforms/toktx.ts)
- [Spark docs](https://sparkjs.dev/docs/overview/)
- [Needle Engine pricing](https://needle.tools/pricing/) · [Needle lightmapping](https://engine.needle.tools/docs/blender/lightmapping.html)
- [ARPAV GeoPortale — Edifici](https://gaia.arpa.veneto.it/layers/geonode:v_edifici)
- [Regione Veneto — nuovo DTM da LiDAR](https://idt2.regione.veneto.it/nuovo-dtm-derivato-da-dati-lidar/) · [IDT2 download](https://idt2.regione.veneto.it/idt/downloader/download)
- [RNDT — DTM LiDAR 1 m Veneto](https://geodati.gov.it/resource/id/m_amte:299FN3:6ad216c2-614b-4eb6-94d8-deefee09ba48)
- [Three.js vs Babylon.js vs PlayCanvas (utsubo, 2026)](https://www.utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison) [S]
- [Mixamo License Guide (licenseorg)](https://www.licenseorg.com/guide/3d-assets/mixamo) [S]
