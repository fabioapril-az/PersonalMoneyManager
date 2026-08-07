// Creates (or updates the password of) the app's user(s) directly — there is
// no public signup page on purpose (personal-use app, see README). Run with:
//   SEED_USER_EMAIL=you@example.com SEED_USER_PASSWORD=... npx prisma db seed
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { parseSqlServerUrl } from "../lib/db/connectionString";
import { hashPassword } from "../lib/auth/password";

const adapter = new PrismaMssql(parseSqlServerUrl(process.env.DATABASE_URL ?? ""));
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Set SEED_USER_EMAIL and SEED_USER_PASSWORD before running the seed — see .env.example."
    );
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
