/* eslint-disable no-console */
require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Lead = require('../models/Lead');

async function seed() {
  await connectDB();

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin12345!';
  const memberEmail = process.env.SEED_MEMBER_EMAIL || 'member@example.com';
  const memberPassword = process.env.SEED_MEMBER_PASSWORD || 'Member12345!';

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({ name: 'Admin User', email: adminEmail, password: adminPassword, role: 'admin' });
    console.log(`Created admin: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log(`Admin already exists: ${adminEmail}`);
  }

  let member = await User.findOne({ email: memberEmail });
  if (!member) {
    member = await User.create({ name: 'Sales Member', email: memberEmail, password: memberPassword, role: 'member' });
    console.log(`Created member: ${memberEmail} / ${memberPassword}`);
  } else {
    console.log(`Member already exists: ${memberEmail}`);
  }

  const existingLeads = await Lead.countDocuments();
  if (existingLeads === 0) {
    await Lead.create([
      { name: 'Alicia Torres', email: 'alicia@acme.io', company: 'Acme Inc', status: 'new', source: 'website' },
      { name: 'Ben Okafor', email: 'ben@globex.com', company: 'Globex', status: 'contacted', assignedTo: member._id, source: 'referral' },
      { name: 'Chen Wei', email: 'chen@initech.com', company: 'Initech', status: 'qualified', assignedTo: member._id, source: 'website' },
    ]);
    console.log('Seeded 3 sample leads.');
  }

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
