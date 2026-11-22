import { MAX_POOL_SIZE, normalizeAppleStores, parseOverpassStores } from '../stores';

const paris = { latitude: 48.8566, longitude: 2.3522 };

describe('normalizeAppleStores', () => {
  it('builds stable ids, addresses and distances, sorted by distance', () => {
    const stores = normalizeAppleStores(
      [
        { name: 'Monoprix', latitude: 48.86, longitude: 2.35, street: '12 rue de Rivoli', city: 'Paris' },
        { name: 'Franprix', latitude: 48.857, longitude: 2.3525, street: '', city: 'Paris', identifier: 'I1A2B3' },
      ],
      paris,
      5000,
    );
    expect(stores.map((store) => store.id)).toEqual(['apple-I1A2B3', 'apple-48.86000,2.35000']);
    expect(stores[1].address).toBe('12 rue de Rivoli, Paris');
    expect(stores[0].distanceMeters).toBeLessThan(stores[1].distanceMeters);
  });

  it('removes duplicates returned by both Apple queries (same name within 60 m, accents ignored)', () => {
    const stores = normalizeAppleStores(
      [
        { name: 'Carrefour Market', latitude: 48.86, longitude: 2.35, street: '', city: '' },
        { name: 'carrefour market', latitude: 48.8602, longitude: 2.3501, street: '', city: '' },
        { name: 'Épicerie Bio', latitude: 48.861, longitude: 2.35, street: '', city: '' },
        { name: 'Epicerie bio', latitude: 48.8611, longitude: 2.35, street: '', city: '' },
      ],
      paris,
      5000,
    );
    expect(stores.map((store) => store.name)).toEqual(['Carrefour Market', 'Épicerie Bio']);
  });

  it('drops results far outside the radius and invalid coordinates, and caps the pool', () => {
    const many = Array.from({ length: 120 }, (_unused, i) => ({ name: `Magasin ${i}`, latitude: 48.8566 + i * 0.0003, longitude: 2.3522, street: '', city: '' }));
    const stores = normalizeAppleStores(
      [...many, { name: 'Loin', latitude: 49.5, longitude: 2.35, street: '', city: '' }, { name: 'NaN', latitude: Number.NaN, longitude: 2, street: '', city: '' }],
      paris,
      5000,
    );
    expect(stores).toHaveLength(MAX_POOL_SIZE);
    expect(stores.some((store) => store.name === 'Loin' || store.name === 'NaN')).toBe(false);
  });
});

describe('parseOverpassStores', () => {
  it('reads nodes and ways (center) with OSM tags', () => {
    const stores = parseOverpassStores(
      [
        { id: 1, type: 'node', lat: 48.857, lon: 2.3525, tags: { name: 'Lidl', 'addr:housenumber': '3', 'addr:street': 'rue X', 'addr:city': 'Paris' } },
        { id: 2, type: 'way', center: { lat: 48.858, lon: 2.353 }, tags: { brand: 'Aldi' } },
        { id: 3, type: 'relation' },
      ],
      paris,
      5000,
    );
    expect(stores.map((store) => [store.id, store.name, store.address])).toEqual([
      ['node-1', 'Lidl', '3 rue X, Paris'],
      ['way-2', 'Aldi', undefined],
    ]);
  });
});
