const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    label: { type: String, default: 'Home' },
    fullName: { type: String, required: true },
    phone: { type: String, default: '' },
    county: { type: String, default: '' },
    city: { type: String, required: true },
    street: { type: String, default: '' },
    apartment: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    country: { type: String, default: 'Kenya' },
    deliveryInstructions: { type: String, default: '' },
    isDefault: { type: Boolean, default: false }
}, { _id: true });

const notificationPrefSchema = new mongoose.Schema({
    orderUpdates: { type: Boolean, default: true },
    promotions: { type: Boolean, default: true },
    wishlistStock: { type: Boolean, default: true },
    priceDrops: { type: Boolean, default: false },
    newsletter: { type: Boolean, default: false }
}, { _id: false });

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ['customer', 'admin', 'seller'], default: 'customer' },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
    phone: { type: String, default: '' },
    profilePhoto: { type: String, default: '' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    jobTitle: { type: String, default: '' },
    employeeId: { type: String, default: '' },
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
    status: {
        type: String,
        enum: ['active', 'suspended', 'blocked', 'pending_verification', 'deleted'],
        default: 'active'
    },
    customerId: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    lastLogin: { type: Date },
    lastLoginIp: { type: String, default: '' },
    loginCount: { type: Number, default: 0 },
    isGuest: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, default: '' },
    twoFactorMethod: { type: String, enum: ['app', 'sms', 'email', ''], default: '' },
    recoveryCodes: [{ type: String }],
    notificationPreferences: { type: notificationPrefSchema, default: () => ({}) },
    address: {
        street: { type: String, default: '' },
        city: { type: String, default: '' },
        country: { type: String, default: '' }
    },
    addresses: [addressSchema],
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    loyalty: {
        currentPoints: { type: Number, default: 0 },
        lifetimePoints: { type: Number, default: 0 },
        redeemedPoints: { type: Number, default: 0 },
        currentTier: { type: String, default: 'bronze', enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'] },
        tierProgress: { type: Number, default: 0 },
        referralCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
        totalReferrals: { type: Number, default: 0 },
        successfulReferrals: { type: Number, default: 0 },
        referralRewardsEarned: { type: Number, default: 0 },
        birthdayRewardClaimed: { type: Boolean, default: false },
        lastBirthdayClaimed: { type: Date },
        anniversaryRewardClaimed: { type: Boolean, default: false },
        lastAnniversaryClaimed: { type: Date },
        signupBonusClaimed: { type: Boolean, default: false },
        firstPurchaseBonusClaimed: { type: Boolean, default: false },
        profileCompleteBonusClaimed: { type: Boolean, default: false },
        newsletterBonusClaimed: { type: Boolean, default: false },
        pointsExpiryDate: { type: Date },
        lastPointsExpiryCheck: { type: Date }
    },
    achievements: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Achievement' }]
}, { timestamps: true });

userSchema.index({ email: 1 });
userSchema.index({ status: 1 });
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ name: 'text', email: 'text', phone: 'text', username: 'text', jobTitle: 'text', employeeId: 'text' });

module.exports = mongoose.model('User', userSchema);
