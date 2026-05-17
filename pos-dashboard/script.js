const API_URL = 'http://localhost:3001/api';
const SOCKET_URL = 'http://localhost:3001';

let menuItems = [];
let cart = [];
let currentCategory = 'All';
let socket;

// DOM Elements
const menuGrid = document.getElementById('menu-grid');
const cartList = document.getElementById('cart-list');
const categoryList = document.getElementById('category-list');
const subtotalEl = document.getElementById('subtotal');
const totalAmountEl = document.getElementById('total-amount');
const checkoutBtn = document.getElementById('checkout-btn');
const searchInput = document.getElementById('item-search');
const clearCartBtn = document.getElementById('clear-cart');
const socketStatus = document.getElementById('socket-status');
const statusText = document.getElementById('status-text');
const currentTimeEl = document.getElementById('current-time');
const modalOverlay = document.getElementById('modal-overlay');
const closeModalBtn = document.getElementById('close-modal');

// Initialize
async function init() {
    updateTime();
    setInterval(updateTime, 1000);
    await fetchMenu();
    await fetchCanteenCode();
    setupSocket();
    renderCategories();
}

async function fetchCanteenCode() {
    try {
        const response = await fetch(`${API_URL}/vendor/canteen-code/public`);
        const data = await response.json();
        const badge = document.getElementById('canteen-id-badge');
        if (badge) {
            badge.textContent = `Canteen: ${data.canteenCode || 'N/A'}`;
        }
    } catch (e) {
        console.error('Error fetching canteen code:', e);
    }
}

function isTimeInWindow(start, end) {
    if (!start || !end) return true;
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);

    const startTime = startH * 60 + startM;
    const endTime = endH * 60 + endM;

    return currentTime >= startTime && currentTime <= endTime;
}

function updateTime() {
    const now = new Date();
    currentTimeEl.textContent = now.toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Socket IO setup
function setupSocket() {
    socket = io(SOCKET_URL);

    socket.on('connect', () => {
        socketStatus.classList.add('online');
        statusText.textContent = 'System Online';
    });

    socket.on('disconnect', () => {
        socketStatus.classList.remove('online');
        statusText.textContent = 'System Offline';
    });

    socket.on('stock-updated', fetchMenu);
    socket.on('menu-updated', fetchMenu);
}

// Fetch menu from API
async function fetchMenu() {
    try {
        const response = await fetch(`${API_URL}/menu`);
        menuItems = await response.json();
        renderMenu();
    } catch (error) {
        console.error('Error fetching menu:', error);
    }
}

// Render categories based on menu items
function renderCategories() {
    // Already has "All" button in HTML
    const categories = ['All', ...new Set(menuItems.map(item => item.category))];
    categoryList.innerHTML = '';

    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `cat-btn ${currentCategory === cat ? 'active' : ''}`;
        btn.textContent = cat;
        btn.onclick = () => {
            currentCategory = cat;
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderMenu();
        };
        categoryList.appendChild(btn);
    });
}

// Render menu items
function renderMenu() {
    const searchTerm = searchInput.value.toLowerCase();

    const filteredItems = menuItems.filter(item => {
        const matchesCategory = currentCategory === 'All' || item.category === currentCategory;
        const matchesSearch = item.name.toLowerCase().includes(searchTerm);
        return matchesCategory && matchesSearch;
    });

    menuGrid.innerHTML = '';

    filteredItems.forEach(item => {
        const card = document.createElement('div');
        const isOutOfStock = item.stock <= 0;

        // Meal Timing Logic
        const isLocked = item.is_meal_locked;
        const inWindow = isLocked ? isTimeInWindow(item.meal_start_time, item.meal_end_time) : true;
        const isTimeLocked = isLocked && !inWindow;

        const itemInCart = cart.find(c => (c.id || c.item_id) === (item.id || item.item_id));
        const cartQty = itemInCart ? itemInCart.quantity : 0;

        card.className = `menu-item ${isOutOfStock ? 'out-of-stock' : ''} ${isTimeLocked ? 'time-locked' : ''}`;

        let lockOverlay = '';
        if (isTimeLocked) {
            lockOverlay = `
                <div class="lock-overlay">
                    <span>Locked</span>
                    <span class="lock-time">${item.meal_start_time} - ${item.meal_end_time}</span>
                </div>
            `;
        }

        let actionArea = '';
        if (isOutOfStock) {
            actionArea = `<button class="add-btn" disabled>Out of Stock</button>`;
        } else if (isTimeLocked) {
            actionArea = `<button class="add-btn" disabled>Unavailable</button>`;
        } else if (cartQty > 0) {
            actionArea = `
                <div class="inline-qty-control" onclick="event.stopPropagation()">
                    <button class="inline-qty-btn" onclick="updateCartQty('${item.id || item.item_id}', -1)">−</button>
                    <span class="inline-qty-val">${cartQty}</span>
                    <button class="inline-qty-btn" onclick="addToCart(${JSON.stringify(item).replace(/"/g, '&quot;')})">+</button>
                </div>
            `;
        } else {
            actionArea = `<button class="add-btn">Add to Order</button>`;
        }

        card.innerHTML = `
            <div class="item-img">
                ${lockOverlay}
                <img src="${item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'}" alt="${item.name}">
                <span class="stock-tag ${item.stock <= item.threshold ? 'low' : ''}">
                    ${isOutOfStock ? 'Out of Stock' : `${item.stock} left`}
                </span>
            </div>
            <div class="item-info">
                <h3>${item.name}</h3>
                <div class="price">₹${item.price.toFixed(2)}</div>
                ${isLocked ? `<div class="meal-lock-info" style="font-size: 11px; color: #f59e0b; font-weight: 600; margin-top: 4px;">⏰ ${item.meal_start_time}-${item.meal_end_time}</div>` : ''}
                <div class="item-actions">
                    ${actionArea}
                </div>
            </div>
        `;

        card.onclick = () => {
            if (!isOutOfStock && !isTimeLocked && cartQty === 0) addToCart(item);
        };

        menuGrid.appendChild(card);
    });
}

// Cart Logic
function addToCart(item) {
    const existing = cart.find(c => (c.id || c.item_id) === (item.id || item.item_id));
    if (existing) {
        if (existing.quantity < item.stock) {
            existing.quantity++;
        } else {
            alert('Cannot exceed available stock');
        }
    } else {
        cart.push({ ...item, quantity: 1 });
    }
    renderCart();
}

function updateCartQty(id, delta) {
    const item = cart.find(c => (c.id || c.item_id) === id);
    if (!item) return;

    const menuItem = menuItems.find(m => (m.id || m.item_id) === id);

    if (delta > 0 && item.quantity >= menuItem.stock) {
        alert('Cannot exceed available stock');
        return;
    }

    item.quantity += delta;
    if (item.quantity <= 0) {
        cart = cart.filter(c => (c.id || c.item_id) !== id);
    }
    renderCart();
}

function removeFromCart(id) {
    cart = cart.filter(c => (c.id || c.item_id) !== id);
    renderCart();
}

function renderCart() {
    cartList.innerHTML = '';

    if (cart.length === 0) {
        cartList.innerHTML = '<div class="empty-cart-msg">Cart is empty. Select items from the menu.</div>';
        subtotalEl.textContent = '₹0.00';
        totalAmountEl.textContent = '₹0.00';
        checkoutBtn.disabled = true;
        return;
    }

    let subtotal = 0;
    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;

        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <p>₹${item.price.toFixed(2)} each</p>
            </div>
            <div class="qty-controls">
                <button class="qty-btn" onclick="updateCartQty('${item.id || item.item_id}', -1)">-</button>
                <span class="qty-val">${item.quantity}</span>
                <button class="qty-btn" onclick="updateCartQty('${item.id || item.item_id}', 1)">+</button>
            </div>
            <div class="remove-item" onclick="removeFromCart('${item.id || item.item_id}')">✕</div>
        `;
        cartList.appendChild(div);
    });

    subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
    totalAmountEl.textContent = `₹${subtotal.toFixed(2)}`;
    checkoutBtn.disabled = false;
}

// Checkout and PDF Generation
async function handleCheckout() {
    const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Processing...';

    try {
        const response = await fetch(`${API_URL}/orders/counter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: cart,
                totalAmount,
                paymentMethod
            })
        });

        const data = await response.json();

        if (data.success) {
            generateReceipt(data.order);
            showSuccessModal(data.order);
            cart = [];
            renderCart();
            await fetchMenu(); // Refresh stock
        } else {
            alert('Checkout failed: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Checkout error:', error);
        alert('Internal server error during checkout');
    } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'Complete Checkout';
    }
}

function generateReceipt(order) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        unit: 'mm',
        format: [80, 150] // Receipt printer size
    });

    const margin = 5;
    let y = 10;

    // Header
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("CAMPUS CANTEEN", 40, y, { align: "center" });
    y += 7;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("University Campus Store", 40, y, { align: "center" });
    y += 10;

    // Order Info
    doc.setFontSize(8);
    doc.text(`Order: ${order.order_id}`, margin, y);
    y += 5;
    doc.text(`Date: ${new Date(order.createdAt).toLocaleString()}`, margin, y);
    y += 5;
    doc.text(`Type: Counter Sale (${order.payment_method.toUpperCase()})`, margin, y);
    y += 5;

    doc.line(margin, y, 75, y);
    y += 7;

    // Items Header
    doc.setFont("helvetica", "bold");
    doc.text("Item", margin, y);
    doc.text("Qty", 45, y);
    doc.text("Price", 55, y);
    doc.text("Total", 65, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    order.items.forEach(item => {
        doc.text(item.item_name.substring(0, 20), margin, y);
        doc.text(item.quantity.toString(), 45, y);
        doc.text(item.price.toFixed(0), 55, y);
        doc.text((item.price * item.quantity).toFixed(0), 65, y);
        y += 5;
    });

    y += 2;
    doc.line(margin, y, 75, y);
    y += 7;

    // Total
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL AMOUNT:", margin, y);
    doc.text(`₹${order.total_amount.toFixed(2)}`, 65, y, { align: "right" });
    y += 10;

    // QR Code
    if (order.qr_data) {
        doc.addImage(order.qr_data, 'PNG', margin + 20, y, 30, 30);
        y += 35;
    }

    // Footer
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text("Thank you for your visit!", 40, y, { align: "center" });
    y += 5;
    doc.text("Please visit again", 40, y, { align: "center" });

    // Download/Print
    doc.save(`Receipt_${order.order_id}.pdf`);
}

function showSuccessModal(order) {
    document.getElementById('modal-order-id').textContent = `Order #${order.order_id}`;
    document.getElementById('modal-qr').src = order.qr_data;
    document.getElementById('modal-msg').textContent = `Order created successfully. Paid via ${order.payment_method.toUpperCase()}.`;
    modalOverlay.classList.remove('hidden');
}

// Event Listeners
searchInput.addEventListener('input', renderMenu);
clearCartBtn.onclick = () => {
    if (confirm('Clear entire cart?')) {
        cart = [];
        renderCart();
    }
};
checkoutBtn.onclick = handleCheckout;
closeModalBtn.onclick = () => modalOverlay.classList.add('hidden');

// Run
init();
