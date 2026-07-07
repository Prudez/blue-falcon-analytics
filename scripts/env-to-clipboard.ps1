# Walks through the deployment env values one at a time, loading each into
# the clipboard so it can be pasted straight into Render's (or any host's)
# environment-variable form. Nothing is printed except names and lengths.
#   powershell -ep bypass -file C:\dev\blue-falcon-analytics\scripts\env-to-clipboard.ps1

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "ERROR: $envPath not found." -ForegroundColor Red
    exit 1
}

$keys = "DATABASE_URL", "META_ACCESS_TOKEN", "IG_USER_ID",
        "FB_ACCESS_TOKEN", "META_APP_ID", "META_APP_SECRET"
$content = Get-Content $envPath

Write-Host "For each value: it goes into your clipboard, you paste it into the"
Write-Host "host's form (variable name shown), then press Enter here for the next."

foreach ($k in $keys) {
    $line = $content | Where-Object { $_ -match "^$k=" } | Select-Object -First 1
    if (-not $line) {
        Write-Host "$k : not found in .env, skipping" -ForegroundColor Yellow
        continue
    }
    $value = $line.Substring($k.Length + 1)
    Set-Clipboard -Value $value
    Write-Host ""
    Write-Host "$k" -ForegroundColor Green -NoNewline
    Write-Host " is in the clipboard ($($value.Length) characters)."
    Write-Host "  In Render: Key = $k, Value = paste (Ctrl+V)."
    Read-Host "  Press Enter here when pasted, for the next value"
}

Write-Host ""
Write-Host "All copied. Remember the seventh variable: APP_PASSWORD - you invent"
Write-Host "that one (12+ characters) and type it into Render directly."
