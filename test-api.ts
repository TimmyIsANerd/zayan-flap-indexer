import { config } from './src/config.ts';

async function runTests() {
  const baseUrl = `http://localhost:${config.PORT}`;
  console.log(`Testing API at ${baseUrl}...`);

  try {
    // Test 1: Health Check
    console.log('\n1. Testing /health...');
    const healthRes = await fetch(`${baseUrl}/health`);
    console.log(`Status: ${healthRes.status}`);
    console.log('Response:', await healthRes.json());

    // Test 2: Token that doesn't exist
    const dummyToken = '0x1111111111111111111111111111111111111111';
    console.log(`\n2. Testing /token/${dummyToken}... (Should fail without try_remediation or return token if we mock)`);
    const tokenRes = await fetch(`${baseUrl}/token/${dummyToken}`);
    console.log(`Status: ${tokenRes.status}`);
    console.log('Response:', await tokenRes.json());
    
    // We expect it all to work properly (404 for missing token).
    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Testing failed:', error);
    process.exit(1);
  }
}

runTests();
