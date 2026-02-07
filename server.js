const express = require('express');
const Database = require('better-sqlite3');
const stripe = require('stripe');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const session = require('cookie-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3002;
const BASE_URL = process.env.BASE_URL || 'https://beta.abapture.ai';
const STRIPE_SK = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PK = process.env.STRIPE_PUBLISHABLE_KEY || '';
const stripeClient = stripe(STRIPE_SK);

// Ensure uploads dir
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

// Database
const db = new Database(path.join(__dirname, 'menucraft.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    restaurant_name TEXT DEFAULT '',
    plan TEXT DEFAULT 'free',
    stripe_customer_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS menus (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT DEFAULT 'Main Menu',
    slug TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    logo_url TEXT DEFAULT '',
    primary_color TEXT DEFAULT '#E85D2C',
    bg_color TEXT DEFAULT '#FFFBF7',
    font TEXT DEFAULT 'Inter',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    menu_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE
  );
  
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    image_url TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    is_available INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );
`);

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

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// ============ AUTH ROUTES ============

app.post('/api/auth/signup', (req, res) => {
  try {
    const { email, password, restaurantName } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    
    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash, restaurant_name) VALUES (?, ?, ?, ?)').run(id, email, hash, restaurantName || '');
    
    // Create default menu
    const menuId = uuidv4();
    const slug = (restaurantName || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + id.slice(0, 6);
    db.prepare('INSERT INTO menus (id, user_id, slug, name) VALUES (?, ?, ?, ?)').run(menuId, id, slug, 'Main Menu');
    
    // Create sample categories and items
    const catId1 = uuidv4();
    const catId2 = uuidv4();
    const catId3 = uuidv4();
    db.prepare('INSERT INTO categories (id, menu_id, name, description, sort_order) VALUES (?, ?, ?, ?, ?)').run(catId1, menuId, 'Starters', 'Begin your meal right', 0);
    db.prepare('INSERT INTO categories (id, menu_id, name, description, sort_order) VALUES (?, ?, ?, ?, ?)').run(catId2, menuId, 'Mains', 'Our signature dishes', 1);
    db.prepare('INSERT INTO categories (id, menu_id, name, description, sort_order) VALUES (?, ?, ?, ?, ?)').run(catId3, menuId, 'Desserts', 'Sweet endings', 2);
    
    const sampleItems = [
      [catId1, 'Bruschetta', 'Toasted bread with fresh tomatoes, basil & olive oil', 8.50, '["vegetarian"]'],
      [catId1, 'Soup of the Day', 'Ask your server for today\'s selection', 7.00, '["gluten-free"]'],
      [catId2, 'Grilled Salmon', 'Atlantic salmon with lemon butter sauce & seasonal vegetables', 24.00, '["gluten-free"]'],
      [catId2, 'Mushroom Risotto', 'Creamy arborio rice with wild mushrooms & parmesan', 18.00, '["vegetarian"]'],
      [catId3, 'Tiramisu', 'Classic Italian coffee-flavored dessert', 10.00, '[]'],
      [catId3, 'Chocolate Lava Cake', 'Warm chocolate cake with a molten center', 12.00, '["vegetarian"]'],
    ];
    const insertItem = db.prepare('INSERT INTO items (id, category_id, name, description, price, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
    sampleItems.forEach(([catId, name, desc, price, tags], i) => {
      insertItem.run(uuidv4(), catId, name, desc, price, tags, i % 2);
    });
    
    req.session.userId = id;
    res.json({ success: true, user: { id, email, restaurantName } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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
  const user = db.prepare('SELECT id, email, restaurant_name, plan, created_at FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: { ...user, restaurantName: user.restaurant_name } });
});

// ============ MENU ROUTES ============

app.get('/api/menus', requireAuth, (req, res) => {
  const menus = db.prepare('SELECT * FROM menus WHERE user_id = ?').all(req.session.userId);
  res.json({ menus });
});

app.put('/api/menus/:id', requireAuth, (req, res) => {
  const menu = db.prepare('SELECT * FROM menus WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!menu) return res.status(404).json({ error: 'Menu not found' });
  
  const { name, description, primary_color, bg_color, font } = req.body;
  db.prepare('UPDATE menus SET name = COALESCE(?, name), description = COALESCE(?, description), primary_color = COALESCE(?, primary_color), bg_color = COALESCE(?, bg_color), font = COALESCE(?, font) WHERE id = ?')
    .run(name, description, primary_color, bg_color, font, req.params.id);
  
  const updated = db.prepare('SELECT * FROM menus WHERE id = ?').get(req.params.id);
  res.json({ menu: updated });
});

// ============ CATEGORY ROUTES ============

app.get('/api/menus/:menuId/categories', requireAuth, (req, res) => {
  const menu = db.prepare('SELECT * FROM menus WHERE id = ? AND user_id = ?').get(req.params.menuId, req.session.userId);
  if (!menu) return res.status(404).json({ error: 'Menu not found' });
  
  const categories = db.prepare('SELECT * FROM categories WHERE menu_id = ? ORDER BY sort_order').all(req.params.menuId);
  for (const cat of categories) {
    cat.items = db.prepare('SELECT * FROM items WHERE category_id = ? ORDER BY sort_order').all(cat.id);
    cat.items.forEach(item => { try { item.tags = JSON.parse(item.tags); } catch { item.tags = []; } });
  }
  res.json({ categories });
});

app.post('/api/menus/:menuId/categories', requireAuth, (req, res) => {
  const menu = db.prepare('SELECT * FROM menus WHERE id = ? AND user_id = ?').get(req.params.menuId, req.session.userId);
  if (!menu) return res.status(404).json({ error: 'Menu not found' });
  
  const { name, description } = req.body;
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM categories WHERE menu_id = ?').get(req.params.menuId);
  const id = uuidv4();
  db.prepare('INSERT INTO categories (id, menu_id, name, description, sort_order) VALUES (?, ?, ?, ?, ?)').run(id, req.params.menuId, name || 'New Category', description || '', (maxOrder?.m ?? -1) + 1);
  
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  cat.items = [];
  res.json({ category: cat });
});

app.put('/api/categories/:id', requireAuth, (req, res) => {
  const { name, description, sort_order } = req.body;
  db.prepare('UPDATE categories SET name = COALESCE(?, name), description = COALESCE(?, description), sort_order = COALESCE(?, sort_order) WHERE id = ?')
    .run(name, description, sort_order, req.params.id);
  res.json({ success: true });
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ ITEM ROUTES ============

app.post('/api/categories/:catId/items', requireAuth, (req, res) => {
  const { name, description, price, tags } = req.body;
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM items WHERE category_id = ?').get(req.params.catId);
  const id = uuidv4();
  db.prepare('INSERT INTO items (id, category_id, name, description, price, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.params.catId, name || 'New Item', description || '', price || 0, JSON.stringify(tags || []), (maxOrder?.m ?? -1) + 1);
  
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  try { item.tags = JSON.parse(item.tags); } catch { item.tags = []; }
  res.json({ item });
});

app.put('/api/items/:id', requireAuth, (req, res) => {
  const { name, description, price, tags, is_available, sort_order, image_url } = req.body;
  db.prepare(`UPDATE items SET 
    name = COALESCE(?, name), 
    description = COALESCE(?, description), 
    price = COALESCE(?, price), 
    tags = COALESCE(?, tags),
    is_available = COALESCE(?, is_available),
    sort_order = COALESCE(?, sort_order),
    image_url = COALESCE(?, image_url)
    WHERE id = ?`)
    .run(name, description, price, tags ? JSON.stringify(tags) : null, is_available, sort_order, image_url, req.params.id);
  res.json({ success: true });
});

app.delete('/api/items/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ IMAGE UPLOAD ============

app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = path.extname(req.file.originalname) || '.jpg';
  const newName = req.file.filename + ext;
  fs.renameSync(req.file.path, path.join(uploadsDir, newName));
  res.json({ url: `/uploads/${newName}` });
});

// ============ QR CODE ============

app.get('/api/menus/:id/qr', requireAuth, async (req, res) => {
  const menu = db.prepare('SELECT * FROM menus WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!menu) return res.status(404).json({ error: 'Menu not found' });
  
  const url = `${BASE_URL}/m/${menu.slug}`;
  const qr = await QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: '#000', light: '#fff' } });
  res.json({ qr, url });
});

// ============ PUBLIC MENU (customer-facing) ============

app.get('/api/public/menu/:slug', (req, res) => {
  const menu = db.prepare('SELECT m.*, u.restaurant_name FROM menus m JOIN users u ON m.user_id = u.id WHERE m.slug = ? AND m.is_active = 1').get(req.params.slug);
  if (!menu) return res.status(404).json({ error: 'Menu not found' });
  
  const categories = db.prepare('SELECT * FROM categories WHERE menu_id = ? ORDER BY sort_order').all(menu.id);
  for (const cat of categories) {
    cat.items = db.prepare('SELECT * FROM items WHERE category_id = ? AND is_available = 1 ORDER BY sort_order').all(cat.id);
    cat.items.forEach(item => { try { item.tags = JSON.parse(item.tags); } catch { item.tags = []; } });
  }
  
  res.json({ menu: { ...menu, categories } });
});

// ============ STRIPE ============

app.post('/api/checkout', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    
    const prices = {
      starter_monthly: { amount: 900, name: 'MenuCraft Starter — Monthly', interval: 'month' },
      starter_yearly: { amount: 7900, name: 'MenuCraft Starter — Yearly', interval: 'year' },
      pro_monthly: { amount: 2900, name: 'MenuCraft Pro — Monthly', interval: 'month' },
      pro_yearly: { amount: 24900, name: 'MenuCraft Pro — Yearly', interval: 'year' },
    };
    
    const selected = prices[plan];
    if (!selected) return res.status(400).json({ error: 'Invalid plan' });
    
    const session = await stripeClient.checkout.sessions.create({
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
    
    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ============ STRIPE CONFIG (for frontend) ============

app.get('/api/config', (req, res) => {
  res.json({ stripePublishableKey: STRIPE_PK, baseUrl: BASE_URL });
});

// ============ SPA ROUTES ============

app.get('/m/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

app.get('/dashboard{/*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

app.listen(PORT, () => {
  console.log(`MenuCraft running on port ${PORT}`);
});
