export function hash32(seed, x, y) {
  let h = seed | 0;
  h ^= Math.imul(x | 0, 0x27d4eb2d);
  h ^= Math.imul(y | 0, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

export function random01(seed, x, y) {
  return hash32(seed, x, y) / 4294967295;
}
