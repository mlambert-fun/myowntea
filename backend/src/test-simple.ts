import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(cors());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/ingredients', (req, res) => {
  res.json([
    { id: '1', name: 'Test Ingredient', category: 'TEA', basePrice: 5.99, stock: 100 }
  ]);
});

const server = app.listen(PORT, () => {
  console.log(`✅ Test server running on http://localhost:${PORT}`);
  console.log(`   Listening on all interfaces`);
});

server.on('error', (err: any) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});
