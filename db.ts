import Database from 'bun:sqlite';

export function initDb(db: Database) {
  const query = db.query('CREATE TABLE IF NOT EXISTS processed_rows (rowid INTEGER PRIMARY KEY)');
  query.run();
}

export function addProcessedRow(db: Database, rowid: number) {
  const query = db.query('INSERT OR IGNORE INTO processed_rows (rowid) VALUES (?)');
  const result = query.run(rowid);
  
  if (result.changes === 0) {
    console.log(`Row ${rowid} already processed, skipping`);
  } else {
    console.log(`Added rowid ${rowid} to processed_rows`);
  }
}

export function getLastProcessedRow(db: Database): number | null {
  const query = db.prepare<{ rowid: number }, []>(
    'SELECT rowid FROM processed_rows ORDER BY rowid DESC LIMIT 1'
  );
  const result = query.get();
  console.log(`Last processed rowid: ${result?.rowid}`);
  return result?.rowid ?? null;
}
