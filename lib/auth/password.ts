import bcrypt from "bcryptjs";

// Pure-JS bcrypt (bcryptjs, not bcrypt/@node-rs/bcrypt) — same reasoning as
// the Prisma driver adapter choice: no native binaries anywhere in the
// stack, so the Azure App Service standalone deploy never has to worry
// about a missing prebuilt binary for the target platform.
const SALT_ROUNDS = 12;

export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
