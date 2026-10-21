const crypto = require('node:crypto');

// Electron uses BoringSSL, which does not always expose CFB8. Use the same
// small AES fallback as minecraft-protocol; never substitute another mode.
class Cfb8 {
  constructor(secret, decrypt = false) {
    this.aes = new (require('aes-js').ModeOfOperation.cfb)(secret, secret, 1);
    this.decrypt = decrypt;
  }
  update(bytes) {
    return Buffer.from(this.decrypt ? this.aes.decrypt(bytes) : this.aes.encrypt(bytes));
  }
}

function createEncryption(secret) {
  if (crypto.getCiphers().includes('aes-128-cfb8')) return {
    cipher: crypto.createCipheriv('aes-128-cfb8', secret, secret),
    decipher: crypto.createDecipheriv('aes-128-cfb8', secret, secret),
  };
  return { cipher: new Cfb8(secret), decipher: new Cfb8(secret, true) };
}

module.exports = { createEncryption, Cfb8 };
