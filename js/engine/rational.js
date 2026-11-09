// Aritmetica sui numeri razionali (n/d), sempre ridotti ai minimi termini.
export const gcd = (a, b) => {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
};
const LIMIT = 1e12;
function chk(x) {
  if (!Number.isSafeInteger(x) || Math.abs(x) > LIMIT) throw new RangeError('overflow');
  return x;
}
export function R(n, d = 1) {
  if (d === 0) throw new RangeError('div0');
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return { n: chk(n / g), d: chk(d / g) };
}
export const add = (a, b) => R(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => R(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => R(a.n * b.n, a.d * b.d);
export const div = (a, b) => {
  if (b.n === 0) throw new RangeError('div0');
  return R(a.n * b.d, a.d * b.n);
};
export function pw(a, e) {
  let r = { n: 1, d: 1 };
  for (let i = 0; i < e; i++) r = mul(r, a);
  return r;
}
export const eq = (a, b) => a.n === b.n && a.d === b.d;
