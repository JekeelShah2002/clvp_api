const { Client, Account } = require('node-appwrite');
require('dotenv').config();

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: No Token Provided' });
        }

        const jwt = authHeader.split(' ')[1];

        // Create a temporary client exclusively for this user's request
        const client = new Client()
            .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1')
            .setProject(process.env.APPWRITE_PROJECT_ID || '698a323e001706b3ff01')
            .setJWT(jwt);

        const account = new Account(client);

        // Try getting the account - if the JWT is invalid or expired, this throws an error
        const user = await account.get();
        
        // Attach user info to the request for potential further use in endpoints
        req.user = user;
        
        next();
    } catch (err) {
        console.error('[API Auth] Verification failed:', err.message);
        return res.status(401).json({ error: 'Unauthorized: Invalid Token' });
    }
};

module.exports = authMiddleware;
