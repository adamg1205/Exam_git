const http = require('http')

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data ? JSON.parse(data) : null,
        })
      })
    })

    req.on('error', reject)

    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

async function runTests() {
  console.log('Testing Stripe Connect Implementation')
  console.log('=====================================\n')

  try {
    // Test 1: Register user
    console.log('Test 1: Register test user')
    const email = `testvendor-${Date.now()}@example.com`
    const registerRes = await makeRequest('POST', '/api/auth/register', {
      email,
      password: 'TestPassword123',
      firstName: 'Test',
      lastName: 'Vendor',
    })

    if (registerRes.statusCode !== 201 && registerRes.statusCode !== 200) {
      console.error('✗ Registration failed:', registerRes.body)
      process.exit(1)
    }

    const user = registerRes.body
    const userId = user.id

    console.log(`✓ User registered: ID=${userId}`)
    console.log(`  Email: ${user.email}`)
    console.log(`  Stripe charges enabled: ${user.stripeChargesEnabled}\n`)

    // Test 2: Become seller
    console.log('Test 2: Activate seller role')
    const sellerRes = await makeRequest('POST', '/api/account/become-seller', {
      userId,
    })

    if (sellerRes.statusCode !== 200) {
      console.error('✗ Failed to become seller:', sellerRes.body)
    } else {
      const sellerData = sellerRes.body
      console.log(`✓ User became seller`)
      console.log(`  Role: ${sellerData.role}`)
      console.log(`  Stripe charges enabled: ${sellerData.stripeChargesEnabled}\n`)
    }

    // Test 3: Check Stripe status
    console.log('Test 3: Check Stripe Connect status')
    const statusRes = await makeRequest(
      'GET',
      `/api/stripe/connect/status?userId=${userId}`,
      null,
      {},
    )

    if (statusRes.statusCode === 200) {
      console.log(`✓ Stripe status endpoint works`)
      console.log(`  Charges enabled: ${statusRes.body.stripeChargesEnabled}`)
      console.log(`  Details submitted: ${statusRes.body.stripeDetailsSubmitted}`)
      console.log(`  Payouts enabled: ${statusRes.body.stripePayoutsEnabled}\n`)
    } else {
      console.error('✗ Status check failed:', statusRes.body)
    }

    // Test 4: Get onboarding link
    console.log('Test 4: Request Stripe Connect onboarding link')
    const onboardingRes = await makeRequest(
      'POST',
      '/api/stripe/connect/onboarding-link',
      { userId },
      {},
    )

    if (onboardingRes.statusCode === 200) {
      console.log(`✓ Onboarding link generated`)
      console.log(
        `  Stripe account ID: ${onboardingRes.body.user.stripeAccountId}`,
      )
      console.log(
        `  Onboarding URL (preview): ${onboardingRes.body.onboardingUrl.substring(0, 60)}...`,
      )
    } else {
      console.log(`Onboarding response status: ${onboardingRes.statusCode}`)
      console.error('✗ Onboarding link failed:', JSON.stringify(onboardingRes.body, null, 2))
    }

    console.log('\n✓ All tests completed!')
  } catch (error) {
    console.error('✗ Test error:', error.message)
    process.exit(1)
  }
}

runTests()
