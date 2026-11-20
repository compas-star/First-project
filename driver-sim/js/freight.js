// Freight loads posted at each town's truck yard. You pick the route; deliver before the deadline.
import { mulberry } from './gfx.js';
import { NODES, shortestPath, pathMiles } from './world.js';

// name, tons, fragile (crashes hurt it more), pay per mile
const CARGO = [
  ['LUMBER', 22, false, 0.95], ['COPPER WIRE', 18, false, 1.1], ['LETTUCE', 16, true, 1.05], ['CATTLE FEED', 20, false, 0.9],
  ['US MAIL', 8, false, 1.15], ['ROOFING TILES', 19, true, 1.0], ['BOTTLED WATER', 21, false, 0.9], ['TV SETS', 10, true, 1.25],
  ['DIESEL PARTS', 12, false, 1.05], ['FRESH EGGS', 11, true, 1.2], ['HAY BALES', 14, false, 0.85], ['FURNITURE', 9, true, 1.1],
  ['CEMENT BAGS', 23, false, 0.9], ['CANNED CHILI', 17, false, 0.95], ['MOTORCYCLES', 7, true, 1.3], ['SOLAR PANELS', 13, true, 1.25],
];

// Offers at a node on a given day (the same all day, different tomorrow).
export function freightOffers(node, day) {
  let h = 11;
  for (const ch of node) h = (h * 31 + ch.charCodeAt(0)) % 99991;
  const r = mulberry(h * 7 + day * 977);
  const dests = Object.values(NODES).filter(n => n.type !== 'junction' && n.id !== node).map(n => n.id);
  const out = [];
  for (let k = 0; k < 5 && dests.length; k++) {
    const d = dests.splice(Math.floor(r() * dests.length), 1)[0];
    const path = shortestPath(node, d);
    if (!path) continue;
    const miles = Math.round(pathMiles(path));
    const [cargo, tons, fragile, rate] = CARGO[Math.floor(r() * CARGO.length)];
    const hours = miles / 44 + 1 + (miles > 140 ? 1.5 : 0) + r() * 0.5;   // longer hauls leave time for a meal
    const pay = Math.round(35 + miles * rate + tons * 1.5);
    out.push({ id: `${node}-${day}-${k}`, from: node, dest: d, cargo, tons, fragile, miles, hours, pay });
  }
  return out.sort((a, b) => a.miles - b.miles);
}
