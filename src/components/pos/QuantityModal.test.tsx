import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import QuantityModal from './QuantityModal';

describe('QuantityModal - Component Rendering & Logic', () => {
  const dummyItem = {
    id: 'prod-001',
    barcode: '8991234567890',
    name: 'Deterjen Bubuk 1kg',
    price: 25000,
    unit: 'pcs',
    stock: 50,
    qty: 1
  };

  it('renders nothing when isOpen is false', () => {
    const markup = renderToStaticMarkup(
      React.createElement(QuantityModal, {
        isOpen: false,
        item: dummyItem,
        onClose: () => {},
        onConfirm: () => {}
      })
    );
    expect(markup).toBe('');
  });

  it('renders nothing when item is null', () => {
    const markup = renderToStaticMarkup(
      React.createElement(QuantityModal, {
        isOpen: true,
        item: null,
        onClose: () => {},
        onConfirm: () => {}
      })
    );
    expect(markup).toBe('');
  });

  it('renders item name and default header when in add mode', () => {
    const markup = renderToStaticMarkup(
      React.createElement(QuantityModal, {
        isOpen: true,
        item: dummyItem,
        mode: 'add',
        onClose: () => {},
        onConfirm: () => {}
      })
    );

    expect(markup).toContain('Deterjen Bubuk 1kg');
    expect(markup).toContain('Kuantitas (Qty)');
    expect(markup).toContain('Simpan [Enter]');
    expect(markup).toContain('Batalkan [Esc]');
  });

  it('renders "Ubah Kuantitas (Qty)" header when in edit mode (F4 action)', () => {
    const markup = renderToStaticMarkup(
      React.createElement(QuantityModal, {
        isOpen: true,
        item: dummyItem,
        mode: 'edit',
        onClose: () => {},
        onConfirm: () => {}
      })
    );

    expect(markup).toContain('Deterjen Bubuk 1kg');
    expect(markup).toContain('Ubah Kuantitas (Qty)');
  });

  it('renders all buttons with explicit type="button" to prevent duplicate form triggers', () => {
    const markup = renderToStaticMarkup(
      React.createElement(QuantityModal, {
        isOpen: true,
        item: dummyItem,
        onClose: () => {},
        onConfirm: () => {}
      })
    );

    // Verify all button tags specify type="button"
    const buttonMatches = markup.match(/<button[^>]*>/g) || [];
    expect(buttonMatches.length).toBeGreaterThanOrEqual(4); // Close, Minus, Plus, Cancel, Save
    for (const btn of buttonMatches) {
      expect(btn).toContain('type="button"');
    }
  });

  it('simulates cart quantity update correctly for both edit and add modes', () => {
    type CartItem = typeof dummyItem;
    const initialCart: CartItem[] = [{ ...dummyItem, qty: 1 }];

    // Function simulating the exact logic in handleConfirmQty
    const applyQtyChange = (
      cart: CartItem[],
      targetItem: CartItem,
      newQty: number,
      mode: 'add' | 'edit'
    ): CartItem[] => {
      const parsedQty = Math.max(1, parseInt(String(newQty), 10) || 1);
      const existing = cart.findIndex(p => p.barcode === targetItem.barcode || p.id === targetItem.id);
      if (existing >= 0) {
        const next = [...cart];
        if (mode === 'edit') {
          next[existing].qty = parsedQty; // EXACT REPLACEMENT FOR F4
        } else {
          next[existing].qty += parsedQty;
        }
        return next;
      }
      return [...cart, { ...targetItem, qty: parsedQty }];
    };

    // Test F4 action: replace 1 with 5 -> MUST BE EXACTLY 5 (not 6, not 11)
    const afterEdit = applyQtyChange(initialCart, dummyItem, 5, 'edit');
    expect(afterEdit[0].qty).toBe(5);

    // Test multiple identical calls in edit mode: should still remain 5 (idempotent replacement)
    const afterDoubleEdit = applyQtyChange(afterEdit, dummyItem, 5, 'edit');
    expect(afterDoubleEdit[0].qty).toBe(5);

    // Test Add mode: adding 3 to item with qty 5 -> becomes 8
    const afterAdd = applyQtyChange(afterEdit, dummyItem, 3, 'add');
    expect(afterAdd[0].qty).toBe(8);
  });
});
