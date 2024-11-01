const mysql = require('mysql2');
require('dotenv').config();

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
}).promise();


const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(50) NOT NULL,
      email VARCHAR(50) NOT NULL,
      password VARCHAR(50) NOT NULL
    )
  `;



const createEmailsTable = `
CREATE TABLE IF NOT EXISTS emails (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_id INT,
  receiver_id INT,
  subject VARCHAR(255),
  body TEXT,
  attachment VARCHAR(255), -- Thêm cột để lưu tên file đính kèm
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_by_sender BOOLEAN DEFAULT 0,
  deleted_by_receiver BOOLEAN DEFAULT 0,
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
);

`


const insertUsersData = `
    INSERT IGNORE INTO users (full_name, email, password)
    VALUES
      ('Tran Van A', 'a@a.com', '123'),
      ('Tran Van B', 'b@b.com', '123'),
      ('Tran Thi C', 'c@c.com', '123')
  `;



const insertEmailsData = `
INSERT INTO emails (sender_id, receiver_id, subject, body)
VALUES
    (1, 2, 'Project Collaboration', 'Hey, we need to finalize the tasks for this week.'),
    (2, 1, 'Team Meeting Schedule', 'Let’s set up a meeting on Thursday to review progress.'),
    (1, 3, 'Document Review', 'Please review the updated document and share your feedback.'),
    (3, 1, 'Document Received', 'Got the document. I will review and respond shortly.'),
    (2, 3, 'Status Report', 'Here is the status report for the last two weeks.'),
    (3, 2, 'Weekend Catch-Up', 'Do you have time for a catch-up over the weekend?'),
    (2, 1, 'Final Review', 'We need your final review on the project proposal.'),
    (1, 3, 'Weekend Activities', 'Thinking of hiking this weekend. Want to join?');

`

async function setupDatabase() {
  try {
    await connection.connect();
    await connection.query(createUsersTable);
    await connection.query(createEmailsTable);
    await connection.query(insertUsersData);
    await connection.query(insertEmailsData)
    console.log("Create successfully");


  } catch (err) {
    console.error('Lỗi khi thực hiện truy vấn:', err);
  }
}
setupDatabase();

