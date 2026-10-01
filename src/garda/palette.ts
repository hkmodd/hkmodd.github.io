/**
 * Direzione artistica di Garda, in un posto solo.
 *
 * Fedele nella pianta, nelle quote e nei colori degli intonaci; stilizzata
 * nella luce. Il principio viene dal folio 2025 di Bruno Simon, letto nel
 * sorgente (`MeshDefaultMaterial.js`): l'ombra non scurisce, CAMBIA COLORE.
 * La sua e' viola perche' il suo mondo e' un giocattolo. Quella di Garda e'
 * il blu freddo che il lago rimanda sui muri esposti a est quando il sole
 * scende dietro la Rocca — il colore che chi abita li' riconosce.
 *
 * Tutti i numeri qui si tarano a occhio SULLE INQUADRATURE FISSE
 * (`node tools/garda/measure.mjs --shots`), mai girando per la scena:
 * altrimenti ogni ritocco sistema un punto e ne rompe un altro.
 */

export interface LookPreset {
  /** Elevazione e azimut del sole, in gradi. Azimut da +X (est) antiorario. */
  sunElevation: number;
  sunAzimuth: number;

  /** Luce diretta: colore e intensita' moltiplicano l'albedo. */
  light: string;
  lightIntensity: number;

  /** Colore dell'ombra, moltiplicato per l'albedo invece di scurirlo. */
  shadow: string;
  /**
   * Esponente dell'albedo in ombra. A 1 un intonaco crema per un blu freddo
   * da' grigio; elevato, il colore si concentra e l'ombra resta ocra-blu.
   */
  shadowSaturation: number;
  /** Soglie dello smoothstep sull'ombra di forma (N·L). */
  coreShadowLow: number;
  coreShadowHigh: number;

  /** Rimbalzo del suolo sulle facce rivolte in basso vicino a terra. */
  bounce: string;
  bounceStrength: number;
  /** Metri sopra il suolo oltre i quali il rimbalzo si spegne. */
  bounceHeight: number;
  /** Caldo del selciato al sole sulle pareti verticali in ombra. */
  wallBounce: number;

  /** Occlusione di contatto al piede dei muri: quanto scurisce, fin dove sale (m). */
  contactShadow: number;
  contactHeight: number;

  /** Nebbia: distanza di inizio e saturazione, colori all'orizzonte e in quota. */
  fogNear: number;
  fogFar: number;
  fogHorizon: string;
  fogZenith: string;
  /** Foschia vicina: quota massima, distanza caratteristica (m), alone verso il sole. */
  haze: number;
  hazeDistance: number;
  sunInscatter: number;

  /** Suolo: terra battuta, prato (verde e secco), uliveti, roccia, lastricato, riva. */
  groundEarth: string;
  groundGrass: string;
  groundGrassDry: string;
  groundOlive: string;
  groundRock: string;
  groundPaved: string;
  groundShore: string;

  /** Intensita' del rilievo delle normal map, per superficie. */
  facadeRelief: number;
  roofRelief: number;
  streetRelief: number;

  /** Vetri: corpo scuro e quanto del cielo riflettono. */
  glassTint: string;
  glassReflection: number;

  /** Lago. */
  waterDeep: string;
  waterShallow: string;
  /** Scintille del sole sull'acqua: colore, esponente (piu' alto = piu' fini), forza. */
  waterGlint: string;
  waterGlintPower: number;
  waterGlintStrength: number;
  waterFoam: string;

  /** Zoccolo del plastico: il taglio del terreno, terra in alto e in basso. */
  plinthTop: string;
  plinthBottom: string;

  /** Luce del sole attraverso le chiome, visto in controluce. */
  foliageTranslucency: string;

  /**
   * Cielo dipinto: gradiente orizzonte → zenit, alone e disco del sole.
   * Non Preetham: vicino al sole il modello fisico supera 1 e, senza tone
   * mapping, bruciava mezzo schermo in controluce (misurato sulle catture).
   */
  skyHorizon: string;
  skyZenith: string;
  sunGlow: string;
  /** Esponente dell'alone: piu' alto = alone piu' stretto. */
  sunGlowPower: number;
  sunGlowStrength: number;
  sunDisc: string;
  /** Coseno del raggio angolare del disco: 0.99975 ≈ 1.3 gradi. */
  sunDiscSize: number;

  /** Esposizione finale e bloom sulle sole alte luci. */
  exposure: number;
  bloomStrength: number;
  bloomThreshold: number;
}

/**
 * Ora dorata di fine estate. Il sole cala a ovest-sudovest, sopra il lago:
 * facciate sul lungolago calde e piene, vicoli nel blu, tetti che bruciano
 * sul colmo. E' l'ora in cui Garda e' Garda.
 */
export const GOLDEN_HOUR: LookPreset = {
  sunElevation: 13,
  sunAzimuth: 206,

  light: '#ffe0bd',
  lightIntensity: 1.18,

  // Prima taratura '#7584b8' con albedo lineare: le facciate in ombra
  // uscivano grigio-lilla piatte (catture 2-4). Piu' chiaro, e la
  // saturazione la recupera l'esponente sull'albedo.
  // Seconda taratura '#8494c6' / 1.35: in piazza l'intonaco crema in ombra
  // restava lavanda. Blu piu' neutro, esponente piu' alto: resta l'ocra.
  shadow: '#8f9ac2',
  shadowSaturation: 1.6,
  coreShadowLow: -0.18,
  coreShadowHigh: 0.28,

  bounce: '#e9c8a0',
  bounceStrength: 0.38,
  bounceHeight: 7,

  wallBounce: 0.2,

  contactShadow: 0.4,
  contactHeight: 1.9,

  // Prima taratura: 380/3400 m. Misurato sulle catture: il paese visto dal
  // plastico (1.6 km) usciva nebbioso per il 40% e il lago lontano diventava
  // una banda color pesca opaca. La foschia deve sciogliere l'orizzonte a
  // 10-15 km, non il paese.
  fogNear: 1800,
  fogFar: 16000,
  fogHorizon: '#e6d6c3',
  fogZenith: '#a9bfd9',
  // Foschia vicina: 1 - e^(-d/800) * 0.2 -> 6% a 300 m, 17% dal plastico.
  haze: 0.2,
  hazeDistance: 800,
  sunInscatter: 0.85,

  // Prima taratura '#b89e7a': sotto il sole caldo il suolo usciva arancione
  // da deserto. Garda e' giardini, uliveti e selciato grigio.
  groundEarth: '#a29c83',
  groundGrass: '#6f8646',
  groundGrassDry: '#a09a5c',
  groundOlive: '#66764a',
  groundRock: '#8e897f',
  groundPaved: '#c2b39b',
  groundShore: '#c4baa6',

  // Prima taratura 0.9 sull'intonaco: il muro sembrava fuso, il rumore della
  // normal map diventava un'ondulazione della parete.
  facadeRelief: 0.35,
  // Prima taratura 1.15: sui tetti vicini i coppi sembravano lamiera ondulata.
  roofRelief: 0.7,
  streetRelief: 0.25,

  glassTint: '#1b2530',
  glassReflection: 0.85,

  waterDeep: '#17394a',
  waterShallow: '#3d7680',
  waterGlint: '#fff0d6',
  waterGlintPower: 380,
  // sopra la soglia del bloom (2.2): le scintille sono le sole alte luci vere
  waterGlintStrength: 3.2,
  waterFoam: '#f1ede2',

  plinthTop: '#6e5a47',
  plinthBottom: '#2e2621',

  foliageTranslucency: '#d8e07c',

  skyHorizon: '#efd8bf',
  skyZenith: '#4f7fb8',
  sunGlow: '#ffcf9a',
  sunGlowPower: 7,
  sunGlowStrength: 0.6,
  sunDisc: '#fff3de',
  sunDiscSize: 0.99975,

  exposure: 1.0,
  // Prima taratura soglia 0.92: il disco solare di SkyMesh e' HDR e il bloom
  // ne faceva un bagliore bianco su meta' schermo in controluce.
  bloomStrength: 0.12,
  bloomThreshold: 2.2,
};
