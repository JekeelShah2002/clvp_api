const express = require('express');
const { Query } = require('node-appwrite');
const { databases, DATABASE_ID, CONTACTS_COLLECTION, TRANSACTIONS_COLLECTION, FEATURES_COLLECTION } = require('../appwrite');
const router = express.Router();

// ─── Map Loyalty Tier label → numeric RFM score ────────────────────────────
function loyaltyTierScore(tier) {
    if (!tier) return 0;
    switch (tier.toLowerCase().trim()) {
        case 'high':   return 3;
        case 'medium': return 2;
        case 'low':    return 1;
        default:       return 0;
    }
}

// ─── GET /customers/top ─────────────────────────────────────────────────────
// Returns the top 25 customers by loyalty tier → total transaction value.
// Cost: 1 features list read + up to 25 contact reads = ~26 Appwrite ops.
router.get('/customers/top', async (req, res) => {
    try {
        console.log('[API] => GET /customers/top requested.');

        // 1. Fetch top 25 feature docs sorted by tier desc, then value desc
        const featsRes = await databases.listDocuments(DATABASE_ID, FEATURES_COLLECTION, [
            Query.orderDesc('loyalty_tier_score'),
            Query.orderDesc('total_transaction_value'),
            Query.limit(25)
        ]);
        const featureDocs = featsRes.documents;

        if (featureDocs.length === 0) {
            return res.json({ customers: [], mode: 'top' });
        }

        // 2. Fetch exactly those 25 contact documents in parallel
        const contactPromises = featureDocs.map(f =>
            databases.getDocument(DATABASE_ID, CONTACTS_COLLECTION, f.customer_id)
                .catch(() => ({ customer_id: f.customer_id })) // graceful fallback
        );
        const contactDocs = await Promise.all(contactPromises);

        // 3. Merge features into contact objects
        const featureMap = {};
        for (const f of featureDocs) featureMap[f.customer_id] = f;

        const enriched = contactDocs.map(c => ({
            ...c,
            features: featureMap[c.customer_id] || null
        }));

        res.json({ customers: enriched, mode: 'top' });
    } catch (e) {
        console.error('[API] /customers/top error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ─── GET /customers ──────────────────────────────────────────────────────────
// Search-only endpoint — requires ?q=<term>. Returns matching contacts + features.
// Cost: 1 contacts search + N/100 feature batch reads (N = results found).
router.get('/customers', async (req, res) => {
    try {
        const queryTerm = (req.query.q || '').trim();
        if (!queryTerm) {
            return res.status(400).json({ error: 'Search query is required. Use /customers/top for the default view.' });
        }
        console.log(`[API] => GET /customers search: "${queryTerm}"`);

        // Search contacts collection
        const searchRes = await databases.listDocuments(DATABASE_ID, CONTACTS_COLLECTION, [
            Query.or([
                Query.contains('FullName', queryTerm),
                Query.contains('customer_id', queryTerm)
            ]),
            Query.limit(50)
        ]);
        const demsDocuments = searchRes.documents;

        if (demsDocuments.length === 0) {
            return res.json({ customers: [], mode: 'search' });
        }

        // Fetch features for the matched customers
        const cids = demsDocuments.map(d => d.customer_id);
        const featureMap = {};
        const BATCH_SIZE = 100;

        const featurePromises = [];
        for (let i = 0; i < cids.length; i += BATCH_SIZE) {
            const chunk = cids.slice(i, i + BATCH_SIZE);
            const p = databases.listDocuments(DATABASE_ID, FEATURES_COLLECTION, [
                Query.equal('customer_id', chunk),
                Query.limit(BATCH_SIZE)
            ])
            .then(fRes => {
                for (const doc of fRes.documents) featureMap[doc.customer_id] = doc;
            })
            .catch(err => console.warn('[API] Feature chunk error:', err.message));
            featurePromises.push(p);
        }
        await Promise.all(featurePromises);

        const enriched = demsDocuments.map(d => ({
            ...d,
            features: featureMap[d.customer_id] || null
        }));

        res.json({ customers: enriched, mode: 'search' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── POST /features/compute ────────────────────────────────────────────────
router.post('/features/compute', async (req, res) => {
    try {
        const customerMap = {}; // Group by customer_id
        let loyaltyMap = {};

        // Fetch all Contacts to initialize customerMap and LoyaltyTier lookup
        let cCursor = null;
        while (true) {
            let queries = [Query.limit(5000)];
            if (cCursor) queries.push(Query.cursorAfter(cCursor));
            const contactDocs = await databases.listDocuments(DATABASE_ID, CONTACTS_COLLECTION, queries);
            for (const c of contactDocs.documents) {
                loyaltyMap[c.customer_id] = c.LoyaltyTier || null;
                customerMap[c.customer_id] = { totalValue: 0, count: 0, lastDate: null, firstDate: null };
            }
            if (contactDocs.documents.length < 5000) break;
            cCursor = contactDocs.documents[contactDocs.documents.length - 1].$id;
        }

        // Fetch all Transactions using pagination
        let tCursor = null;
        while (true) {
            let queries = [Query.limit(5000)];
            if (tCursor) queries.push(Query.cursorAfter(tCursor));
            const transList = await databases.listDocuments(DATABASE_ID, TRANSACTIONS_COLLECTION, queries);
            
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

            if (transList.documents.length < 5000) break;
            tCursor = transList.documents[transList.documents.length - 1].$id;
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
                const tenureDays = Math.max(1, Math.floor(msDiff / (1000 * 60 * 60 * 24)));
                const freq = data.count / Math.max(1, (tenureDays / 30));

                const payload = {
                    customer_id:             cid,
                    total_transaction_value: data.totalValue,
                    num_transactions:        data.count,
                    average_order_value:     aov,
                    last_purchase_date:      data.lastDate ? data.lastDate.toISOString() : '',
                    customer_tenure_days:    tenureDays,
                    frequency:               freq,
                    loyalty_tier_score:      loyaltyTierScore(loyaltyMap[cid])
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

// ─── GET /customers/:id ────────────────────────────────────────────────────
router.get('/customers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[API] => GET /customers/${id} requested. Retrieving specific customer details.`);

        let demographics = null;
        try {
            demographics = await databases.getDocument(DATABASE_ID, CONTACTS_COLLECTION, id);
        } catch (err) {
            if (err.code !== 404) console.warn('Contacts fetch error:', err.message);
        }

        let features = null;
        try {
            features = await databases.getDocument(DATABASE_ID, FEATURES_COLLECTION, id);
        } catch (err) {
            if (err.code !== 404) console.warn('Features fetch error:', err.message);
        }

        let transactions = [];
        try {
            let tCursor = null;
            while (true) {
                let queries = [Query.equal('customer_id', id), Query.limit(5000)];
                if (tCursor) queries.push(Query.cursorAfter(tCursor));
                
                const transList = await databases.listDocuments(DATABASE_ID, TRANSACTIONS_COLLECTION, queries);
                transactions.push(...transList.documents);
                
                if (transList.documents.length < 5000) break;
                tCursor = transList.documents[transList.documents.length - 1].$id;
            }
        } catch (err) {
            console.warn('Transactions fetch error fallback:', err.message);
            try {
                let tCursor = null;
                while (true) {
                    let queries = [Query.limit(5000)];
                    if (tCursor) queries.push(Query.cursorAfter(tCursor));
                    
                    const transList = await databases.listDocuments(DATABASE_ID, TRANSACTIONS_COLLECTION, queries);
                    transactions.push(...transList.documents.filter(t => t.customer_id === id));
                    
                    if (transList.documents.length < 5000) break;
                    tCursor = transList.documents[transList.documents.length - 1].$id;
                }
            } catch(e) {}
        }

        res.json({ demographics, features, transactions });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
