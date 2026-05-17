'use strict';
const nodemailer = require('nodemailer');
require('dotenv').config();

// Create reusable transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL/TLS
    auth: {
        user: (process.env.EMAIL_USER || '').trim(),
        pass: (process.env.EMAIL_PASS || '').trim(),
    },
});

// Startup diagnostic: Verify SMTP connection immediately
transporter.verify((error, success) => {
    if (error) {
        const u = (process.env.EMAIL_USER || '').trim();
        const p = (process.env.EMAIL_PASS || '').trim();
        console.error('❌ EMAIL SYSTEM ERROR: SMTP Authentication Failed.');
        console.error(`   User: ${u || '(EMPTY)'}`);
        console.error(`   Pass: ${p ? p[0] + '****' + p.slice(-1) : '(EMPTY)'} (Len: ${p.length})`);
        console.error('   Error Details:', error.message);
        console.error('   👉 FIX: Ensure 2-Step Verification is ON and use an App Password (16 chars).');
    } else {
        console.log('✅ Email SMTP system ready (App Password verified)');
    }
});

/**
 * Send an email (supports HTML and plain text).
 * @param {string} to      Recipient email address
 * @param {string} subject Email subject
 * @param {string} text    Plain-text fallback
 * @param {string} html    HTML content (optional)
 */
async function sendEmail(to, subject, text, html) {
    const mailOptions = {
        from: `"Campus Canteen" <${(process.env.EMAIL_USER || '').trim()}>`,
        to,
        subject,
        text,
        html,
    };
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${to} — MessageId: ${info.messageId}`);
        return info;
    } catch (err) {
        console.error(`❌ Failed to send email to ${to}:`, err.message);
        throw err;
    }
}

module.exports = { sendEmail };
