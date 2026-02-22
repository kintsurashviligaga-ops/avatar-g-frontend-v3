$ErrorActionPreference = 'Stop'

$secret = ($env:TELEGRAM_WEBHOOK_SECRET | ForEach-Object { $_ })
if ([string]::IsNullOrWhiteSpace($secret)) {
  Write-Host '[smoke] TELEGRAM_WEBHOOK_SECRET is required in env.'
  exit 1
}

$base = 'http://localhost:3000/api/agent-g/telegram'

function Invoke-WebhookTest {
  param(
    [string]$Name,
    [hashtable]$Headers,
    [string]$Body,
    [int]$ExpectedStatus,
    [string]$ExpectedContains
  )

  try {
    $resp = Invoke-WebRequest -Uri $base -Method Post -Headers $Headers -Body $Body -ContentType 'application/json' -TimeoutSec 15
    $status = [int]$resp.StatusCode
    $content = $resp.Content
  } catch {
    $status = 0
    $content = $_.Exception.Message
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
  }

  $okStatus = ($status -eq $ExpectedStatus)
  $okBody = if ([string]::IsNullOrWhiteSpace($ExpectedContains)) { $true } else { $content -like "*$ExpectedContains*" }

  [PSCustomObject]@{
    test = $Name
    status = $status
    expected_status = $ExpectedStatus
    status_ok = $okStatus
    body_ok = $okBody
    content = $content
  }
}

$tests = @()

$tests += Invoke-WebhookTest `
  -Name 'invalid_secret_returns_403' `
  -Headers @{ 'X-Telegram-Bot-Api-Secret-Token' = 'invalid-secret' } `
  -Body '{"update_id":1,"message":{"message_id":1,"text":"hello","chat":{"id":"1","type":"private"},"from":{"id":"99","is_bot":false}}}' `
  -ExpectedStatus 403 `
  -ExpectedContains 'Invalid webhook secret header'

$tests += Invoke-WebhookTest `
  -Name 'valid_secret_no_message_returns_200_ignored' `
  -Headers @{ 'X-Telegram-Bot-Api-Secret-Token' = $secret } `
  -Body '{"update_id":2}' `
  -ExpectedStatus 200 `
  -ExpectedContains '"ignored":true'

$tests += Invoke-WebhookTest `
  -Name 'valid_secret_with_message_returns_200' `
  -Headers @{ 'X-Telegram-Bot-Api-Secret-Token' = $secret } `
  -Body '{"update_id":3,"message":{"message_id":2,"text":"hello","chat":{"id":"1","type":"private"},"from":{"id":"99","is_bot":false}}}' `
  -ExpectedStatus 200 `
  -ExpectedContains '"ok":true'

$tests | Format-Table -AutoSize

$failed = $tests | Where-Object { -not $_.status_ok -or -not $_.body_ok }
if ($failed) {
  Write-Host "[smoke] FAILED tests: $($failed.Count)"
  exit 1
}

Write-Host '[smoke] All tests passed.'
