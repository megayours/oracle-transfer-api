import Database from 'bun:sqlite';

export function initDb(db: Database) {
  const query = db.query('CREATE TABLE IF NOT EXISTS processed_rows (rowid INTEGER PRIMARY KEY)');
  query.run();
}

export function addProcessedRow(db: Database, rowid: number) {
  const query = db.query('INSERT INTO processed_rows (rowid) VALUES (?)');
  query.run(rowid);
}

export function getLastProcessedRow(db: Database): number | null {
  const query = db.prepare<{ rowid: number }, []>(
    'SELECT rowid FROM processed_rows ORDER BY rowid DESC LIMIT 1'
  );
  const result = query.get();
  return result?.rowid ?? null;
}
