// The activity types. Each one is a plug-in with the same small contract (see CLAUDE.md,
// "Activity types"): create(item, host) builds the play area, check(answer, item) marks it.

import tap from './tap.js';
import truth from './truth.js';
import put from './put.js';
import paint from './paint.js';
import build from './build.js';
import route from './route.js';
import panel from './panel.js';

export const SCENES = { tap, truth, put, paint, build, route, panel };

export function sceneFor(item) {
  const scene = SCENES[item.t || 'tap'];
  if (!scene) throw new Error(`Unknown activity type: ${item.t}`);
  return scene;
}
