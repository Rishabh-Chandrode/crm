const url = "https://crm-frontend-black-three.vercel.app/login?google_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyIsInVzZXJuYW1lIjoidXNlcjEiLCJyb2xlIjoidXNlciIsImlhdCI6MTYyMDAwMDAwMCwiZXhwIjoxNjIwMDAwMDAwfQ.signature";
const match = url.match(/[?&]google_token=([^&#]+)/);
console.log(match ? match[1] : "NO MATCH");
