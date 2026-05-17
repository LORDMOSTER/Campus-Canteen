'use strict';
/**
 * routes/auth.js - Email (SMTP) Auth System (Student Users)
 * Features: OTP Signup, OTP Verify, OTP Password Reset, Login Checks
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendEmail } = require('../utils/sendEmail');

const JWT_SECRET = process.env.JWT_SECRET || 'canteen-secret-key-2024';
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** 6-digit cryptographically random numeric OTP */
function generateOTP() {
    return crypto.randomInt(100000, 1000000).toString();
}

/** Build a JWT payload for a student user */
function signToken(uid) {
    return jwt.sign({ uid, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
}

/** Safe user object returned in responses (never include password/codes) */
function safeUser(u) {
    return {
        uid: u.uid,
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        balance: u.balance || 0,
        picture: u.profile_picture || '',
        role: u.role || 'student',
    };
}

/** Premium HTML Email Template Helper */
const getEmailTemplate = (name, code, type = 'verification') => {
    const isVerify = type === 'verification';
    const title = isVerify ? 'Verify Your Email' : 'Reset Your Password';
    const message = isVerify
        ? 'Welcome to Campus Canteen! Please use the 6-digit verification code below to activate your account.'
        : 'We received a request to reset your password. Use the verification code below to proceed.';

    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 20px auto; border-radius: 20px; overflow: hidden; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #f0f0f0;">
        <!-- Vibrant Header -->
        <div style="background: linear-gradient(135deg, #E8521A 0%, #F97316 100%); padding: 40px 20px; text-align: center;">
            <div style="font-size: 40px; margin-bottom: 20px;">🍽️</div>
            <h1 style="color: #fff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Campus Canteen</h1>
        </div>
        
        <!-- Content Body -->
        <div style="padding: 40px 30px; text-align: center;">
            <h2 style="color: #111; margin: 0 0 16px; font-size: 22px; font-weight: 700;">${title}</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 0 0 32px;">
                Hello <strong>${name || 'Student'}</strong>,<br>${message}
            </p>
            
            <!-- Branded OTP Box -->
            <div style="background: #FFF7F0; border: 2px solid #FFE4D0; border-radius: 16px; padding: 24px; margin-bottom: 32px;">
                <div style="color: #E8521A; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 12px;">Security Code</div>
                <div style="color: #E8521A; font-size: 36px; font-weight: 800; letter-spacing: 10px; font-family: 'Courier New', Courier, monospace;">${code}</div>
            </div>
            
            <p style="color: #999; font-size: 13px; line-height: 1.5; margin: 0;">
                This code expires in <b>10 minutes</b>.<br>If you didn't request this email, please ignore it.
            </p>
        </div>
        
        <!-- Elegant Footer -->
        <div style="background: #fafafa; padding: 24px; text-align: center; border-top: 1px solid #f0f0f0;">
            <p style="color: #bbb; font-size: 12px; margin: 0;">
                &copy; 2026 Campus Canteen • Order Fresh Food Fast
            </p>
        </div>
    </div>
    `;
};

// ─── 1. SIGNUP ───────────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        if (!name || !email || !password)
            return res.status(400).json({ error: 'name, email and password are required' });
        if (password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email))
            return res.status(400).json({ error: 'Invalid email format' });

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing && existing.isVerified)
            return res.status(400).json({ error: 'Email already registered' });

        const code = generateOTP();
        const expires = new Date(Date.now() + OTP_TTL_MS);
        const hashedPassword = await bcrypt.hash(password, 10);
        const uid = 'USER_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
        const image = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`;

        if (existing && !existing.isVerified) {
            existing.name = name;
            existing.password = hashedPassword;
            existing.verificationCode = code;
            existing.verificationExpires = expires;
            await existing.save();
        } else {
            await User.create({
                uid, name, email: email.toLowerCase(), phone: phone || '',
                password: hashedPassword, profile_picture: image, role: 'student',
                balance: 0, email_verified: 0, isVerified: false,
                verificationCode: code, verificationExpires: expires
            });
        }

        // Send Premium HTML Email
        const emailHtml = getEmailTemplate(name, code, 'verification');
        await sendEmail(
            email,
            'Campus Canteen — Verify your email',
            `Hello ${name}. Your verification code is ${code}. Valid for 10 minutes.`,
            emailHtml
        ).catch(err => console.error('⚠️ Email send error:', err.message));

        res.status(201).json({ message: 'Verification code sent to email', email: email.toLowerCase() });
    } catch (err) {
        console.error('❌ /signup error:', err.message);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// ─── 2. VERIFY EMAIL ─────────────────────────────────────────────────────────
router.post('/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code)
            return res.status(400).json({ error: 'email and code are required' });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'Account not found' });

        if (user.isVerified)
            return res.status(400).json({ error: 'Email already verified. Please log in.' });

        if (!user.verificationCode || !user.verificationExpires || new Date() > user.verificationExpires)
            return res.status(400).json({ error: 'Code expired or invalid. Please sign up again.' });

        if (user.verificationCode !== code.toString().trim())
            return res.status(400).json({ error: 'Invalid verification code' });

        user.isVerified = true;
        user.email_verified = 1;
        user.verificationCode = null;
        user.verificationExpires = null;
        await user.save();

        const token = signToken(user.uid);
        res.json({ message: 'Email verified successfully!', token, user: safeUser(user) });
    } catch (err) {
        console.error('❌ /verify-email error:', err.message);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// ─── 3. LOGIN ────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        if (!user.isVerified && user.email_verified === 1) {
            user.isVerified = true;
            await user.save();
        }

        if (!user.isVerified && !user.google_id) {
            return res.status(403).json({
                error: 'Email verification required',
                requiresVerification: true,
                email: user.email
            });
        }

        const token = signToken(user.uid);
        res.json({ token, user: safeUser(user) });
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// ─── 4. FORGOT PASSWORD ──────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'email is required' });

        const resp = { message: 'If an account exists, a reset code has been sent.' };
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.json(resp);

        const code = generateOTP();
        user.resetCode = code;
        user.resetExpires = new Date(Date.now() + OTP_TTL_MS);
        await user.save();

        const emailHtml = getEmailTemplate(user.name, code, 'reset');
        await sendEmail(
            user.email,
            'Campus Canteen — Password Reset',
            `Hello ${user.name}. Your password reset code is ${code}.`,
            emailHtml
        ).catch(err => console.error('⚠️ Reset email error:', err.message));

        res.json(resp);
    } catch (err) {
        res.status(500).json({ error: 'Error processing request' });
    }
});

// ─── 5. RESET PASSWORD ───────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword)
            return res.status(400).json({ error: 'all fields required' });
        if (newPassword.length < 6)
            return res.status(400).json({ error: 'password too short' });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || user.resetCode !== code.toString().trim() || new Date() > user.resetExpires)
            return res.status(400).json({ error: 'Invalid or expired code' });

        user.password = await bcrypt.hash(newPassword, 10);
        user.resetCode = null;
        user.resetExpires = null;
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Reset failed' });
    }
});

module.exports = router;
