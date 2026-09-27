// EIP-712 typed-data hashing for the AgentTreasury voucher, byte-for-byte identical
// to AgentTreasury.sol so a voucher this module signs verifies on-chain. The domain
// name, version and both typehashes match the contract exactly. See
// contracts/src/AgentTreasury.sol and .hq/research/R12-token-economics-and-usecases.md.

import { keccak_256 } from '@noble/hashes/sha3';
import { concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/** The chain and contract a voucher is bound to. A voucher signed for one contract
 *  on one chain cannot be replayed against another: both are hashed into the domain. */
export interface VoucherDomain {
  chainId: bigint;
  verifyingContract: string;
}

/** A single-use authorization to release `amount` of the quote asset to `recipient`.
 *  Signed by the forge oracle, redeemed once by the agent at AgentTreasury.claim. */
export interface Voucher {
  recipient: string;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
}

const DOMAIN_TYPEHASH = keccak_256(
  utf8ToBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
);
const VOUCHER_TYPEHASH = keccak_256(
  utf8ToBytes('Voucher(address recipient,uint256 amount,uint256 nonce,uint256 deadline)'),
);
const NAME_HASH = keccak_256(utf8ToBytes('MuseHub AgentTreasury'));
const VERSION_HASH = keccak_256(utf8ToBytes('1'));

/** A uint256 as a 32-byte big-endian word, the way abi.encode lays it out. */
function word(value: bigint): Uint8Array {
  if (value < 0n) throw new Error('negative value');
  const out = new Uint8Array(32);
  let x = value;
  for (let i = 31; i >= 0 && x > 0n; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  if (x > 0n) throw new Error('value exceeds uint256');
  return out;
}

/** An address as a 32-byte word, left-padded with zeros, matching abi.encode. */
function addressWord(address: string): Uint8Array {
  const hex = address.startsWith('0x') || address.startsWith('0X') ? address.slice(2) : address;
  if (hex.length !== 40) throw new Error(`bad address: ${address}`);
  const out = new Uint8Array(32);
  out.set(hexToBytes(hex), 12);
  return out;
}

export function domainSeparator(domain: VoucherDomain): Uint8Array {
  return keccak_256(
    concatBytes(
      DOMAIN_TYPEHASH,
      NAME_HASH,
      VERSION_HASH,
      word(domain.chainId),
      addressWord(domain.verifyingContract),
    ),
  );
}

export function voucherStructHash(v: Voucher): Uint8Array {
  return keccak_256(
    concatBytes(
      VOUCHER_TYPEHASH,
      addressWord(v.recipient),
      word(v.amount),
      word(v.nonce),
      word(v.deadline),
    ),
  );
}

/** The EIP-712 digest ecrecover runs against: keccak256(0x1901 || domainSeparator || structHash). */
export function voucherDigest(v: Voucher, domain: VoucherDomain): Uint8Array {
  return keccak_256(
    concatBytes(Uint8Array.from([0x19, 0x01]), domainSeparator(domain), voucherStructHash(v)),
  );
}
