const fs = require("fs");
const path = require("path");

const modelsDir = path.join(__dirname, "..", "src", "models");
const files = fs.readdirSync(modelsDir).filter((file) => file.endsWith(".ts"));

function getFieldLevelIndexedFields(source) {
  const matches = [...source.matchAll(/(\w+)\s*:\s*\{[^{}]*index\s*:\s*true[^{}]*\}/g)];
  return new Set(matches.map((m) => m[1]));
}

function getSchemaLevelIndexedFields(source) {
  const matches = [...source.matchAll(/\.index\(\{\s*"?([\w.]+)"?\s*:/g)];
  return new Set(matches.map((m) => m[1].split(".")[0]));
}

const duplicates = [];

for (const file of files) {
  const fullPath = path.join(modelsDir, file);
  const content = fs.readFileSync(fullPath, "utf8");
  const fieldLevel = getFieldLevelIndexedFields(content);
  const schemaLevel = getSchemaLevelIndexedFields(content);

  for (const field of fieldLevel) {
    if (schemaLevel.has(field)) {
      duplicates.push({ file, field });
    }
  }
}

if (duplicates.length > 0) {
  console.error("Duplicate field-level and schema-level index declarations found:");
  for (const duplicate of duplicates) {
    console.error(`- ${duplicate.file}: ${duplicate.field}`);
  }
  process.exit(1);
}

console.log("Model index check passed: no duplicate field/schema index declarations found.");
