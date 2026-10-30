# Gera o instalador e publica a versão do package.json no repositório público de releases.
# Antes: suba a versão em package.json (o updater só aceita número maior que o instalado).
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

# O token do gh só vive neste processo; nada é gravado em arquivo.
$env:GH_TOKEN = (gh auth token).Trim()
if (-not $env:GH_TOKEN) { throw 'Rode "gh auth login" antes.' }

npx vite build
npx electron-builder --win --publish always
