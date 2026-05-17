const mongoose = require('mongoose');

// Single document collection — always use findOne() / singleton pattern
const rawMaterialSchema = new mongoose.Schema({
    rice: { type: Number, default: 0 },
    chicken: { type: Number, default: 0 },
    egg: { type: Number, default: 0 },
    veg: { type: Number, default: 0 },
    noodles: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('RawMaterial', rawMaterialSchema);
