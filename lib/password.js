const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
const BCRYPT_PREFIX = /^\$2[aby]\$/;

function isBcryptHash(value) {
  return BCRYPT_PREFIX.test(String(value || ''));
}

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}

async function verifyPassword(plain, stored) {
  const password = String(plain || '');
  const hash = String(stored || '');
  if (!password || !hash) return { ok: false, needsUpgrade: false };

  if (isBcryptHash(hash)) {
    const ok = await bcrypt.compare(password, hash);
    return { ok, needsUpgrade: false };
  }

  const ok = password === hash;
  return { ok, needsUpgrade: ok };
}

module.exports = {
  hashPassword,
  verifyPassword,
  isBcryptHash
};
