import { inflateRawSync } from 'node:zlib';

export function extractZipEntry(zipBuffer, entryName) {
  let offset = 0;

  while (offset + 30 <= zipBuffer.length) {
    const signature = zipBuffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
    const extraFieldLength = zipBuffer.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const dataStart = fileNameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;
    const fileName = zipBuffer.subarray(fileNameStart, fileNameEnd).toString('utf-8');

    if (fileName === entryName) {
      const payload = zipBuffer.subarray(dataStart, dataEnd);
      if (compressionMethod === 0) return payload;
      if (compressionMethod === 8) return inflateRawSync(payload);
      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${entryName}`);
    }

    offset = dataEnd;
  }

  throw new Error(`ZIP entry not found: ${entryName}`);
}

export function createTestSlideHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; }
    body {
      width: 720pt;
      height: 405pt;
      margin: 0;
      padding: 36pt;
      font-family: Pretendard, sans-serif;
      background: #ffffff;
    }
    .frame {
      width: 100%;
      height: 100%;
      border: 1pt solid #222222;
      padding: 24pt;
    }
    h1 {
      margin: 0 0 12pt;
      font-size: 24pt;
      color: #111111;
    }
    p {
      margin: 0;
      font-size: 14pt;
      color: #444444;
    }
  </style>
</head>
<body>
  <div class="frame">
    <h1>Figma Export Proof</h1>
    <p>Repo-standard slide dimensions should be preserved.</p>
  </div>
</body>
</html>`;
}
