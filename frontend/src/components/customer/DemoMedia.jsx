import { useEffect, useState } from "react";
import { resolveMediaUrl } from "../../services/apiClient.js";

// E-Shop development/testing-only catalog visuals. NOT verified brand photography.
// Database-uploaded product photos always have first priority.
const SEED_SKU_BY_NAME = Object.freeze({
  "h&m oxford shirt": "ESH-P-0001",
  "zudio casual shirt": "ESH-P-0002",
  "lee formal shirt": "ESH-P-0003",
  "sparky checked shirt": "ESH-P-0004",
  "h&m linen shirt": "ESH-P-0005",
  "zudio oxford shirt 2": "ESH-P-0006",
  "lee casual shirt 2": "ESH-P-0007",
  "sparky formal shirt 2": "ESH-P-0008",
  "h&m checked shirt 2": "ESH-P-0009",
  "zudio linen shirt 2": "ESH-P-0010",
  "lee oxford shirt 3": "ESH-P-0011",
  "sparky casual shirt 3": "ESH-P-0012",
  "h&m formal shirt 3": "ESH-P-0013",
  "h&m crew neck t-shirt": "ESH-P-0014",
  "zudio polo t-shirt": "ESH-P-0015",
  "lee graphic t-shirt": "ESH-P-0016",
  "sparky oversized t-shirt": "ESH-P-0017",
  "h&m henley t-shirt": "ESH-P-0018",
  "zudio crew neck t-shirt 2": "ESH-P-0019",
  "lee polo t-shirt 2": "ESH-P-0020",
  "sparky graphic t-shirt 2": "ESH-P-0021",
  "h&m oversized t-shirt 2": "ESH-P-0022",
  "zudio henley t-shirt 2": "ESH-P-0023",
  "lee crew neck t-shirt 3": "ESH-P-0024",
  "sparky polo t-shirt 3": "ESH-P-0025",
  "h&m graphic t-shirt 3": "ESH-P-0026",
  "zudio oversized t-shirt 3": "ESH-P-0027",
  "lee henley t-shirt 3": "ESH-P-0028",
  "sparky crew neck t-shirt 4": "ESH-P-0029",
  "h&m polo t-shirt 4": "ESH-P-0030",
  "zudio graphic t-shirt 4": "ESH-P-0031",
  "h&m slim jeans": "ESH-P-0032",
  "zudio straight jeans": "ESH-P-0033",
  "lee relaxed jeans": "ESH-P-0034",
  "sparky tapered jeans": "ESH-P-0035",
  "h&m slim jeans 2": "ESH-P-0036",
  "zudio straight jeans 2": "ESH-P-0037",
  "lee relaxed jeans 2": "ESH-P-0038",
  "sparky tapered jeans 2": "ESH-P-0039",
  "h&m slim jeans 3": "ESH-P-0040",
  "zudio straight jeans 3": "ESH-P-0041",
  "lee relaxed jeans 3": "ESH-P-0042",
  "sparky tapered jeans 3": "ESH-P-0043",
  "h&m slim jeans 4": "ESH-P-0044",
  "zudio straight jeans 4": "ESH-P-0045",
  "h&m chino trouser": "ESH-P-0046",
  "zudio formal trouser": "ESH-P-0047",
  "lee cargo trouser": "ESH-P-0048",
  "sparky jogger trouser": "ESH-P-0049",
  "h&m chino trouser 2": "ESH-P-0050",
  "zudio formal trouser 2": "ESH-P-0051",
  "lee cargo trouser 2": "ESH-P-0052",
  "sparky jogger trouser 2": "ESH-P-0053",
  "h&m chino trouser 3": "ESH-P-0054",
  "zudio formal trouser 3": "ESH-P-0055",
  "lee cargo trouser 3": "ESH-P-0056",
  "sparky jogger trouser 3": "ESH-P-0057",
  "h&m ankle socks": "ESH-P-0058",
  "zudio crew socks": "ESH-P-0059",
  "lee sports socks": "ESH-P-0060",
  "sparky cotton socks": "ESH-P-0061",
  "h&m ankle socks 2": "ESH-P-0062",
  "zudio crew socks 2": "ESH-P-0063",
  "lee sports socks 2": "ESH-P-0064",
  "sparky cotton socks 2": "ESH-P-0065",
  "h&m ribbed top": "ESH-P-0066",
  "zudio peplum top": "ESH-P-0067",
  "lee printed top": "ESH-P-0068",
  "sparky sleeveless top": "ESH-P-0069",
  "h&m ribbed top 2": "ESH-P-0070",
  "zudio peplum top 2": "ESH-P-0071",
  "lee printed top 2": "ESH-P-0072",
  "sparky sleeveless top 2": "ESH-P-0073",
  "h&m ribbed top 3": "ESH-P-0074",
  "zudio peplum top 3": "ESH-P-0075",
  "lee printed top 3": "ESH-P-0076",
  "sparky sleeveless top 3": "ESH-P-0077",
  "h&m a-line kurti": "ESH-P-0078",
  "zudio straight kurti": "ESH-P-0079",
  "lee embroidered kurti": "ESH-P-0080",
  "sparky cotton kurti": "ESH-P-0081",
  "h&m a-line kurti 2": "ESH-P-0082",
  "zudio straight kurti 2": "ESH-P-0083",
  "lee embroidered kurti 2": "ESH-P-0084",
  "sparky cotton kurti 2": "ESH-P-0085",
  "h&m a-line kurti 3": "ESH-P-0086",
  "zudio straight kurti 3": "ESH-P-0087",
  "h&m wide leg palazzo": "ESH-P-0088",
  "zudio cotton palazzo": "ESH-P-0089",
  "lee pleated palazzo": "ESH-P-0090",
  "sparky printed palazzo": "ESH-P-0091",
  "h&m wide leg palazzo 2": "ESH-P-0092",
  "zudio cotton palazzo 2": "ESH-P-0093",
  "lee pleated palazzo 2": "ESH-P-0094",
  "sparky printed palazzo 2": "ESH-P-0095",
  "h&m festive suit": "ESH-P-0096",
  "zudio party suit": "ESH-P-0097",
  "lee ethnic suit": "ESH-P-0098",
  "sparky casual suit": "ESH-P-0099",
  "h&m festive suit 2": "ESH-P-0100",
  "daily basket basmati rice": "ESH-P-0101",
  "fresh choice brown rice": "ESH-P-0102",
  "daily basket sona masoori rice": "ESH-P-0103",
  "fresh choice basmati rice 2": "ESH-P-0104",
  "daily basket brown rice 2": "ESH-P-0105",
  "fresh choice sona masoori rice 2": "ESH-P-0106",
  "daily basket basmati rice 3": "ESH-P-0107",
  "daily basket wheat flour": "ESH-P-0108",
  "fresh choice multigrain flour": "ESH-P-0109",
  "daily basket besan flour": "ESH-P-0110",
  "fresh choice wheat flour 2": "ESH-P-0111",
  "daily basket multigrain flour 2": "ESH-P-0112",
  "daily basket toor pulses": "ESH-P-0113",
  "fresh choice moong pulses": "ESH-P-0114",
  "daily basket chana pulses": "ESH-P-0115",
  "fresh choice masoor pulses": "ESH-P-0116",
  "daily basket toor pulses 2": "ESH-P-0117",
  "daily basket butter biscuits": "ESH-P-0118",
  "fresh choice digestive biscuits": "ESH-P-0119",
  "daily basket chocolate biscuits": "ESH-P-0120",
  "fresh choice oat biscuits": "ESH-P-0121",
  "daily basket butter biscuits 2": "ESH-P-0122",
  "daily basket assam tea": "ESH-P-0123",
  "fresh choice green tea": "ESH-P-0124",
  "daily basket masala tea": "ESH-P-0125",
  "fresh choice ginger tea": "ESH-P-0126",
  "daily basket powder detergent": "ESH-P-0127",
  "fresh choice liquid detergent": "ESH-P-0128",
  "daily basket fabric care detergent": "ESH-P-0129",
  "fresh choice powder detergent 2": "ESH-P-0130",
  "urban step canvas casual shoes": "ESH-P-0131",
  "daily walk slip-on casual shoes": "ESH-P-0132",
  "urban step walking casual shoes": "ESH-P-0133",
  "daily walk canvas casual shoes 2": "ESH-P-0134",
  "urban step slip-on casual shoes 2": "ESH-P-0135",
  "daily walk walking casual shoes 2": "ESH-P-0136",
  "urban step comfort sandals": "ESH-P-0137",
  "daily walk outdoor sandals": "ESH-P-0138",
  "urban step everyday sandals": "ESH-P-0139",
  "daily walk comfort sandals 2": "ESH-P-0140",
  "urban step ballet flats": "ESH-P-0141",
  "daily walk strappy flats": "ESH-P-0142",
  "urban step everyday flats": "ESH-P-0143",
  "daily walk ballet flats 2": "ESH-P-0144",
  "urban step strappy flats 2": "ESH-P-0145",
  "urban step court sneakers": "ESH-P-0146",
  "daily walk walking sneakers": "ESH-P-0147",
  "urban step chunky sneakers": "ESH-P-0148",
  "daily walk court sneakers 2": "ESH-P-0149",
  "urban step walking sneakers 2": "ESH-P-0150",
  "technest wired earphones": "ESH-P-0151",
  "voltix in-ear earphones": "ESH-P-0152",
  "technest type-c earphones": "ESH-P-0153",
  "voltix bass earphones": "ESH-P-0154",
  "technest wired earphones 2": "ESH-P-0155",
  "technest fast chargers": "ESH-P-0156",
  "voltix dual port chargers": "ESH-P-0157",
  "technest compact chargers": "ESH-P-0158",
  "voltix fast chargers 2": "ESH-P-0159",
  "technest 10000mah power banks": "ESH-P-0160",
  "voltix 20000mah power banks": "ESH-P-0161",
  "technest slim power banks": "ESH-P-0162",
  "voltix 10000mah power banks 2": "ESH-P-0163",
  "technest warm led bulbs": "ESH-P-0164",
  "voltix cool led bulbs": "ESH-P-0165",
  "technest smart led bulbs": "ESH-P-0166",
  "voltix warm led bulbs 2": "ESH-P-0167",
  "technest braided usb cables": "ESH-P-0168",
  "voltix fast usb cables": "ESH-P-0169",
  "technest standard usb cables": "ESH-P-0170",
  "careplus cotton bandages": "ESH-P-0171",
  "wellnest adhesive bandages": "ESH-P-0172",
  "careplus elastic bandages": "ESH-P-0173",
  "wellnest cotton bandages 2": "ESH-P-0174",
  "careplus gel sanitizer": "ESH-P-0175",
  "wellnest spray sanitizer": "ESH-P-0176",
  "careplus aloe sanitizer": "ESH-P-0177",
  "wellnest gel sanitizer 2": "ESH-P-0178",
  "careplus digital thermometer": "ESH-P-0179",
  "wellnest flexible thermometer": "ESH-P-0180",
  "careplus digital thermometer 2": "ESH-P-0181",
  "careplus 3-ply face mask": "ESH-P-0182",
  "wellnest cotton face mask": "ESH-P-0183",
  "careplus disposable face mask": "ESH-P-0184",
  "wellnest 3-ply face mask 2": "ESH-P-0185",
  "papertrail ruled notebook": "ESH-P-0186",
  "writewell unruled notebook": "ESH-P-0187",
  "papertrail spiral notebook": "ESH-P-0188",
  "writewell hardbound notebook": "ESH-P-0189",
  "papertrail ruled notebook 2": "ESH-P-0190",
  "papertrail ballpoint pens": "ESH-P-0191",
  "writewell gel pens": "ESH-P-0192",
  "papertrail fine tip pens": "ESH-P-0193",
  "writewell ballpoint pens 2": "ESH-P-0194",
  "papertrail document folders": "ESH-P-0195",
  "writewell button folders": "ESH-P-0196",
  "papertrail expandable folders": "ESH-P-0197",
  "papertrail drawing sketchbook": "ESH-P-0198",
  "writewell mixed media sketchbook": "ESH-P-0199",
  "papertrail hardbound sketchbook": "ESH-P-0200",
});
const VALID_SEED_SKUS = new Set(Object.values(SEED_SKU_BY_NAME));

export function demoProductPhoto(product) {
  if (!product) return null;
  const normalize = (value) => String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const key = normalize(product.name);
  const mappedSku = SEED_SKU_BY_NAME[key];
  const rawSku = String(product.masterSku || product.sku || "").trim().toUpperCase();
  // Only use a recognized seed SKU. When an edited product name conflicts,
  // prefer the explicit SKU; never infer a photo from a brand or category.
  // Never give an unrelated real/new SKU a demo photo just because its name matches.
  const sku = rawSku ? (VALID_SEED_SKUS.has(rawSku) ? rawSku : null) : mappedSku;
  return sku ? `/demo-sku-photos/${sku}.webp` : null;
}

export function demoBrandPhoto(_brand) {
  return null; // Never substitute another brand's or product's logo.
}

export function demoCategoryPhoto(_category) {
  return null;
}

export function DemoPhoto({ src, fallback, alt = "", className = "", loading = "lazy", style, ...props }) {
  const uploadedUrl = src ? resolveMediaUrl(src) : "";
  const alternatives = Array.isArray(fallback) ? fallback.filter(Boolean) : fallback ? [fallback] : [];
  const sources = [uploadedUrl, ...alternatives].filter(Boolean);
  const chainKey = JSON.stringify(sources);
  const [retry, setRetry] = useState({ key: chainKey, index: 0 });
  const index = retry.key === chainKey ? retry.index : 0;
  const currentSrc = sources[index];

  useEffect(() => {
    setRetry({ key: chainKey, index: 0 });
  }, [chainKey]);

  if (!currentSrc) {
    return (
      <div className={`esh-photo-unavailable ${className}`.trim()}
        role="img" aria-label={`${alt || "Product"} photo not provided`}
        style={{ ...style, display: "grid", placeItems: "center", background: "#f4f5f7", color: "#677284", fontSize: "0.875rem", textAlign: "center", padding: "12px" }}>
        Photo unavailable
      </div>
    );
  }

  return (
    <img {...props} key={`${chainKey}:${index}`} src={currentSrc} alt={alt}
      className={className} loading={loading} style={style}
      title={currentSrc.startsWith("/demo-sku-photos/") ? "Illustrative demo asset — not official product photography" : undefined}
      onError={() => setRetry({ key: chainKey, index: index + 1 })} />
  );
}
