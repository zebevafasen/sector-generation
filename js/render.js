        const STAR_GRADIENT_CACHE = {};

        function ensureStarGradient(svg, starClass) {
            const key = (starClass || 'default').toLowerCase().replace(/[^a-z0-9]+/g, '-');
            if (STAR_GRADIENT_CACHE[key]) return STAR_GRADIENT_CACHE[key];

            let defs = svg.querySelector('defs');
            if (!defs) {
                defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
                svg.insertBefore(defs, svg.firstChild);
            }

            const gradientId = `starGradient-${key}`;
            let gradient = document.getElementById(gradientId);
            if (!gradient) {
                gradient = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
                gradient.setAttribute('id', gradientId);
                gradient.setAttribute('cx', '50%');
                gradient.setAttribute('cy', '50%');
                gradient.setAttribute('r', '50%');

                const palette = STAR_VISUALS[starClass] || STAR_VISUALS.default;
                const stops = [
                    { offset: '0%', color: palette.core },
                    { offset: '55%', color: palette.mid },
                    { offset: '100%', color: palette.halo }
                ];

                stops.forEach(stopData => {
                    const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
                    stop.setAttribute('offset', stopData.offset);
                    stop.setAttribute('stop-color', stopData.color);
                    gradient.appendChild(stop);
                });

                defs.appendChild(gradient);
            }

            STAR_GRADIENT_CACHE[key] = gradientId;
            return gradientId;
        }

        function drawGrid(cols, rows) {
            const svg = document.getElementById('hexGrid');
            
            // Layout Strategy: Pointy Top, Odd-R (Rows shifted right)
            const realWidth = cols * HEX_WIDTH + (HEX_WIDTH * 0.5); 
            const realHeight = rows * (HEX_HEIGHT * 0.75) + (HEX_HEIGHT * 0.25);
            
            // Ensure Viewport Group
            let viewport = document.getElementById('mapViewport');
            if (!viewport) {
                viewport = document.createElementNS("http://www.w3.org/2000/svg", "g");
                viewport.setAttribute("id", "mapViewport");
                svg.appendChild(viewport);
            }
            viewport.innerHTML = ''; // Clear previous

            // Center the grid initially
            const container = document.getElementById('mapContainer');
            const startX = (container.clientWidth - realWidth) / 2;
            const startY = (container.clientHeight - realHeight) / 2;
            
            // Reset View
            viewState = { scale: 1, x: startX > 0 ? startX : 20, y: startY > 0 ? startY : 20, isDragging: false };
            updateViewTransform();

            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    const hexId = `${c}-${r}`;
                    const system = sectors[hexId];
                    
                    const xOffset = (r % 2 === 1) ? (HEX_WIDTH / 2) : 0;
                    const x = (c * HEX_WIDTH) + xOffset + (HEX_WIDTH/2);
                    const y = (r * (HEX_HEIGHT * 0.75)) + (HEX_HEIGHT/2);

                    // Create Group
                    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                    g.setAttribute('class', 'hex-group');
                    g.setAttribute('data-id', hexId);
                    
                    // We use mouseup/click via event delegation now mostly, but can leave this
                    // Logic will be handled in hexClick handler to distinguishing drag vs click
                    g.onclick = (e) => handleHexClick(e, hexId, g);

                    // Polygon points
                    const points = calculateHexPoints(x, y, HEX_SIZE - 2); 
                    
                    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                    poly.setAttribute("points", points);
                    poly.setAttribute("class", "hex");
                    poly.setAttribute("fill", "#1e293b"); // Slate 800
                    poly.setAttribute("stroke", "#334155"); // Slate 700
                    poly.setAttribute("stroke-width", "1");
                    
                    if (system) {
                        poly.setAttribute("fill", "#0f172a"); // Darker for systems
                    }

                    g.appendChild(poly);

                    // Coordinates Text
                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute("x", x);
                    text.setAttribute("y", y + HEX_SIZE/1.5);
                    text.setAttribute("text-anchor", "middle");
                    text.setAttribute("class", "hex-text");
                    const label = `${String(c).padStart(2, '0')}${String(r).padStart(2, '0')}`;
                    text.textContent = label;
                    g.appendChild(text);

                    // If System exists, draw star
                    if (system) {
                        const gradientId = ensureStarGradient(svg, system.starClass);
                        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                        circle.setAttribute("cx", x);
                        circle.setAttribute("cy", y);
                        
                        let rSize = 6;
                        if(system.starClass === 'M' || system.starClass === 'Neutron') rSize = 4;
                        if(system.starClass === 'O' || system.starClass === 'B') rSize = 9;
                        if(system.starClass === 'Black Hole') {
                            rSize = 5;
                            circle.setAttribute("stroke", "white");
                            circle.setAttribute("stroke-width", "1");
                        }

                        circle.setAttribute("r", rSize);
                        circle.setAttribute("fill", `url(#${gradientId})`);
                        circle.setAttribute("class", "star-circle");
                        const glowColor = system.glow || system.color;
                        circle.style.filter = `drop-shadow(0 0 8px ${glowColor})`;
                        
                        g.appendChild(circle);
                    }

                    viewport.appendChild(g);
                }
            }
        }

        function calculateHexPoints(cx, cy, size) {
            const points = [];
            for (let i = 0; i < 6; i++) {
                const angle_deg = 60 * i - 30;
                const angle_rad = Math.PI / 180 * angle_deg;
                const x = cx + size * Math.cos(angle_rad);
                const y = cy + size * Math.sin(angle_rad);
                points.push(`${x},${y}`);
            }
            return points.join(" ");
        }

        // --- View Interaction (Pan/Zoom) ---

        function setupPanZoom() {
            const container = document.getElementById('mapContainer');

            // Wheel Zoom
            container.addEventListener('wheel', (e) => {
                e.preventDefault();
                
                const zoomSpeed = 0.001;
                const zoomFactor = Math.exp(-e.deltaY * zoomSpeed);
                const newScale = Math.min(Math.max(viewState.scale * zoomFactor, 0.2), 5); // Limit zoom

                // Calculate mouse position relative to container
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // Zoom towards mouse pointer math
                // (mouseX - x) / scale = worldX
                // newX = mouseX - worldX * newScale
                const worldX = (mouseX - viewState.x) / viewState.scale;
                const worldY = (mouseY - viewState.y) / viewState.scale;

                viewState.x = mouseX - worldX * newScale;
                viewState.y = mouseY - worldY * newScale;
                viewState.scale = newScale;

                updateViewTransform();
            });

            // Mouse Drag Pan
            container.addEventListener('mousedown', (e) => {
                viewState.isDragging = true;
                viewState.startX = e.clientX;
                viewState.startY = e.clientY;
                viewState.lastX = viewState.x;
                viewState.lastY = viewState.y;
                viewState.dragDistance = 0; // Track drag distance to distinguish clicks
            });

            window.addEventListener('mousemove', (e) => {
                if (!viewState.isDragging) return;
                e.preventDefault();

                const dx = e.clientX - viewState.startX;
                const dy = e.clientY - viewState.startY;

                viewState.dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
                viewState.x = viewState.lastX + dx;
                viewState.y = viewState.lastY + dy;
                
                updateViewTransform();
            });

            window.addEventListener('mouseup', () => {
                viewState.isDragging = false;
            });
        }

        function updateViewTransform() {
            const viewport = document.getElementById('mapViewport');
            if(viewport) {
                viewport.setAttribute('transform', `translate(${viewState.x}, ${viewState.y}) scale(${viewState.scale})`);
            }
        }

        function handleHexClick(e, id, groupElement) {
            // Prevent selection if user was panning (dragged more than 5 pixels)
            if (viewState.dragDistance > 5) return;
            
            selectHex(id, groupElement);
        }

        // --- Interaction ---

        function selectHex(id, groupElement) {
            // Remove old selection
            document.querySelectorAll('.hex.selected').forEach(el => el.classList.remove('selected'));
            
            // Highlight new
            const poly = groupElement.querySelector('polygon');
            poly.classList.add('selected');

            selectedHexId = id;
            updateInfoPanel(id);
        }

        function updateInfoPanel(id) {
            const system = sectors[id];
            selectedSystemData = system;
            const [c, r] = id.split('-');
            const displayId = `${String(c).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
            hideStarClassInfo(true);
            starTooltipPinned = false;

            const panel = document.getElementById('infoPanel');
            panel.classList.remove('opacity-50', 'pointer-events-none');
            panel.classList.add('opacity-100');
            document.getElementById('infoHexId').innerText = `HEX ${displayId}`;

            const sysDetails = document.getElementById('systemDetails');
            const emptyDetails = document.getElementById('emptyDetails');
            const typeLabel = document.getElementById('infoType');
            const starClassLabel = document.getElementById('infoStarClass');
            const starVisual = document.getElementById('infoStarVisual');
            const starAgeLabel = document.getElementById('infoStarAge');
            const planetList = document.getElementById('infoPlanetList');
            const beltList = document.getElementById('infoBeltList');
            const stationList = document.getElementById('infoStationList');

            if (system) {
                sysDetails.classList.remove('hidden');
                emptyDetails.classList.add('hidden');
                typeLabel.innerText = "Star System";
                typeLabel.className = "text-xs px-2 py-0.5 rounded-full bg-sky-900 text-sky-200 border border-sky-600";

                document.getElementById('infoSystemName').innerText = system.name;
                if (starClassLabel) {
                    starClassLabel.innerText = `Class ${system.starClass} Star`;
                    starClassLabel.classList.add('cursor-help', 'text-sky-300', 'star-class-hint');
                }
                if (starAgeLabel) {
                    if (system.starAge && Number.isFinite(system.starAge.value) && system.starAge.unit) {
                        starAgeLabel.innerText = `Age: ${formatStarAgeValue(system.starAge.value, system.starAge.unit)}`;
                    } else if (system.starAge && system.starAge.display) {
                        starAgeLabel.innerText = `Age: ${system.starAge.display}`;
                    } else {
                        const info = getStarClassInfo(system.starClass);
                        starAgeLabel.innerText = `Age: ${info.typicalAge || 'Unknown'}`;
                    }
                }
                if (starVisual) {
                    const palette = system.palette || STAR_VISUALS[system.starClass] || STAR_VISUALS.default;
                    starVisual.style.backgroundImage = `radial-gradient(circle at 40% 35%, ${system.color} 0%, ${palette.mid} 55%, ${system.glow || palette.halo} 100%)`;
                    starVisual.style.backgroundColor = palette.core;
                    starVisual.style.boxShadow = `0 0 12px ${system.glow || palette.halo}`;
                }

                document.getElementById('infoPlanetCount').innerText = system.planets.filter(p => p.type !== 'Artificial' && p.type !== 'Asteroid Belt').length;
                document.getElementById('infoPop').innerText = system.totalPop;

                if (planetList && beltList && stationList) {
                    planetList.innerHTML = '';
                    beltList.innerHTML = '';
                    stationList.innerHTML = '';

                    const renderBody = (body) => {
                        const li = document.createElement('li');
                        li.className = "bg-slate-800/50 p-2 rounded border border-slate-700/50 flex flex-col";

                        let icon = '&#9898;'; // white circle
                        if (body.type.includes('Giant')) icon = '&#127761;'; // moon
                        if (body.type === 'Terrestrial') icon = '&#127757;'; // earth
                        if (body.type === 'Oceanic') icon = '&#127754;'; // wave
                        if (body.type === 'Lava') icon = '&#127755;'; // volcano
                        if (/belt|field/i.test(body.type)) icon = '&#10022;'; // sparkle
                        if (body.type === 'Artificial') icon = '&#128752;'; // satellite

                        let html = `<div class="flex justify-between font-semibold text-sky-100"><span>${icon} ${body.name}</span> <span class="text-xs text-slate-500 font-normal">${body.type}</span></div>`;
                        if (body.features.length > 0) {
                            html += `<div class="text-xs text-slate-400 mt-1 pl-5">Detected: ${body.features.join(', ')}</div>`;
                        }
                        li.innerHTML = html;
                        return li;
                    };

                    system.planets.forEach(body => {
                        if (body.type === 'Artificial') {
                            stationList.appendChild(renderBody(body));
                        } else if (/belt|field/i.test(body.type)) {
                            beltList.appendChild(renderBody(body));
                        } else {
                            planetList.appendChild(renderBody(body));
                        }
                    });

                    if (!planetList.children.length) {
                        planetList.innerHTML = '<li class="italic text-slate-600">No planets detected.</li>';
                    }
                    if (!beltList.children.length) {
                        beltList.innerHTML = '<li class="italic text-slate-600">No belts or fields detected.</li>';
                    }
                    if (!stationList.children.length) {
                        stationList.innerHTML = '<li class="italic text-slate-600">No stations detected.</li>';
                    }
                }
            } else {
                sysDetails.classList.add('hidden');
                emptyDetails.classList.remove('hidden');
                emptyDetails.innerText = "Deep space scans indicate no major stellar masses in this sector.";
                typeLabel.innerText = "Empty Void";
                typeLabel.className = "text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-600";
                if (starClassLabel) {
                    starClassLabel.innerText = 'Class Unknown';
                    starClassLabel.classList.remove('cursor-help', 'text-sky-300', 'star-class-hint');
                }
                if (starAgeLabel) {
                    starAgeLabel.innerText = 'Age: --';
                }
                if (starVisual) {
                    starVisual.style.backgroundImage = 'none';
                    starVisual.style.backgroundColor = '#1e293b';
                    starVisual.style.boxShadow = 'none';
                }
                if (planetList) {
                    planetList.innerHTML = '';
                }
                if (beltList) {
                    beltList.innerHTML = '';
                }
                if (stationList) {
                    stationList.innerHTML = '';
                }
            }
        }

        function clearInfoPanel() {
            document.getElementById('infoPanel').classList.add('opacity-50', 'pointer-events-none');
            document.getElementById('infoHexId').innerText = '--';
            document.getElementById('infoType').innerText = 'Scanning...';
            document.getElementById('systemDetails').classList.add('hidden');
            document.getElementById('emptyDetails').classList.remove('hidden');
            document.getElementById('emptyDetails').innerText = "Select a hex to view data.";
            selectedSystemData = null;
            const starClassLabel = document.getElementById('infoStarClass');
            if (starClassLabel) {
                starClassLabel.innerText = 'Class --';
                starClassLabel.classList.remove('cursor-help', 'text-sky-300', 'star-class-hint');
            }
            const starAgeLabel = document.getElementById('infoStarAge');
            if (starAgeLabel) {
                starAgeLabel.innerText = 'Age: --';
            }
        }


        // Helpers
        function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
        }

        function romanize(num) {
            if (isNaN(num)) return NaN;
            var digits = String(+num).split(""),
                key = ["","C","CC","CCC","CD","D","DC","DCC","DCCC","CM",
                       "","X","XX","XXX","XL","L","LX","LXX","LXXX","XC",
                       "","I","II","III","IV","V","VI","VII","VIII","IX"],
                roman = "",
                i = 3;
            while (i--)
                roman = (key[+digits.pop() + (i * 10)] || "") + roman;
            return Array(+digits.join("") + 1).join("M") + roman;
        }

        function xmur3(str) {
            let h = 1779033703 ^ str.length;
            for (let i = 0; i < str.length; i++) {
                h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
                h = (h << 13) | (h >>> 19);
            }
            return function() {
                h = Math.imul(h ^ (h >>> 16), 2246822507);
                h = Math.imul(h ^ (h >>> 13), 3266489909);
                return (h ^= h >>> 16) >>> 0;
            };
        }

        function mulberry32(a) {
            return function() {
                let t = (a += 0x6D2B79F5);
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }


