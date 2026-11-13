/**
 * Description:  Currency choices and money formatting shared by the site and the Discord DM. Shows
 *               symbols such as $ and € instead of codes such as USD.
 * Author:       Alex Wu
 * Dependencies:
 * Usage:
 */

/** Currencies offered when creating an exchange. Each has a symbol rather than only a code. */
export const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'NZD',
  'JPY',
  'INR',
  'PHP',
  'BRL',
  'MXN',
  'PLN',
  'SEK',
  'NOK',
  'DKK',
] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Gets the short symbol for a currency, such as $ for USD or kr for SEK. */
export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Gets the dropdown label for a currency, such as "$ US Dollar". */
export function currencyLabel(currency: string): string {
  const name = new Intl.DisplayNames('en', { type: 'currency' }).of(currency) ?? currency;
  return `${currencySymbol(currency)} ${name}`;
}

/**
 * Formats an amount with thousands separators, and with the currency's symbol when one is given.
 * Whole amounts show no cents, so 40 becomes $40 and 12.5 becomes $12.50.
 */
export function formatMoney(amount: number, currency?: string): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  };
  try {
    return new Intl.NumberFormat(
      'en',
      currency
        ? { ...options, style: 'currency', currency, currencyDisplay: 'narrowSymbol' }
        : options,
    ).format(amount);
  } catch {
    return new Intl.NumberFormat('en', options).format(amount);
  }
}
