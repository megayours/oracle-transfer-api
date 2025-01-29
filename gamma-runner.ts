import Database from 'bun:sqlite';
import { createClient, createIccfProofTx, gtv, type IClient, type RawGtx, type SignatureProvider } from 'postchain-client';
import { addProcessedRow } from './db';
import { getLastProcessedRow } from './db';
import { getTransactionRid, op } from '@chromia/ft4';
import { serializeTokenMetadata, type Project, type TokenMetadata } from '@megayours/sdk';

type TokenRow = {
  rowid: number;
  chain: string;
  contract: Buffer;
  owner_account_id: Buffer;
  owner_external_address: Buffer;
  token: {
    project: Project;
    collection: string;
    token_id: number;
    metadata: TokenMetadata;
  }
}

export async function run(db: Database, gammaClient: IClient, pfpClient: IClient, oracleSignatureProvider: SignatureProvider) {
  const rowid = getLastProcessedRow(db) ?? 0;
  const row = await gammaClient.query<TokenRow>('tokens.get_token_after', { rowid });
  if (!row) return;

  const tokenOnGamma = await gammaClient.query<TokenRow>('yours.external.get_token', {
    chain: row.chain,
    contract: row.contract,
    token_id: row.token.token_id,
  });

  console.log(`Token ${row.token.token_id} on ${row.chain} detected`);

  if (tokenOnGamma) {
    console.log(`Token ${row.token.token_id} on ${row.chain} found on Gamma`);
    await transferToken(gammaClient, pfpClient, row, oracleSignatureProvider);
    console.log(`Token ${row.token.token_id} on ${row.chain} transferred to PFP Demo`);
  } else {
    console.log(`Token ${row.token.token_id} on ${row.chain} not found on Gamma`);
  }

  addProcessedRow(db, row.rowid);
  console.log(`Token ${row.token.token_id} on ${row.chain} processed`);
}

async function transferToken(gammaClient: IClient, pfpClient: IClient, row: TokenRow, oracleSignatureProvider: SignatureProvider) {
  // Create management chain client
  const nodeUrl = gammaClient.config.endpointPool[0].url;
  const managementChain = await createClient({
    directoryNodeUrlPool: [nodeUrl],
    blockchainIid: 0,
  });

  // Fetch account id on target chain
  const toAccountId = await getAccountId(pfpClient, row.owner_external_address);
  console.log(`Account id on target chain found: ${toAccountId?.toString('hex')}`);

  // Init Transfer on Source Chain
  const initTx = {
    operations: [
      op(
        'yours.init_oracle_transfer',
        row.owner_account_id,
        Buffer.from(pfpClient.config.blockchainRid, 'hex'),
        toAccountId,
        row.token.token_id,
        BigInt(1),
        serializeTokenMetadata(row.token.metadata)
      ),
    ],
    signers: [oracleSignatureProvider.pubKey],
  };

  const signedInitTx = await gammaClient.signTransaction(initTx, oracleSignatureProvider);
  await gammaClient.sendTransaction(signedInitTx);
  console.log(`Transfer initialized on source chain`);

  await new Promise(resolve => setTimeout(resolve, 10000));

  const rawInitTx = gtv.decode(signedInitTx) as RawGtx;
  const initTxRid = getTransactionRid(rawInitTx);
  const initTxIccfProof = await createIccfProofTx(
    managementChain,
    initTxRid,
    gtv.gtvHash(rawInitTx),
    [oracleSignatureProvider.pubKey],
    gammaClient.config.blockchainRid,
    pfpClient.config.blockchainRid,
    undefined,
    true
  );

  // Apply Transfer on Destination Chain
  const applyTx = {
    operations: [initTxIccfProof.iccfTx.operations[0], op('yours.apply_transfer', rawInitTx, 0)],
    signers: [oracleSignatureProvider.pubKey],
  };

  const signedApplyTx = await pfpClient.signTransaction(applyTx, oracleSignatureProvider);
  await pfpClient.sendTransaction(signedApplyTx);

  console.log(`Apply tx signed and sent`);
  await new Promise(resolve => setTimeout(resolve, 10000));

  const rawApplyTx = gtv.decode(signedApplyTx) as RawGtx;
  const applyTxRid = getTransactionRid(rawApplyTx);
  const applyTxIccfProof = await createIccfProofTx(
    managementChain,
    applyTxRid,
    gtv.gtvHash(rawApplyTx),
    [oracleSignatureProvider.pubKey],
    pfpClient.config.blockchainRid,
    gammaClient.config.blockchainRid,
    undefined,
    true
  );

  // Complete Transfer on Source Chain
  const completeTx = {
    operations: [applyTxIccfProof.iccfTx.operations[0], op('yours.complete_transfer', rawApplyTx, 1)],
    signers: [oracleSignatureProvider.pubKey],
  };

  await gammaClient.signAndSendUniqueTransaction(completeTx, oracleSignatureProvider);
}

async function getAccountId(client: IClient, externalAddress: Buffer) {
  const accounts = await client.query<{ data: { id: Buffer }[] }>('ft4.get_accounts_by_signer', {
    id: externalAddress,
    page_size: 1,
    page_cursor: null
  });

  if (accounts.data.length === 0) return null;

  return accounts.data[0].id;
}