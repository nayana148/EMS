require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Check for API key early
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic Route
app.get('/', (req, res) => {
    res.json({ message: 'Ambutrack Backend API is running!' });
});

const addressPool = ["MG Road", "Station Road", "Ring Road", "Link Road", "City Center", "Industrial Hub", "Market Square"];

function generateNearbyCoord(centerLat, centerLng, maxOffset = 0.04) {
    const latOffset = (Math.random() * maxOffset) - (maxOffset / 2);
    const lngOffset = (Math.random() * maxOffset) - (maxOffset / 2);
    return [centerLat + latOffset, centerLng + lngOffset];
}

// Example API Endpoint
app.get('/api/status', (req, res) => {
    res.json({
        status: 'active',
        service: 'Ambutrack Backend',
        timestamp: new Date()
    });
});

app.get('/api/initial-data', (req, res) => {
    const lat = parseFloat(req.query.lat) || 19.0760;
    const lng = parseFloat(req.query.lng) || 72.8777;

    const mockHospitals = [
        { id: "H1", name: "Central Metro Hospital", loc: generateNearbyCoord(lat, lng, 0.06), capacity: 8, max: 20 },
        { id: "H2", name: "City Care General", loc: generateNearbyCoord(lat, lng, 0.05), capacity: 10, max: 10 },
        { id: "H3", name: "Eastside Clinic", loc: generateNearbyCoord(lat, lng, 0.08), capacity: 2, max: 15 }
    ];

    const firstHosp = mockHospitals[0];

    const incidents = [
        { id: "9842", type: "Cardiac Arrest", severity: "critical", loc: generateNearbyCoord(lat, lng, 0.03), time: "Just now", address: addressPool[Math.floor(Math.random() * addressPool.length)] },
        { id: "9843", type: "Traffic Collision", severity: "high", loc: generateNearbyCoord(lat, lng, 0.04), time: "2 min ago", address: addressPool[Math.floor(Math.random() * addressPool.length)] }
    ];

    const ambulances = [
        { id: "Alpha-7", driver: "J. Smith", status: "Available", speed: "0 mph", loc: generateNearbyCoord(lat, lng, 0.03), assignment: null, assignedHosp: null },
        { id: "Bravo-3", driver: "M. Davis", status: "Available", speed: "0 mph", loc: generateNearbyCoord(lat, lng, 0.05), assignment: null, assignedHosp: null },
        { id: "Charlie-1", driver: "K. Lee", status: "Stationed", speed: "0 mph", loc: (firstHosp ? firstHosp.loc : generateNearbyCoord(lat, lng, 0.06)), assignment: null, assignedHosp: null }
    ];

    res.json({
        hospitals: mockHospitals,
        incidents: incidents,
        ambulances: ambulances
    });
});


app.post('/api/chat', async (req, res) => {
    try {
        if (!genAI || process.env.GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
            return res.json({ reply: "<b>API Key Missing:</b> Please add your GEMINI_API_KEY to the backend/.env file and restart the server." });
        }

        const { message, context } = req.body;
        
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        // Build a prompt that includes the state context
        const prompt = `
You are an intelligent emergency medical dispatcher and first-aid assistant AI for an app called Ambutrack.
The user is currently simulating or managing live emergencies.
Here is the live situation context from the simulation:
- Active Incidents: ${JSON.stringify(context.incidents)}
- Available/Dispatched Ambulances: ${JSON.stringify(context.ambulances)}
- Hospital Status: ${JSON.stringify(context.hospitals)}

The user communicates over radio/chat: "${message}"

Respond concisely and professionally in less than 3 sentences. You may use simple HTML tags like <b> for emphasis. Give direct first aid instructions if they mention a medical symptom (like bleeding, burn, CPR), OR reference the live context if they ask about the status of ambulances, incidents, or hospitals.
        `;

        const result = await model.generateContent(prompt);
        const replyText = result.response.text();

        res.json({ reply: replyText });
    } catch (error) {
        console.error("Gemini API Error:", error);
        res.json({ reply: "<b>Error:</b> Could not reach AI server. Proceed with standard protocol." });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
