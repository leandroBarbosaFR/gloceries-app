import type { NearbyStore } from '../../lib/types';
import { formatDistance, metersBetween } from '../geo';
import {
  ANCHOR_REGION_ID,
  MAX_ANCHOR_RADIUS_METERS,
  MIN_ANCHOR_RADIUS_METERS,
  MIN_STORE_RADIUS_METERS,
  allRegions,
  computeAnchorRadius,
  isOutsidePoolCoverage,
  regionSignature,
  selectMonitoredRegions,
} from '../regions';

const paris = { latitude: 48.8566, longitude: 2.3522 };

/** Stores placed due north of Paris, `step` meters apart. */
function storesNorth(count: number, step = 300): NearbyStore[] {
  return Array.from({ length: count }, (_unused, i) => ({
    id: `node-${i}`,
    name: `Magasin ${i}`,
    latitude: paris.latitude + ((i + 1) * step) / 111_320,
    longitude: paris.longitude,
    distanceMeters: (i + 1) * step,
  }));
}

describe('metersBetween / formatDistance', () => {
  it('computes ~1 km for 0.009 degrees of latitude', () => {
    const distance = metersBetween(paris, { latitude: paris.latitude + 0.009, longitude: paris.longitude });
    expect(distance).toBeGreaterThan(990);
    expect(distance).toBeLessThan(1010);
  });

  it('formats French distances', () => {
    expect(formatDistance(347)).toBe('350 m');
    expect(formatDistance(1234)).toBe('1,2 km');
    expect(formatDistance(2000)).toBe('2 km');
    expect(formatDistance(15_400)).toBe('15 km');
    expect(formatDistance(1234, 'en')).toBe('1.2 km');
    expect(formatDistance(1234, 'pt')).toBe('1,2 km');
  });
});

describe('selectMonitoredRegions', () => {
  it('monitors every store and no anchor when the pool fits', () => {
    const selection = selectMonitoredRegions({ stores: storesNorth(5), center: paris, radiusMeters: 1000 });
    expect(selection.storeRegions).toHaveLength(5);
    expect(selection.anchor).toBeNull();
    expect(selection.storeRegions.every((region) => region.notifyOnEnter && region.notifyOnExit)).toBe(true);
  });

  it('caps at 18 nearest stores and adds an exit-only anchor (≤ 19 regions, under the iOS limit of 20)', () => {
    const stores = storesNorth(40).reverse(); // unsorted input
    const selection = selectMonitoredRegions({ stores, center: paris, radiusMeters: 1000 });
    expect(selection.storeRegions).toHaveLength(18);
    expect(selection.monitoredStoreIds[0]).toBe('node-0');
    expect(selection.monitoredStoreIds).not.toContain('node-18');
    expect(selection.anchor).toMatchObject({ identifier: ANCHOR_REGION_ID, notifyOnEnter: false, notifyOnExit: true });
    expect(allRegions(selection).length).toBeLessThanOrEqual(19);
  });

  it('rotates to the stores closest to a new center', () => {
    const stores = storesNorth(40);
    const farNorth = { latitude: stores[35].latitude, longitude: paris.longitude };
    const selection = selectMonitoredRegions({ stores, center: farNorth, radiusMeters: 1000 });
    expect(selection.monitoredStoreIds).toContain('node-35');
    expect(selection.monitoredStoreIds).not.toContain('node-0');
  });

  it('skips excluded and duplicate stores', () => {
    const stores = [...storesNorth(3), storesNorth(1)[0]];
    const selection = selectMonitoredRegions({ stores, center: paris, radiusMeters: 1000, excludedStoreIds: ['node-1'] });
    expect(selection.monitoredStoreIds).toEqual(['node-0', 'node-2']);
  });

  it('enforces a minimum store radius', () => {
    const selection = selectMonitoredRegions({ stores: storesNorth(1), center: paris, radiusMeters: 50 });
    expect(selection.storeRegions[0].radius).toBe(MIN_STORE_RADIUS_METERS);
  });

  it('returns nothing for an empty pool', () => {
    const selection = selectMonitoredRegions({ stores: [], center: paris, radiusMeters: 1000 });
    expect(allRegions(selection)).toEqual([]);
  });
});

describe('anchor radius and signature', () => {
  it('clamps anchor radius', () => {
    expect(computeAnchorRadius(100)).toBe(MIN_ANCHOR_RADIUS_METERS);
    expect(computeAnchorRadius(6000)).toBe(3000);
    expect(computeAnchorRadius(50_000)).toBe(MAX_ANCHOR_RADIUS_METERS);
  });

  it('is order independent and ignores small anchor jitter', () => {
    const base = selectMonitoredRegions({ stores: storesNorth(25), center: paris, radiusMeters: 1000 });
    const jittered = selectMonitoredRegions({
      stores: storesNorth(25),
      center: { latitude: paris.latitude + 0.00001, longitude: paris.longitude },
      radiusMeters: 1000,
    });
    expect(regionSignature(allRegions(base))).toBe(regionSignature([...allRegions(base)].reverse()));
    expect(regionSignature(allRegions(base))).toBe(regionSignature(allRegions(jittered)));
  });

  it('changes when the radius changes', () => {
    const small = selectMonitoredRegions({ stores: storesNorth(3), center: paris, radiusMeters: 500 });
    const large = selectMonitoredRegions({ stores: storesNorth(3), center: paris, radiusMeters: 2000 });
    expect(regionSignature(allRegions(small))).not.toBe(regionSignature(allRegions(large)));
  });

  it('detects leaving the searched area', () => {
    expect(isOutsidePoolCoverage(paris, { latitude: paris.latitude + 0.01, longitude: paris.longitude })).toBe(false);
    expect(isOutsidePoolCoverage(paris, { latitude: paris.latitude + 0.1, longitude: paris.longitude })).toBe(true);
  });
});
