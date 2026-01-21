const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 10000; 

// Use your environment variable for CORS
const ALLOWED_ORIGINS = [process.env.FRAMER_URL, "http://localhost:8000"];

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);
const USERS_FILE = path.join(__dirname, 'users.json');

function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) return {};
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
    } catch (err) { return {}; }
}

function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// 1. GOOGLE LOGIN - Now checks for missing phone number
app.post('/api/auth/google', async (req, res) => {
    const { credential } = req.body;
    try {
        const ticket = await client.verifyIdToken({ idToken: credential, audience: CLIENT_ID });
        const payload = ticket.getPayload();
        const userid = payload['sub'];
        const users = readUsers();
        let userToken = `token_${userid}`;

        if (!users[userToken]) {
            users[userToken] = { 
                internalId: userid, 
                name: payload.name, 
                email: payload.email, 
                phoneNumber: null, // Always missing initially
                picture: payload.picture 
            };
        }
        writeUsers(users);

        res.json({ 
            success: true, 
            token: userToken, 
            profileIncomplete: !users[userToken].phoneNumber // Tells Framer to show phone input
        });
    } catch (error) {
        res.status(401).json({ success: false });
    }
});

// 2. NEW: UPDATE PHONE NUMBER
app.post('/api/user/update-phone', (req, res) => {
    const { token, phoneNumber } = req.body;
    const users = readUsers();

    if (!users[token]) return res.status(401).json({ success: false });

    users[token].phoneNumber = phoneNumber;
    writeUsers(users);
    res.json({ success: true });
});

// 3. HUBBLE SSO - Returns the 3 mandatory parameters
app.get('/hubble/sso/:token', (req, res) => {
    const users = readUsers();
    const user = users[req.params.token];
    if (user && user.phoneNumber) {
        res.json({
            success: true,
            user: {
                id: user.internalId, // Mandatory
                name: user.name,     // Mandatory
                phoneNumber: user.phoneNumber // Mandatory
            }
        });
    } else {
        res.status(404).json({ success: false, error: "User incomplete" });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));
