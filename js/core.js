        function prepareSeed() {
            const input = document.getElementById('seedInput');
            if (!input) {
                seededRandomFn = () => Math.random();
                currentSeed = '';
                return '';
            }
            let seedValue = (input.value || '').trim();
            if (!seedValue) {
                seedValue = generateSeedString();
                input.value = seedValue;
            }
            setSeed(seedValue);
            return seedValue;
        }

        function setSeed(seedValue) {
            const normalized = String(seedValue);
            currentSeed = normalized;
            const seedGenerator = xmur3(normalized);
            const base = seedGenerator();
            seededRandomFn = mulberry32(base);
        }

        function rand() {
            return seededRandomFn();
        }

        function randomizeSeed() {
            const input = document.getElementById('seedInput');
            if (!input) return;
            input.value = generateSeedString();
        }

        function generateSeedString() {
            if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
                const buffer = new Uint32Array(2);
                window.crypto.getRandomValues(buffer);
                return Array.from(buffer, n => n.toString(36)).join('').slice(0, 16);
            }
            return Math.random().toString(36).slice(2, 10);
        }

        function isAutoSeedEnabled() {
            const toggle = document.getElementById('autoSeedToggle');
            return !!(toggle && toggle.checked);
        }

        function showStatusMessage(message, tone = 'info') {
            const statusEl = document.getElementById('statusMessage');
            if (!statusEl) {
                console.log(message);
                return;
            }
            const toneMap = {
                info: 'text-slate-400',
                success: 'text-emerald-300',
                warn: 'text-amber-300',
                error: 'text-rose-300'
            };
            const toneClass = toneMap[tone] || toneMap.info;
            statusEl.className = `text-[10px] mt-0.5 ${toneClass}`;
            statusEl.textContent = message;
            if (statusMessageTimer) clearTimeout(statusMessageTimer);
            statusMessageTimer = setTimeout(() => {
                statusEl.textContent = '';
            }, 5000);
        }

        let starTooltipPinned = false;

        function getStarClassInfo(classCode) {
            return STAR_CLASS_INFO[classCode] || {
                name: `${classCode} Stellar Object`,
                temp: 'Temperature varies',
                mass: 'Mass varies',
                typicalAge: 'Age varies',
                notes: 'No additional data available for this stellar classification.'
            };
        }

        function formatStarAgeValue(value, unit) {
            let valueInMillions = unit === 'Gyr' ? value * 1000 : value;
            if (!Number.isFinite(valueInMillions) || valueInMillions < 0) {
                return 'Unknown';
            }

            if (valueInMillions >= 1000) {
                const billions = valueInMillions / 1000;
                const decimals = billions >= 100 ? 0 : billions >= 10 ? 1 : 2;
                return `${billions.toFixed(decimals)} B Years`;
            }

            const decimals = valueInMillions >= 100 ? 0 : valueInMillions >= 10 ? 1 : 2;
            return `${valueInMillions.toFixed(decimals)} M Years`;
        }

        function formatStarAgeRange(ageRange) {
            if (!ageRange || !Number.isFinite(ageRange.min) || !Number.isFinite(ageRange.max) || !ageRange.unit) {
                return null;
            }
            const minLabel = formatStarAgeValue(ageRange.min, ageRange.unit);
            const maxLabel = formatStarAgeValue(ageRange.max, ageRange.unit);
            return minLabel === maxLabel ? minLabel : `${minLabel} - ${maxLabel}`;
        }

        function generateStarAge(classCode) {
            const info = STAR_CLASS_INFO[classCode];
            if (!info || !info.ageRange) return null;
            const { min, max, unit } = info.ageRange;
            const value = min === max ? min : min + rand() * (max - min);
            return {
                value,
                unit,
                display: formatStarAgeValue(value, unit)
            };
        }

        function positionStarTooltip(event, panel) {
            const padding = 16;
            const panelRect = panel.getBoundingClientRect();
            let x = event.clientX + padding;
            let y = event.clientY + padding;
            if (x + panelRect.width > window.innerWidth - 8) {
                x = window.innerWidth - panelRect.width - 8;
            }
            if (y + panelRect.height > window.innerHeight - 8) {
                y = window.innerHeight - panelRect.height - 8;
            }
            panel.style.left = `${Math.max(8, x)}px`;
            panel.style.top = `${Math.max(8, y)}px`;
        }

        function showStarClassInfo(event, pin = false) {
            if (!selectedSystemData) return;
            const panel = document.getElementById('starClassTooltip');
            if (!panel) return;
            const cls = selectedSystemData.starClass;
            if (!cls) return;
            const info = getStarClassInfo(cls);
            const typicalAgeLabel = formatStarAgeRange(info.ageRange) || info.typicalAge || 'Age varies';
            panel.innerHTML = `
                <div class="font-semibold text-sky-300 mb-1">${info.name}</div>
                <div class="text-slate-400 mb-0.5">Temp: <span class="text-slate-200">${info.temp}</span></div>
                <div class="text-slate-400 mb-0.5">Mass: <span class="text-slate-200">${info.mass}</span></div>
                <div class="text-slate-400 mb-1">Typical Age: <span class="text-slate-200">${typicalAgeLabel}</span></div>
                <div class="text-slate-300 leading-snug">${info.notes}</div>
            `;
            panel.classList.remove('hidden');
            panel.style.opacity = '1';
            positionStarTooltip(event, panel);
            starTooltipPinned = pin;
        }

        function hideStarClassInfo(force = false) {
            if (starTooltipPinned && !force) return;
            const panel = document.getElementById('starClassTooltip');
            if (panel) {
                panel.classList.add('hidden');
                panel.style.opacity = '0';
            }
        }


