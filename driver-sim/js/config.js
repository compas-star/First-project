// Core constants for the renderer and simulation.
export const W = 320;            // internal render width (pixels)
export const H = 180;            // internal render height (pixels)
export const HORIZON = 62;       // screen y of the horizon line

export const SEG = 200;          // length of one road segment (world units)
export const ROAD_W = 1600;      // half width of the road (one lane)
export const CAM_H = 1100;       // driver eye height above the road
export const CAM_DEPTH = 1;      // 1 / tan(fov/2) with a 90 degree FOV
export const DRAW_DIST = 260;    // segments drawn ahead
export const FOG = 3.2;          // fog density
export const RUMBLE = 3;         // segments per colour stripe
export const METER = 444;        // world units per metre (lane = 3.6 m)

export const SEG_PER_MILE = 120; // compressed world: segments per game mile
export const UNITS_PER_MILE = SEG * SEG_PER_MILE;
export const TIME_SCALE = 20;    // game seconds per real second
// world units per real second, per mph
export const MPH2U = (TIME_SCALE / 3600) * UNITS_PER_MILE;

export const MAX_MPH = 68;
export const TANK_MILES = 120;   // range of a full tank
export const BUS_FRONT_SEGS = 16; // segments between the eye and the "stop line" check
export const ZONE_LEN = 40;       // length (segments) of painted stop / pump zones
