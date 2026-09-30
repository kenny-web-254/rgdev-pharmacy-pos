import { describe, expect, it } from 'vitest';
import {
  cartDiscountAmount,
  cartSubtotal,
  cartTotal,
  changeDue,
  lineTotal,
  round2,
  type PricedLine,
} from './pricing';

describe('round2', () => {
  it('rounds to two decimal places', () => {
    expect(round2(12.344)).toBe(12.34);
    expect(round2(12.345)).toBe(12.35);
  });

  it('handles the binary-float cases that lose a cent', () => {
    // 0.1 + 0.2 === 0.30000000000000004
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(8.165)).toBe(8.17);
  });

  it('never returns NaN or Infinity', () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe('lineTotal', () => {
  it('multiplies unit price by quantity', () => {
    expect(lineTotal({ unitPrice: 15, quantity: 3 })).toBe(45);
  });

  it('applies an item-level discount', () => {
    // 20% insurance co-pay on 1,000
    expect(lineTotal({ unitPrice: 100, quantity: 10, discountPercent: 20 })).toBe(800);
  });

  it('rounds the discounted line to cents', () => {
    expect(lineTotal({ unitPrice: 33.33, quantity: 3, discountPercent: 10 })).toBe(89.99);
  });

  it('never returns a negative line', () => {
    expect(lineTotal({ unitPrice: -50, quantity: 2 })).toBe(0);
    expect(lineTotal({ unitPrice: 50, quantity: -2 })).toBe(0);
  });

  it('clamps a discount above 100 percent to free rather than negative', () => {
    expect(lineTotal({ unitPrice: 100, quantity: 1, discountPercent: 150 })).toBe(0);
  });

  it('ignores a negative discount instead of inflating the line', () => {
    expect(lineTotal({ unitPrice: 100, quantity: 1, discountPercent: -50 })).toBe(100);
  });

  it('truncates fractional quantities (stock is sold in whole units)', () => {
    expect(lineTotal({ unitPrice: 10, quantity: 2.9 })).toBe(20);
  });
});

describe('cartSubtotal', () => {
  it('sums multiple lines', () => {
    const lines: PricedLine[] = [
      { unitPrice: 15, quantity: 2 }, // 30
      { unitPrice: 100, quantity: 1 }, // 100
      { unitPrice: 8.5, quantity: 4 }, // 34
    ];
    expect(cartSubtotal(lines)).toBe(164);
  });

  it('equals the sum of its rounded lines, so the server can reconcile it', () => {
    // Each line rounds individually; the subtotal must agree with that sum,
    // which is exactly what private.complete_sale checks.
    const lines: PricedLine[] = Array.from({ length: 25 }, () => ({
      unitPrice: 3.33,
      quantity: 3,
      discountPercent: 7,
    }));
    const summedFromLines = round2(
      lines.reduce((acc, line) => acc + lineTotal(line), 0)
    );
    expect(cartSubtotal(lines)).toBe(summedFromLines);
  });

  it('is zero for an empty cart', () => {
    expect(cartSubtotal([])).toBe(0);
  });
});

describe('cartDiscountAmount', () => {
  it('computes a percentage of the subtotal', () => {
    expect(cartDiscountAmount(1000, 10)).toBe(100);
  });

  it('rounds to cents', () => {
    expect(cartDiscountAmount(333.33, 15)).toBe(50);
  });

  it('treats a negative percentage as no discount', () => {
    expect(cartDiscountAmount(1000, -10)).toBe(0);
  });

  it('caps at the full subtotal', () => {
    expect(cartDiscountAmount(1000, 150)).toBe(1000);
  });
});

describe('cartTotal', () => {
  it('subtracts the discount from the subtotal', () => {
    expect(cartTotal(1000, 150)).toBe(850);
  });

  it('never goes negative when the discount exceeds the subtotal', () => {
    expect(cartTotal(500, 900)).toBe(0);
  });

  it('ignores a negative discount', () => {
    expect(cartTotal(500, -100)).toBe(500);
  });

  it('reconciles with the server rule total === subtotal - discount', () => {
    const lines: PricedLine[] = [
      { unitPrice: 249.99, quantity: 3 },
      { unitPrice: 15.5, quantity: 7, discountPercent: 20 },
    ];
    const subtotal = cartSubtotal(lines);
    const discount = cartDiscountAmount(subtotal, 12.5);
    const total = cartTotal(subtotal, discount);
    expect(round2(subtotal - discount)).toBe(total);
  });
});

describe('changeDue', () => {
  it('returns the difference for an over-tender', () => {
    expect(changeDue(1000, 845.5)).toBe(154.5);
  });

  it('is zero when the tender is exact', () => {
    expect(changeDue(845.5, 845.5)).toBe(0);
  });

  it('is never negative when the tender is short', () => {
    expect(changeDue(500, 845.5)).toBe(0);
  });
});
