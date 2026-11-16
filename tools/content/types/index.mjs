// Content-side rules for each activity type: how a generator's draft becomes a finished
// item (finish), what makes an item well formed (validate), and whether the right answer
// is to do nothing (isNone). The matching play areas are in src/listening/scenes/.
import tap from './tap.mjs';
import truth from './truth.mjs';
import put from './put.mjs';
import paint from './paint.mjs';
import build from './build.mjs';
import route from './route.mjs';
import panel from './panel.mjs';

export const TYPES = { tap, truth, put, paint, build, route, panel };
