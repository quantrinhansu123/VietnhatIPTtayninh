import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BienBanSheet } from '../src/features/kiem-dinh-tem/BienBanPrint';
import { isCloudinaryUploadUrl } from '../src/utils/cloudinaryUrl';

// Run: npx esbuild scripts/test-bien-ban-photos.tsx --bundle --platform=node --format=esm --packages=external --loader:.png=dataurl --outfile=node_modules/.cache/test-bien-ban-photos.mjs
// Then: node node_modules/.cache/test-bien-ban-photos.mjs
// Exercise the actual route without connecting to a live database.
const source = fs.readFileSync('server.ts', 'utf8');
const start = source.indexOf("  app.post('/api/bien-ban',");
const end = source.indexOf("  app.delete('/api/bien-ban/", start);
assert.ok(start > 0 && end > start);
const route = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 });
let handler: (req: any, res: any) => Promise<unknown>;
let inserted: Record<string, unknown> | undefined;
let dbError: { message: string } | null = null;
const query = {
  insert(value: Record<string, unknown>) { inserted = value; return this; },
  select() { return this; },
  async single() { return { data: inserted, error: dbError }; }
};
new Function('app', 'supabase', 'isCloudinaryUploadUrl', route)(
  { post(_path: string, fn: typeof handler) { handler = fn; } },
  { from(table: string) { assert.equal(table, 'bien_ban'); return query; } },
  isCloudinaryUploadUrl
);

async function save(body: unknown) {
  inserted = undefined;
  const res = {
    code: 200, body: undefined as any,
    status(code: number) { this.code = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  };
  await handler!({ body }, res);
  return res;
}

const photo = 'https://res.cloudinary.com/demo/image/upload/v123/bien_ban/photo.webp';
const valid = await save({ ma_qr: 'MN-BB326_TEST', anh_url: photo });
assert.equal(valid.code, 200);
assert.equal(valid.body.record.anh_url, photo);
const withoutPhoto = await save({ ma_qr: 'MN-BB326_TEST' });
assert.equal(withoutPhoto.code, 200);
assert.ok(!('anh_url' in withoutPhoto.body.record));
for (const anh_url of ['data:image/png;base64,abc', 'javascript:alert(1)', 'https://example.com/photo.png']) {
  assert.equal((await save({ ma_qr: 'TEST', anh_url })).code, 400);
  assert.equal(inserted, undefined);
}
dbError = { message: 'Missing anh_url column' };
assert.equal((await save({ ma_qr: 'TEST', anh_url: photo })).code, 500);
assert.equal((await save({ anh_url: photo })).code, 400);

const withPhoto = renderToStaticMarkup(<BienBanSheet data={{ ma_bien_ban: 'BB-TEST', ma_qr: 'TEST', anh_url: photo }} />);
assert.ok(withPhoto.includes('alt="Ảnh kiểm định"'));
assert.ok(withPhoto.includes(encodeURIComponent(photo)));
const oldRecord = renderToStaticMarkup(<BienBanSheet data={{ ma_bien_ban: 'BB-OLD', ma_qr: 'TEST' }} />);
assert.ok(!oldRecord.includes('alt="Ảnh kiểm định"'));
console.log('PASS: photo persistence, optional photo, invalid URLs, database failure, and print rendering.');
