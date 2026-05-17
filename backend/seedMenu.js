// ============================================================
// CANTEEN SYSTEM — FULL DATABASE RESET & SEED SCRIPT
// Tasks: 2 (demo analytics), 3 (clear menu), 4 (new menu),
//        5 (images), 6 (categories), 7 (stock)
// Run: node seedMenu.js  (from backend directory)
// ============================================================
require('dotenv').config();
const mongoose = require('mongoose');

// ─── Models ─────────────────────────────────────────────────
const MenuItem = require('./models/MenuItem');
const Order = require('./models/Order');
const User = require('./models/User');

// ─── Database Connection ─────────────────────────────────────
async function connect() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
}

// ─── TASK 4+5: New Menu Items (45 items, 6 categories) ───────
const NEW_MENU_ITEMS = [
    // ── Beverages & Snacks ──────────────────────────────────────
    { id: 'BEV_TEA', name: 'Tea', category: 'Beverages & Snacks', price: 12, image_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400', description: 'Hot freshly brewed tea' },
    { id: 'BEV_COFFEE', name: 'Coffee', category: 'Beverages & Snacks', price: 17, image_url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400', description: 'Hot aromatic coffee' },
    { id: 'BEV_SNACKS', name: 'Snacks', category: 'Beverages & Snacks', price: 8, image_url: 'https://images.unsplash.com/photo-1536816579748-4ecb3f03d72a?w=400', description: 'Crispy mixed snacks' },
    { id: 'BEV_PAKKODA', name: 'Pakkoda', category: 'Beverages & Snacks', price: 20, image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400', description: 'Crispy fried pakkoda' },
    { id: 'BEV_SUNDAL', name: 'Sundal', category: 'Beverages & Snacks', price: 15, image_url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400', description: 'Boiled chickpea sundal' },
    { id: 'BEV_SAMVADAI', name: 'Sambar Vadai', category: 'Beverages & Snacks', price: 15, image_url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400', description: 'Crispy vadai in sambar' },
    { id: 'BEV_CRDVADAI', name: 'Curd Vadai', category: 'Beverages & Snacks', price: 15, image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400', description: 'Soft vadai soaked in curd' },

    // ── Tiffin / Parotta Varieties ───────────────────────────────
    { id: 'TIF_CHAPPATHI', name: 'Chappathi', category: 'Tiffin / Parotta Varieties', price: 20, image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400', description: 'Soft wheat chappathi' },
    { id: 'TIF_PAROTTA', name: 'Parotta', category: 'Tiffin / Parotta Varieties', price: 20, image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400', description: 'Flaky layered parotta' },
    { id: 'TIF_EGGPAR', name: 'Egg Parotta', category: 'Tiffin / Parotta Varieties', price: 60, image_url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400', description: 'Parotta tossed with egg' },
    { id: 'TIF_CHILYPAR', name: 'Chilly Parotta', category: 'Tiffin / Parotta Varieties', price: 70, image_url: 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400', description: 'Spicy chilly parotta' },
    { id: 'TIF_VEECHU', name: 'Veechu Parotta', category: 'Tiffin / Parotta Varieties', price: 20, image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400', description: 'Classic veechu parotta' },
    { id: 'TIF_EGGVEECHU', name: 'Egg Veechu', category: 'Tiffin / Parotta Varieties', price: 30, image_url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400', description: 'Egg tossed veechu parotta' },

    // ── Dosa & Egg Items ─────────────────────────────────────────
    { id: 'DOS_DOSAI', name: 'Dosai', category: 'Dosa & Egg Items', price: 15, image_url: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400', description: 'Crispy golden dosa' },
    { id: 'DOS_ROAST', name: 'Roast', category: 'Dosa & Egg Items', price: 40, image_url: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400', description: 'Extra crispy roast dosa' },
    { id: 'DOS_NICEDOSAI', name: 'Nice Dosai', category: 'Dosa & Egg Items', price: 25, image_url: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400', description: 'Thick soft nice dosa' },
    { id: 'DOS_EGGROAST', name: 'Egg Onion Roast', category: 'Dosa & Egg Items', price: 60, image_url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400', description: 'Dosa with egg and onion' },
    { id: 'DOS_GHEEROAST', name: 'Ghee Roast', category: 'Dosa & Egg Items', price: 60, image_url: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400', description: 'Crispy ghee roast dosa' },
    { id: 'DOS_OMLET', name: 'Omlet', category: 'Dosa & Egg Items', price: 20, image_url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400', description: 'Plain egg omelette' },

    // ── Rice & Noodles ────────────────────────────────────────────
    { id: 'RIC_CHICKENRICE', name: 'Chicken Rice', category: 'Rice & Noodles', price: 70, image_url: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400', description: 'Spicy chicken fried rice', is_instant_meal: true },
    { id: 'RIC_EGGRICE', name: 'Egg Rice', category: 'Rice & Noodles', price: 60, image_url: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400', description: 'Egg fried rice', is_instant_meal: true },
    { id: 'RIC_VEGRICE', name: 'Veg Rice', category: 'Rice & Noodles', price: 50, image_url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400', description: 'Fresh vegetable fried rice', is_instant_meal: true },
    { id: 'RIC_EGGNOODLES', name: 'Egg Noodles', category: 'Rice & Noodles', price: 60, image_url: 'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=400', description: 'Egg tossed noodles', is_instant_meal: true },
    { id: 'RIC_VEGNOODLES', name: 'Veg Noodles', category: 'Rice & Noodles', price: 50, image_url: 'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=400', description: 'Vegetable noodles', is_instant_meal: true },
    { id: 'RIC_CHICKNOODL', name: 'Chicken Noodles', category: 'Rice & Noodles', price: 70, image_url: 'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=400', description: 'Chicken noodles', is_instant_meal: true },
    { id: 'RIC_VEGBRIYANI', name: 'Veg Briyani', category: 'Rice & Noodles', price: 60, image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400', description: 'Fragrant veg biryani' },
    { id: 'RIC_MUSHBRIYANI', name: 'Mushroom Briyani', category: 'Rice & Noodles', price: 60, image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400', description: 'Mushroom biryani' },
    { id: 'RIC_CHICKBRIYANI', name: 'Chicken Briyani', category: 'Rice & Noodles', price: 70, image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400', description: 'Spiced chicken biryani' },

    // ── Fast Food & Savouries ─────────────────────────────────────
    { id: 'FF_VEGPUFFS', name: 'Veg Puffs', category: 'Fast Food & Savouries', price: 15, image_url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=400', description: 'Crispy veg puffs' },
    { id: 'FF_EGGPUFFS', name: 'Egg Puffs', category: 'Fast Food & Savouries', price: 20, image_url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=400', description: 'Egg filled puffs' },
    { id: 'FF_MUSHPUFFS', name: 'Mushroom Puffs', category: 'Fast Food & Savouries', price: 20, image_url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=400', description: 'Mushroom puffs' },
    { id: 'FF_CHICKPUFFS', name: 'Chicken Puffs', category: 'Fast Food & Savouries', price: 30, image_url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=400', description: 'Chicken puffs' },
    { id: 'FF_VEGROLL', name: 'Veg Roll', category: 'Fast Food & Savouries', price: 30, image_url: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400', description: 'Veg stuffed roll' },
    { id: 'FF_EGGROLL', name: 'Egg Roll', category: 'Fast Food & Savouries', price: 35, image_url: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400', description: 'Egg roll' },
    { id: 'FF_CUTLET', name: 'Cutlet', category: 'Fast Food & Savouries', price: 20, image_url: 'https://images.unsplash.com/photo-1596560548464-f010549b84d7?w=400', description: 'Crispy cutlet' },
    { id: 'FF_CHILYGOBI', name: 'Chilly Gobi', category: 'Fast Food & Savouries', price: 40, image_url: 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400', description: 'Spicy chilly gobi' },
    { id: 'FF_BREADCHILLY', name: 'Bread Chilly', category: 'Fast Food & Savouries', price: 30, image_url: 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400', description: 'Spicy bread chilly' },
    { id: 'FF_MASALAPOORI', name: 'Masala Poori', category: 'Fast Food & Savouries', price: 30, image_url: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400', description: 'Masala poori' },
    { id: 'FF_SANDWICH', name: 'Sandwich', category: 'Fast Food & Savouries', price: 20, image_url: 'https://images.unsplash.com/photo-1528736235302-52922df5c122?w=400', description: 'Classic sandwich' },

    // ── Bakery & Sweets ───────────────────────────────────────────
    { id: 'BAK_JAMCREAMBUN', name: 'Jam/Cream Bun', category: 'Bakery & Sweets', price: 15, image_url: 'https://images.unsplash.com/photo-1558303773-d6f71cc3c50a?w=400', description: 'Soft bun with jam or cream' },
    { id: 'BAK_CAKE', name: 'Cake', category: 'Bakery & Sweets', price: 15, image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400', description: 'Fresh bakery cake slice' },
    { id: 'BAK_ROLLCAKE', name: 'Roll Cake', category: 'Bakery & Sweets', price: 20, image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400', description: 'Soft cream roll cake' },
    { id: 'BAK_COCONUTBUN', name: 'Coconut Bun', category: 'Bakery & Sweets', price: 15, image_url: 'https://images.unsplash.com/photo-1558303773-d6f71cc3c50a?w=400', description: 'Sweet coconut bun' },
];

// ─── TASK 2: Demo Analytics Data (30 days of realistic orders) ─
function generateDemoOrders(students) {
    const orders = [];
    const now = new Date('2026-02-19T20:33:21+05:30'); // Current time from context

    // Popular combos: [itemId, itemName, price, qty]
    const popularCombos = [
        [{ item_id: 'RIC_CHICKENRICE', item_name: 'Chicken Rice', price: 70, quantity: 1 }],
        [{ item_id: 'RIC_EGGRICE', item_name: 'Egg Rice', price: 60, quantity: 1 }],
        [{ item_id: 'TIF_EGGPAR', item_name: 'Egg Parotta', price: 60, quantity: 2 }],
        [{ item_id: 'TIF_CHILYPAR', item_name: 'Chilly Parotta', price: 70, quantity: 1 }],
        [{ item_id: 'DOS_GHEEROAST', item_name: 'Ghee Roast', price: 60, quantity: 1 }],
        [{ item_id: 'DOS_EGGROAST', item_name: 'Egg Onion Roast', price: 60, quantity: 1 }],
        [{ item_id: 'RIC_CHICKBRIYANI', item_name: 'Chicken Briyani', price: 70, quantity: 1 }, { item_id: 'BEV_TEA', item_name: 'Tea', price: 12, quantity: 1 }],
        [{ item_id: 'RIC_VEGBRIYANI', item_name: 'Veg Briyani', price: 60, quantity: 1 }],
        [{ item_id: 'FF_CHILYGOBI', item_name: 'Chilly Gobi', price: 40, quantity: 1 }, { item_id: 'BEV_COFFEE', item_name: 'Coffee', price: 17, quantity: 1 }],
        [{ item_id: 'TIF_CHAPPATHI', item_name: 'Chappathi', price: 20, quantity: 3 }],
        [{ item_id: 'DOS_ROAST', item_name: 'Roast', price: 40, quantity: 1 }, { item_id: 'BEV_TEA', item_name: 'Tea', price: 12, quantity: 2 }],
        [{ item_id: 'FF_CHICKPUFFS', item_name: 'Chicken Puffs', price: 30, quantity: 2 }],
        [{ item_id: 'RIC_CHICKNOODL', item_name: 'Chicken Noodles', price: 70, quantity: 1 }],
        [{ item_id: 'FF_VEGROLL', item_name: 'Veg Roll', price: 30, quantity: 2 }],
        [{ item_id: 'BEV_SAMVADAI', item_name: 'Sambar Vadai', price: 15, quantity: 2 }, { item_id: 'BEV_COFFEE', item_name: 'Coffee', price: 17, quantity: 1 }],
    ];

    const studentId = students[0]?.uid || 'USER_DEMO_001';

    for (let d = 0; d < 30; d++) {
        const dayDate = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
        // Busy days: more orders. Weekends slightly fewer.
        const dayOfWeek = dayDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const baseOrders = isWeekend ? 3 : 6;
        const numOrders = baseOrders + Math.floor(Math.random() * 5);

        for (let o = 0; o < numOrders; o++) {
            const comboIndex = Math.floor(Math.random() * popularCombos.length);
            const items = popularCombos[comboIndex].map(item => ({ ...item }));
            const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

            // Randomize time within 8am-8pm canteen hours
            const orderDate = new Date(dayDate);
            orderDate.setHours(8 + Math.floor(Math.random() * 12));
            orderDate.setMinutes(Math.floor(Math.random() * 60));
            orderDate.setSeconds(Math.floor(Math.random() * 60));

            orders.push({
                order_id: 'DEMO_' + d + '_' + o + '_' + Date.now() + Math.random().toString(36).slice(2, 6),
                student_id: studentId,
                vendor_id: null,
                items,
                total_amount: totalAmount,
                payment_id: 'pay_DEMO_' + Math.random().toString(36).slice(2, 10),
                status: 'completed',
                createdAt: orderDate,
                updatedAt: orderDate,
                completed_at: new Date(orderDate.getTime() + 15 * 60 * 1000),
            });
        }
    }

    return orders;
}

// ─── MAIN ──────────────────────────────────────────────────────
async function main() {
    try {
        await connect();

        // ── TASK 3: Clear existing menu items ─────────────────────
        const deleteResult = await MenuItem.deleteMany({});
        console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing menu items`);

        // ── TASK 4+5+6+7: Insert new menu items ───────────────────
        const menuDocs = NEW_MENU_ITEMS.map(item => ({
            ...item,
            stock: 50,   // Task 7: default stock 50
            threshold: 10,
            description: item.description || item.name,
            is_instant_meal: item.is_instant_meal || false,
            is_meal_locked: false,
            meal_start_time: '00:00',
            meal_end_time: '23:59',
        }));

        await MenuItem.insertMany(menuDocs);
        console.log(`✅ Inserted ${menuDocs.length} new menu items across 6 categories`);

        // Print category summary
        const cats = {};
        menuDocs.forEach(m => { cats[m.category] = (cats[m.category] || 0) + 1; });
        Object.entries(cats).forEach(([cat, count]) => console.log(`   📂 ${cat}: ${count} items`));

        // ── TASK 2: Clear demo orders (if any) + insert fresh demo data ──
        await Order.deleteMany({ order_id: /^DEMO_/ });
        console.log('🗑️  Cleared existing demo orders');

        const students = await User.find({ role: 'student' }).limit(1);
        const demoOrders = generateDemoOrders(students);
        await Order.insertMany(demoOrders);
        console.log(`✅ Inserted ${demoOrders.length} demo orders across last 30 days`);

        // Revenue summary
        const totalRevenue = demoOrders.reduce((s, o) => s + o.total_amount, 0);
        console.log(`   💰 Total demo revenue: ₹${totalRevenue.toFixed(2)}`);

        console.log('\n🎉 Database seeded successfully!\n');
        console.log('Categories in student app will auto-update from new menu items.');
        console.log('Restart server if needed: node server.js');

        mongoose.connection.close();
    } catch (err) {
        console.error('❌ Seed failed:', err);
        process.exit(1);
    }
}

main();
