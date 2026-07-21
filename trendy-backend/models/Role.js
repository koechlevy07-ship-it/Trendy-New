const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
    module: { type: String, required: true },
    actions: { type: [String], default: [] }
}, { _id: false });

const roleSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, default: '' },
    permissions: [permissionSchema],
    isDefault: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    priority: { type: Number, default: 0 }
}, { timestamps: true });

roleSchema.index({ slug: 1 });

module.exports = mongoose.model('Role', roleSchema);
