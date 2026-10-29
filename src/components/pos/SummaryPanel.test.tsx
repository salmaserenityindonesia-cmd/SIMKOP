import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import SummaryPanel from './SummaryPanel';

describe('SummaryPanel - Member Discount Visibility', () => {
  const dummyMember = { id: 'm1', nrp: '1001', nama: 'Budi Santoso' };
  const dummyCart = [{ id: 'p1', name: 'Minyak Goreng', price: 20000, qty: 2 }];

  it('hides member discount row when customer is non-member', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SummaryPanel, {
        cart: dummyCart,
        members: [dummyMember],
        selectedMember: null,
        memberDiscountPercentage: 5,
        onPay: () => {},
        onHold: () => {},
        onReset: () => {},
        onSelectMember: () => {}
      })
    );

    expect(markup).not.toContain('Diskon Member');
    expect(markup).not.toContain('Hemat Rp');
    expect(markup).toContain('Pembeli Umum');
  });

  it('hides member discount row when discount percentage is 0%', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SummaryPanel, {
        cart: dummyCart,
        members: [dummyMember],
        selectedMember: dummyMember,
        memberDiscountPercentage: 0,
        onPay: () => {},
        onHold: () => {},
        onReset: () => {},
        onSelectMember: () => {}
      })
    );

    expect(markup).not.toContain('Diskon Member');
    expect(markup).not.toContain('Hemat Rp');
  });

  it('hides member discount row when cart is empty', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SummaryPanel, {
        cart: [],
        members: [dummyMember],
        selectedMember: dummyMember,
        memberDiscountPercentage: 5,
        onPay: () => {},
        onHold: () => {},
        onReset: () => {},
        onSelectMember: () => {}
      })
    );

    expect(markup).not.toContain('Diskon Member');
    expect(markup).not.toContain('Hemat Rp');
  });

  it('renders member discount row with percentage when member is selected and discount > 0', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SummaryPanel, {
        cart: dummyCart,
        members: [dummyMember],
        selectedMember: dummyMember,
        memberDiscountPercentage: 5,
        onPay: () => {},
        onHold: () => {},
        onReset: () => {},
        onSelectMember: () => {}
      })
    );

    expect(markup).toContain('Diskon Member (5%):');
    expect(markup).toContain('- Rp 2.000');
    expect(markup).toContain('Hemat Rp 2.000 via Diskon Anggota (5%)');
  });

  it('renders custom discount percentage dynamically (e.g. 10%)', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SummaryPanel, {
        cart: dummyCart,
        members: [dummyMember],
        selectedMember: dummyMember,
        memberDiscountPercentage: 10,
        onPay: () => {},
        onHold: () => {},
        onReset: () => {},
        onSelectMember: () => {}
      })
    );

    expect(markup).toContain('Diskon Member (10%):');
    expect(markup).toContain('- Rp 4.000');
    expect(markup).toContain('Hemat Rp 4.000 via Diskon Anggota (10%)');
  });
});
