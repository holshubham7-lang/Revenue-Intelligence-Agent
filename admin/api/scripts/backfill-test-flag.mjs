import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/revops';
const TEST_PATTERN =
  /(^hsmtest|@test\.com$|^qa-|^victim-|^audit_|^dek_|^kv_|^admin-)/i;

async function main() {
  await mongoose.connect(MONGODB_URI);
  const col = mongoose.connection.db.collection('users');

  const all = await col
    .find({}, { projection: { email: 1, isTestAccount: 1, name: 1 } })
    .toArray();

  const toFlag = [];
  const toUnflag = [];
  for (const user of all) {
    const email = user.email ?? '';
    const matches = TEST_PATTERN.test(email);
    const isFlagged = user.isTestAccount === true;
    if (matches && !isFlagged) toFlag.push(email);
    if (!matches && isFlagged) toUnflag.push(email);
  }

  if (toFlag.length > 0) {
    const r = await col.updateMany(
      { email: { $in: toFlag } },
      { $set: { isTestAccount: true } },
    );
    console.log(`flagged ${r.modifiedCount} test accounts: ${toFlag.join(', ')}`);
  }
  if (toUnflag.length > 0) {
    const r = await col.updateMany(
      { email: { $in: toUnflag } },
      { $set: { isTestAccount: false } },
    );
    console.log(`unflagged ${r.modifiedCount}: ${toUnflag.join(', ')}`);
  }

  const flagged = await col.countDocuments({ isTestAccount: true });
  const real = await col.countDocuments({ isTestAccount: { $ne: true } });
  console.log(`now: ${flagged} test, ${real} real, ${all.length} total`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});