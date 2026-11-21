# NEXO HUB - gateway GitHub OAuth de testes (Windows / Node 22+)
# Nao guarda segredos num ficheiro. Nunca publicar o terminal nem enviar o Client Secret por chat.
$ErrorActionPreference = 'Stop'
$env:GATEWAY_ORIGIN = 'http://127.0.0.1:8788'
$env:GITHUB_OWNER_ID = '353932686'
$env:RAILWAY_PROJECT_ID = '7636e62d-ae69-44eb-ad29-dca7069ac054'
$env:RAILWAY_ENVIRONMENT_ID = 'af1ae01b-f92e-4ee3-ade6-b849cfb00847'
$env:GITHUB_OAUTH_CLIENT_ID = Read-Host 'GitHub OAuth Client ID (NEXO HUB Login)'
$secret = Read-Host 'GitHub OAuth Client Secret (oculto)' -AsSecureString
$env:GITHUB_OAUTH_CLIENT_SECRET = [System.Net.NetworkCredential]::new('', $secret).Password
try {
  Write-Host 'NEXO Gateway local: http://127.0.0.1:8788'
  Write-Host 'Sem token Railway, a autenticacao funciona mas /api/status devolve 503 (esperado).'
  Write-Host 'Para parar: Ctrl+C.'
  node (Join-Path $PSScriptRoot 'github-gateway.mjs')
} finally {
  Remove-Item Env:GITHUB_OAUTH_CLIENT_SECRET -ErrorAction SilentlyContinue
  Remove-Item Env:GITHUB_OAUTH_CLIENT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:RAILWAY_PROJECT_TOKEN -ErrorAction SilentlyContinue
}
