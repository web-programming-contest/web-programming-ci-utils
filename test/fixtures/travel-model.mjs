export class Travel {
  constructor(id, travelerName, visitedCountries = []) {
    this.id = id;
    this.travelerName = travelerName;
    this.visitedCountries = [...visitedCountries];
  }

  addCountry(country) {
    if (!this.visitedCountries.includes(country)) {
      this.visitedCountries.push(country);
    }
  }

  removeCountry(country) {
    this.visitedCountries = this.visitedCountries.filter((item) => item !== country);
  }

  get visitedCount() {
    return this.visitedCountries.length;
  }
}

export function groupTravelsByCountryCount(travels) {
  const groups = {};
  for (const travel of travels) {
    const count = travel.visitedCount;
    if (!groups[count]) {
      groups[count] = [];
    }
    groups[count].push(travel);
  }
  return groups;
}

export function getUniqueCountries(travels) {
  return [...new Set(travels.flatMap((travel) => travel.visitedCountries))];
}

export function findTravelsByCountry(travels, country) {
  return travels.filter((travel) => travel.visitedCountries.includes(country));
}

export function groupTravelersByCountry(travels) {
  const groups = {};
  for (const travel of travels) {
    for (const country of travel.visitedCountries) {
      if (!groups[country]) {
        groups[country] = [];
      }
      groups[country].push(travel.travelerName);
    }
  }
  return groups;
}

export function findTravelsAboveCountryCount(travels, count) {
  return travels.filter((travel) => travel.visitedCount > count);
}
