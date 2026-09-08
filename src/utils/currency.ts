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
