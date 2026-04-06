document.addEventListener('DOMContentLoaded', () => {

    // --- State Management ---
    window.AppState = {
        map: null,
        center: [19.0760, 72.8777], // fallback Mumbai
        hospitals: [],
        incidents: [],
        ambulances: [],
        markers: { incidents: {}, hospitals: {}, ambulances: {} },
        searchQuery: "",
        simSpeed: 0.0005,
        trackedAmbulanceRouteLine: null // For Monitor Route
    };

    const addressPool = ["MG Road", "Station Road", "Ring Road", "Link Road", "City Center", "Industrial Hub", "Market Square"];
    let incidentCounter = 9845;

    // --- Icons ---
    const Icons = {
        incident: L.divIcon({ className: 'pulse-marker', iconSize: [16, 16] }),
        hospital: L.divIcon({ className: 'hospital-marker', html: 'H', iconSize: [24, 24] }),
        user: L.divIcon({ className: 'user-marker', iconSize: [16, 16] }),
        ambulance: L.divIcon({
            className: 'ambulance-marker',
            html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h2"/><path d="M14 17h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
            iconSize: [24, 24]
        })
    };

    // --- Helpers ---
    function generateNearbyCoord(centerLat, centerLng, maxOffset = 0.04) {
        const latOffset = (Math.random() * maxOffset) - (maxOffset / 2);
        const lngOffset = (Math.random() * maxOffset) - (maxOffset / 2);
        return [centerLat + latOffset, centerLng + lngOffset];
    }

    function moveTowards(current, target) {
        let speed = AppState.simSpeed;
        let latDiff = target[0] - current[0];
        let lngDiff = target[1] - current[1];
        let dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

        if (dist < speed) return target; // Reached

        let ratio = speed / dist;
        return [current[0] + latDiff * ratio, current[1] + lngDiff * ratio];
    }

    // --- Initialization ---
    async function initApp(lat, lng) {
        AppState.center = [lat, lng];

        const mapDiv = document.getElementById('map');
        if (mapDiv._leaflet_id) mapDiv._leaflet_id = null;
        mapDiv.innerHTML = '';

        AppState.map = L.map('map', { zoomControl: false }).setView([lat, lng], 14);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19
        }).addTo(AppState.map);
        L.control.zoom({ position: 'bottomright' }).addTo(AppState.map);

        L.marker([lat, lng], { icon: Icons.user }).addTo(AppState.map).bindPopup("<b>Dispatcher Center</b><br>You are here.");

        // Fetch Initial Data from our Backend Server
        try {
            console.log("Fetching mock data from Backend API...");
            const beRes = await fetch(`http://localhost:5000/api/initial-data?lat=${lat}&lng=${lng}`);
            const beData = await beRes.json();
            
            AppState.incidents = beData.incidents;
            AppState.ambulances = beData.ambulances;
            
            // 2. Fetch REAL Hospitals from Overpass API (Radius 5000m)
            try {
                console.log("Fetching real hospitals from Overpass API...");
                const query = `[out:json];node(around:8000,${lat},${lng})[amenity=hospital];out 10;`;
                const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
                const res = await fetch(url);
                const data = await res.json();

                if (data.elements && data.elements.length > 0) {
                    AppState.hospitals = data.elements.map((el, i) => ({
                        id: "H" + i,
                        name: el.tags && el.tags.name ? el.tags.name : "Local Hospital",
                        loc: [el.lat, el.lon],
                        capacity: Math.floor(Math.random() * 20),
                        max: 20 + Math.floor(Math.random() * 30) // give realistic numbers
                    }));
                } else {
                    console.warn("No real hospitals found nearby, using backend mock ones.");
                    AppState.hospitals = beData.hospitals;
                }
            } catch (e) {
                console.warn("Overpass API failed, using backend mock hospitals.", e);
                AppState.hospitals = beData.hospitals;
            }
        } catch(err) {
            console.error("Failed to connect to Local Backend. Make sure your server is running!", err);
            // Fallback empty if backend is down
            AppState.hospitals = [];
            AppState.incidents = [];
            AppState.ambulances = [];
            alert("Backend server is not running! Start it with 'npm start' in the backend folder.");
        }

        // 3. Render
        renderMapMarkers();
        renderSidebar();
        renderUnitsTable();
        renderIncidentsTable();

        // 4. Start Sim
        setInterval(simulationLoop, 3000);

        // 5. Hooks
        setupEventListeners();

        lucide.createIcons();
    }



    // --- Rendering Logic ---
    function renderMapMarkers() {
        const query = AppState.searchQuery.toLowerCase();

        // Incidents
        AppState.incidents.forEach(inc => {
            const matches = inc.type.toLowerCase().includes(query) || inc.id.includes(query) || inc.address.toLowerCase().includes(query);

            if (!AppState.markers.incidents[inc.id] && matches) {
                let marker = L.marker(inc.loc, { icon: Icons.incident }).addTo(AppState.map)
                    .bindPopup(`<b>Incident #${inc.id}</b><br>${inc.type}`);
                AppState.markers.incidents[inc.id] = marker;
            } else if (AppState.markers.incidents[inc.id]) {
                if (matches) AppState.markers.incidents[inc.id].setLatLng(inc.loc);
                else { AppState.map.removeLayer(AppState.markers.incidents[inc.id]); delete AppState.markers.incidents[inc.id]; }
            }
        });


        // Hospitals
        AppState.hospitals.forEach(h => {
            const matches = h.name.toLowerCase().includes(query);
            if (!AppState.markers.hospitals[h.id] && matches) {
                let marker = L.marker(h.loc, { icon: Icons.hospital }).addTo(AppState.map)
                    .bindPopup(`<b>${h.name}</b><br>ICU: ${h.capacity}/${h.max}`);
                AppState.markers.hospitals[h.id] = marker;
            }
        });

        // Ambulances
        AppState.ambulances.forEach(amb => {
            const matches = amb.id.toLowerCase().includes(query) || amb.driver.toLowerCase().includes(query);
            if (!AppState.markers.ambulances[amb.id] && matches) {
                let marker = L.marker(amb.loc, { icon: Icons.ambulance }).addTo(AppState.map)
                    .bindPopup(`<b>Unit ${amb.id}</b><br>Status: ${amb.status}`);
                AppState.markers.ambulances[amb.id] = marker;
            } else if (AppState.markers.ambulances[amb.id]) {
                if (matches) {
                    AppState.markers.ambulances[amb.id].setLatLng(amb.loc);
                    AppState.markers.ambulances[amb.id].setPopupContent(`<b>Unit ${amb.id}</b><br>Status: ${amb.status}`);
                }
            }
        });

        // Redraw route line if active (For Phase 6, we ONLY update waypoints if we want the line to shrink, but doing this continuously causes OSRM rate limits. Therefore, we disable active shrink for the simulation to avoid API bans)
    }

    function renderSidebar() {
        const query = AppState.searchQuery.toLowerCase();

        // Incident List
        const listDiv = document.getElementById('incidentList');
        listDiv.innerHTML = '';

        AppState.incidents.forEach(inc => {
            if (!(inc.type.toLowerCase().includes(query) || inc.id.includes(query) || inc.address.toLowerCase().includes(query))) return;

            const severityClass = inc.severity === 'critical' ? 'red' : 'orange';
            const card = document.createElement('div');
            card.className = `incident-card ${inc.severity}`;
            card.innerHTML = `
                <span class="incident-tag ${severityClass}">${inc.severity} Priority</span>
                <h3 class="incident-title">${inc.type} (#${inc.id})</h3>
                <div class="incident-loc">
                    <i data-lucide="map-pin" style="width:12px;height:12px;"></i>
                    ${inc.address} • ${inc.time}
                </div>
            `;
            // Click to fly
            card.addEventListener('click', () => {
                AppState.map.flyTo(inc.loc, 16);
                if (AppState.markers.incidents[inc.id]) AppState.markers.incidents[inc.id].openPopup();
                document.getElementById('nav-dashboard').click(); // jump to dash
            });
            listDiv.appendChild(card);
        });

        document.getElementById('incidentsBadge').textContent = AppState.incidents.length;

        // Hosp Capacity
        const hospList = document.getElementById('hospital-capacities-list');
        hospList.innerHTML = '';
        AppState.hospitals.slice(0, 4).forEach(h => {
            let pct = (h.capacity / h.max) * 100;
            let colorClass = pct > 90 ? 'danger' : (pct < 50 ? 'success' : '');
            let colorText = pct > 90 ? 'text-danger' : '';
            hospList.innerHTML += `
                <div class="hospital-item">
                    <div class="hospital-info">
                        <span>${h.name}</span>
                        <span class="${colorText}">${h.capacity}/${h.max} ICU</span>
                    </div>
                    <div class="progress-bar"><div class="fill ${colorClass}" style="width: ${pct}%;"></div></div>
                </div>
            `;
        });

        // AI Insight
        if (AppState.incidents.length > 0) {
            const topInc = AppState.incidents[0]; // grab top incident for insight card
            document.getElementById('insight-incident-desc').textContent = `Incident #${topInc.id} - ${topInc.type}`;
            const amb = AppState.ambulances.find(a => a.assignment && a.assignment.id === topInc.id);
            document.getElementById('insight-unit').textContent = amb ? `Unit ${amb.id}` : "Pending Dispatch";
            document.getElementById('assignedHospitalName').textContent = amb && amb.assignedHosp ? amb.assignedHosp.name : "Awaiting Routing...";
        }

        lucide.createIcons();
    }

    function renderUnitsTable() {
        const query = AppState.searchQuery.toLowerCase();
        const tbody = document.getElementById('units-table-body');
        tbody.innerHTML = '';

        AppState.ambulances.forEach(amb => {
            if (!(amb.id.toLowerCase().includes(query) || amb.driver.toLowerCase().includes(query) || amb.status.toLowerCase().includes(query))) return;

            let assignText = amb.assignment ? `Routing to Incident #${amb.assignment.id}` : "None";
            let rowColor = amb.status === 'En Route' ? 'color: var(--accent-amber);' : 'color: var(--text-secondary);';

            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 16px; font-weight:600;">${amb.id}</td>
                    <td style="padding: 16px;">${amb.driver}</td>
                    <td style="padding: 16px; ${rowColor} font-weight:500;">${amb.status}</td>
                    <td style="padding: 16px;">${amb.speed}</td>
                    <td style="padding: 16px;">${assignText}</td>
                </tr>
            `;
        });
    }

    function renderIncidentsTable() {
        const tbody = document.getElementById('incidents-table-body');
        tbody.innerHTML = '';
        AppState.incidents.forEach(inc => {
            let color = inc.severity === 'critical' ? 'color: var(--accent-red);' : 'color: var(--accent-amber);';
            tbody.innerHTML += `
                 <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 16px; font-weight:600;">${inc.id}</td>
                    <td style="padding: 16px; ${color} font-weight:600;">${inc.severity.toUpperCase()}</td>
                    <td style="padding: 16px;">${inc.type}</td>
                    <td style="padding: 16px; color: var(--text-secondary);">${inc.time}</td>
                    <td style="padding: 16px;">${inc.address}</td>
                </tr>
            `;
        });
    }
    // --- Phase 8: Nearest Vehicle Auto-Dispatch AI ---
    async function fetchOSRMRoute(amb) {
        if (!amb.assignment) return;
        let startLoc = amb.loc;
        let endLoc = amb.assignment.loc;
        try {
            // Fetch pure geometry from OSRM alternative without routing UI layer
            let url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${startLoc[1]},${startLoc[0]};${endLoc[1]},${endLoc[0]}?geometries=geojson&overview=full`;
            let response = await fetch(url);
            let data = await response.json();
            if (data.routes && data.routes.length > 0) {
                // Convert coordinates [lng, lat] to {lat, lng} array for our consumption engine
                amb.routePath = data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
            }
        } catch (error) {
            console.error("OSRM background fetch failed:", error);
            amb.routePath = undefined;
        }
    }

    function autoDispatchClosestUnit() {
        let activeAssignments = AppState.ambulances.filter(a => a.assignment).map(a => a.assignment.id);

        AppState.incidents.forEach(inc => {
            if (activeAssignments.includes(inc.id)) return; // Already handled

            let closestAmb = null;
            let minDist = Infinity;

            AppState.ambulances.forEach(amb => {
                if (amb.status === 'Available' || amb.status === 'Stationed') {
                    let d = Math.pow(amb.loc[0] - inc.loc[0], 2) + Math.pow(amb.loc[1] - inc.loc[1], 2);
                    if (d < minDist) {
                        minDist = d;
                        closestAmb = amb;
                    }
                }
            });

            if (closestAmb) {
                closestAmb.assignment = inc;
                closestAmb.status = 'En Route';
                closestAmb.routePath = []; // Halt Euclidean fallback while awaiting OSRM
                fetchOSRMRoute(closestAmb);
                
                activeAssignments.push(inc.id);
            }
        });
    }

    // --- Simulation Loop ---
    function simulationLoop() {
        
        // Phase 8: Assign Idle Vehicles
        autoDispatchClosestUnit();

        // 1. Move Ambulances
        AppState.ambulances.forEach(amb => {
            if (amb.status === 'En Route' && amb.assignment) {
                
                if (amb.routePath && amb.routePath.length > 0) {
                    // Smoothly animate between geometric OSRM nodes
                    let targetNode = [amb.routePath[0].lat, amb.routePath[0].lng];
                    let newLoc = moveTowards(amb.loc, targetNode);
                    amb.loc = newLoc;
                    
                    let baseSpeed = AppState.simSpeed * 10000;
                    amb.speed = Math.floor(Math.random() * 10 + baseSpeed) + " mph";

                    // Check if node reached
                    if (Math.abs(newLoc[0] - targetNode[0]) < 0.0001 && Math.abs(newLoc[1] - targetNode[1]) < 0.0001) {
                         amb.routePath.shift(); // remove node
                    }

                    if (amb.routePath.length === 0) { 
                        // Route geometry exhausted, fallback to final point
                        amb.routePath = undefined;
                    }
                } else if (amb.routePath === undefined) {
                    // Fallback mathematically while OSRM API is still fetching
                    let targetLoc = amb.assignment.loc;
                    let newLoc = moveTowards(amb.loc, targetLoc);
                    amb.loc = newLoc;

                    let baseSpeed = AppState.simSpeed * 10000;
                    amb.speed = Math.floor(Math.random() * 10 + baseSpeed) + " mph";

                    if (Math.abs(newLoc[0] - targetLoc[0]) < 0.0001 && Math.abs(newLoc[1] - targetLoc[1]) < 0.0001) {
                        amb.status = "On Scene";
                        amb.speed = "0 mph";
                        if (AppState.trackedAmbulanceRouteLine) {
                            AppState.map.removeControl(AppState.trackedAmbulanceRouteLine);
                            AppState.trackedAmbulanceRouteLine = null;
                        }
                    }
                }
            }
        });

        // 2. Incident spawning
        if (Math.random() < 0.05 && AppState.incidents.length < 15) {
            incidentCounter++;
            AppState.incidents.unshift({
                id: incidentCounter.toString(),
                type: ["Medical Emergency", "Structure Fire", "Traffic Collision", "Assault"][Math.floor(Math.random() * 4)],
                severity: Math.random() > 0.7 ? "critical" : "high",
                loc: generateNearbyCoord(AppState.center[0], AppState.center[1], 0.08),
                time: "Just now",
                address: addressPool[Math.floor(Math.random() * addressPool.length)]
            });
            renderIncidentsTable();
        }

        // 3. Fluctuate hospitals safely
        if (Math.random() < 0.3 && AppState.hospitals.length > 0) {
            let rsH = AppState.hospitals[Math.floor(Math.random() * AppState.hospitals.length)];
            let change = Math.random() > 0.5 ? 1 : -1;
            if (rsH.capacity + change >= 0 && rsH.capacity + change <= rsH.max) rsH.capacity += change;
        }

        renderMapMarkers();
        renderSidebar();
        renderUnitsTable();
    }

    // --- Switch UI Views ---
    function switchView(viewId) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');

        document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
        
        // Disengage User Mode if active
        const aiSidebar = document.querySelector('.ai-sidebar');
        const incPanel = document.querySelector('.incidents-panel');
        const grid = document.querySelector('.dashboard-grid');
        const mapPanel = document.querySelector('.map-panel');
        const hospWidget = document.getElementById('hospital-selection-widget');
        const chatWidget = document.getElementById('ai-chat-widget');

        if(aiSidebar) aiSidebar.style.display = ''; // restores default CSS
        if(incPanel) incPanel.style.display = '';
        if(grid) grid.style.display = 'grid'; // restores 3-column layout
        if(mapPanel) {
            mapPanel.style.flex = '';
            mapPanel.style.width = '';
        }
        if(hospWidget) hospWidget.classList.add('hidden');
        if(chatWidget) chatWidget.classList.add('hidden');
        
        const exitBtn = document.getElementById('btn-exit-user-mode');
        if(exitBtn) exitBtn.classList.add('hidden');
        
        // Remove emergency map route
        if (window.emergencyUserRoute) {
            AppState.map.removeControl(window.emergencyUserRoute);
            window.emergencyUserRoute = null;
        }

        setTimeout(() => AppState.map.invalidateSize(), 150);
    }

    // --- Event Listeners ---
    function setupEventListeners() {

        document.getElementById('nav-dashboard').addEventListener('click', (e) => {
            switchView('dashboard-view');
            e.currentTarget.classList.add('active');
        });
        document.getElementById('nav-units').addEventListener('click', (e) => {
            switchView('units-view');
            e.currentTarget.classList.add('active');
            renderUnitsTable();
        });
        document.getElementById('nav-incidents').addEventListener('click', (e) => {
            switchView('incidents-view');
            e.currentTarget.classList.add('active');
            renderIncidentsTable();
        });
        document.getElementById('nav-settings').addEventListener('click', (e) => {
            switchView('settings-view');
            e.currentTarget.classList.add('active');
        });

        document.getElementById('searchInput').addEventListener('input', (e) => {
            AppState.searchQuery = e.target.value;
            renderMapMarkers(); renderSidebar(); renderUnitsTable();
        });

        document.getElementById('simSpeedSlider').addEventListener('input', (e) => {
            // map slider 1-10 to 0.0001 - 0.001
            AppState.simSpeed = e.target.value * 0.0001;
        });

        document.getElementById('btnToggleContrast').addEventListener('click', () => {
            document.body.classList.toggle('high-contrast');
        });

        const exitBtn = document.getElementById('btn-exit-user-mode');
        if (exitBtn) {
            exitBtn.addEventListener('click', () => {
                switchView('dashboard-view');
                const navDash = document.getElementById('nav-dashboard');
                if(navDash) navDash.classList.add('active');
            });
        }

        // Monitor Route Button
        document.getElementById('btnMonitorRoute').addEventListener('click', () => {
            const topInc = AppState.incidents[0];
            const amb = AppState.ambulances.find(a => a.assignment && a.assignment.id === topInc.id);

            if (amb && amb.status === 'En Route') {
                AppState.map.flyTo(amb.loc, 15);

                // Draw route if it doesn't exist
                if (!AppState.trackedAmbulanceRouteLine) {
                    // Only route to the Incident first (two points only) for a cleaner UI path
                    let wps = [ L.latLng(amb.loc[0], amb.loc[1]), L.latLng(amb.assignment.loc[0], amb.assignment.loc[1]) ];
                    
                    AppState.trackedAmbulanceRouteLine = L.Routing.control({
                        waypoints: wps,
                        lineOptions: {
                            styles: [{color: '#ef4444', opacity: 0.9, weight: 6}]
                        },
                        createMarker: function() { return null; },
                        show: false,
                        addWaypoints: false,
                        routeWhileDragging: false,
                        fitSelectedRoutes: false
                    }).addTo(AppState.map);
                    
                    // Attach logic to extract the actual physical street geometries generated by the AI
                    AppState.trackedAmbulanceRouteLine.on('routesfound', function(e) {
                         const routes = e.routes;
                         if(routes && routes.length > 0) {
                              amb.routePath = routes[0].coordinates; // Extract street vectors for simulation animation!
                         }
                    });
                    
                    setTimeout(() => {
                        alert("📡 Live Tracking Activated: Red street-level route drawn representing AI calculated true shortest mapping. Map camera is now focusing on Unit " + amb.id);
                    }, 500);
                }
            } else {
                alert("The unit is already on scene or there is no actively tracked vehicle.");
            }
        });
    }

    // --- Phase 5: EMERGENCY USER MODE & AI CHAT ---
    window.triggerEmergency = function() {
        // 1. Show Map (User Mode)
        switchView('dashboard-view');
        const aiSidebar = document.querySelector('.ai-sidebar');
        const incPanel = document.querySelector('.incidents-panel');
        const grid = document.querySelector('.dashboard-grid');
        const mapPanel = document.querySelector('.map-panel');

        if(aiSidebar) aiSidebar.style.display = 'none';
        if(incPanel) incPanel.style.display = 'none';
        
        // Expand the map to full width instead of confining it to a small grid column
        if(grid) grid.style.display = 'flex';
        if(mapPanel) {
            mapPanel.style.flex = '1';
            mapPanel.style.width = '100%';
        }

        const exitBtn = document.getElementById('btn-exit-user-mode');
        if(exitBtn) exitBtn.classList.remove('hidden');

        setTimeout(() => {
            AppState.map.invalidateSize();
        }, 100);
        
        let userLoc = AppState.center;

        // 2. Open Hospital Selection Widget
        const hospWidget = document.getElementById('hospital-selection-widget');
        const hospListDiv = document.getElementById('hospital-options-list');
        hospWidget.classList.remove('hidden');
        hospListDiv.innerHTML = '';
        
        let sortedHosps = [...AppState.hospitals].map(h => {
             h.dist = Math.pow(h.loc[0]-userLoc[0],2) + Math.pow(h.loc[1]-userLoc[1],2);
             return h;
        }).sort((a,b) => a.dist - b.dist).slice(0, 3);
        
        sortedHosps.forEach(h => {
             const div = document.createElement('div');
             div.className = 'hosp-select-card';
             div.innerHTML = `
                 <div style="font-weight: 600; font-size: 15px; color: var(--primary-teal); margin-bottom:4px;">${h.name}</div>
                 <div style="font-size: 13px; color: var(--text-secondary);">Direct Distance: ~${(Math.sqrt(h.dist)*60).toFixed(1)} miles</div>
                 <div style="font-size: 12px; margin-top:6px; color: var(--accent-amber);">ICU Usage: ${h.capacity}/${h.max}</div>
                 <button class="dispatch-amb-btn" style="margin-top: 10px; padding: 8px; width: 100%; border-radius: 8px; background: var(--accent-red); color: white; border: none; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;" title="Dispatch to your location"><i data-lucide="phone" style="width:14px;height:14px;"></i> Call Ambulance Here</button>
             `;
             
             const dispatchBtn = div.querySelector('.dispatch-amb-btn');
             dispatchBtn.onclick = (e) => {
                 e.stopPropagation(); // prevent drawing route
                 
                 const incId = "U-" + Math.floor(Math.random() * 9999);
                 const newInc = {
                     id: incId,
                     type: "User Emergency",
                     severity: "critical",
                     loc: userLoc,
                     time: "Just now",
                     address: "Current Location"
                 };
                 AppState.incidents.unshift(newInc);
                 renderMapMarkers();
                 renderIncidentsTable();
                 autoDispatchClosestUnit(); // trigger dispatch immediately
                 
                 speakText(`Emergency services contacted. An ambulance is being dispatched to your location.`);
                 alert(`✅ Emergency Services Called!\nAn ambulance is en route to your location.`);
             };

             div.onclick = () => {
                 if (window.emergencyUserRoute) AppState.map.removeControl(window.emergencyUserRoute);
                 
                 // Generate OSRM Routes with Alternatives using free OSM server
                 window.emergencyUserRoute = L.Routing.control({
                     router: L.Routing.osrmv1({
                         serviceUrl: 'https://routing.openstreetmap.de/routed-car/route/v1'
                     }),
                     waypoints: [
                         L.latLng(userLoc[0], userLoc[1]),
                         L.latLng(h.loc[0], h.loc[1])
                     ],
                     lineOptions: {
                         styles: [{color: '#3b82f6', opacity: 0.9, weight: 8}]
                     },
                     altLineOptions: {
                         styles: [{color: '#94a3b8', opacity: 0.8, weight: 6, dashArray: '10, 10'}]
                     },
                     showAlternatives: true, // Allow user choice
                     createMarker: function() { return null; },
                     show: false,
                     addWaypoints: false,
                     routeWhileDragging: false,
                     fitSelectedRoutes: false 
                 }).addTo(AppState.map);
                 
                 AppState.map.setView(userLoc, 14);
                 if(AppState.markers.hospitals[h.id]) AppState.markers.hospitals[h.id].openPopup();
                 
                 alert(`Routing securely to ${h.name}!\n\nMultiple physical paths have been calculated. You can click on the translucent grey alternative lines on the map to switch routes manually!`);
             };
             hospListDiv.appendChild(div);
        });

        // 3. Open AI Chat
        const chat = document.getElementById('ai-chat-widget');
        chat.classList.remove('hidden');
        
        const msgs = document.getElementById('chat-messages');
        msgs.innerHTML = `<div class="chat-msg bot"><b>🚨 Emergency User Mode Activated!</b><br>Fastest routing path drawn to the nearest verified physical hospital.<br><br>While you wait, please type your medical reality (e.g., "bleeding", "burn", "choking") and I will provide immediate First Aid instructions!</div>`;
    }

    document.getElementById('chat-send').addEventListener('click', handleChat);
    document.getElementById('chat-input').addEventListener('keypress', (e) => { if(e.key==='Enter') handleChat(); });

    async function handleChat() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if(!text) return;
        
        const msgs = document.getElementById('chat-messages');
        msgs.innerHTML += `<div class="chat-msg user">${text}</div>`;
        input.value = '';
        msgs.scrollTop = msgs.scrollHeight;

        const loadingId = "load-" + Date.now();
        msgs.innerHTML += `<div id="${loadingId}" class="chat-msg bot" style="opacity: 0.7;"><i>Analyzing live situation...</i></div>`;
        msgs.scrollTop = msgs.scrollHeight;

        try {
            const res = await fetch('http://localhost:5000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    context: {
                        incidents: AppState.incidents,
                        ambulances: AppState.ambulances,
                        hospitals: AppState.hospitals
                    }
                })
            });
            const data = await res.json();
            
            if (document.getElementById(loadingId)) document.getElementById(loadingId).remove();
            msgs.innerHTML += `<div class="chat-msg bot"><div class="ai-suggestion">${data.reply}</div></div>`;
            msgs.scrollTop = msgs.scrollHeight;
            speakText(data.reply);
        } catch(err) {
            if (document.getElementById(loadingId)) document.getElementById(loadingId).remove();
            let errStr = "<b>Connection Error:</b> Cannot reach AI backend.";
            msgs.innerHTML += `<div class="chat-msg bot"><div class="ai-suggestion">${errStr}</div></div>`;
            msgs.scrollTop = msgs.scrollHeight;
            speakText("Connection error.");
        }
    }

    // --- Voice Features ---
    let aiVoiceEnabled = true;

    function speakText(text) {
        if (!aiVoiceEnabled || !('speechSynthesis' in window)) return;
        // Strip out HTML tags for clean speech
        const cleanText = text.replace(/<[^>]*>?/gm, '');
        const msg = new SpeechSynthesisUtterance(cleanText);
        msg.rate = 1.0;
        msg.pitch = 1.0;
        window.speechSynthesis.speak(msg);
    }
    
    document.getElementById('chat-speak-toggle').addEventListener('click', () => {
        aiVoiceEnabled = !aiVoiceEnabled;
        const icon = document.getElementById('speak-icon');
        if (aiVoiceEnabled) {
            icon.setAttribute('data-lucide', 'volume-2');
            document.getElementById('chat-speak-toggle').style.color = 'white';
        } else {
            icon.setAttribute('data-lucide', 'volume-x');
            document.getElementById('chat-speak-toggle').style.color = 'var(--text-secondary)';
            window.speechSynthesis.cancel(); // stop current speaking
        }
        lucide.createIcons();
    });

    const micBtn = document.getElementById('chat-mic');
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        
        recognition.onstart = function() {
            micBtn.style.background = 'var(--accent-red)';
            micBtn.style.borderColor = 'var(--accent-red)';
        };
        
        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            document.getElementById('chat-input').value = transcript;
            handleChat(); // Auto-send
        };
        
        recognition.onerror = function(event) {
            console.error(event.error);
            micBtn.style.background = 'rgba(255,255,255,0.1)';
        };
        
        recognition.onend = function() {
            micBtn.style.background = 'rgba(255,255,255,0.1)';
            micBtn.style.borderColor = 'var(--border-color)';
        };
        
        micBtn.addEventListener('click', () => {
            recognition.start();
        });
    } else {
        micBtn.style.display = 'none';
    }



    // --- Start ---
    document.getElementById('map').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#14b8a6;">Querying Satellites for Local Telemetry...</div>';

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            pos => initApp(pos.coords.latitude, pos.coords.longitude),
            err => initApp(19.0760, 72.8777),
            { timeout: 8000 }
        );
    } else initApp(19.0760, 72.8777);

});
