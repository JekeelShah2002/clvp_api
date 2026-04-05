const { databases, DATABASE_ID, DEMOGRAPHICS_COLLECTION, TRANSACTIONS_COLLECTION, FEATURES_COLLECTION, client } = require('./appwrite');
require('dotenv').config();

async function createAttr(fn, ...args) {
    try {
        await fn(...args);
    } catch(err) {
        if (err.code !== 409) console.error(err);
    }
}

async function createCollections() {
    try {
        console.log('Ensure you have provided APPWRITE_API_KEY with databases.write scopes.');
        console.log(`Setting up collections in database: ${DATABASE_ID}`);
        
        try {
            await databases.get(DATABASE_ID);
        } catch (e) {
            if (e.code === 404) {
               console.log(`Database not found. Creating Database ${DATABASE_ID}...`);
               await databases.create(DATABASE_ID, 'CLV Prediction Database');
            } else {
               throw e;
            }
        }
        
        try {
            await databases.createCollection(DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'Customer Demographics');
            console.log('Created Demographics Collection.');
        } catch(e) { if(e.code!==409) throw e; }

        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'customer_id', 255, true);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'LoyaltyId', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'FirstName', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'LastName', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'FullName', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'DateOfBirth', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'Gender', 50, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'EMail', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'Telephone', 100, false);
        await createAttr(databases.createFloatAttribute.bind(databases), DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'RewardPoints', false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'CreditCard', 100, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, DEMOGRAPHICS_COLLECTION, 'CreatedOn', 255, false);

        try {
            await databases.createCollection(DATABASE_ID, TRANSACTIONS_COLLECTION, 'Transactions');
            console.log('Created Transactions Collection.');
        } catch(e) { if(e.code!==409) throw e; }

        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, TRANSACTIONS_COLLECTION, 'transaction_id', 255, true);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, TRANSACTIONS_COLLECTION, 'customer_id', 255, true);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, TRANSACTIONS_COLLECTION, 'PurchaseId', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, TRANSACTIONS_COLLECTION, 'ProductId', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, TRANSACTIONS_COLLECTION, 'PurchasedOn', 255, false);
        await createAttr(databases.createFloatAttribute.bind(databases), DATABASE_ID, TRANSACTIONS_COLLECTION, 'TotalPrice', false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, TRANSACTIONS_COLLECTION, 'ActivityTypeDisplay', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, TRANSACTIONS_COLLECTION, 'Subject', 255, false);

        try {
            await databases.createCollection(DATABASE_ID, FEATURES_COLLECTION, 'Customer Features');
            console.log('Created Features Collection.');
        } catch(e) { if(e.code!==409) throw e; }

        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'customer_id', 255, true);
        await createAttr(databases.createFloatAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'total_transaction_value', false);
        await createAttr(databases.createIntegerAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'num_transactions', false);
        await createAttr(databases.createFloatAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'average_order_value', false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'last_purchase_date', 255, false);
        await createAttr(databases.createIntegerAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'customer_tenure_days', false);
        await createAttr(databases.createFloatAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'frequency', false);
        
        console.log('Setup successfully requested. Note: Appwrite attribute creation is async and might take a few moments.');
    } catch (err) {
        console.error('Error setting up DB:', err);
    }
}

createCollections();
