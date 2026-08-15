/** Epicode CS0724IT — diploma + 10 moduli. Asset in /public/certs. */
export const DIPLOMA = {
  image: '/certs/diploma.webp',
  pdf: '/certs/diploma.pdf',
  width: 1600,
  height: 900,
} as const;

export const CERT_MODULES = [
  { code: 'M0', image: '/certs/m0.webp' },
  { code: 'M1', image: '/certs/m1.webp' },
  { code: 'M2', image: '/certs/m2.webp' },
  { code: 'M3', image: '/certs/m3.webp' },
  { code: 'M4', image: '/certs/m4.webp' },
  { code: 'M5', image: '/certs/m5.webp' },
  { code: 'M6', image: '/certs/m6.webp' },
  { code: 'M7', image: '/certs/m7.webp' },
  { code: 'M8', image: '/certs/m8.webp' },
  { code: 'M9', image: '/certs/m9.webp' },
] as const;

export const CERT_MODULE_SIZE = { width: 900, height: 507 } as const;
