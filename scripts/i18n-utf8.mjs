import fs from 'node:fs';

export const UTF8_ENCODING = 'utf8';

export function readUtf8Text(filePath) {
  const content = fs.readFileSync(filePath, { encoding: UTF8_ENCODING });
  return content.replace(/^\uFEFF/, '');
}

export function writeUtf8Text(filePath, content) {
  fs.writeFileSync(filePath, content, { encoding: UTF8_ENCODING });
}

export function readUtf8Json(filePath) {
  return JSON.parse(readUtf8Text(filePath));
}

export function writeUtf8Json(filePath, payload) {
  writeUtf8Text(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}
