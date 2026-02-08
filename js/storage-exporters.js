import { showStatusMessage } from './core.js';
import {
    buildGmBrief,
    buildSectorPayload,
    getExportSvgSnapshot,
    getSafeSeedValue,
    hasSectorDataForExport,
    triggerBlobDownload
} from './storage-payload.js';

export function exportSector() {
    if (!hasSectorDataForExport()) {
        showStatusMessage('Generate a sector before exporting.', 'warn');
        return;
    }
    try {
        const payload = buildSectorPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const safeSeed = getSafeSeedValue(payload.seed);
        triggerBlobDownload(blob, `sector-${safeSeed}.json`);
        showStatusMessage('Exported sector JSON.', 'success');
    } catch (err) {
        console.error(err);
        showStatusMessage('Export failed.', 'error');
    }
}

export function exportSectorSvg() {
    if (!hasSectorDataForExport()) {
        showStatusMessage('Generate a sector before exporting.', 'warn');
        return;
    }
    try {
        const payload = buildSectorPayload();
        const snapshot = getExportSvgSnapshot();
        if (!snapshot) {
            showStatusMessage('Map export unavailable.', 'error');
            return;
        }
        const blob = new Blob([snapshot.markup], { type: 'image/svg+xml;charset=utf-8' });
        triggerBlobDownload(blob, `sector-${getSafeSeedValue(payload.seed)}.svg`);
        showStatusMessage('Exported map as SVG.', 'success');
    } catch (err) {
        console.error(err);
        showStatusMessage('SVG export failed.', 'error');
    }
}

export function exportSectorPng() {
    if (!hasSectorDataForExport()) {
        showStatusMessage('Generate a sector before exporting.', 'warn');
        return;
    }
    try {
        const payload = buildSectorPayload();
        const snapshot = getExportSvgSnapshot();
        if (!snapshot) {
            showStatusMessage('Map export unavailable.', 'error');
            return;
        }

        const svgBlob = new Blob([snapshot.markup], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const image = new Image();
        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = snapshot.width;
                canvas.height = snapshot.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    URL.revokeObjectURL(url);
                    showStatusMessage('PNG export unavailable.', 'error');
                    return;
                }
                ctx.drawImage(image, 0, 0, snapshot.width, snapshot.height);
                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(url);
                    if (!blob) {
                        showStatusMessage('PNG export failed.', 'error');
                        return;
                    }
                    triggerBlobDownload(blob, `sector-${getSafeSeedValue(payload.seed)}.png`);
                    showStatusMessage('Exported map as PNG.', 'success');
                }, 'image/png');
            } catch (err) {
                URL.revokeObjectURL(url);
                console.error(err);
                showStatusMessage('PNG export failed.', 'error');
            }
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            showStatusMessage('PNG export failed.', 'error');
        };
        image.src = url;
    } catch (err) {
        console.error(err);
        showStatusMessage('PNG export failed.', 'error');
    }
}

export function exportSectorGmBrief() {
    if (!hasSectorDataForExport()) {
        showStatusMessage('Generate a sector before exporting.', 'warn');
        return;
    }
    try {
        const payload = buildSectorPayload();
        const brief = buildGmBrief(payload);
        const blob = new Blob([brief], { type: 'text/plain;charset=utf-8' });
        triggerBlobDownload(blob, `sector-${getSafeSeedValue(payload.seed)}-gm-brief.txt`);
        showStatusMessage('Exported GM brief.', 'success');
    } catch (err) {
        console.error(err);
        showStatusMessage('GM brief export failed.', 'error');
    }
}
