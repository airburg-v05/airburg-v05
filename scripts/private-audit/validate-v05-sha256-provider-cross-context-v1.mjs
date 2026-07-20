import { webcrypto } from "node:crypto";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = process.cwd();
const PROVIDER_PATH = path.join(ROOT, "lib/v05/shared/sha256-provider.ts");
const IMPORT_HASH_PATH = path.join(ROOT, "lib/v05/import/hash.ts");
const MIGRATION_HASH_PATH = path.join(ROOT, "lib/v05/migration/hash.ts");

const checks = [];

const addCheck = (name, pass, details = undefined) => {
  checks.push({ name, pass, details });
};

const bytes = (value) => new TextEncoder().encode(value);

const toExactArrayBuffer = (view) =>
  view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);

const loadTsCommonJsModule = (filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const compiledModule = new Module(filename, null);
  compiledModule.filename = filename;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filename));
  compiledModule._compile(compiled, filename);
  return compiledModule.exports;
};

const providerSource = fs.readFileSync(PROVIDER_PATH, "utf8");
const importHashSource = fs.readFileSync(IMPORT_HASH_PATH, "utf8");
const migrationHashSource = fs.readFileSync(MIGRATION_HASH_PATH, "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

addCheck(
  "sharedProviderUsesWebCryptoFastPathAndNobleFallback",
  providerSource.includes("globalThis.crypto?.subtle") &&
    providerSource.includes('provider.digest("SHA-256", toArrayBuffer(bytes))') &&
    providerSource.includes('from "@noble/hashes/sha2.js"') &&
    providerSource.includes("nobleSha256(bytes)") &&
    providerSource.includes("catch"),
);
addCheck(
  "importHashReusesSharedProvider",
  importHashSource.includes('../shared/sha256-provider') &&
    !importHashSource.includes("globalThis.crypto?.subtle") &&
    !importHashSource.includes("hash_provider_unavailable"),
);
addCheck(
  "migrationHashReusesSharedProvider",
  migrationHashSource.includes('../shared/sha256-provider') &&
    !migrationHashSource.includes("globalThis.crypto?.subtle"),
);
addCheck(
  "nobleHashesDependencyDeclared",
  typeof packageJson.dependencies?.["@noble/hashes"] === "string",
  packageJson.dependencies?.["@noble/hashes"],
);

const provider = loadTsCommonJsModule(PROVIDER_PATH);
const {
  sha256Hex,
  sha256HexString,
  sha256HexWithProvider,
} = provider;

const vectors = [
  {
    name: "empty",
    input: bytes(""),
    expected: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  {
    name: "abc",
    input: bytes("abc"),
    expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  },
  {
    name: "unicode-airburg",
    input: bytes("空气堡🌬️"),
    expected: "30f795bc68502294bcee01424a3c2af32be7de347a68298fd6272eaa1789d8f7",
  },
  {
    name: "binary-00-01-02-03-fe-ff",
    input: new Uint8Array([0, 1, 2, 3, 254, 255]),
    expected: "7ea646958715ed687aa9ac2f5d785feb1a93411f4f25fdd6c7fcc6ab07fdf0e3",
  },
];

const vectorResults = [];
for (const vector of vectors) {
  const forcedFallback = await sha256HexWithProvider(vector.input, null);
  const webCryptoFastPath = await sha256HexWithProvider(vector.input, webcrypto.subtle);
  const arrayBufferFallback = await sha256HexWithProvider(toExactArrayBuffer(vector.input), null);
  const padded = new Uint8Array(vector.input.length + 2);
  padded[0] = 77;
  padded.set(vector.input, 1);
  padded[padded.length - 1] = 88;
  const offsetViewFallback = await sha256HexWithProvider(padded.subarray(1, padded.length - 1), null);
  vectorResults.push({
    name: vector.name,
    expected: vector.expected,
    forcedFallback,
    webCryptoFastPath,
    arrayBufferFallback,
    offsetViewFallback,
  });
  addCheck(
    `sha256Vector.${vector.name}`,
    forcedFallback === vector.expected &&
      webCryptoFastPath === vector.expected &&
      arrayBufferFallback === vector.expected &&
      offsetViewFallback === vector.expected,
    vectorResults.at(-1),
  );
}

const unicodeStringDigest = await sha256HexString("空气堡🌬️");
addCheck(
  "sha256StringUsesUtf8AndSharedProvider",
  unicodeStringDigest === vectors.find((vector) => vector.name === "unicode-airburg")?.expected,
  unicodeStringDigest,
);

const autoDigest = await sha256Hex(bytes("abc"));
const forcedFallbackDigest = await sha256HexWithProvider(bytes("abc"), null);
addCheck(
  "autoProviderAndForcedFallbackEquivalent",
  autoDigest === forcedFallbackDigest &&
    autoDigest === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  { autoDigest, forcedFallbackDigest },
);

const failed = checks.filter((check) => !check.pass);
const result = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  script: path.basename(fileURLToPath(import.meta.url)),
  source: {
    provider: path.relative(ROOT, PROVIDER_PATH),
    importHash: path.relative(ROOT, IMPORT_HASH_PATH),
    migrationHash: path.relative(ROOT, MIGRATION_HASH_PATH),
  },
  vectors: vectorResults,
  failed,
  checks,
};

console.log(JSON.stringify(result, null, 2));
if (failed.length > 0) process.exit(1);
