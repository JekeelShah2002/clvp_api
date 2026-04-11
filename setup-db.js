const { databases, DATABASE_ID, CONTACTS_COLLECTION, TRANSACTIONS_COLLECTION, FEATURES_COLLECTION, client } = require('./appwrite');
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
        
        // ─── Contacts Collection (replaces old Demographics) ───────────────────
        try {
            await databases.createCollection(DATABASE_ID, CONTACTS_COLLECTION, 'Customer Contacts');
            console.log('Created Customer Contacts Collection.');
        } catch(e) { if(e.code!==409) throw e; }

        // Primary key
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'customer_id', 255, true);
        // Name fields
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'FirstName', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'LastName', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'FullName', 255, false);
        // Personal
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'DateOfBirth', 50, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'Gender', 50, false);
        // Contact
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'EMail', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'Telephone', 100, false);
        // Address
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'PostCode', 50, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'StreetAddress', 500, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'City', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'State', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'Country', 100, false);
        // Metadata
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'CreatedOn', 100, false);
        // Loyalty & marketing profile
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'LoyaltyTier', 50, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'EmailSubscriber', 10, false);
        await createAttr(databases.createFloatAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'Income', false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'Occupation', 255, false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, CONTACTS_COLLECTION, 'CustomerSatisfaction', 50, false);
        console.log('Contacts attributes requested.');

        // ─── Transactions Collection ───────────────────────────────────────────
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
        console.log('Transactions attributes requested.');

        // ─── Features Collection ───────────────────────────────────────────────
        try {
            await databases.createCollection(DATABASE_ID, FEATURES_COLLECTION, 'Customer Features');
            console.log('Created Customer Features Collection.');
        } catch(e) { if(e.code!==409) throw e; }

        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'customer_id', 255, true);
        await createAttr(databases.createFloatAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'total_transaction_value', false);
        await createAttr(databases.createIntegerAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'num_transactions', false);
        await createAttr(databases.createFloatAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'average_order_value', false);
        await createAttr(databases.createStringAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'last_purchase_date', 255, false);
        await createAttr(databases.createIntegerAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'customer_tenure_days', false);
        await createAttr(databases.createFloatAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'frequency', false);
        // Loyalty Tier as numeric RFM score (high=3, medium=2, low=1, unknown=0)
        await createAttr(databases.createFloatAttribute.bind(databases), DATABASE_ID, FEATURES_COLLECTION, 'loyalty_tier_score', false);
        console.log('Features attributes requested.');
        
        console.log('\nSetup successfully requested. Note: Appwrite attribute creation is async and might take a few moments before they are available.');
    } catch (err) {
        console.error('Error setting up DB:', err);
    }
}

createCollections();
