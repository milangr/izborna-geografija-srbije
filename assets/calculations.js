(() => {
  'use strict';
  function aggregateEntries(entries) {
    const sum = key => entries.reduce((total, entry) => total + (Number.isFinite(entry[key]) ? entry[key] : 0), 0);
    const sumAvailable = key => entries.some(entry => Number.isFinite(entry[key])) ? sum(key) : null;
    const ratio = (numerator, denominator) => denominator ? 100 * numerator / denominator : null;
    const populationEntries = entries.filter(entry => Number.isFinite(entry.population) && Number.isFinite(entry.areaKm2));
    const population = populationEntries.reduce((total, entry) => total + entry.population, 0);
    const area = populationEntries.reduce((total, entry) => total + entry.areaKm2, 0);
    const populationWeighted = (key, weightKey = 'population') => {
      const available = entries.filter(entry => Number.isFinite(entry[weightKey]) && Number.isFinite(entry[key]));
      const weight = available.reduce((total, entry) => total + entry[weightKey], 0);
      return weight ? available.reduce((total, entry) => total + entry[weightKey] * entry[key], 0) / weight : null;
    };
    const municipalAverage = key => {
      const values = entries.map(entry => entry[key]).filter(Number.isFinite);
      return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
    };
    return {
      votes: ratio(sum('listVotes'), sum('validVotes')),
      snsShare: ratio(sum('snsVotes'), sum('validVotes')),
      listVotes: sum('listVotes'), snsVotes: sum('snsVotes'), validVotes: sum('validVotes'),
      voteDifference: sum('listVotes') - sum('snsVotes'),
      differencePer1000: sum('votersAttended') ? 1000 * (sum('listVotes') - sum('snsVotes')) / sum('votersAttended') : null,
      invalidShare: ratio(sum('invalidVotes'), sum('ballotsInBox')),
      turnout: ratio(sum('votersAttended'), sum('registeredVoters')),
      votersAttended: sum('votersAttended'), registeredVoters: sum('registeredVoters'),
      stations: sum('stations'), population: sumAvailable('population'),
      areaKm2: sumAvailable('areaKm2'), density: area ? population / area : null,
      age0_14Share: populationWeighted('age0_14Share', 'censusPopulation2022'),
      youthShare: populationWeighted('youthShare', 'censusPopulation2022'),
      age30_44Share: populationWeighted('age30_44Share', 'censusPopulation2022'),
      age45_64Share: populationWeighted('age45_64Share', 'censusPopulation2022'),
      age65PlusShare: populationWeighted('age65PlusShare', 'censusPopulation2022'),
      higherEducationShare: populationWeighted('higherEducationShare'),
      averageNetWage2025: municipalAverage('averageNetWage2025'),
    };
  }
  const boxWhiskerLimits = (min, q1, q3, max) => {
    const iqr = q3 - q1;
    return iqr > 0
      ? {low: Math.max(min, q1 - 1.5 * iqr), high: Math.min(max, q3 + 1.5 * iqr)}
      : {low: min, high: max};
  };
  // Expects finite numeric values sorted in ascending order.
  function describeDistribution(values) {
    if (!values.length) return null;
    const quantile = fraction => {
      const index = (values.length - 1) * fraction;
      const lower = Math.floor(index);
      return values[lower] + (values[Math.ceil(index)] - values[lower]) * (index - lower);
    };
    const min = values[0], q1 = quantile(.25), median = quantile(.5);
    const q3 = quantile(.75), max = values.at(-1);
    const {low, high} = boxWhiskerLimits(min, q1, q3, max);
    return {min, q1, median, mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      q3, max, whiskerLow: low, whiskerHigh: high,
      below: values.filter(value => value < low).length,
      above: values.filter(value => value > high).length, count: values.length};
  }
  window.electionCalculations = {aggregateEntries, boxWhiskerLimits, describeDistribution};
})();
