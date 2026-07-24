const { schemas, validate } = require('../middleware/validate');

describe('Validation Middleware', () => {
    describe('product schema', () => {
        const validProduct = {
            name: 'Test Product',
            price: 2500,
            stock: 10,
            category: 'Coats'
        };

        test('accepts valid minimal product', () => {
            const { error } = schemas.product.validate(validProduct);
            expect(error).toBeUndefined();
        });

        test('accepts all inventory fields', () => {
            const data = {
                ...validProduct,
                stock: 5,
                stockThreshold: 3,
                limitedPieces: 3,
                limitedAvailable: true,
                preOrder: false,
                soldOut: false,
                barcode: '123456789',
                subcategory: 'Outerwear',
                isTrending: true,
                isLimitedEdition: true,
                discountType: 'percentage',
                discountValue: 10
            };
            const { error } = schemas.product.validate(data);
            expect(error).toBeUndefined();
        });

        test('strips unknown fields via middleware', () => {
            const req = { body: { name: 'Test', price: 100, unknownField: 'test', another: 123 } };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();
            validate(schemas.product)(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        test('rejects missing name', () => {
            const { error } = schemas.product.validate({ price: 100 });
            expect(error).toBeDefined();
        });

        test('rejects negative price', () => {
            const { error } = schemas.product.validate({ name: 'Test', price: -5 });
            expect(error).toBeDefined();
        });

        test('rejects invalid gender', () => {
            const { error } = schemas.product.validate({ ...validProduct, gender: 'invalid' });
            expect(error).toBeDefined();
        });

        test('accepts valid gender values', () => {
            ['men', 'women', 'kids', 'unisex'].forEach(gender => {
                const { error } = schemas.product.validate({ ...validProduct, gender });
                expect(error).toBeUndefined();
            });
        });

        test('accepts soldOut/limitedAvailable/preOrder booleans', () => {
            const data = { ...validProduct, soldOut: true, limitedAvailable: false, preOrder: true };
            const { error } = schemas.product.validate(data);
            expect(error).toBeUndefined();
        });

        test('accepts valid visibility and status', () => {
            const data = { ...validProduct, visibility: 'hidden', status: 'draft' };
            const { error } = schemas.product.validate(data);
            expect(error).toBeUndefined();
        });
    });

    describe('register schema', () => {
        test('accepts valid registration', () => {
            const { error } = schemas.register.validate({
                name: 'John Doe',
                email: 'john@example.com',
                password: 'Passw0rd!'
            });
            expect(error).toBeUndefined();
        });

        test('rejects short password', () => {
            const { error } = schemas.register.validate({
                name: 'John',
                email: 'john@example.com',
                password: 'Short1!'
            });
            expect(error).toBeDefined();
        });

        test('rejects password without special char', () => {
            const { error } = schemas.register.validate({
                name: 'John',
                email: 'john@example.com',
                password: 'NoSpecial1'
            });
            expect(error).toBeDefined();
        });
    });

    describe('order schema', () => {
        const validOrder = {
            items: [{ productId: '507f1f77bcf86cd799439011', name: 'Coat', price: 5000, quantity: 1 }],
            shippingAddress: {
                fullName: 'John Doe',
                phone: '+254700000000',
                address: '123 Nairobi Rd',
                city: 'Nairobi'
            }
        };

        test('accepts valid order', () => {
            const { error } = schemas.order.validate(validOrder);
            expect(error).toBeUndefined();
        });

        test('rejects empty items', () => {
            const { error } = schemas.order.validate({ ...validOrder, items: [] });
            expect(error).toBeDefined();
        });

        test('rejects missing shipping address', () => {
            const { error } = schemas.order.validate({ items: validOrder.items });
            expect(error).toBeDefined();
        });
    });

    describe('coupon schema', () => {
        test('accepts valid coupon', () => {
            const { error } = schemas.coupon.validate({
                code: 'SAVE20',
                discount: 20,
                discountType: 'percentage'
            });
            expect(error).toBeUndefined();
        });

        test('rejects discount > 100 for percentage', () => {
            const { error } = schemas.coupon.validate({
                code: 'BAD',
                discount: 150,
                discountType: 'percentage'
            });
            expect(error).toBeDefined();
        });
    });

    describe('validate middleware', () => {
        test('calls next() on valid data', () => {
            const req = { body: { name: 'Test', email: 'test@test.com', message: 'Hello world message' } };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();
            validate(schemas.contact)(req, res, next);
            expect(next).toHaveBeenCalled();
        });

        test('returns 400 on invalid data', () => {
            const req = { body: { name: '' } };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();
            validate(schemas.contact)(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(next).not.toHaveBeenCalled();
        });
    });
});
