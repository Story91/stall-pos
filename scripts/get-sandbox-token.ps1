# Prints a sandbox access token (valid 3-8 h) and writes it to .env as PAYPAL_ACCESS_TOKEN.
# Usage: .\scripts\get-sandbox-token.ps1   (reads PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET from .env)
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path $envFile)) { throw ".env not found. Copy .env.example to .env and fill PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET." }
$vars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') { $vars[$matches[1]] = $matches[2] }
}
if (-not $vars['PAYPAL_CLIENT_ID'] -or -not $vars['PAYPAL_CLIENT_SECRET']) { throw "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing in .env" }
$pair = "$($vars['PAYPAL_CLIENT_ID']):$($vars['PAYPAL_CLIENT_SECRET'])"
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$resp = Invoke-RestMethod -Method Post -Uri 'https://api-m.sandbox.paypal.com/v1/oauth2/token' `
  -Headers @{ Authorization = "Basic $basic" } -ContentType 'application/x-www-form-urlencoded' -Body 'grant_type=client_credentials'
$token = $resp.access_token
$content = Get-Content $envFile -Raw
if ($content -match '(?m)^PAYPAL_ACCESS_TOKEN=.*$') {
  $content = $content -replace '(?m)^PAYPAL_ACCESS_TOKEN=.*$', "PAYPAL_ACCESS_TOKEN=$token"
} else {
  $content = $content.TrimEnd() + "`nPAYPAL_ACCESS_TOKEN=$token`n"
}
Set-Content -Path $envFile -Value $content -Encoding utf8 -NoNewline
Write-Host "Token written to .env (expires in $($resp.expires_in) s). First 12 chars: $($token.Substring(0,12))..."
