# Builds the Rust WASM neural engine for NeuralMesh
# Requires: rustup + wasm-pack (https://rustwasm.github.io/wasm-pack/installer/)

Write-Host "🦀 Building WASM neural engine..." -ForegroundColor Cyan

$wasmDir = Join-Path $PSScriptRoot ".." "wasm"
Push-Location $wasmDir

try {
    wasm-pack build --target web --out-dir ../src/wasm/pkg --release
    if ($LASTEXITCODE -ne 0) { throw "wasm-pack build failed" }
    Write-Host "✅ WASM build complete!" -ForegroundColor Green
} finally {
    Pop-Location
}
