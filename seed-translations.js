// Seed Bella Cucina menu with Italian (original) and English translations
const { load, save } = require('./db');

const db = load();
const menu = Object.values(db.menus).find(m => m.slug && m.slug.includes('bella-cucina'));
if (!menu) { console.log('Bella Cucina menu not found'); process.exit(1); }

// Get all categories and items for this menu
const cats = Object.values(db.categories).filter(c => c.menu_id === menu.id);
const items = [];
cats.forEach(c => {
  Object.values(db.items).filter(i => i.category_id === c.id).forEach(i => items.push(i));
});

// Build translation map by item/category name
const enTranslations = {};
const itTranslations = {};

// Category translations
const catMap = {
  'Antipasti': { en: { name: 'Appetizers', description: 'Traditional Italian starters to begin your meal' }, it: { name: 'Antipasti', description: 'Antipasti tradizionali italiani per iniziare il pasto' } },
  'Primi': { en: { name: 'First Courses', description: 'Handmade pasta and risotto' }, it: { name: 'Primi Piatti', description: 'Pasta fatta a mano e risotti' } },
  'Secondi': { en: { name: 'Main Courses', description: 'Premium meats and seafood' }, it: { name: 'Secondi Piatti', description: 'Carni pregiate e frutti di mare' } },
  'Dolci': { en: { name: 'Desserts', description: 'Sweet Italian endings' }, it: { name: 'Dolci', description: 'Dolci finali italiani' } },
  'Beverages': { en: { name: 'Beverages', description: 'Cocktails, coffee & refreshments' }, it: { name: 'Bevande', description: 'Cocktail, caffè e bevande' } },
};

const itemMap = {
  'Bruschetta al Pomodoro': { en: { name: 'Tomato Bruschetta', description: 'Crispy ciabatta topped with vine-ripened San Marzano tomatoes, fresh basil, garlic, and a drizzle of Tuscan extra virgin olive oil' }, it: { name: 'Bruschetta al Pomodoro', description: 'Ciabatta croccante con pomodori San Marzano maturi, basilico fresco, aglio e un filo di olio extravergine toscano' } },
  'Burrata e Prosciutto': { en: { name: 'Burrata & Prosciutto', description: 'Creamy burrata cheese from Puglia with aged Parma prosciutto, arugula, roasted figs, and aged balsamic reduction' }, it: { name: 'Burrata e Prosciutto', description: 'Cremosa burrata pugliese con prosciutto di Parma stagionato, rucola, fichi arrostiti e riduzione di aceto balsamico' } },
  'Carpaccio di Manzo': { en: { name: 'Beef Carpaccio', description: 'Paper-thin slices of prime beef tenderloin with wild arugula, shaved Parmigiano Reggiano, capers, and truffle oil' }, it: { name: 'Carpaccio di Manzo', description: 'Fettine sottilissime di filetto di manzo con rucola selvatica, scaglie di Parmigiano Reggiano, capperi e olio al tartufo' } },
  'Calamari Fritti': { en: { name: 'Fried Calamari', description: 'Lightly golden-fried tender calamari rings with zesty marinara and lemon aioli' }, it: { name: 'Calamari Fritti', description: 'Anelli di calamaro teneri fritti dorati con marinara piccante e aioli al limone' } },
  'Cacio e Pepe': { en: { name: 'Cacio e Pepe', description: 'Roman-style tonnarelli pasta with Pecorino Romano cream and cracked black pepper' }, it: { name: 'Cacio e Pepe', description: 'Tonnarelli alla romana con crema di Pecorino Romano e pepe nero macinato' } },
  'Pappardelle al Ragù': { en: { name: 'Pappardelle with Ragù', description: 'Wide ribbon pasta with slow-braised Tuscan beef and pork ragù' }, it: { name: 'Pappardelle al Ragù', description: 'Pappardelle con ragù toscano di manzo e maiale brasato lentamente' } },
  'Risotto ai Funghi Porcini': { en: { name: 'Porcini Mushroom Risotto', description: 'Creamy arborio rice with wild porcini mushrooms, white wine, and Parmigiano' }, it: { name: 'Risotto ai Funghi Porcini', description: 'Riso arborio cremoso con funghi porcini selvatici, vino bianco e Parmigiano' } },
  'Linguine alle Vongole': { en: { name: 'Linguine with Clams', description: 'Linguine with fresh Manila clams, white wine, garlic, and parsley' }, it: { name: 'Linguine alle Vongole', description: 'Linguine con vongole veraci, vino bianco, aglio e prezzemolo' } },
  'Branzino alla Griglia': { en: { name: 'Grilled Sea Bass', description: 'Whole Mediterranean sea bass grilled with herbs, lemon, and olive oil' }, it: { name: 'Branzino alla Griglia', description: 'Branzino mediterraneo alla griglia con erbe aromatiche, limone e olio d\'oliva' } },
  'Osso Buco alla Milanese': { en: { name: 'Osso Buco Milanese', description: 'Slow-braised veal shank with saffron risotto and gremolata' }, it: { name: 'Osso Buco alla Milanese', description: 'Stinco di vitello brasato con risotto allo zafferano e gremolata' } },
  'Pollo alla Parmigiana': { en: { name: 'Chicken Parmigiana', description: 'Breaded chicken cutlet with San Marzano tomato sauce and melted mozzarella' }, it: { name: 'Pollo alla Parmigiana', description: 'Cotoletta di pollo impanata con salsa di pomodoro San Marzano e mozzarella fusa' } },
  'Tagliata di Manzo': { en: { name: 'Sliced Beef Steak', description: 'Grilled prime ribeye sliced over arugula with cherry tomatoes and aged balsamic' }, it: { name: 'Tagliata di Manzo', description: 'Ribeye alla griglia tagliato su rucola con pomodorini e aceto balsamico invecchiato' } },
  'Tiramisù della Casa': { en: { name: 'House Tiramisù', description: 'Classic layered espresso-soaked ladyfingers with mascarpone cream' }, it: { name: 'Tiramisù della Casa', description: 'Classici savoiardi inzuppati al caffè con crema al mascarpone' } },
  'Panna Cotta ai Frutti di Bosco': { en: { name: 'Berry Panna Cotta', description: 'Silky vanilla panna cotta with mixed berry coulis' }, it: { name: 'Panna Cotta ai Frutti di Bosco', description: 'Panna cotta alla vaniglia con coulis di frutti di bosco' } },
  'Cannoli Siciliani': { en: { name: 'Sicilian Cannoli', description: 'Crispy shells filled with sweet ricotta, chocolate chips, and pistachios' }, it: { name: 'Cannoli Siciliani', description: 'Cialde croccanti ripiene di ricotta dolce, gocce di cioccolato e pistacchi' } },
  'Affogato al Caffè': { en: { name: 'Espresso Affogato', description: 'Vanilla gelato drowned in a shot of hot espresso' }, it: { name: 'Affogato al Caffè', description: 'Gelato alla vaniglia annegato in un doppio espresso caldo' } },
  'Negroni Classico': { en: { name: 'Classic Negroni', description: 'Gin, Campari, and sweet vermouth — stirred and served over ice with orange peel' }, it: { name: 'Negroni Classico', description: 'Gin, Campari e vermouth dolce — mescolato e servito con ghiaccio e scorza d\'arancia' } },
  'Aperol Spritz': { en: { name: 'Aperol Spritz', description: 'Aperol, prosecco, and a splash of soda — the iconic Italian aperitivo' }, it: { name: 'Aperol Spritz', description: 'Aperol, prosecco e un goccio di soda — l\'iconico aperitivo italiano' } },
  'Limonata della Casa': { en: { name: 'House Lemonade', description: 'Fresh-squeezed Amalfi lemon juice with sparkling water and mint' }, it: { name: 'Limonata della Casa', description: 'Succo di limone di Amalfi spremuto fresco con acqua frizzante e menta' } },
  'Espresso Doppio': { en: { name: 'Double Espresso', description: 'Rich double shot of our custom Italian roast blend' }, it: { name: 'Espresso Doppio', description: 'Doppio espresso della nostra miscela italiana artigianale' } },
};

// Build translations by ID
cats.forEach(cat => {
  const mapping = catMap[cat.name];
  if (mapping) {
    enTranslations[cat.id] = mapping.en;
    itTranslations[cat.id] = mapping.it;
  }
});

items.forEach(item => {
  const mapping = itemMap[item.name];
  if (mapping) {
    enTranslations[item.id] = mapping.en;
    itTranslations[item.id] = mapping.it;
  }
});

menu.languages = ['en', 'it'];
menu.translations = { en: enTranslations, it: itTranslations };
menu.order_config = { enabled: true, type: 'phone', value: '+1-555-BELLA-01' };

save(db);
console.log(`✅ Seeded translations for ${Object.keys(enTranslations).length} items/categories`);
console.log('Languages:', menu.languages);
console.log('Order config:', menu.order_config);
