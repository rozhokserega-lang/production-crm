import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import gltfPipeline from "gltf-pipeline";
import obj2gltf from "obj2gltf";

const { processGltf, gltfToGlb } = gltfPipeline;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontedRoot = path.resolve(__dirname, "..");
const defaultImportDir = path.join(frontedRoot, "imports", "3d");
const defaultOutputDir = path.join(frontedRoot, "public", "models");
const logPrefix = "[3d-glb]";
const recommendedScale = 0.001;

function printHelp() {
  console.log(
    [
      "BAZIS -> GLB pipeline",
      "",
      "Usage:",
      "  npm run convert:3d",
      '  npm run convert:3d -- --b3d "C:\\path\\Model.b3d" --source "C:\\path\\export.obj"',
      "  npm run watch:3d",
      "",
      "Flags:",
      "  --input-dir <dir>   Folder to scan for .b3d files (default: fronted/imports/3d)",
      "  --output-dir <dir>  Folder for .glb and metadata (default: fronted/public/models)",
      "  --b3d <file>        Convert one B3D job",
      "  --source <file>     Explicit OBJ source for that B3D",
      "  --out <file>        Explicit output .glb path for that B3D",
      "  --watch             Watch import folder and auto-convert on changes",
      "  --force             Rebuild even if output is up to date",
      "  --draco             Apply Draco mesh compression before writing GLB",
      "  --help              Show help",
      "",
      "Important:",
      "  Direct B3D parsing is not implemented here.",
      "  The pipeline uses B3D as the canonical model name and automatically",
      "  converts a neighboring OBJ export to GLB.",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {
    inputDir: defaultImportDir,
    outputDir: defaultOutputDir,
    b3d: "",
    source: "",
    out: "",
    watch: false,
    force: false,
    draco: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input-dir") args.inputDir = resolveUserPath(argv[++i] || "");
    else if (arg === "--output-dir") args.outputDir = resolveUserPath(argv[++i] || "");
    else if (arg === "--b3d") args.b3d = resolveUserPath(argv[++i] || "");
    else if (arg === "--source") args.source = resolveUserPath(argv[++i] || "");
    else if (arg === "--out") args.out = resolveUserPath(argv[++i] || "");
    else if (arg === "--watch") args.watch = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--draco") args.draco = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.source && !args.b3d) {
    throw new Error("--source can only be used together with --b3d");
  }
  if (args.out && !args.b3d) {
    throw new Error("--out can only be used together with --b3d");
  }
  return args;
}

function resolveUserPath(value) {
  if (!value) return "";
  return path.resolve(value);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (_) {
    return false;
  }
}

function walkFiles(dirPath) {
  if (!dirExists(dirPath)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile()) results.push(fullPath);
  }
  return results;
}

function listFilesInSameDir(filePath, ext) {
  const dirPath = path.dirname(filePath);
  if (!dirExists(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .map((name) => path.join(dirPath, name))
    .filter((candidate) => fileExists(candidate) && path.extname(candidate).toLowerCase() === ext);
}

function getMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (_) {
    return 0;
  }
}

function parseObjDependencies(objPath) {
  const dependencies = [objPath];
  if (!fileExists(objPath)) return dependencies;
  const objDir = path.dirname(objPath);
  const objText = fs.readFileSync(objPath, "utf8");
  const mtlRefs = [];

  for (const line of objText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^mtllib\s+/i.test(trimmed)) continue;
    mtlRefs.push(trimmed.replace(/^mtllib\s+/i, "").trim());
  }

  for (const ref of mtlRefs) {
    const mtlPath = path.resolve(objDir, ref.replace(/\\/g, path.sep));
    if (!fileExists(mtlPath)) continue;
    dependencies.push(mtlPath);
    const mtlDir = path.dirname(mtlPath);
    const mtlText = fs.readFileSync(mtlPath, "utf8");
    for (const line of mtlText.split(/\r?\n/)) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(map_\S+|bump)\s+(.+)$/i);
      if (!match) continue;
      const texturePath = path.resolve(mtlDir, match[2].trim().replace(/^["']|["']$/g, "").replace(/\\/g, path.sep));
      if (fileExists(texturePath)) dependencies.push(texturePath);
    }
  }

  return Array.from(new Set(dependencies));
}

function formatColorNumber(value) {
  return Number.parseFloat(Number(value).toFixed(6)).toString();
}

function sanitizeMtlText(mtlPath, tempRoot, warnings) {
  const sourceDir = path.dirname(mtlPath);
  const lines = fs.readFileSync(mtlPath, "utf8").split(/\r?\n/);
  const out = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      out.push(rawLine);
      continue;
    }

    const colorMatch = trimmed.match(/^(Ka|Kd|Ks|Ke)\s+(\S+)\s+(\S+)\s+(\S+)$/i);
    if (colorMatch) {
      const keyword = colorMatch[1];
      const values = colorMatch.slice(2).map((part) => Number(part));
      if (values.every((value) => Number.isFinite(value))) {
        const normalized = Math.max(...values) > 1 ? values.map((value) => value / 255) : values;
        out.push(`${keyword} ${normalized.map(formatColorNumber).join(" ")}`);
        continue;
      }
    }

    const textureMatch = trimmed.match(/^(map_\S+|bump)\s+(.+)$/i);
    if (textureMatch) {
      const keyword = textureMatch[1];
      const originalRef = textureMatch[2].trim().replace(/^["']|["']$/g, "");
      const sourceTexturePath = path.resolve(sourceDir, originalRef.replace(/\\/g, path.sep));
      if (!fileExists(sourceTexturePath)) {
        warnings.push(`Missing texture removed from material: ${sourceTexturePath}`);
        continue;
      }
      const normalizedRef = normalizeSlashes(originalRef);
      const tempTexturePath = path.join(tempRoot, normalizedRef.replace(/\//g, path.sep));
      ensureDir(path.dirname(tempTexturePath));
      fs.copyFileSync(sourceTexturePath, tempTexturePath);
      out.push(`${keyword} ${normalizedRef}`);
      continue;
    }

    out.push(rawLine);
  }

  return out.join("\n");
}

function stageObjBundle(objPath) {
  const warnings = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crm-3d-glb-"));
  const objDir = path.dirname(objPath);
  const objName = path.basename(objPath);
  const objLines = fs.readFileSync(objPath, "utf8").split(/\r?\n/);
  const stagedObjLines = [];
  const stagedMtls = new Map();

  for (const rawLine of objLines) {
    const trimmed = rawLine.trim();
    if (!/^mtllib\s+/i.test(trimmed)) {
      stagedObjLines.push(rawLine);
      continue;
    }

    const ref = trimmed.replace(/^mtllib\s+/i, "").trim();
    const normalizedRef = normalizeSlashes(ref);
    const sourceMtlPath = path.resolve(objDir, ref.replace(/\\/g, path.sep));

    if (!fileExists(sourceMtlPath)) {
      warnings.push(`Missing MTL removed from OBJ: ${sourceMtlPath}`);
      continue;
    }

    if (!stagedMtls.has(normalizedRef)) {
      const tempMtlPath = path.join(tempRoot, normalizedRef.replace(/\//g, path.sep));
      ensureDir(path.dirname(tempMtlPath));
      fs.writeFileSync(tempMtlPath, sanitizeMtlText(sourceMtlPath, tempRoot, warnings), "utf8");
      stagedMtls.set(normalizedRef, tempMtlPath);
    }

    stagedObjLines.push(`mtllib ${normalizedRef}`);
  }

  const tempObjPath = path.join(tempRoot, objName);
  fs.writeFileSync(tempObjPath, stagedObjLines.join("\n"), "utf8");

  return { tempRoot, tempObjPath, warnings };
}

function removeDirSafe(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (_) {
    // ignore temp cleanup failures
  }
}

function chooseObjSourceForB3d(b3dPath, explicitSource = "") {
  const warnings = [];

  if (explicitSource) {
    if (!fileExists(explicitSource)) {
      throw new Error(`Explicit source file not found: ${explicitSource}`);
    }
    if (path.extname(explicitSource).toLowerCase() !== ".obj") {
      throw new Error(`Only OBJ export is supported right now: ${explicitSource}`);
    }
    return { sourcePath: explicitSource, warnings };
  }

  const dirPath = path.dirname(b3dPath);
  const stem = path.basename(b3dPath, path.extname(b3dPath));
  const sameNameObj = path.join(dirPath, `${stem}.obj`);
  if (fileExists(sameNameObj)) {
    return { sourcePath: sameNameObj, warnings };
  }

  const objCandidates = listFilesInSameDir(b3dPath, ".obj");
  if (objCandidates.length === 1) {
    warnings.push(`Using the only OBJ export found in folder: ${path.basename(objCandidates[0])}`);
    return { sourcePath: objCandidates[0], warnings };
  }

  if (objCandidates.length > 1) {
    const b3dMtime = getMtimeMs(b3dPath);
    const nearest = [...objCandidates].sort(
      (left, right) => Math.abs(getMtimeMs(left) - b3dMtime) - Math.abs(getMtimeMs(right) - b3dMtime)
    )[0];
    warnings.push(`Multiple OBJ exports found; picked the closest by modified time: ${path.basename(nearest)}`);
    return { sourcePath: nearest, warnings };
  }

  const daeCandidates = listFilesInSameDir(b3dPath, ".dae");
  if (daeCandidates.length > 0) {
    warnings.push("DAE export exists, but this Node pipeline currently auto-converts only OBJ.");
  }

  throw new Error(`No OBJ export found next to B3D: ${b3dPath}`);
}

function isOutputCurrent(outputGlbPath, outputMetaPath, inputFiles) {
  if (!fileExists(outputGlbPath) || !fileExists(outputMetaPath)) return false;
  const newestInput = Math.max(...inputFiles.map(getMtimeMs));
  return getMtimeMs(outputGlbPath) >= newestInput && getMtimeMs(outputMetaPath) >= newestInput;
}

async function convertObjToGlb(objPath, outputGlbPath, options) {
  const staged = stageObjBundle(objPath);
  try {
    if (!options.draco) {
      const glb = await obj2gltf(staged.tempObjPath, {
        binary: true,
        checkTransparency: true,
        doubleSidedMaterial: true,
      });
      fs.writeFileSync(outputGlbPath, glb);
      return { warnings: staged.warnings };
    }

    const gltf = await obj2gltf(staged.tempObjPath, {
      binary: false,
      checkTransparency: true,
      doubleSidedMaterial: true,
    });
    const processed = await processGltf(gltf, {
      dracoOptions: {
        compressionLevel: 10,
      },
    });
    const glbResult = await gltfToGlb(processed.gltf);
    fs.writeFileSync(outputGlbPath, glbResult.glb);
    return { warnings: staged.warnings };
  } finally {
    removeDirSafe(staged.tempRoot);
  }
}

function buildOutputPaths(b3dPath, args) {
  if (args.out) {
    const outputGlbPath = args.out.toLowerCase().endsWith(".glb") ? args.out : `${args.out}.glb`;
    const outputMetaPath = outputGlbPath.replace(/\.glb$/i, ".meta.json");
    return { outputGlbPath, outputMetaPath };
  }

  const stem = path.basename(b3dPath, path.extname(b3dPath));
  const outputGlbPath = path.join(args.outputDir, `${stem}.glb`);
  const outputMetaPath = path.join(args.outputDir, `${stem}.meta.json`);
  return { outputGlbPath, outputMetaPath };
}

function relativeToFronted(filePath) {
  const relativePath = path.relative(frontedRoot, filePath);
  if (!relativePath) return ".";
  if (path.isAbsolute(relativePath) || relativePath.startsWith("..")) return "";
  return normalizeSlashes(relativePath);
}

function writeModelMeta(b3dPath, sourcePath, outputGlbPath, outputMetaPath, warnings, options) {
  const relativeToPublicModels = path.relative(defaultOutputDir, outputGlbPath);
  const publicUrl =
    !path.isAbsolute(relativeToPublicModels) && !relativeToPublicModels.startsWith("..")
      ? `/models/${normalizeSlashes(relativeToPublicModels)}`
      : "";

  const meta = {
    version: 1,
    generatedAt: new Date().toISOString(),
    modelName: path.basename(b3dPath, path.extname(b3dPath)),
    originalFiles: {
      b3d: b3dPath,
      sourceObj: sourcePath,
    },
    output: {
      glb: outputGlbPath,
      publicUrl,
      bytes: fileExists(outputGlbPath) ? fs.statSync(outputGlbPath).size : 0,
    },
    conversion: {
      sourceFormat: "obj",
      draco: Boolean(options.draco),
      unit: "mm",
      recommendedScale,
    },
    warnings,
    paths: {
      frontedRelativeGlb: relativeToFronted(outputGlbPath),
      frontedRelativeMeta: relativeToFronted(outputMetaPath),
    },
  };

  fs.writeFileSync(outputMetaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

function updateIndexManifest(outputDir) {
  ensureDir(outputDir);
  const entries = fs
    .readdirSync(outputDir)
    .filter((name) => name.toLowerCase().endsWith(".meta.json") && name.toLowerCase() !== "index.json")
    .sort((left, right) => left.localeCompare(right, "en"));

  const models = [];
  for (const fileName of entries) {
    const fullPath = path.join(outputDir, fileName);
    try {
      models.push(JSON.parse(fs.readFileSync(fullPath, "utf8")));
    } catch (error) {
      console.warn(`${logPrefix} skipped broken metadata ${fullPath}: ${error.message || error}`);
    }
  }

  const indexPath = path.join(outputDir, "index.json");
  fs.writeFileSync(indexPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), models }, null, 2)}\n`, "utf8");
}

async function convertSingleJob(b3dPath, args) {
  if (!fileExists(b3dPath)) {
    throw new Error(`B3D file not found: ${b3dPath}`);
  }

  const { sourcePath, warnings: sourceWarnings } = chooseObjSourceForB3d(b3dPath, args.source);
  const dependencyFiles = Array.from(new Set([b3dPath, ...parseObjDependencies(sourcePath)]));
  const { outputGlbPath, outputMetaPath } = buildOutputPaths(b3dPath, args);
  ensureDir(path.dirname(outputGlbPath));

  if (!args.force && isOutputCurrent(outputGlbPath, outputMetaPath, dependencyFiles)) {
    console.log(`${logPrefix} up to date: ${outputGlbPath}`);
    return { status: "skipped", outputGlbPath };
  }

  console.log(`${logPrefix} converting ${path.basename(b3dPath)} -> ${path.basename(outputGlbPath)}`);
  const result = await convertObjToGlb(sourcePath, outputGlbPath, args);
  const allWarnings = [...sourceWarnings, ...result.warnings];
  writeModelMeta(b3dPath, sourcePath, outputGlbPath, outputMetaPath, allWarnings, args);

  if (allWarnings.length > 0) {
    for (const warning of allWarnings) {
      console.warn(`${logPrefix} warning: ${warning}`);
    }
  }

  console.log(`${logPrefix} done: ${outputGlbPath}`);
  return { status: "converted", outputGlbPath };
}

async function scanJobs(args) {
  if (args.b3d) {
    await convertSingleJob(args.b3d, args);
    updateIndexManifest(path.dirname(buildOutputPaths(args.b3d, args).outputGlbPath));
    return;
  }

  ensureDir(args.inputDir);
  ensureDir(args.outputDir);
  const b3dFiles = walkFiles(args.inputDir).filter((filePath) => path.extname(filePath).toLowerCase() === ".b3d");

  if (b3dFiles.length === 0) {
    console.log(`${logPrefix} no .b3d files found in ${args.inputDir}`);
    updateIndexManifest(args.outputDir);
    return;
  }

  for (const b3dPath of b3dFiles.sort((left, right) => left.localeCompare(right, "en"))) {
    try {
      await convertSingleJob(b3dPath, args);
    } catch (error) {
      console.error(`${logPrefix} failed for ${b3dPath}: ${error.message || error}`);
    }
  }

  updateIndexManifest(args.outputDir);
}

function watchInputDir(args) {
  ensureDir(args.inputDir);
  let timer = null;

  const scheduleScan = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      scanJobs(args).catch((error) => {
        console.error(`${logPrefix} watch scan failed: ${error.message || error}`);
      });
    }, 500);
  };

  console.log(`${logPrefix} watching ${args.inputDir}`);
  fs.watch(args.inputDir, { recursive: true }, (_eventType, fileName) => {
    if (!fileName) return;
    const lower = String(fileName).toLowerCase();
    if (!lower.endsWith(".b3d") && !lower.endsWith(".obj") && !lower.endsWith(".mtl") && !lower.endsWith(".bmp")) {
      return;
    }
    scheduleScan();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  await scanJobs(args);

  if (!args.watch) return;

  watchInputDir(args);
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(`${logPrefix} ${error.message || error}`);
  process.exit(1);
});
