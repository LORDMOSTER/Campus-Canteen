const cron = require('node-cron');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const PaymentHistory = require('../models/PaymentHistory');
const { processRefund } = require('./razorpayService');

function startOrderCancellationJob() {
  cron.schedule('*/5 * * * *', async () => {
    console.log('🔍 Checking for expired orders...');
    const now = new Date();
    try {
      const expiredOrders = await Order.find({
        status: 'active',
        auto_cancel_at: { $lt: now },
        cancelled_at: null
      });

      for (const order of expiredOrders) {
        try {
          let refundAmount = 0;
          let refundStatus = 'failed';

          if (order.razorpay_payment_id) {
            const refund = await processRefund(order.razorpay_payment_id, order.total_amount);
            refundAmount = refund.amount / 100;
            refundStatus = refund.status;
          }

          order.status = 'cancelled';
          order.cancelled_at = now;
          order.cancellation_reason = 'Not picked up in time';
          order.refund_amount = refundAmount;
          order.refund_status = refundStatus;
          await order.save();

          // Restore stock for regular (non-instant) items
          for (const item of order.items) {
            if (!item.is_default_meal) {
              await MenuItem.updateOne({ id: item.item_id }, { $inc: { stock: item.quantity } });
            }
          }

          console.log(`✅ Auto-cancelled: ${order.order_id}`);
        } catch (error) {
          console.error('Error auto-cancelling order:', error);
        }
      }
    } catch (error) {
      console.error('Cron job error:', error);
    }
  });
}

function startPaymentHistoryCleanup() {
  cron.schedule('0 0 * * *', async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    try {
      await PaymentHistory.deleteMany({ createdAt: { $lt: sevenDaysAgo } });
      console.log('✅ Payment history cleanup done');
    } catch (error) {
      console.error('Payment history cleanup error:', error);
    }
  });
}

module.exports = { startOrderCancellationJob, startPaymentHistoryCleanup };