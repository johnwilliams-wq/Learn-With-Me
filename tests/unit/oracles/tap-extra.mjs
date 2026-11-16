// Rules for tap sentence patterns added after the first release, one file per world.
import { RULES as memory } from './tap-memory.mjs';
import { RULES as logic } from './tap-logic.mjs';
import { RULES as stories } from './tap-stories.mjs';

export const RULES = { ...memory, ...logic, ...stories };
