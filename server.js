const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 10000; 

// 1. IMPROVED CORS: Explicitly allow your Framer domain
const ALLOWED_ORIGINS = [
    "https://faida.framer.website", // Your live site
    "http://localhost:3000",        // Local testing
    process.env.FRAMER_URL          // From Render environment variables
];

app.use(cors({ 
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log("CORS blocked for origin:", origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true 
}));

app.use(express.json());

// 2. GOOGLE AUTH SETUP
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID; // Must match Google Console
const client = new OAuth2Client(CLIENT_ID);
const USERS_FILE = path.join(__dirname, 'users.json');

// Helper to handle data persistence on Render
function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) return {};
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data || '{}');
    } catch (err) { 
        console.error("Error reading users file:", err);
        return {}; 
    }
}

function writeUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error("Error writing users file:", err);
    }
}

// --- API ROUTES ---

// 1. GOOGLE LOGIN
app.post('/api/auth/google', async (req, res) => {
    console.log("Login attempt received...");
    const { credential } = req.body;
    
    try {
        const ticket = await client.verifyIdToken({ 
            idToken: credential, 
            audience: CLIENT_ID 
        });
        const payload = ticket.getPayload();
        const userid = payload['sub'];
        
        console.log(`User verified: ${payload.name} (${userid})`);
        
        const users = readUsers();
        let userToken = `token_${userid}`;

        if (!users[userToken]) {
            users[userToken] = { 
                internalId: userid, 
                name: payload.name, 
                email: payload.email, 
                phoneNumber: null, // Mandatory for Hubble
                picture: payload.picture 
            };
            console.log("New user created in users.json");
        }
        
        writeUsers(users);

        res.json({ 
            success: true, 
            token: userToken, 
            profileIncomplete: !users[userToken].phoneNumber // Triggers Phone Input in Framer
        });
    } catch (error) {
        console.error("Google Auth Error:", error);
        res.status(401).json({ success: false, error: "Invalid Google token" });
    }
});

// 2. UPDATE PHONE NUMBER
app.post('/api/user/update-phone', (req, res) => {
    const { token, phoneNumber } = req.body;
    console.log(`Received phone update for token: ${token}`);
    
    const users = readUsers();

    if (!users[token]) {
        return res.status(401).json({ success: false, error: "User session not found" });
    }

    users[token].phoneNumber = phoneNumber;
    writeUsers(users);
    
    console.log(`Phone number updated successfully for ${users[token].name}`);
    res.json({ success: true });
});

// 3. HUBBLE SSO HANDSHAKE
app.get('/hubble/sso/:token', (req, res) => {
    const users = readUsers();
    const user = users[req.params.token];
    
    if (user && user.phoneNumber) {
        console.log(`Providing Hubble SSO data for user: ${user.name}`);
        res.json({
            success: true,
            user: {
                id: user.internalId, // Mandatory
                name: user.name,     // Mandatory
                phoneNumber: user.phoneNumber // Mandatory
            }
        });
    } else {
        console.log("Hubble SSO failed: User incomplete or not found");
        res.status(404).json({ success: false, error: "User incomplete" });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================`);
    console.log(`FAIDA Backend running on port ${PORT}`);
    console.log(`CORS allowed for: ${ALLOWED_ORIGINS.join(", ")}`);
    console.log(`=================================`);
});
