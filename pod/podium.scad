// ─────────────────────────────────────────────────────────────────────────
//  PODIUM — the bay
//
//  A standardised physique-photography bay for a gym. A member stands on a
//  floor mark; one fixed camera and one fixed light capture them for thirty
//  seconds, and the whole point is that two photographs four weeks apart are
//  identical in framing and lighting. Every dimension here exists to serve
//  that.
//
//  ALL DIMENSIONS IN MILLIMETRES.
//
//  Axes:  X  left / right, 0 on the centre line
//         Y  0 at the BACK WALL, increasing toward the open front
//         Z  0 at the floor, up
//
//  F5 previews (fast). F6 renders properly (slow, only needed for STL).
//  The view cones are drawn with % so they appear in preview and are skipped
//  by F6 entirely — they are the most expensive objects here and the least
//  useful in a mesh.
// ─────────────────────────────────────────────────────────────────────────

// ── what to draw ─────────────────────────────────────────────────────────
show_version      = 1;     // 1 = weekend corner  2 = pine unit
                           // 3 = T-slot pod      4 = a bedroom, with a phone
camera_kind       = 1;     // 1 = Logitech C920 landscape  2 = a phone, portrait
show_person       = true;
show_camera_cone  = true;
show_light_cone   = true;
show_floor_grid   = true;
show_dimensions   = true;
/*
 * Blackout fabric is very good at its job, which makes it very bad in a
 * drawing: a side elevation of this bay with the walls on is a black
 * rectangle. Off for elevations and sections, on for the picture you show
 * somebody.
 */
show_enclosure    = true;
show_ceiling      = true;   // off for a plan view, or it covers everything

$fn = 24;                  // 24 while working. 64 for a final F6.

// ── GEOMETRY — from research. Change deliberately. ───────────────────────
camera_distance   = camera_kind == 2 ? 2100 : 2900;
                           // lens to floor mark. THE CRITICAL NUMBER.
                           // A phone held portrait needs far less, because
                           // its tall sensor spends its angle on height.
                           // 2600 was the original figure; see the echo
                           // output below for whether it survives.
camera_height     = 1050;  // lens height, roughly hip height
mark_from_back_wall = 800;
person_height     = 2100;  // the tallest person it must handle
person_shoulder   = 550;

bay_width         = 2500;
bay_height        = 2400;
camera_clearance  = 300;   // room behind the lens for the stand and a hand
// Depth is DERIVED, not chosen. It is whatever the camera distance makes it,
// which is the entire argument this model exists to settle.
bay_depth         = mark_from_back_wall + camera_distance + camera_clearance;

// ── CAMERA ───────────────────────────────────────────────────────────────
/*
 * A phone held portrait is not a small webcam. Its sensor is about 3:4, which
 * is NARROWER than the 4:5 photo the app saves, so the picture runs out of
 * width before it runs out of height — the opposite of the webcam — and the
 * distance it needs is set by the horizontal angle, not the vertical one.
 *
 * Both sets of numbers below are derived from a diagonal figure off a spec
 * sheet (78° for the C920, about 73° for a 26mm-equivalent phone lens) and
 * both are worth exactly what a spec sheet is worth. Measure the camera you
 * will use with fov.html and type the answer in here.
 */
fov_vertical      = camera_kind == 2 ? 61.3 : 43.3;
fov_horizontal    = camera_kind == 2 ? 47.9 : 70.4;
output_aspect_w   = 4;     // the app writes 4:5 portrait JPEGs
output_aspect_h   = 5;
margin            = 0.10;  // headroom and footroom wanted, as a fraction

// ── LIGHT — Godox SL60W in a 350 × 1600 vertical strip softbox ───────────
softbox_width     = 350;
softbox_depth     = 350;
softbox_height    = 1600;
softbox_centre_z  = 1300;
light_distance    = 1400;  // softbox face to the floor mark.
                           // WAS 1200, and at 1200 the softbox's leading
                           // CORNER sits ~50mm inside the saved 4:5 frame —
                           // found by this model, not by the arithmetic that
                           // preceded it. 1300 clears by 43mm, which is not
                           // clearance in a gym. 1400 clears by 136mm and
                           // costs about 0.4 of a stop, which the SL60W has
                           // to spare.
light_angle       = 45;    // degrees off the camera axis, in plan
stand_base_spread = 900;

// ── REFLECTOR — white board, opposite side, leaning in ───────────────────
reflector_width   = 1000;
reflector_height  = 2000;
reflector_angle   = 20;    // degrees of lean toward the member

// ── THE BEDROOM (version 4) ──────────────────────────────────────────────
// Measured off a friend's actual training space: 2 x 5 m, standard ceiling,
// and nothing stays set up — the dumbbells, bench and barbell go into
// corners and under the bed after every session.
room_width        = 2000;
room_length       = 5000;
room_height       = 2400;
room_mark_from_wall = 500;   // closer than a gym: the wall IS the backdrop

// ── BUILD ────────────────────────────────────────────────────────────────
batten            = 70;    // version 2, pine, square section
extrusion         = 40;    // version 3, T-slot
fabric_drop       = 2400;
floor_grid        = 500;
monitor_w         = 540;   // a 24" screen
monitor_h         = 340;
monitor_centre_z  = 1500;

// ── derived ──────────────────────────────────────────────────────────────
mark_y   = show_version == 4 ? room_mark_from_wall : mark_from_back_wall;
camera_y = mark_y + camera_distance;

function frame_h(d) = 2 * d * tan(fov_vertical / 2);
function frame_w(d) = 2 * d * tan(fov_horizontal / 2);

/*
 * The largest 4:5 rectangle that fits inside what the sensor sees.
 *
 * This used to be `frame_h * 4/5`, which assumes the saved photo is always
 * limited by the frame's HEIGHT — true for a landscape webcam, where there is
 * far more width than you need. A phone held portrait is the other way round:
 * its native shape is about 3:4, which is NARROWER than 4:5, so the crop runs
 * out of width first and has to give up height to keep its proportions. Get
 * this wrong on a phone and the model says a person fits when their head is
 * outside the picture.
 */
function out_aspect() = output_aspect_w / output_aspect_h;
function crop_w(d) =
  (frame_w(d) / frame_h(d) >= out_aspect())
    ? frame_h(d) * out_aspect()          // height-limited: a wide sensor
    : frame_w(d);                        // width-limited: a tall one
function crop_h(d) =
  (frame_w(d) / frame_h(d) >= out_aspect())
    ? frame_h(d)
    : frame_w(d) / out_aspect();

/** What is actually stopping the person being bigger in the saved photo. */
function binding() = (frame_w(1000) / frame_h(1000) >= out_aspect()) ? "height" : "width";

/* The distance at which the SAVED photo is `h` tall, whichever way it is
   limited — not the distance at which the sensor sees `h`. */
function needed_distance(h) =
  (binding() == "height")
    ? h / (2 * tan(fov_vertical / 2))
    : (h * out_aspect()) / (2 * tan(fov_horizontal / 2));

// ── colours ──────────────────────────────────────────────────────────────
C_FRAME   = [0.76, 0.62, 0.42];
C_METAL   = [0.72, 0.74, 0.78];
C_FABRIC  = [0.12, 0.13, 0.15];
C_PERSON  = [0.35, 0.78, 0.60];
C_LIGHT   = [1.00, 0.95, 0.80];
C_MARK    = [0.95, 0.80, 0.20];
C_PANEL   = [0.85, 0.86, 0.88];

// ═════════════════════════════════════════════════════════════════════════
//  PARTS
// ═════════════════════════════════════════════════════════════════════════

module floor_grid_lines() {
  if (show_floor_grid)
    color([0.55, 0.58, 0.62])
      for (x = [-3000 : floor_grid : 3000])
        translate([x, -500, -1]) cube([4, bay_depth + 1200, 2]);
  if (show_floor_grid)
    color([0.55, 0.58, 0.62])
      for (y = [-500 : floor_grid : bay_depth + 700])
        translate([-3000, y, -1]) cube([6000, 4, 2]);
}

/*
 * A rough body. Not pretty on purpose — its job is to be the right SIZE, so
 * that anything it would walk into is visible.
 */
module person(h = person_height) {
  u = h / 7.5;                       // one head
  color(C_PERSON) {
    translate([0, 0, h - u / 2]) sphere(d = u * 0.92);
    hull() {
      translate([0, 0, h - u * 1.55]) cube([person_shoulder, 230, 20], center = true);
      translate([0, 0, h - u * 3.4])  cube([person_shoulder * 0.78, 200, 20], center = true);
    }
    for (s = [-1, 1]) {
      translate([s * person_shoulder / 2, 0, h - u * 2.6])
        cylinder(h = u * 2.3, d = u * 0.42, center = true);
      translate([s * 110, 0, (h - u * 3.4) / 2])
        cylinder(h = h - u * 3.4, d = u * 0.58, center = true);
    }
  }
}

/** The taped mark. Two feet and a line, 2mm proud so it reads as tape. */
module floor_mark() {
  color(C_MARK) {
    for (s = [-1, 1]) translate([s * 125, 0, 1]) cube([110, 260, 2], center = true);
    translate([0, -170, 1]) cube([420, 40, 2], center = true);
  }
}

/** A frustum along +Y, from a point at the lens out to w×h at `len`. */
module frustum(w, h, len) {
  hull() {
    cube([2, 1, 2], center = true);
    translate([0, len, 0]) cube([w, 1, h], center = true);
  }
}

module camera_rig() {
  color([0.1, 0.1, 0.12])
    translate([0, camera_y, camera_height]) {
      cube([95, 30, 30], center = true);
      translate([0, 0, -camera_height / 2]) cylinder(h = camera_height, d = 45, center = true);
      cylinder(h = 10, d = stand_base_spread * 0.55, center = false);
    }
  // Looking down -Y from the lens, so the cones are mirrored in Y.
  if (show_camera_cone)
    translate([0, camera_y, camera_height]) mirror([0, 1, 0]) {
      far = camera_distance + 900;
      %color([0.35, 0.55, 0.95, 0.10]) frustum(frame_w(far), frame_h(far), far);
      %color([0.25, 0.85, 0.55, 0.22]) frustum(crop_w(far),  frame_h(far), far);
    }
}

module softbox_assembly() {
  // In plan: light_angle degrees off the camera axis, measured at the mark.
  lx = light_distance * sin(light_angle);
  ly = light_distance * cos(light_angle);
  translate([lx, mark_y + ly, 0]) {
    rotate([0, 0, -light_angle]) {
      color([0.93, 0.93, 0.95])
        translate([0, 0, softbox_centre_z])
          cube([softbox_width, softbox_depth, softbox_height], center = true);
      color([0.2, 0.2, 0.22]) {
        translate([0, 0, softbox_centre_z / 2])
          cylinder(h = softbox_centre_z, d = 45, center = true);
        for (a = [0, 120, 240])
          rotate([0, 0, a]) translate([stand_base_spread / 2, 0, 20])
            rotate([0, 80, 0]) cylinder(h = stand_base_spread / 2, d = 22, center = true);
      }
    }
    if (show_light_cone)
      %color(concat(C_LIGHT, [0.12]))
        hull() {
          translate([0, 0, softbox_centre_z])
            cube([softbox_width, 2, softbox_height], center = true);
          rotate([0, 0, 180 - light_angle])
            translate([0, light_distance, person_height / 2])
              cube([900, 2, person_height], center = true);
        }
  }
}

module reflector() {
  rx = -light_distance * sin(light_angle);
  ry = light_distance * cos(light_angle);
  color(C_PANEL)
    translate([rx, mark_y + ry, reflector_height / 2])
      rotate([0, 0, light_angle]) rotate([reflector_angle, 0, 0])
        cube([reflector_width, 25, reflector_height], center = true);
}

module monitor() {
  color([0.08, 0.08, 0.1])
    translate([700, camera_y - 60, monitor_centre_z])
      rotate([0, 0, -18]) cube([monitor_w, 45, monitor_h], center = true);
}

module fabric_wall(w, h, thickness = 25) {
  color(concat(C_FABRIC, [0.95])) cube([w, thickness, h], center = true);
}

// ═════════════════════════════════════════════════════════════════════════
//  VERSION 1 — the weekend corner, built into two existing gym walls
// ═════════════════════════════════════════════════════════════════════════

module version_1() {
  translate([0, 0, fabric_drop / 2]) fabric_wall(bay_width + 600, fabric_drop);
  for (s = [-1, 1])
    translate([s * (bay_width / 2), bay_depth / 2, fabric_drop / 2])
      rotate([0, 0, 90]) fabric_wall(bay_depth, fabric_drop);
  color([0.6, 0.6, 0.62])
    for (s = [-1, 1])
      translate([s * (bay_width / 2 + 60), bay_depth / 2, fabric_drop + 30])
        rotate([90, 0, 0]) cylinder(h = bay_depth, d = 25, center = true);
}

// ═════════════════════════════════════════════════════════════════════════
//  VERSION 2 — freestanding pine. Members are separate so they can be counted.
// ═════════════════════════════════════════════════════════════════════════

module post(h) { color(C_FRAME) cube([batten, batten, h], center = false); }
module beam_x(len) { color(C_FRAME) cube([len, batten, batten], center = false); }
module beam_y(len) { color(C_FRAME) cube([batten, len, batten], center = false); }

module version_2_frame_only() {
  w = bay_width; d = bay_depth; h = bay_height;
  for (x = [-w/2, w/2 - batten], y = [0, d - batten])
    translate([x, y, 0]) post(h - batten);
  for (y = [0, d - batten], z = [0, h - batten])
    translate([-w/2, y, z]) beam_x(w);
  for (x = [-w/2, w/2 - batten], z = [0, h - batten])
    translate([x, 0, z]) beam_y(d);
  for (x = [-w/2, w/2 - batten]) translate([x, 0, h/2]) beam_y(d);
  translate([-w/2, 0, h/2]) beam_x(w);
  color([0.15, 0.15, 0.17])
    for (x = [-w/2 + batten/2, w/2 - batten/2], y = [batten/2, d - batten/2])
      translate([x, y, -40]) cylinder(h = 80, d = 90, center = true);
}

module version_3_frame_only() {
  w = bay_width; d = bay_depth; h = bay_height; e = extrusion;
  for (x = [-w/2, w/2 - e], y = [0, d - e]) translate([x, y, 0]) ext_z(h);
  for (y = [0, d - e], z = [0, h - e]) translate([-w/2, y, z]) ext_x(w);
  for (x = [-w/2, w/2 - e], z = [0, h - e]) translate([x, 0, z]) ext_y(d);
  for (x = [-w/2, w/2 - e]) translate([x, d/2, 0]) ext_z(h);
}

module version_2() {
  w = bay_width; d = bay_depth; h = bay_height;
  for (x = [-w/2, w/2 - batten], y = [0, d - batten])
    translate([x, y, 0]) post(h - batten);
  for (y = [0, d - batten], z = [0, h - batten])
    translate([-w/2, y, z]) beam_x(w);
  for (x = [-w/2, w/2 - batten], z = [0, h - batten])
    translate([x, 0, z]) beam_y(d);
  // mid rails, so the fabric has something to hang from
  for (x = [-w/2, w/2 - batten]) translate([x, 0, h/2]) beam_y(d);
  translate([-w/2, 0, h/2]) beam_x(w);

  translate([0, batten, fabric_drop/2]) fabric_wall(w - 2*batten, fabric_drop - 200, 20);
  for (s = [-1, 1])
    translate([s * (w/2 - batten), d/2, fabric_drop/2])
      rotate([0, 0, 90]) fabric_wall(d - 2*batten, fabric_drop - 200, 20);

  color([0.15, 0.15, 0.17])
    for (x = [-w/2 + batten/2, w/2 - batten/2], y = [batten/2, d - batten/2])
      translate([x, y, -40]) cylinder(h = 80, d = 90, center = true);
}

// ═════════════════════════════════════════════════════════════════════════
//  VERSION 3 — the production pod, 40×40 T-slot with solid panels
// ═════════════════════════════════════════════════════════════════════════

module ext_z(h) { color(C_METAL) cube([extrusion, extrusion, h], center = false); }
module ext_x(l) { color(C_METAL) cube([l, extrusion, extrusion], center = false); }
module ext_y(l) { color(C_METAL) cube([extrusion, l, extrusion], center = false); }

module version_3() {
  w = bay_width; d = bay_depth; h = bay_height; e = extrusion;
  for (x = [-w/2, w/2 - e], y = [0, d - e]) translate([x, y, 0]) ext_z(h);
  for (y = [0, d - e], z = [0, h - e]) translate([-w/2, y, z]) ext_x(w);
  for (x = [-w/2, w/2 - e], z = [0, h - e]) translate([x, 0, z]) ext_y(d);
  // a mid upright each side, because a 3.7m panel run needs support
  for (x = [-w/2, w/2 - e]) translate([x, d/2, 0]) ext_z(h);

  color(concat(C_PANEL, [0.9])) {
    translate([0, e + 9, h/2]) cube([w - 2*e, 18, h - 2*e], center = true);
    for (s = [-1, 1])
      translate([s * (w/2 - e - 9), d/2, h/2]) cube([18, d - 2*e, h - 2*e], center = true);
  }
  // the softbox recessed into the wall: nothing to knock, nothing to re-aim
  lx = light_distance * sin(light_angle);
  color([1, 1, 0.94])
    translate([lx > 0 ? w/2 - e - 20 : -w/2 + e + 20, mark_y + light_distance * cos(light_angle), softbox_centre_z])
      cube([30, softbox_width, softbox_height], center = true);
}

// ═════════════════════════════════════════════════════════════════════════
//  VERSION 4 — a bedroom, a phone, and a strip of tape
// ═════════════════════════════════════════════════════════════════════════

/*
 * No frame, no fabric, no stand. The walls are the enclosure and the phone is
 * the camera, because the whole budget is about R500 and a light alone is
 * R5,430 of it.
 *
 * The things packed into the corners are drawn deliberately. In a gym the bay
 * is empty; in a bedroom the bay is also where the weights live, and the
 * question "does the camera position survive the dumbbells going back in the
 * corner" is the one that decides whether any of this works.
 */
module version_4() {
  w = room_width; d = room_length; h = room_height;
  color([0.92, 0.90, 0.86]) {
    translate([0, d / 2, h / 2]) {
      for (s = [-1, 1]) translate([s * (w / 2 + 50), 0, 0]) cube([100, d, h], center = true);
    }
    translate([0, -50, h / 2]) cube([w + 200, 100, h], center = true);   // the backdrop wall
  }
  if (show_ceiling)
    color([0.75, 0.73, 0.70, 0.35]) translate([0, d / 2, h + 50]) cube([w + 200, d, 100], center = true);

  // What lives in the corners, and goes back there after every session.
  color([0.25, 0.26, 0.28]) {
    for (s = [-1, 1]) translate([s * (w / 2 - 220), d - 400, 170]) cube([380, 600, 340], center = true);
    translate([-w / 2 + 300, d - 1200, 220]) cube([500, 1100, 440], center = true);  // bench
  }
  color([0.35, 0.36, 0.38])
    translate([w / 2 - 120, d - 2200, 60]) rotate([0, 0, 6]) cube([80, 2200, 120], center = true);  // barbell
}

// ═════════════════════════════════════════════════════════════════════════
//  DIMENSIONS, drawn as thin bars so they read in a render
// ═════════════════════════════════════════════════════════════════════════

module dim_y(x, y1, y2, z) {
  color([0.9, 0.3, 0.3]) {
    translate([x, (y1 + y2) / 2, z]) cube([12, y2 - y1, 12], center = true);
    for (y = [y1, y2]) translate([x, y, z]) cube([80, 12, 80], center = true);
  }
}
module dim_x(x1, x2, y, z) {
  color([0.9, 0.3, 0.3]) {
    translate([(x1 + x2) / 2, y, z]) cube([x2 - x1, 12, 12], center = true);
    for (x = [x1, x2]) translate([x, y, z]) cube([12, 80, 80], center = true);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  THE SCENE
// ═════════════════════════════════════════════════════════════════════════

floor_grid_lines();
floor_mark_pos = [0, mark_y, 0];
translate(floor_mark_pos) floor_mark();
if (show_person) translate(floor_mark_pos) person();

camera_rig();
// A Godox and a stand is R5,430 of a R7,200 list. The bedroom budget is
// about R500 in total, so version 4 has neither, and drawing them there
// would be drawing a bay nobody can afford.
if (show_version != 4) { softbox_assembly(); reflector(); }

if (show_version == 4 && show_enclosure) version_4();
if (show_version == 1 && show_enclosure) version_1();
if (show_version == 2) { if (show_enclosure) version_2(); else version_2_frame_only(); monitor(); }
if (show_version == 3) { if (show_enclosure) version_3(); else version_3_frame_only(); monitor(); }

if (show_dimensions) {
  dim_y(bay_width / 2 + 300, 0, bay_depth, 30);
  dim_x(-bay_width / 2, bay_width / 2, -400, 30);
  dim_y(-bay_width / 2 - 300, mark_y, camera_y, 30);
}

// ═════════════════════════════════════════════════════════════════════════
//  THE ANSWERS — printed to the console every time you press F5
// ═════════════════════════════════════════════════════════════════════════

echo();
echo("──────── PODIUM bay ────────");
echo(str("camera distance      ", camera_distance, " mm"));
echo(str("bay footprint        ", bay_width, " × ", bay_depth, " mm  =  ",
         round(bay_width * bay_depth / 1000) / 1000, " m²"));
echo();
echo(str("vertical FOV used    ", fov_vertical, "°"));
echo(str("sensor sees          ", round(frame_w(camera_distance)), " × ",
         round(frame_h(camera_distance)), " mm at the mark"));
echo(str("saved 4:5 photo is   ", round(crop_w(camera_distance)), " × ",
         round(crop_h(camera_distance)), " mm — limited by ", binding()));
echo(str("tallest person       ", person_height, " mm"));
echo(str("FITS?                ",
         crop_h(camera_distance) >= person_height ? "yes" : "NO — CROPPED",
         "   (", round(crop_h(camera_distance) - person_height), " mm of air in total)"));
echo(str("distance for ", round(margin * 100), "% margin  ",
         round(needed_distance(person_height * (1 + margin))), " mm"));
/*
 * Is the softbox in the saved photograph?
 *
 * The first version of this measured the near EDGE, treating the box in plan
 * as a line at 45°. It is not a line, it is a rectangle, and a rectangle at
 * 45° leads with a CORNER — which is both further off-axis and nearer the
 * lens than the edge midpoint, and the frame is narrower nearer the lens.
 * Measuring the edge said 73mm clear; the plan view showed the corner inside
 * the frame. So: every corner, worst case wins.
 */
function corner_clear(cx, cy, w, d, ang, i) =
  let (
    sx = (i == 0 || i == 3) ? -w/2 :  w/2,
    sy = (i < 2)            ? -d/2 :  d/2,
    rx = sx * cos(ang) - sy * sin(ang),
    ry = sx * sin(ang) + sy * cos(ang),
    X  = abs(cx + rx),
    Y  = cy + ry,
    from_lens = camera_y - Y
  )
  from_lens <= 0 ? 1e6 : X - crop_w(from_lens) / 2;

function worst_clear(cx, cy, w, d, ang) =
  min([for (i = [0:3]) corner_clear(cx, cy, w, d, ang, i)]);

sb_cx = light_distance * sin(light_angle);
sb_cy = mark_y + light_distance * cos(light_angle);
sb_clear = worst_clear(sb_cx, sb_cy, softbox_width, softbox_depth, -light_angle);

rf_cx = -light_distance * sin(light_angle);
rf_cy = mark_y + light_distance * cos(light_angle);
rf_clear = worst_clear(rf_cx, rf_cy, reflector_width, 25, light_angle);

if (show_version != 4) {
echo();
echo(str("softbox centre, off axis   ", round(sb_cx), " mm"));
echo(str("SOFTBOX IN SHOT?           ",
         sb_clear < 0 ? "YES — IT INTRUDES" : "no",
         "   (worst corner ", round(sb_clear), " mm clear of the 4:5 edge)"));
echo(str("REFLECTOR IN SHOT?         ",
         rf_clear < 0 ? "YES — IT INTRUDES" : "no",
         "   (worst corner ", round(rf_clear), " mm clear)"));
echo(str("  to clear the softbox, move it out to light_distance = ",
         round(light_distance - sb_clear / sin(light_angle)), " mm (or further off axis)"));
echo();
echo(str("softbox spans              ", round(softbox_centre_z - softbox_height / 2),
         " to ", round(softbox_centre_z + softbox_height / 2), " mm above the floor"));
echo(str("unlit below the box        ", round(softbox_centre_z - softbox_height / 2), " mm of leg"));
}

if (show_version == 4) {
  side  = (room_width - crop_w(camera_distance)) / 2;
  depth = mark_y + camera_distance + 150;   // 150 for the phone and whatever props it
  echo();
  echo("──────── the bedroom ───────");
  echo(str("room                 ", room_width, " × ", room_length, " × ", room_height, " mm"));
  echo(str("camera               ", camera_kind == 2 ? "a phone, held portrait" : "a webcam, landscape"));
  echo(str("distance it needs    ", round(needed_distance(person_height * (1 + margin))), " mm"));
  echo(str("distance used        ", camera_distance, " mm"));
  echo(str("depth used           ", round(depth), " of ", room_length, " mm  (",
           round(room_length - depth), " mm spare)"));
  echo(str("saved photo width    ", round(crop_w(camera_distance)), " mm in a ", room_width, " mm room"));
  echo(str("CLEARS THE WALLS?    ", side > 0 ? "yes" : "NO",
           "   (", round(side), " mm each side)"));
  echo(str("ceiling over a ", person_height, "mm person   ", room_height - person_height, " mm"));
  echo(str("overhead softbox?    ",
           room_height - person_height > 1700 ? "possible" : "NO — a 1600mm box needs about 4m of ceiling"));
  echo("────────────────────────────");
}
echo("────────────────────────────");
