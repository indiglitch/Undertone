param([switch]$Portable,[switch]$NoBundle,[string]$SigningKey)
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$previousFlags=$env:CARGO_ENCODED_RUSTFLAGS
$previousKey=$env:TAURI_SIGNING_PRIVATE_KEY
$previousPassword=$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
try {
    # Remove developer directory names from panic locations, including local path dependencies.
    $parts=@()
    if($previousFlags){$parts+=$previousFlags.Split([char]31)}
    $parts+="--remap-path-prefix=$projectRoot=undertone"
    $parts+="--remap-path-prefix=$env:USERPROFILE=build-home"
    $env:CARGO_ENCODED_RUSTFLAGS=$parts -join [char]31
    $arguments=@('tauri','build','--ci','--features',$(if($Portable){'portable,external-lyrics'}else{'external-lyrics'}))
    if($NoBundle -or $Portable){$arguments+='--no-bundle'}
    if(-not $NoBundle -and -not $Portable){
        if(-not $SigningKey){$SigningKey=Join-Path $env:USERPROFILE '.tauri/undertone-updater.key'}
        if(-not (Test-Path -LiteralPath $SigningKey)){throw 'Updater signing key is unavailable. Supply -SigningKey or use -NoBundle for a smoke executable.'}
        $env:TAURI_SIGNING_PRIVATE_KEY=$SigningKey
        if(-not $previousPassword){$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=''}
    }
    if($Portable){$arguments+=@('--','--no-default-features')}
    Push-Location $projectRoot
    try{& npx @arguments;if($LASTEXITCODE -ne 0){throw "Windows build failed: $LASTEXITCODE"}}finally{Pop-Location}
} finally {
    $env:CARGO_ENCODED_RUSTFLAGS=$previousFlags
    $env:TAURI_SIGNING_PRIVATE_KEY=$previousKey
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=$previousPassword
}
