import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentFinancialPeriod } from "@/lib/domain/period";
import { EXPORT_DATASETS, buildExpenseExport, type ExportDataset } from "@/server/buildExpenseExport";

/**
 * I download della pagina "Esporta" (app/esporta). Un Route Handler e non una
 * procedura tRPC di proposito: tRPC parla JSON: per far scaricare un file col
 * suo nome serve una risposta con Content-Disposition, e il browser la ottiene
 * seguendo un semplice link (i cookie di sessione viaggiano da soli).
 *
 * ?p=<data ISO> indica QUALE periodo 27->26 esportare (una data qualunque al
 * suo interno, stessa convenzione del resto dell'app: assente = periodo
 * corrente). Il periodo si ricalcola qui con la funzione pura di
 * lib/domain/period.ts invece di far passare start/end dal client, che
 * potrebbe chiedere un intervallo arbitrario.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/export/[dataset]">) {
  // proxy.ts protegge già questa rotta a monte (matcher), ma la sessione va
  // riletta qui comunque: serve userId per filtrare i dati, e un controllo di
  // autorizzazione non deve dipendere solo dal middleware (stesso principio
  // di protectedProcedure in server/trpc.ts).
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("Non autorizzato.", { status: 401 });
  }

  const { dataset } = await ctx.params;
  if (!EXPORT_DATASETS.includes(dataset as ExportDataset)) {
    return new Response("Export non riconosciuto.", { status: 404 });
  }

  const referenceParam = request.nextUrl.searchParams.get("p");
  const reference = referenceParam ? new Date(referenceParam) : undefined;
  if (reference && Number.isNaN(reference.getTime())) {
    return new Response("Data non valida.", { status: 400 });
  }

  const period = getCurrentFinancialPeriod(reference);
  const { filename, content } = await buildExpenseExport(prisma, userId, dataset as ExportDataset, period);

  return new Response(content, {
    headers: {
      // charset=utf-8 + il BOM già in testa al contenuto: servono entrambi
      // perché Excel apra gli accenti correttamente (vedi lib/domain/csv.ts).
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Dati personali e sempre freschi: nessuna copia in cache, né nel
      // browser né in eventuali proxy intermedi.
      "Cache-Control": "no-store",
    },
  });
}
