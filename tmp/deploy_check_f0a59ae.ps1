$base='https://avatarg-backend.vercel.app'
$target='f0a59ae'
$max=18
$sleep=10

$summary=[ordered]@{
  base=$base
  targetPrefix=$target
  versionPoll=[ordered]@{
    matched=$false
    attempts=0
    lastStatus=$null
    lastVersion=$null
  }
  checks=[ordered]@{}
}

function Req([string]$method,[string]$url,[string]$body='') {
  try {
    if ($body -ne '') {
      $r=Invoke-WebRequest -Uri $url -Method $method -UseBasicParsing -ContentType 'application/json' -Body $body
    } else {
      $r=Invoke-WebRequest -Uri $url -Method $method -UseBasicParsing
    }
    $st=[int]$r.StatusCode
    $raw=[string]$r.Content
  } catch {
    if ($_.Exception.Response) {
      $resp=$_.Exception.Response
      $st=[int]$resp.StatusCode.value__
      $sr=New-Object System.IO.StreamReader($resp.GetResponseStream())
      $raw=$sr.ReadToEnd()
      $sr.Close()
    } else {
      $st=-1
      $raw=$_.Exception.Message
    }
  }

  $js=$null
  if ($raw) {
    try { $js=$raw | ConvertFrom-Json -ErrorAction Stop } catch {}
  }

  return [ordered]@{status=$st; raw=$raw; json=$js}
}

for ($i=1; $i -le $max; $i++) {
  $v=Req 'GET' "$base/api/version"
  $ver=$null

  if ($v.json) {
    if ($v.json.version) { $ver=[string]$v.json.version }
    elseif ($v.json.commit) { $ver=[string]$v.json.commit }
    elseif ($v.json.sha) { $ver=[string]$v.json.sha }
  }

  if (-not $ver -and $v.raw) {
    if ($v.raw -match '"version"\s*:\s*"([^"]+)"') { $ver=$matches[1] }
    elseif ($v.raw -match '"commit"\s*:\s*"([^"]+)"') { $ver=$matches[1] }
    elseif ($v.raw -match '"sha"\s*:\s*"([^"]+)"') { $ver=$matches[1] }
  }

  $summary.versionPoll.attempts=$i
  $summary.versionPoll.lastStatus=$v.status
  $summary.versionPoll.lastVersion=$ver

  if ($ver -and $ver.StartsWith($target)) {
    $summary.versionPoll.matched=$true
    break
  }

  if ($i -lt $max) { Start-Sleep -Seconds $sleep }
}

if ($summary.versionPoll.matched) {
  $h=Req 'GET' "$base/api/health"
  $summary.checks.health=[ordered]@{
    status=$h.status
    ok=if($h.json){$h.json.ok}else{$null}
    version=if($h.json){$h.json.version}else{$null}
    redisOk=if($h.json -and $h.json.checks -and $h.json.checks.redis){$h.json.checks.redis.ok}else{$null}
    redisLatencyMs=if($h.json -and $h.json.checks -and $h.json.checks.redis){$h.json.checks.redis.latencyMs}else{$null}
  }

  $vr=Req 'GET' "$base/api/verify"
  $summary.checks.verify=[ordered]@{
    status=$vr.status
    ok=if($vr.json){$vr.json.ok}else{$null}
    service=if($vr.json){$vr.json.service}else{$null}
    version=if($vr.json){$vr.json.version}else{$null}
  }

  $ob=Req 'GET' "$base/api/observability/health"
  $summary.checks.observabilityHealth=[ordered]@{
    status=$ob.status
    ok=if($ob.json){$ob.json.ok}else{$null}
    service=if($ob.json){$ob.json.service}else{$null}
    version=if($ob.json){$ob.json.version}else{$null}
    circuitState=if($ob.json -and $ob.json.circuitBreaker){$ob.json.circuitBreaker.state}else{$null}
  }

  $bp=Req 'GET' "$base/api/billing/plan"
  $summary.checks.billingPlanNoAuth=[ordered]@{
    status=$bp.status
    error=if($bp.json){$bp.json.error}else{$null}
    code=if($bp.json){$bp.json.code}else{$null}
  }

  $ac=Req 'POST' "$base/api/ai/chat" '{"message":"ping"}'
  $summary.checks.aiChatNoAuth=[ordered]@{
    status=$ac.status
    error=if($ac.json){$ac.json.error}else{$null}
    code=if($ac.json){$ac.json.code}else{$null}
  }

  $qd=Req 'POST' "$base/api/queue/drain" '{}'
  $summary.checks.queueDrainNoAuth=[ordered]@{
    status=$qd.status
    error=if($qd.json){$qd.json.error}else{$null}
    code=if($qd.json){$qd.json.code}else{$null}
    drained=if($qd.json){$qd.json.drained}else{$null}
  }

  $wa=Req 'GET' "$base/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=GAS_2026_VERIFY_TOKEN_X9&hub.challenge=77777"
  $raw=$wa.raw
  $num=$null
  if ($raw -match '^\s*\d+\s*$') { $num=[int64]($raw.Trim()) }
  $summary.checks.whatsappVerifyValidToken=[ordered]@{
    status=$wa.status
    challengeRaw=$raw
    challengeNumber=$num
  }
}

$summary | ConvertTo-Json -Depth 8
