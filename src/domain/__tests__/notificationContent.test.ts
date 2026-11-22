import { buildReminderContent, joinList, parseReminderPayload } from '../notificationContent';

const store = { id: 'node-1', name: 'Carrefour City', latitude: 48.85, longitude: 2.35 };
const item = (id: string, name: string, quantity = 1) => ({ id, name, quantity });

describe('joinList', () => {
  it('joins with commas and "et"', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['lait'])).toBe('lait');
    expect(joinList(['lait', 'pain'])).toBe('lait et pain');
    expect(joinList(['lait', 'pain', 'œufs'])).toBe('lait, pain et œufs');
    expect(joinList(['milk', 'bread', 'eggs'], 'en')).toBe('milk, bread and eggs');
  });
});

describe('buildReminderContent', () => {
  it('uses the singular for one item', () => {
    const content = buildReminderContent(store, [item('a', 'Lait')], 1);
    expect(content.title).toBe('Psst ! Carrefour City est tout près');
    expect(content.body).toBe('1 article à acheter : Lait.');
  });

  it('groups many items in one short body with "et N autres"', () => {
    const many = Array.from({ length: 30 }, (_unused, i) => item(`id-${i}`, `Produit numéro ${i}`));
    const content = buildReminderContent(store, many, 1);
    expect(content.body.startsWith('30 articles à acheter : Produit numéro 0, ')).toBe(true);
    expect(content.body).toMatch(/ et \d+ autres\.$/);
    expect(content.body.length).toBeLessThanOrEqual(160);
    expect(content.data.itemIds).toHaveLength(30);
  });

  it('always shows at least one name even if very long', () => {
    const content = buildReminderContent(store, [item('a', 'x'.repeat(200)), item('b', 'Pain')], 1);
    expect(content.body).toContain('x'.repeat(200));
    expect(content.body).toMatch(/ et 1 autre\.$/);
  });

  it('writes English copy', () => {
    const many = Array.from({ length: 30 }, (_unused, i) => item(`id-${i}`, `Product number ${i}`));
    const content = buildReminderContent(store, many, 1, 'en');
    expect(content.title).toBe('Psst! Carrefour City is nearby');
    expect(content.body).toMatch(/^30 items to buy: Product number 0, .* and \d+ more\.$/);
    expect(buildReminderContent(store, [item('a', 'Milk')], 1, 'en').body).toBe('1 item to buy: Milk.');
  });

  it('writes Brazilian Portuguese copy', () => {
    const content = buildReminderContent(store, [item('a', 'Leite', 2), item('b', 'Pão'), item('c', 'Ovos')], 1, 'pt');
    expect(content.title).toBe('Psst! Carrefour City está pertinho');
    expect(content.body).toBe('3 itens para comprar: Leite (×2), Pão e Ovos.');
    expect(buildReminderContent(store, [item('a', 'Leite')], 1, 'pt').body).toBe('1 item para comprar: Leite.');
  });

  it('falls back to a generic store name', () => {
    expect(buildReminderContent({ ...store, name: '  ' }, [item('a', 'Lait')], 1).title).toBe('Psst ! Un supermarché est tout près');
  });
});

describe('parseReminderPayload', () => {
  it('round-trips a built payload', () => {
    const content = buildReminderContent(store, [item('a', 'Lait')], 42);
    expect(parseReminderPayload(JSON.parse(JSON.stringify(content.data)))).toEqual(content.data);
  });

  it('rejects malformed payloads', () => {
    expect(parseReminderPayload(null)).toBeNull();
    expect(parseReminderPayload({ kind: 'other' })).toBeNull();
    expect(parseReminderPayload({ kind: 'store-reminder', store: { id: 'x' } })).toBeNull();
  });
});
