const express = require('express');
const { Query } = require('node-appwrite');
const { databases, storage, DATABASE_ID, CONTACTS_COLLECTION, TRANSACTIONS_COLLECTION, FEATURES_COLLECTION, DASHBOARD_BUCKET_ID } = require('../appwrite');
const { InputFile } = require('node-appwrite/file');
const router = express.Router();

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOCAL_JSON_PATH = path.join(DATA_DIR, 'compiled_dashboard.json');
const CLOUD_FILE_ID = 'dashboard_v1'; // We use a static ID for global access, or can use userID later

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

//   Helper to load JSON cache (Now Async to support Cloud Sync)      
async function getDashboardData() {
    // 1. Check local cache first
    if (fs.existsSync(LOCAL_JSON_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(LOCAL_JSON_PATH, 'utf-8'));
        } catch (e) {
            console.error('[API] Local JSON corruption, will try cloud sync:', e.message);
        }
    }

    // 2. Fallback: Download from Appwrite Storage
    console.log('[API] Local cache missing. Attempting Cloud Sync from Appwrite...');
    try {
        const response = await storage.getFileDownload(DASHBOARD_BUCKET_ID, CLOUD_FILE_ID);
        // Ensure we have a proper Node.js Buffer from the ArrayBuffer
        const buffer = Buffer.from(response);
        fs.writeFileSync(LOCAL_JSON_PATH, buffer);
        console.log('[API] Cloud recovery successful. Local cache updated.');
        return JSON.parse(buffer.toString());
    } catch (err) {
        console.warn('[API] Cloud sync failed or file does not exist yet:', err.message);
        return null;
    }
}

//   POST /dashboard/sync 
// Manually trigger a cloud backup of the local dashboard
router.post('/dashboard/sync', async (req, res) => {
    try {
        if (!fs.existsSync(LOCAL_JSON_PATH)) {
            return res.status(404).json({ error: 'No local dashboard found to sync.' });
        }

        console.log('[API] Syncing dashboard to cloud...');
        
        // Check if file exists to decide between Create or Update
        let exists = false;
        try {
            await storage.getFile(DASHBOARD_BUCKET_ID, CLOUD_FILE_ID);
            exists = true;
        } catch (e) {}

        if (exists) {
            await storage.deleteFile(DASHBOARD_BUCKET_ID, CLOUD_FILE_ID);
        }

        await storage.createFile(
            DASHBOARD_BUCKET_ID,
            CLOUD_FILE_ID,
            InputFile.fromPath(LOCAL_JSON_PATH, 'compiled_dashboard.json')
        );

        console.log('[API] Dashboard successfully pushed to Appwrite Storage.');
        res.json({ status: 'success', message: 'Cloud backup complete.' });
    } catch (err) {
        console.error('[API] Cloud sync error:', err);
        res.status(500).json({ error: err.message });
    }
});

//   GET /dashboard/status 
router.get('/dashboard/status', async (req, res) => {
    try {
        // Fast local check
        if (fs.existsSync(LOCAL_JSON_PATH)) {
            return res.json({ exists: true, source: 'local' });
        }
        
        // Cloud check
        try {
            await storage.getFile(DASHBOARD_BUCKET_ID, CLOUD_FILE_ID);
            return res.json({ exists: true, source: 'cloud' });
        } catch (e) {
            return res.json({ exists: false });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

//   GET /dashboard/analytics
router.get('/dashboard/analytics', async (req, res) => {
    try {
        const db = await getDashboardData();
        if (!db) return res.status(404).json({ error: 'No dashboard data available.' });

        const allCustomers = Object.values(db);
        const total = allCustomers.length;

        //   KPIs    ─
        let totalRevenue = 0, totalClv = 0, totalTransactions = 0;
        let highTierCount = 0, atRiskCount = 0;

        //   Distributions 
        const segments = {};
        const tiers = {};
        const genders = {};
        const occupations = {};
        const states = {};
        const satisfactions = {};
        const emailSubs = { Yes: 0, No: 0 };

        //   At-risk high-value list              ─
        const atRiskHighValue = [];

        //   Monthly revenue trend               
        const monthlyRevenue = {};

        //   CLV distribution buckets              
        const clvBuckets = { '$0-$100': 0, '$100-$250': 0, '$250-$500': 0, '$500-$1K': 0, '$1K+': 0 };

        //   Income brackets─
        const incomeBrackets = { '<$30K': 0, '$30K-$60K': 0, '$60K-$100K': 0, '$100K-$200K': 0, '$200K+': 0 };

        //   Top customers by CLV               ─
        const topCustomers = [];

        allCustomers.forEach(c => {
            const f = c.features || {};
            const d = c.demographics || {};

            const rev = f.total_transaction_value || 0;
            const clv = f.clv_score || 0;
            const txCount = f.num_transactions || 0;
            const seg = f.segment || 'Standard';
            const tier = (d['Loyalty Tier'] || d.LoyaltyTier || 'unknown').toLowerCase();
            const gender = d.Gender || 'Unknown';
            const occ = d.Occupation || 'Unknown';
            const state = d.State || 'Unknown';
            const sat = (d.CustomerSatisfaction || 'unknown').toLowerCase();
            const emailSub = d['Email Subscriber'] || d.EmailSubscriber || 'No';
            const income = d.Income || 0;

            totalRevenue += rev;
            totalClv += clv;
            totalTransactions += txCount;

            if (tier === 'high') highTierCount++;
            if (seg === 'At-Risk') atRiskCount++;

            segments[seg] = (segments[seg] || 0) + 1;
            tiers[tier] = (tiers[tier] || 0) + 1;
            genders[gender] = (genders[gender] || 0) + 1;
            occupations[occ] = (occupations[occ] || 0) + 1;
            states[state] = (states[state] || 0) + 1;
            satisfactions[sat] = (satisfactions[sat] || 0) + 1;
            emailSubs[emailSub === 'Yes' ? 'Yes' : 'No']++;

            // CLV bucket
            if (clv < 100) clvBuckets['$0-$100']++;
            else if (clv < 250) clvBuckets['$100-$250']++;
            else if (clv < 500) clvBuckets['$250-$500']++;
            else if (clv < 1000) clvBuckets['$500-$1K']++;
            else clvBuckets['$1K+']++;

            // Income bracket
            if (income < 30000) incomeBrackets['<$30K']++;
            else if (income < 60000) incomeBrackets['$30K-$60K']++;
            else if (income < 100000) incomeBrackets['$60K-$100K']++;
            else if (income < 200000) incomeBrackets['$100K-$200K']++;
            else incomeBrackets['$200K+']++;

            // At-risk high tier
            if (seg === 'At-Risk' && f.loyalty_tier_score >= 2) {
                atRiskHighValue.push({
                    id: f.customer_id,
                    name: d.FullName || `${d.FirstName || ''} ${d.LastName || ''}`.trim(),
                    clv: clv,
                    revenue: rev,
                    recency: f.recency,
                    tier: tier,
                    action: f.suggested_action
                });
            }

            // Top CLV customers
            topCustomers.push({
                id: f.customer_id,
                name: d.FullName || 'Unknown',
                clv: clv,
                revenue: rev,
                segment: seg,
                tier: tier
            });

            // Monthly revenue from transactions
            if (c.transactions && Array.isArray(c.transactions)) {
                c.transactions.forEach(tx => {
                    if (tx.PurchasedOn && tx.TotalPrice) {
                        const d = new Date(tx.PurchasedOn);
                        if (!isNaN(d.getTime())) {
                            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                            monthlyRevenue[key] = (monthlyRevenue[key] || 0) + tx.TotalPrice;
                        }
                    }
                });
            }
        });

        // Sort & limit
        atRiskHighValue.sort((a, b) => b.clv - a.clv);
        topCustomers.sort((a, b) => b.clv - a.clv);

        // Sort monthly keys
        const sortedMonths = Object.keys(monthlyRevenue).sort();
        const monthlyTrend = sortedMonths.map(k => ({ month: k, revenue: Math.round(monthlyRevenue[k]) }));

        // Top states (top 10)
        const topStates = Object.entries(states)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([state, count]) => ({ state, count }));

        res.json({
            kpis: {
                totalCustomers: total,
                totalRevenue: Math.round(totalRevenue),
                totalForecastedCLV: Math.round(totalClv),
                totalTransactions: totalTransactions,
                avgOrderValue: Math.round(totalRevenue / Math.max(1, totalTransactions)),
                avgClvPerCustomer: Math.round(totalClv / Math.max(1, total)),
                highTierCustomers: highTierCount,
                atRiskCustomers: atRiskCount
            },
            segments,
            tiers,
            genders,
            occupations,
            satisfactions,
            emailSubscribers: emailSubs,
            clvDistribution: clvBuckets,
            incomeBrackets,
            topStates,
            monthlyRevenue: monthlyTrend,
            atRiskHighValue: atRiskHighValue.slice(0, 20),
            topCustomers: topCustomers.slice(0, 10)
        });
    } catch (e) {
        console.error('[API] /dashboard/analytics error:', e);
        res.status(500).json({ error: e.message });
    }
});

//   GET /customers/top  
router.get('/customers/top', async (req, res) => {
    try {
        console.log('[API] => GET /customers/top requested.');
        const db = await getDashboardData();
        if (!db) return res.json({ customers: [], mode: 'top', notice: 'No data file found' });

        // Convert object to array
        const allCustomers = Object.values(db);
        
        // Sort by loyalty tier, then value
        allCustomers.sort((a, b) => {
            const tierA = a.features?.loyalty_tier_score || 0;
            const tierB = b.features?.loyalty_tier_score || 0;
            if (tierB !== tierA) return tierB - tierA;
            
            const valA = a.features?.total_transaction_value || 0;
            const valB = b.features?.total_transaction_value || 0;
            return valB - valA;
        });

        // Top 25
        const top25 = allCustomers.slice(0, 25).map(c => ({
            ...c.demographics,
            customer_id: c.features.customer_id, // Root level for UI navigation
            features: c.features
        }));

        res.json({ customers: top25, mode: 'top' });
    } catch (e) {
        console.error('[API] /customers/top error:', e);
        res.status(500).json({ error: e.message });
    }
});

//   GET /customers    
router.get('/customers', async (req, res) => {
    try {
        const queryTerm = (req.query.q || '').trim().toLowerCase();
        if (!queryTerm) {
            return res.status(400).json({ error: 'Search query is required.' });
        }
        console.log(`[API] => GET /customers search: "${queryTerm}"`);

        const db = await getDashboardData();
        if (!db) return res.json({ customers: [], mode: 'search' });

        const allCustomers = Object.values(db);
        
        const matched = allCustomers.filter(c => {
            const name = (c.demographics?.FullName || '').toLowerCase();
            const id = (c.demographics?.ContactId || c.features?.customer_id || '').toLowerCase();
            return name.includes(queryTerm) || id.includes(queryTerm);
        });

        const results = matched.slice(0, 50).map(c => ({
            ...c.demographics,
            customer_id: c.features.customer_id, // Root level for UI navigation
            features: c.features
        }));

        res.json({ customers: results, mode: 'search' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

//   POST /features/compute─
// Legacy endpoint - no longer used by Angular client in Zero-Cost Architecture
router.post('/features/compute', async (req, res) => {
    res.json({ message: 'Legacy compute endpoint skipped in new architecture.', customersProcessed: 0 });
});

//   GET /customers/:id  
router.get('/customers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[API] => GET /customers/${id} requested.`);

        const db = await getDashboardData();
        if (!db) return res.status(404).json({ error: 'Database not initialized' });

        const customer = db[id];
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.json({ 
            demographics: customer.demographics, 
            features: customer.features, 
            transactions: customer.transactions 
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

//   POST /features/scores 
// Legacy endpoint - no longer used by Angular client in Zero-Cost Architecture
router.post('/features/scores', async (req, res) => {
    res.json({ message: 'Legacy scores endpoint skipped in new architecture.', count: 0 });
});

module.exports = router;
