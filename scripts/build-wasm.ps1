# Builds the Rust WASM neural engine for NeuralMesh
# Requires: rustup + wasm-pack (https://rustwasm.github.io/wasm-pack/installer/)
# SIMD128 is required: the node tick and grid scatter autovectorize against it.

Write-Host "🦀 Building WASM neural engine (simd128)..." -ForegroundColor Cyan

$wasmDir = Join-Path (Join-Path $PSScriptRoot "..") "wasm"
Push-Location $wasmDir

try {
    $env:RUSTFLAGS = "-C target-feature=+simd128"
    wasm-pack build --target web --out-dir ../src/wasm/pkg --release
    if ($LASTEXITCODE -ne 0) { throw "wasm-pack build failed" }
    Write-Host "✅ WASM build complete (simd128)!" -ForegroundColor Green
} finally {
    Pop-Location
}
