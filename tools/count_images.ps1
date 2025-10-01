param(
  [Parameter(Mandatory=$true)]
  [string]$Root = "C:\7M-images",
  [string]$Ext = "png"   # or "jpg"
)

Write-Host "Scanning $Root for *.$Ext files ..." -ForegroundColor Cyan

$files = Get-ChildItem -Recurse -File -Path $Root -Filter "*.$Ext" -ErrorAction SilentlyContinue
if (-not $files) {
  Write-Host "No *.$Ext files found." -ForegroundColor Yellow
  exit 0
}

$totalCount = $files.Count
$totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
$avgBytes   = [math]::Round($totalBytes / [math]::Max($totalCount,1))
$gb = [math]::Round($totalBytes / 1GB, 2)
$mbAvg = [math]::Round($avgBytes / 1MB, 2)

Write-Host ("Total images : {0}" -f $totalCount) -ForegroundColor Green
Write-Host ("Total size   : {0} GB" -f $gb) -ForegroundColor Green
Write-Host ("Avg per file : {0} MB" -f $mbAvg) -ForegroundColor Green

# Per-PDF (folder) breakdown
Write-Host "`nTop 15 folders by size:" -ForegroundColor Cyan
$folders = $files | Group-Object {$_.Directory.FullName} | ForEach-Object {
  $count = $_.Group.Count
  $sum   = ($_.Group | Measure-Object -Property Length -Sum).Sum
  [PSCustomObject]@{
    Folder = $_.Name
    Files  = $count
    GB     = [math]::Round($sum / 1GB, 3)
  }
} | Sort-Object -Property GB -Descending

$folders | Select-Object -First 15 | Format-Table -AutoSize
