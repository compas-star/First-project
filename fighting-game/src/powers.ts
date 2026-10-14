// Superpowers. Active powers are actions the AI decides to use; passive ones
// change how the body takes damage. Cooldowns run in the owner's own time,
// so a faster fighter recharges faster too.

export type PowerId = 'parry' | 'dash' | 'shockwave' | 'stone' | 'regen';

export interface PowerDef {
  id: PowerId;
  name: string;
  desc: string;
  /** Recharge in the owner's local seconds; 0 for passive powers. */
  cooldown: number;
}

export const POWERS: PowerDef[] = [
  { id: 'parry', name: 'Парирование', desc: 'Отводит удар, если успел его заметить. Атакующий раскрывается.', cooldown: 1.4 },
  { id: 'dash', name: 'Рывок', desc: 'Мгновенный бросок на несколько метров: войти в бой или уйти от удара.', cooldown: 2.5 },
  { id: 'shockwave', name: 'Ударная волна', desc: 'Удар о землю отбрасывает всё вокруг. Сила зависит от силы бойца.', cooldown: 6 },
  { id: 'stone', name: 'Каменная кожа', desc: 'Урон ×0.45, кости ломаются в 2.5 раза труднее, удары меньше сдвигают.', cooldown: 0 },
  { id: 'regen', name: 'Регенерация', desc: 'Здоровье и повреждённые конечности постепенно восстанавливаются.', cooldown: 0 },
];

export const POWER_BY_ID = Object.fromEntries(POWERS.map((p) => [p.id, p])) as Record<PowerId, PowerDef>;
