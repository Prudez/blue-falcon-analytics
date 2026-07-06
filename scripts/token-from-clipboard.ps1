# Reads the Instagram access token DIRECTLY from the clipboard, so nothing
# has to be pasted by hand. Flow: click Copy in the Meta token popup, then
# run this immediately:
#   powershell -ExecutionPolicy Bypass -File C:\dev\blue-falcon-analytics\scripts\token-from-clipboard.ps1
# Only updates META_ACCESS_TOKEN; IG_USER_ID keeps its current value.

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "ERROR: $envPath not found." -ForegroundColor Red
    exit 1
}

$token = (Get-Clipboard -Raw)
if ($null -ne $token) { $token = $token.Trim() }

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "The clipboard is empty. Click Copy in the Meta token popup, then run this again." -ForegroundColor Red
    exit 1
}
if ($token -match "\s") {
    Write-Host "The clipboard holds text with spaces/line breaks, which a token never has." -ForegroundColor Red
    Write-Host "It starts with: $($token.Substring(0, [Math]::Min(20, $token.Length)))..."
    Write-Host "Click Copy in the Meta token popup, then run this again."
    exit 1
}
if ($token.Length -lt 60) {
    Write-Host "The clipboard text is only $($token.Length) characters; a real token is much longer." -ForegroundColor Red
    Write-Host "It starts with: $($token.Substring(0, [Math]::Min(10, $token.Length)))..."
    Write-Host "Click Copy in the Meta token popup, then run this again."
    exit 1
}

$kept = Get-Content $envPath | Where-Object { $_ -notmatch '^\s*META_ACCESS_TOKEN=' }
$kept + "META_ACCESS_TOKEN=$token" | Set-Content -Path $envPath -Encoding ascii

Write-Host ""
Write-Host "Token written to $envPath" -ForegroundColor Green
Write-Host ("  META_ACCESS_TOKEN=" + $token.Substring(0, 4) + "... (" + $token.Length + " characters)")
Write-Host ""
Write-Host "Restart the dev server, then Sync now on the Marketing page."
