import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { saveMasterDataImage, verifyMasterDataImage } from "../src/utils/master-data-images.js";

const uploadRoot = fileURLToPath(new URL("../uploads/master-data/", import.meta.url));
const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("category image upload stores a validated file and metadata that remains verifiable", async () => {
  const file = { mimetype: "image/png", buffer: pngHeader, size: pngHeader.length };
  const saved = await saveMasterDataImage(file, "categoryImage", "owner-a", "shop-a");
  try {
    assert.match(saved.url, /^\/uploads\/master-data\/categories\/images\/[0-9a-f-]{36}\.png$/);
    assert.deepEqual(await readFile(saved.path), pngHeader);
    assert.equal(await verifyMasterDataImage(saved.url, "categoryImage", "owner-a", "shop-a"), true);
  } finally {
    await rm(saved.path, { force: true });
    await rm(`${saved.path}.json`, { force: true });
  }
});

test("master-data image verification accepts a valid signed image owned by the requester", async () => {
  const relativeDirectory = "categories/icons";
  const filename = `${randomUUID()}.png`;
  const url = `/uploads/master-data/${relativeDirectory}/${filename}`;
  const directory = path.join(uploadRoot, relativeDirectory);
  const filePath = path.join(directory, filename);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(filePath, pngHeader);
    await writeFile(`${filePath}.json`, JSON.stringify({
      imageUrl: url,
      imageType: "categoryIcon",
      ownerId: "owner-a",
      shopId: "shop-a"
    }));
    assert.equal(await verifyMasterDataImage(url, "categoryIcon", "owner-a", "shop-a"), true);
  } finally {
    await rm(filePath, { force: true });
    await rm(`${filePath}.json`, { force: true });
  }
});

test("master-data image verification rejects bytes that do not match the extension", async () => {
  const relativeDirectory = "categories/icons";
  const filename = `${randomUUID()}.png`;
  const url = `/uploads/master-data/${relativeDirectory}/${filename}`;
  const directory = path.join(uploadRoot, relativeDirectory);
  const filePath = path.join(directory, filename);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(filePath, Buffer.from("not a png"));
    await writeFile(`${filePath}.json`, JSON.stringify({
      imageUrl: url,
      imageType: "categoryIcon",
      ownerId: "owner-a",
      shopId: "shop-a"
    }));
    await assert.rejects(
      () => verifyMasterDataImage(url, "categoryIcon", "owner-a", "shop-a"),
      { code: "INVALID_IMAGE" }
    );
  } finally {
    await rm(filePath, { force: true });
    await rm(`${filePath}.json`, { force: true });
  }
});

test("master-data image verification rejects an ownership mismatch", async () => {
  const relativeDirectory = "categories/icons";
  const filename = `${randomUUID()}.png`;
  const url = `/uploads/master-data/${relativeDirectory}/${filename}`;
  const directory = path.join(uploadRoot, relativeDirectory);
  const filePath = path.join(directory, filename);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(filePath, pngHeader);
    await writeFile(`${filePath}.json`, JSON.stringify({
      imageUrl: url,
      imageType: "categoryIcon",
      ownerId: "other-owner",
      shopId: "shop-a"
    }));
    await assert.rejects(
      () => verifyMasterDataImage(url, "categoryIcon", "owner-a", "shop-a"),
      { code: "IMAGE_OWNERSHIP_MISMATCH", status: 403 }
    );
  } finally {
    await rm(filePath, { force: true });
    await rm(`${filePath}.json`, { force: true });
  }
});
