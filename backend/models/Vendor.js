const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
    uid: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    canteen_code: { type: String, required: true, unique: true },
    profile_picture: { type: String, default: '' },
    canteen_open_time: { type: String, default: '08:00' },
    canteen_close_time: { type: String, default: '20:00' },
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);
