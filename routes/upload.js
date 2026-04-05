const express = require('express');
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const { databases, ID, DATABASE_ID, DEMOGRAPHICS_COLLECTION, TRANSACTIONS_COLLECTION } = require('../appwrite');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/demographics', upload.single('file'), (req, res) => {
    console.log('[API] /demographics hit!');
    if (!req.file) {
        console.log('[API] No file uploaded');
        return res.status(400).json({ error: 'No file uploaded' });
    }
    console.log('[API] File uploaded to:', req.file.path);
    
    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('error', (err) => {
             console.error('[API] CSV stream error:', err);
             // Ensure response is sent so it doesn't hang forever
             if (!res.headersSent) res.status(500).json({ error: 'Failed to read CSV' });
         })
        .on('end', async () => {
            console.log(`[API] CSV parsed successfully. Row count: ${results.length}`);
            console.log(`[API] Targeting Database: ${DATABASE_ID}, Collection: ${DEMOGRAPHICS_COLLECTION}`);
            try {
                let successCount = 0;
                const BATCH_SIZE = 50;

                for (let i = 0; i < results.length; i += BATCH_SIZE) {
                    const batch = results.slice(i, i + BATCH_SIZE);
                    const promises = batch.map(async (row) => {
                        if (!row.ContactId) return;
                        try {
                            const documentId = String(row.ContactId).trim();
                            const dataPayload = {
                                customer_id: documentId,
                                LoyaltyId: row.LoyaltyId || null,
                                FirstName: row.FirstName || null,
                                LastName: row.LastName || null,
                                FullName: row.FullName || null,
                                DateOfBirth: row.DateOfBirth || null,
                                Gender: row.Gender || null,
                                EMail: row.EMail || null,
                                Telephone: row.Telephone || null,
                                RewardPoints: row.RewardPoints ? parseFloat(row.RewardPoints) : null,
                                CreditCard: row.CreditCard || null,
                                CreatedOn: row.CreatedOn || null
                            };

                            try {
                                await databases.getDocument(DATABASE_ID, DEMOGRAPHICS_COLLECTION, documentId);
                                await databases.updateDocument(DATABASE_ID, DEMOGRAPHICS_COLLECTION, documentId, dataPayload);
                            } catch (err) {
                                if (err.code === 404) {
                                    await databases.createDocument(DATABASE_ID, DEMOGRAPHICS_COLLECTION, documentId, dataPayload);
                                } else {
                                    throw err;
                                }
                            }
                            successCount++;
                        } catch (err) {
                             console.error(`[API] Error inserting Demographics row ${row.ContactId}:`, err.message);
                        }
                    });
                    
                    await Promise.all(promises);
                    console.log(`[API] Processed batch up to ${Math.min(i + BATCH_SIZE, results.length)} / ${results.length}`);
                }
                
                console.log(`[API] Finished processing Demographics. Success count: ${successCount}`);
                if (!res.headersSent) res.status(200).json({ message: 'Demographics upload processed', count: successCount });
            } catch (error) {
                console.error('[API] Fatal error in processing loop:', error);
                if (!res.headersSent) res.status(500).json({ error: error.message });
            } finally {
                fs.unlinkSync(req.file.path);
                console.log('[API] Temporary upload file deleted');
            }
        });
});

router.post('/transactions', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    console.log('[API] /transactions hit! File:', req.file.path);
    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('error', (err) => {
             console.error('[API] Transactions CSV stream error:', err);
             if (!res.headersSent) res.status(500).json({ error: 'Failed to read CSV' });
         })
        .on('end', async () => {
            console.log(`[API] Transactions parsed. Row count: ${results.length}`);
            try {
                let successCount = 0;
                const BATCH_SIZE = 50;

                for (let i = 0; i < results.length; i += BATCH_SIZE) {
                    const batch = results.slice(i, i + BATCH_SIZE);
                    const promises = batch.map(async (row) => {
                        if (!row.ContactId || !row.PurchasedOn || !row.TotalPrice) return;
                        try {
                            const dataPayload = {
                                transaction_id: ID.unique(),
                                customer_id: String(row.ContactId).trim(),
                                PurchaseId: row.PurchaseId ? String(row.PurchaseId).trim() : null,
                                ProductId: row.ProductId || null,
                                PurchasedOn: row.PurchasedOn || null,
                                TotalPrice: row.TotalPrice ? parseFloat(row.TotalPrice) : 0,
                                ActivityTypeDisplay: row.ActivityTypeDisplay || null,
                                Subject: row.Subject || null
                            };
                            
                            await databases.createDocument(DATABASE_ID, TRANSACTIONS_COLLECTION, ID.unique(), dataPayload);
                            successCount++;
                        } catch (err) {
                             console.error(`[API] Error inserting Transaction for ${row.ContactId}:`, err.message);
                        }
                    });

                    await Promise.all(promises);
                    console.log(`[API] Processed Transactions batch up to ${Math.min(i + BATCH_SIZE, results.length)} / ${results.length}`);
                }

                console.log(`[API] Finished processing Transactions. Success count: ${successCount}`);
                if (!res.headersSent) res.status(200).json({ message: 'Transactions upload processed', count: successCount });
            } catch (error) {
                console.error('[API] Fatal error in transactions loop:', error);
                if (!res.headersSent) res.status(500).json({ error: error.message });
            } finally {
                fs.unlinkSync(req.file.path);
                console.log('[API] Temporary upload file deleted');
            }
        });
});

module.exports = router;
