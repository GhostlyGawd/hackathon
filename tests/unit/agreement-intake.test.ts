import { describe, expect, it } from "vitest";
import {
  AgreementCorruptError,
  AgreementIntegrityError,
  InMemoryAgreementObjectStore,
  UnsupportedAgreementTypeError,
  extractAgreementSource,
  hashAgreementBytes,
} from "../../packages/core/src/agreement-intake";

const encoder = new TextEncoder();

describe("agreement source primitives", () => {
  it("hashes the exact original bytes and changes when one byte changes", () => {
    const original = encoder.encode("Fictional Cedar Ridge DPA\nStudent email is allowed.");
    const changed = original.slice();
    changed[changed.length - 2]! ^= 1;

    expect(hashAgreementBytes(original)).toMatch(/^[a-f0-9]{64}$/u);
    expect(hashAgreementBytes(original)).toBe(hashAgreementBytes(original.slice()));
    expect(hashAgreementBytes(changed)).not.toBe(hashAgreementBytes(original));
  });

  it("builds a verifiable page map for form-feed-separated text", async () => {
    const source = await extractAgreementSource({
      mimeType: "text/plain",
      bytes: encoder.encode(
        "Fictional DPA page one\nStudent name is allowed.\fFictional DPA page two\nAdvertising is prohibited.",
      ),
    });

    expect(source.pageMap).toHaveLength(2);
    expect(source.pageMap.map((page) => page.pageNumber)).toEqual([1, 2]);
    for (const page of source.pageMap) {
      expect(source.normalizedText.slice(page.startOffset, page.endOffset)).toBe(
        page.text,
      );
      expect(page.textSha256).toBe(hashAgreementBytes(encoder.encode(page.text)));
    }
  });

  it("rejects unsupported, empty, binary text, and malformed PDF input", async () => {
    await expect(
      extractAgreementSource({
        mimeType: "application/octet-stream",
        bytes: encoder.encode("not an agreement"),
      }),
    ).rejects.toBeInstanceOf(UnsupportedAgreementTypeError);
    await expect(
      extractAgreementSource({ mimeType: "text/plain", bytes: new Uint8Array() }),
    ).rejects.toBeInstanceOf(AgreementCorruptError);
    await expect(
      extractAgreementSource({
        mimeType: "text/plain",
        bytes: Uint8Array.from([70, 105, 99, 0, 116, 105, 111, 110, 97, 108]),
      }),
    ).rejects.toBeInstanceOf(AgreementCorruptError);
    await expect(
      extractAgreementSource({
        mimeType: "application/pdf",
        bytes: encoder.encode("%PDF-1.7\nnot a complete document"),
      }),
    ).rejects.toBeInstanceOf(AgreementCorruptError);
  });

  it("rejects bytes that do not match a content-addressed object key", async () => {
    const store = new InMemoryAgreementObjectStore();
    const bytes = encoder.encode("Fictional agreement source.");
    const correctKey = `agreements/sha256/${hashAgreementBytes(bytes)}.txt`;

    await expect(store.put(correctKey, bytes)).resolves.toBeUndefined();
    await expect(store.get(correctKey)).resolves.toEqual(bytes);
    await expect(
      store.put(`agreements/sha256/${"a".repeat(64)}.txt`, bytes),
    ).rejects.toBeInstanceOf(AgreementIntegrityError);
  });
});
