const { load, save } = require('./db');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const uuid = () => crypto.randomUUID();
const db = load();

const demos = [
  {
    email: 'demo-mexican@menucraft.com',
    restaurant: 'La Casa Bonita',
    color: '#C41E3A', bg: '#FFFAF5', font: 'Playfair Display',
    desc: 'Authentic Mexican Cuisine · Family Recipes Since 1998',
    categories: [
      { name: 'Antojitos', desc: 'Street food favorites', items: [
        { name: 'Guacamole & Chips', desc: 'Hand-smashed avocado with fresh lime, cilantro, jalapeño & house-made tortilla chips', price: 11, tags: ['vegan','gluten-free'] },
        { name: 'Elote', desc: 'Grilled Mexican street corn with mayo, cotija cheese, chili powder & lime', price: 7, tags: ['vegetarian','gluten-free'] },
        { name: 'Queso Fundido', desc: 'Melted Oaxacan cheese with chorizo, roasted poblanos & warm flour tortillas', price: 13, tags: ['spicy'] },
        { name: 'Ceviche Tostada', desc: 'Fresh shrimp & fish cured in lime with mango, red onion, avocado on crispy tostada', price: 14, tags: ['gluten-free'] },
      ]},
      { name: 'Tacos', desc: 'Handmade corn tortillas', items: [
        { name: 'Al Pastor', desc: 'Spit-roasted pork with pineapple, onion, cilantro & salsa verde. Two tacos', price: 14, tags: ['spicy'] },
        { name: 'Carnitas', desc: 'Slow-braised pork shoulder with pickled onion, avocado crema & salsa roja. Two tacos', price: 14, tags: [] },
        { name: 'Baja Fish', desc: 'Beer-battered cod with chipotle slaw, lime crema & pico de gallo. Two tacos', price: 15, tags: [] },
        { name: 'Hongos', desc: 'Sautéed wild mushrooms, black beans, queso fresco, salsa macha. Two tacos', price: 13, tags: ['vegetarian'] },
      ]},
      { name: 'Platos Fuertes', desc: 'Main courses', items: [
        { name: 'Mole Poblano', desc: 'Chicken thigh in rich chocolate-chili mole with 28 ingredients, served with rice & beans', price: 22, tags: ['gluten-free'] },
        { name: 'Carne Asada', desc: '12oz grilled skirt steak with chimichurri, charred spring onions, rice & beans', price: 28, tags: ['gluten-free'] },
        { name: 'Enchiladas Suizas', desc: 'Three chicken enchiladas in creamy tomatillo sauce, topped with crema & queso', price: 18, tags: [] },
      ]},
      { name: 'Postres', desc: 'Sweet endings', items: [
        { name: 'Churros', desc: 'Crispy cinnamon-sugar churros with chocolate & cajeta dipping sauces', price: 9, tags: ['vegetarian'] },
        { name: 'Tres Leches', desc: 'Three-milk soaked cake with whipped cream & fresh strawberries', price: 10, tags: ['vegetarian'] },
      ]},
      { name: 'Bebidas', desc: 'Drinks & cocktails', items: [
        { name: 'Margarita Clásica', desc: 'Tequila blanco, fresh lime, agave, Cointreau. Salt rim optional', price: 13, tags: [] },
        { name: 'Horchata', desc: 'House-made cinnamon rice milk, served ice cold', price: 5, tags: ['vegan','gluten-free'] },
        { name: 'Jamaica', desc: 'Hibiscus flower iced tea, lightly sweetened', price: 4, tags: ['vegan','gluten-free'] },
      ]},
    ]
  },
  {
    email: 'demo-sushi@menucraft.com',
    restaurant: 'Sakura Omakase',
    color: '#1a1a2e', bg: '#fafafa', font: 'Playfair Display',
    desc: 'Premium Japanese Cuisine · Omakase & Sushi Bar',
    categories: [
      { name: 'Starters', desc: 'Light bites to begin', items: [
        { name: 'Edamame', desc: 'Steamed soybeans with Maldon sea salt', price: 6, tags: ['vegan','gluten-free'] },
        { name: 'Miso Soup', desc: 'Dashi broth with silken tofu, wakame & scallion', price: 5, tags: ['vegetarian'] },
        { name: 'Tuna Tataki', desc: 'Seared bluefin tuna with ponzu, micro greens & crispy garlic chips', price: 18, tags: ['gluten-free'] },
        { name: 'Gyoza', desc: 'Pan-fried pork & shrimp dumplings with yuzu dipping sauce', price: 12, tags: [] },
      ]},
      { name: 'Nigiri', desc: "Two pieces per order · Chef's selection", items: [
        { name: 'Salmon', desc: 'Norwegian king salmon, lightly torched with yuzu zest', price: 8, tags: ['gluten-free'] },
        { name: 'Toro', desc: 'Bluefin tuna belly — the most prized cut. Melt-in-your-mouth', price: 16, tags: ['gluten-free'] },
        { name: 'Hamachi', desc: 'Japanese yellowtail with jalapeño & truffle oil', price: 10, tags: ['gluten-free'] },
        { name: 'Unagi', desc: 'Freshwater eel glazed with house tare sauce', price: 12, tags: [] },
        { name: 'A5 Wagyu', desc: 'Torched Japanese A5 wagyu beef with sea salt & wasabi', price: 22, tags: ['gluten-free'] },
      ]},
      { name: 'Signature Rolls', desc: 'Creative maki rolls', items: [
        { name: 'Dragon Roll', desc: 'Shrimp tempura, avocado, unagi, eel sauce & tobiko. 8 pcs', price: 19, tags: [] },
        { name: 'Sakura Roll', desc: 'Toro, wagyu, truffle oil, gold leaf. Our signature creation. 6 pcs', price: 28, tags: [] },
        { name: 'Spicy Tuna Crispy Rice', desc: 'Hand-cut spicy tuna on crispy sushi rice with sriracha mayo. 4 pcs', price: 16, tags: ['spicy'] },
        { name: 'Rainbow Roll', desc: 'California roll topped with assorted sashimi & avocado. 8 pcs', price: 22, tags: [] },
      ]},
      { name: 'Desserts', desc: 'Japanese-inspired sweets', items: [
        { name: 'Matcha Tiramisu', desc: 'Uji matcha cream with mascarpone & ladyfingers', price: 12, tags: ['vegetarian'] },
        { name: 'Mochi Ice Cream', desc: 'Assortment of 3: black sesame, yuzu, strawberry', price: 9, tags: ['vegetarian','gluten-free'] },
      ]},
    ]
  },
  {
    email: 'demo-cafe@menucraft.com',
    restaurant: 'Morning Light Café',
    color: '#5D4037', bg: '#FFF8F0', font: 'Playfair Display',
    desc: 'Specialty Coffee & All-Day Brunch · Locally Sourced',
    categories: [
      { name: 'Coffee & Espresso', desc: 'Single-origin beans, roasted locally', items: [
        { name: 'Espresso', desc: 'Double shot of our house blend — notes of chocolate, cherry & caramel', price: 4, tags: ['vegan'] },
        { name: 'Oat Milk Latte', desc: 'Double espresso with steamed Oatly barista. Our most popular drink', price: 6, tags: ['vegan'] },
        { name: 'Pour Over', desc: "Single-origin, hand-poured. Ask about today's selection", price: 6, tags: ['vegan','gluten-free'] },
        { name: 'Matcha Latte', desc: 'Ceremonial-grade Uji matcha whisked with your choice of milk', price: 6.5, tags: ['vegetarian'] },
        { name: 'Cold Brew', desc: '18-hour steep, smooth & rich. Served over ice', price: 5.5, tags: ['vegan','gluten-free'] },
      ]},
      { name: 'Brunch', desc: 'Served all day', items: [
        { name: 'Avocado Toast', desc: 'Sourdough, smashed avo, everything seasoning, poached eggs, microgreens & chili flakes', price: 14, tags: ['vegetarian'] },
        { name: 'Açaí Bowl', desc: 'Organic açaí blended with banana, topped with granola, berries, coconut & honey', price: 15, tags: ['vegetarian','gluten-free'] },
        { name: 'Eggs Benedict', desc: 'Poached eggs, Canadian bacon, hollandaise on English muffin with roasted potatoes', price: 16, tags: [] },
        { name: 'Buttermilk Pancakes', desc: 'Fluffy stack of 3 with maple syrup, whipped butter & fresh berries', price: 14, tags: ['vegetarian'] },
        { name: 'Smoked Salmon Bagel', desc: 'House-cured salmon, cream cheese, capers, red onion, dill on everything bagel', price: 16, tags: [] },
      ]},
      { name: 'Pastries', desc: 'Baked fresh daily', items: [
        { name: 'Croissant', desc: 'Classic French butter croissant — 48-hour laminated dough', price: 4.5, tags: ['vegetarian'] },
        { name: 'Banana Bread', desc: 'House-made with walnuts & chocolate chips. Served warm', price: 5, tags: ['vegetarian'] },
        { name: 'Cinnamon Roll', desc: 'Sticky, gooey, ridiculous. Cream cheese glaze', price: 6, tags: ['vegetarian'] },
      ]},
      { name: 'Fresh Juice', desc: 'Cold-pressed daily', items: [
        { name: 'Green Machine', desc: 'Kale, apple, ginger, lemon, cucumber', price: 8, tags: ['vegan','gluten-free'] },
        { name: 'Orange Sunrise', desc: 'Orange, carrot, turmeric, ginger', price: 8, tags: ['vegan','gluten-free'] },
      ]},
    ]
  }
];

demos.forEach(d => {
  const userId = uuid();
  const slug = d.restaurant.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0,30) + '-' + userId.slice(0,6);
  
  db.users[userId] = { id: userId, email: d.email, password_hash: bcrypt.hashSync('demo123', 10), restaurant_name: d.restaurant, plan: 'pro', hours: '', location: '', phone: '', created_at: new Date().toISOString() };
  
  const menuId = uuid();
  db.menus[menuId] = { id: menuId, user_id: userId, name: 'Main Menu', slug, description: d.desc, logo_url: '', primary_color: d.color, bg_color: d.bg, font: d.font, is_active: 1, created_at: new Date().toISOString() };
  
  d.categories.forEach((cat, ci) => {
    const catId = uuid();
    db.categories[catId] = { id: catId, menu_id: menuId, name: cat.name, description: cat.desc, sort_order: ci };
    cat.items.forEach((item, ii) => {
      const itemId = uuid();
      db.items[itemId] = { id: itemId, category_id: catId, name: item.name, description: item.desc, price: item.price, tags: item.tags, image_url: '', is_available: 1, is_featured: ii === 0 ? 1 : 0, sort_order: ii };
    });
  });
  
  console.log(d.restaurant + ': /m/' + slug);
});

save(db);
console.log('Done! 3 demo menus created.');
