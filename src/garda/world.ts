/**
 * La scena: cielo, sole, lago, paese, alberi, arredo.
 *
 * Materiali in TSL (`materials.ts`), ombre a cascate (`CSMShadowNode`, gia'
 * in r185), riflesso del lago con `reflector()`. Tutto gira sia su WebGPU sia
 * sul fallback WebGL2 senza una riga diversa.
 */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';
import {
  Ground,
  Look,
  facadeMaterial,
  makeSky,
  makeWater,
  plinthMaterial,
  roofMaterial,
  streetMaterial,
  terrainMaterial,
  type GardaTextures,
} from './materials';
import type { NavRaw } from './nav';
import { GOLDEN_HOUR } from './palette';
import { Props, type PropsRaw } from './props';
import { Vegetation, type VegRaw } from './vegetation';

export const WATER_LEVEL = 64.15; // pelo misurato sul DTM regionale a 5 m

/**
 * Il cielo e' una scatola: tutto cio' che deve vedersi va dentro. Scatola da
 * 20 km, lago da 16 km, far plane a 30 km. Una scatola da 450 km (il valore
 * degli esempi) costringerebbe il far plane a centinaia di km e la precisione
 * di profondita' sui tetti a 3 m dalla camera sparirebbe.
 */
const SKY_SIZE = 20000;
const WATER_SIZE = 16000;
export const CAMERA_FAR = 30000;
export const SHADOW_RANGE_PLASTICO = 4800;
export const SHADOW_RANGE_GAME = 900;

export interface World {
  scene: THREE.Scene;
  look: Look;
  sun: THREE.DirectionalLight;
  csm: CSMShadowNode;
  sky: THREE.Mesh;
  water: THREE.Mesh;
  model: THREE.Group;
  ground: Ground;
  /** Assente se il file non arriva: il paese resta visitabile. */
  vegetation: Vegetation | null;
  props: Props | null;
  /** Mesh da trasformare in collider: esattamente quelli disegnati. */
  staticMeshes: THREE.Mesh[];
  center: THREE.Vector3;
  radius: number;
  /** Da chiamare a ogni frame prima del render. */
  update(camera: THREE.Camera): void;
  /** Da richiamare quando cambia la proiezione della camera. */
  updateShadowFrustums(): void;
  /** Metri coperti dalle ombre a cascate: largo sul plastico, stretto a terra. */
  setShadowRange(maxFar: number): void;
  dispose(): void;
}

interface LoadedTextures {
  tex: GardaTextures;
  suolo: THREE.Texture;
  rumore: THREE.Texture;
  riva: THREE.Texture;
}

/** Zona rifinita in metri sito: la stessa ORTO_ZONE di tools/garda/site.config.mjs. */
const RIVA_ZONE = { x0: -540, y0: -320, x1: -60, y1: 90 };

async function loadTextures(renderer: THREE.WebGPURenderer): Promise<LoadedTextures> {
  const loader = new THREE.TextureLoader().setPath('/garda/tex/');
  const names = [
    'coppi_c.png',
    'coppi_n.png',
    'intonaco_c.png',
    'intonaco_m.png',
    'intonaco_n.png',
    'selciato_c.png',
    'selciato_n.png',
    'suolo.png',
    'rumore.png',
    'riva.png',
  ] as const;
  const all = await Promise.all(names.map((n) => loader.loadAsync(n)));
  const [coppiC, coppiN, intoC, intoM, intoN, selC, selN, suolo, rumore, riva] = all;
  const aniso = renderer.getMaxAnisotropy();
  for (const t of all) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
  }
  // La mappa del suolo copre il sito una volta sola: ripeterla farebbe
  // comparire un giardino del bordo nord in mezzo al lago a sud.
  for (const t of [suolo, riva]) {
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
  }
  // Colore in sRGB; maschere, normali e rumore sono dati: convertirli
  // sposterebbe le soglie e l'inclinazione delle normali.
  for (const t of [coppiC, intoC, selC]) t.colorSpace = THREE.SRGBColorSpace;
  for (const t of [coppiN, intoM, intoN, selN, suolo, rumore, riva]) t.colorSpace = THREE.NoColorSpace;
  return { tex: { coppiC, coppiN, intoC, intoM, intoN, selC, selN }, suolo, rumore, riva };
}

/** Un file JSON opzionale: se manca il mondo prosegue senza, e lo dice. */
async function optional<T>(url: string, what: string, build: (raw: never) => T): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return build((await res.json()) as never);
  } catch (err) {
    console.warn(`[garda] ${what} non disponibile, si prosegue senza`, err);
    return null;
  }
}

export async function buildWorld(renderer: THREE.WebGPURenderer, nav: NavRaw): Promise<World> {
  const scene = new THREE.Scene();
  const look = new Look(GOLDEN_HOUR);
  const sunDir = look.sunVector();

  /* ── cielo ── */
  const sky = makeSky(look, SKY_SIZE * 0.5);
  scene.add(sky);

  /* ── sole con ombre a cascate ──
     L'intensita' della luce non conta: il colore lo decide l'outputNode.
     La luce esiste per produrre la shadow map. */
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Col sole a 13 gradi ogni texel d'ombra copre ~4 volte il suo lato in
  // profondita' (1/tan 13°). Le righe a terra viste nella prima taratura non
  // erano acne: misurato con `?shadows=0`, restavano identiche.
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.45;
  sun.position.copy(sunDir).multiplyScalar(600);
  sun.target.position.set(0, 0, 0);
  // Il raggio delle cascate dipende dalla modalita' (`setShadowRange`).
  // Misurato: con 900 m fissi, dal plastico (camera a ~1.6 km) tutto il paese
  // oltre la copertura prendeva il colore d'ombra, con un confine netto.
  const csm = new CSMShadowNode(sun, { cascades: 3, maxFar: SHADOW_RANGE_PLASTICO, mode: 'practical', lightMargin: 600 });
  csm.fade = true;
  sun.shadow.shadowNode = csm;
  scene.add(sun, sun.target);

  /* ── modello, texture, alberi, arredo ── */
  const draco = new DRACOLoader();
  draco.setDecoderPath('/garda/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  const [gltf, loaded, vegetation, props] = await Promise.all([
    loader.loadAsync('/garda/garda.glb'),
    loadTextures(renderer),
    optional('/garda/garda.veg.json', 'vegetazione', (raw: VegRaw) => new Vegetation(raw, look)),
    optional('/garda/garda.props.json', 'arredo', (raw: PropsRaw) => new Props(raw, look)),
  ]);
  draco.dispose();
  const { tex, suolo, rumore, riva } = loaded;
  const ground = new Ground(nav.terrain, suolo, rumore);
  // Prima di costruire i materiali: lo shader dell'acqua sceglie la riva fine
  // solo se la texture c'e' quando viene compilato.
  ground.setRiva(riva, RIVA_ZONE);
  const model = gltf.scene;

  // Il glTF porta solo i NOMI dei materiali: dicono quale superficie e' quale.
  const byName: Record<string, THREE.Material> = {
    intonaco: facadeMaterial(look, tex, ground),
    coppi: roofMaterial(look, tex),
    // Prima taratura '#a8a29a' a 3 m di piastrella: sul lungolago, a 1.5 m
    // d'occhio, ciottoli marroni da 30 cm che sembravano fango crepato. Pietra
    // piu' chiara e grigia, piastrella dimezzata (ciottolo da 15 cm).
    strada_incisa: streetMaterial(look, tex, '#c9c2b6', 2),
    sentiero: streetMaterial(look, tex, '#bcad92', 2),
    piazza: streetMaterial(look, tex, '#d8cdb9', 2),
    // Muro di riva e moli: UV a 1.5 m, piastrella del selciato a meta' ->
    // conci da ~30 cm, pietra chiara e calda come i muri del lungolago.
    // Prima taratura '#c3b8a6': il muro spariva contro la riva color sabbia.
    riva: streetMaterial(look, tex, '#9c948a', 0.5),
    pontile: streetMaterial(look, tex, '#ab9a82', 0.5),
    // Banchina del lungolago e del porto: lastre chiare, piastrella a 0.75 m.
    banchina: streetMaterial(look, tex, '#d3c8b5', 1),
    terreno: terrainMaterial(look, ground, tex),
    zoccolo: plinthMaterial(look),
  };

  const staticMeshes: THREE.Mesh[] = [];
  const toRemove: THREE.Object3D[] = [];
  const missing = new Set<string>();
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name === 'lago') {
      toRemove.push(mesh);
      return;
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const swapped = mats.map((m) => {
      const next = byName[m.name];
      if (!next) missing.add(m.name);
      return next ?? m;
    });
    mesh.material = Array.isArray(mesh.material) ? swapped : swapped[0];
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    staticMeshes.push(mesh);
  });
  for (const obj of toRemove) obj.removeFromParent();
  if (missing.size) console.warn('[garda] materiali senza sostituto:', [...missing]);
  scene.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() * 0.5;

  if (vegetation) {
    scene.add(vegetation.group);
    console.info(`[garda] ${vegetation.trees.length} alberi in ${vegetation.drawGroups} blocchi`);
  }
  if (props) {
    scene.add(props.group);
    console.info(`[garda] arredo ${JSON.stringify(props.counts)}`);
  }

  /* ── lago ── */
  const { mesh: water } = makeWater(look, WATER_SIZE, ground);
  water.position.set(center.x, WATER_LEVEL, center.z);
  scene.add(water);

  const hasCamera = () => Boolean((csm as unknown as { camera: THREE.Camera | null }).camera);

  return {
    scene,
    look,
    sun,
    csm,
    sky,
    water,
    model,
    ground,
    vegetation,
    props,
    staticMeshes,
    center,
    radius,
    update(camera: THREE.Camera) {
      vegetation?.update(camera);
    },
    setShadowRange(maxFar: number) {
      csm.maxFar = maxFar;
      if (hasCamera()) csm.updateFrustums();
    },
    updateShadowFrustums() {
      // CSMShadowNode prende la camera solo al primo render (`_init`): un resize
      // che arriva prima trova `camera` nullo e crasha su `.far`. Misurato,
      // non teorico: era il primo errore del montaggio.
      if (hasCamera()) csm.updateFrustums();
    },
    dispose() {
      csm.dispose();
      vegetation?.dispose();
      props?.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m.dispose();
      });
      for (const t of Object.values(tex)) t.dispose();
      suolo.dispose();
      rumore.dispose();
      ground.dispose();
    },
  };
}
