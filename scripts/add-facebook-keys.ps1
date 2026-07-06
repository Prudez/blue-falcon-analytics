# Adds the Facebook sync credentials to this project's .env, replacing any
# earlier values. Run from anywhere:
#   powershell -ep bypass -file C:\dev\blue-falcon-analytics\scripts\add-facebook-keys.ps1
# Secrets are read from the CLIPBOARD (copy each value when asked, then
# press Enter) so nothing has to be pasted into the console by hand.

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "ERROR: $envPath not found." -ForegroundColor Red
    exit 1
}

function Read-FromClipboard($label, $minLength, $pattern) {
    while ($true) {
        Read-Host "Copy the $label to the clipboard, then press Enter here"
        $value = (Get-Clipboard -Raw)
        if ($null -ne $value) { $value = $value.Trim() }
        if ([string]::IsNullOrWhiteSpace($value)) {
            Write-Host "  Clipboard is empty. Copy the $label and try again." -ForegroundColor Yellow
            continue
        }
        if ($value -match "\s") {
            Write-Host "  Clipboard holds text with spaces ('$($value.Substring(0, [Math]::Min(15, $value.Length)))...'). Copy just the $label." -ForegroundColor Yellow
            continue
        }
        if ($value.Length -lt $minLength) {
            Write-Host "  That is only $($value.Length) characters, too short for the $label." -ForegroundColor Yellow
            continue
        }
        if ($pattern -and $value -notmatch $pattern) {
            Write-Host "  That does not look like the $label (it starts with '$($value.Substring(0, [Math]::Min(6, $value.Length)))')." -ForegroundColor Yellow
            continue
        }
        return $value
    }
}

$appId = Read-Host "Type the App ID (numbers only, from App settings -> Basic)"
if ($appId -notmatch '^\d+$') {
    Write-Host "The App ID must be numbers only; nothing was written." -ForegroundColor Red
    exit 1
}

$appSecret = Read-FromClipboard "App Secret" 16 $null
$fbToken = Read-FromClipboard "Facebook access token (EAA...)" 60 '^EAA'

$kept = Get-Content $envPath | Where-Object {
    $_ -notmatch '^\s*FB_ACCESS_TOKEN=' -and
    $_ -notmatch '^\s*META_APP_ID=' -and
    $_ -notmatch '^\s*META_APP_SECRET='
}
$kept + "META_APP_ID=$appId" + "META_APP_SECRET=$appSecret" + "FB_ACCESS_TOKEN=$fbToken" |
    Set-Content -Path $envPath -Encoding ascii

Write-Host ""
Write-Host "Written to $envPath" -ForegroundColor Green
Write-Host ("  META_APP_ID=$appId")
Write-Host ("  META_APP_SECRET=" + $appSecret.Substring(0, 3) + "... (" + $appSecret.Length + " characters)")
Write-Host ("  FB_ACCESS_TOKEN=" + $fbToken.Substring(0, 4) + "... (" + $fbToken.Length + " characters)")
Write-Host ""
Write-Host "Restart the dev server, then Sync now under Facebook on the Marketing page."
