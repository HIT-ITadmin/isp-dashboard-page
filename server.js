import express from 'express';
import admin from 'firebase-admin';
import moment from 'moment';
import dotenv from 'dotenv';
import cors from 'cors';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import expressLayouts from 'express-ejs-layouts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('layout', 'layout');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Firebase
const serviceAccount = {
  type: "service_account",
  project_id: "isp-dashboard-7cb6e",
  private_key_id: "b401e3cd920ba58d57a3d2b9a33cf4f3f8502c2d",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCySSxgoAaHQg05\nnPtEzm7+smdZBFPOArQKotRKbfXnPoHimRAwuj+swj9kIy11x5p7n0som3+XCycW\nsMrFS4iXoeO7heUZ6LbmIbM2nNJPHUGSdJ5QL6UIfxvi+hVbWdlh72J8G2axlFse\nvZqqlI90bGRfDg9TZFJ3qvdqT6Y8zTpFsrAFun0coOV8KNAeSzNhjNWXlGdb3T1a\nreL26U7OiDAO/PNglL1HxKN/TvNDGHg7mkWQxDTpSvIYO1TbmoxaNMlDByhjn9W7\na5dhznJ9m4NzkN7IqxhjMnBnGXpbS8ZLW+ozfR+y0FGFwBsyYTm2znKdTwc/4vjJ\nsMChHNRtAgMBAAECggEAA+olZk29NvUVU0GGJuGdgEwshsDYkjpu95jRrnyxnI07\nztzrhRZh1YpCWBGJqv9h/frmbJLVf1yIVDA3k5NwAVxVosVy3VnFwlHVHIre90u+\nJ9gVrc8OAZzA4P/6vhG/+y2FbRIw9A883PTu03YFnFnQ7mFhpsQaJ3SCkDwFe2pA\nzYueUYvwn38Uw5uz0vVVqoDAcJOuemLaY3ltAZetlJBmD5qXG5CnW0MKXmSj8FgF\nbNd5y5qP8ZIhCl6BcKEDIrvreg+M/W9MLhYCpAI623Qg3e0299u11pQHQ5BSHMMP\nrmwxurfYcQlT6LHbPaa4jylw6P7+g1ZBy8oqPi/F4QKBgQDb4mET5x5YTL5cjci6\niZjZJhICmuGAbPeE7SARV9rhb3JG7jC3sidQMxDZiUmHIDZN37+fwbC8QhRD4oLG\ni72lyr5yVWUdnTlmbdk/xC5RpYhb/uoTMCSErNFmFWmn8pK5F9e1SbNA2f7KFKeO\nXK3KgPmVFDhfXxlXLj8l3C41RQKBgQDPka0TSLoAQ8BU3ICQNxelKF652DUdtvo4\nGlRFboujlpgzfYviWOY8LErkka7nPy1H6jFZpymckMj8Cr/iQef47esBXHXp3adv\n8kY/xgg5c2Kedjz2dQCr2wzryulXduyQaAT67thuFBnER6/HGJk+14szj92jBA2Q\n4Exq2evxCQKBgF+kFgmsK7zIlLx5R2gr1XoOXyMW7yMHQppk8d/ZUPFhollL3ZDp\nQsRVkeytFHhcAILa4eTBQPiB3YKxkaR+v9zPVQsyLas16fOtsCNWV7dXwvoQ5Qu3\nkwrKiMJYaf6NOlicEE1gY0HAEF0hosf/c/BzLRw1EVgaa1FKYlk7bjXpAoGAOCXv\n64eAyRGKtWnwXRKKEuMYvKz/sUoN5Z85rI56t4XFJiiP7mqd3SkeGTZPWb59QTbY\noqfVWcTQmV1PCqVJWs0BBR09yEVtRZsD5bxr/R55TuQtGX4M8HAQzrfU5xQEagu5\nTSfO4/gMAExkADdnPNiRjyEbkz1Fbis+gKjyagECgYEAjCyS0u9x8VHegEx4kLp/\nePkNnbRto9XFUqn/p37FfR5lWPIEPE8qiA6XKR72xqiu9G4mINlOkTDH6gEwKJHl\nwbpvpSySod8vIKbH3QO/ihnRzs82SxyykxpVqCDv+IJnEUleKGfoL9df7Lapnt0y\nmqMgZq1dD5Q0nZiCEtlner0=\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@isp-dashboard-7cb6e.iam.gserviceaccount.com",
  client_id: "101642885522234108344",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40isp-dashboard-7cb6e.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

/**
 * Fetch all documents from searches collection
 */
async function fetchSearches() {
  const snapshot = await db.collection('searches').get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      firestore_id: doc.id,
      ...data,
      timestamp: data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp)) : null
    };
  });
}

/**
 * Filter documents by date range and exclude test users
 */
function filterDocuments(documents, startDate, endDate, selectedNavigator = null) {
  const start = moment(startDate).startOf('day');
  const end = moment(endDate).endOf('day');
  const testUsers = ['jesus.alayon', 'edgar.morales'];

  return documents.filter(doc => {
    const username = doc.username || '';
    if (testUsers.includes(username)) return false;
    if (selectedNavigator && username !== selectedNavigator) return false;

    if (!doc.timestamp) return false;
    const docDate = moment(doc.timestamp);
    return docDate.isBetween(start, end, null, '[]');
  });
}

/**
 * Calculate Dashboard Metrics
 */
function calculateMetrics(docs, startDate, endDate, allDocs = []) {
  const totalUsage = docs.length;
  const daysInPeriod = moment(endDate).diff(moment(startDate), 'days') + 1;
  const avgSearchesPerDay = daysInPeriod > 0 ? (totalUsage / daysInPeriod).toFixed(1) : 0;

  const uniqueAddresses = new Set(docs.map(doc => doc.address)).size;

  const appVersions = docs.map(doc => doc.appVersion || 'Unknown');
  const topAppVersion = appVersions.length > 0
    ? Object.entries(appVersions.reduce((acc, v) => (acc[v] = (acc[v] || 0) + 1, acc), {}))
      .sort((a, b) => b[1] - a[1])[0][0]
    : 'N/A';

  // Growth Rate
  const periodLength = moment(endDate).diff(moment(startDate), 'days');
  const prevPeriodStart = moment(startDate).subtract(periodLength + 1, 'days').startOf('day');
  const prevPeriodEnd = moment(startDate).subtract(1, 'days').endOf('day');

  const prevPeriodDocs = filterDocuments(allDocs.length > 0 ? allDocs : docs, prevPeriodStart, prevPeriodEnd);
  const prevUsage = prevPeriodDocs.length;
  const growthRate = prevUsage > 0
    ? (((totalUsage - prevUsage) / prevUsage) * 100).toFixed(1)
    : (totalUsage > 0 ? 100 : 0);

  // Chart Data (Daily)
  const chartLabels = [];
  const chartValues = [];
  const dailyCounts = docs.reduce((acc, doc) => {
    const date = moment(doc.timestamp).format('YYYY-MM-DD');
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});

  for (let m = moment(startDate); m.isSameOrBefore(moment(endDate)); m.add(1, 'days')) {
    const dateStr = m.format('YYYY-MM-DD');
    chartLabels.push(m.format('MMM DD'));
    chartValues.push(dailyCounts[dateStr] || 0);
  }

  // Monthly Trends (Last 12 Months)
  const monthlyLabels = [];
  const monthlyValues = [];
  const twelveMonthsAgo = moment().subtract(11, 'months').startOf('month');

  const monthlyCounts = (allDocs.length > 0 ? allDocs : docs)
    .filter(doc => moment(doc.timestamp).isSameOrAfter(twelveMonthsAgo))
    .reduce((acc, doc) => {
      const month = moment(doc.timestamp).format('YYYY-MM');
      acc[month] = (acc[month] || 0) + 1;
      return acc;
    }, {});

  for (let i = 11; i >= 0; i--) {
    const m = moment().subtract(i, 'months');
    const monthStr = m.format('YYYY-MM');
    monthlyLabels.push(m.format('MMMM YYYY'));
    monthlyValues.push(monthlyCounts[monthStr] || 0);
  }

  // Busiest Day
  const busiestDay = Object.entries(dailyCounts).sort((a, b) => b[1] - a[1])[0];
  const busiestDayFormatted = busiestDay ? moment(busiestDay[0]).format('MMM DD, YYYY') : 'N/A';
  const busiestDayCount = busiestDay ? busiestDay[1] : 0;

  return {
    totalUsage,
    avgSearchesPerDay,
    uniqueAddresses,
    topAppVersion,
    growthRate,
    chartLabels,
    chartValues,
    monthlyLabels,
    monthlyValues,
    busiestDayFormatted,
    busiestDayCount
  };
}

// Routes
app.get('/', async (req, res) => {
  try {
    const startDate = req.query.start_date || moment().subtract(30, 'days').format('YYYY-MM-DD');
    const endDate = req.query.end_date || moment().format('YYYY-MM-DD');

    const allDocs = await fetchSearches();
    const filteredDocs = filterDocuments(allDocs, startDate, endDate);
    const metrics = calculateMetrics(filteredDocs, startDate, endDate, allDocs);

    res.render('index', {
      ...metrics,
      startDate,
      endDate
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching analytics');
  }
});

app.get('/agents', async (req, res) => {
  try {
    const startDate = req.query.start_date || moment().subtract(30, 'days').format('YYYY-MM-DD');
    const endDate = req.query.end_date || moment().format('YYYY-MM-DD');
    const selectedNavigator = req.query.navigator;

    const allDocs = await fetchSearches();
    const allInDateRange = filterDocuments(allDocs, startDate, endDate);

    const availableNavigators = [...new Set(allInDateRange.map(doc => doc.username).filter(Boolean))].sort();

    const localDocs = selectedNavigator
      ? allInDateRange.filter(doc => doc.username === selectedNavigator)
      : allInDateRange;

    const navigatorStats = Object.entries(allInDateRange.reduce((acc, doc) => {
      const nav = doc.username || 'Unknown';
      if (!acc[nav]) acc[nav] = { navigator: nav, searches: 0, daysActive: new Set() };
      acc[nav].searches++;
      acc[nav].daysActive.add(moment(doc.timestamp).format('YYYY-MM-DD'));
      return acc;
    }, {}))
      .map(([nav, stats]) => ({
        ...stats,
        days_active: stats.daysActive.size,
        avg_per_day: stats.daysActive.size > 0 ? (stats.searches / stats.daysActive.size).toFixed(1) : 0
      }))
      .sort((a, b) => b.searches - a.searches);

    const metrics = calculateMetrics(localDocs, startDate, endDate, allDocs);
    const uniqueNavigators = new Set(localDocs.map(doc => doc.username).filter(Boolean)).size;
    const avgSearchesPerNavigator = uniqueNavigators > 0 ? (localDocs.length / uniqueNavigators).toFixed(1) : 0;

    res.render('agents', {
      ...metrics,
      navigatorStats,
      availableNavigators,
      selectedNavigator,
      startDate,
      endDate,
      uniqueNavigators,
      avgSearchesPerNavigator
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching agent analytics');
  }
});

app.get('/export', async (req, res) => {
  try {
    const startDate = req.query.start_date || moment().subtract(30, 'days').format('YYYY-MM-DD');
    const endDate = req.query.end_date || moment().format('YYYY-MM-DD');
    const selectedNavigator = req.query.navigator;

    const allDocs = await fetchSearches();
    const filteredDocs = filterDocuments(allDocs, startDate, endDate, selectedNavigator);

    const csvData = filteredDocs.map(doc => [
      moment(doc.timestamp).format('YYYY-MM-DD HH:mm:ss'),
      doc.username || 'Unknown',
      doc.address || 'No address',
      Array.isArray(doc.providersChecked) ? doc.providersChecked.join('; ') : '',
      doc.completed ? 'Yes' : 'No'
    ]);

    const output = stringify(csvData, {
      header: true,
      columns: ['Date/Time', 'Digital Navigator', 'Address Searched', 'Providers Checked', 'Completed']
    });

    const filename = `program_usage_${moment().format('YYYY-MM-DD_HHmmss')}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(output);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error exporting data');
  }
});

export default app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}
