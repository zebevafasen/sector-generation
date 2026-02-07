export function renameBodiesForSystemNameChange(system, oldName, newName) {
    if (!system || !Array.isArray(system.planets)) return;
    const oldSystemPrefix = `${oldName} `;
    const oldStationPrefix = `Station ${oldName} `;
    const oldStationBare = `Station ${oldName}`;

    system.planets.forEach((body) => {
        if (!body || typeof body.name !== 'string') return;
        if (body.name.startsWith(oldSystemPrefix)) {
            body.name = `${newName}${body.name.slice(oldName.length)}`;
            return;
        }
        if (body.name.startsWith(oldStationPrefix)) {
            body.name = `Station ${newName} ${body.name.slice(oldStationPrefix.length)}`;
            return;
        }
        if (body.name === oldStationBare) {
            body.name = `Station ${newName}`;
        }
    });
}

export function hasLinkedBodiesToRename(system, systemName) {
    if (!system || !Array.isArray(system.planets)) return false;
    const oldSystemPrefix = `${systemName} `;
    const oldStationPrefix = `Station ${systemName} `;
    const oldStationBare = `Station ${systemName}`;
    return system.planets.some((body) => {
        if (!body || typeof body.name !== 'string') return false;
        return body.name.startsWith(oldSystemPrefix)
            || body.name.startsWith(oldStationPrefix)
            || body.name === oldStationBare;
    });
}
