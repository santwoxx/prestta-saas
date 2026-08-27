# ---------------------------------------------------------------------------
# Prestta - deploy no Fly.io (Windows PowerShell)
#
# Pre-requisito (uma vez so, no SEU terminal):
#   iwr https://fly.io/install.ps1 -useb | iex
#   flyctl auth login
#
# Uso:
#   .\scripts\deploy-fly.ps1 -AppName prestta -SuperadminEmail voce@gmail.com
#
# O script e idempotente: rodar de novo so publica a versao nova.
# ---------------------------------------------------------------------------
param(
  [Parameter(Mandatory = $true)][string]$AppName,
  [Parameter(Mandatory = $true)][string]$SuperadminEmail,
  [string]$Region = "gru",                 # gru = Sao Paulo
  [string]$FirebaseProjectId = "prestta",
  [int]$VolumeSizeGb = 1
)

$ErrorActionPreference = "Stop"
$fly = Join-Path $env:USERPROFILE ".fly\bin\flyctl.exe"
if (-not (Test-Path $fly)) { $fly = "flyctl" }

function Step($n, $t) { Write-Host "`n[$n] $t" -ForegroundColor Cyan }

# --- 0. Confere o login -----------------------------------------------------
Step 0 "Verificando login no Fly"
& $fly auth whoami
if (-not $?) { throw "Rode 'flyctl auth login' no seu terminal antes de continuar." }

# --- 1. Cria o app ----------------------------------------------------------
Step 1 "Criando o app '$AppName' (ignore o erro se ja existir)"
& $fly apps create $AppName --org personal 2>&1 | Out-Host

# fly.toml precisa apontar para o nome escolhido
$tomlPath = Join-Path $PSScriptRoot "..\fly.toml"
$toml = Get-Content $tomlPath -Raw
$toml = $toml -replace '(?m)^app = ".*"$', "app = `"$AppName`""
$toml = $toml -replace '(?m)^primary_region = ".*"', "primary_region = `"$Region`""
Set-Content -Path $tomlPath -Value $toml -Encoding utf8 -NoNewline
Write-Host "  fly.toml atualizado: app=$AppName region=$Region"

# --- 2. Volume persistente --------------------------------------------------
Step 2 "Criando o volume 'prestta_data' ($VolumeSizeGb GB) em $Region"
$volumes = (& $fly volumes list -a $AppName --json 2>$null) | Out-String
if ($volumes -match "prestta_data") {
  Write-Host "  Volume ja existe, mantendo."
} else {
  & $fly volumes create prestta_data --size $VolumeSizeGb --region $Region -a $AppName --yes | Out-Host
}

# --- 3. Segredos ------------------------------------------------------------
Step 3 "Configurando segredos"
$appSecret = node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
$webhookSecret = node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
$appUrl = "https://$AppName.fly.dev"

$existing = (& $fly secrets list -a $AppName 2>$null) | Out-String
if ($existing -match "APP_SECRET") {
  Write-Host "  Segredos ja configurados - mantendo os atuais."
  Write-Host "  (para trocar: flyctl secrets set APP_SECRET=... -a $AppName)"
} else {
  & $fly secrets set `
    "APP_SECRET=$appSecret" `
    "APP_URL=$appUrl" `
    "FIREBASE_PROJECT_ID=$FirebaseProjectId" `
    "SUPERADMIN_EMAIL=$SuperadminEmail" `
    "CAKTO_WEBHOOK_SECRET=$webhookSecret" `
    -a $AppName --stage | Out-Host

  Write-Host ""
  Write-Host "  ================= GUARDE ESTE VALOR =================" -ForegroundColor Yellow
  Write-Host "  CAKTO_WEBHOOK_SECRET = $webhookSecret" -ForegroundColor Yellow
  Write-Host "  Cole no painel da Cakto -> Ferramentas -> Webhooks" -ForegroundColor Yellow
  Write-Host "  URL do webhook: $appUrl/api/webhooks/cakto" -ForegroundColor Yellow
  Write-Host "  =====================================================" -ForegroundColor Yellow
}

# --- 4. Deploy --------------------------------------------------------------
Step 4 "Publicando (o build roda nos servidores do Fly)"
& $fly deploy -a $AppName --ha=false | Out-Host
if (-not $?) { throw "O deploy falhou. Veja o log acima e rode 'flyctl logs -a $AppName'." }

# --- 5. Superadmin ----------------------------------------------------------
Step 5 "Criando seu acesso de superadmin ($SuperadminEmail)"
& $fly ssh console -a $AppName -C "npm run bootstrap" | Out-Host

# --- 6. Resumo --------------------------------------------------------------
Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host " Prestta no ar: $appUrl" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host @"

Faltam 3 passos manuais:

 1. FIREBASE - Console -> Authentication -> Settings -> Authorized domains
    Adicione: $AppName.fly.dev
    (sem isso o login com Google recusa com 'auth/unauthorized-domain')

 2. CAKTO - Ferramentas -> Webhooks
    URL:     $appUrl/api/webhooks/cakto
    Segredo: o CAKTO_WEBHOOK_SECRET mostrado acima

 3. CAKTO - crie as 6 ofertas e cole os links:
    flyctl secrets set ``
      CAKTO_CHECKOUT_ESSENCIAL_MENSAL="https://pay.cakto.com.br/xxx" ``
      CAKTO_CHECKOUT_ESSENCIAL_ANUAL="https://pay.cakto.com.br/xxx" ``
      CAKTO_CHECKOUT_PRO_MENSAL="https://pay.cakto.com.br/xxx" ``
      CAKTO_CHECKOUT_PRO_ANUAL="https://pay.cakto.com.br/xxx" ``
      CAKTO_CHECKOUT_ESCALA_MENSAL="https://pay.cakto.com.br/xxx" ``
      CAKTO_CHECKOUT_ESCALA_ANUAL="https://pay.cakto.com.br/xxx" ``
      -a $AppName

Depois entre em $appUrl/entrar com o Google ($SuperadminEmail)
para chegar no painel /saas.
"@
