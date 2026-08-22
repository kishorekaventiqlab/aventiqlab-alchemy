Add-Type -AssemblyName System.Speech

$outDir = Join-Path $PSScriptRoot "..\public\audio"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$beats = [ordered]@{
  "beat2" = "It's 2:14pm. doc-search-summarizer just paged. p99 latency is climbing, and it's not alone. GPU utilization on its node pool is climbing too. Queue depth is climbing. Three things going up at once. Before touching anything, the question is: which of these is the cause, and which are just symptoms?"
  "beat3" = "First check: GPU utilization, not queue depth, not latency. Here's why. GPU utilization tells you if the compute itself is the bottleneck. It's climbing toward 90 percent, and GPU memory is flat. That combination matters. If memory were also climbing, I'd suspect a batch-size or memory-leak problem. Flat memory plus rising utilization points at compute saturation. The GPU is doing as much work as it can, and it's running out of headroom."
  "beat4" = "Rising latency could also mean a network problem. A bad ingress config, a D N S issue, a load balancer having a bad day. Quick check of the ingress dashboard: request rate is flat, not spiking. Error rate is flat. Ingress-layer latency contribution is basically zero. That rules out the network as the cause. It's not what's sending the traffic. It's what's receiving it."
  "beat5" = "One more check before deciding anything. Is queue depth still climbing, or has it started to level off on its own? Widening the window, it's been climbing steadily for the last twenty minutes with no plateau. That matters. If it had leveled off, this might resolve itself. It hasn't. This needs an active decision, not a wait and see."
  "beat6" = "Checking whether autoscaling is even still working. kubectl get scaled object. It's active, and it's already at its configured maximum: twelve out of twelve replicas. KEDA is doing its job. It's just already maxed out. That's a different problem than autoscaling is broken. It's autoscaling is working, and the ceiling is too low for right now."
  "beat7" = "With the max replica ceiling already hit, scaling further isn't an option right now. That's a capacity conversation for after the incident. What I can do immediately is reduce demand. This service has a free tier and a paid tier. I'm applying a rate limit that cuts free-tier request volume by 40 percent for the next hour. That's the tradeoff, said out loud. Free-tier users see more 429, try again shortly, responses for a while, in exchange for paid-tier latency staying inside S L A. It's not free. It's a choice, and I'm making it deliberately, not by default."
  "beat8" = "Three things worth taking with you. Check the signal that actually tells you where the bottleneck is. Rule out the tempting alternative explanation before committing. And when you mitigate, say the tradeoff out loud. Don't just apply a fix and hope nobody asks what it cost."
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("Microsoft David Desktop")
$synth.Rate = -1

# Force a standard 16-bit mono PCM format so the WAV header is the plain
# 44-byte canonical layout (SAPI's default output format uses an extensible
# header whose field offsets differ, which produced garbage durations).
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  22050,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)

$results = @()
foreach ($key in $beats.Keys) {
  $wavPath = Join-Path $outDir "$key.wav"
  $synth.SetOutputToWaveFile($wavPath, $format)
  $synth.Speak($beats[$key])
  $synth.SetOutputToNull()

  $bytes = [System.IO.File]::ReadAllBytes($wavPath)
  $sampleRate = [BitConverter]::ToInt32($bytes, 24)
  $numChannels = [BitConverter]::ToInt16($bytes, 22)
  $bitsPerSample = [BitConverter]::ToInt16($bytes, 34)

  # Don't assume a fixed offset for the "data" subchunk - SAPI's fmt chunk is
  # 18 bytes (with a trailing cbSize field), not the canonical 16, which
  # shifts "data" to offset 38 instead of 36. Search for the marker instead.
  $dataMarker = [byte[]](0x64, 0x61, 0x74, 0x61) # "data"
  $dataOffset = -1
  for ($i = 12; $i -lt ($bytes.Length - 4); $i++) {
    if ($bytes[$i] -eq $dataMarker[0] -and $bytes[$i+1] -eq $dataMarker[1] -and $bytes[$i+2] -eq $dataMarker[2] -and $bytes[$i+3] -eq $dataMarker[3]) {
      $dataOffset = $i
      break
    }
  }
  $dataSize = [BitConverter]::ToInt32($bytes, $dataOffset + 4)
  $byteRate = $sampleRate * $numChannels * ($bitsPerSample / 8)
  $durationSeconds = [Math]::Round($dataSize / $byteRate, 2)

  $results += [PSCustomObject]@{ Beat = $key; File = "$key.wav"; DurationSeconds = $durationSeconds }
}

$results | Format-Table -AutoSize
$results | ConvertTo-Json | Out-File (Join-Path $outDir "durations.json") -Encoding utf8
