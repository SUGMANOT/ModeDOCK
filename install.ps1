param([switch]$KeepBuildFiles)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$modeDockRoot = Join-Path $env:LOCALAPPDATA 'ModeDOCK'
$runtimeRoot = Join-Path $modeDockRoot 'runtime'
$appRoot = Join-Path $modeDockRoot 'app'
$binRoot = Join-Path $modeDockRoot 'bin'
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('moddock-install-' + [guid]::NewGuid().ToString('N'))

function Get-WorkingNode {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $command) { return $null }
  try {
    $version = (& $command.Source --version).TrimStart('v').Split('.')[0]
    if ([int]$version -ge 20) { return $command.Source }
  } catch { return $null }
  return $null
}

function Invoke-LocalNpm([string]$nodeExe, [string[]]$arguments) {
  $npmCli = Join-Path (Split-Path -Parent $nodeExe) 'node_modules\npm\bin\npm-cli.js'
  if (-not (Test-Path -LiteralPath $npmCli)) { throw "npm was not found next to $nodeExe" }
  & $nodeExe $npmCli @arguments
  if ($LASTEXITCODE -ne 0) { throw "npm failed with exit code $LASTEXITCODE" }
}

New-Item -ItemType Directory -Path $runtimeRoot, $appRoot, $binRoot, $temporaryRoot -Force | Out-Null

try {
  $nodeExe = Get-WorkingNode
  if (-not $nodeExe) {
    Write-Host 'Node.js 20+ was not found. Downloading the current official LTS build...'
    $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
    $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    $asset = "win-$architecture-zip"
    $release = $releases | Where-Object {
      $_.lts -and [int]($_.version.TrimStart('v').Split('.')[0]) -ge 22 -and $_.files -contains $asset
    } | Select-Object -First 1
    if (-not $release) { throw 'The Node.js release index did not contain a supported LTS build.' }

    $folderName = "node-$($release.version)-win-$architecture"
    $archiveName = "$folderName.zip"
    $releaseRoot = "https://nodejs.org/dist/$($release.version)"
    $archivePath = Join-Path $temporaryRoot $archiveName
    $checksumsPath = Join-Path $temporaryRoot 'SHASUMS256.txt'
    Invoke-WebRequest -Uri "$releaseRoot/$archiveName" -OutFile $archivePath
    Invoke-WebRequest -Uri "$releaseRoot/SHASUMS256.txt" -OutFile $checksumsPath

    $pattern = '^([a-f0-9]{64})\s+\*?' + [regex]::Escape($archiveName) + '$'
    $checksumLine = Get-Content -LiteralPath $checksumsPath | Where-Object { $_ -match $pattern } | Select-Object -First 1
    if (-not $checksumLine) { throw "No SHA-256 checksum was published for $archiveName" }
    $expectedHash = ([regex]::Match($checksumLine, $pattern)).Groups[1].Value
    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) { throw 'The downloaded Node.js archive failed SHA-256 verification.' }

    $versionRoot = Join-Path $runtimeRoot $folderName
    if (-not (Test-Path -LiteralPath $versionRoot)) {
      Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeRoot -Force
    }
    $nodeExe = Join-Path $versionRoot 'node.exe'
  }

  Write-Host 'Building the verified ModeDOCK package...'
  Push-Location $projectRoot
  try {
    Invoke-LocalNpm $nodeExe @('ci')
    Invoke-LocalNpm $nodeExe @('run', 'verify')
    $packOutput = Invoke-LocalNpm $nodeExe @('pack', '--json', '--ignore-scripts', '--pack-destination', $temporaryRoot)
    $packed = ($packOutput | Out-String | ConvertFrom-Json)[0]
    $tarball = Join-Path $temporaryRoot $packed.filename
    Invoke-LocalNpm $nodeExe @('install', '--global', $tarball, '--prefix', $appRoot, '--ignore-scripts')
  } finally { Pop-Location }

  $entrypoint = Join-Path $appRoot 'node_modules\moddock\dist\moddock.js'
  if (-not (Test-Path -LiteralPath $entrypoint)) { throw 'The installed ModeDOCK entrypoint is missing.' }
  $shim = Join-Path $binRoot 'moddock.cmd'
  $shimContent = "@echo off`r`n`"$nodeExe`" `"$entrypoint`" %*`r`n"
  Set-Content -LiteralPath $shim -Value $shimContent -Encoding Ascii

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $pathItems = @($userPath -split ';' | Where-Object { $_ -and $_ -ne $binRoot })
  $updatedPath = (@($binRoot) + $pathItems) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $updatedPath, 'User')
  $savedPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (($savedPath -split ';')[0] -ne $binRoot) { throw 'ModeDOCK could not be added to the user PATH.' }

  & $shim --version
  Write-Host "ModeDOCK installed. Open a new terminal and run: moddock"
} finally {
  if (Test-Path -LiteralPath $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
  if (-not $KeepBuildFiles) {
    foreach ($name in @('node_modules', 'dist')) {
      $generated = Join-Path $projectRoot $name
      if ((Test-Path -LiteralPath $generated) -and ([IO.Path]::GetDirectoryName($generated) -eq $projectRoot)) {
        Remove-Item -LiteralPath $generated -Recurse -Force
      }
    }
  }
}
