
import axios from 'axios';

const API_URL = 'http://localhost:3000/api/v1';

async function main() {
    try {
        // 1. Login to get token (assuming admin exists from seed)
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@sync.com',
            password: 'admin123'
        });

        const token = loginRes.data.token;
        console.log('✅ Login successful');

        // 2. Get All Branches
        const branchesRes = await axios.get(`${API_URL}/branches`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('✅ Fetched branches:', branchesRes.data.length);
        console.log('   Branches:', branchesRes.data.map((b: any) => b.name).join(', '));

        if (branchesRes.data.length === 0) {
            console.warn('⚠️ No branches found!');
        } else {
            // 3. Create a test branch
            const newBranchCode = 'TEST' + Math.floor(Math.random() * 1000);
            const createRes = await axios.post(`${API_URL}/branches`, {
                name: 'Test Branch',
                code: newBranchCode,
                address: 'Test Address',
                isMain: false
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('✅ Created test branch:', createRes.data.name);

            // 4. Delete the test branch
            await axios.delete(`${API_URL}/branches/${createRes.data.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('✅ Deleted test branch');
        }

    } catch (error: any) {
        console.error('❌ Error:', error.response?.data || error.message);
        process.exit(1);
    }
}

main();
