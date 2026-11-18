import { BAT_STUN_DURATION } from './sahur-ability.js';

export const SAHUR_CHALLENGE = 'Победи в соло-хардкоре за обычного Сахура.';

export const CATALOG = Object.freeze({
  skin: [
    { id: 'purple', name: 'Фиолетовый', color: '#9474b9', price: 0 },
    { id: 'green', name: 'Дипси', color: '#70ac49', price: 30 },
    { id: 'yellow', name: 'Ля-Ля', color: '#e8c64c', price: 30 },
    { id: 'red', name: 'По', color: '#d55361', price: 30 },
    { id: 'white', name: 'Хранитель', color: '#dce5d6', price: 45 },
    { id: 'pink', name: 'Порося', color: '#efa7bf', price: 45 },
    { id: 'midnight', name: 'Полночь', color: '#48576d', price: 60 },
    { id: 'mint', name: 'Мятный призрак', color: '#83d9bd', price: 100 },
    { id: 'gold', name: 'Золотой хранитель', color: '#e9bf4d', price: 350 },
    { id: 'cosmic', name: 'Космический', color: '#7277d4', price: 700 },
    { id: 'aurora', name: 'Северное сияние', color: '#67e4c2', price: 1000 },
    { id: 'hare', name: 'Легендарный заяц', color: '#f1e8df', price: null, caseOnly: true, ability: 'rabbit', abilityNote: 'Превращение и 6 зайцев-приманок на 10 секунд.' },
    { id: 'sahur', name: 'Тун Тун Тун Сахур', color: '#b97a49', price: null, caseOnly: true, ability: 'bat', abilityNote: `Бросок биты. При попадании — оглушение на ${BAT_STUN_DURATION} секунд.` },
    { id: 'sahur-buff', name: 'Сахур-качок', color: '#a46541', price: null, challenge: SAHUR_CHALLENGE, ability: 'bat', abilityNote: 'Та же бита и те же 10 секунд оглушения, что у обычного Сахура.' },
  ],
  antenna: [
    { id: 'ring', name: 'Кольцо', price: 0 },
    { id: 'straight', name: 'Палочка Дипси', price: 25 },
    { id: 'triangle', name: 'Треугольник', price: 35 },
    { id: 'curl', name: 'Завиток Ля-Ля', price: 45 },
    { id: 'heart', name: 'Сердечко', price: 60 },
    { id: 'none', name: 'Без антенны', price: 0 },
    { id: 'star', name: 'Счастливая звезда', price: 100 },
    { id: 'double', name: 'Двойной сигнал', price: 250 },
    { id: 'orbit', name: 'Орбита', price: 600 },
    { id: 'pulsar', name: 'Пульсар', price: 1000 },
  ],
  hat: [
    { id: 'none', name: 'Без шапки', price: 0 },
    { id: 'cap', name: 'Кепка охранника', price: 35 },
    { id: 'pan', name: 'Кастрюля защиты', price: 45 },
    { id: 'bunny', name: 'Откуда здесь уши?!', price: 65 },
    { id: 'crown', name: 'Корона порося', price: 80 },
    { id: 'top', name: 'Цилиндр Ушастого', price: 90 },
    { id: 'bucket', name: 'Ведро знаний', price: 100 },
    { id: 'viking', name: 'Шлем викинга', price: 250 },
    { id: 'wizard', name: 'Шляпа волшебника', price: 500 },
    { id: 'royal', name: 'Корона Ушастого', price: 1000 },
  ],
});

export function normalizeAppearance(value) {
  return Object.fromEntries(Object.entries(CATALOG).map(([kind, items]) => [kind,
    items.some((item) => item.id === value?.[kind]) ? value[kind] : items[0].id,
  ]));
}

export const CASE_COST = 100;
const CASE_LEGENDARY_RATE = 0.01;
const CASE_LEGENDARY = CATALOG.skin.filter((item) => item.caseOnly);
export const CASE_SKIN_ODDS = `${(CASE_LEGENDARY_RATE * 100 / CASE_LEGENDARY.length).toString().replace('.', ',')}%`;
export const skinAbility = (skin) => CATALOG.skin.find((item) => item.id === skin)?.ability;
export const CASE_COMMON = Object.freeze([
  { kind: 'skin', id: 'mint' }, { kind: 'antenna', id: 'star' },
  { kind: 'hat', id: 'bucket' }, { kind: 'hat', id: 'bunny' },
  { kind: 'skin', id: 'pink' }, { kind: 'antenna', id: 'heart' },
]);
export function rollCase(random = Math.random) {
  const roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Некорректный случайный выбор.');
  if (roll < CASE_LEGENDARY_RATE) {
    const index = Math.min(CASE_LEGENDARY.length - 1, Math.floor(roll * CASE_LEGENDARY.length / CASE_LEGENDARY_RATE));
    return { kind: 'skin', id: CASE_LEGENDARY[index].id, legendary: true };
  }
  const index = Math.min(CASE_COMMON.length - 1, Math.floor((roll - CASE_LEGENDARY_RATE) / (1 - CASE_LEGENDARY_RATE) * CASE_COMMON.length));
  return { ...CASE_COMMON[index], legendary: false };
}

export class LocalProfile {
  constructor(storage = null) {
    this.storage = storage;
    let saved;
    try { saved = JSON.parse(storage?.getItem('slendytubbies-profile') || 'null'); } catch { /* Local progress is optional. */ }
    this.coins = Number.isSafeInteger(saved?.coins) ? Math.max(0, Math.min(99999, saved.coins)) : 120;
    const savedOwned = Array.isArray(saved?.owned) ? saved.owned : [];
    this.owned = new Set(Object.entries(CATALOG).flatMap(([kind, items]) => items.filter((item) => item.price === 0 || savedOwned.includes(`${kind}:${item.id}`)).map((item) => `${kind}:${item.id}`)));
    this.appearance = normalizeAppearance(saved?.appearance);
    for (const kind of Object.keys(CATALOG)) if (!this.owned.has(`${kind}:${this.appearance[kind]}`)) this.appearance[kind] = CATALOG[kind][0].id;
    this.receipts = new Set(Array.isArray(saved?.receipts) ? saved.receipts.filter((key) => typeof key === 'string').slice(-250) : []);
  }

  save() {
    try { this.storage?.setItem('slendytubbies-profile', JSON.stringify({ coins: this.coins, owned: [...this.owned], appearance: this.appearance, receipts: [...this.receipts] })); } catch { /* Still usable in memory if storage is blocked. */ }
  }

  redeemSkinCode(value) {
    if (typeof value !== 'string' || value.trim().toUpperCase() !== 'SAHUR_777') throw new Error('Неверный промокод. Проверь написание.');
    const before = this.owned.size;
    for (const skin of CATALOG.skin) this.owned.add(`skin:${skin.id}`);
    const added = this.owned.size - before;
    if (added) this.save();
    return added;
  }

  choose(kind, id) {
    const item = Object.hasOwn(CATALOG, kind) && CATALOG[kind].find((entry) => entry.id === id);
    if (!item) throw new Error('Неизвестный предмет.');
    const key = `${kind}:${id}`;
    if (!this.owned.has(key)) {
      if (item.caseOnly) throw new Error(`Этот скин выпадает только из кейса: шанс ${CASE_SKIN_ODDS}.`);
      if (item.challenge) throw new Error(`Испытание: ${item.challenge}`);
      if (this.coins < item.price) throw new Error('Не хватает монет. Подбирай крем: +5; побеждай: +50.');
      this.coins -= item.price; this.owned.add(key);
    }
    this.appearance[kind] = id; this.save();
    return this.appearance;
  }

  openCase(random = Math.random) {
    if (this.coins < CASE_COST) throw new Error(`Нужно ${CASE_COST} игровых монет. Реальные деньги не принимаются.`);
    const drop = rollCase(random), key = `${drop.kind}:${drop.id}`, duplicate = this.owned.has(key);
    this.coins -= CASE_COST;
    if (duplicate) this.coins += 50;
    else this.owned.add(key);
    this.save(); return { ...drop, duplicate, refund: duplicate ? 50 : 0 };
  }

  finishSahurChallenge({ multiplayer, mode, won, collected, roundSkin }) {
    const key = 'skin:sahur-buff';
    if (multiplayer || mode !== 'hardcore' || !won || collected !== 10 || roundSkin !== 'sahur' || this.appearance.skin !== 'sahur'
      || !this.owned.has('skin:sahur') || this.owned.has(key)) return false;
    this.owned.add(key); this.save(); return true;
  }

  reward(key, amount) {
    if (typeof key !== 'string' || !Number.isSafeInteger(amount) || amount < 1 || amount > 50 || this.receipts.has(key)) return false;
    this.receipts.add(key);
    while (this.receipts.size > 250) this.receipts.delete(this.receipts.values().next().value);
    this.coins = Math.min(99999, this.coins + amount); this.save(); return true;
  }
}
