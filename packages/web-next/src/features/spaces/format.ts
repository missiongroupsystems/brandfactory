/** mm → "3.6 m" / "450 mm" — plans talk in metres, furniture in millimetres. */
export function fmtLength(mm: number): string {
  if (Math.abs(mm) >= 1000) {
    const m = mm / 1000;
    return `${m.toFixed(m % 1 === 0 ? 0 : 2)} m`;
  }
  return `${Math.round(mm)} mm`;
}

export function fmtDims(w: number, d: number): string {
  return `${Math.round(w)} × ${Math.round(d)}`;
}

export function fmtArea(m2: number): string {
  return `${m2.toFixed(m2 >= 100 ? 0 : 1)} m²`;
}

export function fmtMoney(amount: number, currency = "S$"): string {
  return `${currency}${amount.toLocaleString("en-SG", { maximumFractionDigits: 0 })}`;
}
