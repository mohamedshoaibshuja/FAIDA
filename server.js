const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 10000; // Required for Render

// Update this with your actual Framer URL once published
const ALLOWED_ORIGINS = [
    "http://localhost:8000",
    "https://your-project-name.framer.app" 
];

app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
}));

app.use(express.json());

const CLIENT_ID = '1023798264361-bt4mf5dluol0cc2lvouc4hnssvu7ltn4.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);
const USERS_FILE = path.join(__dirname, 'users.json');

// Helper to read/write users
function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) return {};
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
    } catch (err) { return {}; }
}

function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Routes
app.post('/api/auth/google', async (req, res) => {
    const { credential, phoneNumber } = req.body;
    try {
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const userid = payload['sub'];
        const { email, name, picture } = payload;

        const users = readUsers();
        let userToken = `token_${userid}`;

        if (!users[userToken]) {
            users[userToken] = { internalId: userid, name, email, phoneNumber: phoneNumber || null, picture, createdAt: new Date().toISOString() };
        } else {
            users[userToken].lastLogin = new Date().toISOString();
        }

        writeUsers(users);
        res.json({ success: true, token: userToken, profileIncomplete: !users[userToken].phoneNumber, user: { name, email, picture } });
    } catch (error) {
        res.status(401).json({ success: false, error: "Invalid Token" });
    }
});

app.get('/hubble/sso/:token', (req, res) => {
    const users = readUsers();
    const user = users[req.params.token];
    if (user) {
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false, error: "Invalid Token" });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend running on port ${PORT}`);
});
