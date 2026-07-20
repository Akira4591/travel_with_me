import { getDB } from './db.js';

export function saveGuide({ city, guide_type, source_text, extracted, token_count }) {
  const db = getDB();
  const id = `guide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = Date.now();

  db.prepare(
    `INSERT INTO guides (id, city, guide_type, source_text, extracted, token_count, created_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(id, city || null, guide_type || null, source_text, extracted, token_count || 0, createdAt);

  return id;
}

export function getGuide(id) {
  const db = getDB();
  return db.prepare('SELECT * FROM guides WHERE id = ?').get(id);
}

export function getGuidesByIds(ids) {
  if (!ids.length) return [];
  const db = getDB();
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT * FROM guides WHERE id IN (${placeholders})`).all(...ids);
  const map = new Map(rows.map(r => [r.id, r]));
  return ids.map(id => map.get(id) || null);
}

export function listGuides({ limit = 50, offset = 0 } = {}) {
  const db = getDB();
  return db
    .prepare(
      `SELECT id, city, guide_type, token_count, created_at, deleted
       FROM guides ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(limit, offset);
}

export function softDeleteGuide(id) {
  const db = getDB();
  const result = db.prepare('UPDATE guides SET deleted = 1 WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getAllActiveGuides() {
  const db = getDB();
  return db
    .prepare('SELECT id, city, guide_type, source_text, token_count FROM guides WHERE deleted = 0')
    .all();
}

export function getActiveGuideCount() {
  const db = getDB();
  const row = db.prepare('SELECT COUNT(*) as count FROM guides WHERE deleted = 0').get();
  return row.count;
}
