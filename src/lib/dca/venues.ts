const US = new Set([
  "NMS",
  "NGM",
  "NCM",
  "NYQ",
  "ASE",
  "PCX",
  "BTS",
  "NasdaqGS",
  "NasdaqGM",
  "NasdaqCM",
  "NYSE",
  "NYSEArca",
  "NYSEAmerican",
  "AMEX",
  "BATS",
]);

const CA = new Set([
  "TOR",
  "VAN",
  "NEO",
  "CNQ",
  "Toronto",
  "TSXV",
  "TSX",
  "TSX Venture",
  "Cboe CA",
  "CSE",
  "NEO Exchange",
]);

const EU = new Set([
  "PAR",
  "AMS",
  "GER",
  "FRA",
  "MIL",
  "BIT",
  "MCE",
  "BRU",
  "STO",
  "HEL",
  "CPH",
  "VIE",
  "LIS",
  "WSE",
  "BUD",
  "DUB",
  "PRA",
  "ATH",
  "TAL",
  "EPA",
  "ETR",
  "MAD",
  "BME",
  "HAM",
  "MUN",
  "STU",
  "BER",
  "DUS",
  "Paris",
  "Amsterdam",
  "XETRA",
  "Frankfurt",
  "Milan",
  "Brussels",
  "Helsinki",
  "Copenhagen",
  "Vienna",
  "Lisbon",
  "Warsaw",
  "Budapest",
  "Dublin",
  "Madrid",
  "Stockholm",
  "Athens",
  "Prague",
  "Tallinn",
]);

function allowed(code: string): boolean {
  return US.has(code) || CA.has(code) || EU.has(code);
}

/** Null when the listing is US, EU, or CA. Otherwise an error that names the exchange. */
export function listingError(
  ticker: string,
  exchangeName?: string | null,
  fullExchangeName?: string | null,
): string | null {
  const ex = (exchangeName ?? "").trim();
  const full = (fullExchangeName ?? "").trim();
  if (allowed(ex) || allowed(full)) return null;
  const label = full || ex || "an unknown exchange";
  if (/bse|bombay/i.test(ex) || /bse|bombay/i.test(full)) {
    return `${ticker} lists on ${label}. BSE and other non US/EU/CA venues stay out unless you name an exception.`;
  }
  return `${ticker} lists on ${label}. US, EU, and CA listings only, unless you name an exception.`;
}
