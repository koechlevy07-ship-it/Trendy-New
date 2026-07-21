// services/rbacService.js
const Role = require('../models/Role');
const User = require('../models/User');
const Department = require('../models/Department');

const rbacService = {};

rbacService.getAllRoles = async () => {
    return await Role.find({}).sort({ priority: -1 });
};

rbacService.getRoleWithUserCount = async () => {
    const roles = await Role.find({}).sort({ priority: -1 }).lean();
    const roleIds = roles.map(r => r._id);
    const counts = await User.aggregate([
        { $match: { roleId: { $in: roleIds } } },
        { $group: { _id: '$roleId', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id.toString()] = c.count; });
    return roles.map(r => ({ ...r, userCount: countMap[r._id.toString()] || 0 }));
};

rbacService.createRole = async (roleData) => {
    const { name, slug, description, permissions, priority } = roleData;
    
    if (!name || !slug) {
        throw new Error('Name and slug are required');
    }
    
    const existing = await Role.findOne({ slug });
    if (existing) {
        throw new Error('Role with this slug already exists');
    }
    
    return await Role.create({
        name,
        slug,
        description,
        permissions: permissions || [],
        priority: priority || 0,
        isSystem: false,
        isDefault: false
    });
};

rbacService.updateRole = async (roleId, updates) => {
    const role = await Role.findById(roleId);
    if (!role) {
        throw new Error('Role not found');
    }
    
    if (role.isSystem && (updates.name !== role.name || updates.slug !== role.slug)) {
        throw new Error('System role name/slug cannot be changed');
    }
    
    Object.assign(role, updates);
    await role.save();
    return role;
};

rbacService.deleteRole = async (roleId) => {
    const role = await Role.findById(roleId);
    if (!role) {
        throw new Error('Role not found');
    }
    
    if (role.isSystem) {
        throw new Error('System roles cannot be deleted');
    }
    
    const usersWithRole = await User.countDocuments({ roleId });
    if (usersWithRole > 0) {
        throw new Error(`Cannot delete role assigned to ${usersWithRole} user(s)`);
    }
    
    await Role.findByIdAndDelete(roleId);
    return true;
};

rbacService.duplicateRole = async (sourceRoleId, newData) => {
    const source = await Role.findById(sourceRoleId);
    if (!source) {
        throw new Error('Source role not found');
    }
    
    const role = await Role.create({
        name: newData.name || `${source.name} (Copy)`,
        slug: newData.slug || `${source.slug}-copy-${Date.now()}`,
        description: source.description,
        permissions: source.permissions.map(p => ({ ...p, actions: [...p.actions] })),
        isDefault: false,
        isSystem: false,
        priority: source.priority
    });
    
    return role;
};

rbacService.getAllDepartments = async () => {
    return await Department.find({}).populate('managerId', 'name email profilePhoto').populate('parentDepartment', 'name').sort({ name: 1 });
};

rbacService.getDepartmentWithUserCount = async () => {
    const departments = await Department.find({}).populate('managerId', 'name email profilePhoto').populate('parentDepartment', 'name').sort({ name: 1 });
    const enriched = await Promise.all(departments.map(async dept => {
        const userCount = await User.countDocuments({ department: dept._id });
        return { ...dept.toObject(), userCount };
    }));
    return enriched;
};

module.exports = rbacService;
