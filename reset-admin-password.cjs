// Script to reset admin password
const bcrypt = require('./backend/node_modules/bcrypt');
const Database = require('./backend/node_modules/better-sqlite3');

async function resetPassword() {
  const db = new Database('./data/rediscover.db');
  
  // Hash the password "adminadmin"
  const hashedPassword = await bcrypt.hash('adminadmin', 10);
  
  // Update the admin user
  const result = db.prepare('UPDATE users SET password = ? WHERE username = ?')
    .run(hashedPassword, 'admin');
  
  console.log('Password reset successful:', result.changes, 'rows updated');
  
  db.close();
}

resetPassword().catch(console.error);
