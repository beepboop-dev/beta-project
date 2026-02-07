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
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

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
  if (!req.session.userId && !req.session.demoId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// For demo sessions, userId is the demoId
function getUserId(req) {
  return req.session.userId || req.session.demoId;
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

    // If there's a demo session, adopt the demo data
    if (req.session.demoId) {
      const demoId = req.session.demoId;
      // Transfer menus from demo user to real user
      Object.values(db.menus).forEach(m => {
        if (m.user_id === demoId) {
          m.user_id = id;
          // Update slug with restaurant name
          if (restaurantName) {
            m.slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + id.slice(0, 6);
          }
        }
      });
      delete db.users[demoId];
      req.session.demoId = null;
    } else {
      // Default menu with sample data
      const menuId = uuidv4();
      const slug = (restaurantName || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + id.slice(0, 6);
      db.menus[menuId] = { id: menuId, user_id: id, name: 'Main Menu', slug, description: '', logo_url: '', primary_color: '#E85D2C', bg_color: '#FFFBF7', font: 'Inter', is_active: 1, created_at: new Date().toISOString() };

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
  req.session.demoId = null;
  res.json({ success: true, user: { id: user.id, email: user.email, restaurantName: user.restaurant_name, plan: user.plan } });
});

app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const db = load();
  const uid = getUserId(req);
  const user = db.users[uid];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: { id: user.id, email: user.email, restaurantName: user.restaurant_name, plan: user.plan, created_at: user.created_at, isDemo: !!req.session.demoId } });
});

// ============ DEMO MODE ============

app.post('/api/demo/start', (req, res) => {
  try {
    const db = load();
    const id = 'demo-' + uuidv4();
    const restaurantName = req.body.restaurantName || 'My Restaurant';
    db.users[id] = { id, email: '', password_hash: '', restaurant_name: restaurantName, plan: 'demo', created_at: new Date().toISOString() };

    const menuId = uuidv4();
    const slug = 'demo-' + restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) + '-' + id.slice(5, 11);
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
      { category_id: catIds[0], name: 'Bruschetta', description: 'Crispy ciabatta topped with vine-ripened tomatoes, fresh basil, garlic & extra virgin olive oil', price: 8.50, tags: ['vegetarian'], sort_order: 0 },
      { category_id: catIds[0], name: 'Soup of the Day', description: "Chef's daily creation — ask your server for today's selection", price: 7.00, tags: ['gluten-free'], sort_order: 1 },
      { category_id: catIds[1], name: 'Grilled Salmon', description: 'Wild-caught Atlantic salmon, pan-seared with lemon butter sauce, served with roasted seasonal vegetables', price: 24.00, tags: ['gluten-free'], sort_order: 0 },
      { category_id: catIds[1], name: 'Mushroom Risotto', description: 'Creamy arborio rice slow-cooked with wild porcini mushrooms, aged parmesan & truffle oil', price: 18.00, tags: ['vegetarian'], sort_order: 1 },
      { category_id: catIds[2], name: 'Tiramisu', description: 'Classic Italian dessert layered with espresso-soaked ladyfingers, mascarpone cream & cocoa', price: 10.00, tags: [], sort_order: 0 },
      { category_id: catIds[2], name: 'Chocolate Lava Cake', description: 'Warm dark chocolate cake with a molten center, served with vanilla gelato', price: 12.00, tags: ['vegetarian'], sort_order: 1 },
    ];
    for (const item of sampleItems) {
      const iid = uuidv4();
      db.items[iid] = { id: iid, ...item, image_url: '', is_available: 1 };
    }

    save(db);
    req.session.demoId = id;
    req.session.userId = null;
    res.json({ success: true, isDemo: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ AI DESCRIPTION GENERATOR ============

app.post('/api/ai/describe', requireAuth, async (req, res) => {
  const { itemName, cuisine } = req.body;
  if (!itemName) return res.status(400).json({ error: 'Item name required' });

  // Use Claude API if available, otherwise use built-in templates
  if (ANTHROPIC_KEY) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 150,
          messages: [{
            role: 'user',
            content: `Write a mouth-watering, appetizing menu description for "${itemName}"${cuisine ? ` (${cuisine} cuisine)` : ''}. Keep it to 1-2 sentences, under 30 words. Be vivid and specific about flavors and textures. No quotes around it.`
          }]
        })
      });
      const data = await response.json();
      const description = data.content?.[0]?.text?.trim() || generateFallbackDescription(itemName);
      return res.json({ description });
    } catch (e) {
      console.error('AI API error:', e);
    }
  }

  // Fallback: smart template-based descriptions
  res.json({ description: generateFallbackDescription(itemName) });
});

function generateFallbackDescription(itemName) {
  const name = itemName.toLowerCase();
  const templates = {
    salmon: 'Wild-caught and perfectly seared, served with a silky lemon butter sauce and seasonal roasted vegetables',
    steak: 'Prime-cut, flame-grilled to your preference, finished with herb butter and served with truffle fries',
    chicken: 'Free-range and tender, herb-marinated and roasted to golden perfection with aromatic pan juices',
    pasta: 'House-made pasta tossed in a rich, slow-simmered sauce with fresh herbs and aged parmesan',
    pizza: 'Wood-fired with a crispy, blistered crust, topped with San Marzano tomatoes and fresh mozzarella',
    salad: 'Crisp seasonal greens with vibrant garden vegetables, tossed in our signature house vinaigrette',
    burger: 'Juicy hand-formed patty on a toasted brioche bun with aged cheddar, caramelized onions & special sauce',
    risotto: 'Creamy arborio rice slowly stirred to perfection with rich stock, finished with butter and parmesan',
    soup: "Chef's daily creation, simmered with care using the freshest seasonal ingredients",
    cake: 'Decadent layers of rich, moist cake with a velvety smooth frosting that melts on the tongue',
    ice: 'Artisanal small-batch creation churned to silky perfection with premium ingredients',
    fish: 'Fresh catch of the day, delicately prepared with bright citrus notes and fragrant herbs',
    shrimp: 'Plump, succulent shrimp sautéed in garlic butter with a touch of white wine and fresh herbs',
    tacos: 'Handmade corn tortillas filled with perfectly seasoned fillings, fresh salsa & creamy avocado',
    wine: 'Carefully selected by our sommelier to complement the flavors of your meal',
    bruschetta: 'Crispy ciabatta crowned with vine-ripened tomatoes, fresh basil, garlic & extra virgin olive oil',
    tiramisu: 'Layers of espresso-soaked ladyfingers and velvety mascarpone cream dusted with rich cocoa',
    chocolate: 'Rich, indulgent dark chocolate with a velvety texture that melts beautifully on the palate',
    mushroom: 'Earthy wild mushrooms with deep umami flavors, herbs and a touch of cream',
  };

  for (const [key, desc] of Object.entries(templates)) {
    if (name.includes(key)) return desc;
  }

  // Generic fallback
  const generics = [
    `Crafted with the finest ingredients, expertly prepared and beautifully presented`,
    `A house favorite — carefully prepared with premium ingredients and bold, satisfying flavors`,
    `Chef's signature preparation using the freshest seasonal ingredients, bursting with flavor`,
  ];
  return generics[Math.floor(Math.random() * generics.length)];
}

// ============ MENUS ============

app.get('/api/menus', requireAuth, (req, res) => {
  const db = load();
  const uid = getUserId(req);
  const menus = Object.values(db.menus).filter(m => m.user_id === uid);
  res.json({ menus });
});

app.put('/api/menus/:id', requireAuth, (req, res) => {
  const db = load();
  const menu = db.menus[req.params.id];
  const uid = getUserId(req);
  if (!menu || menu.user_id !== uid) return res.status(404).json({ error: 'Menu not found' });

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
  const uid = getUserId(req);
  if (!menu || menu.user_id !== uid) return res.status(404).json({ error: 'Menu not found' });
  res.json({ categories: getMenuCategories(req.params.menuId) });
});

app.post('/api/menus/:menuId/categories', requireAuth, (req, res) => {
  const db = load();
  const menu = db.menus[req.params.menuId];
  const uid = getUserId(req);
  if (!menu || menu.user_id !== uid) return res.status(404).json({ error: 'Menu not found' });

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

// ============ ITEMS ============

app.post('/api/categories/:catId/items', requireAuth, (req, res) => {
  const db = load();
  const { name, description, price, tags, image_url } = req.body;
  const existingItems = Object.values(db.items).filter(i => i.category_id === req.params.catId);
  const maxOrder = existingItems.reduce((m, i) => Math.max(m, i.sort_order), -1);
  const id = uuidv4();
  db.items[id] = { id, category_id: req.params.catId, name: name || 'New Item', description: description || '', price: price || 0, tags: tags || [], image_url: image_url || '', is_available: 1, sort_order: maxOrder + 1 };
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
  const uid = getUserId(req);
  if (!menu || menu.user_id !== uid) return res.status(404).json({ error: 'Menu not found' });
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
  categories.forEach(cat => { cat.items = cat.items.filter(i => i.is_available); });
  res.json({ menu: { ...menu, restaurant_name: user?.restaurant_name || '', categories } });
});

// ============ STRIPE ============

app.post('/api/checkout', requireAuth, async (req, res) => {
  if (!stripeClient) return res.status(500).json({ error: 'Stripe not configured' });
  try {
    const { plan } = req.body;
    const db = load();
    const uid = getUserId(req);
    const user = db.users[uid];

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
      customer_email: user.email || undefined,
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
app.get('/try', (req, res) => res.sendFile(path.join(__dirname, 'public', 'try.html')));

app.listen(PORT, () => console.log(`MenuCraft running on port ${PORT}`));
