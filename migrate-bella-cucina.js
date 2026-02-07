// Migration: Update Bella Cucina demo menu with proper Italian categories and food photography
const { load, save } = require('./db');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const db = load();

// Find the bella cucina menu
const menu = Object.values(db.menus).find(m => m.slug && m.slug.includes('bella-cucina'));
if (!menu) {
  console.log('Bella Cucina menu not found. Skipping migration.');
  process.exit(0);
}

console.log('Found menu:', menu.slug);

// Update menu metadata
menu.description = 'Authentic Italian Cuisine · Est. 2019';
menu.primary_color = '#8B2500';
menu.font = 'Playfair Display';

// Delete old categories and items for this menu
const oldCats = Object.keys(db.categories).filter(k => db.categories[k].menu_id === menu.id);
oldCats.forEach(cid => {
  // Delete items in this category
  Object.keys(db.items).forEach(iid => {
    if (db.items[iid].category_id === cid) delete db.items[iid];
  });
  delete db.categories[cid];
});

// Create new Italian categories
const categories = [
  { name: 'Antipasti', description: 'Traditional Italian starters to begin your meal', sort_order: 0 },
  { name: 'Primi', description: 'First courses — pasta, risotto & soup', sort_order: 1 },
  { name: 'Secondi', description: 'Main courses — meat, fish & poultry', sort_order: 2 },
  { name: 'Dolci', description: 'Sweet endings to a perfect meal', sort_order: 3 },
  { name: 'Beverages', description: 'Wines, cocktails & soft drinks', sort_order: 4 },
];

const catIds = {};
categories.forEach(cat => {
  const id = uuidv4();
  catIds[cat.name] = id;
  db.categories[id] = { id, menu_id: menu.id, ...cat };
});

// Italian menu items with Unsplash food images
const items = [
  // Antipasti
  { category: 'Antipasti', name: 'Bruschetta al Pomodoro', description: 'Crispy ciabatta crowned with vine-ripened San Marzano tomatoes, fresh basil, garlic, and a drizzle of Tuscan extra virgin olive oil', price: 12.00, tags: ['vegetarian', 'vegan'], sort_order: 0, image_url: 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=400&h=400&fit=crop' },
  { category: 'Antipasti', name: 'Burrata e Prosciutto', description: 'Creamy burrata cheese from Puglia draped with aged prosciutto di Parma, arugula, roasted figs, and aged balsamic reduction', price: 18.00, tags: [], sort_order: 1, image_url: 'https://images.unsplash.com/photo-1626200419199-391ae4be7a41?w=400&h=400&fit=crop' },
  { category: 'Antipasti', name: 'Carpaccio di Manzo', description: 'Paper-thin slices of prime beef tenderloin with wild arugula, shaved Parmigiano Reggiano, capers, and truffle oil', price: 16.00, tags: ['gluten-free'], sort_order: 2, image_url: 'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=400&h=400&fit=crop' },
  { category: 'Antipasti', name: 'Calamari Fritti', description: 'Lightly golden-fried tender calamari rings served with zesty marinara and lemon aioli', price: 14.00, tags: [], sort_order: 3, image_url: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=400&fit=crop' },

  // Primi
  { category: 'Primi', name: 'Cacio e Pepe', description: 'Rome\'s legendary pasta — hand-rolled tonnarelli tossed with aged Pecorino Romano and freshly cracked Tellicherry black pepper', price: 19.00, tags: ['vegetarian'], sort_order: 0, image_url: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&h=400&fit=crop' },
  { category: 'Primi', name: 'Pappardelle al Ragù', description: 'Wide ribbons of fresh egg pappardelle slow-braised for 6 hours in a rich Bolognese ragù of veal, pork, and San Marzano tomatoes', price: 24.00, tags: [], sort_order: 1, image_url: 'https://images.unsplash.com/photo-1551892374-ecf8754cf8b0?w=400&h=400&fit=crop' },
  { category: 'Primi', name: 'Risotto ai Funghi Porcini', description: 'Creamy Carnaroli rice slow-stirred with wild porcini mushrooms, aged Parmigiano, white wine, and a whisper of truffle oil', price: 22.00, tags: ['vegetarian', 'gluten-free'], sort_order: 2, image_url: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=400&h=400&fit=crop' },
  { category: 'Primi', name: 'Linguine alle Vongole', description: 'Al dente linguine with fresh littleneck clams, white wine, garlic, chili flakes, and Italian parsley', price: 23.00, tags: [], sort_order: 3, image_url: 'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=400&h=400&fit=crop' },

  // Secondi
  { category: 'Secondi', name: 'Branzino alla Griglia', description: 'Whole Mediterranean sea bass grilled over charcoal, finished with Salmoriglio sauce, capers, and roasted lemon', price: 34.00, tags: ['gluten-free'], sort_order: 0, image_url: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=400&h=400&fit=crop' },
  { category: 'Secondi', name: 'Osso Buco alla Milanese', description: 'Slow-braised veal shank in a rich tomato and vegetable sauce, served with saffron risotto and classic gremolata', price: 38.00, tags: ['gluten-free'], sort_order: 1, image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop' },
  { category: 'Secondi', name: 'Pollo alla Parmigiana', description: 'Golden-crusted free-range chicken breast layered with San Marzano tomato sauce, melted mozzarella di bufala, and fresh basil', price: 26.00, tags: [], sort_order: 2, image_url: 'https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?w=400&h=400&fit=crop' },
  { category: 'Secondi', name: 'Tagliata di Manzo', description: 'Sliced 28-day dry-aged ribeye over a bed of peppery arugula with cherry tomatoes, shaved Parmigiano, and aged balsamic', price: 36.00, tags: ['gluten-free'], sort_order: 3, image_url: 'https://images.unsplash.com/photo-1558030006-450675393462?w=400&h=400&fit=crop' },

  // Dolci
  { category: 'Dolci', name: 'Tiramisù della Casa', description: 'Our signature recipe — layers of espresso-soaked Savoiardi, velvety mascarpone cream, and a dusting of Valrhona cocoa', price: 13.00, tags: ['vegetarian'], sort_order: 0, image_url: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&h=400&fit=crop' },
  { category: 'Dolci', name: 'Panna Cotta ai Frutti di Bosco', description: 'Silky vanilla bean panna cotta with a jewel-toned mixed berry compote and fresh mint', price: 11.00, tags: ['vegetarian', 'gluten-free'], sort_order: 1, image_url: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=400&fit=crop' },
  { category: 'Dolci', name: 'Cannoli Siciliani', description: 'Crispy handmade cannoli shells filled with sweet ricotta, candied orange peel, and dark chocolate chips', price: 10.00, tags: ['vegetarian'], sort_order: 2, image_url: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop' },
  { category: 'Dolci', name: 'Affogato al Caffè', description: 'A scoop of creamy vanilla gelato "drowned" in a shot of hot espresso, finished with amaretti crumble', price: 9.00, tags: ['vegetarian', 'gluten-free'], sort_order: 3, image_url: 'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=400&h=400&fit=crop' },

  // Beverages
  { category: 'Beverages', name: 'Negroni Classico', description: 'The quintessential Italian aperitivo — Tanqueray gin, Campari, and sweet vermouth, stirred and served over a large ice cube with an orange twist', price: 15.00, tags: ['vegan'], sort_order: 0, image_url: 'https://images.unsplash.com/photo-1551751299-1b51cab2694c?w=400&h=400&fit=crop' },
  { category: 'Beverages', name: 'Aperol Spritz', description: 'A refreshing Venetian classic — Aperol, Prosecco, and a splash of soda water, garnished with a fresh orange slice', price: 14.00, tags: ['vegan'], sort_order: 1, image_url: 'https://images.unsplash.com/photo-1560512823-829485b8bf24?w=400&h=400&fit=crop' },
  { category: 'Beverages', name: 'Limonata della Casa', description: 'House-made Amalfi lemon lemonade with sparkling water, fresh mint, and a touch of honey', price: 6.00, tags: ['vegan', 'gluten-free'], sort_order: 2, image_url: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=400&h=400&fit=crop' },
  { category: 'Beverages', name: 'Espresso Doppio', description: 'Double shot of our signature Italian roast espresso — rich, bold, and perfectly pulled', price: 4.50, tags: ['vegan', 'gluten-free'], sort_order: 3, image_url: 'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=400&h=400&fit=crop' },
];

items.forEach(item => {
  const id = uuidv4();
  db.items[id] = {
    id,
    category_id: catIds[item.category],
    name: item.name,
    description: item.description,
    price: item.price,
    tags: item.tags,
    image_url: item.image_url,
    is_available: 1,
    sort_order: item.sort_order,
  };
});

// Also update user's restaurant name
const user = db.users[menu.user_id];
if (user) {
  user.restaurant_name = 'Bella Cucina';
}

save(db);
console.log(`✅ Migration complete! Updated Bella Cucina with ${items.length} items across ${categories.length} categories.`);
