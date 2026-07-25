require('dotenv').config();
const createApp = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 4000;

async function start() {
  await connectDB();

  const app = createApp();

  // Test GET route
  app.get('/', (req, res) => {
    res.send('Backend is working 🚀');
  });

  app.listen(PORT, () => {
    console.log(`Lead platform API listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});