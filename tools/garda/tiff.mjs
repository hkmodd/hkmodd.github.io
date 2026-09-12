/**
 * Lettore GeoTIFF minimo, senza dipendenze: quello che serve per leggere le
 * quote LiDAR della Regione (WMS con `format=image/geotiff`, che restituisce
 * i VALORI, non un'immagine colorata).
 *
 * Supporta: strip non compresse o deflate, 1 campione per pixel, interi a
 * 8/16/32 bit e float a 32/64 bit. Basta e avanza per DTM e DSM.
 */
import zlib from 'node:zlib';

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

export function readTags(buf) {
  const le = buf.toString('ascii', 0, 2) === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (u16(2) !== 42) throw new Error('non e\' un TIFF classico');
  const tags = new Map();
  let ifd = u32(4);
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const off = ifd + 2 + i * 12;
    const tag = u16(off);
    const type = u16(off + 2);
    const n = u32(off + 4);
    const size = (TYPE_SIZE[type] ?? 1) * n;
    const at = size <= 4 ? off + 8 : u32(off + 8);
    const values = [];
    for (let k = 0; k < Math.min(n, 4096); k++) {
      const p = at + k * TYPE_SIZE[type];
      if (type === 3) values.push(u16(p));
      else if (type === 4) values.push(u32(p));
      else if (type === 1 || type === 6 || type === 7) values.push(buf[p]);
      else if (type === 11) values.push(le ? buf.readFloatLE(p) : buf.readFloatBE(p));
      else if (type === 12) values.push(le ? buf.readDoubleLE(p) : buf.readDoubleBE(p));
      else if (type === 2) values.push(buf.toString('ascii', at, at + n - 1));
      else values.push(null);
    }
    tags.set(tag, { type, n, values });
  }
  return { le, tags };
}

/** { width, height, data: Float64Array-like (Float32Array o Int32Array) } */
export function decodeGeoTIFF(buf) {
  const { le, tags } = readTags(buf);
  const get = (t, d) => (tags.has(t) ? tags.get(t).values[0] : d);
  const width = get(256);
  const height = get(257);
  const bits = get(258, 8);
  const compression = get(259, 1);
  const samples = get(277, 1);
  const sampleFormat = get(339, 1); // 1 uint, 2 int, 3 float
  const rowsPerStrip = get(278, height);
  const offsets = tags.get(273)?.values ?? [];
  const counts = tags.get(279)?.values ?? [];
  if (samples !== 1) throw new Error(`${samples} campioni per pixel: non supportato`);
  if (![1, 8, 32946].includes(compression)) throw new Error(`compressione ${compression} non supportata`);

  const out = sampleFormat === 3 ? new Float32Array(width * height) : new Int32Array(width * height);
  let row = 0;
  for (let s = 0; s < offsets.length; s++) {
    let strip = buf.subarray(offsets[s], offsets[s] + counts[s]);
    if (compression === 8 || compression === 32946) strip = zlib.inflateSync(strip);
    const rows = Math.min(rowsPerStrip, height - row);
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < width; x++) {
        const p = (r * width + x) * (bits / 8);
        let v;
        if (sampleFormat === 3) v = bits === 64 ? (le ? strip.readDoubleLE(p) : strip.readDoubleBE(p)) : le ? strip.readFloatLE(p) : strip.readFloatBE(p);
        else if (bits === 8) v = strip[p];
        else if (bits === 16) v = le ? strip.readUInt16LE(p) : strip.readUInt16BE(p);
        else v = le ? strip.readInt32LE(p) : strip.readInt32BE(p);
        out[(row + r) * width + x] = v;
      }
    }
    row += rows;
  }
  return { width, height, data: out, bits, sampleFormat, compression };
}
