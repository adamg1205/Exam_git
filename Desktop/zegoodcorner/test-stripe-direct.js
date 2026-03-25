const Stripe = require('stripe')

const stripeKey = process.env.STRIPE_SECRET_KEY

if (!stripeKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable')
}

const stripe = new Stripe(stripeKey)

async function test() {
  try {
    console.log('Creating Stripe Connect Express account...')
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'FR',
      email: 'test@example.com',
      business_type: 'individual',
    })
    console.log('✓ Account created:', account.id)

    console.log('\nCreating account link...')
    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: 'http://localhost:5173/discussion?stripe=onboarding_refresh',
      return_url: 'http://localhost:5173/discussion?stripe=onboarding_return',
      type: 'account_onboarding',
    })
    console.log('✓ Link created:', link.url.substring(0, 60) + '...')
  } catch (error) {
    console.error('✗ Error:', error.message)
    console.error('Code:', error.code)
    if (error.raw) {
      console.error('Raw:', error.raw)
    }
  }
}

test()
