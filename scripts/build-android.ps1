param([switch]$IncludeTests)
$ErrorActionPreference = 'Stop'
$beanSource = Split-Path -Parent $PSScriptRoot
Push-Location $beanSource
try {
    & node scripts/signing-android.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Signing setup failed' }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
    & node scripts/prepare-android.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Asset preparation failed' }
    # Android Gradle rejects non-ASCII project paths on Windows. Keep this staging directory local.
    $beanBuild = Join-Path $env:LOCALAPPDATA 'BuwuzhengdouBuild'
    if ($beanBuild -match '[^\x00-\x7F]') { throw 'Use an ASCII-only LOCALAPPDATA path to build Android' }
    New-Item -ItemType Directory -Path $beanBuild -Force | Out-Null
    foreach ($beanName in @('settings.gradle','build.gradle','gradle.properties','gradlew','gradlew.bat','gradle')) {
        Copy-Item -LiteralPath (Join-Path 'android' $beanName) -Destination $beanBuild -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Join-Path $beanBuild 'app') -Force | Out-Null
    Copy-Item -LiteralPath 'android/app/build.gradle' -Destination (Join-Path $beanBuild 'app/build.gradle') -Force
    Copy-Item -LiteralPath 'android/app/src' -Destination (Join-Path $beanBuild 'app') -Recurse -Force
    $beanSdk = $env:ANDROID_HOME
    if (-not $beanSdk) { $beanSdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
    $beanSdkPath = $beanSdk.Replace([char]92,[char]47)
    Set-Content -LiteralPath (Join-Path $beanBuild 'local.properties') -Value "sdk.dir=$beanSdkPath" -Encoding ascii
    $beanTasks = @('assembleRelease')
    if ($IncludeTests) { $beanTasks += @('assembleDebug','assembleDebugAndroidTest') }
    & (Join-Path $beanBuild 'gradlew.bat') -p $beanBuild @beanTasks --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed' }
    $beanOutput = Join-Path $beanBuild 'app/build/outputs/apk/release'
    $beanMetadata = Get-Content -Raw -LiteralPath (Join-Path $beanOutput 'output-metadata.json') | ConvertFrom-Json
    $beanVersion = $beanMetadata.elements[0].versionName
    $beanArtifacts = Join-Path $beanSource 'artifacts/native'
    New-Item -ItemType Directory -Path $beanArtifacts -Force | Out-Null
    $beanApk = Join-Path $beanArtifacts "buwuzhengdou-lucky-$beanVersion.apk"
    Copy-Item -LiteralPath (Join-Path $beanOutput $beanMetadata.elements[0].outputFile) -Destination $beanApk -Force
    Write-Output "Signed APK: $beanApk"
} finally { Pop-Location }
