const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000
    },
    helpful: {
        type: Number,
        default: 0,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'hidden'],
        default: 'approved'
    }
}, { timestamps: true });

const questionSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    answers: {
        type: [answerSchema],
        default: []
    },
    helpful: {
        type: Number,
        default: 0,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'hidden'],
        default: 'approved'
    }
}, { timestamps: true });

questionSchema.index({ product: 1, createdAt: -1 });
questionSchema.index({ user: 1 });

module.exports = mongoose.model('QuestionAnswer', questionSchema);
