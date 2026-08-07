# Personal Money Manager

Web app (+ futura PWA/mobile) per il monitoraggio delle finanze personali. Il
PRD completo (modello concettuale, regole, roadmap) guida ogni decisione qui
dentro — vedi in particolare le Regole 1-7 sul no-doppio-conteggio.

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Tailwind CSS 4** + **shadcn/ui**
- **tRPC** per il layer API, type-safe end-to-end
- **Prisma 7** (nuovo generator `prisma-client`, senza engine binario) + **Azure SQL Database**
- **Vitest** per la logica di dominio

## Perché questa architettura (non ripeterla al prossimo passo)

La business logic (periodo 27→26, generazione rate, regole anti-doppio-conteggio)
vive in `lib/domain/`, non nei componenti React né nelle Server Actions. Il
layer API è **tRPC**, chiamabile in due modi:

- **Server Components** → `lib/trpc/server-caller.ts` (chiamata diretta, zero rete)
- **Client Components** → `lib/trpc/client.ts` + `Provider.tsx` (React Query su HTTP)

Questo significa che quando (se) servirà un'app mobile — wrapper Capacitor o
React Native — il backend non si riscrive: il nuovo client chiama lo stesso
router tRPC via HTTP. Vedi `server/routers/_app.ts`.

Il generator Prisma `prisma-client` (v7) con `@prisma/adapter-mssql` non
produce nessun binario nativo/WASM (verificato: `app/generated/prisma`
contiene solo `.ts`) — utile per qualsiasi target di deploy
serverless/standalone, Azure incluso, senza sorprese di file mancanti nel
bundle.

## Perché Azure SQL Database (non Postgres)

Il PRD originale (sezione 15) indicava PostgreSQL/Supabase. Deviazione
consapevole: **Azure ha un'offerta free permanente per Azure SQL Database**
(non un trial a scadenza) — fino a 10 database gratuiti per sottoscrizione,
ognuno con 100.000 vCore-secondi + 32GB storage + 32GB backup al mese, per
sempre ([fonte](https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer-faq?view=azuresql)).
Nessun equivalente esiste per Postgres su Azure. Il costo resta €0 come con
Neon/Supabase, ma tutto in un solo portale/bolletta.

Due conseguenze tecniche di questa scelta, non ovvie:

1. **SQL Server non supporta enum nativi** (Postgres sì, MySQL li emula).
   Ogni campo che sarebbe stato un Prisma `enum` è una colonna `String` in
   `prisma/schema.prisma`; l'insieme chiuso di valori è imposto in
   `lib/domain/enums.ts` (tipo TypeScript + schema Zod), non a livello DB.
   Ogni input tRPC che tocca questi campi deve validare con quello schema.
2. **Auto-pause/auto-resume**: il tier serverless free si mette in pausa
   dopo inattività e si risveglia alla richiesta successiva; Microsoft stessa
   documenta che questo produce "errori di connessione transitori
   prevedibili" sulla richiesta che innesca il risveglio. `lib/prisma.ts`
   avvolge ogni query con un retry automatico (`lib/db/azureSqlRetry.ts`,
   3 tentativi) proprio per questo scenario.

`prisma/schema.prisma` ha inoltre ogni relazione con `onDelete`/`onUpdate`
**espliciti**: SQL Server rifiuta una migrazione se una tabella è
raggiungibile tramite più di un percorso di cascade ("multiple cascade
paths"), cosa che Postgres tollera. La policy adottata (commentata in cima
al file) fa doppio uso: risolve il vincolo SQL Server e allo stesso tempo
riflette una regola di business reale — non si può cancellare una
Categoria/Account che ha ancora Expense/Movimenti collegati, si archivia
invece (vedi `Account.archived`).

## Struttura

```
app/                    Next.js App Router (pagine + route handler tRPC)
server/                 Router tRPC, context, procedure (protectedProcedure ecc.)
lib/domain/             Business logic pura (periodo finanziario, enum, ecc.) + test
lib/trpc/               Client tRPC (browser) e caller diretto (RSC)
lib/db/                 Parsing connection string + retry auto-resume (Azure SQL) + test
lib/prisma.ts           Singleton PrismaClient (driver adapter mssql)
prisma/schema.prisma    Modello dati (commentato con riferimenti alle sezioni del PRD)
```

`prisma/schema.prisma` **non** include un modello `FinancialPeriod`: è
volutamente una funzione pura (`lib/domain/period.ts`), non una tabella — per
non introdurre una seconda fonte di verità su qualcosa di completamente
derivabile da una data.

## Sviluppo locale

```bash
npm install
cp .env.example .env      # imposta DATABASE_URL (Azure SQL Database free tier)
npx prisma generate
npx prisma migrate dev    # crea le tabelle
npm run dev
npm test                  # vitest sulla logica di dominio
```

## Database — Azure SQL Database, offerta free (costo: €0)

Setup una tantum:

1. Azure Portal → crea una **SQL Database** (non "Web App + Database", vedi
   sezione Deploy). Nella scheda "Compute + storage" seleziona **Serverless**
   general purpose e attiva l'opzione **Free offer**.
2. Copia server name, nome database, utente e password nel formato descritto
   in `.env.example`.
3. `npx prisma migrate dev` crea le tabelle.

## Deploy — Azure App Service, piano Free (F1)

Obiettivo: costo **€0/mese**. Compromessi noti e accettati: cold start
occasionale sia della Web App (niente "Always On" sul piano F1) sia del
database (auto-pause/resume, mitigato dal retry automatico); nessun dominio
personalizzato (resta `<nome>.azurewebsites.net`).

Setup una tantum:

1. Crea una **Web App** su Azure Portal (solo Web App, non il flusso
   combinato "Web App + Database" — vedi nota sotto) — Runtime stack:
   **Node 22 LTS**, sistema operativo Linux, piano **F1 Free**.
2. Configurazione → **Startup Command**: `node server.js`
   (necessario perché il deploy porta già il build `standalone` pronto,
   niente build remota Oryx).
3. Configurazione → **Application settings**: aggiungi `DATABASE_URL` con la
   connection string reale della SQL Database.
4. **Non usare** il tab "Deployment Center" della Web App per collegare
   GitHub — crea in automatico un secondo workflow generico
   (`main_<nomeapp>.yml`) che fa un deploy incompatibile col nostro (carica
   il repo grezzo invece del build `standalone`) e va in gara con
   `.github/workflows/azure-deploy.yml` a ogni push. Se lo trovi già creato,
   cancellalo dal repo — vedi il commento in cima al workflow per il
   dettaglio. Il secret publish-profile che Azure crea in automatico in quel
   flusso (`AZUREAPPSERVICE_PUBLISHPROFILE_<hash>`) resta comunque utile:
   è più affidabile di uno copiato a mano, il nostro workflow lo referenzia
   già direttamente.
5. Se quel secret non esiste ancora (Deployment Center non è mai stato
   aperto): scarica tu il **Publish Profile** (Overview → "Download publish
   profile") e salvalo come secret GitHub con lo stesso nome referenziato in
   `azure-deploy.yml`.
6. Aggiungi il secret GitHub `AZURE_WEBAPP_NAME` (nome della Web App). Non
   serve un secret `DATABASE_URL`: `lib/prisma.ts` costruisce l'adapter in
   modo lazy, solo al primo utilizzo reale, mai al build — la connection
   string reale vive solo nell'Application Setting del punto 3.
7. Push su `main` → la action `.github/workflows/azure-deploy.yml` builda e
   pubblica automaticamente.

Nota sul flusso "Web App + Database" di Azure Portal: crea un Azure Database
for PostgreSQL/MySQL Flexible Server **a pagamento** e richiede almeno il
piano App Service Basic (l'integrazione VNet che usa non è supportata su F1
Free) — rompe l'obiettivo costo-zero su entrambi i fronti. Da evitare.

Nota sulle pagine dati: dashboard, expense, ecc. vanno tenute **dinamiche**
(rendering per-request), non statiche — sono dati per-utente e in tempo
reale per definizione (PRD sezione 11). Questo evita anche qualunque
dipendenza da un database raggiungibile in fase di build.

### Percorso di crescita, se un domani serve di più

- Cold start fastidioso o serve un dominio custom → upgrade del piano App
  Service (F1 → B1, ~13€/mese). Nessuna riscrittura di codice.
- Budget mensile free del DB non basta più (uso molto più intenso del
  previsto) → passa a "Continue using with additional charges" sulla stessa
  risorsa, nessuna migrazione.
- Serve pubblicare su App Store/Play Store → wrapper Capacitor sulla stessa
  build web.
- Serve UX nativa (notifiche push, widget) → app React Native/Expo che
  chiama lo stesso router tRPC via HTTP.

## Roadmap

Vedi il PRD. Fase 1 (in corso): autenticazione, account, categorie,
dashboard, expense/income, periodo 27→26.
