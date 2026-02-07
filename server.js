const express = require('express');
const stripe = require('stripe');
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
const stripeClient = STRIPE_SK ? stripe(STRIPE_SK) : null;

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

// Helper: get all categories for a menu
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

// ============ AUTH ============

app.post('/api/auth/signup', (req, res) => {
  try {
    const { email, password, restaurantName } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const db = load();
    const existing = Object.values(db.users).find(u => u.email === email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const id = uuidv4();
    db.users[id] = { id, email, password_hash: bcrypt.hashSync(password, 10), restaurant_name: restaurantName || '', plan: 'free', created_at: new Date().toISOString() };

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
      { category_id: catIds[0], name: 'Bruschetta', description: 'Toasted bread with fresh tomatoes, basil & olive oil', price: 8.50, tags: ['vegetarian'], sort_order: 0 },
      { category_id: catIds[0], name: 'Soup of the Day', description: "Ask your server for today's selection", price: 7.00, tags: ['gluten-free'], sort_order: 1 },
      { category_id: catIds[1], name: 'Grilled Salmon', description: 'Atlantic salmon with lemon butter sauce & seasonal vegetables', price: 24.00, tags: ['gluten-free'], sort_order: 0 },
      { category_id: catIds[1], name: 'Mushroom Risotto', description: 'Creamy arborio rice with wild mushrooms & parmesan', price: 18.00, tags: ['vegetarian'], sort_order: 1 },
      { category_id: catIds[2], name: 'Tiramisu', description: 'Classic Italian coffee-flavored dessert', price: 10.00, tags: [], sort_order: 0 },
      { category_id: catIds[2], name: 'Chocolate Lava Cake', description: 'Warm chocolate cake with a molten center', price: 12.00, tags: ['vegetarian'], sort_order: 1 },
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
  res.json({ user: { id: user.id, email: user.email, restaurantName: user.restaurant_name, plan: user.plan, created_at: user.created_at } });
});

// ============ MENUS ============

app.get('/api/menus', requireAuth, (req, res) => {
  const db = load();
  const menus = Object.values(db.menus).filter(m => m.user_id === req.session.userId);
  res.json({ menus });
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
  // Delete items in this category
  Object.keys(db.items).forEach(k => { if (db.items[k].category_id === req.params.id) delete db.items[k]; });
  delete db.categories[req.params.id];
  save(db);
  res.json({ success: true });
});

// ============ ITEMS ============

app.post('/api/categories/:catId/items', requireAuth, (req, res) => {
  const db = load();
  const { name, description, price, tags } = req.body;
  const existingItems = Object.values(db.items).filter(i => i.category_id === req.params.catId);
  const maxOrder = existingItems.reduce((m, i) => Math.max(m, i.sort_order), -1);
  const id = uuidv4();
  db.items[id] = { id, category_id: req.params.catId, name: name || 'New Item', description: description || '', price: price || 0, tags: tags || [], image_url: '', is_available: 1, sort_order: maxOrder + 1 };
  save(db);
  res.json({ item: db.items[id] });
});

app.put('/api/items/:id', requireAuth, (req, res) => {
  const db = load();
  const item = db.items[req.params.id];
  if (!item) return res.status(404).json({ error: 'Not found' });
  const { name, description, price, tags, is_available, sort_order, image_url } = req.body;
  if (name !== undefined) item.name = name;
  if (description !== undefined) item.description = description;
  if (price !== undefined) item.price = price;
  if (tags !== undefined) item.tags = tags;
  if (is_available !== undefined) item.is_available = is_available;
  if (sort_order !== undefined) item.sort_order = sort_order;
  if (image_url !== undefined) item.image_url = image_url;
  save(db);
  res.json({ success: true });
});

app.delete('/api/items/:id', requireAuth, (req, res) => {
  const db = load();
  delete db.items[req.params.id];
  save(db);
  res.json({ success: true });
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
  const url = `${BASE_URL}/m/${menu.slug}`;
  const qr = await QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: '#000', light: '#fff' } });
  res.json({ qr, url });
});

// ============ PUBLIC MENU ============

app.get('/api/public/menu/:slug', (req, res) => {
  const db = load();
  const menu = Object.values(db.menus).find(m => m.slug === req.params.slug && m.is_active);
  if (!menu) return res.status(404).json({ error: 'Menu not found' });
  const user = db.users[menu.user_id];
  const categories = getMenuCategories(menu.id).filter(c => c.items.length > 0);
  // Filter unavailable items for public view
  categories.forEach(cat => { cat.items = cat.items.filter(i => i.is_available); });
  res.json({ menu: { ...menu, restaurant_name: user?.restaurant_name || '', categories } });
});

// ============ STRIPE ============

app.post('/api/checkout', requireAuth, async (req, res) => {
  if (!stripeClient) return res.status(500).json({ error: 'Stripe not configured' });
  try {
    const { plan } = req.body;
    const db = load();
    const user = db.users[req.session.userId];

    const prices = {
      starter_monthly: { amount: 900, name: 'MenuCraft Starter — Monthly', interval: 'month' },
      starter_yearly: { amount: 7900, name: 'MenuCraft Starter — Yearly', interval: 'year' },
      pro_monthly: { amount: 2900, name: 'MenuCraft Pro — Monthly', interval: 'month' },
      pro_yearly: { amount: 24900, name: 'MenuCraft Pro — Yearly', interval: 'year' },
    };

    const selected = prices[plan];
    if (!selected) return res.status(400).json({ error: 'Invalid plan' });

    const checkoutSession = await stripeClient.checkout.sessions.create({
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
      success_url: `${BASE_URL}/dashboard?upgraded=true`,
      cancel_url: `${BASE_URL}/dashboard?cancelled=true`,
    });

    res.json({ url: checkoutSession.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

app.get('/api/config', (req, res) => {
  res.json({ stripePublishableKey: STRIPE_PK, baseUrl: BASE_URL });
});

// ============ SPA ROUTES ============

app.get('/m/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'menu.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));

app.listen(PORT, () => console.log(`MenuCraft running on port ${PORT}`));
