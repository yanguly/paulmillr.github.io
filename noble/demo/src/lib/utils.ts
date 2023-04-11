export const pad = (n: bigint) => {
  return n.toString();
}

export const isPositiveBigInt = (str) => {
  return !/[^0-9]/.test(str);
}

export const isBigInt = (str) => {
  try {
    return typeof BigInt(str) === "bigint";
  } catch (e) {
    return false;
  }
}

export const isNonHexStr = (str) => {
  return /[^0-9A-F]/gi.test(str);
}

export const getErrMsg = (e) => {
  return e.message.split(/\r?\n/);
}