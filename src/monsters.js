export const MONSTERS = Object.freeze({
  tinky: { id: 'tinky', title: 'Тинки-Винки', description: 'Классический преследователь. Не отстаёт.', speed: 1 },
  dipsy: { id: 'dipsy', title: 'Озёрный Дипси', description: 'Высокая зелёная мутация. Ускоряется, когда ты близко.', speed: 1.05 },
  laalaa: { id: 'laalaa', title: 'Ля-Ля', description: 'Охотится на звук шагов. Замри вдали от неё, чтобы переждать.', speed: 1.08 },
  po: { id: 'po', title: 'По', description: 'Красная мутация с клинками. Тиканье предупреждает о рывке.', speed: 1.05 },
  newborn: { id: 'newborn', title: 'Новорождённый', description: 'Низкий бледный преследователь. Движется быстрее, чем кажется.', speed: 1.2 },
  chainsaw: { id: 'chainsaw', title: 'Дипси с бензопилой', description: 'Безголовая зелёная мутация. Медленнее издали, опаснее вблизи.', speed: 0.95 },
});
export function monsterChoice(id) { return typeof id === 'string' && Object.hasOwn(MONSTERS, id) ? id : 'auto'; }
export function getMonster(id, defaultId = 'tinky') { return MONSTERS[monsterChoice(id)] || MONSTERS[defaultId] || MONSTERS.tinky; }
export function monsterSpeed(id, elapsed, distance, moving) {
  const monster = getMonster(id);
  if (monster.id === 'laalaa' && !moving && distance > 7) return 0;
  if (monster.id === 'dipsy' && distance < 12) return monster.speed * 1.2;
  if (monster.id === 'chainsaw' && distance < 9) return monster.speed * 1.4;
  if (monster.id === 'po') return monster.speed * (elapsed % 10 >= 8 ? 1.5 : 0.92);
  return monster.speed;
}
