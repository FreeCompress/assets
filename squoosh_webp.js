/**
 * squoosh_webp.js — single-file ESM entry for the vendored libwebp encoder.
 *
 * Upload this file TOGETHER WITH (same repo folder, original filenames):
 *   webp_enc.js, webp_enc.wasm, webp_enc_simd.js, webp_enc_simd.wasm
 * from @jsquash/webp@1.5.0 (Apache-2.0, https://github.com/jamsinclair/jSquash).
 * Each codec glue locates its own .wasm relative to its own URL, so all five
 * files must stay side by side (e.g. freecompress/assets repo root).
 *
 * API (matches what js/webp-compressor/worker.js expects):
 *   import mod from '<cdn>/squoosh_webp.js';
 *   await mod.default();                                  // init (awaitable)
 *   const buf = await mod.encode(imageData, { quality }); // -> ArrayBuffer
 *   const buf = await mod.encode(imageData, { lossless: true });
 *
 * Standalone by design: the only npm-only import upstream (wasm-feature-detect)
 * is replaced by the tiny inlined SIMD probe below (fail-safe: any probe
 * error simply selects the scalar build, which runs everywhere).
 */
import webpEncScalar from './webp_enc.js';
import webpEncSimd from './webp_enc_simd.js';

// ---- inlined from @jsquash/webp utils.js ----
function initEmscriptenModule(moduleFactory, wasmModule, moduleOptionOverrides = {}) {
  let instantiateWasm;
  if (wasmModule) {
    instantiateWasm = (imports, callback) => {
      const instance = new WebAssembly.Instance(wasmModule, imports);
      callback(instance);
      return instance.exports;
    };
  }
  return moduleFactory({
    // Just to be safe, don't automatically invoke any wasm functions
    noInitialRun: true,
    instantiateWasm,
    ...moduleOptionOverrides,
  });
}

// ---- minimal SIMD probe (replaces wasm-feature-detect) ----
// Fail-safe: false (or any throw) just means "use the scalar build".
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123,
  3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);
async function supportsSimd() {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
}

// ---- inlined from @jsquash/webp meta.js (encode defaults = WebPConfig) ----
const defaultOptions = {
  quality: 75,
  target_size: 0,
  target_PSNR: 0,
  method: 4,
  sns_strength: 50,
  filter_strength: 60,
  filter_sharpness: 0,
  filter_type: 1,
  partitions: 0,
  segments: 4,
  pass: 1,
  show_compressed: 0,
  preprocessing: 0,
  autofilter: 0,
  partition_limit: 0,
  alpha_compression: 1,
  alpha_filtering: 1,
  alpha_quality: 100,
  lossless: 0,
  exact: 0,
  image_hint: 0,
  emulate_jpeg_size: 0,
  thread_level: 0,
  low_memory: 0,
  near_lossless: 100,
  use_delta_palette: 0,
  use_sharp_yuv: 0,
};

let emscriptenModule = null;
let usingSimd = false;

async function init(module, moduleOptionOverrides) {
  let actualModule = module;
  let actualOptions = moduleOptionOverrides;
  // If only one argument is provided and it's not a WebAssembly.Module
  if (arguments.length === 1 && !(module instanceof WebAssembly.Module)) {
    actualModule = undefined;
    actualOptions = module;
  }
  if (await supportsSimd()) {
    usingSimd = true;
    emscriptenModule = initEmscriptenModule(webpEncSimd, actualModule, actualOptions);
    return emscriptenModule;
  }
  usingSimd = false;
  emscriptenModule = initEmscriptenModule(webpEncScalar, actualModule, actualOptions);
  return emscriptenModule;
}

async function encode(data, options = {}) {
  if (!emscriptenModule) emscriptenModule = init();
  const _options = { ...defaultOptions, ...options };
  const module = await emscriptenModule;
  const result = module.encode(data.data, data.width, data.height, _options);
  if (!result) throw new Error('Encoding error.');
  return result.buffer;
}

export { init, encode, usingSimd };
export default init;
