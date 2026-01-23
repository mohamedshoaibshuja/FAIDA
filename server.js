const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 10000;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);
const USERS_FILE = path.join(__dirname, 'users.json');

app.use(cors({ origin: ["https://faida.framer.website", "http://localhost:3000"], credentials: true }));
app.use(express.json());

const readUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
const writeUsers = (u) => fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2));

app.post('/api/auth/google', async (req, res) => {
    try {
        const ticket = await client.verifyIdToken({ idToken: req.body.credential, audience: CLIENT_ID });
        const payload = ticket.getPayload();
        const users = readUsers();
        const token = `token_${payload['sub']}`;

        if (!users[token]) {
            users[token] = { internalId: payload['sub'], name: payload.name, phoneNumber: null };
            writeUsers(users);
        }

        res.json({ success: true, token, profileIncomplete: !users[token].phoneNumber });
    } catch (e) { res.status(401).json({ success: false }); }
});

app.post('/api/user/update-phone', (req, res) => {
    const { token, phoneNumber } = req.body;
    const users = readUsers();
    if (users[token]) {
        users[token].phoneNumber = phoneNumber;
        writeUsers(users);
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});

app.get('/hubble/sso/:token', (req, res) => {
    const user = readUsers()[req.params.token];
    if (user && user.phoneNumber) {
        res.json({ success: true, user: { id: user.internalId, name: user.name, phoneNumber: user.phoneNumber } });
    } else res.status(404).json({ success: false });
});

app.get('/debug/clear-users', (req, res) => {
    writeUsers({});
    res.send("Database cleared.");
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server live on ${PORT}`));
