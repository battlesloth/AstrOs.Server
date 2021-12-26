
function FixDirectory {
    param (
        [string]$directory,   
        [int]$level
    )
    
    Write-Host "fixing $($directory)";

    $files = Get-ChildItem $directory -Filter *.js | Select-Object - -expand FullName;

    FixPaths -files $files -depth $level;

    Write-Host "level => $($level)";

    $level += 1;

    $subs = Get-ChildItem $directory -Directory | Select-Object  -expand FullName;

    foreach ($item in $subs) {
        Write-Host "Processing directory $($item)";

        FixDirectory -directory $item -level $level;
    }
}

function FixPaths {
    param (
        [string[]]$files,
        [int]$depth
    )

    $pathPrefix = '';

    if ($depth -lt 1){
        $pathPrefix = './';
    } else{
        for ($i = 0; $i -lt $depth; $i++) {
            $pathPrefix += '../';
        }
    }
    
    $prefix = "require(`"$($pathPrefix)";

    foreach ($item in $files) {

        Write-Host "level => $($level)";
        Write-Host "Fixing file $($item) with $($prefix)";

       (Get-Content $item) -replace ([regex]::Escape('require("src/')), $prefix | Set-Content $item;
    }
}


FixDirectory -level 0 -directory "dist";