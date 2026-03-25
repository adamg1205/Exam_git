# Test script for Stripe Connect implementation

Write-Host "Testing Stripe Connect Implementation" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$apiBaseUrl = "http://localhost:4000"

# Test 1: Register a test user
Write-Host "Test 1: Register a test user" -ForegroundColor Yellow
$registerBody = @{
    email = "testvendor-$(Get-Date -Format 'yyyyMMddHHmmss')@example.com"
    password = "TestPassword123"
    firstName = "Test"
    lastName = "Vendor"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$apiBaseUrl/api/auth/register" `
        -Method POST `
        -ContentType "application/json" `
        -Body $registerBody `
        -UseBasicParsing
    
    $userData = $response.Content | ConvertFrom-Json
    $testUserId = $userData.id
    $sessionToken = $userData.sessionToken
    
    Write-Host "✓ User registered: ID=$testUserId" -ForegroundColor Green
    Write-Host "  Email: $($userData.email)" -ForegroundColor Green
    Write-Host "  Stripe charges enabled: $($userData.stripeChargesEnabled)" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "✗ Failed to register user: $_" -ForegroundColor Red
    exit 1
}

# Test 2: Become a seller
Write-Host "Test 2: Activate seller role" -ForegroundColor Yellow
$sellerBody = @{
    userId = $testUserId
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$apiBaseUrl/api/account/become-seller" `
        -Method POST `
        -ContentType "application/json" `
        -Body $sellerBody `
        -UseBasicParsing
    
    $sellerData = $response.Content | ConvertFrom-Json
    Write-Host "✓ User became seller" -ForegroundColor Green
    Write-Host "  Role: $($sellerData.role)" -ForegroundColor Green
    Write-Host "  Stripe charges enabled: $($sellerData.stripeChargesEnabled)" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "✗ Failed to become seller: $_" -ForegroundColor Red
    exit 1
}

# Test 3: Check Stripe Connect status
Write-Host "Test 3: Check Stripe Connect status" -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $sessionToken"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-WebRequest -Uri "$apiBaseUrl/api/stripe/connect/status" `
        -Method GET `
        -Headers $headers `
        -UseBasicParsing
    
    $statusData = $response.Content | ConvertFrom-Json
    Write-Host "✓ Stripe status endpoint works" -ForegroundColor Green
    Write-Host "  Charges enabled: $($statusData.chargesEnabled)" -ForegroundColor Green
    Write-Host "  Details submitted: $($statusData.detailsSubmitted)" -ForegroundColor Green
    Write-Host "  Payouts enabled: $($statusData.payoutsEnabled)" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "✗ Failed to check status: $_" -ForegroundColor Red
}

# Test 4: Request Stripe onboarding link
Write-Host "Test 4: Request Stripe Connect onboarding link" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$apiBaseUrl/api/stripe/connect/onboarding-link" `
        -Method POST `
        -Headers $headers `
        -UseBasicParsing
    
    $onboardingData = $response.Content | ConvertFrom-Json
    Write-Host "✓ Onboarding link generated" -ForegroundColor Green
    Write-Host "  Stripe account ID: $($onboardingData.user.stripeAccountId)" -ForegroundColor Green
    Write-Host "  Onboarding URL: $($onboardingData.url.Substring(0, 60))..." -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "✗ Failed to get onboarding link: $_" -ForegroundColor Red
}

Write-Host "All tests completed!" -ForegroundColor Cyan
