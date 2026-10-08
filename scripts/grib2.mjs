// Minimal GRIB2 okuyucu: GFS'nin kullandığı enlem-boylam ızgarası (şablon 3.0)
// ve "complex packing + spatial differencing" (şablon 5.3) için.

class BitReader {
  constructor(buf, offset) {
    this.buf = buf;
    this.bit = offset * 8;
  }

  read(n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.buf[this.bit >> 3];
      v = v * 2 + ((byte >> (7 - (this.bit & 7))) & 1);
      this.bit++;
    }
    return v;
  }

  alignToByte() {
    this.bit = Math.ceil(this.bit / 8) * 8;
  }
}

// GRIB2 işaretli tamsayıları ikiye tümleyen değil, işaret-büyüklük biçimindedir
function readSigned(buf, offset, bytes) {
  let v = 0;
  for (let i = 0; i < bytes; i++) v = v * 256 + buf[offset + i];
  const signBit = 2 ** (bytes * 8 - 1);
  return v >= signBit ? -(v - signBit) : v;
}

function decodeComplexPacking(s5, s7, count) {
  const R = s5.readFloatBE(11);
  const E = readSigned(s5, 15, 2);
  const D = readSigned(s5, 17, 2);
  const nbits = s5[19];
  const missingMgmt = s5[22];
  const NG = s5.readUInt32BE(31);
  const widthRef = s5[35];
  const widthBits = s5[36];
  const lengthRef = s5.readUInt32BE(37);
  const lengthInc = s5[41];
  const lastLength = s5.readUInt32BE(42);
  const lengthBits = s5[46];
  const order = s5[47];
  const extraBytes = s5[48];

  if (missingMgmt !== 0) {
    throw new Error("Eksik değer yönetimi desteklenmiyor");
  }

  // Bölüm 7: önce uzamsal fark başlangıç değerleri ve minimum fark
  let p = 5;
  const initial = [];
  for (let i = 0; i < order; i++) {
    initial.push(readSigned(s7, p, extraBytes));
    p += extraBytes;
  }
  const minDiff = readSigned(s7, p, extraBytes);
  p += extraBytes;

  const bits = new BitReader(s7, p);
  const refs = new Array(NG);
  for (let g = 0; g < NG; g++) refs[g] = bits.read(nbits);
  bits.alignToByte();

  const widths = new Array(NG);
  for (let g = 0; g < NG; g++) widths[g] = widthRef + bits.read(widthBits);
  bits.alignToByte();

  const lengths = new Array(NG);
  for (let g = 0; g < NG; g++) {
    lengths[g] = lengthRef + bits.read(lengthBits) * lengthInc;
  }
  lengths[NG - 1] = lastLength;
  bits.alignToByte();

  const values = new Float64Array(count);
  let k = 0;
  for (let g = 0; g < NG; g++) {
    for (let j = 0; j < lengths[g]; j++) {
      values[k++] = refs[g] + (widths[g] ? bits.read(widths[g]) : 0);
    }
  }

  // Uzamsal farkları geri al
  if (order === 1) {
    values[0] = initial[0];
    for (let i = 1; i < count; i++) values[i] += minDiff + values[i - 1];
  } else if (order === 2) {
    values[0] = initial[0];
    values[1] = initial[1];
    for (let i = 2; i < count; i++) {
      values[i] += minDiff + 2 * values[i - 1] - values[i - 2];
    }
  }

  const binary = 2 ** E;
  const decimal = 10 ** D;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = (R + values[i] * binary) / decimal;
  return out;
}

// Dosyadaki her mesajı { discipline, category, number, surface, template, nx, ny, la1, lo1, scan, values } olarak döner
export function readGrib2(buf) {
  const messages = [];
  let o = 0;

  while (o < buf.length - 16) {
    if (buf.toString("ascii", o, o + 4) !== "GRIB") {
      o++;
      continue;
    }
    const discipline = buf[o + 6];
    const length = Number(buf.readBigUInt64BE(o + 8));
    const msg = { discipline };
    const sections = {};

    let p = o + 16;
    while (p < o + length - 4) {
      const len = buf.readUInt32BE(p);
      sections[buf[p + 4]] = buf.subarray(p, p + len);
      p += len;
    }

    const s3 = sections[3];
    if (s3.readUInt16BE(12) !== 0) throw new Error("Sadece enlem-boylam ızgarası destekleniyor");
    msg.nx = s3.readUInt32BE(30);
    msg.ny = s3.readUInt32BE(34);
    msg.la1 = readSigned(s3, 46, 4) / 1e6;
    msg.lo1 = readSigned(s3, 50, 4) / 1e6;
    msg.scan = s3[71];

    const s4 = sections[4];
    msg.template = s4.readUInt16BE(7);
    msg.category = s4[9];
    msg.number = s4[10];
    msg.surface = s4[22];
    msg.surfaceValue = readSigned(s4, 24, 4) / 10 ** s4[23];

    const s5 = sections[5];
    const count = s5.readUInt32BE(5);
    if (s5.readUInt16BE(9) !== 3) throw new Error("Sadece şablon 5.3 destekleniyor");

    if (sections[6][5] !== 255) throw new Error("Bitmap'li mesajlar desteklenmiyor");

    msg.values = decodeComplexPacking(s5, sections[7], count);
    messages.push(msg);
    o += length;
  }

  return messages;
}
