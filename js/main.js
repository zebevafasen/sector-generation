        // Initialization
        window.onload = function() {
            setupPanZoom();
            const importInput = document.getElementById('importFileInput');
            if (importInput) {
                importInput.addEventListener('change', handleImportFile);
            }
            setSizeMode('preset');
            setupStarClassTooltip();
            generateSector();
        };


