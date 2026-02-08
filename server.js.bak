const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const QRCode = require('qrcode');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const bcrypt = require('bcryptjs');
const session = require('cookie-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { load, save } = require('./db');

const app = express();
const PORT = process.env.PORT || 3002;
const BASE_URL = process.env.BASE_URL || 'https://beta.abapture.ai';
const STRIPE_SK = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PK = process.env.STRIPE_PUBLISHABLE_KEY || '';

// Ensure dirs
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  name: 'mc_session',
  keys: ['menucraft-secret-key-2026-xk9m'],
  maxAge: 30 * 24 * 60 * 60 * 1000
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function getMenuCategories(menuId) {
  const db = load();
  const cats = Object.values(db.categories)
    .filter(c => c.menu_id === menuId)
    .sort((a, b) => a.sort_order - b.sort_order);
  for (const cat of cats) {
    cat.items = Object.values(db.items)
      .filter(i => i.category_id === cat.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(i => ({ ...i, tags: typeof i.tags === 'string' ? JSON.parse(i.tags) : (i.tags || []) }));
  }
  return cats;
}

// Ensure analytics collection exists in db
function ensureAnalytics(db) {
  if (!db.analytics) db.analytics = [];
  return db;
}

function trackEvent(type, data) {
  const db = ensureAnalytics(load());
  db.analytics.push({
    id: uuidv4(),
    type, // 'menu_view', 'qr_scan', 'item_view'
    ...data,
    timestamp: new Date().toISOString()
  });
  // Keep last 50k events max
  if (db.analytics.length > 50000) db.analytics = db.analytics.slice(-40000);
  save(db);
}

// ============ AUTH ============

app.post('/api/auth/signup', (req, res) => {
  try {
    const { email, password, restaurantName } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const db = load();
    const existing = Object.values(db.users).find(u => u.email === email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const id = uuidv4();
    db.users[id] = { id, email, password_hash: bcrypt.hashSync(password, 10), restaurant_name: restaurantName || '', plan: 'free', hours: '', location: '', phone: '', created_at: new Date().toISOString() };

    // Default menu
    const menuId = uuidv4();
    const slug = (restaurantName || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + id.slice(0, 6);
    db.menus[menuId] = { id: menuId, user_id: id, name: 'Main Menu', slug, description: '', logo_url: '', primary_color: '#E85D2C', bg_color: '#FFFBF7', font: 'Inter', is_active: 1, created_at: new Date().toISOString() };

    // Sample data
    const cats = [
      { name: 'Starters', description: 'Begin your meal right', sort_order: 0 },
      { name: 'Mains', description: 'Our signature dishes', sort_order: 1 },
      { name: 'Desserts', description: 'Sweet endings', sort_order: 2 },
    ];
    const catIds = [];
    for (const c of cats) {
      const cid = uuidv4();
      catIds.push(cid);
      db.categories[cid] = { id: cid, menu_id: menuId, ...c };
    }

    const sampleItems = [
      { category_id: catIds[0], name: 'Bruschetta', description: 'Toasted bread with fresh tomatoes, basil & olive oil', price: 8.50, tags: ['vegetarian'], sort_order: 0, is_featured: 0 },
      { category_id: catIds[0], name: 'Soup of the Day', description: "Ask your server for today's selection", price: 7.00, tags: ['gluten-free'], sort_order: 1, is_featured: 0 },
      { category_id: catIds[1], name: 'Grilled Salmon', description: 'Atlantic salmon with lemon butter sauce & seasonal vegetables', price: 24.00, tags: ['gluten-free'], sort_order: 0, is_featured: 1 },
      { category_id: catIds[1], name: 'Mushroom Risotto', description: 'Creamy arborio rice with wild mushrooms & parmesan', price: 18.00, tags: ['vegetarian'], sort_order: 1, is_featured: 0 },
      { category_id: catIds[1], name: 'Spicy Thai Curry', description: 'Red curry with coconut milk, vegetables & jasmine rice', price: 16.50, tags: ['vegan', 'spicy', 'gluten-free'], sort_order: 2, is_featured: 0 },
      { category_id: catIds[2], name: 'Tiramisu', description: 'Classic Italian coffee-flavored dessert', price: 10.00, tags: [], sort_order: 0, is_featured: 1 },
      { category_id: catIds[2], name: 'Chocolate Lava Cake', description: 'Warm chocolate cake with a molten center', price: 12.00, tags: ['vegetarian'], sort_order: 1, is_featured: 0 },
    ];
    for (const item of sampleItems) {
      const iid = uuidv4();
      db.items[iid] = { id: iid, ...item, image_url: '', is_available: 1 };
    }

    save(db);
    req.session.userId = id;
    res.json({ success: true, user: { id, email, restaurantName } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db = load();
  const user = Object.values(db.users).find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.userId = user.id;
  res.json({ success: true, user: { id: user.id, email: user.email, restaurantName: user.restaurant_name, plan: user.plan } });
});

app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const db = load();
  const user = db.users[req.session.userId];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: { id: user.id, email: user.email, restaurantName: user.restaurant_name, plan: user.plan, hours: user.hours || '', location: user.location || '', phone: user.phone || '', created_at: user.created_at } });
});

// Update restaurant info
app.put('/api/auth/profile', requireAuth, (req, res) => {
  const db = load();
  const user = db.users[req.session.userId];
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { restaurantName, hours, location, phone } = req.body;
  if (restaurantName !== undefined) user.restaurant_name = restaurantName;
  if (hours !== undefined) user.hours = hours;
  if (location !== undefined) user.location = location;
  if (phone !== undefined) user.phone = phone;
  save(db);
  res.json({ success: true });
});

// ============ MENUS ============

app.get('/api/menus', requireAuth, (req, res) => {
  const db = load();
  const menus = Object.values(db.menus).filter(m => m.user_id === req.session.userId);
  res.json({ menus });
});

app.post('/api/menus', requireAuth, (req, res) => {
  const db = load();
  const user = db.users[req.session.userId];
  const { name } = req.body;
  const menuId = uuidv4();
  const slug = (name || 'menu').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + menuId.slice(0, 6);
  db.menus[menuId] = { id: menuId, user_id: req.session.userId, name: name || 'New Menu', slug, description: '', logo_url: '', primary_color: '#E85D2C', bg_color: '#FFFBF7', font: 'Inter', is_active: 1, created_at: new Date().toISOString() };
  save(db);
  res.json({ menu: db.menus[menuId] });
});

app.put('/api/menus/:id', requireAuth, (req, res) => {
  const db = load();
  const menu = db.menus[req.params.id];
  if (!menu || menu.user_id !== req.session.userId) return res.status(404).json({ error: 'Menu not found' });

  const { name, description, primary_color, bg_color, font } = req.body;
  if (name !== undefined) menu.name = name;
  if (description !== undefined) menu.description = description;
  if (primary_color !== undefined) menu.primary_color = primary_color;
  if (bg_color !== undefined) menu.bg_color = bg_color;
  if (font !== undefined) menu.font = font;
  save(db);
  res.json({ menu });
});

app.delete('/api/menus/:id', requireAuth, (req, res) => {
  const db = load();
  const menu = db.menus[req.params.id];
  if (!menu || menu.user_id !== req.session.userId) return res.status(404).json({ error: 'Menu not found' });
  // Don't allow deleting last menu
  const userMenus = Object.values(db.menus).filter(m => m.user_id === req.session.userId);
  if (userMenus.length <= 1) return res.status(400).json({ error: 'Cannot delete your only menu' });
  // Delete all categories and items for this menu
  const catIds = Object.values(db.categories).filter(c => c.menu_id === req.params.id).map(c => c.id);
  catIds.forEach(cid => {
    Object.keys(db.items).forEach(k => { if (db.items[k].category_id === cid) delete db.items[k]; });
    delete db.categories[cid];
  });
  delete db.menus[req.params.id];
  save(db);
  res.json({ success: true });
});

// ============ CATEGORIES ============

app.get('/api/menus/:menuId/categories', requireAuth, (req, res) => {
  const db = load();
  const menu = db.menus[req.params.menuId];
  if (!menu || menu.user_id !== req.session.userId) return res.status(404).json({ error: 'Menu not found' });
  res.json({ categories: getMenuCategories(req.params.menuId) });
});

app.post('/api/menus/:menuId/categories', requireAuth, (req, res) => {
  const db = load();
  const menu = db.menus[req.params.menuId];
  if (!menu || menu.user_id !== req.session.userId) return res.status(404).json({ error: 'Menu not found' });

  const existingCats = Object.values(db.categories).filter(c => c.menu_id === req.params.menuId);
  const maxOrder = existingCats.reduce((m, c) => Math.max(m, c.sort_order), -1);
  const id = uuidv4();
  db.categories[id] = { id, menu_id: req.params.menuId, name: req.body.name || 'New Category', description: req.body.description || '', sort_order: maxOrder + 1 };
  save(db);
  res.json({ category: { ...db.categories[id], items: [] } });
});

app.put('/api/categories/:id', requireAuth, (req, res) => {
  const db = load();
  const cat = db.categories[req.params.id];
  if (!cat) return res.status(404).json({ error: 'Not found' });
  const { name, description, sort_order } = req.body;
  if (name !== undefined) cat.name = name;
  if (description !== undefined) cat.description = description;
  if (sort_order !== undefined) cat.sort_order = sort_order;
  save(db);
  res.json({ success: true });
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  const db = load();
  Object.keys(db.items).forEach(k => { if (db.items[k].category_id === req.params.id) delete db.items[k]; });
  delete db.categories[req.params.id];
  save(db);
  res.json({ success: true });
});

// ============ REORDER ============

app.put('/api/menus/:menuId/reorder-categories', requireAuth, (req, res) => {
  const db = load();
  const menu = db.menus[req.params.menuId];
  if (!menu || menu.user_id !== req.session.userId) return res.status(404).json({ error: 'Menu not found' });
  const { order } = req.body; // array of category IDs in new order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
  order.forEach((catId, idx) => {
    if (db.categories[catId]) db.categories[catId].sort_order = idx;
  });
  save(db);
  res.json({ success: true });
});

app.put('/api/categories/:catId/reorder-items', requireAuth, (req, res) => {
  const db = load();
  const { order } = req.body; // array of item IDs in new order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
  order.forEach((itemId, idx) => {
    if (db.items[itemId]) db.items[itemId].sort_order = idx;
  });
  save(db);
  res.json({ success: true });
});

// ============ ITEMS ============

app.post('/api/categories/:catId/items', requireAuth, (req, res) => {
  const db = load();
  const { name, description, price, tags, is_featured } = req.body;
  const existingItems = Object.values(db.items).filter(i => i.category_id === req.params.catId);
  const maxOrder = existingItems.reduce((m, i) => Math.max(m, i.sort_order), -1);
  const id = uuidv4();
  db.items[id] = { id, category_id: req.params.catId, name: name || 'New Item', description: description || '', price: price || 0, tags: tags || [], image_url: '', is_available: 1, is_featured: is_featured ? 1 : 0, sort_order: maxOrder + 1 };
  save(db);
  res.json({ item: db.items[id] });
});

app.put('/api/items/:id', requireAuth, (req, res) => {
  const db = load();
  const item = db.items[req.params.id];
  if (!item) return res.status(404).json({ error: 'Not found' });
  const { name, description, price, tags, is_available, sort_order, image_url, is_featured } = req.body;
  if (name !== undefined) item.name = name;
  if (description !== undefined) item.description = description;
  if (price !== undefined) item.price = price;
  if (tags !== undefined) item.tags = tags;
  if (is_available !== undefined) item.is_available = is_available;
  if (sort_order !== undefined) item.sort_order = sort_order;
  if (image_url !== undefined) item.image_url = image_url;
  if (is_featured !== undefined) item.is_featured = is_featured;
  save(db);
  res.json({ success: true });
});

app.delete('/api/items/:id', requireAuth, (req, res) => {
  const db = load();
  delete db.items[req.params.id];
  save(db);
  res.json({ success: true });
});

// ============ DUPLICATE ITEM ============

app.post("/api/items/:id/duplicate", requireAuth, (req, res) => {
  const db = load();
  const orig = db.items[req.params.id];
  if (!orig) return res.status(404).json({ error: "Not found" });
  const existingItems = Object.values(db.items).filter(i => i.category_id === orig.category_id);
  const maxOrder = existingItems.reduce((m, i) => Math.max(m, i.sort_order), -1);
  const id = require("crypto").randomUUID();
  db.items[id] = { ...orig, id, name: orig.name + " (Copy)", sort_order: maxOrder + 1 };
  save(db);
  res.json({ item: db.items[id] });
});
// ============ UPLOAD ============

app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const ext = path.extname(req.file.originalname) || '.jpg';
  const newName = req.file.filename + ext;
  fs.renameSync(req.file.path, path.join(uploadsDir, newName));
  res.json({ url: `/uploads/${newName}` });
});

// ============ QR CODE ============

app.get('/api/menus/:id/qr', requireAuth, async (req, res) => {
  const db = load();
  const menu = db.menus[req.params.id];
  if (!menu || menu.user_id !== req.session.userId) return res.status(404).json({ error: 'Menu not found' });
  // QR points to /qr/:slug which tracks the scan then redirects
  const url = `${BASE_URL}/qr/${menu.slug}`;
  const qr = await QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: '#000', light: '#fff' } });
  res.json({ qr, url: `${BASE_URL}/m/${menu.slug}` });
});

// QR scan tracking redirect
app.get('/qr/:slug', (req, res) => {
  const db = load();
  const menu = Object.values(db.menus).find(m => m.slug === req.params.slug);
  if (menu) {
    trackEvent('qr_scan', { menu_id: menu.id, user_id: menu.user_id, slug: menu.slug });
  }
  res.redirect(`/m/${req.params.slug}`);
});

// ============ PUBLIC MENU ============

app.get('/api/public/menu/:slug', (req, res) => {
  const db = load();
  const menu = Object.values(db.menus).find(m => m.slug === req.params.slug && m.is_active);
  if (!menu) return res.status(404).json({ error: 'Menu not found' });
  const user = db.users[menu.user_id];

  // Track menu view
  trackEvent('menu_view', { menu_id: menu.id, user_id: menu.user_id, slug: menu.slug });

  const categories = getMenuCategories(menu.id).filter(c => c.items.length > 0);
  // Collect featured items across all categories
  const featuredItems = [];
  categories.forEach(cat => {
    cat.items = cat.items.filter(i => i.is_available);
    cat.items.forEach(item => {
      if (item.is_featured) featuredItems.push({ ...item, category_name: cat.name });
    });
  });

  res.json({
    menu: {
      ...menu,
      restaurant_name: user?.restaurant_name || '',
      hours: user?.hours || '',
      location: user?.location || '',
      phone: user?.phone || '',
      featured_items: featuredItems,
      categories
    }
  });
});

// ============ ANALYTICS ============

app.get('/api/analytics', requireAuth, (req, res) => {
  const db = ensureAnalytics(load());
  const userId = req.session.userId;
  const userMenus = Object.values(db.menus).filter(m => m.user_id === userId);
  const menuIds = new Set(userMenus.map(m => m.id));

  // Filter events for this user
  const events = db.analytics.filter(e => menuIds.has(e.menu_id));

  const now = new Date();
  const days30ago = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const days7ago = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const recentEvents = events.filter(e => new Date(e.timestamp) >= days30ago);

  // Totals
  const totalViews = recentEvents.filter(e => e.type === 'menu_view').length;
  const totalQRScans = recentEvents.filter(e => e.type === 'qr_scan').length;
  const todayViews = recentEvents.filter(e => e.type === 'menu_view' && new Date(e.timestamp) >= today).length;

  // Views per day (last 30 days)
  const dailyViews = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dailyViews[key] = { views: 0, scans: 0 };
  }
  recentEvents.forEach(e => {
    const key = e.timestamp.slice(0, 10);
    if (dailyViews[key]) {
      if (e.type === 'menu_view') dailyViews[key].views++;
      if (e.type === 'qr_scan') dailyViews[key].scans++;
    }
  });

  // Most viewed items (from item_view events, but we can also derive from menu_view with item data)
  // For now, get item view counts from item_view events
  const itemViews = {};
  recentEvents.filter(e => e.type === 'item_view').forEach(e => {
    itemViews[e.item_id] = (itemViews[e.item_id] || 0) + 1;
  });

  // Top items
  const topItems = Object.entries(itemViews)
    .map(([id, count]) => ({ id, name: db.items[id]?.name || 'Unknown', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Views by menu
  const menuViews = {};
  recentEvents.filter(e => e.type === 'menu_view').forEach(e => {
    menuViews[e.menu_id] = (menuViews[e.menu_id] || 0) + 1;
  });
  const menuStats = Object.entries(menuViews)
    .map(([id, count]) => ({ id, name: db.menus[id]?.name || 'Unknown', count }))
    .sort((a, b) => b.count - a.count);

  res.json({
    totalViews,
    totalQRScans,
    todayViews,
    dailyViews,
    topItems,
    menuStats,
    totalEvents: recentEvents.length
  });
});

// Track item view from public menu (called client-side)
app.post('/api/public/track', (req, res) => {
  const { type, menu_id, item_id, slug } = req.body;
  if (type && menu_id) {
    const db = load();
    const menu = db.menus[menu_id];
    if (menu) {
      trackEvent(type, { menu_id, user_id: menu.user_id, item_id, slug });
    }
  }
  res.json({ ok: true });
});


// ============ DAILY SPECIALS / HAPPY HOUR ============

app.get('/api/menus/:menuId/specials', requireAuth, (req, res) => {
  const db = load();
  const menu = db.menus[req.params.menuId];
  if (!menu || menu.user_id !== req.session.userId) return res.status(404).json({ error: 'Menu not found' });
  if (!db.specials) db.specials = {};
  const specials = db.specials[req.params.menuId] || { days: {}, happyHour: { enabled: false, start: '16:00', end: '18:00', label: 'Happy Hour', days: [1,2,3,4,5] } };
  res.json({ specials });
});

app.put('/api/menus/:menuId/specials', requireAuth, (req, res) => {
  const db = load();
  const menu = db.menus[req.params.menuId];
  if (!menu || menu.user_id !== req.session.userId) return res.status(404).json({ error: 'Menu not found' });
  if (!db.specials) db.specials = {};
  db.specials[req.params.menuId] = req.body;
  save(db);
  res.json({ success: true });
});

app.get('/api/public/menu/:slug/specials', (req, res) => {
  const db = load();
  const menu = Object.values(db.menus).find(m => m.slug === req.params.slug && m.is_active);
  if (!menu) return res.status(404).json({ error: 'Menu not found' });
  if (!db.specials) db.specials = {};
  const specials = db.specials[menu.id] || { days: {}, happyHour: { enabled: false, start: '16:00', end: '18:00', label: 'Happy Hour', days: [1,2,3,4,5] } };
  // Also return item details for special item IDs
  const today = new Date().getDay(); // 0=Sun
  const daySpecials = specials.days[today] || { items: [] };
  const itemDetails = [];
  for (const si of (daySpecials.items || [])) {
    const item = db.items[si.itemId];
    if (item && item.is_available) {
      itemDetails.push({
        ...item,
        tags: typeof item.tags === 'string' ? JSON.parse(item.tags) : (item.tags || []),
        specialPrice: si.specialPrice,
        specialLabel: si.label || ''
      });
    }
  }
  res.json({ specials, todayItems: itemDetails, happyHour: specials.happyHour });
});

// ============ STRIPE ============

const createCheckoutSession = async (req, res) => {
  if (!STRIPE_SK) return res.status(500).json({ error: 'Stripe not configured' });
  try {
    const { plan } = req.body;
    const db = load();
    const user = db.users[req.session.userId];

    const prices = {
      starter: { amount: 900, name: 'MenuCraft Starter', interval: 'month' },
      pro: { amount: 2900, name: 'MenuCraft Pro', interval: 'month' },
    };

    const selected = prices[plan];
    if (!selected) return res.status(400).json({ error: 'Invalid plan' });

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: user.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: selected.name },
          unit_amount: selected.amount,
          recurring: { interval: selected.interval },
        },
        quantity: 1,
      }],
      success_url: 'https://beta.abapture.ai/dashboard?payment=success',
      cancel_url: 'https://beta.abapture.ai',
    });

    res.json({ url: checkoutSession.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
};

app.post('/api/create-checkout-session', requireAuth, createCheckoutSession);
app.post('/api/checkout', requireAuth, createCheckoutSession);

app.get('/api/stripe/config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

app.get('/api/config', (req, res) => {
  res.json({ stripePublishableKey: STRIPE_PK, baseUrl: BASE_URL });
});

// ============ SPA ROUTES ============

app.get('/m/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'menu.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
app.get('/try', (req, res) => res.sendFile(path.join(__dirname, 'public', 'try.html')));
app.get('/blog/digital-menu-for-restaurants', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog-digital-menu.html')));
app.get('/blog/qr-code-menu-guide', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog-qr-menu.html')));
app.get("/blog/free-qr-menu-maker", (req, res) => res.sendFile(path.join(__dirname, "public", "blog-free-qr-menu.html")));
app.get('/examples', (req, res) => res.sendFile(path.join(__dirname, 'public', 'examples.html')));

// Sitemap for SEO
app.get('/sitemap.xml', (req, res) => {
  const urls = [
    { loc: '/', priority: '1.0' },
    { loc: '/try', priority: '0.9' },
    { loc: '/blog/digital-menu-for-restaurants', priority: '0.8' },
    { loc: '/blog/qr-code-menu-guide', priority: '0.8' },
    { loc: '/blog/free-qr-menu-maker', priority: '0.8' },
    { loc: '/examples', priority: '0.7' },
    { loc: '/signup', priority: '0.7' },
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>https://beta.abapture.ai${u.loc}</loc><changefreq>weekly</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;
  res.type('application/xml').send(xml);
});

// robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: https://beta.abapture.ai/sitemap.xml`);
});

app.listen(PORT, () => console.log(`MenuCraft running on port ${PORT}`));
