const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(cors());

app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/ingredients', (req, res) => {
  console.log('Ingredients requested');
  res.json([
    { id: '1', name: 'Test Ingredient', category: 'TEA', basePrice: 5.99, stock: 100 }
  ]);
});

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`   Process ID: ${process.pid}`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
