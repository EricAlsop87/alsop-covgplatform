async function run() {
    const res = await fetch('http://localhost:3000/api/duplicates/find');
    const data = await res.json();
    const match = data.policies.find(p => String(p.reason).includes('0101728613'));
    console.log('API Output match:', match);
}
run();
