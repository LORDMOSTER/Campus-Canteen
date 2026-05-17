# 🏪 Campus Canteen — Vendor Dashboard

The **Vendor Dashboard** is the command center for canteen owners. It provides powerful tools to manage orders, track stock, and grow your business with AI insights.

---

## 📊 Key Features

### 1. Business at a Glance
- **Real-time Stats**: See today's total revenue and total orders instantly.
- **Performance Charts**: Track your sales trends over the last 30 days to see if your business is growing.
- **Peak Hours**: Discover which times of the day are your busiest so you can prepare your staff and kitchen.

### 2. Smart Order Management
- **Live Notifications**: Get an instant sound alert and notification whenever a student places a new order.
- **QR Scanner**: Use the built-in scanner to verify student orders. Just scan their QR code, and the system completes the order and clears the queue.
- **Order History**: Review all completed and cancelled orders with full details.

### 3. AI Business Advisor 🤖
This is your personal consultant. Our AI analyzes your actual sales data to help you make better decisions.
- **Multilingual Support**: You can talk to the advisor in **English** or **Tamil**. It even understands "Tanglish" (Tamil typed in English letters).
- **Daily Predictions**: Ask "What should I prepare for tomorrow?" and the AI will predict your revenue and suggest exact food quantities based on past trends.
- **Low Stock Alerts**: It warns you about ingredients or items that are running low.

### 4. Menu & Stock Control
- **Easy Editing**: Add new dishes, update prices, or change descriptions in seconds.
- **Instant Toggle**: Use the "In Stock / Out of Stock" switch to manage availability.
- **Automated Stock**: For meals like "Egg Fried Rice," the system automatically calculates how many plates you can make based on your raw materials (Rice, Eggs, etc.).

### 5. Inventory (Raw Materials)
Track your basic supplies in Kilograms and Units.
- **Rice, Chicken, Eggs, Veg, Noodles**: Update your supplies when new stock arrives.
- **Automatic Deduction**: Every time a meal is sold, the system automatically subtracts the required ingredients from your inventory.

### 6. Canteen Status Control
- **Operating Hours**: The system automatically opens and closes based on the college timings.
- **Status Override**: If the canteen is closed, students cannot place new orders, preventing any confusion after hours.

---

## 🧠 How it Works (Concepts)

### **AI-Driven Analytics**
We don't just show numbers; we use AI to find patterns. For example, if "Chicken Noodles" sells more on Wednesdays, the AI will remember this and tell you to stock up on Chicken every Tuesday night.

### **The Stock Sync System**
The system uses a "Singleton" database pattern for inventories. This means there is only one "Source of Truth." Whether a student buys a "Plain Fried Rice" or an "Egg Fried Rice," both draw from the same "Rice" stock count in real-time.

### **Multilingual Logic**
The AI Advisor uses a high-performance model that processes Tamil natively. This means if you type "Naalaiku sales epdi irukum?" (How will tomorrow's sales be?), it understands it perfectly and responds in clean, professional Tamil script.

---
*Manage Smarter, Sell Faster!* 🚀
