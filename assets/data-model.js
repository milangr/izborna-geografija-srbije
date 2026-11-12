(() => {
  'use strict';
  window.createElectionDataModel = (sources) => {
    const kosovoResults = sources.kosovoResults || [];
    const data = [...sources.municipalityData.filter(entry => entry.name !== 'Beograd'),
      ...sources.beogradResults, ...kosovoResults.filter(entry => entry.mapped)].map(entry => ({...entry}));
    const specialResults = [...kosovoResults.filter(entry => !entry.mapped).map(entry => ({...entry, special: true})),
      ...(sources.specialResults || []).map(entry => ({...entry, region: 'OTHER', district: entry.name}))];
    const tableData = [...data, ...specialResults];
    const rsdPerEur2025 = 117.2026;
    const developmentLabels = {1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V'};
    for (const entry of tableData) {
      const socioeconomic = sources.socioeconomicData?.[entry.name];
      entry.developmentGroup2014 = socioeconomic?.developmentGroup2014 ?? null;
      entry.averageNetWage2025Rsd = socioeconomic?.averageNetWage2025 ?? null;
      entry.averageNetWage2025 = Number.isFinite(entry.averageNetWage2025Rsd)
        ? entry.averageNetWage2025Rsd / rsdPerEur2025 : null;
      entry.snsShare = Number.isFinite(entry.snsVotes) && Number.isFinite(entry.validVotes) && entry.validVotes > 0
        ? 100 * entry.snsVotes / entry.validVotes : null;
      entry.differencePer1000 = Number.isFinite(entry.listVotes) && Number.isFinite(entry.snsVotes) && Number.isFinite(entry.votersAttended) && entry.votersAttended > 0
        ? 1000 * (entry.listVotes - entry.snsVotes) / entry.votersAttended : null;
      entry.voteDifference = Number.isFinite(entry.listVotes) && Number.isFinite(entry.snsVotes)
        ? entry.listVotes - entry.snsVotes : null;
    }
    const maxVoteDifference = Math.max(1, ...tableData.map(entry => Math.abs(entry.voteDifference || 0)));
    const maxDifferencePer1000 = Math.max(1, ...tableData.map(entry => Math.abs(entry.differencePer1000 || 0)));
    const maxWage = Math.max(1, ...tableData.map(entry => entry.averageNetWage2025 || 0));
    const byId = new Map(tableData.map(entry => [entry.id, entry]));
    return {data, specialResults, tableData, developmentLabels, maxVoteDifference, maxDifferencePer1000, maxWage, byId};
  };
})();
