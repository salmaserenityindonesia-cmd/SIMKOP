import 'dotenv/config';
import { getAnggotaList, getUserRestrictions, insertAnggota, updateAnggota } from './src/services/koperasiService';

async function testCrud() {
  try {
    console.log('Testing getAnggotaList()...');
    const result = await getAnggotaList(5);
    console.log('Result getAnggotaList:', result);

    console.log('\nTesting getUserRestrictions()...');
    const restrictions = await getUserRestrictions('123e4567-e89b-12d3-a456-426614174000');
    console.log('Result getUserRestrictions:', restrictions);

    console.log('\nTesting insertAnggota()...');
    const newAnggota = await insertAnggota({ nama: 'Budi Santoso', role: 'operator' });
    console.log('Result insertAnggota:', newAnggota);

    console.log('\nTesting updateAnggota()...');
    const updatedAnggota = await updateAnggota(newAnggota.id, { role: 'admin' });
    console.log('Result updateAnggota:', updatedAnggota);

    console.log('\n✅ CRUD Layer tests completed successfully.');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testCrud();
