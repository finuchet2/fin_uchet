const currencyFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

export const currencyTruncationThreshold = 100_000_000;
const truncatedIntegerDigitCount = 8;

export function formatThresholdCurrency(value: number, signed = false) {
  const absoluteValue = Math.abs(value);
  const amount = currencyFormatter.format(absoluteValue).replace(/[\u00a0\u202f]/g, " ");
  const sign = signed ? (value < 0 ? "− " : "+ ") : "";
  const exact = `${sign}${amount} ₽`;
  const truncated = absoluteValue >= currencyTruncationThreshold;

  if (!truncated) return { display: exact, exact, truncated };

  const integer = integerFormatter.format(Math.floor(absoluteValue)).replace(/[\u00a0\u202f]/g, " ");
  let prefix = "";
  let digitCount = 0;
  for (const character of integer) {
    if (digitCount === truncatedIntegerDigitCount) break;
    prefix += character;
    if (/\d/.test(character)) digitCount += 1;
  }
  prefix = prefix.trimEnd();

  return { display: `${sign}${prefix}... ₽`, exact, truncated };
}
