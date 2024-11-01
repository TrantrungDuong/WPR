const express = require('express');
const cookieParser = require('cookie-parser');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');

const port = process.env.port || 8000;
require('dotenv').config()


const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT,
});

const app = express();
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// ----------hàm sign-in----------
app.route('/')
    .get((req, res) => {
        if (req.cookies.user) {
            return res.redirect('/inbox');
        }
        res.render('signin');
    })
    .post((req, res) => {
        const { username, password } = req.body;

        connection.query('SELECT * FROM users WHERE email = ?', [username], (error, users) => {
            if (error) {
                console.error('Database error:', error);
                return res.status(500).send('An unexpected error occurred. Please try again.');
            }
            if (users.length === 0) {
                return res.status(401).send('Incorrect email or password.');
            }

            const foundUser = users[0];

            if (password === foundUser.password) {
                res.cookie('user', foundUser.email, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
                return res.redirect('/inbox');
            } else {
                return res.status(401).send('Incorrect email or password.');
            }
        });
    });

// ----------hàm sign-up----------
app.route('/signup')
    .get((req, res) => {
        res.render('signup');
    })
    .post((req, res) => {
        let fullname = req.body.fullname;
        let password = req.body.password;
        let email = req.body.email;
        let confirmPassword = req.body.confirmPassword;

        if (!fullname) {
            return res.send('fullname is required.');
        } else if (!password) {
            return res.send('Password is required.');
        } else if (!email) {
            return res.send("email is required")
        } else if (password !== confirmPassword) {
            return res.send('Passwords do not match.');
        }
        const checkEmail = 'SELECT * FROM users WHERE email = ?';
        connection.query(checkEmail, [email], (err, results) => {
            if (err) {
                return res.status(500).json({ error: 'Internal server error while checking email.' });
            }

            if (results.length > 0) {
                return res.status(400).json({ error: 'This email is already registered!' });
            }

            const insertUserQuery = 'INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)';
            connection.query(insertUserQuery, [fullname, email, password], (err, result) => {
                if (err) {
                    console.error('Error inserting user data:', err);
                    return res.status(500).json({ error: 'Internal server error while saving user data.' });
                }

                res.send(`
                    <div style="
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        text-align: center;
                        background-color: #f4f4f4;
                    ">
                        <div style="
                            padding: 20px;
                            border: 1px solid #ccc;
                            border-radius: 5px;
                            background-color: #fff;
                            box-shadow: 0 0 10px rgba(0,0,0,0.1);
                        ">
                            <h2 style="color: #46a49b;">Signed up successfully!</h2>
                            <a href="/" style="
                                display: inline-block;
                                padding: 10px 20px;
                                margin-top: 10px;
                                background-color: #007bff;
                                color: white;
                                text-decoration: none;
                                font-weight: bold;
                                border-radius: 5px;
                                transition: background-color 0.3s;
                            ">
                                Sign in here
                            </a>
                        </div>
                    </div>
                `);


            });
        });
    });


// ----------hàm authentication----------
const authenticateUser = (req, res, next) => {
    const userEmail = req.cookies.user;

    if (!userEmail) {
        return res.status(403).render('access-denied');
    }

    const userQuery = 'SELECT id, full_name FROM users WHERE email = ?';

    connection.query(userQuery, [userEmail], (err, userResults) => {
        if (err) {
            console.error('Error fetching user information from the database:', err);
            return res.status(500).send('Internal Server Error');
        }

        if (userResults.length > 0) {
            const user = userResults[0];
            req.user = {
                id: user.id,
                full_name: user.full_name,
            };
            return next();
        }

        return res.status(403).render('access-denied');
    });
};



// ----------hàm inbox----------
app.get('/inbox', authenticateUser, (req, res) => {
    const pageNumber = parseInt(req.query.page) || 1;
    const itemsPerPage = 5;

    const countEmailsQuery = `
        SELECT COUNT(*) AS totalEmails 
        FROM emails 
        WHERE receiver_id = ? AND deleted_by_receiver = 0
    `;

    connection.query(countEmailsQuery, [req.user.id], (err, result) => {
        if (err) {
            console.error('Failed to retrieve email count:', err);
            return res.status(500).send('Internal Server Error');
        }

        const totalEmails = result[0].totalEmails;
        const totalPages = Math.ceil(totalEmails / itemsPerPage);
        const startIndex = (pageNumber - 1) * itemsPerPage;

        const fetchEmailsQuery = `
            SELECT e.id, u.full_name AS sender, e.subject,
                   CONCAT(SUBSTRING_INDEX(e.body, ' ', 4), '...') AS body,
                    e.attachment, 
                   e.timestamp
            FROM emails e
            JOIN users u ON e.sender_id = u.id
            WHERE e.receiver_id = ? AND e.deleted_by_receiver = 0
            LIMIT ?, ?;
        `;

        connection.query(fetchEmailsQuery, [req.user.id, startIndex, itemsPerPage], (err, emailList) => {
            if (err) {
                console.error('Failed to retrieve emails:', err);
                return res.status(500).send('Internal Server Error');
            }

            res.render('inbox', {
                user: req.user,
                emails: emailList,
                currentPage: pageNumber,
                totalPages: totalPages,
            });
        });
    });
});





// ----------hàm outbox----------
app.get('/outbox', authenticateUser, (req, res) => {
    const currentPage = parseInt(req.query.page) || 1;
    const itemsPerPage = 5;
    const offset = (currentPage - 1) * itemsPerPage;

    const countSentEmailsQuery = `
        SELECT COUNT(*) AS totalSentEmails 
        FROM emails 
        WHERE sender_id = ? AND deleted_by_sender = 0
    `;

    connection.query(countSentEmailsQuery, [req.user.id], (err, countResult) => {
        if (err) {
            console.error('Failed to count sent emails:', err);
            return res.status(500).send('Internal Server Error');
        }

        const totalSentEmails = countResult[0].totalSentEmails;
        const totalPages = Math.ceil(totalSentEmails / itemsPerPage);
        const fetchSentEmailsQuery = `
            SELECT e.id, u.full_name AS receiver, e.subject,
                   CONCAT(SUBSTRING_INDEX(e.body, ' ', 4), '...') AS body, 
                    e.attachment,
                   e.timestamp
            FROM emails e
            JOIN users u ON e.receiver_id = u.id
            WHERE e.sender_id = ? AND e.deleted_by_sender = 0
            LIMIT ?, ?;
        `;

        connection.query(fetchSentEmailsQuery, [req.user.id, offset, itemsPerPage], (err, sentEmailList) => {
            if (err) {
                console.error('Failed to fetch sent emails:', err);
                return res.status(500).send('Internal Server Error');
            }

            res.render('outbox', {
                user: req.user,
                emails: sentEmailList,
                currentPage: currentPage,
                totalPages: totalPages,
            });
        });
    });
});






// ----------hàm compose----------
app.route('/compose')
    .get(authenticateUser, (req, res) => {
        const senderId = req.user.id;
        const selectQuery = 'SELECT id, full_name AS username FROM users WHERE id != ?';

        connection.query(selectQuery, [senderId], (err, users) => {
            if (err) {
                console.error('Error fetching users:', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.render('compose', {
                user: req.user,
                users: users,
                success: null,
                error: null
            });
        });
    })
    .post(authenticateUser, upload.single('attachment'), (req, res) => {
        const senderId = req.user.id;
        const { recipient, subject, content } = req.body;
        const attachment = req.file ? req.file.filename : null;

        if (!recipient) {
            return res.render('compose', {
                user: req.user,
                users: [],
                error: 'Please select a recipient.',
                success: null
            });
        }

        const emailSubject = subject ? subject : '(no subject)';

        connection.query(
            `
            INSERT INTO emails (sender_id, receiver_id, subject, body, attachment)
            VALUES (?, ?, ?, ?, ?);
            `,
            [senderId, recipient, emailSubject, content, attachment],
            (err) => {
                if (err) {
                    console.error('Error sending email:', err);
                    return res.render('compose', {
                        user: req.user,
                        users: [],
                        error: 'Failed to send email.',
                        success: null
                    });
                }

                res.render('compose', {
                    user: req.user,
                    users: [],
                    success: 'Email sent successfully!',
                    error: null
                });
            }
        );
    });

// ----------hàm detail----------
app.get('/detail/:id?', authenticateUser, async (req, res) => {
    const emailId = req.params.id;
    const userId = req.user.id;

    try {
        if (!userId) {
            return res.redirect('/');
        }
        if (!emailId) {
            return res.render('detail', {
                user: req.user,
                subject: null,
                content: null,
                attachment: null,
                noEmail: true
            });
        }

        const [emailDetails] = await connection.promise().query(
            `
                    SELECT  
                        e.subject, 
                        e.body,
                        e.attachment

                    FROM emails e
                    WHERE e.id = ?;
                `,
            [emailId]
        );
        if (emailDetails.length === 0) {
            return res.status(404).render('detail', {
                user: req.user,
                subject: null,
                content: null,
                attachment: null,
                noEmail: true
            });
        }
        const email = emailDetails[0];

        res.render('detail', {
            user: req.user,
            subject: email.subject,
            content: email.body,
            attachment: email.attachment,
            noEmail: false
        });

    } catch (error) {
        console.error('Error loading email details:', error);
        return res.status(500).render('error', { message: 'Error loading email details.' });
    }
});

// ----------hàm delete xoá theo outbox----------
app.delete('/api/emails/outbox/:id', authenticateUser, (req, res) => {
    const { id: emailId } = req.params;
    const { id: senderId } = req.user;

    const sqlMarkDeletedBySender = `
        UPDATE emails
        SET deleted_by_sender = 1
        WHERE id = ? AND sender_id = ?;
    `;
    connection.query(sqlMarkDeletedBySender, [emailId, senderId], (error, result) => {
        if (error) {
            console.error('Failed to mark email as deleted by sender:', error);
            return res.status(500).json({ error: 'Internal server error occurred' });
        }

        if (result.affectedRows) {
            res.status(200).json({ message: 'Email marked as deleted from outbox' });
        } else {
            res.status(404).json({ error: 'Email not found or you do not have permission' });
        }
    });
});

// ----------hàm delete xoá theo inbox----------
app.delete('/api/emails/inbox/:id', authenticateUser, (req, res) => {
    const { id: emailId } = req.params;
    const { id: receiverId } = req.user;

    const sqlMarkDeletedByReceiver = `
        UPDATE emails
        SET deleted_by_receiver = 1
        WHERE id = ? AND receiver_id = ?;
    `;

    connection.query(sqlMarkDeletedByReceiver, [emailId, receiverId], (error, result) => {
        if (error) {
            console.error('Failed to mark email as deleted by receiver:', error);
            return res.status(500).json({ error: 'Internal server error occurred' });
        }

        if (result.affectedRows) {
            res.status(200).json({ message: 'Email marked as deleted from inbox' });
        } else {
            res.status(404).json({ error: 'Email not found or you do not have permission' });
        }
    });
});


// ----------hàm logout----------
app.get('/logout', (req, res) => {
    res.clearCookie('user');
    res.redirect('/');
});

// ----------PORT----------
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}/`);
});

// -------- và thế là hết  4:58 AM Tuesday 10/29/2024 ---------