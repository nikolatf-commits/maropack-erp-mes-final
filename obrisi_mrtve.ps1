# MAROPACK — bezbedno uklanjanje mrtvih fajlova (61)
# Pokreni iz korena projekta (C:\MAROPACK). Fajlovi se PREMEŠTAJU u backup, ne brišu.
# Posle ovoga: npm run build  → ako prođe, projekat radi bez njih.

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backup = ".\_dead_backup_$stamp"
$files = @(
  'src\AnalizaPotrosnjeMaterijala.jsx',
  'src\MESWorkflowPRO.jsx',
  'src\MPTPRollOrientation.jsx',
  'src\NalogAktivnosti.jsx',
  'src\NalogCrtez_Kesa.jsx',
  'src\NalogFolija.jsx',
  'src\NalogFormatiranje_Spulna.jsx',
  'src\NalogKasiranje_Folija.jsx',
  'src\NalogKesa_Kesa.jsx',
  'src\NalogMaterijal_Folija.jsx',
  'src\NalogPerforacijaRezanje_Folija.jsx',
  'src\NalogPerforacija_Folija.jsx',
  'src\NalogPotrebaMaterijala_Kesa.jsx',
  'src\NalogPotrebaMaterijala_Spulna.jsx',
  'src\NalogRezanje_Folija.jsx',
  'src\NalogShared.jsx',
  'src\NalogSpulne_Spulna.jsx',
  'src\NalogStampa_Folija.jsx',
  'src\NaloziProMES.jsx',
  'src\PrikazKesePRO.jsx',
  'src\RolneWarehouseEngine.jsx',
  'src\MaterijalZaNaloge.jsx',
  'src\components\MagacinPanel\MagacinListaCeka.jsx',
  'src\components\MagacinPanel\MagacinPanel.jsx',
  'src\components\MagacinPanel\MagacinPregled.jsx',
  'src\components\MagacinPanel\MagacinPromenaLokacije.jsx',
  'src\components\MagacinPanel\MagacinSmestanje.jsx',
  'src\components\MaterialEverywhereTest.jsx',
  'src\components\MaterialMasterPRO.jsx',
  'src\components\MaterialLayerRowPRO.jsx',
  'src\components\Nalozi\NalogFolijaSaQR.jsx',
  'src\components\Nalozi\NalogKesaSaQR.jsx',
  'src\components\Nalozi\NalogQRCode.jsx',
  'src\components\Nalozi\NalogSpulnaSaQR.jsx',
  'src\components\QRScanner.jsx',
  'src\components\RadnikPanel\NalogDetalji.jsx',
  'src\components\RadnikPanel\RadnikDashboard.jsx',
  'src\components\RadnikPanel\RadnikLogin-WITH-QR.jsx',
  'src\components\RadnikPanel\RadnikLogin.jsx',
  'src\components\RadnikPanel\RadnikPanel.jsx',
  'src\components\RadnikPanel\RazloziZaustavljanja.jsx',
  'src\components\RadnikPanel\ZavrsenaPosljednjaFaza.jsx',
  'src\components\RadnikPanel\supabaseRadnik.js',
  'src\components\RezervacijaMaterijala.jsx',
  'src\dataMaterijali.js',
  'src\modules\AINalogPreview.jsx',
  'src\modules\MESTrackingQualityPRO.jsx',
  'src\modules\MasterNalogEngine.jsx',
  'src\modules\MasterNalogView.jsx',
  'src\modules\MobileRollScanner.jsx',
  'src\modules\QRWorkflow.jsx',
  'src\modules\formatiranjeExec.js',
  'src\modules\formatiranjeIzNaloga.js',
  'src\modules\izvrsiFormatiranje.js',
  'src\rolnaAlgoritam.js',
  'src\services\aiAgentCore.js',
  'src\services\materialEngine.js',
  'src\services\mesTrackingCore.js',
  'src\services\rollSuggestionEngine.js',
  'src\utils\pdfNalog.js',
  'src\utils\supabaseRadnik.js'
)

$moved = 0; $missing = 0
foreach ($f in $files) {
  if (Test-Path $f) {
    $dest = Join-Path $backup $f
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Move-Item -Force $f $dest
    $moved++
  } else { Write-Host "(preskočen, ne postoji) $f"; $missing++ }
}
Write-Host "`nPremešteno $moved fajlova u $backup (nedostajalo: $missing)."
Write-Host 'Sada pokreni:  npm run build'
Write-Host 'Ako sve radi, backup folder možeš obrisati. Ako nešto pukne: vrati fajl iz backup-a.'