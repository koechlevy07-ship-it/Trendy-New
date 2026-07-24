jest.mock('nodemailer', () => ({
    createTransport: jest.fn(() => ({
        sendMail: jest.fn().mockResolvedValue({ messageId: 'test-123' })
    }))
}));

const emailService = require('../services/emailService');

describe('Email Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('sendEmail', () => {
        test('returns message info on success', async () => {
            const result = await emailService.sendEmail({
                to: 'test@example.com',
                subject: 'Test',
                html: '<p>Hello</p>'
            });
            expect(result).toBeDefined();
        });

        test('handles multiple sends without crashing', async () => {
            const promises = Array.from({ length: 5 }, (_, i) =>
                emailService.sendEmail({
                    to: `user${i}@example.com`,
                    subject: `Test ${i}`,
                    html: '<p>Hello</p>'
                })
            );
            const results = await Promise.all(promises);
            expect(results).toHaveLength(5);
        });
    });

    describe('getEmailStats', () => {
        test('returns stats object', () => {
            const stats = emailService.getEmailStats();
            expect(stats).toHaveProperty('sentToday');
            expect(stats).toHaveProperty('dailyLimit');
            expect(stats).toHaveProperty('queueLength');
            expect(typeof stats.sentToday).toBe('number');
            expect(typeof stats.dailyLimit).toBe('number');
        });
    });

    describe('sendBulkEmail', () => {
        test('delegates to sendEmail', async () => {
            const result = await emailService.sendBulkEmail({
                to: 'bulk@example.com',
                subject: 'Bulk',
                html: '<p>Bulk</p>'
            });
            expect(result).toBeDefined();
        });
    });
});
