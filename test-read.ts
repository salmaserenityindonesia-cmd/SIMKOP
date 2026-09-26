import 'dotenv/config';
import { getAnggotaList, getUserRestrictions } from './src/services/koperasiService';

async function testRead() {
  try {
    console.log('Testing getAnggotaList()...');
    const result = await getAnggotaList(5);
    console.log('Result getAnggotaList:', result);

    console.log('\nTesting getUserRestrictions()...');
    const restrictions = await getUserRestrictions('dummy-id');
    console.log('Result getUserRestrictions:', restrictions);

    console.log('\n✅ Read/Select Layer tests completed successfully.');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testRead();
