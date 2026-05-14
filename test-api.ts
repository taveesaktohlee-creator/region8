async function testApiLogin() {
  const url = 'https://region8.onrender.com/api/users/login';
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'cad', password: '12345678' })
    });
    
    const data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(`Response:`, data);
  } catch (error) {
    console.error('Fetch error:', error);
  }
}

testApiLogin();
