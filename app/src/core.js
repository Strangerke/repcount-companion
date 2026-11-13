/* RepCount Companion — core logic (no DOM). Works in browser and Node. */
(function (root) {
'use strict';

// ---------- Muscles ----------
const MUSCLE_GROUPS = [
  ['Chest',     [['chest', 'Chest']]],
  ['Shoulders', [['front_delts', 'Front delts'], ['side_delts', 'Side delts'], ['rear_delts', 'Rear delts'], ['rotator_cuff', 'Rotator cuff']]],
  ['Back',      [['lats', 'Lats'], ['upper_back', 'Upper back'], ['traps', 'Traps'], ['lower_back', 'Lower back']]],
  ['Arms',      [['biceps', 'Biceps'], ['triceps', 'Triceps'], ['forearms', 'Forearms']]],
  ['Core',      [['abs', 'Abs'], ['obliques', 'Obliques']]],
  ['Legs',      [['quads', 'Quads'], ['hamstrings', 'Hamstrings'], ['glutes', 'Glutes'], ['adductors', 'Adductors'], ['abductors', 'Abductors'], ['calves', 'Calves']]],
];
const MUSCLES = [];
const MUSCLE_LABEL = {};
const MUSCLE_GROUP = {};
for (const [g, list] of MUSCLE_GROUPS) for (const [id, label] of list) { MUSCLES.push(id); MUSCLE_LABEL[id] = label; MUSCLE_GROUP[id] = g; }

// ---------- Movements (what a lift trains) ----------
// p = primary muscles (count 1 set each), s = secondary (count 0.5)
const MOVEMENTS = {
  chest_press:           { name: 'Chest press / bench press', p: ['chest'], s: ['triceps', 'front_delts'] },
  incline_press:         { name: 'Incline press', p: ['chest', 'front_delts'], s: ['triceps'] },
  chest_fly:             { name: 'Chest fly / crossover', p: ['chest'], s: ['front_delts'] },
  pullover:              { name: 'Pullover', p: ['lats', 'chest'], s: ['triceps'] },
  shoulder_press:        { name: 'Shoulder press', p: ['front_delts'], s: ['side_delts', 'triceps'] },
  lateral_raise:         { name: 'Lateral raise', p: ['side_delts'], s: ['traps'] },
  front_raise:           { name: 'Front raise', p: ['front_delts'], s: ['side_delts'] },
  rear_delt_fly:         { name: 'Rear delt fly', p: ['rear_delts'], s: ['upper_back'] },
  upright_row:           { name: 'Upright row', p: ['side_delts', 'traps'], s: ['biceps'] },
  shrug:                 { name: 'Shrug', p: ['traps'], s: [] },
  shoulder_rotation:     { name: 'Shoulder rotation', p: ['rotator_cuff'], s: ['rear_delts'] },
  lat_pulldown:          { name: 'Pulldown / pull-up', p: ['lats'], s: ['biceps', 'upper_back', 'rear_delts'] },
  straight_arm_pulldown: { name: 'Straight-arm pulldown', p: ['lats'], s: ['triceps'] },
  row:                   { name: 'Row (machine / cable / dumbbell)', p: ['upper_back', 'lats'], s: ['biceps', 'rear_delts'] },
  bent_over_row:         { name: 'Bent-over row (barbell / T-bar)', p: ['upper_back', 'lats'], s: ['biceps', 'rear_delts', 'lower_back'] },
  back_extension:        { name: 'Back extension', p: ['lower_back'], s: ['glutes', 'hamstrings'] },
  deadlift:              { name: 'Deadlift', p: ['glutes', 'hamstrings', 'lower_back'], s: ['quads', 'traps', 'forearms'] },
  trap_bar_deadlift:     { name: 'Trap bar deadlift', p: ['quads', 'glutes'], s: ['hamstrings', 'lower_back', 'traps'] },
  biceps_curl:           { name: 'Biceps curl', p: ['biceps'], s: ['forearms'] },
  hammer_curl:           { name: 'Hammer curl', p: ['biceps', 'forearms'], s: [] },
  wrist_curl:            { name: 'Wrist curl', p: ['forearms'], s: [] },
  triceps_pushdown:      { name: 'Triceps pushdown', p: ['triceps'], s: [] },
  triceps_extension:     { name: 'Triceps extension', p: ['triceps'], s: [] },
  dip:                   { name: 'Dip', p: ['triceps', 'chest'], s: ['front_delts'] },
  close_grip_press:      { name: 'Close-grip bench', p: ['triceps', 'chest'], s: ['front_delts'] },
  crunch:                { name: 'Crunch / ab machine', p: ['abs'], s: [] },
  plank:                 { name: 'Plank / gainage', p: ['abs'], s: ['obliques'] },
  oblique:               { name: 'Oblique / rotation', p: ['obliques'], s: ['abs'] },
  squat:                 { name: 'Squat', p: ['quads', 'glutes'], s: ['adductors', 'hamstrings', 'lower_back'] },
  hack_squat:            { name: 'Machine squat (hack / smith-style)', p: ['quads'], s: ['glutes', 'adductors'] },
  leg_press:             { name: 'Leg press', p: ['quads', 'glutes'], s: ['hamstrings', 'adductors'] },
  leg_extension:         { name: 'Leg extension', p: ['quads'], s: [] },
  leg_curl:              { name: 'Leg curl', p: ['hamstrings'], s: ['calves'] },
  hip_thrust:            { name: 'Hip thrust / glute bridge', p: ['glutes'], s: ['hamstrings'] },
  hip_abduction:         { name: 'Hip abduction', p: ['abductors'], s: ['glutes'] },
  hip_adduction:         { name: 'Hip adduction', p: ['adductors'], s: [] },
  calf_raise:            { name: 'Calf raise / calf press', p: ['calves'], s: [] },
  cardio:                { name: 'Cardio (not counted in muscle stats)', p: [], s: [], cardio: true },
};


// ---------- Ideas per muscle: [name, how-to tip, movement id] ----------
const MUSCLE_TIPS = {
  chest: [['Pec deck / machine fly', 'Slow on the way back, squeeze 1 s with the hands together.', 'chest_fly'], ['Incline dumbbell press', 'Bench at 30°: shifts the work to the upper chest.', 'incline_press'], ['Low-to-high cable crossover', 'Pulleys low, bring the hands up to chin height in an arc.', 'chest_fly']],
  front_delts: [['Machine or dumbbell shoulder press', 'Stop just short of lockout to keep tension on the delts.', 'shoulder_press'], ['Cable or plate front raise', 'Raise to eye level, no swinging.', 'front_raise'], ['Incline press', 'Also hits the front delts hard, counts double with chest work.', 'incline_press']],
  side_delts: [['Dumbbell lateral raise', 'Light weight, lead with the elbows, stop at shoulder height.', 'lateral_raise'], ['Cable lateral raise', 'Cable behind or in front of the body: tension from the very bottom.', 'lateral_raise'], ['Wide-grip upright row', 'Pull only to lower-chest height to spare the shoulders.', 'upright_row']],
  rear_delts: [['Reverse pec deck', 'Arms almost straight, think “push the hands out”, not back.', 'rear_delt_fly'], ['Face pull (rope)', 'Pull to the forehead with the elbows high, hands apart at the end.', 'rear_delt_fly'], ['Bent-over dumbbell raise', 'Chest on an incline bench, small weights, pause at the top.', 'rear_delt_fly']],
  rotator_cuff: [['Cable external rotation', 'Elbow glued to the side (a towel helps), rotate the forearm out. Very light.', 'shoulder_rotation'], ['Side-lying dumbbell external rotation', '1–3 kg, slow, as a warm-up before pressing days.', 'shoulder_rotation'], ['Face pull', 'Finish each rep with the hands rotated back, like a double biceps pose.', 'rear_delt_fly']],
  lats: [['Lat pulldown', 'Drive the elbows down towards the hips, slight lean back.', 'lat_pulldown'], ['Straight-arm pulldown', 'Arms nearly straight, pull the bar to the thighs: pure lats.', 'straight_arm_pulldown'], ['Single-arm low cable row', 'Pull the elbow back along the body towards the hip.', 'row']],
  upper_back: [['Chest-supported row', 'Squeeze the shoulder blades together and hold 1 s.', 'row'], ['Wide-grip seated row', 'Elbows out at ~45°, pull to the lower chest.', 'row'], ['Face pull', 'Also works the rhomboids and mid traps.', 'rear_delt_fly']],
  traps: [['Dumbbell shrug', 'Straight up, pause at the top, no rolling.', 'shrug'], ['Farmer’s carry', 'Heavy dumbbells, walk 30–40 m tall and tight.', 'shrug'], ['Upright row', 'Also trains the upper traps.', 'upright_row']],
  lower_back: [['Back extension (45° bench)', 'Hinge at the hips, stop when the body is straight.', 'back_extension'], ['Romanian deadlift', 'Bar close to the legs, push the hips back, flat back.', 'deadlift'], ['Bird dog', 'On all fours, opposite arm and leg, hold 3 s each side.', 'plank']],
  biceps: [['Incline dumbbell curl', 'Arms hanging behind the body: big stretch on the biceps.', 'biceps_curl'], ['Cable curl', 'Constant tension, squeeze at the top.', 'biceps_curl'], ['Hammer curl', 'Neutral grip, also builds the forearms.', 'hammer_curl']],
  triceps: [['Rope pushdown', 'Spread the rope at the bottom, elbows fixed.', 'triceps_pushdown'], ['Overhead cable extension', 'Arms overhead stretch the long head, the biggest part.', 'triceps_extension'], ['Dips (assisted or machine)', 'Upright torso to keep the focus on triceps.', 'dip']],
  forearms: [['Wrist curl + reverse wrist curl', 'Forearms on a bench, full range, 15–20 reps.', 'wrist_curl'], ['Farmer’s carry', 'Grip strength for everything else.', 'shrug'], ['Hammer curl', 'Works the brachioradialis.', 'hammer_curl']],
  abs: [['Kneeling cable crunch', 'Curl the spine down, hips stay still.', 'crunch'], ['Hanging knee raise', 'Tilt the pelvis up at the top, no swinging.', 'crunch'], ['Plank', '30–60 s, glutes squeezed, ribs down.', 'plank']],
  obliques: [['Cable woodchopper', 'Pulley high or low, rotate from the torso with arms fairly straight. Both sides.', 'oblique'], ['Pallof press', 'Stand side-on to a cable, push the handle straight out and resist the rotation. 10 s holds.', 'oblique'], ['Side plank', 'Hips high, 20–45 s per side.', 'plank'], ['Rotary torso machine', 'Slow and controlled, do not throw the weight.', 'oblique']],
  quads: [['Leg extension', 'Pause 1 s at the top, slow on the way down.', 'leg_extension'], ['Hack squat', 'Feet low on the platform for more quads, go deep.', 'hack_squat'], ['Bulgarian split squat', 'Front foot far enough to keep the knee over the toes.', 'squat']],
  hamstrings: [['Seated leg curl', 'Seated beats lying for growth: the hamstrings are more stretched.', 'leg_curl'], ['Romanian deadlift', 'Feel the stretch behind the thighs, knees soft.', 'deadlift'], ['Back extension, hips focus', 'Round the upper back slightly to shift work to hamstrings and glutes.', 'back_extension']],
  glutes: [['Hip thrust', 'Chin tucked, drive through the heels, squeeze 1 s at the top.', 'hip_thrust'], ['Cable or machine kickback', 'Kick back and slightly out, do not arch the lower back.', 'hip_thrust'], ['Hip abduction, leaning forward', 'Leaning forward on the machine shifts the work to the glutes.', 'hip_abduction']],
  adductors: [['Adductor machine', 'Full stretch, slow squeeze.', 'hip_adduction'], ['Wide-stance leg press', 'Feet wide and high, toes out.', 'leg_press'], ['Copenhagen plank', 'Side plank with the top leg on a bench. Start on the knee.', 'hip_adduction']],
  abductors: [['Abductor machine', 'Controlled, pause when the legs are open.', 'hip_abduction'], ['Cable side leg raise', 'Ankle strap, small range, upright torso.', 'hip_abduction'], ['Banded lateral walk', 'Band above the knees, small steps, stay low.', 'hip_abduction']],
  calves: [['Standing calf raise', 'Full stretch at the bottom with a 1–2 s pause.', 'calf_raise'], ['Seated calf raise', 'Bent knees target the soleus (the deeper calf muscle).', 'calf_raise'], ['Calf press on the leg press', 'Balls of the feet on the edge, knees nearly straight.', 'calf_raise']],
};

// ---------- Name normalisation ----------
function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
// "Shoulder press 28" -> "shoulder press", "Pec fly 24/99" -> "pec fly", "Rear delt (pec fly)" -> "rear delt pec fly"
function normName(s) {
  return stripAccents(String(s || '').toLowerCase())
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}

// ---------- Built-in aliases (normalised name -> movement) ----------
const A = (movement, names) => names.forEach(n => (ALIASES[n] = movement));
const ALIASES = {};
A('chest_press', ['bench press', 'chest press', 'vertical chest press', 'converging chest press', 'chest press prise horizontale', 'seated chest press prise verticale', 'supine press', 'supine press coin alteres', 'decline bench press', 'dumbbell bench press', 'machine chest press', 'developpe couche', 'smith machine bench press']);
A('incline_press', ['incline bench press', 'incline dumbbell press', 'incline chest press', 'developpe incline']);
A('chest_fly', ['pec fly', 'pec fly pec deck', 'pec deck', 'pectoral fly', 'pec fly iso', 'cable crossovers', 'cable crossover', 'dumbbell flies', 'dumbbell fly', 'butterfly', 'ecarte couche']);
A('pullover', ['dumbbell overhead pullover', 'pullover', 'dumbbell pullover']);
A('shoulder_press', ['shoulder press', 'converging shoulder press', 'landmine shoulder press', 'overhead press', 'dumbbell shoulder press', 'military press', 'arnold press', 'developpe militaire']);
A('lateral_raise', ['lateral raise', 'dumbbell lateral raises', 'dumbbell lateral raise', 'dumbell lat raise poulie', 'cable lateral raise']);
A('front_raise', ['double cable front raise', 'front raise', 'dumbbell front raise']);
A('rear_delt_fly', ['rear delt pec fly', 'standing cable rear delt', 'rear delt fly', 'reverse fly', 'reverse pec deck']);
A('upright_row', ['upright rows', 'upright row']);
A('shrug', ['shoulder shrug supine press', 'dumbbell shrug', 'barbell shrug', 'shrug']);
A('shoulder_rotation', ['single arm rotation close', 'single arm rotation open', 'external rotation', 'internal rotation']);
A('lat_pulldown', ['lat pulldown', 'diverging lat pulldown', 'lat pulldown poids disque', 'pulldowns', 'lat pulldown prise perpendiculaire', 'lat pulldown prise v', 'pull down prise interne', 'assisted chin up', 'pull up', 'pull ups', 'chin up', 'chin ups', 'assisted pull up']);
A('straight_arm_pulldown', ['standing cable rope lat pushdown', 'straight arm pulldown']);
A('row', ['seated row', 'cable row', 'diverging seated row', 'diverging seated row iso', 'seated row iso', 'seated row disques iso prise horizontale', 'dumbbell row', 'standing rope cable row', 'seated cable row', 'machine row']);
A('bent_over_row', ['t bar barbel row', 't bar row', 'barbell row', 'bent over row', 'pendlay row']);
A('back_extension', ['back extension', 'back extension poids du corps', 'hyperextensions', 'hyperextension']);
A('deadlift', ['deadlift', 'romanian deadlift', 'stiff leg deadlift']);
A('trap_bar_deadlift', ['deadlift trap bar', 'trap bar deadlift']);
A('biceps_curl', ['arm curl', 'biceps corde poulie', 'biceps poulie corde bras', 'bar cable curl', 'barbell bicep curl', 'dumbbell bicep curl', 'barbell curl', 'dumbbell curl', 'ez bar curl', 'preacher curl', 'cable curl', 'concentration curl']);
A('hammer_curl', ['hammer curl', 'biceps rope hammer curl bf', 'biceps rope hammer curl pil', 'rope hammer curl']);
A('wrist_curl', ['wrist curl', 'reverse wrist curl']);
A('triceps_pushdown', ['pushdowns', 'pushdown', 'pushdown corde', 'triceps a la corde', 'push down barre en v', 'pushdowns pil', 'pushdowns pil corde', 'pushdown poulie bras', 'rope pushdown']);
A('triceps_extension', ['triceps extension', 'triceps extensions', 'triceps couche', 'skull crusher', 'overhead triceps extension', 'lying triceps extension']);
A('dip', ['seated dips', 'dip assist', 'assisted dips', 'dips', 'dip']);
A('close_grip_press', ['bench close grip', 'close grip bench press']);
A('crunch', ['crunches', 'crunch', 'abdominal', 'abdominal bf', 'crunch incline poids corporel', 'ab crunch machine', 'cable crunch', 'leg raise', 'hanging leg raise']);
A('plank', ['gainage', 'gainage haltere', 'plank', 'side plank']);
A('oblique', ['abs lateral', 'rotary torso', 'russian twist', 'side bend']);
A('squat', ['squat', 'back squat', 'back squat coin alteres', 'smith machine squats', 'front squat', 'goblet squat', 'lunge', 'lunges', 'bulgarian split squat']);
A('hack_squat', ['hack squat', 'perfect squat', 'machine squat', 'pendulum squat']);
A('leg_press', ['leg press', 'leg press halteres', 'leg press machine']);
A('leg_extension', ['leg extensions', 'leg extension']);
A('leg_curl', ['seated leg curl', 'prone leg curl', 'prone leg curl couche', 'lying leg curl', 'leg curl']);
A('hip_thrust', ['hip thrust', 'glute bridge']);
A('hip_abduction', ['abducteurs', 'hip abduction', 'abductor machine']);
A('hip_adduction', ['adducteurs', 'hip adduction', 'adductor machine']);
A('calf_raise', ['calf raises', 'calf raise', 'seated calf raises', 'seated calf raise', 'calf press', 'calf press mollet', 'leg press calves', 'leg press machine calves', 'standing calf raise']);
A('cardio', ['cycling', 'running', 'walking', 'treadmill', 'rowing machine', 'eliptical trainer', 'elliptical trainer', 'escalier', 'stair climber', 'stairmaster', 'swimming', 'velo', 'course']);

// ---------- Keyword rules: suggestions for names not in the dictionary ----------
const RULES = [
  ['cardio', /\b(cycling|bike|velo|running|treadmill|tapis|walking|marche|el+ip?tic|rowing machine|stair|escalier|cardio|swim)/],
  ['rear_delt_fly', /rear delt|reverse (fly|pec)|oiseau/],
  ['shoulder_rotation', /rotation/],
  ['oblique', /oblique|abs lateral|rotary torso|twist|side bend/],
  ['plank', /plank|gainage/],
  ['calf_raise', /calf|calves|mollet/],
  ['hip_abduction', /abduct/],
  ['hip_adduction', /adduct/],
  ['hip_thrust', /hip thrust|glute bridge|pont fessier/],
  ['crunch', /crunch|abdo|sit up|leg raise/],
  ['leg_curl', /leg curl|ischio|hamstring/],
  ['leg_extension', /leg ext/],
  ['trap_bar_deadlift', /trap bar/],
  ['deadlift', /deadlift|souleve|rdl|romanian/],
  ['back_extension', /back ext|hyperext|lombaire/],
  ['hack_squat', /hack|machine squat|perfect squat|pendulum/],
  ['squat', /squat|lunge|fente/],
  ['leg_press', /leg press|presse/],
  ['shrug', /shrug/],
  ['upright_row', /upright|tirage menton/],
  ['pullover', /pullover/],
  ['straight_arm_pulldown', /straight arm|lat pushdown/],
  ['lat_pulldown', /pull ?down|pull ?up|chin|traction|tirage vertical/],
  ['bent_over_row', /barbell row|bent over|t bar|pendlay/],
  ['row', /\brow|rowing|tirage|rameur/],
  ['close_grip_press', /close grip/],
  ['dip', /\bdip/],
  ['hammer_curl', /hammer/],
  ['wrist_curl', /wrist|poignet/],
  ['triceps_pushdown', /push ?down|tricep\w* (a la )?(corde|rope)/],
  ['triceps_extension', /tricep|skull|kickback|french press/],
  ['biceps_curl', /bicep|curl/],
  ['lateral_raise', /lat\w* raise|elevation laterale|side raise/],
  ['front_raise', /front raise|elevation frontale/],
  ['shoulder_press', /shoulder press|overhead press|military|militaire|arnold/],
  ['incline_press', /incline/],
  ['chest_fly', /\bfl(y|ies)|pec deck|crossover|ecarte|butterfly/],
  ['chest_press', /bench|chest press|developpe|\bpress/],
];

function suggestMovement(name) {
  const n = normName(name);
  if (ALIASES[n]) return ALIASES[n];
  for (const [m, re] of RULES) if (re.test(n)) return m;
  return null;
}

// Resolve muscles for an exercise name using (1) user mapping, (2) built-in aliases.
// userMap: { [normName]: { movement?: id, p?: [], s?: [] } }
function resolve(name, userMap) {
  const n = normName(name);
  const u = userMap && userMap[n];
  if (u) {
    if (u.movement && MOVEMENTS[u.movement]) return { source: 'yours', movement: u.movement, ...pick(MOVEMENTS[u.movement]) };
    if (u.p) return { source: 'yours', movement: 'custom', p: u.p, s: u.s || [], cardio: false };
  }
  const m = ALIASES[n];
  if (m) return { source: 'built-in', movement: m, ...pick(MOVEMENTS[m]) };
  return { source: 'unmapped', movement: null, p: [], s: [], cardio: false, suggestion: suggestMovement(name) };
}
function pick(mv) { return { p: mv.p, s: mv.s, cardio: !!mv.cardio }; }

// ---------- Notes -> effort ----------
const EFFORT_LABEL = { failure: 'Failure', limit: 'At the limit', very_heavy: 'Very heavy', heavy: 'Heavy', light: 'Too light' };
function parseNote(note) {
  const n = stripAccents(String(note || '').toLowerCase());
  let effort = null;
  if (/echec|fail/.test(n)) effort = 'failure';
  else if (/limite|limit/.test(n)) effort = 'limit';
  else if (/tres lourd|very heavy/.test(n)) effort = 'very_heavy';
  else if (/lourd|heavy/.test(n)) effort = 'heavy';
  else if (/leger|light|easy|facile/.test(n)) effort = 'light';
  return { effort, levelUp: /level ?up/.test(n) };
}
const HARD = { failure: 1, limit: 1, very_heavy: 1 };

// ---------- CSV ----------
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = [];
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}

function parseDate(s) { // "2026-11-08 10:29" local time
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(String(s).trim());
  if (!m) { const d = new Date(s); return isNaN(d) ? null : d.getTime(); }
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}
const num = s => { const v = parseFloat(String(s).replace(',', '.')); return isFinite(v) ? v : null; };

const EXPECTED = ['Workout Start', 'Workout End', 'Exercise', 'Weight', 'Reps', 'Notes', 'Kcal', 'Distance', 'Duration', 'Category', 'Name'];

// Returns { sets, problems }
function loadExport(text) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('The file is empty.');
  const head = rows[0].map(h => h.trim());
  let idx = {};
  EXPECTED.forEach((h, i) => { const j = head.indexOf(h); idx[h] = j >= 0 ? j : (head.length === EXPECTED.length ? i : -1); });
  if (idx['Workout Start'] < 0 || idx['Exercise'] < 0) throw new Error('This does not look like a RepCount CSV export (missing "Workout Start" / "Exercise" columns).');
  const g = (r, h) => (idx[h] >= 0 ? (r[idx[h]] ?? '') : '');
  const sets = []; let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const start = parseDate(g(r, 'Workout Start'));
    const ex = g(r, 'Exercise').trim().replace(/\s+/g, ' ');
    if (!start || !ex) { skipped++; continue; }
    const note = g(r, 'Notes').trim();
    const { effort, levelUp } = parseNote(note);
    sets.push({
      start, end: parseDate(g(r, 'Workout End')) || start,
      ex, key: ex.toLowerCase(),
      w: num(g(r, 'Weight')), r: num(g(r, 'Reps')),
      note, effort, levelUp,
      cat: g(r, 'Category').trim(),
      kcal: num(g(r, 'Kcal')), dist: num(g(r, 'Distance')), dur: num(g(r, 'Duration')),
    });
  }
  sets.sort((a, b) => a.start - b.start);
  return { sets, skipped };
}

// ---------- Aggregations ----------
const DAY = 86400000;
function weekStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d.getTime(); }
function addMonths(t, n) { const d = new Date(t); d.setMonth(d.getMonth() + n); return d.getTime(); }
function e1rm(w, r) { return (w > 0 && r > 0 && r <= 15) ? w * (1 + r / 30) : null; }

// Group into workouts
function workouts(sets) {
  const map = new Map();
  for (const s of sets) {
    let w = map.get(s.start);
    if (!w) { w = { start: s.start, end: s.end, sets: [], exercises: new Set() }; map.set(s.start, w); }
    w.sets.push(s); w.exercises.add(s.ex);
  }
  return [...map.values()].sort((a, b) => a.start - b.start);
}

// Per exercise (display name = most recent spelling for a key)
function exerciseStats(sets, userMap) {
  const map = new Map();
  for (const s of sets) {
    let e = map.get(s.key);
    if (!e) { e = { key: s.key, name: s.ex, cat: s.cat, sets: 0, sessions: new Map(), first: s.start, last: s.start, best: null, bestE1rm: null, levelUps: 0, hard: 0 }; map.set(s.key, e); }
    e.name = s.ex; e.cat = s.cat || e.cat; e.sets++; e.last = Math.max(e.last, s.start);
    if (s.levelUp) e.levelUps++;
    if (HARD[s.effort]) e.hard++;
    let ss = e.sessions.get(s.start);
    if (!ss) { ss = { t: s.start, top: null, e1rm: null, sets: [] }; e.sessions.set(s.start, ss); }
    ss.sets.push(s);
    if (s.w != null && (ss.top == null || s.w > ss.top.w || (s.w === ss.top.w && s.r > ss.top.r))) ss.top = s;
    const x = e1rm(s.w, s.r);
    if (x != null && (ss.e1rm == null || x > ss.e1rm)) ss.e1rm = x;
    if (x != null && (e.bestE1rm == null || x > e.bestE1rm)) e.bestE1rm = x;
    if (s.w != null && (e.best == null || s.w > e.best.w || (s.w === e.best.w && s.r > e.best.r))) e.best = s;
  }
  for (const e of map.values()) { e.res = resolve(e.name, userMap); e.sessionList = [...e.sessions.values()].sort((a, b) => a.t - b.t); }
  return [...map.values()];
}

// Weekly weighted sets per muscle. metric: 'sets' | 'hard'
function muscleWeekly(sets, userMap, from, to, metric) {
  const cache = {};
  const weeks = new Map(); let excluded = 0;
  for (const s of sets) {
    if (s.start < from || s.start >= to) continue;
    if (metric === 'hard' && !HARD[s.effort]) continue;
    const res = cache[s.key] || (cache[s.key] = resolve(s.ex, userMap));
    if (res.cardio) continue;
    if (!res.p.length) { excluded++; continue; }
    const wk = weekStart(s.start);
    let row = weeks.get(wk); if (!row) { row = {}; weeks.set(wk, row); }
    for (const m of res.p) row[m] = (row[m] || 0) + 1;
    for (const m of res.s) row[m] = (row[m] || 0) + 0.5;
  }
  return { weeks, excluded };
}

// Exercises done in (now - doneMonths, now - notSinceMonths] and not since
function forgotten(exStats, now, doneMonths, notSinceMonths) {
  const from = addMonths(now, -doneMonths), cut = addMonths(now, -notSinceMonths);
  const out = [];
  for (const e of exStats) {
    if (e.res.cardio) continue;
    if (e.last >= cut || e.last < from) continue;
    const inWin = e.sessionList.filter(s => s.t >= from);
    const lastS = e.sessionList[e.sessionList.length - 1];
    out.push({ e, sessionsInWindow: inWin.length, last: e.last, lastTop: lastS && lastS.top, lastSession: lastS });
  }
  out.sort((a, b) => b.sessionsInWindow - a.sessionsInWindow || b.last - a.last);
  return out;
}

// Sets whose weight or reps are far from what is usual for that exercise (likely typos).
// Each set is compared with the same exercise in the 5 sessions before and after ("usual"),
// and with the other sets of the same session, so long-term progress, warm-ups and drop sets are not flagged.
function anomalies(sets) {
  const med = a => { const b = [...a].sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; };
  const by = new Map();
  for (const s of sets) { let m = by.get(s.key); if (!m) by.set(s.key, m = new Map()); let a = m.get(s.start); if (!a) m.set(s.start, a = []); a.push(s); }
  const out = [], W = 5;
  for (const m of by.values()) {
    const sess = [...m.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    sess.forEach((cur, i) => {
      const near = sess.slice(Math.max(0, i - W), i).concat(sess.slice(i + 1, i + 1 + W)).flat();
      const nw = near.map(x => x.w).filter(w => w > 0), nr = near.map(x => x.r).filter(r => r > 0);
      const uw = nw.length >= 4 ? med(nw) : null, ur = nr.length >= 4 ? med(nr) : null;
      for (const s of cur) {
        const others = cur.filter(x => x !== s);
        const ow = others.map(x => x.w).filter(w => w > 0), or = others.map(x => x.r).filter(r => r > 0);
        const why = [];
        if (s.w > 0 && uw >= 1 && s.w > 2.5 * uw && (!ow.length || s.w > 2 * Math.max(...ow))) why.push('weight too high');
        if (s.w > 0 && uw >= 5 && s.w < uw / 3 && (!ow.length || s.w < Math.min(...ow) / 3)) why.push('weight too low');
        if (s.r > 30 && ur && s.r > 3 * ur && (!or.length || s.r > 2 * Math.max(...or))) why.push('too many reps');
        if (why.length) out.push({ set: s, why, usualW: uw, usualR: ur, session: cur });
      }
    });
  }
  return out.sort((a, b) => b.set.start - a.set.start);
}

const api = { anomalies, MUSCLE_TIPS, MUSCLE_GROUPS, MUSCLES, MUSCLE_LABEL, MUSCLE_GROUP, MOVEMENTS, ALIASES, EFFORT_LABEL, HARD,
  normName, suggestMovement, resolve, parseNote, parseCSV, loadExport, workouts, exerciseStats, muscleWeekly, forgotten,
  weekStart, addMonths, e1rm, DAY };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RC = api;
})(typeof window !== 'undefined' ? window : globalThis);
