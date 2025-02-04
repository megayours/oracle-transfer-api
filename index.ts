import Database from 'bun:sqlite';
import { run } from './gamma-runner';
import { initDb } from './db';
import { createClient, newSignatureProvider, type IClient, type SignatureProvider } from 'postchain-client';

const db = new Database('/tmp/db.sqlite');
initDb(db);

let gammaClient: IClient;
let pfpClient: IClient;
let oracleSignatureProvider: SignatureProvider;

// Create a recurring task that runs every second
const interval = setInterval(async () => {
  await ensureClients();
  console.log('Running periodic task:', new Date().toISOString());
  run(db, gammaClient, pfpClient, oracleSignatureProvider);
  // Add your custom logic here
}, 10000);

async function ensureClients() {
  if (!gammaClient) {
    gammaClient = await createClient({
      directoryNodeUrlPool: [process.env.DIRECTORY_NODE_URL!],
      blockchainRid: process.env.GAMMA_RID!,
    });
  }

  if (!pfpClient) {
    pfpClient = await createClient({
      directoryNodeUrlPool: [process.env.DIRECTORY_NODE_URL!],
      blockchainRid: process.env.PFP_RID!,
    });
  }

  if (!oracleSignatureProvider) {
    oracleSignatureProvider = newSignatureProvider({ privKey: process.env.ORACLE_PRIVATE_KEY! });
  }
}

// Cleanup when needed (optional)
process.on('SIGINT', () => {
  clearInterval(interval);
  process.exit();
});
