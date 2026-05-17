const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // ── EXISTING FIELDS (unchanged) ──────────────────────────────────────────
    uid: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, default: '' },
    password: { type: String, required: true },
    profile_picture: { type: String, default: '' },
    google_id: { type: String, default: null },
    balance: { type: Number, default: 0 },
    role: { type: String, default: 'student' },
    email_verified: { type: Number, default: 0 },   // legacy numeric flag (kept)

    // ── NEW FIELDS: Email Auth System ────────────────────────────────────────
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String, default: null },
    verificationExpires: { type: Date, default: null },
    resetCode: { type: String, default: null },
    resetExpires: { type: Date, default: null },

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
