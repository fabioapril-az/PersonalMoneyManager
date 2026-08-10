# Personal Finance Manager

## Product Requirements Document (PRD) - MVP v1.0

---

# 1. Visione

Realizzare una web application moderna per la gestione delle finanze personali.

L'obiettivo NON è costruire un software di contabilità.

L'obiettivo è aiutare l'utente a rispondere immediatamente a tre domande:

1. Quanto ho speso dal mio ultimo stipendio?
2. Dove sto spendendo i miei soldi?
3. Quanto posso ancora spendere prima del prossimo stipendio?

L'applicazione dovrà essere estremamente semplice nell'utilizzo quotidiano ma sufficientemente robusta da gestire scenari reali come:

* carte di credito
* pagamenti rateizzati
* PayPal
* spese ricorrenti
* import futuro degli estratti conto

---

# 2. Principi progettuali

L'applicazione deve essere costruita seguendo questi principi.

## Semplicità

Una nuova spesa deve poter essere inserita in meno di 15 secondi.

## Nessun doppio conteggio

Una spesa viene contabilizzata una sola volta.

Mai.

## Separazione dei concetti

L'app deve distinguere chiaramente:

* cosa ho acquistato
* come verrà pagato
* quando usciranno realmente i soldi

Questi tre concetti non devono mai essere confusi.

---

# 3. Periodo finanziario

L'app NON utilizza il mese solare.

Il periodo finanziario è:

27 del mese

↓

26 del mese successivo

Esempio:

27 agosto → 26 settembre

Tutti i report devono utilizzare questo periodo.

---

# 4. Modello concettuale

Il dominio viene suddiviso nelle seguenti entità.

## Expense

Rappresenta una decisione di spesa.

Esempio:

5 settembre

Amazon

900 €

Categoria: Fotografia

L'Expense non descrive come verrà pagata.

Descrive solo l'acquisto.

---

## Income

Entrata economica.

Esempio:

Stipendio

Bonus

Rimborso

Vendita

---

## Payment Plan

Descrive come un acquisto verrà pagato.

Può essere:

* pagamento immediato
* carta di credito
* rate
* PayPal
* bonifico
* altro

L'Expense ha sempre un Payment Plan.

---

## Payment Schedule

Rappresenta ogni singola scadenza economica.

Esempio:

Acquisto

900 €

3 rate

Genera:

10 settembre

300 €

10 ottobre

300 €

10 novembre

300 €

Le scadenze sono gli impegni finanziari.

---

## Cash Movement

Movimento reale di denaro.

Esempi:

* stipendio
* bonifico ricevuto
* prelievo
* addebito carta
* pagamento rata

Questi movimenti modificano i saldi dei conti.

---

## Account

Rappresenta uno strumento finanziario.

Tipologie:

* conto corrente
* carta di credito
* PayPal
* contanti
* altro

---

## Category

Classificazione della spesa.

Supportare:

categoria

sottocategoria

---

## Budget

Budget per categoria.

---

## Recurring Template

Definisce una spesa ricorrente.

Esempio:

Netflix

Disney

Adobe

Assicurazione

Mutuo

---

# 5. Regole fondamentali

## Regola 1

Una spesa viene conteggiata una sola volta.

## Regola 2

Un trasferimento non è una spesa.

## Regola 3

L'addebito della carta non è una nuova spesa.

## Regola 4

Le statistiche sulle categorie sono sempre basate sull'Expense.

## Regola 5

Il cash-flow è basato sui Cash Movement.

## Regola 6

Le rate generano Payment Schedule.

## Regola 7

Le ricorrenze generano automaticamente nuove Expense.

---

# 6. Gestione della carta di credito

Scenario.

5 settembre

Ristorante

100 €

Pagamento:

Visa

L'app crea:

Expense

100 €

↓

Payment Plan

Carta Visa

↓

Payment Schedule

15 ottobre

100 €

↓

Cash Movement (quando avviene realmente)

15 ottobre

Addebito Visa

-100 €

Importante:

La dashboard delle spese mostra il ristorante.

La dashboard del conto mostra l'addebito.

Mai doppio conteggio.

---

# 7. Gestione delle rate

Le rate NON sono una funzionalità PayPal.

Sono una caratteristica generale.

Qualunque spesa può essere rateizzata.

Esempio:

Acquisto

900 €

↓

Payment Plan

3 rate mensili

↓

Payment Schedule

300 €

300 €

300 €

Le statistiche devono mostrare:

Acquisti fotografia

900 €

Il budget del periodo considera solamente le rate appartenenti al periodo.

---

# 8. Gestione PayPal

PayPal è semplicemente un Account.

Può essere:

pagamento immediato

oppure

pagamento rateizzato.

Non esistono logiche speciali dedicate a PayPal.

---

# 9. Spese ricorrenti

L'utente crea un template.

Esempio.

Netflix

17,99 €

Mensile

Giorno 30

Ogni mese viene automaticamente generata una nuova Expense.

Stato iniziale:

Planned.

Quando viene confermata diventa:

Recorded.

In futuro:

Reconciled.

---

# 10. Stati

Expense

* Planned
* Recorded
* Reconciled

Payment Schedule

* Pending
* Paid
* Cancelled

Cash Movement

* Planned
* Executed
* Reconciled

---

# 11. Dashboard

La dashboard principale deve mostrare il periodo corrente.

Esempio:

27 agosto → 26 settembre

Mostrare:

Entrate

Spese

Disponibile

Impegni futuri

Saldo conti

---

## Entrate

Somma delle Income del periodo.

---

## Spese

Somma delle Expense del periodo.

Sono le decisioni di acquisto.

---

## Disponibile

Formula:

Entrate

*

Expense del periodo

Non utilizzare il saldo del conto.

---

## Impegni futuri

Mostrare:

rate

ricorrenze

addebiti carta

non ancora avvenuti.

---

## Saldo conti

Visualizzare il saldo reale di ogni account.

Conto

Carta

PayPal

Contanti

---

# 12. Report

L'MVP deve prevedere:

Spese per categoria

Spese per sottocategoria

Entrate vs spese

Trend periodi

Budget categorie

Impegni futuri

Spese per account

---

# 13. Inserimento rapido

L'operazione principale dell'app.

Campi obbligatori:

Importo

Categoria

Metodo pagamento

Descrizione

Campi opzionali:

Data

Note

Rate

Ricorrenza

Tipo spesa

Target:

meno di 15 secondi.

---

# 14. Budget

Budget configurabile per categoria.

Esempio.

Fotografia

300 €

Ristoranti

250 €

Alimentari

500 €

La dashboard mostra:

budget

speso

residuo

percentuale utilizzata.

---

# 15. Architettura tecnica

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui

## Backend

Next.js (App Router + Server Actions)

## Database

PostgreSQL

## ORM

Prisma

## Charts

Recharts

## Deploy

Vercel

Database:

Supabase PostgreSQL

---

# 16. Modello dati

Principali entità.

User

Account

Category

Expense

Income

PaymentPlan

PaymentSchedule

CashMovement

RecurringTemplate

Budget

Merchant

FinancialPeriod

---

# 17. Roadmap

## Fase 1

Autenticazione

Database

Account

Categorie

Dashboard

Expense

Income

Periodo 27→26

---

## Fase 2

Carte di credito

Rate

Payment Schedule

Cash Movement

---

## Fase 3

Ricorrenze

Budget

Report

Grafici

---

## Fase 4

Import CSV

Riconciliazione

Regole automatiche

Suggerimento categoria

Merchant intelligence

---

## Fase 5

Open Banking

Notifiche

Obiettivi di risparmio

Versione mobile

---

# 18. Criteri di accettazione

Il sistema deve essere in grado di gestire correttamente:

* una spesa in contanti
* una spesa con carta
* una spesa PayPal
* una spesa rateizzata
* una spesa ricorrente
* un addebito carta
* un trasferimento tra account

senza mai produrre doppie contabilizzazioni.

---

# 19. Principio finale

Ogni schermata deve aiutare l'utente a prendere decisioni.

L'app non deve limitarsi a registrare movimenti.

Deve spiegare chiaramente:

* dove stanno andando i soldi;
* quali soldi sono già impegnati;
* quanto è ancora possibile spendere prima del prossimo stipendio;
* quali impegni economici arriveranno nei prossimi mesi.

---

# Note di implementazione (deviazioni consapevoli dal punto 15)

Rispetto alla sezione 15 originale, alcune scelte sono state riviste durante
lo scaffolding iniziale (vedi README.md per il dettaglio):

* **Backend**: esposto come router **tRPC** (non solo Server Actions), per
  poter essere chiamato da un futuro client mobile senza riscrivere la logica.
* **Deploy**: **Azure App Service (piano Free F1)** invece di Vercel, per
  restare a costo €0/mese.
* **Database**: **Azure SQL Database (offerta free permanente)** invece di
  PostgreSQL/Supabase — stesso costo (€0), ma consolidato su un solo portale
  Azure. Conseguenze tecniche non ovvie di questo cambio (dettagliate in
  README.md e nei commenti di `prisma/schema.prisma`):
  - SQL Server non supporta enum nativi → i campi enum del modello dati
    (AccountType, ExpenseStatus, ecc.) sono colonne `String` validate a
    livello applicativo (`lib/domain/enums.ts`), non a livello DB.
  - Ogni relazione ha `onDelete`/`onUpdate` espliciti per evitare l'errore
    SQL Server "multiple cascade paths" (che Postgres tollera).
  - Il tier serverless free si auto-pausa/risveglia: le query passano da un
    wrapper con retry automatico (`lib/db/azureSqlRetry.ts`) per gli errori
    di connessione transitori che Microsoft stessa documenta durante il
    risveglio.
* **Autenticazione**: **Auth.js v5** (Credentials, email + password, sessioni
  JWT) invece di un provider esterno — nessun servizio a pagamento. Nessuna
  pagina di signup pubblica: l'app è per uso personale, l'utente si crea con
  `npx prisma db seed` (`prisma/seed.ts`), non da un form esposto pubblicamente.
* **Disponibile** (sezione 11): ridefinito come **somma dei saldi dei conti
  attivi**, non più "Entrate − Spese del periodo". Motivo: con saldi iniziali
  impostati sui conti (anziché registrare ogni entrata storica), la formula
  originale va sotto zero alla prima spesa se le entrate del periodo non sono
  ancora state registrate — un indicatore di liquidità reale è più utile
  nell'uso quotidiano. "Saldo − Spese" sarebbe stato un doppio conteggio: le
  spese già pagate hanno già abbassato il saldo del conto tramite il loro
  CashMovement (Rule 5), quindi somma-e-basta è la versione corretta.
* **Budget** (sezione 14): un **unico tetto di spesa mensile complessivo**
  (`User.monthlyBudget`), non per categoria. Il modello `Budget` per-categoria
  resta nello schema per un eventuale uso futuro più granulare, ma non è
  esposto dall'app oggi.
