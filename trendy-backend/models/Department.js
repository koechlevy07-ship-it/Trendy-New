const mongoose = require('mongoose');
const departmentSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, default: '' },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    parentDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    isActive: { type: Boolean, default: true },
    color: { type: String, default: '#6366f1' },
    icon: { type: String, default: 'fa-building' }
}, { timestamps: true });
module.exports = mongoose.model('Department', departmentSchema);
