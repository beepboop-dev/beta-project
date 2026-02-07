// Simple JSON file-based database
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { users: {}, menus: {}, categories: {}, items: {} };
  }
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { load, save };
