const mongoose = require('mongoose');

const compareSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    products: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        validate: [arrayLimit, 'Cannot compare more than 4 products'],
        default: []
    }
}, { timestamps: true });

function arrayLimit(val) {
    return val.length <= 4;
}

module.exports = mongoose.model('Compare', compareSchema);
