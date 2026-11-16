// The map: which worlds exist, in what order, and what opens them.
//
//   Training Camp   open from the start. Its boss is open too, so a strong listener can skip ahead.
//   the zones       one per kind of activity; they all open when Training Camp is cleared.
//   Legend Trials   mixed bosses; opens when four zones are cleared.
//   Starter levels  the gentle, one-difficulty-at-a-time path. Always open, shown in a drawer.
//
// A world module that still exports null is simply left out.

import { STARTER } from '../levels.mjs';
import camp from './camp.mjs';
import memory from './memory.mjs';
import logic from './logic.mjs';
import pack from './pack.mjs';
import paint from './paint.mjs';
import build from './build.mjs';
import route from './route.mjs';
import panel from './panel.mjs';
import truth from './truth.mjs';
import stories from './stories.mjs';
import { legend } from './legend.mjs';

const zones = [memory, logic, pack, paint, build, route, panel, truth, stories].filter(Boolean).map((w) => ({ needs: ['camp'], ...w }));
const trials = legend(zones);

// The Starter worlds come FIRST in the file. The game does not care (it sorts by the `starter` flag),
// but the first release does: for a moment after an update its old code reads this list with its old
// rule ("each level opens the next one"), and with his old levels at the top it shows them just as
// they were - the new worlds simply appear, locked, underneath.
export const WORLDS = [...STARTER, camp, ...zones, ...(trials ? [trials] : [])];
