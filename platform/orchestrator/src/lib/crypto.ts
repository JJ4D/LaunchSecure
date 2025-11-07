import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  // Derive a 32-byte key from the environment variable
  return crypto.createHash('sha256').update(key).digest();
}

export function encryptCredentials(credentials: object): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const credentialsString = JSON.stringify(credentials);
  let encrypted = cipher.update(credentialsString, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // Combine IV, tag, and encrypted data
  const result = {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    encrypted: encrypted,
  };

  return JSON.stringify(result);
}

export function decryptCredentials(encryptedData: string | object): object {
  const key = getEncryptionKey();
  
  // Handle both string (from API) and object (from PostgreSQL JSONB) formats
  let data: any;
  if (typeof encryptedData === 'string') {
    data = JSON.parse(encryptedData);
  } else if (typeof encryptedData === 'object' && encryptedData !== null) {
    data = encryptedData;
  } else {
    throw new Error('Invalid encrypted data format: expected string or object');
  }

  const iv = Buffer.from(data.iv, 'hex');
  const tag = Buffer.from(data.tag, 'hex');
  const encrypted = data.encrypted;

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

