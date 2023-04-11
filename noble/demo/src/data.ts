export const KEY_32 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
export const KEY_48 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
export const KEY_57 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01'
export const KEY_65 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01'

export const curves = [
  { type: 'ECDSA', list: ['secp256k1', 'P256', 'P384', 'P521'] },
  { type: 'Schnorr', list: ['secp256k1'] },
  { type: 'EdDSA', list: ['ed25519', 'ed448'] },
  { type: 'BLS', list: ['bls12-381'], options: ['G1', 'G2'] },
  // { type: 'ECDH', list: ['x25519', 'x448', 'secp256k1'] },
];

export const hashes = {
  'ecdsa_secp256k1': ['sha256', 'sha3_256', 'keccak_256'],
  'ecdsa_p256': ['sha256', 'sha3_256', 'keccak_256'],
  'ecdsa_p384': ['sha384', 'sha3_384', 'keccak_384'],
  'ecdsa_p521': ['sha512', 'sha3_512', 'keccak_512'],
};

export const err = {
  'NO_MESSAGE': 'Provide a message to sign to see the results.',
  'POSITIVE_INT': 'must be positive and non-floating point integer.',
  'INT': 'must be non-floating point integer.',
};