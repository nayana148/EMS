AmbuTrack Project Overview
AmbuTrack is a live emergency medical services (EMS) dispatch simulator and intelligent routing dashboard. It simulates a fully operational ambulance fleet responding to medical emergencies across a map, and it provides users with an interactive, AI-powered system to manage crisis situations.

The project is built on a modern Client-Server Architecture, splitting the frontend user interface from the secure backend API.

Technical Stack & Languages
Frontend (Client)
The frontend handles the visual dashboard, the interactive map, and the user interface. It is purposefully built lightweight without heavy frameworks.

Languages: HTML5, Vanilla CSS3, Vanilla ES6 JavaScript (app.js).
Leaflet.js: A leading open-source Javascript library for mobile-friendly interactive maps. It draws the visual map layer and manages the coordinate system.
Leaflet-Routing-Machine: A plugin for Leaflet that visually overlays calculated, physical street routes (the blue roads) and turn-by-turn waypoints on top of the map.
Lucide Icons: A crisp, open-source icon suite used for dashboard UI elements.
Backend (Server)
The backend acts as the secure middleman. It provides the frontend with initial simulation data and securely communicates with third-party AI APIs so that API keys are never exposed in the browser.

Environment: Node.js
express: A minimal web framework for Node.js. It creates the REST API endpoints (/api/initial-data and /api/chat) that the frontend talks to.
cors: Middleware that enables Cross-Origin Resource Sharing, allowing the frontend running on an index.html file to securely request data from the Express server.
dotenv: A zero-dependency module that securely loads the .env file containing your secret API keys into process.env.
@google/generative-ai: The official Google SDK used to connect the Node server directly to the cutting-edge Gemini 2.5 Flash artificial intelligence model.
Core Features & Subsystems
1. The Simulation Engine
The application runs a continuous loop (simulationLoop in app.js) that mimics a real-world dispatch center. It randomly spawns incidents (like Structure Fires or Traffic Collisions) around a central location and dynamically fluctuates hospital ICU capacities.

2. Auto-Dispatch & OSRM Routing
When a new incident spawns, the system automatically finds the closest available ambulance mathematically. Once an ambulance is assigned, the codebase reaches out to the Project-OSRM (Open Source Routing Machine) public API to fetch the exact GeoJSON physical street layout. The ambulance marker then dynamically animates along these real-world streets over time until it arrives on scene.

3. Emergency "User Mode"
By clicking the "Emergency" button, the system zooms into your physical location. It converts the dashboard into a crisis-management view:

Hospital Selection: A sidebar generates a list of the absolute closest hospitals.
Manual Routing: Clicking a hospital engages the leaflet-routing-machine plugin, querying OSRM to map multiple physical driving lanes to that hospital, drawing them over the map.
One-Click Dispatch: Users can click "Call Ambulance Here" to generate a critical priority incident at their location, which the AI dispatcher will immediately answer by diverting the closest unit.
4. Gemini AI Dispatch Assistant
The chatbot at the bottom right doesn't just use canned responses. When a user asks a question, the frontend takes a "snapshot" of the entire live application state (all ambulances, incidents, and hospital capacities) and securely sends it to the backend. The backend Express server feeds this massive data payload to Google Gemini. Gemini analyzes the physical locations of the ambulances and returns highly specific, context-aware answers (e.g., "Ambulance Alpha-7 is 2 miles away and can take the patient to Eastside Clinic which has 4 ICU beds open"), as well as step-by-step First Aid instructions.
