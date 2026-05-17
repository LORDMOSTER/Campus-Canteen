const mongoose = require('mongoose');

const paymentHistorySchema = new mongoose.Schema({
    user_id: { type: String, required: true },
    order_id: { type: String, required: true },
    amount: { type: Number, required: true },
    payment_method: { type: String, default: 'razorpay' },
    payment_status: { type: String, default: 'success' },
    razorpay_payment_id: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('PaymentHistory', paymentHistorySchema);
