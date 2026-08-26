import { deflateSync } from 'node:zlib';

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c >>> 0;
}

const crc32 = (buffer: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer): Buffer => {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
};

/**
 * 生成未压缩滤镜的 RGB PNG，便于测试嵌入与宽高比。
 */
export const createPng = (
  width: number,
  height: number,
  colorAt: (x: number, y: number) => readonly [number, number, number] = (x, y) => [
    x < width / 2 ? 30 : 200,
    y < height / 2 ? 90 : 160,
    220,
  ],
): Buffer => {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = colorAt(x, y);
      const offset = 1 + x * 3;
      row[offset] = r;
      row[offset + 1] = g;
      row[offset + 2] = b;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

export const GRAPH_PNG_WIDTH = 1200;
export const GRAPH_PNG_HEIGHT = 300;

export const createGraphPng = (): Buffer =>
  createPng(GRAPH_PNG_WIDTH, GRAPH_PNG_HEIGHT, (x, y) => {
    const bar = Math.floor(x / 150) % 2 === 0;
    const axis = y > GRAPH_PNG_HEIGHT - 24;
    if (axis) return [40, 40, 40];
    if (bar && y > 80 + (x % 150)) return [37, 99, 170];
    return [245, 247, 250];
  });
