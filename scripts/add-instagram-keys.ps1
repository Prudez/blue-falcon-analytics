# Adds the Instagram credentials to this project's .env, replacing any
# earlier values. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File C:\dev\blue-falcon-analytics\scripts\add-instagram-keys.ps1
# The token prompt is hidden; nothing secret is echoed back.

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "ERROR: $envPath not found. Is the project folder intact?" -ForegroundColor Red
    exit 1
}

$secure = Read-Host "Paste META_ACCESS_TOKEN (input is hidden)" -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "No token entered; nothing was written." -ForegroundColor Red
    exit 1
}

$igId = Read-Host "Type IG_USER_ID (numbers only)"
if ($igId -notmatch '^\d+$') {
    Write-Host "IG_USER_ID must be numbers only; nothing was written." -ForegroundColor Red
    exit 1
}

# Drop any previous values of these two keys, then append the new ones.
$kept = Get-Content $envPath | Where-Object {
    $_ -notmatch '^\s*META_ACCESS_TOKEN=' -and $_ -notmatch '^\s*IG_USER_ID='
}
$kept + "META_ACCESS_TOKEN=$token" + "IG_USER_ID=$igId" | Set-Content -Path $envPath -Encoding ascii

$masked = $token.Substring(0, [Math]::Min(4, $token.Length)) + "..."
Write-Host ""
Write-Host "Written to $envPath" -ForegroundColor Green
Write-Host "  META_ACCESS_TOKEN=$masked ($($token.Length) characters)"
Write-Host "  IG_USER_ID=$igId"
Write-Host ""
Write-Host "Now restart the dev server, then use Sync now on the Marketing page."
