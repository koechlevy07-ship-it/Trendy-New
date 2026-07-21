const Product = require('../models/Product');

exports.getProducts = async (req, res) => {
    try {
        const { category, gender, search } = req.query;
        const filter = {};
        if (category && category !== 'all') filter.category = category;
        if (gender) filter.gender = gender;
        if (search) filter.name = { $regex: search, $options: 'i' };
        const products = await Product.find(filter);
        res.json(products);
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json(product);
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};