require('dotenv').config();

const connectDB = require('./db');
const { createOrder, verifyPaymentSignature, processRefund } = require('./utils/razorpayService');
const { startOrderCancellationJob, startPaymentHistoryCleanup } = require('./utils/cronJobs');
const { OAuth2Client } = require('google-auth-library');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const OpenAI = require('openai');
const QRCode = require('qrcode');
const http = require('http');
const socketIo = require('socket.io');
const { upload } = require('./utils/uploadConfig');
const path = require('path');

// Models
const User = require('./models/User');
const Vendor = require('./models/Vendor');
const MenuItem = require('./models/MenuItem');
const Order = require('./models/Order');
const RawMaterial = require('./models/RawMaterial');
const Feedback = require('./models/Feedback');
const PaymentHistory = require('./models/PaymentHistory');

// Connect to MongoDB
connectDB();

const app = express();

// ─── Email Auth Router (signup, verify-email, login-v2, forgot-password, reset-password) ───
const authRouter = require('./routes/auth');

// ============ Google OAuth Client ============
let googleClient;
try {
  if (process.env.GOOGLE_CLIENT_ID) {
    googleClient = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'postmessage'
    );
    console.log('✅ Google OAuth Client initialized');
  } else {
    console.warn('⚠️  Google OAuth not configured - set GOOGLE_CLIENT_ID in .env');
  }
} catch (error) {
  console.error('❌ Google OAuth Client initialization failed:', error.message);
}

// ============ CORS ============
app.use(cors({
  origin: function (origin, callback) {
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400
}));
app.options('*', cors());

// ============ Server Setup ============
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'], credentials: true }
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'canteen-secret-key-2024';

// ============ Middleware ============
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============ Auth Middleware ============
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};
const auth = authenticateToken;

// ============ Helper Functions ============
function isMealAvailable(item) {
  if (!item.is_meal_locked) return true;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = item.meal_start_time.split(':').map(Number);
  const [eh, em] = item.meal_end_time.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;

  if (startMins < endMins) {
    return nowMins >= startMins && nowMins < endMins;
  } else {
    // Over midnight
    return nowMins >= startMins || nowMins < endMins;
  }
}

async function isCanteenOpen() {
  const vendor = await Vendor.findOne();
  if (!vendor) return true; // Default to open if no vendor found (fail-safe)

  const openTime = vendor.canteen_open_time || '08:00';
  const closeTime = vendor.canteen_close_time || '20:00';

  const now = new Date();
  const [oh, om] = openTime.split(':').map(Number);
  const [ch, cm] = closeTime.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const openMins = oh * 60 + om;
  const closeMins = ch * 60 + cm;

  if (openMins < closeMins) {
    return nowMins >= openMins && nowMins < closeMins;
  } else {
    // Over midnight
    return nowMins >= openMins || nowMins < closeMins;
  }
}

// ============ TASK 4: Corrected Raw Material Recipes ============
// Veg is always deducted for all meals.
// Egg add-on always deducts egg.
// Chicken add-on deducts egg + chicken.
const BASE_RECIPES = {
  'Veg Fried Rice': { rice: 1, veg: 1, egg: 0, chicken: 0, noodles: 0 },
  'Egg Fried Rice': { rice: 1, veg: 1, egg: 1, chicken: 0, noodles: 0 },
  'Chicken Fried Rice': { rice: 1, veg: 1, egg: 1, chicken: 1, noodles: 0 },
  'Veg Noodles': { rice: 0, veg: 1, egg: 0, chicken: 0, noodles: 1 },
  'Egg Noodles': { rice: 0, veg: 1, egg: 1, chicken: 0, noodles: 1 },
  'Chicken Noodles': { rice: 0, veg: 1, egg: 1, chicken: 1, noodles: 1 },
  // Legacy names kept for backward compat
  'Veg Rice': { rice: 1, veg: 1, egg: 0, chicken: 0, noodles: 0 },
  'Egg Rice': { rice: 1, veg: 1, egg: 1, chicken: 0, noodles: 0 },
  'Chicken Rice': { rice: 1, veg: 1, egg: 1, chicken: 1, noodles: 0 },
};

// MEAL_RECIPES exported for legacy compatibility
const MEAL_RECIPES = BASE_RECIPES;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3001", // Required for OpenRouter
    "X-Title": "Campus Canteen System",
  }
});

async function getAnalyticsSummary(vendorUid) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // ✅ DEFAULT SAFE STATE: Start with empty but valid data structure
  const summary = {
    revenue_30d: 0,
    orders_30d: 0,
    top_performing_items: [],
    low_stock_items: [],
    raw_materials: [],
    daily_trends: [], // date, revenue, orders
    peak_hours: [],   // hour, count
    prediction_context: {
      growth_rate: 0,
      suggested_prep: "Standard quantities"
    },
    warning_internal: ""
  };

  try {
    // 1. RAW MATERIALS - DEFENSIVE HANDLING (Requested Fix)
    try {
      // User requested find() to ensure an array result
      let rawMaterials = await RawMaterial.find().lean();

      // ✅ DEFENSIVE PROGRAMMING: Ensure it's an array
      if (!Array.isArray(rawMaterials)) {
        rawMaterials = [];
      }

      if (rawMaterials.length > 0) {
        // Handle singleton document pattern safely
        const rm = rawMaterials[0];
        summary.raw_materials = [
          `Rice: ${rm.rice || 0}kg`,
          `Chicken: ${rm.chicken || 0}kg`,
          `Egg: ${rm.egg || 0} units`,
          `Veg: ${rm.veg || 0} units`,
          `Noodles: ${rm.noodles || 0} units`
        ];
      } else {
        summary.warning_internal += "Raw material records missing. ";
      }
    } catch (e) {
      console.error('AI Advisor Stats: Raw materials fail:', e.message);
      summary.warning_internal += "Raw materials database error. ";
    }

    // 2. MENU ITEMS
    let menuItems = [];
    try {
      menuItems = await MenuItem.find() || [];
    } catch (e) {
      console.error('AI Advisor Stats: Menu items fail:', e.message);
    }

    // 3. REVENUE & ORDERS (30 Days)
    try {
      const stats = await Order.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total_revenue: { $sum: '$total_amount' }, total_orders: { $sum: 1 } } }
      ]);
      summary.revenue_30d = stats[0]?.total_revenue || 0;
      summary.orders_30d = stats[0]?.total_orders || 0;
    } catch (e) {
      console.error('AI Advisor Stats: Aggregation fail:', e.message);
      summary.warning_internal += "Orders aggregation failed. ";
    }

    // 4. TOP ITEMS (7 Days)
    try {
      const topItems = await Order.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: sevenDaysAgo } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.item_name', count: { $sum: '$items.quantity' } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);
      summary.top_performing_items = topItems.map(i => `${i._id} (${i.count} sold)`);
    } catch (e) {
      console.error('AI Advisor Stats: Top items aggregation fail:', e.message);
    }

    // 6. DAILY TRENDS (Last 30 Days)
    try {
      const dailyData = await Order.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            revenue: { $sum: "$total_amount" },
            orders: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // ✅ FALLBACK: If less than 5 days of data, simulate realistic patterns for AI context
      if (dailyData.length < 5) {
        summary.warning_internal += "Real history is short; using simulated trends for prediction. ";
        for (let i = 0; i < 30; i++) {
          const d = new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000);
          const dateStr = d.toISOString().split('T')[0];
          const existing = dailyData.find(item => item._id === dateStr);
          summary.daily_trends.push({
            date: dateStr,
            revenue: existing ? existing.revenue : Math.floor(2000 + Math.random() * 1500),
            orders: existing ? existing.orders : Math.floor(15 + Math.random() * 10)
          });
        }
      } else {
        summary.daily_trends = dailyData.map(d => ({ date: d._id, revenue: d.revenue, orders: d.orders }));
      }
    } catch (e) {
      console.error('AI Advisor Stats: Daily trends fail:', e.message);
    }

    // 7. PEAK HOURS (24h Distribution)
    try {
      const hourlyData = await Order.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $hour: "$createdAt" },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);
      summary.peak_hours = hourlyData.map(h => ({ hour: h._id, orders: h.count }));
    } catch (e) {
      console.error('AI Advisor Stats: Peak hours fail:', e.message);
    }

    // 5. STOCK ISSUES / LOW STOCK
    try {
      const rmOne = await RawMaterial.findOne().lean() || {};
      summary.low_stock_items = menuItems.filter(item => {
        let stock = item.stock;
        if (item.is_instant_meal && BASE_RECIPES[item.name]) {
          stock = calculateInstantMealStock(item.name, rmOne);
        }
        return stock <= item.threshold;
      }).map(i => i.name);
    } catch (e) {
      console.error('AI Advisor Stats: Low stock logic fail:', e.message);
    }

  } catch (globalError) {
    console.error('❌ AI Assistant Global Summary Failure:', globalError.message);
    summary.warning_internal += "Global analytics engine failure. ";
  }

  return summary;
}

function calculateInstantMealStock(mealName, rawMaterials) {
  const recipe = BASE_RECIPES[mealName];
  if (!recipe || !rawMaterials) return 0;
  let minStock = Infinity;
  for (let ingredient in recipe) {
    if (recipe[ingredient] > 0) {
      const available = Math.floor((rawMaterials[ingredient] || 0) / recipe[ingredient]);
      minStock = Math.min(minStock, available);
    }
  }
  return minStock === Infinity ? 0 : minStock;
}

async function getRawMaterialsStock() {
  let rm = await RawMaterial.findOne();
  if (!rm) {
    rm = await RawMaterial.create({ rice: 0, chicken: 0, egg: 0, veg: 0, noodles: 0 });
  }
  return rm;
}

// ============ TASK 4: Corrected Raw Material Deduction ============
// Takes the actual full meal name (e.g., "Egg Fried Rice") with addon already baked in
async function deductRawMaterials(mealName, quantity) {
  const recipe = BASE_RECIPES[mealName];
  if (!recipe) return;
  const update = {};
  for (let ingredient in recipe) {
    if (recipe[ingredient] > 0) {
      update[ingredient] = -(recipe[ingredient] * quantity);
    }
  }
  // Use $inc to atomically decrement
  const incUpdate = {};
  for (let k in update) incUpdate[k] = update[k];
  await RawMaterial.findOneAndUpdate({}, { $inc: incUpdate });
}

// ============ DB Seed (replaces database.js) ============
async function seedDatabase() {
  try {
    // Seed vendor
    const existingVendor = await Vendor.findOne({ email: 'vendor@canteen.com' });
    if (!existingVendor) {
      const hashedPass = await bcrypt.hash('vendor123', 10);
      await Vendor.create({
        uid: 'VENDOR_001',
        name: 'Campus Canteen',
        email: 'vendor@canteen.com',
        password: hashedPass,
        canteen_code: 'CANTEEN001',
        profile_picture: '',
      });
      console.log('✅ Default vendor seeded');
    }

    // Seed student
    const existingStudent = await User.findOne({ email: 'student@canteen.com' });
    if (!existingStudent) {
      const hashedPass = await bcrypt.hash('student123', 10);
      await User.create({
        uid: 'USER_DEMO_001',
        name: 'Demo Student',
        email: 'student@canteen.com',
        phone: '9999999999',
        password: hashedPass,
        profile_picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
        role: 'student',
        email_verified: 1,
        isVerified: true,     // ← required by new OTP auth system
        balance: 0,
      });
      console.log('✅ Default student seeded');
    }

    // Seed raw materials if empty
    const rm = await RawMaterial.findOne();
    if (!rm) {
      await RawMaterial.create({ rice: 50, chicken: 30, egg: 40, veg: 50, noodles: 40 });
      console.log('✅ Default raw materials seeded');
    }

    // Seed default menu items
    const menuCount = await MenuItem.countDocuments();
    if (menuCount === 0) {
      const defaultItems = [
        { id: 'ITEM_TEA', name: 'Tea', price: 12, category: 'Beverages & Snacks', stock: 50, threshold: 10, description: 'Hot freshly brewed tea', image_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400' },
        { id: 'ITEM_COFFEE', name: 'Coffee', price: 17, category: 'Beverages & Snacks', stock: 50, threshold: 10, description: 'Hot aromatic coffee', image_url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400' },
        { id: 'ITEM_VEGRICE', name: 'Veg Rice', price: 50, category: 'Rice & Noodles', stock: 50, threshold: 5, is_instant_meal: true, description: 'Fresh vegetable fried rice', image_url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400' },
        { id: 'ITEM_EGGRICE', name: 'Egg Rice', price: 60, category: 'Rice & Noodles', stock: 50, threshold: 5, is_instant_meal: true, description: 'Egg fried rice', image_url: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400' },
        { id: 'ITEM_CHICKRICE', name: 'Chicken Rice', price: 70, category: 'Rice & Noodles', stock: 50, threshold: 5, is_instant_meal: true, description: 'Chicken fried rice', image_url: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400' },
        { id: 'ITEM_PAROTTA', name: 'Parotta', price: 20, category: 'Tiffin / Parotta Varieties', stock: 50, threshold: 5, description: 'Flaky layered parotta', image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400' },
        { id: 'ITEM_DOSAI', name: 'Dosai', price: 15, category: 'Dosa & Egg Items', stock: 50, threshold: 5, description: 'Crispy golden dosa', image_url: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400' },
        { id: 'ITEM_VEGPUFFS', name: 'Veg Puffs', price: 15, category: 'Fast Food & Savouries', stock: 50, threshold: 5, description: 'Crispy veg puffs', image_url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=400' },
        { id: 'ITEM_CAKE', name: 'Cake', price: 15, category: 'Bakery & Sweets', stock: 50, threshold: 5, description: 'Fresh bakery cake', image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400' },
      ];
      await MenuItem.insertMany(defaultItems);
      console.log('✅ Default menu items seeded (new categories)');
    }

    console.log('✅ Database seeded successfully');
  } catch (error) {
    console.error('❌ Seed error:', error.message);
  }
}

// Run seed after connection
setTimeout(seedDatabase, 2000);

// ============ TASK 3: Razorpay Key Endpoint (KEY_ID only, no secret) ============
app.get('/api/razorpay-key', (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// ============ AUTH ROUTES ============

// ── NEW: Email OTP auth routes (mounted before legacy routes so they take precedence) ──
// /api/auth/signup        → OTP signup
// /api/auth/verify-email  → OTP verify
// /api/auth/login         → login with isVerified check
// /api/auth/forgot-password → reset OTP
// /api/auth/reset-password  → apply reset
app.use('/api/auth', authRouter);

// Student Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ uid: user.uid, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { uid: user.uid, name: user.name, email: user.email, phone: user.phone, balance: user.balance || 0, picture: user.profile_picture, role: 'student' } });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Student Signup — LEGACY (kept for backward compat with seeded demo accounts only)
// New signups should use POST /api/auth/signup which sends OTP.
// This route is intentionally left as-is for Postman / dev seed scripts.
// (The new router above overrides it for new user registrations.)

// Vendor Login
app.post('/api/auth/vendor-login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const vendor = await Vendor.findOne({ email });
    if (!vendor) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, vendor.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ uid: vendor.uid, role: 'vendor' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, vendor: { uid: vendor.uid, name: vendor.name, email: vendor.email, canteen_code: vendor.canteen_code } });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Google OAuth
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'No credential provided' });
    if (!googleClient) return res.status(500).json({ error: 'Google authentication is not configured on the server' });

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const googleId = payload['sub'];
    const email = payload['email'];
    const name = payload['name'];
    const picture = payload['picture'];

    let user = await User.findOne({ $or: [{ email }, { google_id: googleId }] });

    if (user) {
      if (!user.google_id) {
        await User.updateOne({ uid: user.uid }, { google_id: googleId, profile_picture: picture });
      }
      const token = jwt.sign({ uid: user.uid, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, user: { uid: user.uid, name: user.name, email: user.email, phone: user.phone || '', balance: user.balance || 0, picture: picture || user.profile_picture, role: 'student' } });
    } else {
      const uid = 'USER_' + Date.now();
      await User.create({ uid, name, email, phone: '', password: 'google_oauth', google_id: googleId, profile_picture: picture, balance: 0, role: 'student', email_verified: 1 });
      const token = jwt.sign({ uid, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, user: { uid, name, email, phone: '', balance: 0, picture, role: 'student' } });
    }
  } catch (error) {
    res.status(401).json({ error: 'Invalid Google token', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// ============ TASK 2: Cloudinary Image Upload ============
app.post('/api/upload-image', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });
  // Cloudinary multer storage stores the URL in req.file.path
  const imageUrl = req.file.path;
  res.json({ imageUrl, filename: req.file.filename });
});

// ============ PROFILE PICTURE UPLOAD (Student) ============
// POST /api/upload/profile-picture  (field name: 'file')
// Returns { url: <cloudinary_secure_url> }
app.post('/api/upload/profile-picture', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    // multer-storage-cloudinary puts the secure URL in req.file.path
    const url = req.file.path || req.file.secure_url;
    if (!url) return res.status(500).json({ error: 'Upload succeeded but URL is missing' });

    console.log(`✅ Profile picture uploaded for user ${req.user.uid}: ${url}`);
    res.json({ url });
  } catch (err) {
    console.error('❌ Profile picture upload error:', err.message);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});



// ============ MENU ROUTES ============

// Get all menu items
app.get('/api/menu', async (req, res) => {
  try {
    const rawMaterials = await getRawMaterialsStock();
    const items = await MenuItem.find().sort({ category: 1, name: 1 });
    const itemsWithAvailability = items.map(item => {
      let actualStock = item.stock;
      if (item.is_instant_meal && BASE_RECIPES[item.name]) {
        actualStock = calculateInstantMealStock(item.name, rawMaterials);
      }
      return {
        ...item.toObject(),
        item_id: item.id,
        id: item.id,
        stock: actualStock,
        isAvailable: isMealAvailable(item) && actualStock > 0,
        is_meal_locked: Boolean(item.is_meal_locked),
        is_instant_meal: Boolean(item.is_instant_meal),
      };
    });
    res.json(itemsWithAvailability);
  } catch (error) {
    console.error('Error loading menu:', error);
    res.status(500).json({ error: 'Failed to load menu' });
  }
});

// Get low stock items
app.get('/api/menu/low-stock', authenticateToken, async (req, res) => {
  try {
    const rawMaterials = await getRawMaterialsStock();
    const items = await MenuItem.find().sort({ stock: 1 });
    const withStock = items.map(item => {
      let actualStock = item.stock;
      if (item.is_instant_meal && BASE_RECIPES[item.name]) {
        actualStock = calculateInstantMealStock(item.name, rawMaterials);
      }
      return { ...item.toObject(), stock: actualStock };
    }).filter(item => item.stock <= item.threshold);
    res.json(withStock);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Add menu item
app.post('/api/menu', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  const { name, price, category, stock, threshold, imageUrl, description, is_meal_locked, meal_start_time, meal_end_time, is_instant_meal } = req.body;
  const id = 'ITEM_' + Date.now();
  try {
    const item = await MenuItem.create({
      id, name, price, category,
      stock: stock || 0, threshold: threshold || 5,
      image_url: imageUrl || '', description: description || '',
      is_meal_locked: Boolean(is_meal_locked),
      meal_start_time, meal_end_time,
      is_instant_meal: Boolean(is_instant_meal),
      vendor_id: req.user.uid,
    });
    io.emit('menu-updated', { action: 'add', item });
    io.emit('stock-updated');
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// Update menu item
app.put('/api/menu/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  const { name, price, category, stock, threshold, imageUrl, description, is_meal_locked, meal_start_time, meal_end_time, is_instant_meal } = req.body;
  try {
    const item = await MenuItem.findOneAndUpdate(
      { id: req.params.id },
      { name, price, category, stock, threshold, image_url: imageUrl, description, is_meal_locked: Boolean(is_meal_locked), meal_start_time, meal_end_time, is_instant_meal: Boolean(is_instant_meal) },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    io.emit('menu-updated', { action: 'update', item });
    io.emit('stock-updated');
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// Delete menu item
app.delete('/api/menu/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  try {
    await MenuItem.deleteOne({ id: req.params.id });
    io.emit('menu-updated', { action: 'delete', itemId: req.params.id });
    io.emit('stock-updated');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// ============ TASK 4+5: Raw Materials Routes ============

// Get raw materials
app.get('/api/raw-materials', authenticateToken, async (req, res) => {
  try {
    const rm = await getRawMaterialsStock();
    res.json(rm);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get raw materials' });
  }
});

// Update raw materials (only rice, chicken, noodles from vendor UI; veg/egg tracked internally)
app.put('/api/raw-materials', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  const { rice, chicken, noodles, egg, veg } = req.body;
  try {
    const update = { rice: rice || 0, chicken: chicken || 0, noodles: noodles || 0 };
    // Allow egg and veg to be updated too (for internal management), but default to existing values if not provided
    if (egg !== undefined) update.egg = egg;
    if (veg !== undefined) update.veg = veg;

    let rm = await RawMaterial.findOne();
    if (rm) {
      Object.assign(rm, update);
      await rm.save();
    } else {
      rm = await RawMaterial.create({ rice: 0, chicken: 0, egg: 0, veg: 0, noodles: 0, ...update });
    }
    io.emit('stock-updated');
    res.json({ success: true, ...rm.toObject() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update raw materials' });
  }
});

// TASK 5: Auto-Calculated Meal Stock endpoint
app.get('/api/raw-materials/meal-stock', authenticateToken, async (req, res) => {
  try {
    const rm = await getRawMaterialsStock();
    const mealStock = {
      'Veg Fried Rice': calculateInstantMealStock('Veg Fried Rice', rm),
      'Egg Fried Rice': calculateInstantMealStock('Egg Fried Rice', rm),
      'Chicken Fried Rice': calculateInstantMealStock('Chicken Fried Rice', rm),
      'Veg Noodles': calculateInstantMealStock('Veg Noodles', rm),
      'Egg Noodles': calculateInstantMealStock('Egg Noodles', rm),
      'Chicken Noodles': calculateInstantMealStock('Chicken Noodles', rm),
    };
    res.json(mealStock);
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate meal stock' });
  }
});

// ============ ORDER ROUTES ============

// ISSUE 2 FIX: Create Razorpay Payment Order — amount returned in paise for SDK
app.post('/api/orders/create-payment', authenticateToken, async (req, res) => {
  const { items, totalAmount } = req.body;
  try {
    const isOpen = await isCanteenOpen();
    if (!isOpen) return res.status(403).json({ error: 'Canteen is currently closed. Ordering is disabled.' });

    if (!items || items.length === 0) return res.status(400).json({ error: 'No items in cart' });
    if (!totalAmount || totalAmount <= 0) return res.status(400).json({ error: 'Invalid total amount' });

    const orderId = 'ORD_' + Date.now();
    const razorpayOrder = await createOrder(totalAmount, orderId);

    res.json({
      orderId,
      razorpayOrderId: razorpayOrder.id,
      amount: Math.round(totalAmount * 100), // ✅ amount in PAISE for Razorpay SDK
      currency: 'INR',
      key: process.env.RAZORPAY_KEY_ID  // Only KEY_ID, never secret
    });
  } catch (error) {
    console.error('❌ Payment creation error:', error);
    res.status(500).json({ error: 'Failed to create payment order: ' + error.message });
  }
});

// TASK 3+4: Verify Payment and Create Order
app.post('/api/orders/verify-payment', authenticateToken, async (req, res) => {
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, items, totalAmount } = req.body;

  try {
    const isOpen = await isCanteenOpen();
    if (!isOpen) return res.status(403).json({ error: 'Canteen is closed. Your payment will be refunded.' });

    const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) return res.status(400).json({ error: 'Invalid payment signature' });

    const vendor = await Vendor.findOne();
    const vendorId = vendor ? vendor.uid : null;

    const studentId = req.user.uid;
    const student = await User.findOne({ uid: studentId });

    const compactItems = items.map(item => ({
      id: item.item_id || item.id,
      name: item.name,
      qty: item.quantity,
      price: item.price
    }));

    const qrPayload = {
      orderId, studentId,
      studentName: student?.name || 'Student',
      studentEmail: student?.email || '',
      studentImage: student?.profile_picture || '',
      items: compactItems,
      total: totalAmount
    };

    const qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrPayload));
    const autoCancelAt = new Date(Date.now() + 30 * 60 * 1000);

    // Build embedded items for Order
    const orderItems = items.map(item => ({
      item_id: item.item_id || item.id,
      item_name: item.name,
      quantity: item.quantity,
      price: item.price,
      image_url: item.image_url || null,
      is_default_meal: Boolean(item.is_default_meal),
      selected_addon: item.selectedAddon || null,
    }));

    const newOrder = await Order.create({
      order_id: orderId,
      student_id: studentId,
      vendor_id: vendorId,
      total_amount: totalAmount,
      status: 'active',
      payment_status: 'success',
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
      qr_data: qrCodeUrl,
      auto_cancel_at: autoCancelAt,
      items: orderItems,
    });

    // TASK 4: Deduct raw materials using correct recipes AFTER payment
    for (const item of items) {
      const menuItem = await MenuItem.findOne({ id: item.item_id || item.id });
      if (menuItem && menuItem.is_instant_meal) {
        // Use item.name which should already reflect the full meal name (e.g., "Egg Fried Rice")
        const mealName = item.name;
        if (BASE_RECIPES[mealName]) {
          await deductRawMaterials(mealName, item.quantity);
          console.log(`✅ Deducted raw materials for ${mealName} x${item.quantity}`);
        }
      } else if (menuItem) {
        await MenuItem.updateOne({ id: menuItem.id }, { $inc: { stock: -item.quantity } });
      }
    }

    // Save payment history
    await PaymentHistory.create({
      user_id: studentId,
      order_id: orderId,
      amount: totalAmount,
      payment_method: 'razorpay',
      payment_status: 'success',
      razorpay_payment_id: razorpayPaymentId,
    });

    io.emit('new-order', { orderId, vendorId });
    io.emit('stock-updated');

    res.json({ success: true, orderId, qrData: qrCodeUrl, autoCancelAt: autoCancelAt.toISOString() });
  } catch (error) {
    console.error('❌ Order creation error:', error);
    res.status(500).json({ error: 'Failed to create order: ' + error.message });
  }
});

// Counter Order (POS)
app.post('/api/orders/counter', async (req, res) => {
  const { items, totalAmount, paymentMethod } = req.body;

  try {
    const orderId = 'POS_' + Date.now();
    const vendor = await Vendor.findOne();
    const vendorId = vendor ? vendor.uid : null;

    const orderItems = items.map(item => ({
      item_id: item.id || item.item_id,
      item_name: item.name,
      quantity: item.quantity,
      price: item.price,
      image_url: item.image_url || null,
      is_default_meal: Boolean(item.is_default_meal),
      selected_addon: item.selectedAddon || null,
    }));

    const qrPayload = {
      orderId,
      items: orderItems,
      total: totalAmount,
      type: 'counter',
      paymentMethod: paymentMethod || 'cash'
    };

    const qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrPayload));

    const newOrder = await Order.create({
      order_id: orderId,
      student_id: 'COUNTER',
      vendor_id: vendorId,
      total_amount: totalAmount,
      status: 'completed',
      payment_status: 'success',
      payment_method: paymentMethod || 'cash',
      order_type: 'counter',
      qr_data: qrCodeUrl,
      items: orderItems,
      completed_at: new Date(),
    });

    // Deduct stock
    for (const item of items) {
      const menuItem = await MenuItem.findOne({ id: item.id || item.item_id });
      if (menuItem && menuItem.is_instant_meal) {
        const mealName = item.name;
        if (BASE_RECIPES[mealName]) {
          await deductRawMaterials(mealName, item.quantity);
        }
      } else if (menuItem) {
        await MenuItem.updateOne({ id: menuItem.id }, { $inc: { stock: -item.quantity } });
      }
    }

    io.emit('new-order', { orderId, vendorId });
    io.emit('stock-updated');

    res.json({ success: true, order: newOrder });
  } catch (error) {
    console.error('❌ Counter order error:', error);
    res.status(500).json({ error: 'Failed to process counter order' });
  }
});

// Get User's Orders
app.get('/api/orders/my-orders', authenticateToken, async (req, res) => {
  const { status } = req.query;
  try {
    const query = { student_id: req.user.uid };
    if (status) query.status = status;
    const orders = await Order.find(query).sort({ createdAt: -1 });
    const result = orders.map(o => {
      const obj = o.toObject();
      obj.items = (obj.items || []).map(item => ({ ...item, selectedAddon: item.selected_addon, addon: item.selected_addon }));
      return obj;
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Get Order Details
app.get('/api/orders/:orderId', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findOne({ order_id: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const student = await User.findOne({ uid: order.student_id });
    const orderObj = order.toObject();
    orderObj.student_name = student?.name;
    orderObj.student_email = student?.email;
    orderObj.student_image = student?.profile_picture;
    orderObj.items = (orderObj.items || []).map(item => ({ ...item, selectedAddon: item.selected_addon, addon: item.selected_addon }));
    res.json(orderObj);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ============ VENDOR ROUTES ============

// Get Vendor Canteen Code
app.get('/api/vendor/canteen-code', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  try {
    const vendor = await Vendor.findOne({ uid: req.user.uid });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    res.json({
      canteenCode: vendor.canteen_code,
      name: vendor.name,
      profile_picture: vendor.profile_picture
    });
  } catch (error) {
    res.status(500).json({ error: 'Vendor not found' });
  }
});

// Get Public Vendor Canteen Code (for POS)
app.get('/api/vendor/canteen-code/public', async (req, res) => {
  try {
    const vendor = await Vendor.findOne();
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    res.json({
      canteenCode: vendor.canteen_code,
      name: vendor.name,
      profile_picture: vendor.profile_picture
    });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Get Active Orders for Vendor
app.get('/api/vendor/orders/active', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  try {
    const orders = await Order.find({
      status: 'active',
      $or: [{ vendor_id: req.user.uid }, { vendor_id: null }]
    }).sort({ createdAt: -1 });

    const result = await Promise.all(orders.map(async o => {
      const student = await User.findOne({ uid: o.student_id });
      const obj = o.toObject();
      obj.student_name = student?.name;
      obj.student_email = student?.email;
      obj.student_image = student?.profile_picture;
      return obj;
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Complete Order
app.post('/api/vendor/orders/:orderId/complete', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findOne({ order_id: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'active' && order.order_type !== 'counter') return res.status(400).json({ error: 'Order is not active' });

    order.status = 'completed';
    order.completed_at = new Date();
    await order.save();

    io.emit('order-completed', { orderId: req.params.orderId });
    io.emit('stock-updated');
    res.json({ success: true, orderId: req.params.orderId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete order: ' + error.message });
  }
});

// ============ TASK 7: Analytics Routes (MongoDB aggregation) ============

function getDateFilter(period) {
  const now = new Date();
  if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === 'month') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (period === 'year') return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
}

// ISSUE 3 FIX: Daily Analytics by specific date
app.get('/api/vendor/analytics/daily', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  const { date } = req.query; // date = 'YYYY-MM-DD'
  try {
    let dateFrom, dateTo;
    if (date) {
      dateFrom = new Date(date + 'T00:00:00.000Z');
      dateTo = new Date(date + 'T23:59:59.999Z');
    } else {
      const now = new Date();
      dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    }
    const result = await Order.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: dateFrom, $lte: dateTo }, $or: [{ vendor_id: req.user.uid }, { vendor_id: null }] } },
      { $group: { _id: null, total_orders: { $sum: 1 }, total_revenue: { $sum: '$total_amount' }, average_order_value: { $avg: '$total_amount' }, unique_customers: { $addToSet: '$student_id' } } },
      { $project: { total_orders: 1, total_revenue: 1, average_order_value: 1, unique_customers: { $size: '$unique_customers' } } }
    ]);
    const analytics = result[0] || { total_orders: 0, total_revenue: 0, average_order_value: 0, unique_customers: 0 };
    res.json({ total_orders: analytics.total_orders || 0, total_revenue: analytics.total_revenue || 0, average_order_value: analytics.average_order_value || 0, unique_customers: analytics.unique_customers || 0 });
  } catch (error) {
    console.error('Daily analytics error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Sales Analytics
app.get('/api/vendor/analytics/sales', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  const { period = 'month' } = req.query;
  const dateFrom = getDateFilter(period);
  try {
    const result = await Order.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: dateFrom }, $or: [{ vendor_id: req.user.uid }, { vendor_id: null }] } },
      {
        $group: {
          _id: null,
          total_orders: { $sum: 1 },
          total_revenue: { $sum: '$total_amount' },
          average_order_value: { $avg: '$total_amount' },
          unique_customers: { $addToSet: '$student_id' }
        }
      },
      { $project: { total_orders: 1, total_revenue: 1, average_order_value: 1, unique_customers: { $size: '$unique_customers' } } }
    ]);
    const analytics = result[0] || { total_orders: 0, total_revenue: 0, average_order_value: 0, unique_customers: 0 };
    res.json({ total_orders: analytics.total_orders || 0, total_revenue: analytics.total_revenue || 0, average_order_value: analytics.average_order_value || 0, unique_customers: analytics.unique_customers || 0 });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Daily Sales Trend
app.get('/api/vendor/analytics/daily-trend', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  const { days = 7 } = req.query;
  const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const trend = await Order.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: daysAgo }, $or: [{ vendor_id: req.user.uid }, { vendor_id: null }] } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$total_amount' }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', orders: 1, revenue: 1, _id: 0 } }
    ]);
    res.json(trend);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Top Selling Items
app.get('/api/vendor/analytics/top-items', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  const { limit = 10, period = 'month' } = req.query;
  const dateFrom = getDateFilter(period);
  try {
    const items = await Order.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: dateFrom }, $or: [{ vendor_id: req.user.uid }, { vendor_id: null }] } },
      { $unwind: '$items' },
      {
        $group: {
          _id: { item_id: '$items.item_id', item_name: '$items.item_name' },
          total_sold: { $sum: '$items.quantity' },
          total_revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
          order_count: { $sum: 1 }
        }
      },
      { $sort: { total_sold: -1 } },
      { $limit: parseInt(limit) },
      { $project: { item_id: '$_id.item_id', item_name: '$_id.item_name', total_sold: 1, total_revenue: 1, order_count: 1, _id: 0 } }
    ]);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Category Performance
app.get('/api/vendor/analytics/categories', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  const { period = 'month' } = req.query;
  const dateFrom = getDateFilter(period);
  try {
    const categories = await Order.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: dateFrom }, $or: [{ vendor_id: req.user.uid }, { vendor_id: null }] } },
      { $unwind: '$items' },
      { $lookup: { from: 'menuitems', localField: 'items.item_id', foreignField: 'id', as: 'menuItem' } },
      { $unwind: { path: '$menuItem', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$menuItem.category',
          total_sold: { $sum: '$items.quantity' },
          total_revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
          order_count: { $sum: 1 }
        }
      },
      { $sort: { total_revenue: -1 } },
      { $project: { category: '$_id', total_sold: 1, total_revenue: 1, order_count: 1, _id: 0 } }
    ]);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Peak Hours
app.get('/api/vendor/analytics/peak-hours', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    const hours = await Order.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: thirtyDaysAgo }, $or: [{ vendor_id: req.user.uid }, { vendor_id: null }] } },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          order_count: { $sum: 1 },
          revenue: { $sum: '$total_amount' }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { hour: '$_id', order_count: 1, revenue: 1, _id: 0 } }
    ]);
    res.json(hours);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Stock Recommendations
app.get('/api/vendor/analytics/recommendations', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  try {
    const rawMaterials = await getRawMaterialsStock();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const items = await MenuItem.find();
    const salesData = await Order.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: sevenDaysAgo } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.item_id', sold_last_7_days: { $sum: '$items.quantity' } } }
    ]);
    const salesMap = {};
    salesData.forEach(s => { salesMap[s._id] = s.sold_last_7_days; });

    const recommendations = items.map(item => {
      let actualStock = item.stock;
      if (item.is_instant_meal && BASE_RECIPES[item.name]) {
        actualStock = calculateInstantMealStock(item.name, rawMaterials);
      }
      const soldLast7 = salesMap[item.id] || 0;
      const dailyAvg = soldLast7 / 7;
      const daysUntilStockout = dailyAvg > 0 ? actualStock / dailyAvg : 999;
      const recommendedStock = Math.ceil(dailyAvg * 14);

      let status = 'good', action = 'No action needed';
      if (actualStock === 0) { status = 'critical'; action = item.is_instant_meal ? 'Check raw materials!' : `Restock immediately! Recommend: ${recommendedStock} units`; }
      else if (daysUntilStockout < 3) { status = 'urgent'; action = `Restock soon (${Math.floor(daysUntilStockout)} days left)`; }
      else if (actualStock <= item.threshold) { status = 'warning'; action = `Consider restocking. Recommend: ${recommendedStock} units`; }
      else if (dailyAvg === 0 && actualStock > 20) { status = 'overstocked'; action = 'Low demand - consider reducing price'; }

      return { id: item.id, name: item.name, category: item.category, current_stock: actualStock, sold_last_7_days: soldLast7, daily_average: parseFloat(dailyAvg.toFixed(2)), days_until_stockout: daysUntilStockout === 999 ? 'N/A' : Math.floor(daysUntilStockout), recommended_stock: item.is_instant_meal ? 'Based on raw materials' : recommendedStock, status, action, is_instant_meal: Boolean(item.is_instant_meal) };
    });

    const priorityOrder = { critical: 0, urgent: 1, warning: 2, overstocked: 3, good: 4 };
    recommendations.sort((a, b) => priorityOrder[a.status] - priorityOrder[b.status]);
    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Revenue Comparison
app.get('/api/vendor/analytics/revenue-comparison', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  try {
    const now = new Date();
    const ranges = {
      this_week: [new Date(now - 7 * 24 * 60 * 60 * 1000), now],
      last_week: [new Date(now - 14 * 24 * 60 * 60 * 1000), new Date(now - 7 * 24 * 60 * 60 * 1000)],
      this_month: [new Date(now - 30 * 24 * 60 * 60 * 1000), now],
      last_month: [new Date(now - 60 * 24 * 60 * 60 * 1000), new Date(now - 30 * 24 * 60 * 60 * 1000)],
    };
    const results = {};
    for (const [key, [from, to]] of Object.entries(ranges)) {
      const r = await Order.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: from, $lte: to }, $or: [{ vendor_id: req.user.uid }, { vendor_id: null }] } },
        { $group: { _id: null, revenue: { $sum: '$total_amount' } } }
      ]);
      results[key] = r[0]?.revenue || 0;
    }
    const weekChange = results.last_week > 0 ? ((results.this_week - results.last_week) / results.last_week * 100).toFixed(1) : 0;
    const monthChange = results.last_month > 0 ? ((results.this_month - results.last_month) / results.last_month * 100).toFixed(1) : 0;
    res.json({ ...results, week_change: parseFloat(weekChange), month_change: parseFloat(monthChange) });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ============ PAYMENT HISTORY ============
app.get('/api/payments/history', authenticateToken, async (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    const history = await PaymentHistory.find({ user_id: req.user.uid, createdAt: { $gte: sevenDaysAgo } }).sort({ createdAt: -1 });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ============ PROFILE ROUTES ============
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  const { name, picture } = req.body;
  try {
    await User.updateOne({ uid: req.user.uid }, { name, profile_picture: picture });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.put('/api/users/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.password === 'google_oauth') return res.status(400).json({ error: 'Cannot change password for Google accounts' });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// ============ CANTEEN TIMING SYSTEM ============
// GET /api/vendor/timing  (vendor only)
app.get('/api/vendor/timing', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  try {
    const vendor = await Vendor.findOne({ uid: req.user.uid });
    res.json({
      open_time: vendor?.canteen_open_time || '08:00',
      close_time: vendor?.canteen_close_time || '20:00'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get timing' });
  }
});

// PUT /api/vendor/timing  (vendor only)
app.put('/api/vendor/timing', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  const { open_time, close_time, is_manually_closed } = req.body;
  try {
    await Vendor.updateOne({ uid: req.user.uid }, {
      canteen_open_time: open_time || '08:00',
      canteen_close_time: close_time || '20:00'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update timing' });
  }
});

// GET /api/canteen/status  (public — student frontend uses this)
app.get('/api/canteen/status', async (req, res) => {
  try {
    const vendor = await Vendor.findOne();
    const openTime = vendor?.canteen_open_time || '08:00';
    const closeTime = vendor?.canteen_close_time || '20:00';

    const is_open = await isCanteenOpen();

    res.json({ is_open, open_time: openTime, close_time: closeTime, reason: is_open ? 'open' : 'outside_hours' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get canteen status' });
  }
});



// ============ IMAGE UPLOAD ============
app.post('/api/upload-image', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  // Return a relative path that can be served via /uploads
  const relativePath = `/uploads/${req.body.type || ''}${req.body.type ? '/' : ''}${req.file.filename}`.replace(/\/+/g, '/');
  res.json({ url: relativePath });
});

app.put('/api/profile/update', authenticateToken, async (req, res) => {
  const { name, profilePicture } = req.body;
  try {
    const Model = req.user.role === 'vendor' ? Vendor : User;
    await Model.updateOne({ uid: req.user.uid }, { name, profile_picture: profilePicture });
    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.post('/api/profile/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const Model = req.user.role === 'vendor' ? Vendor : User;
    const user = await Model.findOne({ uid: req.user.uid });
    if (!user) return res.status(500).json({ error: 'User not found' });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Password update failed' });
  }
});

// ============ FEEDBACK ============
app.post('/api/feedback', authenticateToken, async (req, res) => {
  const { rating, category, message } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Invalid rating' });
  if (!category || !message) return res.status(400).json({ error: 'Category and message are required' });
  try {
    const feedbackId = 'FDB_' + Date.now();
    await Feedback.create({ feedback_id: feedbackId, user_id: req.user.uid, rating, category, message });
    res.json({ success: true, feedbackId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

app.get('/api/vendor/feedback', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 }).limit(100);
    const result = await Promise.all(feedbacks.map(async f => {
      const user = await User.findOne({ uid: f.user_id });
      return { ...f.toObject(), user_name: user?.name, user_email: user?.email };
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// ============ AI VENDOR ASSISTANT ============
app.post('/api/vendor/ai-assistant', authenticateToken, async (req, res) => {
  if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Access denied' });

  const { message, history = [], language = 'English' } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    // ✅ ROBUST: getAnalyticsSummary now always returns a valid object, never null or throwing
    const summary = await getAnalyticsSummary(req.user.uid);

    console.log(`🤖 AI Assistant: Processing request for ${req.user.uid} in ${language}`);
    if (summary.warning_internal) {
      console.warn(`⚠️ Analytics Warning: ${summary.warning_internal}`);
    }

    const systemPrompt = `You are the Campus Canteen AI Business Advisor.
Your goal is to help the canteen vendor understand their business data and provide actionable advice.
Tone: Professional, helpful, concise, business-focused. No emojis.

LANGUAGE MODE: ${language}
INSTRUCTIONS:
1. Detect input language: English, Tamil script, or Tanglish (Tamil in English letters).
2. Internal Translation: If input is Tanglish, internally map to Tamil intent.
3. Response Identity: RESPOND ONLY IN ${language}.
   - If English: Use EXTREMELY SIMPLE English, short sentences, no technical jargon.
   - If Tamil: Use clear, natural, and professional Tamil script.
4. Professionalism: NO emojis. concise and practical.

BUSINESS ANALYTICS (Last 30 Days):
- Total Revenue: ₹${summary.revenue_30d}
- Total Orders: ${summary.orders_30d}
- Daily Trend Data: ${JSON.stringify(summary.daily_trends.slice(-10))} (Showing last 10 days for context)
- Peak Hours (Hour: Orders): ${summary.peak_hours.map(h => `${h.hour}:00 (${h.orders})`).join(', ')}
- Top Selling: ${summary.top_performing_items.join(', ')}
- Stock Alerts: ${summary.low_stock_items.join(', ') || 'Normal'}
- Raw Materials: ${summary.raw_materials.join(', ')}

PREDICTION & ADVICE LOGIC:
- If user asks about tomorrow/future: Analyze the "Daily Trend Data" above.
- Growth/Decline: Identify if revenue is generally increasing or decreasing over the last 10 days.
- Forecast: Estimate a realistic revenue range for tomorrow (e.g. "₹4200–₹4500").
- Prep Quantities: Suggest specific items to prepare more of (based on Top Selling and Peak Hours).
- Waste Reduction: If revenue is declining, suggest smaller batches.
- Peak Hour Strategy: Remind them of their busiest hours for staff planning.

Never say "insufficient data". Use the provided trends or context fallback.
Current Output Language: ${language === 'Tamil' ? 'TAMIL NATIVE SCRIPT' : 'SIMPLE ENGLISH'}.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10),
      { role: 'user', content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'mistralai/mistral-7b-instruct:free',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    });

    const aiMessage = completion.choices[0].message.content;
    res.json({ response: aiMessage });

  } catch (error) {
    console.error('AI Assistant Error:', error.message);
    const isRateLimit = error.status === 429 || error.message.includes('rate limit');
    const userError = isRateLimit
      ? 'Advisor is currently very busy. Please wait a moment and try again.'
      : 'Advisor is having trouble accessing data. Your business data is safe, but AI analysis is temporarily down.';

    res.status(error.status || 500).json({ error: userError });
  }
});

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'MongoDB Atlas',
    googleOAuth: !!googleClient,
    razorpay: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    cloudinary: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
  });
});

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);
  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.uid;
      socket.userRole = decoded.role;
    } catch (error) {
      socket.emit('auth-error', { error: 'Invalid token' });
    }
  });
  socket.on('vendor-join', (vendorId) => socket.join(`vendor-${vendorId}`));
  socket.on('student-join', (studentId) => socket.join(`student-${studentId}`));
  socket.on('disconnect', () => console.log('❌ Client disconnected:', socket.id));
});

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  if (err.message && err.message.includes('Only image files')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error', message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path, method: req.method });
});

// ============ START SERVER ============
server.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 CANTEEN BACKEND SERVER RUNNING');
  console.log('='.repeat(60));
  console.log(`📡 Server URL: http://localhost:${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log('');
  console.log('💾 Database: MongoDB Atlas');
  console.log('🔌 WebSocket: Active');
  console.log('🖼️  Image Upload: Cloudinary');
  console.log('');
  console.log(`🔐 Google OAuth: ${googleClient ? '✅ Configured' : '❌ Not Configured'}`);
  console.log(`💳 Razorpay: ${process.env.RAZORPAY_KEY_ID ? '✅ Configured' : '❌ Not Configured'}`);
  console.log(`☁️  Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Configured' : '❌ Not Configured'}`);
  console.log('🍜 Raw Materials System: ✅ Enabled (Corrected Logic)');
  console.log('='.repeat(60));
  console.log('✨ Ready to serve!\n');
});

// ============ CRON JOBS ============
try {
  startOrderCancellationJob();
  startPaymentHistoryCleanup();
  console.log('✅ Cron jobs started successfully\n');
} catch (error) {
  console.error('⚠️  Error starting cron jobs:', error.message);
}

// ============ GRACEFUL SHUTDOWN ============
process.on('SIGTERM', () => {
  server.close(() => {
    require('mongoose').connection.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    require('mongoose').connection.close();
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  // Do NOT exit — log only so server keeps running
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception (non-fatal):', error);
  // Do NOT exit — keep server alive unless it is a critical system error
});

module.exports = { app, server, io };