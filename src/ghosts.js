// Ghost roster. The marker `id` is the ArUco id printed on the marker; each
// one maps to an OBJ file in public/ghosts/. Add more by adding an entry here
// (and printing that id from the #/markers page).
//
// Parts inside the OBJ are matched by object name (see materialFor in ghostModels.js):
//   body -> translucent ghost material in `color`
//   eye*/mouth -> dark, cheek* -> pink, hat* -> dark, pumpkin -> orange, ...
// `offset` is where the model sits relative to the marker centre
// (marker edge = 1 unit; +z comes out of the wall toward you).

export const MARKER_DICTIONARY = 'ARUCO_MIP_36h12';

export const GHOSTS = [
  {
    id: 0,
    name: 'Boo-ris',
    blurb: 'A classic. Mostly harmless.',
    file: 'boo.obj',
    color: '#e9fbff',
    glow: '#6fe3ff',
    scale: 0.9,
    offset: [0, 1.5, 0.45],
  },
  {
    id: 1,
    name: 'Gloom',
    blurb: 'Tall, thin and deeply sorrowful.',
    file: 'gloom.obj',
    color: '#d9d6ff',
    glow: '#8f7bff',
    scale: 0.7,
    offset: [0, 1.5, 0.0],
  },
  {
    id: 2,
    name: 'Chubbs',
    blurb: 'Round, rosy, and fond of snacks.',
    file: 'chubbs.obj',
    color: '#fff1f7',
    glow: '#ff8fc2',
    scale: 0.85,
    offset: [0, 1.5, 0.45],
  },
  {
    id: 3,
    name: 'Sir Spook',
    blurb: 'Haunts only the finest rooms.',
    file: 'sir-spook.obj',
    color: '#f2fff0',
    glow: '#8dff9d',
    scale: 0.8,
    offset: [0, 1.5, 0.45],
  },
  {
    id: 4,
    name: 'The Wailer',
    blurb: 'Do not ask what is wrong.',
    file: 'wailer.obj',
    color: '#e6f4ff',
    glow: '#5aa8ff',
    scale: 0.75,
    offset: [0, 1.5, 0.45],
  },
  {
    id: 5,
    name: "Jack-o'-Ghost",
    blurb: 'Guards one (1) tiny pumpkin.',
    file: 'jack.obj',
    color: '#fff6e5',
    glow: '#ffa63d',
    scale: .99,
    offset: [0, 1.5, 0.45],
  },
    {
    id: 6,
    name: "Ghost Malone",
    blurb: "Shaking my boo-ty.",
    file: 'ghost-malone.obj',
    color: '#e9fbff',
    glow: '#6fe3ff',
    scale: 0.64,
    offset: [0.03, 1.5, 0.45],
  },
];

export const GHOSTS_BY_ID = Object.fromEntries(GHOSTS.map((g) => [g.id, g]));

// Marker image for a ghost, generated into public/markers/ by `npm run gen:markers`.
export const markerFileName = (g) => `marker-${g.id}-${g.file.replace(/\.obj$/, '')}.png`;
