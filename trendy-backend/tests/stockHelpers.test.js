describe('Product Stock Logic (frontend helpers ported to test)', () => {
    function getEffectiveStock(product) {
        if (product.soldOut) return 0;
        if (product.stock > 0) return product.stock;
        if (product.limitedAvailable && product.limitedPieces > 0) return product.limitedPieces;
        if (product.preOrder) return 999;
        return 0;
    }

    function isProductAvailable(product) {
        if (product.soldOut) return false;
        if (product.stock > 0) return true;
        if (product.limitedAvailable && product.limitedPieces > 0) return true;
        if (product.preOrder) return true;
        return false;
    }

    describe('getEffectiveStock', () => {
        test('returns 0 for sold out product', () => {
            expect(getEffectiveStock({ soldOut: true, stock: 10 })).toBe(0);
        });

        test('returns stock when stock > 0', () => {
            expect(getEffectiveStock({ stock: 15 })).toBe(15);
        });

        test('returns limitedPieces when stock=0 and limitedAvailable', () => {
            expect(getEffectiveStock({ stock: 0, limitedAvailable: true, limitedPieces: 3 })).toBe(3);
        });

        test('returns 999 for preOrder when nothing else available', () => {
            expect(getEffectiveStock({ stock: 0, preOrder: true })).toBe(999);
        });

        test('returns 0 when nothing available', () => {
            expect(getEffectiveStock({ stock: 0 })).toBe(0);
        });

        test('soldOut takes priority over limitedPieces', () => {
            expect(getEffectiveStock({ soldOut: true, limitedAvailable: true, limitedPieces: 5 })).toBe(0);
        });

        test('stock takes priority over limitedPieces', () => {
            expect(getEffectiveStock({ stock: 10, limitedAvailable: true, limitedPieces: 3 })).toBe(10);
        });
    });

    describe('isProductAvailable', () => {
        test('sold out product is not available', () => {
            expect(isProductAvailable({ soldOut: true })).toBe(false);
        });

        test('product with stock is available', () => {
            expect(isProductAvailable({ stock: 5 })).toBe(true);
        });

        test('limited edition with pieces is available', () => {
            expect(isProductAvailable({ stock: 0, limitedAvailable: true, limitedPieces: 2 })).toBe(true);
        });

        test('preOrder product is available', () => {
            expect(isProductAvailable({ stock: 0, preOrder: true })).toBe(true);
        });

        test('empty stock is not available', () => {
            expect(isProductAvailable({ stock: 0 })).toBe(false);
        });

        test('limitedAvailable with 0 pieces is not available', () => {
            expect(isProductAvailable({ stock: 0, limitedAvailable: true, limitedPieces: 0 })).toBe(false);
        });
    });
});
