// WGS84 -> UTM, serie di Kruger/Snyder. Implementazione indipendente da BlenderGIS.
const a = 6378137.0, f = 1 / 298.257223563, k0 = 0.9996;
const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
const rad = (d) => (d * Math.PI) / 180;

function toUTM(lat, lon, zone = 32) {
  const lon0 = rad(zone * 6 - 183);
  const p = rad(lat), l = rad(lon);
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const T = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2;
  const A = (l - lon0) * Math.cos(p);
  const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * p
    - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
  const E = k0 * N * (A + ((1 - T + C) * A ** 3) / 6
      + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  const Nn = k0 * (M + N * Math.tan(p) * ((A ** 2) / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24
      + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [E, Nn];
}

const BGIS = {
  PuntaSanVigilio: [630452.41, 5047933.86],
  MonteLuppia:     [631942.07, 5049623.40],
  LaRocca:         [633685.44, 5047616.40],
  GardaPaese:      [633302.74, 5048320.69],
  arena_SW:        [630270.25, 5047309.87],
  arena_NE:        [635694.72, 5050034.91],
};
const PUNTI = {
  PuntaSanVigilio: [45.57271, 10.67191],
  MonteLuppia:     [45.58763, 10.69145],
  LaRocca:         [45.56924, 10.71324],
  GardaPaese:      [45.57565, 10.70853],
  arena_SW:        [45.56713, 10.66941],
  arena_NE:        [45.59061, 10.73965],
};

let peggio = 0;
console.log('punto                 dE (m)     dN (m)');
for (const [k, [lat, lon]] of Object.entries(PUNTI)) {
  const [E, N] = toUTM(lat, lon);
  const dE = E - BGIS[k][0], dN = N - BGIS[k][1];
  peggio = Math.max(peggio, Math.abs(dE), Math.abs(dN));
  console.log(`${k.padEnd(18)} ${dE.toFixed(3).padStart(9)} ${dN.toFixed(3).padStart(10)}`);
}
console.log(`\nscarto massimo fra le due implementazioni: ${peggio.toFixed(3)} m`);

// Geometria vera dell'arena
const [Esw, Nsw] = toUTM(45.56713, 10.66941), [Ene, Nne] = toUTM(45.59061, 10.73965);
const [, Nnw] = toUTM(45.59061, 10.66941);
console.log(`\nlargo E-O  ${(Ene - Esw).toFixed(1)} m`);
console.log(`alto  N-S  ${(Nnw - Nsw).toFixed(1)} m   (stesso meridiano, non SW->NE)`);
console.log(`dN fra SW e NE ${(Nne - Nsw).toFixed(1)} m  -> differenza ${(Nne - Nnw).toFixed(1)} m = convergenza del meridiano`);
const gamma = (10.70453 - 9) * Math.sin(rad(45.578));
console.log(`convergenza attesa ~${gamma.toFixed(3)} deg -> su ${(Ene - Esw).toFixed(0)} m di est = ${((Ene - Esw) * Math.tan(rad(gamma))).toFixed(1)} m`);
