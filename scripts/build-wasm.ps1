# Thin Windows wrapper — the real build is scripts/build-wasm.mjs
& node (Join-Path $PSScriptRoot "build-wasm.mjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
