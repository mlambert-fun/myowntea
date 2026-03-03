import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3001', 'http://localhost:5000'],
    credentials: true,
  })
);

// Test routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.send('<h1>My Own Tea - Backend</h1><p>Server is running!</p>');
});

// Login page
app.post('/api/auth/login', (req, res) => {
  console.log('[AUTH] Login attempt:', req.body);
  const { email, password } = req.body;
  
  if (email === 'admin@myowntea.com' && password === 'admin123') {
    const token = 'test-token-' + Date.now();
    console.log('[AUTH] Login successful for', email);
    res.json({
      user: { id: 'admin-1', email, role: 'ADMIN' },
      token
    });
  } else {
    console.log('[AUTH] Login failed for', email);
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

server.on('error', (err: any) => {
  console.error('❌ Server error:', err.message);
  process.exit(1);
});
