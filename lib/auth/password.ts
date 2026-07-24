import bcrypt from "bcryptjs";

// One place that owns the hashing scheme so the seed and the login flow can
// never drift apart. bcrypt (via bcryptjs) is used rather than argon2 to keep
// the install pure-JS and avoid a native build step on Windows.
const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
