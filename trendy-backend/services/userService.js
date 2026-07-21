// services/userService.js
const User = require('../models/User');
const Role = require('../models/Role');
const Department = require('../models/Department');
const bcrypt = require('bcryptjs');

const userService = {};

userService.getAllUsers = async (filters = {}) => {
    const {
        page = 1,
        limit = 20,
        search,
        status,
        role,
        department
    } = filters;
    
    const query = {};
    if (search) {
        query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { username: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } }
        ];
    }
    if (status) query.status = status;
    if (role) query.roleId = role;
    if (department) query.department = department;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
        User.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('roleId', 'name slug')
            .populate('department', 'name color'),
        User.countDocuments(query)
    ]);
    
    return {
        data: users,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
    };
};

userService.getUserById = async (userId) => {
    return await User.findById(userId)
        .populate('roleId', 'name slug')
        .populate('department', 'name color');
};

userService.updateUser = async (userId, updates) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found');
    }
    
    if (updates.email && updates.email !== user.email) {
        const existingUser = await User.findOne({ email: updates.email });
        if (existingUser && existingUser._id.toString() !== userId) {
            throw new Error('Email already exists');
        }
    }
    
    if (updates.username && updates.username !== user.username) {
        const existingUsername = await User.findOne({ username: updates.username });
        if (existingUsername && existingUsername._id.toString() !== userId) {
            throw new Error('Username already taken');
        }
    }
    
    if (updates.password) {
        updates.password = await bcrypt.hash(updates.password, 10);
    }
    
    Object.assign(user, updates);
    await user.save();
    
    return await userService.getUserById(userId);
};

userService.deleteUser = async (userId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found');
    }
    
    user.status = 'deleted';
    await user.save();
    return user;
};

userService.suspendUser = async (userId) => {
    const user = await User.findByIdAndUpdate(userId, { status: 'suspended' }, { new: true });
    if (!user) {
        throw new Error('User not found');
    }
    return user;
};

userService.activateUser = async (userId) => {
    const user = await User.findByIdAndUpdate(userId, { status: 'active' }, { new: true });
    if (!user) {
        throw new Error('User not found');
    }
    return user;
};

userService.getActiveRoles = async () => {
    return await Role.find({}).sort({ priority: -1 });
};

userService.getActiveDepartments = async () => {
    return await Department.find({}).sort({ name: 1 });
};

module.exports = userService;
