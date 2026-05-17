const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    item_id: String,
    item_name: String,
    quantity: Number,
    price: Number,
    image_url: String,
    is_default_meal: { type: Boolean, default: false },
    selected_addon: { type: String, default: null },
});

const orderSchema = new mongoose.Schema({
    order_id: { type: String, required: true, unique: true },
    student_id: { type: String, required: true },
    vendor_id: { type: String, default: null },
    total_amount: { type: Number, required: true },
    status: { type: String, default: 'active' }, // active, completed, cancelled
    payment_status: { type: String, default: 'pending' },
    razorpay_order_id: { type: String, default: null },
    razorpay_payment_id: { type: String, default: null },
    razorpay_signature: { type: String, default: null },
    qr_data: { type: String, default: null },
    auto_cancel_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    cancellation_reason: { type: String, default: null },
    refund_amount: { type: Number, default: 0 },
    refund_status: { type: String, default: null },
    payment_method: { type: String, default: 'online' }, // online, cash, counter
    order_type: { type: String, default: 'student' }, // student, counter
    items: [orderItemSchema],
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
