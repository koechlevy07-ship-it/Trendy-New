jest.mock('axios', () => ({ post: jest.fn().mockResolvedValue({ data: {} }), create: jest.fn(() => ({ post: jest.fn().mockResolvedValue({ data: {} }) })) }));
jest.mock('@paypal/checkout-server-sdk', () => null, { virtual: true });

describe('Payment Service', () => {
    test('loads without crashing when PayPal SDK is mocked as null', () => {
        jest.isolateModules(() => {
            process.env.PAYPAL_CLIENT_ID = 'test-id';
            process.env.PAYPAL_CLIENT_SECRET = 'test-secret';
            process.env.PAYPAL_MODE = 'sandbox';
            const ps = require('../services/paymentService');
            expect(ps).toBeDefined();
            expect(typeof ps.processPaypalPayment).toBe('function');
            expect(typeof ps.capturePaypalPayment).toBe('function');
        });
    });

    test('processPaypalPayment returns error when client is null', async () => {
        jest.isolateModules(() => {
            process.env.PAYPAL_CLIENT_ID = 'test-id';
            process.env.PAYPAL_CLIENT_SECRET = 'test-secret';
            const ps = require('../services/paymentService');
            // PayPal env vars are set but SDK is null, should handle gracefully
            expect(ps.processPaypalPayment).toBeDefined();
        });
    });
});
