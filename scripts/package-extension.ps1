param(
  [string]$ExtensionPath = (Join-Path $PSScriptRoot "..\..\chatbot-agent-extension")
)

$ErrorActionPreference = "Stop"
$chatbotRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$extensionRoot = (Resolve-Path -LiteralPath $ExtensionPath).Path
Push-Location $extensionRoot
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "Extension build failed." }
} finally {
  Pop-Location
}

$distRoot = Join-Path $extensionRoot "dist"
$manifest = Get-Content -LiteralPath (Join-Path $distRoot "manifest.json") -Raw | ConvertFrom-Json
$files = @("manifest.json", "background.js", "bridge.js", "content.js", "approve.js", "console.js", "approve.html", "console.html", "theme.css")
$files += @($manifest.icons.PSObject.Properties | ForEach-Object { $_.Value })
$files += @($manifest.action.default_icon.PSObject.Properties | ForEach-Object { $_.Value })
$files = @($files | Select-Object -Unique)

# Package only runtime files. Never include source trees, local configuration,
# dependencies, or anything outside the resolved extension build directory.
$distPrefix = [System.IO.Path]::GetFullPath($distRoot) + [System.IO.Path]::DirectorySeparatorChar
foreach ($relative in $files) {
  $absolute = [System.IO.Path]::GetFullPath((Join-Path $distRoot $relative))
  if (!$absolute.StartsWith($distPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $absolute -PathType Leaf)) {
    throw "Missing or invalid extension asset: $relative"
  }
}

$downloads = Join-Path $chatbotRoot "public\downloads"
New-Item -ItemType Directory -Path $downloads -Force | Out-Null
$temporaryZip = Join-Path $downloads ("site-agent-" + [guid]::NewGuid().ToString("N") + ".zip")
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($temporaryZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in $files) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive, (Join-Path $distRoot $relative), $relative.Replace("\", "/"),
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
}
$zipPath = Join-Path $downloads "site-agent.zip"
Move-Item -LiteralPath $temporaryZip -Destination $zipPath -Force
$release = [ordered]@{
  version = [string]$manifest.version
  file = "site-agent.zip"
  sizeBytes = (Get-Item -LiteralPath $zipPath).Length
  sha256 = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
}
$release | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $downloads "site-agent.json") -Encoding ascii
Write-Output ("Packaged Site Agent v" + $manifest.version + " at /downloads/site-agent.zip (" + $release.sizeBytes + " bytes)")
