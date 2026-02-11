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
import ejs from 'ejs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(expressLayouts);
app.engine('ejs', ejs.renderFile);
app.set('view engine', 'ejs');
app.set('layout', 'layout');
app.set('views', path.join(process.cwd(), 'views'));
app.use(express.static(path.join(process.cwd(), 'public')));

// Initialize Firebase
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: "googleapis.com"
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}
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
  const dailyEntries = Object.entries(dailyCounts);
  const busiestDay = dailyEntries.length > 0 ? dailyEntries.sort((a, b) => b[1] - a[1])[0] : null;
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

/**
 * Search Zendesk tickets by address
 */
async function searchZendeskTickets(address) {
  const subdomain = process.env.ZENDESK_SUBDOMAIN;
  const email = process.env.ZENDESK_EMAIL;
  const token = process.env.ZENDESK_API_TOKEN;

  if (!subdomain || !email || !token) {
    return { error: 'Zendesk credentials not configured', tickets: [] };
  }

  try {
    const query = encodeURIComponent(address);
    const url = `https://${subdomain}.zendesk.com/api/v2/search.json?query=${query}&sort_by=created_at&sort_order=desc`;
    const auth = Buffer.from(`${email}/token:${token}`).toString('base64');

    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Zendesk API error (${response.status}):`, errText);
      return { error: `Zendesk API error: ${response.status}`, tickets: [] };
    }

    const data = await response.json();
    const DN_RESOLUTION_FIELD_ID = 26119285959579;
    const SUCCESSFUL_RESOLUTIONS = [
      'signed_up_for_internet',
      'purchased_low_cost_devices',
      'enrolled_to_digital_skills_training',
      'signed_up_for_internet_and_dl',
      'signed_up_for_internet_and_lcc',
      'enroll_to_dl_and_purchased_lcc',
      'purchased_lcc__signed_up_for_internet_and_dl'
    ];

    const tickets = (data.results || [])
      .filter(r => r.result_type === 'ticket')
      .map(t => {
        const dnField = (t.custom_fields || []).find(f => f.id === DN_RESOLUTION_FIELD_ID);
        const dnResolution = dnField ? dnField.value : null;
        return {
          id: t.id,
          subject: t.subject || 'No subject',
          status: t.status,
          created_at: t.created_at,
          updated_at: t.updated_at,
          description: (t.description || '').substring(0, 200),
          dnResolution,
          hasSuccessfulResolution: SUCCESSFUL_RESOLUTIONS.includes(dnResolution)
        };
      });

    return { error: null, tickets };
  } catch (err) {
    console.error('Zendesk search error:', err.message);
    return { error: err.message, tickets: [] };
  }
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
    res.status(500).send(`Error fetching analytics: ${error.message}`);
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

app.get('/impact', async (req, res) => {
  try {
    const startDate = req.query.start_date || moment().subtract(30, 'days').format('YYYY-MM-DD');
    const endDate = req.query.end_date || moment().format('YYYY-MM-DD');
    const ticketFilter = req.query.ticket_filter || 'internet';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = 25;

    const allDocs = await fetchSearches();
    const filteredDocs = filterDocuments(allDocs, startDate, endDate);

    // Get unique addresses from the searches
    const addressMap = {};
    filteredDocs.forEach(doc => {
      const addr = doc.address || 'No address';
      if (!addressMap[addr]) {
        addressMap[addr] = {
          address: addr,
          searchCount: 0,
          lastSearched: null
        };
      }
      addressMap[addr].searchCount++;
      const ts = doc.timestamp ? moment(doc.timestamp) : null;
      if (ts && (!addressMap[addr].lastSearched || ts.isAfter(addressMap[addr].lastSearched))) {
        addressMap[addr].lastSearched = ts;
      }
    });

    const addresses = Object.values(addressMap).map(a => ({
      ...a,
      lastSearched: a.lastSearched ? a.lastSearched.format('MMM DD, YYYY') : 'N/A'
    })).sort((a, b) => b.searchCount - a.searchCount);

    // Search Zendesk for ALL addresses in batches of 50
    const addressesWithTickets = [];
    const batchSize = 50;

    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (addr) => {
          const result = await searchZendeskTickets(addr.address);
          const hasInternet = result.tickets.some(t => t.hasSuccessfulResolution);
          return {
            ...addr,
            tickets: result.tickets,
            ticketCount: result.tickets.length,
            zendeskError: result.error,
            hasTicket: result.tickets.length > 0,
            hasInternet
          };
        })
      );
      addressesWithTickets.push(...batchResults);
    }

    const totalSearches = filteredDocs.length;
    const totalWithTickets = addressesWithTickets.filter(a => a.hasTicket).length;
    const totalWithoutTickets = addressesWithTickets.filter(a => !a.hasTicket && !a.zendeskError).length;
    const totalWithInternet = addressesWithTickets.filter(a => a.hasInternet).length;
    const conversionRate = addresses.length > 0
      ? ((totalWithInternet / addresses.length) * 100).toFixed(1)
      : 0;

    // Apply ticket filter
    let filteredAddresses;
    if (ticketFilter === 'internet') {
      filteredAddresses = addressesWithTickets.filter(a => a.hasInternet);
    } else if (ticketFilter === 'with_ticket') {
      filteredAddresses = addressesWithTickets.filter(a => a.hasTicket);
    } else if (ticketFilter === 'no_ticket') {
      filteredAddresses = addressesWithTickets.filter(a => !a.hasTicket);
    } else {
      filteredAddresses = addressesWithTickets;
    }

    // Pagination
    const totalFiltered = filteredAddresses.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / perPage));
    const currentPage = Math.min(page, totalPages);
    const paginatedAddresses = filteredAddresses.slice((currentPage - 1) * perPage, currentPage * perPage);

    const zendeskConfigured = !!(process.env.ZENDESK_SUBDOMAIN && process.env.ZENDESK_EMAIL && process.env.ZENDESK_API_TOKEN);

    res.render('impact', {
      addresses: paginatedAddresses,
      startDate,
      endDate,
      totalSearches,
      uniqueAddresses: addresses.length,
      totalWithTickets,
      totalWithoutTickets,
      totalWithInternet,
      conversionRate,
      zendeskConfigured,
      ticketFilter,
      currentPage,
      totalPages,
      totalFiltered,
      perPage
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(`Error fetching impact data: ${error.message}`);
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
