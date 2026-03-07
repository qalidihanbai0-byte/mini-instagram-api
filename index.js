require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

/* ================= CONFIG ================= */

const SECRET_KEY = process.env.JWT_SECRET || "mini_insta_secret_2026";

const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'user_db',
        password: process.env.DB_PASSWORD || '12345',
        port: process.env.DB_PORT || 5432,
    });

/* ================= AUTH MIDDLEWARE ================= */

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token)
        return res.status(401).json({ error: "Токен қажет" });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err)
            return res.status(403).json({ error: "Токен жарамсыз" });

        req.user = user;
        next();
    });
};

/* ================= ROOT ROUTE ================= */

app.get('/', (req, res) => {
    res.send('Mini Instagram API работает 🚀');
});

/* ================= USERS ================= */

app.post('/users', async (req, res, next) => {
    const { username, email, password_hash } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO users(username, email, password_hash)
             VALUES($1, $2, $3)
             RETURNING id, username, email`,
            [username, email, password_hash]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

app.post('/login', async (req, res, next) => {
    const { email, password_hash } = req.body;
    try {
        const result = await pool.query(
            'SELECT id, password_hash FROM users WHERE email = $1',
            [email]
        );
        const user = result.rows[0];
        if (!user || user.password_hash !== password_hash)
            return res.status(401).json({ error: "Қате логин немесе пароль" });

        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '2h' });
        res.json({ token });
    } catch (err) { next(err); }
});

/* ================= NOTES (ЗАМЕТКИ) ================= */

app.post('/notes', authenticateToken, async (req, res, next) => {
    const { content } = req.body;
    if (!content || content.length > 60) {
        return res.status(400).json({ error: "Заметка должна быть до 60 символов" });
    }
    try {
        const result = await pool.query(
            `INSERT INTO notes (user_id, content) VALUES ($1, $2) 
             ON CONFLICT (user_id) DO UPDATE SET content = $2, created_at = NOW() 
             RETURNING *`,
            [req.user.id, content]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

/* ================= STORIES (ИСТОРИИ) ================= */

app.post('/stories', authenticateToken, async (req, res, next) => {
    const { image_url } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO stories (user_id, image_url) VALUES ($1, $2) RETURNING *',
            [req.user.id, image_url]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

/* ================= FEED (ДЛЯ ВИЗУАЛИЗАЦИИ) ================= */

app.get('/feed/extra', async (req, res, next) => {
    try {
        // Получаем все заметки с именами пользователей
        const notes = await pool.query(`
            SELECT n.*, u.username 
            FROM notes n 
            JOIN users u ON n.user_id = u.id 
            ORDER BY n.created_at DESC
        `);

        // Получаем истории только за последние 24 часа
        const stories = await pool.query(`
            SELECT s.*, u.username 
            FROM stories s 
            JOIN users u ON s.user_id = u.id 
            WHERE s.created_at > NOW() - INTERVAL '24 hours' 
            ORDER BY s.created_at DESC
        `);

        res.json({
            notes: notes.rows,
            stories: stories.rows
        });
    } catch (err) { next(err); }
});

/* ================= POSTS ================= */

app.post('/posts', authenticateToken, async (req, res, next) => {
    const { caption } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO posts(author_id, caption) VALUES($1, $2) RETURNING *`,
            [req.user.id, caption]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

app.get('/posts', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const page = parseInt(req.query.page) || 1;
        const offset = (page - 1) * limit;

        const result = await pool.query(`
            SELECT p.id, p.caption, p.created_at,
                   u.username,
                   COALESCE(json_agg(m.*) FILTER (WHERE m.id IS NOT NULL), '[]') AS media,
                   (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes_count
            FROM posts p
            JOIN users u ON p.author_id = u.id
            LEFT JOIN media m ON p.id = m.post_id
            GROUP BY p.id, u.username
            ORDER BY p.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json({ page, limit, count: result.rows.length, data: result.rows });
    } catch (err) { next(err); }
});

/* ================= LIKES & COMMENTS ================= */

app.post('/posts/:id/like', authenticateToken, async (req, res, next) => {
    try {
        const check = await pool.query(
            `SELECT * FROM likes WHERE user_id=$1 AND post_id=$2`,
            [req.user.id, req.params.id]
        );
        if (check.rows.length) {
            await pool.query(`DELETE FROM likes WHERE user_id=$1 AND post_id=$2`, [req.user.id, req.params.id]);
            return res.json({ message: "Лайк алынды" });
        }
        await pool.query(`INSERT INTO likes(user_id, post_id) VALUES($1,$2)`, [req.user.id, req.params.id]);
        res.status(201).json({ message: "Лайк басылды" });
    } catch (err) { next(err); }
});

app.post('/posts/:id/comments', authenticateToken, async (req, res, next) => {
    try {
        const result = await pool.query(
            `INSERT INTO comments(post_id, author_id, text) VALUES($1,$2,$3) RETURNING *`,
            [req.params.id, req.user.id, req.body.text]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

/* ================= ERROR HANDLER & SERVER ================= */

app.use((err, req, res, next) => {
    console.error("Сервер қатесі:", err.stack);
    res.status(500).json({ status: 'error', message: err.message || 'Ішкі серверлік қате' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});