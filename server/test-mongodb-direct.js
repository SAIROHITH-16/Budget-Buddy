// server/test-mongodb-direct.js
// Direct MongoDB connection test to diagnose issues

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

console.log('\n=== MongoDB Connection Test ===\n');
console.log('MongoDB URI:', MONGODB_URI?.replace(/:[^:]*@/, ':****@')); // Hide password
console.log('\nAttempting to connect...\n');

const options = {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 75000,
};

mongoose.connect(MONGODB_URI, options)
  .then(() => {
    console.log('✅ SUCCESS! Connected to MongoDB Atlas');
    console.log('Database:', mongoose.connection.name);
    console.log('Host:', mongoose.connection.host);
    console.log('\n✅ Your MongoDB Atlas connection is working!');
    process.exit(0);
  })
  .catch((err) => {
    console.log('❌ FAILED to connect to MongoDB Atlas\n');
    console.log('Error Type:', err.name);
    console.log('Error Message:', err.message);
    console.log('\nFull Error:');
    console.log(err);
    
    console.log('\n=== Troubleshooting Steps ===');
    
    if (err.message.includes('IP') || err.message.includes('whitelist')) {
      console.log('❌ IP Whitelisting Issue:');
      console.log('   - Your IP is not whitelisted in MongoDB Atlas');
      console.log('   - Go to: Network Access and add 0.0.0.0/0 or your current IP');
    } else if (err.message.includes('authentication') || err.message.includes('auth')) {
      console.log('❌ Authentication Issue:');
      console.log('   - Username or password is incorrect');
      console.log('   - Go to: Database Access and verify credentials');
      console.log('   - Username: sairohith-16');
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('hostname')) {
      console.log('❌ Hostname Issue:');
      console.log('   - Cluster URL might be incorrect');
      console.log('   - Verify cluster name in MongoDB Atlas dashboard');
    } else if (err.message.includes('timeout')) {
      console.log('❌ Timeout Issue:');
      console.log('   - Cluster might be paused');
      console.log('   - Check if cluster is ACTIVE in MongoDB Atlas');
      console.log('   - Or your firewall might be blocking MongoDB connections');
    } else {
      console.log('❌ Unknown Issue:');
      console.log('   - Check MongoDB Atlas dashboard');
      console.log('   - Verify cluster is running');
      console.log('   - Check Database Access and Network Access settings');
    }
    
    process.exit(1);
  });

setTimeout(() => {
  console.log('\n⏳ Still trying to connect... (this is taking longer than expected)');
}, 10000);
