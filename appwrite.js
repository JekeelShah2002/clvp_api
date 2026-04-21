const { Client, Databases, Storage, ID, Query } = require('node-appwrite');
require('dotenv').config();

const client = new Client();
client
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_PROJECT_ID || '698a323e001706b3ff01');

// Only set API key if it exists (meaning the user provided it)
if (process.env.APPWRITE_API_KEY) {
    client.setKey(process.env.APPWRITE_API_KEY);
}

const databases = new Databases(client);
const storage = new Storage(client);

const CONTACTS_COLLECTION = process.env.APPWRITE_CONTACTS_COLLECTION || 'Customer_Contacts';

module.exports = {
    client,
    databases,
    storage,
    ID,
    Query,
    DATABASE_ID: process.env.APPWRITE_DATABASE_ID || 'CLV_Database',
    DASHBOARD_BUCKET_ID: '69e14775000fcbb283a7',
    // DEMOGRAPHICS_COLLECTION is now an alias for Contact data
    DEMOGRAPHICS_COLLECTION: CONTACTS_COLLECTION,
    CONTACTS_COLLECTION,
    TRANSACTIONS_COLLECTION: process.env.APPWRITE_TRANSACTIONS_COLLECTION || 'Transactions',
    FEATURES_COLLECTION: process.env.APPWRITE_FEATURES_COLLECTION || 'Customer_Features'
};
