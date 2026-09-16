import { describe, expect, it } from "vitest";
import { CSV_BOM, escapeCsvCell, formatCsvAmount, formatCsvBoolean, formatCsvDate, toCsv } from "./csv";

describe("escapeCsvCell", () => {
  it("lascia intatta una cella senza caratteri speciali", () => {
    expect(escapeCsvCell("Spesa al supermercato")).toBe("Spesa al supermercato");
  });

  it("mette tra virgolette una cella che contiene il separatore", () => {
    // Il caso che rompe il file per davvero: una descrizione con un punto e
    // virgola dentro sfalserebbe tutte le colonne da lì in poi.
    expect(escapeCsvCell("Cena; poi cinema")).toBe('"Cena; poi cinema"');
  });

  it("raddoppia le virgolette interne", () => {
    expect(escapeCsvCell('Hotel "Bellavista"')).toBe('"Hotel ""Bellavista"""');
  });

  it("mette tra virgolette una cella con un a capo (es. una nota su più righe)", () => {
    expect(escapeCsvCell("prima riga\nseconda riga")).toBe('"prima riga\nseconda riga"');
  });
});

describe("formatCsvAmount", () => {
  it("usa la virgola decimale e sempre due decimali", () => {
    expect(formatCsvAmount(1234.5)).toBe("1234,50");
    expect(formatCsvAmount(2.2)).toBe("2,20");
    expect(formatCsvAmount(0)).toBe("0,00");
  });

  it("non usa separatore delle migliaia", () => {
    // Un "1.234,56" verrebbe letto da Excel come testo, non come numero:
    // il punto è già il separatore decimale in altre impostazioni locali.
    expect(formatCsvAmount(1234567.89)).toBe("1234567,89");
  });

  it("tiene il segno di un importo negativo (movimenti in uscita)", () => {
    expect(formatCsvAmount(-49.9)).toBe("-49,90");
  });
});

describe("formatCsvDate", () => {
  it("formatta gg/mm/aaaa con lo zero davanti", () => {
    expect(formatCsvDate(new Date("2026-09-05T00:00:00.000Z"))).toBe("05/09/2026");
  });

  it("legge la data in UTC, non nel fuso locale", () => {
    // Il bug che questo previene: una data salvata a mezzanotte UTC, letta in
    // un fuso avanti (Italia), scivolerebbe al giorno successivo — e un export
    // con tutte le date spostate di un giorno è peggio di nessun export.
    expect(formatCsvDate(new Date("2026-09-26T23:59:59.999Z"))).toBe("26/09/2026");
    expect(formatCsvDate(new Date("2026-08-27T00:00:00.000Z"))).toBe("27/08/2026");
  });
});

describe("formatCsvBoolean", () => {
  it("scrive Si/No, non true/false", () => {
    expect(formatCsvBoolean(true)).toBe("Si");
    expect(formatCsvBoolean(false)).toBe("No");
  });
});

describe("toCsv", () => {
  it("unisce intestazione e righe con ; e CRLF", () => {
    const csv = toCsv(
      ["Data", "Descrizione", "Importo"],
      [
        ["15/09/2026", "Spesa", "2,20"],
        ["12/09/2026", "Taxi", "21,70"],
      ]
    );
    expect(csv).toBe("Data;Descrizione;Importo\r\n15/09/2026;Spesa;2,20\r\n12/09/2026;Taxi;21,70");
  });

  it("applica il quoting anche alle celle dell'intestazione", () => {
    expect(toCsv(["Rata; quota"], [])).toBe('"Rata; quota"');
  });

  it("produce solo l'intestazione quando non ci sono righe", () => {
    // Un periodo senza spese deve dare un file valido con le colonne, non un
    // file vuoto che sembra un download fallito.
    expect(toCsv(["Data", "Importo"], [])).toBe("Data;Importo");
  });

  it("non include il BOM: va aggiunto una volta sola in testa al file", () => {
    expect(toCsv(["Data"], [])).not.toContain(CSV_BOM);
    expect(CSV_BOM).toHaveLength(1);
  });
});
