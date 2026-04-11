const express = require('express');
const { Query } = require('node-appwrite');
const { databases, DATABASE_ID, DEMOGRAPHICS_COLLECTION, TRANSACTIONS_COLLECTION, FEATURES_COLLECTION } = require('../appwrite');
const router = express.Router();

router.get('/customers', async (req, res) => {
    try {
        const queryTerm = req.query.q || '';
        let queries = [Query.limit(50)];
        if (queryTerm) {
            queries.push(Query.contains('FullName', queryTerm));
            // You might want to also query by customer_id if applicable, but Appwrite lacks native OR between different fields in some setups unless it's a dedicated search index.
        }
        
        const dems = await databases.listDocuments(DATABASE_ID, DEMOGRAPHICS_COLLECTION, queries);
        const features = await databases.listDocuments(DATABASE_ID, FEATURES_COLLECTION, [Query.limit(100)]);
        const featureMap = {};
        for(let doc of features.documents) {
            featureMap[doc.customer_id] = doc;
        }

        const enriched = dems.documents.map(d => ({
            ...d,
            features: featureMap[d.customer_id] || null
        }));

        res.json({ customers: enriched });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/features/compute', async (req, res) => {
    try {
        // Fetch all transactions (pagination handle in prod, simplified here)
        const transList = await databases.listDocuments(DATABASE_ID, TRANSACTIONS_COLLECTION, [Query.limit(5000)]);
        
        const customerMap = {}; // Group by customer_id
        
        for (const t of transList.documents) {
            const cid = t.customer_id;
            if (!customerMap[cid]) {
                customerMap[cid] = { totalValue: 0, count: 0, lastDate: null, firstDate: null };
            }
            customerMap[cid].totalValue += (t.TotalPrice || 0);
            customerMap[cid].count++;
            
            if (t.PurchasedOn) {
                const pDate = new Date(t.PurchasedOn);
                if (!customerMap[cid].lastDate || pDate > customerMap[cid].lastDate) {
                    customerMap[cid].lastDate = pDate;
                }
                if (!customerMap[cid].firstDate || pDate < customerMap[cid].firstDate) {
                    customerMap[cid].firstDate = pDate;
                }
            }
        }
        
        let count = 0;
        const cids = Object.keys(customerMap);
        const BATCH_SIZE = 50;

        for (let i = 0; i < cids.length; i += BATCH_SIZE) {
            const batchCids = cids.slice(i, i + BATCH_SIZE);
            const promises = batchCids.map(async (cid) => {
                const data = customerMap[cid];
                const aov = data.count > 0 ? (data.totalValue / data.count) : 0;
                const msDiff = (data.lastDate && data.firstDate) ? (data.lastDate - data.firstDate) : 0;
                const tenureDays = Math.max(1, Math.floor(msDiff / (1000*60*60*24)));
                const freq = data.count / Math.max(1, (tenureDays / 30)); 
                
                const payload = {
                    customer_id: cid,
                    total_transaction_value: data.totalValue,
                    num_transactions: data.count,
                    average_order_value: aov,
                    last_purchase_date: data.lastDate ? data.lastDate.toISOString() : '',
                    customer_tenure_days: tenureDays,
                    frequency: freq
                };
                
                try {
                    await databases.getDocument(DATABASE_ID, FEATURES_COLLECTION, cid);
                    await databases.updateDocument(DATABASE_ID, FEATURES_COLLECTION, cid, payload);
                } catch (err) {
                    if (err.code === 404) {
                        await databases.createDocument(DATABASE_ID, FEATURES_COLLECTION, cid, payload);
                    } else {
                        console.error(`Error updating feature for ${cid}:`, err.message);
                    }
                }
                count++;
            });
            
            await Promise.all(promises);
            console.log(`[API] Computed features up to ${Math.min(i + BATCH_SIZE, cids.length)} / ${cids.length}`);
        }
        
        console.log(`[API] Fully computed features for ${count} customers.`);
        res.json({ message: 'Features computed successfully', customersProcessed: count });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/customers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        let demographics = null;
        try {
            demographics = await databases.getDocument(DATABASE_ID, DEMOGRAPHICS_COLLECTION, id);
        } catch (err) {
            if (err.code !== 404) console.warn("Demographics fetch error:", err.message);
        }

        let features = null;
        try {
            features = await databases.getDocument(DATABASE_ID, FEATURES_COLLECTION, id);
        } catch (err) {
            if (err.code !== 404) console.warn("Features fetch error:", err.message);
        }

        let transactions = [];
        try {
            const transList = await databases.listDocuments(DATABASE_ID, TRANSACTIONS_COLLECTION, [Query.equal('customer_id', id), Query.limit(5000)]);
            transactions = transList.documents;
        } catch (err) {
            console.warn("Transactions fetch error:", err.message);
            // fallback if index missing
            try {
                const transList = await databases.listDocuments(DATABASE_ID, TRANSACTIONS_COLLECTION, [Query.limit(5000)]);
                transactions = transList.documents.filter(t => t.customer_id === id);
            } catch(e) {}
        }

        res.json({ demographics, features, transactions });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
