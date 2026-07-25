require('dotenv').config();
const createApp = require('../src/app');
const connectDB = require('../src/config/db');

let dbReady; // cached across warm invocations so we don't reconnect every request

function ensureDB() {
  if (!dbReady) dbReady = connectDB();
  return dbReady;
}

const app = createApp();

module.exports = async (req, res) => {
  await ensureDB();
  return app(req, res);
};