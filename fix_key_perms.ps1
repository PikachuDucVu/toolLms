$keyPath = "C:\Users\ducvu\.ssh\oracle_key"
$acl = Get-Acl $keyPath
$acl.SetAccessRuleProtection($true, $false)
foreach ($rule in $acl.Access) {
    $acl.RemoveAccessRule($rule) | Out-Null
}
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($currentUser, "Read", "Allow")
$acl.AddAccessRule($rule)
Set-Acl -Path $keyPath -AclObject $acl
Write-Host "Permission fixed for: $currentUser"
icacls $keyPath
