/**
 * Perimetro giocabile e costanti del sito.
 *
 * Il box e' scelto sui dati, non a occhio:
 *  - la finestra 400x400 m piu' densa del comune (27% di copertura al suolo,
 *    76% degli edifici con un vicino entro 6 m) sta a 45.5737..45.5773 /
 *    10.7064..10.7116 — e' il centro storico.
 *  - il picco de "La Rocca" (nodo OSM natural=peak) sta a 45.56924 / 10.71324,
 *    ~840 m a sud del centro e ~215 m piu' in alto.
 * Il box tiene dentro entrambi: la citta' densa e la salita che la domina.
 */
export const BBOX = {
  south: 45.5665,
  west: 10.7035,
  north: 45.5800,
  east: 10.7165,
};

/** Origine del sistema metrico locale: il porticciolo. */
export const ORIGIN = { lat: 45.5764, lon: 10.7100 };

/**
 * Zona rifinita (lungolago, porto, Piazza Catullo) in metri sito, e passo
 * dell'ortofoto regionale da cui si ricava la riva vera (`orto.mjs`).
 */
export const ORTO_ZONE = { x0: -540, y0: -320, x1: -60, y1: 90, px: 0.25 };

/** Passo di campionamento del DEM in metri (EU-DEM e' nativo a 25 m). */
export const DEM_STEP_M = 12.5;

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** Equirettangolare locale: a questa scala l'errore e' sotto il centimetro. */
export function makeProjection(origin = ORIGIN) {
  const phi = (origin.lat * Math.PI) / 180;
  const mLat =
    111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
  const mLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  return {
    mLat,
    mLon,
    /** WGS84 -> metri locali. x = est, y = nord. */
    forward: (lat, lon) => [(lon - origin.lon) * mLon, (lat - origin.lat) * mLat],
    inverse: (x, y) => [origin.lat + y / mLat, origin.lon + x / mLon],
  };
}
