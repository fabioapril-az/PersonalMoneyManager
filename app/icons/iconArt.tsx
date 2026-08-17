// Non un route handler (nessun nome riservato come "route"/"page") — un
// helper condiviso dalle icone generate con next/og (app/icon.tsx,
// app/apple-icon.tsx, app/icons/*/route.tsx), per non ripetere lo stesso
// disegno in 5 file diversi.

// Stesso colore di --primary (teal-600, vedi app/globals.css) — l'accento
// primario di "Fresh Slate, Brillante" in tutta l'app.
const BACKGROUND = "#009488";
const FOREGROUND = "#eafbf9"; // teal-50: contrasto morbido, non bianco puro

export function IconArt({ size, maskable = false }: { size: number; maskable?: boolean }) {
  // Maskable (per il manifest, purpose "maskable"): il sistema operativo
  // applica la sua maschera (cerchio, squircle...) — lo sfondo deve arrivare
  // a bordo (nessun arrotondamento nostro) e il contenuto deve restare in
  // una "safe zone" più piccola per non finire tagliato. Non maskable:
  // arrotondamento già incluso, il glifo può usare più spazio.
  const glyphSize = maskable ? size * 0.4 : size * 0.55;
  const borderRadius = maskable ? 0 : size * 0.22;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: BACKGROUND,
        borderRadius,
      }}
    >
      <div style={{ fontSize: glyphSize, fontWeight: 700, color: FOREGROUND, fontFamily: "sans-serif" }}>€</div>
    </div>
  );
}
