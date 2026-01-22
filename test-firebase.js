import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testConnection() {
    try {
        const credentialsPath = path.resolve(__dirname, process.env.FIREBASE_CREDENTIALS_PATH);
        console.log(`Checking credentials at: ${credentialsPath}`);

        if (!fs.existsSync(credentialsPath)) {
            console.error('Credentials file NOT FOUND!');
            return;
        }

        const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id
        });

        const db = admin.firestore();
        console.log('Fetching 5 documents from searches collection...');
        const snapshot = await db.collection('searches').limit(5).get();

        if (snapshot.empty) {
            console.log('No documents found.');
        } else {
            console.log(`Successfully fetched ${snapshot.size} documents.`);
            snapshot.forEach(doc => {
                console.log(`- ID: ${doc.id}, User: ${doc.data().username}`);
            });
        }
        process.exit(0);
    } catch (error) {
        console.error('Connection FAILED:', error);
        process.exit(1);
    }
}

testConnection();
