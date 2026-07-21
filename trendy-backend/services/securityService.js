// services/securityService.js
const SecurityPolicy = require('../models/SecurityPolicy');

const securityService = {};

securityService.getPolicy = async () => {
    let policy = await SecurityPolicy.findOne({});
    if (!policy) {
        policy = await SecurityPolicy.create({});
    }
    return policy;
};

securityService.updatePolicy = async (updates) => {
    const policy = await SecurityPolicy.findOneAndUpdate({}, updates, { new: true, upsert: true });
    return policy;
};

module.exports = securityService;
