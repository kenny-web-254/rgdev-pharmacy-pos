/**
 * Currency formatting utility for Kenyan Shillings (KSh)
 */

export const formatKSh = (amount: number | undefined | null, symbol = 'KSh'): string => {
  const numericAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  const isNegative = numericAmount < 0;
  const absAmount = Math.abs(numericAmount);
  
  const formatted = absAmount.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${isNegative ? '-' : ''}${symbol} ${formatted}`;
};

export const formatCompactKSh = (amount: number | undefined | null): string => {
  const numericAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  if (numericAmount >= 1_000_000) {
    return `KSh ${(numericAmount / 1_000_000).toFixed(1)}M`;
  }
  if (numericAmount >= 1_000) {
    return `KSh ${(numericAmount / 1_000).toFixed(numericAmount % 1000 === 0 ? 0 : 1)}k`;
  }
  return `KSh ${Math.round(numericAmount)}`;
};

