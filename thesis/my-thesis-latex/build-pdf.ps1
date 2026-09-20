$ErrorActionPreference = "Stop"

$scriptDirectory = $PSScriptRoot
$repositoryRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $scriptDirectory "..\..")
)
$buildDirectory = Join-Path $repositoryRoot "tmp\pdfs\thesis-build"
$builtPdf = Join-Path $buildDirectory "thesis.pdf"
$destinationPdf = Join-Path $repositoryRoot "thesis.pdf"
$oldDraftPdfDirectory = Join-Path $repositoryRoot "output\pdf"
$oldDraftPdfPattern = "david-keci-master-thesis-draft*.pdf"

New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null

Push-Location $scriptDirectory
try {
    & latexmk `
        -pdf `
        -interaction=nonstopmode `
        -halt-on-error `
        "-outdir=$buildDirectory" `
        thesis.tex

    if ($LASTEXITCODE -ne 0) {
        throw "LaTeX build failed with exit code $LASTEXITCODE. The existing PDF was not replaced."
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $builtPdf)) {
    throw "The LaTeX build finished without creating $builtPdf"
}

# Replace the root thesis PDF only after a successful build.
Copy-Item -LiteralPath $builtPdf -Destination $destinationPdf -Force

if (Test-Path -LiteralPath $oldDraftPdfDirectory) {
    Get-ChildItem -LiteralPath $oldDraftPdfDirectory -Filter $oldDraftPdfPattern -File |
        Remove-Item -Force
}

Write-Host "Updated PDF: $destinationPdf"
