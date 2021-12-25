get-childitem c:\somedir -recurse -include *.js dist | 
 select -expand fullname |
  foreach {
            (Get-Content $_) -replace 'require("src/', 'require("./' |
             Set-Content $_
            }