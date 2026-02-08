// Analytics storage using better-sqlite3
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'analytics.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        menu_id TEXT,
        item_id TEXT,
        category_id TEXT,
        user_id TEXT,
        slug TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        user_agent TEXT,
        referrer TEXT,
        is_mobile INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_events_menu ON analytics_events(menu_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON analytics_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_ts ON analytics_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_user ON analytics_events(user_id);
    `);
  }
  return db;
}

function trackEvent({ event_type, menu_id, item_id, category_id, user_id, slug, user_agent, referrer }) {
  const d = getDb();
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(user_agent || '');
  d.prepare(`INSERT INTO analytics_events (event_type, menu_id, item_id, category_id, user_id, slug, user_agent, referrer, is_mobile)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    event_type, menu_id || null, item_id || null, category_id || null,
    user_id || null, slug || null, user_agent || null, referrer || null, isMobile ? 1 : 0
  );
}

function getAnalytics(userId, menuIds, range) {
  const d = getDb();
  const placeholders = menuIds.map(() => '?').join(',');
  
  let tsFilter = '';
  if (range === 'today') tsFilter = "AND timestamp >= date('now')";
  else if (range === '7d') tsFilter = "AND timestamp >= date('now', '-7 days')";
  else if (range === '30d') tsFilter = "AND timestamp >= date('now', '-30 days')";
  // 'all' = no filter

  const base = `FROM analytics_events WHERE menu_id IN (${placeholders}) ${tsFilter}`;

  // Summary counts
  const totalViews = d.prepare(`SELECT COUNT(*) as c ${base} AND event_type='page_view'`).get(...menuIds)?.c || 0;
  const totalItemClicks = d.prepare(`SELECT COUNT(*) as c ${base} AND event_type='item_click'`).get(...menuIds)?.c || 0;
  const totalQRScans = d.prepare(`SELECT COUNT(*) as c ${base} AND event_type='qr_scan'`).get(...menuIds)?.c || 0;
  const uniqueSessions = d.prepare(`SELECT COUNT(DISTINCT user_agent) as c ${base} AND event_type='page_view'`).get(...menuIds)?.c || 0;

  // Daily views (page_view + qr_scan)
  const dailyViews = d.prepare(`
    SELECT date(timestamp) as day, 
           SUM(CASE WHEN event_type='page_view' THEN 1 ELSE 0 END) as views,
           SUM(CASE WHEN event_type='qr_scan' THEN 1 ELSE 0 END) as scans
    ${base} AND event_type IN ('page_view','qr_scan')
    GROUP BY date(timestamp) ORDER BY day
  `).all(...menuIds);

  // Top 10 items
  const topItems = d.prepare(`
    SELECT item_id, COUNT(*) as count ${base} AND event_type='item_click' AND item_id IS NOT NULL
    GROUP BY item_id ORDER BY count DESC LIMIT 10
  `).all(...menuIds);

  // Views by hour
  const hourly = d.prepare(`
    SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as count
    ${base} AND event_type='page_view'
    GROUP BY hour ORDER BY hour
  `).all(...menuIds);

  // Device breakdown
  const mobileCount = d.prepare(`SELECT COUNT(*) as c ${base} AND event_type='page_view' AND is_mobile=1`).get(...menuIds)?.c || 0;
  const desktopCount = totalViews - mobileCount;

  // Category views
  const categoryViews = d.prepare(`
    SELECT category_id, COUNT(*) as count ${base} AND event_type='category_switch' AND category_id IS NOT NULL
    GROUP BY category_id ORDER BY count DESC
  `).all(...menuIds);

  return {
    totalViews, totalItemClicks, totalQRScans, uniqueSessions,
    dailyViews, topItems, hourly, 
    devices: { mobile: mobileCount, desktop: desktopCount },
    categoryViews
  };
}

module.exports = { trackEvent, getAnalytics, getDb };
