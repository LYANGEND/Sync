
const axios = require('axios');

const API_URL = 'http://localhost:3000/api/v1';

async function main() {
    try {
        console.log('Testing Branch API...');

        // 1. Login
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
        console.log('   Branches:', branchesRes.data.map(b => b.name).join(', '));

        // 3. Create
        const newBranchCode = 'TEST' + Math.floor(Math.random() * 1000);
        const createRes = await axios.post(`${API_URL}/branches`, {
            name: 'Test Branch JS',
            code: newBranchCode,
            address: 'Test Address',
            isMain: false
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Created test branch:', createRes.data.name);

        // 4. Delete
        await axios.delete(`${API_URL}/branches/${createRes.data.id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Deleted test branch');

    } catch (error) {
        // Check if it's an axios error
        if (error.response) {
            console.error('❌ API Error:', error.response.status, error.response.data);
        } else {
            console.error('❌ Error:', error.message);
        }
        process.exit(1);
    }
}

main();
