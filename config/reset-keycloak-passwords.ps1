# Reset Keycloak user passwords to match seed values
# Run: powershell -ExecutionPolicy Bypass -File config\reset-keycloak-passwords.ps1

$keycloakUrl = "http://localhost:8180"
$realm = "mikel-crm"

# Get admin token
$body = "grant_type=password&client_id=admin-cli&username=admin&password=Admin_Dev_2026!"
$tokenResp = Invoke-RestMethod -Uri "$keycloakUrl/realms/master/protocol/openid-connect/token" -Method Post -Body $body -ContentType "application/x-www-form-urlencoded"
$token = $tokenResp.access_token
Write-Host "Token obtained" -ForegroundColor Green

$headers = @{ Authorization = "Bearer $token" }

$users = @(
    @{ email = "root@mikel-crm.local"; pw = "Root_Admin_2026!" }
    @{ email = "admin@default.com"; pw = "admin123" }
    @{ email = "juan@el-reloj.com"; pw = "tecnico123" }
    @{ email = "pedro.juarez@el-reloj.com"; pw = "asistente123" }
    @{ email = "robles@el-reloj.com"; pw = "manager123" }
    @{ email = "admin-test"; pw = "admin123" }
    @{ email = "super-test"; pw = "admin123" }
    @{ email = "tecnico-test"; pw = "tecnico123" }
    @{ email = "asistente-test"; pw = "asistente123" }
    @{ email = "manager-test"; pw = "manager123" }
    @{ email = "dev-tester"; pw = "admin123" }
)

foreach ($u in $users) {
    $email = $u.email
    $pw = $u.pw
    $found = $null

    try {
        $result = Invoke-RestMethod -Uri "$keycloakUrl/admin/realms/$realm/users?email=$email" -Headers $headers
        if ($result.Count -gt 0) { $found = $result[0] }
    } catch {}

    if (-not $found) {
        try {
            $result = Invoke-RestMethod -Uri "$keycloakUrl/admin/realms/$realm/users?username=$email" -Headers $headers
            if ($result.Count -gt 0) { $found = $result[0] }
        } catch {}
    }

    if ($found) {
        $userId = $found.id
        $jsonBody = "{`"type`":`"password`",`"value`":`"$pw`",`"temporary`":false}"
        $putHeaders = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
        try {
            Invoke-RestMethod -Uri "$keycloakUrl/admin/realms/$realm/users/$userId/reset-password" -Method Put -Headers $putHeaders -Body $jsonBody
            Write-Host "  OK: $email" -ForegroundColor Green
        } catch {
            Write-Host "  FAIL: $email" -ForegroundColor Red
        }
    } else {
        Write-Host "  NOT FOUND: $email" -ForegroundColor Yellow
    }
}

Write-Host "Done!" -ForegroundColor Cyan
