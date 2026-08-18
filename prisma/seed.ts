// Creates (or updates the password of) the app's user(s) directly — there is
// no public signup page on purpose (personal-use app, see README). Run with:
//   SEED_USER_EMAIL=you@example.com SEED_USER_PASSWORD=... npx prisma db seed
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { parseSqlServerUrl } from "../lib/db/connectionString";
import { hashPassword } from "../lib/auth/password";

const adapter = new PrismaMssql(parseSqlServerUrl(process.env.DATABASE_URL ?? ""));
const prisma = new PrismaClient({ adapter });

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} (scrivi "si" per continuare, qualunque altra cosa per annullare) `);
  rl.close();
  return answer.trim().toLowerCase() === "si";
}

async function main() {
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Set SEED_USER_EMAIL and SEED_USER_PASSWORD before running the seed — see .env.example."
    );
  }

  // Se l'utente esiste già, questo comando ne sovrascrive la password con
  // SEED_USER_PASSWORD — pensato per il primo bootstrap, non per un uso
  // occasionale successivo. Se nel frattempo la password è stata cambiata
  // dall'app (Profilo -> Cambia password) e questo valore in .env non è
  // stato aggiornato, rilanciare il seed la riporterebbe indietro in
  // silenzio: chiediamo conferma esplicita invece di procedere senza dire
  // nulla.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.warn(
      `\n⚠️  Esiste già un utente con questa email (creato il ${existing.createdAt.toISOString()}).\n` +
        `   Continuando, la sua password verrà SOVRASCRITTA con SEED_USER_PASSWORD — se quel valore in\n` +
        `   .env non è stato aggiornato dopo un cambio password fatto dall'app, questo la riporterebbe\n` +
        `   indietro a quella vecchia.\n`
    );
    const ok = await confirm("Vuoi davvero sovrascrivere la password di questo utente?");
    if (!ok) {
      console.log("Annullato — nessuna modifica.");
      return;
    }
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });

  console.log(`Seeded user: ${user.email} (${user.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
