import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3001', 'http://localhost:5000'],
    credentials: true,
  })
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.send('<h1>My Own Tea - Backend</h1><p>Server is running!</p>');
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

server.on('error', (err: any) => {
  console.error('❌ Server error:', err.message);
  process.exit(1);
});
