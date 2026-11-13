/**
 * Description:  Tests money formatting and the currency dropdown labels.
 * Author:       Alex Wu
 * Dependencies: vitest, domain/money.ts
 * Usage:        npm test
 */
import { expect, it } from 'vitest';
import { CURRENCIES, currencyLabel, currencySymbol, formatMoney } from '@/domain/money';
it('shows symbols with thousands separators and cents only when needed', () => {
  expect(formatMoney(40, 'USD')).toBe('$40');
  expect(formatMoney(1250, 'USD')).toBe('$1,250');
  expect(formatMoney(12.5, 'EUR')).toBe('€12.50');
  expect(formatMoney(25, 'GBP')).toBe('£25');
  expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
});
it('formats plain amounts without a currency', () => {
  expect(formatMoney(1250)).toBe('1,250');
  expect(formatMoney(9.99)).toBe('9.99');
});
it('gives every offered currency a real symbol instead of its code', () => {
  for (const c of CURRENCIES) {
    expect(currencySymbol(c)).not.toBe(c);
    expect(formatMoney(5, c)).not.toContain(c);
  }
  expect(currencyLabel('USD')).toBe('$ US Dollar');
  expect(currencySymbol('SEK')).toBe('kr');
});
