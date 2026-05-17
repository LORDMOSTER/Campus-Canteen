const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String, required: true },
    stock: { type: Number, default: 0 },
    threshold: { type: Number, default: 5 },
    image_url: { type: String, default: '' },
    description: { type: String, default: '' },
    is_meal_locked: { type: Boolean, default: false },
    meal_start_time: { type: String, default: null },
    meal_end_time: { type: String, default: null },
    is_instant_meal: { type: Boolean, default: false },
    vendor_id: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', menuItemSchema);
